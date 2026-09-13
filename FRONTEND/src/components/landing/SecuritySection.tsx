import { Lock, ImageOff, EyeOff, ShieldOff } from "lucide-react";

const POINTS = [
  {
    icon: Lock,
    title: "Encrypted in transit",
    description: "Your application and documents are sent to us over an encrypted connection.",
  },
  {
    icon: ImageOff,
    title: "Documents handled carefully",
    description:
      "Identity images are processed and stored with a dedicated secure document provider — never displayed publicly.",
  },
  {
    icon: EyeOff,
    title: "Minimal data, minimal exposure",
    description: "We only collect the information needed to process your application — nothing more.",
  },
  {
    icon: ShieldOff,
    title: "No public lookup",
    description:
      "Your application reference cannot be used by anyone to view your information. There's no public page that exposes applicant data.",
  },
];

export default function SecuritySection() {
  return (
    <section id="security" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-700">Security &amp; privacy</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Built to protect what you share with us
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((point) => (
            <div key={point.title} className="rounded-2xl border border-slate-200 p-5">
              <point.icon className="h-5 w-5 text-teal-700" aria-hidden="true" />
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{point.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
