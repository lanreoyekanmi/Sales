import { UserRound, HandCoins, ScanFace, CheckCheck } from "lucide-react";

const STEPS = [
  {
    icon: UserRound,
    title: "Tell us about yourself",
    description:
      "Your personal, contact, and employment details, so we understand who's applying and their income situation.",
  },
  {
    icon: HandCoins,
    title: "Describe your loan request",
    description:
      "The amount you're requesting, what it's for, and how you'd prefer to repay it — plus any relevant loan history.",
  },
  {
    icon: ScanFace,
    title: "Verify your identity",
    description:
      "Upload a government-issued ID, your Social Security card, and a clear selfie so we can confirm it's really you.",
  },
  {
    icon: CheckCheck,
    title: "Review and submit",
    description:
      "Check everything over, provide your consent, and submit. You'll receive a reference for your records.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-700">How it works</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Four steps, submitted in one sitting
          </p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
                <step.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="mt-4 text-xs font-semibold text-slate-500">Step {index + 1}</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.description}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 max-w-2xl text-sm leading-relaxed text-slate-500">
          After you submit, our team reviews the information you provided. Submitting an
          application does not guarantee approval.
        </p>
      </div>
    </section>
  );
}
