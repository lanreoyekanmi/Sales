import { useFieldArray, useFormContext } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import TextInput from "../../components/apply/TextInput";
import SelectInput from "../../components/apply/SelectInput";
import StepHeading from "./StepHeading";
import {
  LOAN_REPAYMENT_STATUSES,
  LOAN_REPAYMENT_STATUS_LABELS,
  MAX_LOAN_HISTORY_RECORDS,
  REPAYMENT_FREQUENCIES,
  REPAYMENT_FREQUENCY_LABELS,
} from "../../lib/constants";
import { emptyLoanHistoryEntry, type ApplicationFormInput } from "../../lib/validation";

export default function LoanHistoryStep() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<ApplicationFormInput>();

  const { fields, append, remove } = useFieldArray({ control, name: "loanHistory" });

  return (
    <div>
      <StepHeading
        title="Loan history"
        description="Optional — add any previous or current loans. Skip this step if it doesn't apply to you."
      />

      {fields.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No previous loans added. You can continue to the next step, or add one below.
        </div>
      )}

      <div className="flex flex-col gap-5">
        {fields.map((field, index) => {
          const entryErrors = errors.loanHistory?.[index];
          return (
            <div key={field.id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Loan {index + 1}</p>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextInput
                  label="Lender name"
                  required
                  error={entryErrors?.lenderName?.message}
                  {...register(`loanHistory.${index}.lenderName`)}
                />
                <TextInput
                  label="Loan type"
                  hint="Optional, e.g. auto, personal"
                  error={entryErrors?.loanType?.message}
                  {...register(`loanHistory.${index}.loanType`)}
                />
                <TextInput
                  label="Original loan amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  required
                  error={entryErrors?.originalLoanAmount?.message}
                  {...register(`loanHistory.${index}.originalLoanAmount`)}
                />
                <TextInput
                  label="Outstanding amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  hint="Optional"
                  error={entryErrors?.outstandingAmount?.message}
                  {...register(`loanHistory.${index}.outstandingAmount`)}
                />
                <SelectInput
                  label="Repayment status"
                  required
                  placeholder="Select a status"
                  error={entryErrors?.repaymentStatus?.message}
                  {...register(`loanHistory.${index}.repaymentStatus`)}
                >
                  {LOAN_REPAYMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {LOAN_REPAYMENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </SelectInput>
                <SelectInput
                  label="Repayment frequency"
                  placeholder="Optional"
                  error={entryErrors?.repaymentFrequency?.message}
                  {...register(`loanHistory.${index}.repaymentFrequency`)}
                >
                  {REPAYMENT_FREQUENCIES.map((freq) => (
                    <option key={freq} value={freq}>
                      {REPAYMENT_FREQUENCY_LABELS[freq]}
                    </option>
                  ))}
                </SelectInput>
                <TextInput
                  label="Start date"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  error={entryErrors?.startDate?.message}
                  {...register(`loanHistory.${index}.startDate`)}
                />
                <TextInput
                  label="End date"
                  type="date"
                  hint="Optional, if the loan has ended"
                  error={entryErrors?.endDate?.message}
                  {...register(`loanHistory.${index}.endDate`)}
                />
                <TextInput
                  label="Monthly payment"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  hint="Optional"
                  error={entryErrors?.monthlyPayment?.message}
                  {...register(`loanHistory.${index}.monthlyPayment`)}
                />
                <div className="sm:col-span-2">
                  <TextInput
                    label="Purpose"
                    hint="Optional"
                    maxLength={200}
                    error={entryErrors?.purpose?.message}
                    {...register(`loanHistory.${index}.purpose`)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => append(emptyLoanHistoryEntry)}
        disabled={fields.length >= MAX_LOAN_HISTORY_RECORDS}
        className="btn-secondary mt-5 w-full sm:w-auto"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a previous loan
      </button>
    </div>
  );
}
