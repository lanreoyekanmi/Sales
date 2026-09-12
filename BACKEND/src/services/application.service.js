import { randomUUID } from "node:crypto";
import Application from "../models/application.model.js";
import IdempotencyKey from "../models/idempotencyKey.model.js";
import { toDecimal128 } from "../utils/money.js";
import { processUploadedImage, InvalidImageError } from "../utils/imageProcessing.js";
import { cloudinaryStorage } from "./cloudinaryStorage.adapter.js";
import logger from "../utils/logger.js";
import ApiError from "../utils/ApiError.js";

const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

function buildLoanHistoryDoc(entry) {
  return {
    lenderName: entry.lenderName,
    loanType: entry.loanType,
    originalLoanAmount: toDecimal128(entry.originalLoanAmount),
    outstandingAmount: toDecimal128(entry.outstandingAmount),
    repaymentStatus: entry.repaymentStatus,
    startDate: entry.startDate,
    endDate: entry.endDate,
    repaymentFrequency: entry.repaymentFrequency,
    monthlyPayment: toDecimal128(entry.monthlyPayment),
    purpose: entry.purpose,
  };
}

// Builds the document explicitly, field by field, from the already-validated DTO.
// The raw request body is never spread into the document — this is the data-layer backstop
// against mass assignment, independent of the zod `.strict()` schemas upstream.
function buildApplicationDoc(input, applicationId, documents) {
  return new Application({
    applicationId,
    status: "submitted",
    applicant: {
      firstName: input.applicant.firstName,
      lastName: input.applicant.lastName,
      email: input.applicant.email,
      phoneNumber: input.applicant.phoneNumber,
      dateOfBirth: input.applicant.dateOfBirth,
      gender: input.applicant.gender,
      residentialAddress: input.applicant.residentialAddress,
      city: input.applicant.city,
      state: input.applicant.state,
    },
    employment: {
      employmentStatus: input.employment.employmentStatus,
      employerName: input.employment.employerName,
      jobTitle: input.employment.jobTitle,
      employmentDurationMonths: input.employment.employmentDurationMonths,
      monthlyIncome: toDecimal128(input.employment.monthlyIncome),
      incomeFrequency: input.employment.incomeFrequency,
    },
    loanRequest: {
      requestedLoanAmount: toDecimal128(input.loanRequest.requestedLoanAmount),
      loanPurpose: input.loanRequest.loanPurpose,
      preferredRepaymentPeriodMonths: input.loanRequest.preferredRepaymentPeriodMonths,
      repaymentFrequency: input.loanRequest.repaymentFrequency,
    },
    loanHistory: input.loanHistory.map(buildLoanHistoryDoc),
    documents,
    disbursement: {
      preferredMethod: input.disbursement.preferredMethod,
      otherMethodDetails: input.disbursement.otherMethodDetails,
      bankDetails: {
        accountHolderName: input.disbursement.bankDetails.accountHolderName,
        bankRoutingNumber: input.disbursement.bankDetails.bankRoutingNumber,
        accountNumber: input.disbursement.bankDetails.accountNumber,
        accountType: input.disbursement.bankDetails.accountType,
        bankType: input.disbursement.bankDetails.bankType,
      },
    },
    consent: {
      termsAccepted: input.consent.termsAccepted,
      dataProcessingAccepted: input.consent.dataProcessingAccepted,
      acceptedAt: new Date(),
    },
    metadata: {
      submittedAt: new Date(),
      sourceIp: input.context.sourceIp,
      userAgent: input.context.userAgent,
    },
  });
}

/**
 * @param {object} input - zod-validated application submission DTO
 * @param {object} context - { idempotencyKey, sourceIp, userAgent, requestId, files }
 *   `files` is a { [kind]: Buffer } map — one raw image buffer per required document kind.
 */
export async function submitApplication(input, context) {
  const { idempotencyKey, requestId, files } = context;

  // Checked before any image processing so a retried/duplicate request with the same
  // Idempotency-Key never re-decodes, re-strips, or re-saves the images a second time.
  if (idempotencyKey) {
    const existing = await IdempotencyKey.findOne({ key: idempotencyKey }).lean();
    if (existing) {
      logger.info("application_submission_replay", {
        requestId,
        applicationId: existing.applicationId,
      });
      return existing.response;
    }
  }

  const applicationId = randomUUID();
  const documents = [];
  // Tracks every asset actually persisted to Cloudinary so far, independent of whether Mongo
  // ever sees them. Cloudinary and MongoDB are two separate systems with no shared
  // transaction — if anything below fails partway through, the catch block deletes whatever
  // was already uploaded rather than leaving orphaned identity documents behind.
  const uploadedAssets = [];
  let doc;

  try {
    for (const [kind, buffer] of Object.entries(files)) {
      let processed;
      try {
        processed = await processUploadedImage(buffer);
      } catch (err) {
        if (err instanceof InvalidImageError) {
          throw new ApiError(
            400,
            "INVALID_IMAGE",
            `The uploaded ${kind.replace(/_/g, " ")} image is not a valid image.`
          );
        }
        throw err;
      }

      const uploaded = await cloudinaryStorage.uploadDocumentFile({
        applicationId,
        kind,
        buffer: processed.buffer,
      });
      uploadedAssets.push(uploaded);
      documents.push({
        kind,
        publicId: uploaded.publicId,
        resourceType: uploaded.resourceType,
        deliveryType: uploaded.deliveryType,
        format: uploaded.format,
        bytes: uploaded.bytes,
        uploadedAt: new Date(),
      });
    }

    doc = buildApplicationDoc({ ...input, context }, applicationId, documents);
    await doc.save();
  } catch (err) {
    if (uploadedAssets.length > 0) {
      await Promise.allSettled(
        uploadedAssets.map((asset) => cloudinaryStorage.deleteDocumentFile(asset))
      );
      logger.warn("application_submission_rolled_back", {
        requestId,
        applicationId,
        assetCount: uploadedAssets.length,
      });
    }
    throw err;
  }

  const response = {
    success: true,
    message: "Application submitted successfully.",
    applicationId: doc.applicationId,
  };

  if (idempotencyKey) {
    try {
      await IdempotencyKey.create({ key: idempotencyKey, applicationId: doc.applicationId, response });
    } catch (err) {
      // A concurrent duplicate request already cached the same key; not a failure for this request.
      if (err?.code !== MONGO_DUPLICATE_KEY_ERROR_CODE) throw err;
    }
  }

  logger.info("application_submitted", { requestId, applicationId: doc.applicationId });

  return response;
}
