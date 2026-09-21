import { postJson, type RequestOptions } from "./client";
import { ApplicationApiError, type ApplicationSuccessResponse, type ApplicationUploadInitResponse, type CloudinaryUploadTarget } from "./types";
import type { ApplicationFormValues } from "../lib/validation";

// Exact JSON contract from BACKEND/docs/applications-api.md — every object is `.strict()` on
// the server, so this must never include a field the backend schema doesn't declare.
interface ApplicationSubmissionBody {
  applicationId: string;
  applicant: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    dateOfBirth: string;
    gender?: string;
    residentialAddress: string;
    city: string;
    state: string;
  };
  employment: {
    employmentStatus: string;
    employerName?: string;
    jobTitle?: string;
    employmentDurationMonths?: number;
    monthlyIncome?: number;
    incomeFrequency?: string;
  };
  loanRequest: {
    requestedLoanAmount: number;
    loanPurpose: string;
    preferredRepaymentPeriodMonths: number;
    repaymentFrequency: string;
  };
  loanHistory: Array<{
    lenderName: string;
    loanType?: string;
    originalLoanAmount: number;
    outstandingAmount?: number;
    repaymentStatus: string;
    startDate: string;
    endDate?: string;
    repaymentFrequency?: string;
    monthlyPayment?: number;
    purpose?: string;
  }>;
  disbursement: {
    preferredMethod: string;
    otherMethodDetails?: string;
    bankDetails: {
      accountHolderName: string;
      bankRoutingNumber: string;
      accountNumber: string;
      accountType: string;
      bankType: string;
    };
  };
  consent: {
    termsAccepted: true;
    dataProcessingAccepted: true;
  };
}

const emptyToUndefined = (v: string | undefined): string | undefined => (v ? v : undefined);

/** Maps validated form state to the exact JSON contract the backend accepts (see docs). */
export function buildApplicationSubmissionBody(
  values: ApplicationFormValues,
  applicationId: string
): ApplicationSubmissionBody {
  return {
    applicationId,
    applicant: {
      firstName: values.applicant.firstName,
      lastName: values.applicant.lastName,
      email: values.applicant.email,
      phoneNumber: values.applicant.phoneNumber,
      dateOfBirth: values.applicant.dateOfBirth,
      gender: emptyToUndefined(values.applicant.gender),
      residentialAddress: values.applicant.residentialAddress,
      city: values.applicant.city,
      state: values.applicant.state,
    },
    employment: {
      employmentStatus: values.employment.employmentStatus,
      employerName: emptyToUndefined(values.employment.employerName),
      jobTitle: emptyToUndefined(values.employment.jobTitle),
      employmentDurationMonths: values.employment.employmentDurationMonths,
      monthlyIncome: values.employment.monthlyIncome,
      incomeFrequency: emptyToUndefined(values.employment.incomeFrequency),
    },
    loanRequest: {
      requestedLoanAmount: values.loanRequest.requestedLoanAmount,
      loanPurpose: values.loanRequest.loanPurpose,
      preferredRepaymentPeriodMonths: values.loanRequest.preferredRepaymentPeriodMonths,
      repaymentFrequency: values.loanRequest.repaymentFrequency,
    },
    loanHistory: values.loanHistory.map((entry) => ({
      lenderName: entry.lenderName,
      loanType: emptyToUndefined(entry.loanType),
      originalLoanAmount: entry.originalLoanAmount,
      outstandingAmount: entry.outstandingAmount,
      repaymentStatus: entry.repaymentStatus,
      startDate: entry.startDate,
      endDate: emptyToUndefined(entry.endDate),
      repaymentFrequency: emptyToUndefined(entry.repaymentFrequency),
      monthlyPayment: entry.monthlyPayment,
      purpose: emptyToUndefined(entry.purpose),
    })),
    disbursement: {
      preferredMethod: values.disbursement.preferredMethod,
      otherMethodDetails: emptyToUndefined(values.disbursement.otherMethodDetails),
      bankDetails: {
        accountHolderName: values.disbursement.bankDetails.accountHolderName,
        bankRoutingNumber: values.disbursement.bankDetails.bankRoutingNumber,
        accountNumber: values.disbursement.bankDetails.accountNumber,
        accountType: values.disbursement.bankDetails.accountType,
        bankType: values.disbursement.bankDetails.bankType,
      },
    },
    consent: {
      termsAccepted: true,
      dataProcessingAccepted: true,
    },
  };
}

export interface VerificationFiles {
  idCardImage: File;
  ssnCardImage: File;
  selfieImage: File;
}

/**
 * Uploads one file directly to Cloudinary using a signature obtained from our own API (see
 * initUploads below) — the file never passes through our server. Required because a Vercel
 * Function request body is capped at 4.5MB, well under the 8MB this app allows per image; the
 * server fetches the uploaded bytes back from Cloudinary itself once POST /applications runs.
 */
async function uploadToCloudinary(file: File, target: CloudinaryUploadTarget): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", target.apiKey);
  form.append("timestamp", String(target.timestamp));
  form.append("signature", target.signature);
  form.append("public_id", target.publicId);
  form.append("type", target.type);
  form.append("overwrite", String(target.overwrite));
  form.append("invalidate", String(target.invalidate));

  let res: Response;
  try {
    res = await fetch(target.uploadUrl, { method: "POST", body: form });
  } catch {
    throw new ApplicationApiError(
      "We couldn't upload your documents. Please check your internet connection and try again.",
      "UPLOAD_FAILED"
    );
  }
  if (!res.ok) {
    throw new ApplicationApiError("We couldn't upload your documents. Please try again.", "UPLOAD_FAILED");
  }
}

/** Step 1: obtains a fresh applicationId and a signed Cloudinary upload target per document. */
function initUploads(options?: RequestOptions): Promise<ApplicationUploadInitResponse> {
  return postJson<ApplicationUploadInitResponse>("/applications/uploads/init", {}, options);
}

/**
 * Submits a new loan application:
 *  1. requests an applicationId + signed upload targets from our API,
 *  2. uploads the three verification images directly to Cloudinary (bypassing our server),
 *  3. POSTs the application data (plus the applicationId from step 1) as plain JSON.
 * The backend fetches the uploaded images back from Cloudinary itself, so nothing here ever
 * sends raw image bytes through our own API.
 */
export async function submitApplication(
  values: ApplicationFormValues,
  files: VerificationFiles,
  idempotencyKey: string,
  options?: RequestOptions
): Promise<ApplicationSuccessResponse> {
  const init = await initUploads(options);

  await Promise.all([
    uploadToCloudinary(files.idCardImage, init.uploads.idCardImage),
    uploadToCloudinary(files.ssnCardImage, init.uploads.ssnCardImage),
    uploadToCloudinary(files.selfieImage, init.uploads.selfieImage),
  ]);

  const body = buildApplicationSubmissionBody(values, init.applicationId);

  return postJson<ApplicationSuccessResponse>("/applications", body, {
    ...options,
    headers: {
      ...options?.headers,
      "Idempotency-Key": idempotencyKey,
    },
  });
}
