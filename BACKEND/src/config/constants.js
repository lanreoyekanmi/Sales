export const DB_NAME = "Sales";

// Loan application business rules.
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
];

export const INCOME_FREQUENCIES = ["weekly", "biweekly", "monthly", "annually"];

export const REPAYMENT_FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annually",
];

export const LOAN_REPAYMENT_STATUSES = [
  "active",
  "paid",
  "overdue",
  "defaulted",
  "written_off",
];

export const APPLICATION_STATUSES = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "withdrawn",
];

export const GENDERS = ["male", "female", "other", "prefer_not_to_say"];

export const DISBURSEMENT_METHODS = [
  "check",
  "direct_deposit",
  "wire_transfer",
  "ach",
  "other",
];

export const BANK_ACCOUNT_TYPES = ["checking", "savings"];

export const BANK_TYPES = ["bank", "credit_union", "savings_and_loan", "other"];