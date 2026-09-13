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
} from "./constants";

// Client-side mirror of BACKEND/src/validators/application.validator.js, used only to give the
// applicant fast, inline feedback. The backend re-validates everything independently and is the
// only source of truth for what is actually accepted — this file must never be treated as the
// security boundary.

const PHONE_REGEX = /^[0-9+\-() ]{7,20}$/;
const ROUTING_NUMBER_REGEX = /^[0-9]{9}$/;
const ACCOUNT_NUMBER_REGEX = /^[0-9]{4,17}$/;

function yearsAgo(years: number): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

function isValidAbaRoutingNumber(value: string): boolean {
  if (!ROUTING_NUMBER_REGEX.test(value)) return false;
  const d = value.split("").map(Number);
  const checksum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + 1 * (d[2] + d[5] + d[8]);
  return checksum % 10 === 0;
}

const requiredString = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

const moneyAmount = (max: number, label: string) =>
  z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce
      .number({ message: `${label} is required.` })
      .finite()
      .positive(`${label} must be greater than zero.`)
      .max(max, `${label} exceeds the maximum allowed value.`)
  );

const optionalMoneyAmount = (max: number, label: string) =>
  z.union([
    z.literal(""),
    z.coerce
      .number({ message: `${label} must be a number.` })
      .finite()
      .min(0, `${label} cannot be negative.`)
      .max(max, `${label} exceeds the maximum allowed value.`),
  ])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

export const applicantSchema = z.object({
  firstName: requiredString("First name", 80),
  lastName: requiredString("Last name", 80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phoneNumber: z.string().trim().regex(PHONE_REGEX, "Enter a valid phone number."),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date."),
  gender: z.enum(GENDERS).optional().or(z.literal("")),
  residentialAddress: requiredString("Residential address", 250),
  city: requiredString("City", 100),
  state: requiredString("State", 100),
}).superRefine((data, ctx) => {
  const dob = new Date(data.dateOfBirth);
  if (Number.isNaN(dob.getTime())) return;
  if (dob > yearsAgo(MIN_APPLICANT_AGE_YEARS)) {
    ctx.addIssue({
      code: "custom",
      path: ["dateOfBirth"],
      message: `You must be at least ${MIN_APPLICANT_AGE_YEARS} years old to apply.`,
    });
  }
  if (dob < yearsAgo(MAX_APPLICANT_AGE_YEARS)) {
    ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Enter a valid date of birth." });
  }
});

export const employmentSchema = z
  .object({
    employmentStatus: z.enum(EMPLOYMENT_STATUSES, { message: "Select your employment status." }),
    employerName: z.string().trim().max(150).optional().or(z.literal("")),
    jobTitle: z.string().trim().max(100).optional().or(z.literal("")),
    employmentDurationMonths: z.union([
      z.literal(""),
      z.coerce.number().int().min(0).max(1200),
    ]).optional().transform((v) => (v === "" || v === undefined ? undefined : v)),
    monthlyIncome: optionalMoneyAmount(MAX_MONTHLY_INCOME, "Monthly income"),
    incomeFrequency: z.enum(INCOME_FREQUENCIES).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const needsIncome = data.employmentStatus === "employed" || data.employmentStatus === "self_employed";
    if (needsIncome && data.monthlyIncome === undefined) {
      ctx.addIssue({ code: "custom", path: ["monthlyIncome"], message: "Monthly income is required." });
    }
    if (needsIncome && !data.incomeFrequency) {
      ctx.addIssue({ code: "custom", path: ["incomeFrequency"], message: "Select how often you're paid." });
    }
    if (data.employmentStatus === "employed" && !data.employerName) {
      ctx.addIssue({ code: "custom", path: ["employerName"], message: "Employer name is required." });
    }
  });

export const loanRequestSchema = z.object({
  requestedLoanAmount: moneyAmount(MAX_REQUESTED_LOAN_AMOUNT, "Loan amount").refine(
    (v) => v >= MIN_REQUESTED_LOAN_AMOUNT,
    `Loan amount must be at least ${MIN_REQUESTED_LOAN_AMOUNT}.`
  ),
  loanPurpose: requiredString("Loan purpose", 200),
  preferredRepaymentPeriodMonths: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce
      .number({ message: "Enter a repayment period." })
      .int("Repayment period must be a whole number of months.")
      .min(1, "Repayment period must be at least 1 month.")
      .max(360, "Repayment period cannot exceed 360 months.")
  ),
  repaymentFrequency: z.enum(REPAYMENT_FREQUENCIES, { message: "Select a repayment frequency." }),
});

export const loanHistoryEntrySchema = z
  .object({
    lenderName: requiredString("Lender name", 150),
    loanType: z.string().trim().max(100).optional().or(z.literal("")),
    originalLoanAmount: moneyAmount(MAX_REQUESTED_LOAN_AMOUNT, "Original loan amount"),
    outstandingAmount: optionalMoneyAmount(MAX_REQUESTED_LOAN_AMOUNT, "Outstanding amount"),
    repaymentStatus: z.enum(LOAN_REPAYMENT_STATUSES, { message: "Select a repayment status." }),
    startDate: z.string().min(1, "Start date is required."),
    endDate: z.string().optional().or(z.literal("")),
    repaymentFrequency: z.enum(REPAYMENT_FREQUENCIES).optional().or(z.literal("")),
    monthlyPayment: optionalMoneyAmount(MAX_REQUESTED_LOAN_AMOUNT, "Monthly payment"),
    purpose: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.endDate && data.startDate && data.endDate < data.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date cannot be before start date." });
    }
    if (
      data.outstandingAmount !== undefined &&
      data.outstandingAmount > data.originalLoanAmount
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["outstandingAmount"],
        message: "Outstanding amount cannot exceed the original loan amount.",
      });
    }
  });

