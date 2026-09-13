import { postForm, type RequestOptions } from "./client";
import type { ApplicationSuccessResponse } from "./types";
import type { ApplicationFormValues } from "../lib/validation";

// Exact JSON contract from BACKEND/docs/applications-api.md — every object is `.strict()` on
// the server, so this must never include a field the backend schema doesn't declare.
interface ApplicationSubmissionBody {
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
export function buildApplicationSubmissionBody(values: ApplicationFormValues): ApplicationSubmissionBody {
  return {
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
 * Submits a new loan application. Builds the exact multipart/form-data contract the backend
 * expects: a single "data" field carrying the JSON payload, plus the three required image
 * parts under their exact field names. Do not set a Content-Type header here — the browser
 * must generate the multipart boundary itself.
 */
export async function submitApplication(
  values: ApplicationFormValues,
  files: VerificationFiles,
  idempotencyKey: string,
  options?: RequestOptions
): Promise<ApplicationSuccessResponse> {
  const body = buildApplicationSubmissionBody(values);

  const formData = new FormData();
  formData.append("data", JSON.stringify(body));
  formData.append("idCardImage", files.idCardImage);
  formData.append("ssnCardImage", files.ssnCardImage);
  formData.append("selfieImage", files.selfieImage);

  return postForm<ApplicationSuccessResponse>("/applications", formData, {
    ...options,
    headers: {
      ...options?.headers,
      "Idempotency-Key": idempotencyKey,
    },
  });
}
