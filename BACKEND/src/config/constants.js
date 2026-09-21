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

// Verification document images. All three are mandatory on POST /api/applications — an
// application is never created without them. Each key is the multipart field name the client
// uploads under; each value is the "kind" stored against the application.
export const DOCUMENT_UPLOAD_FIELDS = {
  idCardImage: "id_card",
  ssnCardImage: "ssn_card",
  selfieImage: "selfie",
};

export const DOCUMENT_KINDS = Object.values(DOCUMENT_UPLOAD_FIELDS);

// Enforced in application.service.js / documentUpload.service.js, right after fetching a
// staged upload back from Cloudinary and before processUploadedImage runs — the browser
// uploads directly to Cloudinary (see services/cloudinaryStorage.adapter.js), so this can no
// longer be enforced up front by multer the way it was before the Vercel migration.
export const MAX_DOCUMENT_UPLOAD_SIZE_BYTES =
  Number(process.env.MAX_DOCUMENT_UPLOAD_SIZE_BYTES) || 8 * 1024 * 1024;

// Tracks whether the operational Telegram notification for a submitted application has been
// sent. Internal/operational only — never returned in any API response.
export const TELEGRAM_NOTIFICATION_STATUSES = ["pending", "sent", "failed"];