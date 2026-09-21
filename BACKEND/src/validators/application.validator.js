import { z } from "zod";
import {
  BANK_ACCOUNT_TYPES,
  BANK_TYPES,
  DISBURSEMENT_METHODS,
  EMPLOYMENT_STATUSES,
  GENDERS,
  INCOME_FREQUENCIES,
  LOAN_REPAYMENT_STATUSES,
  MAX_APPLICANT_AGE_YEARS,
  MAX_LOAN_HISTORY_RECORDS,
  MAX_MONTHLY_INCOME,
  MAX_REQUESTED_LOAN_AMOUNT,
  MIN_APPLICANT_AGE_YEARS,
  MIN_REQUESTED_LOAN_AMOUNT,
  REPAYMENT_FREQUENCIES,
} from "../config/constants.js";
import { NEW_APPLICATION_ID_REGEX } from "../utils/applicationId.js";

// This module is the single source of truth for what the public submission endpoint may
// accept. Every object schema is `.strict()`, so any field not explicitly listed here
// (status, creditScore, adminNotes, approvalStatus, riskScore, interestRate, ...) is
// rejected outright instead of being silently stored — this is what prevents mass assignment.

const PHONE_REGEX = /^[0-9+\-() ]{7,20}$/;

function yearsAgo(years) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

const dateOfBirthSchema = z.coerce
  .date({ message: "dateOfBirth must be a valid date." })
  .refine((d) => d <= yearsAgo(MIN_APPLICANT_AGE_YEARS), {
    message: `Applicant must be at least ${MIN_APPLICANT_AGE_YEARS} years old.`,
  })
  .refine((d) => d >= yearsAgo(MAX_APPLICANT_AGE_YEARS), {
    message: "dateOfBirth is not valid.",
  });

const moneyAmount = (max, label) =>
  z.coerce
    .number({ message: `${label} must be a number.` })
    .finite()
    .positive(`${label} must be greater than zero.`)
    .max(max, `${label} exceeds the maximum allowed value.`);

const optionalMoneyAmount = (max, label) =>
  z.coerce
    .number({ message: `${label} must be a number.` })
    .finite()
    .min(0, `${label} cannot be negative.`)
    .max(max, `${label} exceeds the maximum allowed value.`)
    .optional();

const applicantSchema = z
  .object({
    firstName: z.string().trim().min(1, "firstName is required.").max(80),
    lastName: z.string().trim().min(1, "lastName is required.").max(80),
    email: z.string().trim().toLowerCase().email("email is invalid.").max(254),
    phoneNumber: z
      .string()
      .trim()
      .regex(PHONE_REGEX, "phoneNumber format is invalid."),
    dateOfBirth: dateOfBirthSchema,
    gender: z.enum(GENDERS).optional(),
    residentialAddress: z.string().trim().min(1, "residentialAddress is required.").max(250),
    city: z.string().trim().min(1, "city is required.").max(100),
    state: z.string().trim().min(1, "state is required.").max(100),
  })
  .strict();

const employmentSchema = z
  .object({
    employmentStatus: z.enum(EMPLOYMENT_STATUSES),
    employerName: z.string().trim().max(150).optional(),
    jobTitle: z.string().trim().max(100).optional(),
    employmentDurationMonths: z.coerce.number().int().min(0).max(1200).optional(),
    monthlyIncome: optionalMoneyAmount(MAX_MONTHLY_INCOME, "monthlyIncome"),
    incomeFrequency: z.enum(INCOME_FREQUENCIES).optional(),
  })
  .strict()
  .refine(
    (data) =>
      !["employed", "self_employed"].includes(data.employmentStatus) ||
      (data.monthlyIncome !== undefined && data.incomeFrequency !== undefined),
    {
      message: "monthlyIncome and incomeFrequency are required when employed or self-employed.",
      path: ["monthlyIncome"],
    }
  )
  .refine(
    (data) => data.employmentStatus !== "employed" || Boolean(data.employerName),
    {
      message: "employerName is required when employmentStatus is 'employed'.",
      path: ["employerName"],
    }
  );

const loanRequestSchema = z
  .object({
    requestedLoanAmount: moneyAmount(MAX_REQUESTED_LOAN_AMOUNT, "requestedLoanAmount").refine(
      (v) => v >= MIN_REQUESTED_LOAN_AMOUNT,
      `requestedLoanAmount must be at least ${MIN_REQUESTED_LOAN_AMOUNT}.`
    ),
    loanPurpose: z.string().trim().min(1, "loanPurpose is required.").max(200),
    preferredRepaymentPeriodMonths: z.coerce.number().int().min(1).max(360),
    repaymentFrequency: z.enum(REPAYMENT_FREQUENCIES),
  })
  .strict();

