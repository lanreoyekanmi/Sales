import type { ReactNode, Ref, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import FieldChrome from "./FieldChrome";
import { describedBy } from "../../lib/format";

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  children: ReactNode;
  ref?: Ref<HTMLSelectElement>;
}

export default function SelectInput({
  label,
  error,
  hint,
  required,
  id,
  className,
  placeholder,
  children,
  ref,
  ...rest
}: SelectInputProps) {
  const fieldId = id ?? rest.name ?? label;

  return (
    <FieldChrome id={fieldId} label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <select
          {...rest}
          ref={ref}
          id={fieldId}
          defaultValue={rest.defaultValue ?? ""}
          className={`input-base appearance-none pr-10 ${error ? "input-error" : ""} ${className ?? ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          aria-required={required}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      </div>
    </FieldChrome>
  );
}
