interface BrandMarkProps {
  className?: string;
}

/** Small geometric logomark, kept as inline SVG so it never triggers a separate image request. */
export default function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-slate-900" />
      <path
        d="M8 22V10L16 18L24 10V22"
        stroke="#2DD4BF"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
