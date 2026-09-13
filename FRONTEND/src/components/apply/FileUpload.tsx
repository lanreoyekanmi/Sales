import { useEffect, useRef, useState, type DragEvent } from "react";
import { AlertCircle, ImageIcon, RotateCcw, Upload, X } from "lucide-react";
import {
  ACCEPTED_IMAGE_EXTENSIONS,
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_DOCUMENT_UPLOAD_SIZE_BYTES,
} from "../../lib/constants";
import { formatFileSize } from "../../lib/format";

interface FileUploadProps {
  id: string;
  label: string;
  description: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  error?: string;
  required?: boolean;
}

function validateFile(file: File): string | undefined {
  if (!ACCEPTED_IMAGE_MIME_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_MIME_TYPES)[number])) {
    return "Only JPEG, PNG, or WEBP images are accepted.";
  }
  if (file.size > MAX_DOCUMENT_UPLOAD_SIZE_BYTES) {
    return `File is too large. Maximum size is ${formatFileSize(MAX_DOCUMENT_UPLOAD_SIZE_BYTES)}.`;
  }
  return undefined;
}

export default function FileUpload({ id, label, description, file, onSelect, error, required }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Object URLs are an external browser resource with a manual lifecycle (revoke on
    // cleanup), not derivable during render without leaking a URL on every re-render — the
    // effect + cleanup pairing here is correct despite the lint rule's general guidance.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const displayError = error ?? localError;

  function handleFiles(fileList: FileList | null) {
    const picked = fileList?.[0];
    if (!picked) return;
    const validationMessage = validateFile(picked);
    if (validationMessage) {
      setLocalError(validationMessage);
      onSelect(null);
      return;
    }
    setLocalError(undefined);
    onSelect(picked);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    handleFiles(event.dataTransfer.files);
  }

  function handleRemove() {
    setLocalError(undefined);
    onSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <span className="field-label" id={`${id}-label`}>
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </span>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPTED_IMAGE_EXTENSIONS}
        className="sr-only"
        tabIndex={-1}
        aria-labelledby={`${id}-label`}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {!file ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
            isDragOver ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50"
          } ${displayError ? "border-red-300 bg-red-50" : ""}`}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mx-auto flex flex-col items-center gap-2 text-sm"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
              <Upload className="h-4.5 w-4.5 text-slate-500" aria-hidden="true" />
            </span>
            <span className="font-medium text-slate-700">
              Click to upload <span className="font-normal text-slate-500">or drag and drop</span>
            </span>
          </button>
          <p className="mt-2 text-xs text-slate-500">{description}</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-14 w-14 flex-none rounded-lg object-cover ring-1 ring-slate-200"
            />
          ) : (
            <span className="flex h-14 w-14 flex-none items-center justify-center rounded-lg bg-slate-100">
              <ImageIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
            <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn-ghost px-2.5 py-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Replace
          </button>
          <button
            type="button"
            onClick={handleRemove}
            aria-label={`Remove ${label}`}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {displayError && (
        <p className="field-error" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
          <span>{displayError}</span>
        </p>
      )}
    </div>
  );
}
