import type { InputHTMLAttributes, Ref } from "react";
import FieldChrome from "./FieldChrome";
import { describedBy } from "../../lib/format";

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export default function TextInput({ label, error, hint, required, id, className, ref, ...rest }: TextInputProps) {
  const fieldId = id ?? rest.name ?? label;

  return (
    <FieldChrome id={fieldId} label={label} error={error} hint={hint} required={required}>
      <input
        {...rest}
        ref={ref}
        id={fieldId}
        className={`input-base ${error ? "input-error" : ""} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        aria-required={required}
      />
    </FieldChrome>
  );
}
