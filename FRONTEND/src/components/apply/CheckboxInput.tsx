import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { AlertCircle } from "lucide-react";

interface CheckboxInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

export default function CheckboxInput({ label, error, id, className, ref, ...rest }: CheckboxInputProps) {
  const fieldId = id ?? rest.name;

  return (
    <div>
      <label htmlFor={fieldId} className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
        <input
          {...rest}
          ref={ref}
          id={fieldId}
          type="checkbox"
          className={`mt-0.5 h-4 w-4 flex-none rounded border-slate-300 text-teal-700 focus:ring-2 focus:ring-teal-600/30 ${className ?? ""}`}
          aria-invalid={error ? true : undefined}
        />
        <span className="leading-relaxed">{label}</span>
      </label>
      {error && (
        <p className="field-error ml-7" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
