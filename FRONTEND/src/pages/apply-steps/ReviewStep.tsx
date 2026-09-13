import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { CheckCircle2, Pencil } from "lucide-react";
import StepHeading from "./StepHeading";
import CheckboxInput from "../../components/apply/CheckboxInput";
import {
  BANK_ACCOUNT_TYPE_LABELS,
  BANK_TYPE_LABELS,
  DISBURSEMENT_METHOD_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  GENDER_LABELS,
  INCOME_FREQUENCY_LABELS,
  REPAYMENT_FREQUENCY_LABELS,
} from "../../lib/constants";
import { formatCurrency, formatDate, maskExceptLast4 } from "../../lib/format";
import type { ApplicationFormInput } from "../../lib/validation";
import type { VerificationFiles } from "../../api/applications";

interface ReviewStepProps {
  files: Record<keyof VerificationFiles, File | null>;
  onEditStep: (index: number) => void;
  stepIdToIndex: (id: string) => number;
}

function SummarySection({
  title,
  stepId,
  onEdit,
  children,
}: {
  title: string;
  stepId: string;
  onEdit: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <button
          type="button"
          onClick={() => onEdit(stepId)}
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          Edit
        </button>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

// Deliberately plain <div>s rather than <dl>/<dt>/<dd>: some sections in this grid are label/value
// pairs and others are free-form summaries or icon lists, so a real description list would need
// invalid child markup to accommodate both.
function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm sm:block">
      <div className="text-slate-500">{label}</div>
      <div className="text-right font-medium text-slate-800 sm:text-left">{value}</div>
    </div>
  );
}

export default function ReviewStep({ files, onEditStep, stepIdToIndex }: ReviewStepProps) {
  const {
    register,
    getValues,
    formState: { errors },
  } = useFormContext<ApplicationFormInput>();

  const values = getValues();
  const editStep = (id: string) => onEditStep(stepIdToIndex(id));

  return (
    <div>
      <StepHeading title="Review and consent" description="Check everything over before you submit." />

      <div className="flex flex-col gap-5">
        <SummarySection title="Personal information" stepId="personal" onEdit={editStep}>
          <Row label="Name" value={`${values.applicant.firstName} ${values.applicant.lastName}`.trim()} />
          <Row label="Date of birth" value={formatDate(values.applicant.dateOfBirth)} />
          <Row
            label="Gender"
            value={values.applicant.gender ? GENDER_LABELS[values.applicant.gender as keyof typeof GENDER_LABELS] : undefined}
          />
        </SummarySection>

        <SummarySection title="Contact information" stepId="contact" onEdit={editStep}>
          <Row label="Email" value={values.applicant.email} />
          <Row label="Phone" value={values.applicant.phoneNumber} />
          <Row label="Address" value={values.applicant.residentialAddress} />
          <Row label="City / State" value={`${values.applicant.city}, ${values.applicant.state}`} />
        </SummarySection>

        <SummarySection title="Employment and income" stepId="employment" onEdit={editStep}>
          <Row
            label="Status"
            value={EMPLOYMENT_STATUS_LABELS[values.employment.employmentStatus as keyof typeof EMPLOYMENT_STATUS_LABELS]}
          />
          <Row label="Employer" value={values.employment.employerName} />
          <Row label="Job title" value={values.employment.jobTitle} />
          <Row
            label="Monthly income"
            value={values.employment.monthlyIncome ? formatCurrency(Number(values.employment.monthlyIncome)) : undefined}
          />
          <Row
            label="Income frequency"
            value={
              values.employment.incomeFrequency
                ? INCOME_FREQUENCY_LABELS[values.employment.incomeFrequency as keyof typeof INCOME_FREQUENCY_LABELS]
                : undefined
            }
          />
        </SummarySection>

        <SummarySection title="Loan request" stepId="loan-request" onEdit={editStep}>
          <Row
            label="Amount requested"
            value={values.loanRequest.requestedLoanAmount ? formatCurrency(Number(values.loanRequest.requestedLoanAmount)) : undefined}
          />
          <Row label="Purpose" value={values.loanRequest.loanPurpose} />
          <Row
            label="Repayment period"
            value={values.loanRequest.preferredRepaymentPeriodMonths ? `${values.loanRequest.preferredRepaymentPeriodMonths} months` : undefined}
          />
          <Row
            label="Repayment frequency"
            value={
              values.loanRequest.repaymentFrequency
                ? REPAYMENT_FREQUENCY_LABELS[values.loanRequest.repaymentFrequency as keyof typeof REPAYMENT_FREQUENCY_LABELS]
                : undefined
            }
          />
        </SummarySection>

        {values.loanHistory.length > 0 && (
          <SummarySection title="Loan history" stepId="loan-history" onEdit={editStep}>
            <div className="text-sm text-slate-600 sm:col-span-2">
              {values.loanHistory.length} previous loan{values.loanHistory.length > 1 ? "s" : ""} added, including{" "}
              {values.loanHistory
                .slice(0, 3)
                .map((entry) => entry.lenderName)
                .filter(Boolean)
                .join(", ")}
              {values.loanHistory.length > 3 ? ", and more" : ""}.
            </div>
          </SummarySection>
        )}

        <SummarySection title="Disbursement details" stepId="disbursement" onEdit={editStep}>
          <Row
            label="Method"
            value={DISBURSEMENT_METHOD_LABELS[values.disbursement.preferredMethod as keyof typeof DISBURSEMENT_METHOD_LABELS]}
          />
          <Row label="Account holder" value={values.disbursement.bankDetails.accountHolderName} />
          <Row
            label="Routing number"
            value={values.disbursement.bankDetails.bankRoutingNumber ? maskExceptLast4(values.disbursement.bankDetails.bankRoutingNumber) : undefined}
          />
          <Row
            label="Account number"
            value={values.disbursement.bankDetails.accountNumber ? maskExceptLast4(values.disbursement.bankDetails.accountNumber) : undefined}
          />
          <Row
            label="Account type"
            value={BANK_ACCOUNT_TYPE_LABELS[values.disbursement.bankDetails.accountType as keyof typeof BANK_ACCOUNT_TYPE_LABELS]}
          />
          <Row
            label="Institution type"
            value={BANK_TYPE_LABELS[values.disbursement.bankDetails.bankType as keyof typeof BANK_TYPE_LABELS]}
          />
        </SummarySection>

        <SummarySection title="Identity documents" stepId="documents" onEdit={editStep}>
          <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
            {(
              [
                ["idCardImage", "Government ID"],
                ["ssnCardImage", "Social Security card"],
                ["selfieImage", "Selfie"],
              ] as const
            ).map(([key, label]) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-slate-600">
                {files[key] ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-slate-300" aria-hidden="true" />
                )}
                {label}
              </span>
            ))}
          </div>
        </SummarySection>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <CheckboxInput
          label="I confirm the information provided is accurate and I accept the terms of this application."
          error={errors.consent?.termsAccepted?.message}
          {...register("consent.termsAccepted")}
        />
        <CheckboxInput
          label="I consent to Meridian Lending processing my personal information, including my identity documents, to evaluate this application."
          error={errors.consent?.dataProcessingAccepted?.message}
          {...register("consent.dataProcessingAccepted")}
        />
      </div>
    </div>
  );
}
