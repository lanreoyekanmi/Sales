// Mirrors BACKEND/src/config/constants.js. The backend schema is the sole source of truth for
// what is actually accepted — these values exist only so the form can validate inline and show
// helpful messages before a round trip. If the backend constants change, update this file too.

export const MIN_REQUESTED_LOAN_AMOUNT = 1;
export const MAX_REQUESTED_LOAN_AMOUNT = 100_000_000;
export const MAX_MONTHLY_INCOME = 100_000_000;
export const MAX_LOAN_HISTORY_RECORDS = 20;
export const MIN_APPLICANT_AGE_YEARS = 18;
export const MAX_APPLICANT_AGE_YEARS = 120;

export const EMPLOYMENT_STATUSES = [
  "employed",
  "self_employed",
  "unemployed",
  "student",
  "retired",
] as const;

export const INCOME_FREQUENCIES = ["weekly", "biweekly", "monthly", "annually"] as const;

export const REPAYMENT_FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annually",
] as const;

export const LOAN_REPAYMENT_STATUSES = [
  "active",
  "paid",
  "overdue",
  "defaulted",
  "written_off",
] as const;

export const GENDERS = ["male", "female", "other", "prefer_not_to_say"] as const;

export const DISBURSEMENT_METHODS = [
  "check",
  "direct_deposit",
  "wire_transfer",
  "ach",
  "other",
] as const;

export const BANK_ACCOUNT_TYPES = ["checking", "savings"] as const;

export const BANK_TYPES = ["bank", "credit_union", "savings_and_loan", "other"] as const;

// Multipart field names the backend expects verification images under (POST /api/applications).
export const DOCUMENT_UPLOAD_FIELDS = {
  idCardImage: "id_card",
  ssnCardImage: "ssn_card",
  selfieImage: "selfie",
} as const;

export const ACCEPTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPTED_IMAGE_EXTENSIONS = ".jpg,.jpeg,.png,.webp";
export const MAX_DOCUMENT_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB, matches BACKEND/.env.example default

export const EMPLOYMENT_STATUS_LABELS: Record<(typeof EMPLOYMENT_STATUSES)[number], string> = {
  employed: "Employed",
  self_employed: "Self-employed",
  unemployed: "Unemployed",
  student: "Student",
  retired: "Retired",
};

export const INCOME_FREQUENCY_LABELS: Record<(typeof INCOME_FREQUENCIES)[number], string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  annually: "Annually",
};

export const REPAYMENT_FREQUENCY_LABELS: Record<(typeof REPAYMENT_FREQUENCIES)[number], string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

export const LOAN_REPAYMENT_STATUS_LABELS: Record<(typeof LOAN_REPAYMENT_STATUSES)[number], string> = {
  active: "Active",
  paid: "Paid off",
  overdue: "Overdue",
  defaulted: "Defaulted",
  written_off: "Written off",
};

export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

export const DISBURSEMENT_METHOD_LABELS: Record<(typeof DISBURSEMENT_METHODS)[number], string> = {
  check: "Check (mailed)",
  direct_deposit: "Direct deposit",
  wire_transfer: "Wire transfer",
  ach: "ACH transfer",
  other: "Other",
};

export const BANK_ACCOUNT_TYPE_LABELS: Record<(typeof BANK_ACCOUNT_TYPES)[number], string> = {
  checking: "Checking",
  savings: "Savings",
};

export const BANK_TYPE_LABELS: Record<(typeof BANK_TYPES)[number], string> = {
  bank: "Bank",
  credit_union: "Credit union",
  savings_and_loan: "Savings & loan association",
  other: "Other",
};

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
] as const;
