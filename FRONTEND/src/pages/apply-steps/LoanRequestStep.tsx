import { useFormContext } from "react-hook-form";
import TextInput from "../../components/apply/TextInput";
import SelectInput from "../../components/apply/SelectInput";
import TextareaInput from "../../components/apply/TextareaInput";
import StepHeading from "./StepHeading";
import { REPAYMENT_FREQUENCIES, REPAYMENT_FREQUENCY_LABELS } from "../../lib/constants";
import type { ApplicationFormInput } from "../../lib/validation";

export default function LoanRequestStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<ApplicationFormInput>();

  return (
    <div>
      <StepHeading title="Loan request" description="How much would you like to borrow, and on what terms?" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextInput
          label="Requested loan amount"
          type="number"
          inputMode="decimal"
          min={1}
          step="0.01"
          required
          placeholder="0.00"
          error={errors.loanRequest?.requestedLoanAmount?.message}
          {...register("loanRequest.requestedLoanAmount")}
        />
        <TextInput
          label="Preferred repayment period (months)"
          type="number"
          inputMode="numeric"
          min={1}
          max={360}
          required
          error={errors.loanRequest?.preferredRepaymentPeriodMonths?.message}
          {...register("loanRequest.preferredRepaymentPeriodMonths")}
        />
        <div className="sm:col-span-2">
          <SelectInput
            label="Repayment frequency"
            required
            placeholder="How often would you like to repay?"
            error={errors.loanRequest?.repaymentFrequency?.message}
            {...register("loanRequest.repaymentFrequency")}
          >
            {REPAYMENT_FREQUENCIES.map((freq) => (
              <option key={freq} value={freq}>
                {REPAYMENT_FREQUENCY_LABELS[freq]}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className="sm:col-span-2">
          <TextareaInput
            label="Purpose of the loan"
            required
            maxLength={200}
            hint="Briefly describe what the funds will be used for (up to 200 characters)."
            error={errors.loanRequest?.loanPurpose?.message}
            {...register("loanRequest.loanPurpose")}
          />
        </div>
      </div>
    </div>
  );
}
