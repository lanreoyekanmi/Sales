import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import {
  APPLICATION_STATUSES,
  BANK_ACCOUNT_TYPES,
  BANK_TYPES,
  DISBURSEMENT_METHODS,
  EMPLOYMENT_STATUSES,
  GENDERS,
  INCOME_FREQUENCIES,
  LOAN_REPAYMENT_STATUSES,
  MAX_LOAN_HISTORY_RECORDS,
  REPAYMENT_FREQUENCIES,
} from "../config/constants.js";

const { Schema } = mongoose;

const applicantSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    phoneNumber: { type: String, required: true, trim: true, maxlength: 20 },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: GENDERS },
    residentialAddress: { type: String, required: true, trim: true, maxlength: 250 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
  },
  { _id: false }
);

const employmentSchema = new Schema(
  {
    employmentStatus: { type: String, required: true, enum: EMPLOYMENT_STATUSES },
    employerName: { type: String, trim: true, maxlength: 150 },
    jobTitle: { type: String, trim: true, maxlength: 100 },
    employmentDurationMonths: { type: Number, min: 0, max: 1200 },
    monthlyIncome: { type: Schema.Types.Decimal128 },
    incomeFrequency: { type: String, enum: INCOME_FREQUENCIES },
  },
  { _id: false }
);

const loanRequestSchema = new Schema(
  {
    requestedLoanAmount: { type: Schema.Types.Decimal128, required: true },
    loanPurpose: { type: String, required: true, trim: true, maxlength: 200 },
    preferredRepaymentPeriodMonths: { type: Number, required: true, min: 1, max: 360 },
    repaymentFrequency: { type: String, required: true, enum: REPAYMENT_FREQUENCIES },
  },
  { _id: false }
);

const loanHistorySchema = new Schema(
  {
    lenderName: { type: String, required: true, trim: true, maxlength: 150 },
    loanType: { type: String, trim: true, maxlength: 100 },
    originalLoanAmount: { type: Schema.Types.Decimal128, required: true },
    outstandingAmount: { type: Schema.Types.Decimal128 },
    repaymentStatus: { type: String, required: true, enum: LOAN_REPAYMENT_STATUSES },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    repaymentFrequency: { type: String, enum: REPAYMENT_FREQUENCIES },
    monthlyPayment: { type: Schema.Types.Decimal128 },
    purpose: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false }
);

// accountNumber and bankRoutingNumber use `select: false` so a future internal/admin query
// must explicitly opt in (`.select("+disbursement.bankDetails.accountNumber")`) to retrieve
// them — they are excluded from any query result by default, as defense in depth for the
// most sensitive fields this API stores.
const bankDetailsSchema = new Schema(
  {
    accountHolderName: { type: String, required: true, trim: true, maxlength: 150 },
    bankRoutingNumber: { type: String, required: true, trim: true, select: false },
    accountNumber: { type: String, required: true, trim: true, select: false },
    accountType: { type: String, required: true, enum: BANK_ACCOUNT_TYPES },
    bankType: { type: String, required: true, enum: BANK_TYPES },
  },
  { _id: false }
);

const disbursementSchema = new Schema(
  {
    preferredMethod: { type: String, required: true, enum: DISBURSEMENT_METHODS },
    otherMethodDetails: { type: String, trim: true, maxlength: 200 },
    bankDetails: { type: bankDetailsSchema, required: true },
  },
  { _id: false }
);

const consentSchema = new Schema(
  {
    termsAccepted: { type: Boolean, required: true },
    dataProcessingAccepted: { type: Boolean, required: true },
    acceptedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

// Internal audit/abuse-investigation fields only. Never returned in any API response.
const metadataSchema = new Schema(
  {
    submittedAt: { type: Date, required: true, default: Date.now },
    sourceIp: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 300 },
  },
  { _id: false }
);

const applicationSchema = new Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => randomUUID(),
    },
    status: {
      type: String,
      required: true,
      enum: APPLICATION_STATUSES,
      default: "submitted",
    },
    applicant: { type: applicantSchema, required: true },
    employment: { type: employmentSchema, required: true },
    loanRequest: { type: loanRequestSchema, required: true },
    loanHistory: {
      type: [loanHistorySchema],
      default: [],
      validate: {
        validator: (records) => records.length <= MAX_LOAN_HISTORY_RECORDS,
        message: `A maximum of ${MAX_LOAN_HISTORY_RECORDS} loan history records is allowed.`,
      },
    },
    disbursement: { type: disbursementSchema, required: true },
    consent: { type: consentSchema, required: true },
    metadata: { type: metadataSchema, required: true },
  },
  { timestamps: true }
);

applicationSchema.index({ createdAt: -1 });

// Defense in depth: if this document is ever serialized directly (e.g. a future internal
// tool), strip the internal Mongo _id/__v rather than relying solely on controllers to do so.
applicationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Application = mongoose.model("Application", applicationSchema);

export default Application;
