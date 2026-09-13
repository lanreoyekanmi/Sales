import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type AlertVariant = "success" | "warning" | "error" | "info";

const VARIANT_STYLES: Record<AlertVariant, { container: string; icon: typeof Info }> = {
  success: { container: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
  warning: { container: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  error: { container: "border-red-200 bg-red-50 text-red-900", icon: XCircle },
  info: { container: "border-slate-200 bg-slate-50 text-slate-800", icon: Info },
};

interface AlertProps {
  variant: AlertVariant;
  title?: string;
  children: ReactNode;
}

export default function Alert({ variant, title, children }: AlertProps) {
  const { container, icon: Icon } = VARIANT_STYLES[variant];
  const role = variant === "error" || variant === "warning" ? "alert" : "status";

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${container}`} role={role}>
      <Icon className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
      <div className="text-sm leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-1" : ""}>{children}</div>
      </div>
    </div>
  );
}
