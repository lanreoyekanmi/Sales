import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import BrandMark from "./BrandMark";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Link to="/" className="flex items-center gap-2.5">
              <BrandMark className="h-7 w-7" />
              <span className="text-sm font-semibold tracking-tight text-slate-900">Meridian Lending</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              A guided, secure way to submit a loan application online.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <nav aria-label="Footer" className="flex gap-6 text-sm font-medium text-slate-600">
              <Link to="/" className="hover:text-slate-900">
                Home
              </Link>
              <Link to="/apply" className="hover:text-slate-900">
                Apply for a loan
              </Link>
            </nav>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
              Your submission is transmitted securely.
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6 text-xs text-slate-500">
          © {year} Meridian Lending. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