export const bankDetailsSchema = z.object({
  accountHolderName: requiredString("Account holder name", 150),
  bankRoutingNumber: z
    .string()
    .trim()
    .refine(isValidAbaRoutingNumber, "Enter a valid 9-digit routing number."),
  accountNumber: z.string().trim().regex(ACCOUNT_NUMBER_REGEX, "Account number must be 4-17 digits."),
  accountType: z.enum(BANK_ACCOUNT_TYPES, { message: "Select an account type." }),
  bankType: z.enum(BANK_TYPES, { message: "Select an institution type." }),
});

export const disbursementSchema = z
  .object({
    preferredMethod: z.enum(DISBURSEMENT_METHODS, { message: "Select a disbursement method." }),
    otherMethodDetails: z.string().trim().max(200).optional().or(z.literal("")),
    bankDetails: bankDetailsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.preferredMethod === "other" && !data.otherMethodDetails) {
      ctx.addIssue({
        code: "custom",
        path: ["otherMethodDetails"],
        message: "Describe the disbursement method.",
      });
    }
  });

export const consentSchema = z.object({
  termsAccepted: z.literal(true, { message: "You must accept the terms to continue." }),
  dataProcessingAccepted: z.literal(true, { message: "You must consent to data processing to continue." }),
});

export const loanHistoryListSchema = z.array(loanHistoryEntrySchema).max(MAX_LOAN_HISTORY_RECORDS);

export const applicationFormSchema = z.object({
  applicant: applicantSchema,
  employment: employmentSchema,
  loanRequest: loanRequestSchema,
  loanHistory: loanHistoryListSchema,
  disbursement: disbursementSchema,
  consent: consentSchema,
});

export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;
export type ApplicantValues = z.infer<typeof applicantSchema>;
export type EmploymentValues = z.infer<typeof employmentSchema>;
export type LoanRequestValues = z.infer<typeof loanRequestSchema>;
export type LoanHistoryEntryValues = z.infer<typeof loanHistoryEntrySchema>;
export type DisbursementValues = z.infer<typeof disbursementSchema>;
export type ConsentValues = z.infer<typeof consentSchema>;

// What react-hook-form actually holds: every native input/select produces a string (or a
// boolean for a checkbox), regardless of what the zod schema above coerces it to on submit.
// This is the type passed to useForm<>, register(), watch(), etc.
export interface LoanHistoryEntryInput {
  lenderName: string;
  loanType: string;
  originalLoanAmount: string;
  outstandingAmount: string;
  repaymentStatus: string;
  startDate: string;
  endDate: string;
  repaymentFrequency: string;
  monthlyPayment: string;
  purpose: string;
}

export interface ApplicationFormInput {
  applicant: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    dateOfBirth: string;
    gender: string;
    residentialAddress: string;
    city: string;
    state: string;
  };
  employment: {
    employmentStatus: string;
    employerName: string;
    jobTitle: string;
    employmentDurationMonths: string;
    monthlyIncome: string;
    incomeFrequency: string;
  };
  loanRequest: {
    requestedLoanAmount: string;
    loanPurpose: string;
    preferredRepaymentPeriodMonths: string;
    repaymentFrequency: string;
  };
  loanHistory: LoanHistoryEntryInput[];
  disbursement: {
    preferredMethod: string;
    otherMethodDetails: string;
    bankDetails: {
      accountHolderName: string;
      bankRoutingNumber: string;
      accountNumber: string;
      accountType: string;
      bankType: string;
    };
  };
  consent: {
    termsAccepted: boolean;
    dataProcessingAccepted: boolean;
  };
}

export const emptyLoanHistoryEntry: LoanHistoryEntryInput = {
  lenderName: "",
  loanType: "",
  originalLoanAmount: "",
  outstandingAmount: "",
  repaymentStatus: "",
  startDate: "",
  endDate: "",
  repaymentFrequency: "",
  monthlyPayment: "",
  purpose: "",
};

export const applicationFormDefaultValues: ApplicationFormInput = {
  applicant: {
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    dateOfBirth: "",
    gender: "",
    residentialAddress: "",
    city: "",
    state: "",
  },
  employment: {
    employmentStatus: "",
    employerName: "",
    jobTitle: "",
    employmentDurationMonths: "",
    monthlyIncome: "",
    incomeFrequency: "",
  },
  loanRequest: {
    requestedLoanAmount: "",
    loanPurpose: "",
    preferredRepaymentPeriodMonths: "",
    repaymentFrequency: "",
  },
  loanHistory: [],
  disbursement: {
    preferredMethod: "",
    otherMethodDetails: "",
    bankDetails: {
      accountHolderName: "",
      bankRoutingNumber: "",
      accountNumber: "",
      accountType: "",
      bankType: "",
    },
  },
  consent: {
    termsAccepted: false,
    dataProcessingAccepted: false,
  },
};
