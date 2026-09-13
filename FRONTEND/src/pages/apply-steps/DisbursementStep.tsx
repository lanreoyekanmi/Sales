import { useFormContext } from "react-hook-form";
import TextInput from "../../components/apply/TextInput";
import SelectInput from "../../components/apply/SelectInput";
import StepHeading from "./StepHeading";
import {
  BANK_ACCOUNT_TYPES,
  BANK_ACCOUNT_TYPE_LABELS,
  BANK_TYPES,
  BANK_TYPE_LABELS,
  DISBURSEMENT_METHODS,
  DISBURSEMENT_METHOD_LABELS,
} from "../../lib/constants";
import type { ApplicationFormInput } from "../../lib/validation";

export default function DisbursementStep() {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<ApplicationFormInput>();

  const preferredMethod = watch("disbursement.preferredMethod");

  return (
    <div>
      <StepHeading
        title="Disbursement details"
        description="Tell us how and where to send funds if your application is approved."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SelectInput
            label="Preferred disbursement method"
            required
            placeholder="Select a method"
            error={errors.disbursement?.preferredMethod?.message}
            {...register("disbursement.preferredMethod")}
          >
            {DISBURSEMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {DISBURSEMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </SelectInput>
        </div>

        {preferredMethod === "other" && (
          <div className="sm:col-span-2">
            <TextInput
              label="Describe the disbursement method"
              required
              maxLength={200}
              error={errors.disbursement?.otherMethodDetails?.message}
              {...register("disbursement.otherMethodDetails")}
            />
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-slate-100 pt-6">
        <h3 className="text-sm font-semibold text-slate-800">Bank account details</h3>
        <p className="mt-1 text-xs text-slate-500">Required regardless of disbursement method.</p>

        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextInput
              label="Account holder name"
              required
              autoComplete="off"
              error={errors.disbursement?.bankDetails?.accountHolderName?.message}
              {...register("disbursement.bankDetails.accountHolderName")}
            />
          </div>
          <TextInput
            label="Routing number"
            required
            inputMode="numeric"
            autoComplete="off"
            maxLength={9}
            hint="9 digits"
            error={errors.disbursement?.bankDetails?.bankRoutingNumber?.message}
            {...register("disbursement.bankDetails.bankRoutingNumber")}
          />
          <TextInput
            label="Account number"
            required
            inputMode="numeric"
            autoComplete="off"
            maxLength={17}
            hint="4–17 digits"
            error={errors.disbursement?.bankDetails?.accountNumber?.message}
            {...register("disbursement.bankDetails.accountNumber")}
          />
          <SelectInput
            label="Account type"
            required
            placeholder="Select account type"
            error={errors.disbursement?.bankDetails?.accountType?.message}
            {...register("disbursement.bankDetails.accountType")}
          >
            {BANK_ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {BANK_ACCOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            label="Institution type"
            required
            placeholder="Select institution type"
            error={errors.disbursement?.bankDetails?.bankType?.message}
            {...register("disbursement.bankDetails.bankType")}
          >
            {BANK_TYPES.map((type) => (
              <option key={type} value={type}>
                {BANK_TYPE_LABELS[type]}
              </option>
            ))}
          </SelectInput>
        </div>
      </div>
    </div>
  );
}
