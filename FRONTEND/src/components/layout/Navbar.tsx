import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import BrandMark from "./BrandMark";

const NAV_LINKS = [
  { to: "/#how-it-works", label: "How it works" },
  { to: "/#eligibility", label: "Eligibility" },
  { to: "/#security", label: "Security" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Primary">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <BrandMark className="h-8 w-8" />
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">Meridian Lending</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.to} href={link.to} className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:block">
          <NavLink to="/apply" className="btn-accent">
            Apply now
          </NavLink>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.to}
                href={link.to}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <NavLink to="/apply" className="btn-accent mt-2 w-full" onClick={() => setOpen(false)}>
              Apply now
            </NavLink>
          </div>
        </div>
      )}
    </header>
  );
}
