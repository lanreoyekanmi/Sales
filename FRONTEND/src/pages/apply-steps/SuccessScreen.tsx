import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Copy, CopyCheck } from "lucide-react";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

interface SuccessScreenProps {
  applicationId: string;
  onStartNew: () => void;
}

export default function SuccessScreen({ applicationId, onStartNew }: SuccessScreenProps) {
  useDocumentTitle("Application submitted");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(applicationId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Clipboard access can be denied by the browser; the reference is still visible to copy manually.
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center sm:px-6">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
        <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
      </span>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        Your application has been submitted
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        Our team will review your information. Keep your application reference below for future
        communication.
      </p>

      <div className="mt-8 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="min-w-0 text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Application reference</p>
          <p className="truncate font-mono text-sm text-slate-800">{applicationId}</p>
        </div>
        <button type="button" onClick={handleCopy} className="btn-secondary flex-none px-3 py-2 text-xs">
          {copied ? <CopyCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link to="/" className="btn-secondary">
          Back to home
        </Link>
        <button type="button" onClick={onStartNew} className="btn-primary">
          Submit another application
        </button>
      </div>
    </div>
  );
}
