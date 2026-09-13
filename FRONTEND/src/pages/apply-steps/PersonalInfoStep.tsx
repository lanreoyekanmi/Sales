import { useFormContext } from "react-hook-form";
import TextInput from "../../components/apply/TextInput";
import SelectInput from "../../components/apply/SelectInput";
import StepHeading from "./StepHeading";
import { GENDERS, GENDER_LABELS } from "../../lib/constants";
import type { ApplicationFormInput } from "../../lib/validation";

export default function PersonalInfoStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<ApplicationFormInput>();

  return (
    <div>
      <StepHeading title="Personal information" description="Let's start with the basics." />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextInput
          label="First name"
          required
          autoComplete="given-name"
          error={errors.applicant?.firstName?.message}
          {...register("applicant.firstName")}
        />
        <TextInput
          label="Last name"
          required
          autoComplete="family-name"
          error={errors.applicant?.lastName?.message}
          {...register("applicant.lastName")}
        />
        <TextInput
          label="Date of birth"
          type="date"
          required
          autoComplete="bday"
          max={new Date().toISOString().slice(0, 10)}
          error={errors.applicant?.dateOfBirth?.message}
          hint="You must be at least 18 years old to apply."
          {...register("applicant.dateOfBirth")}
        />
        <SelectInput
          label="Gender"
          placeholder="Select (optional)"
          error={errors.applicant?.gender?.message}
          {...register("applicant.gender")}
        >
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {GENDER_LABELS[g]}
            </option>
          ))}
        </SelectInput>
      </div>
    </div>
  );
}
