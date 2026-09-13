import { Check } from "lucide-react";

const REQUIREMENTS = [
  "You are at least 18 years old",
  "A government-issued photo ID (e.g. driver's license or passport)",
  "Your Social Security card",
  "A device to take a clear selfie for identity verification",
  "Employment and income details, if you're employed or self-employed",
  "Bank account details to receive funds if your application is approved",
];

export default function Eligibility() {
  return (
    <section id="eligibility" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-700">Before you start</h2>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">What you'll need</p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500">
              Having these ready makes the application faster to complete. You can save your
              progress by keeping the tab open until you submit.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {REQUIREMENTS.map((item) => (
              <li key={item} className="card flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="text-sm leading-relaxed text-slate-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
