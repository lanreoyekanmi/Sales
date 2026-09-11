import { randomUUID } from "node:crypto";
import Application from "../models/application.model.js";
import IdempotencyKey from "../models/idempotencyKey.model.js";
import { toDecimal128 } from "../utils/money.js";
import logger from "../utils/logger.js";

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
function buildApplicationDoc(input) {
  return new Application({
    applicationId: randomUUID(),
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
 * @param {object} context - { idempotencyKey, sourceIp, userAgent, requestId }
 */
export async function submitApplication(input, context) {
  const { idempotencyKey, requestId } = context;

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

  const doc = buildApplicationDoc({ ...input, context });
  await doc.save();

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
