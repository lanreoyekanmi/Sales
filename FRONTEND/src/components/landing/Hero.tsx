import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-teal-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Secure, guided application
          </div>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Apply for a loan, clearly and securely.
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
            Complete your application in one guided flow — your details, your loan request, and
            identity verification — then our team reviews what you've submitted. No account or
            login required.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/apply" className="btn-accent px-6 py-3 text-[15px]">
              Start your application
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="btn-ghost px-6 py-3 text-[15px] text-slate-200 hover:bg-white/10 hover:text-white">
              See how it works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
