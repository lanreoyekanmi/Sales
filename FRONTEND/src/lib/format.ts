const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return currencyFormatter.format(value);
}

export function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(d);
}

/** Masks all but the last 4 characters, e.g. for on-screen review only — never sent anywhere. */
export function maskExceptLast4(value: string): string {
  if (value.length <= 4) return value;
  return `${"•".repeat(value.length - 4)}${value.slice(-4)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Builds an aria-describedby value pointing at a field's hint and/or error element. */
export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [error ? `${id}-error` : undefined, hint && !error ? `${id}-hint` : undefined].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

export function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
