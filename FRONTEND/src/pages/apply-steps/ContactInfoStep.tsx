import { useFormContext } from "react-hook-form";
import TextInput from "../../components/apply/TextInput";
import StepHeading from "./StepHeading";
import { US_STATES } from "../../lib/constants";
import type { ApplicationFormInput } from "../../lib/validation";

export default function ContactInfoStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<ApplicationFormInput>();

  return (
    <div>
      <StepHeading title="Contact information" description="How can we reach you, and where do you live?" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextInput
          label="Email address"
          type="email"
          required
          autoComplete="email"
          error={errors.applicant?.email?.message}
          {...register("applicant.email")}
        />
        <TextInput
          label="Phone number"
          type="tel"
          required
          autoComplete="tel"
          placeholder="(555) 123-4567"
          error={errors.applicant?.phoneNumber?.message}
          {...register("applicant.phoneNumber")}
        />
        <div className="sm:col-span-2">
          <TextInput
            label="Residential address"
            required
            autoComplete="street-address"
            error={errors.applicant?.residentialAddress?.message}
            {...register("applicant.residentialAddress")}
          />
        </div>
        <TextInput
          label="City"
          required
          autoComplete="address-level2"
          error={errors.applicant?.city?.message}
          {...register("applicant.city")}
        />
        <div>
          <TextInput
            label="State"
            required
            autoComplete="address-level1"
            list="us-states"
            error={errors.applicant?.state?.message}
            {...register("applicant.state")}
          />
          <datalist id="us-states">
            {US_STATES.map((state) => (
              <option key={state} value={state} />
            ))}
          </datalist>
        </div>
      </div>
    </div>
  );
}
