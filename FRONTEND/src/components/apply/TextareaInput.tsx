import type { Ref, TextareaHTMLAttributes } from "react";
import FieldChrome from "./FieldChrome";
import { describedBy } from "../../lib/format";

interface TextareaInputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export default function TextareaInput({
  label,
  error,
  hint,
  required,
  id,
  className,
  ref,
  rows = 3,
  ...rest
}: TextareaInputProps) {
  const fieldId = id ?? rest.name ?? label;

  return (
    <FieldChrome id={fieldId} label={label} error={error} hint={hint} required={required}>
      <textarea
        {...rest}
        ref={ref}
        id={fieldId}
        rows={rows}
        className={`input-base resize-none ${error ? "input-error" : ""} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        aria-required={required}
      />
    </FieldChrome>
  );
}