const loanHistoryEntrySchema = z
  .object({
    lenderName: z.string().trim().min(1, "lenderName is required.").max(150),
    loanType: z.string().trim().max(100).optional(),
    originalLoanAmount: moneyAmount(MAX_REQUESTED_LOAN_AMOUNT, "originalLoanAmount"),
    outstandingAmount: optionalMoneyAmount(MAX_REQUESTED_LOAN_AMOUNT, "outstandingAmount"),
    repaymentStatus: z.enum(LOAN_REPAYMENT_STATUSES),
    startDate: z.coerce.date({ message: "startDate must be a valid date." }),
    endDate: z.coerce.date({ message: "endDate must be a valid date." }).optional(),
    repaymentFrequency: z.enum(REPAYMENT_FREQUENCIES).optional(),
    monthlyPayment: optionalMoneyAmount(MAX_REQUESTED_LOAN_AMOUNT, "monthlyPayment"),
    purpose: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "endDate cannot be before startDate.",
    path: ["endDate"],
  })
  .refine(
    (d) => d.outstandingAmount === undefined || d.outstandingAmount <= d.originalLoanAmount,
    {
      message: "outstandingAmount cannot exceed originalLoanAmount.",
      path: ["outstandingAmount"],
    }
  );

const ROUTING_NUMBER_REGEX = /^[0-9]{9}$/;
const ACCOUNT_NUMBER_REGEX = /^[0-9]{4,17}$/;

// Standard ABA routing-number checksum: a 9-digit routing number is only valid if
// 3*(d1+d4+d7) + 7*(d2+d5+d8) + 1*(d3+d6+d9) is a multiple of 10.
function isValidAbaRoutingNumber(value) {
  if (!ROUTING_NUMBER_REGEX.test(value)) return false;
  const d = value.split("").map(Number);
  const checksum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + 1 * (d[2] + d[5] + d[8]);
  return checksum % 10 === 0;
}

const bankDetailsSchema = z
  .object({
    accountHolderName: z.string().trim().min(1, "accountHolderName is required.").max(150),
    bankRoutingNumber: z
      .string()
      .trim()
      .refine(isValidAbaRoutingNumber, "bankRoutingNumber must be a valid 9-digit routing number."),
    accountNumber: z
      .string()
      .trim()
      .regex(ACCOUNT_NUMBER_REGEX, "accountNumber must be 4-17 digits."),
    accountType: z.enum(BANK_ACCOUNT_TYPES),
    bankType: z.enum(BANK_TYPES),
  })
  .strict();

const disbursementSchema = z
  .object({
    preferredMethod: z.enum(DISBURSEMENT_METHODS),
    otherMethodDetails: z.string().trim().max(200).optional(),
    bankDetails: bankDetailsSchema,
  })
  .strict()
  .refine((d) => d.preferredMethod !== "other" || Boolean(d.otherMethodDetails), {
    message: "otherMethodDetails is required when preferredMethod is 'other'.",
    path: ["otherMethodDetails"],
  });

const consentSchema = z
  .object({
    termsAccepted: z.literal(true, {
      message: "termsAccepted must be true to submit an application.",
    }),
    dataProcessingAccepted: z.literal(true, {
      message: "dataProcessingAccepted must be true to submit an application.",
    }),
  })
  .strict();

// Echoed back from the response of POST /api/applications/uploads/init (see
// controllers/uploadInit.controller.js) — never accepted in the legacy UUID shape, since that
// shape only ever originates server-side for applications created before this format existed.
// This is not "trusting client input" in the old mass-assignment sense: application.service.js
// never persists this value as-is without also independently deriving and fetching the staged
// Cloudinary uploads it names, so a well-formed-but-never-initialized id is rejected there.
const applicationIdSchema = z
  .string()
  .regex(NEW_APPLICATION_ID_REGEX, "applicationId is invalid or expired.");

export const applicationSubmissionSchema = z
  .object({
    applicationId: applicationIdSchema,
    applicant: applicantSchema,
    employment: employmentSchema,
    loanRequest: loanRequestSchema,
    loanHistory: z
      .array(loanHistoryEntrySchema)
      .max(
        MAX_LOAN_HISTORY_RECORDS,
        `A maximum of ${MAX_LOAN_HISTORY_RECORDS} loan history records is allowed.`
      )
      .optional()
      .default([]),
    disbursement: disbursementSchema,
    consent: consentSchema,
  })
  .strict();
