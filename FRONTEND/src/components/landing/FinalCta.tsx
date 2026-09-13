import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function FinalCta() {
  return (
    <section className="bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Ready to apply?</h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-500">
          The application takes place in one guided flow. You can review everything before it's
          submitted.
        </p>
        <div className="mt-8">
          <Link to="/apply" className="btn-accent px-6 py-3 text-[15px]">
            Start your application
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
