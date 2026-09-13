import { useFormContext } from "react-hook-form";
import TextInput from "../../components/apply/TextInput";
import SelectInput from "../../components/apply/SelectInput";
import StepHeading from "./StepHeading";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_LABELS, INCOME_FREQUENCIES, INCOME_FREQUENCY_LABELS } from "../../lib/constants";
import type { ApplicationFormInput } from "../../lib/validation";

export default function EmploymentStep() {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<ApplicationFormInput>();

  const employmentStatus = watch("employment.employmentStatus");
  const needsIncome = employmentStatus === "employed" || employmentStatus === "self_employed";
  const needsEmployerName = employmentStatus === "employed";

  return (
    <div>
      <StepHeading title="Employment and income" description="Tell us about your current work situation." />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SelectInput
            label="Employment status"
            required
            placeholder="Select your employment status"
            error={errors.employment?.employmentStatus?.message}
            {...register("employment.employmentStatus")}
          >
            {EMPLOYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {EMPLOYMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </SelectInput>
        </div>

        {needsEmployerName && (
          <TextInput
            label="Employer name"
            required
            autoComplete="organization"
            error={errors.employment?.employerName?.message}
            {...register("employment.employerName")}
          />
        )}

        <TextInput
          label="Job title"
          hint="Optional"
          error={errors.employment?.jobTitle?.message}
          {...register("employment.jobTitle")}
        />

        <TextInput
          label="Time in current role (months)"
          type="number"
          inputMode="numeric"
          min={0}
          max={1200}
          hint="Optional"
          error={errors.employment?.employmentDurationMonths?.message}
          {...register("employment.employmentDurationMonths")}
        />

        {needsIncome && (
          <>
            <TextInput
              label="Monthly income"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              required
              placeholder="0.00"
              error={errors.employment?.monthlyIncome?.message}
              {...register("employment.monthlyIncome")}
            />
            <SelectInput
              label="Income frequency"
              required
              placeholder="How often are you paid?"
              error={errors.employment?.incomeFrequency?.message}
              {...register("employment.incomeFrequency")}
            >
              {INCOME_FREQUENCIES.map((freq) => (
                <option key={freq} value={freq}>
                  {INCOME_FREQUENCY_LABELS[freq]}
                </option>
              ))}
            </SelectInput>
          </>
        )}
      </div>
    </div>
  );
}
