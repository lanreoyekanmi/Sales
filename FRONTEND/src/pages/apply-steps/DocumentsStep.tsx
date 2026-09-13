import FileUpload from "../../components/apply/FileUpload";
import Alert from "../../components/ui/Alert";
import StepHeading from "./StepHeading";
import { formatFileSize } from "../../lib/format";
import { MAX_DOCUMENT_UPLOAD_SIZE_BYTES } from "../../lib/constants";
import type { VerificationFiles } from "../../api/applications";

interface DocumentsStepProps {
  files: Record<keyof VerificationFiles, File | null>;
  onFilesChange: (updater: (prev: Record<keyof VerificationFiles, File | null>) => Record<keyof VerificationFiles, File | null>) => void;
  error?: string;
}

export default function DocumentsStep({ files, onFilesChange, error }: DocumentsStepProps) {
  const sizeHint = `JPEG, PNG, or WEBP — up to ${formatFileSize(MAX_DOCUMENT_UPLOAD_SIZE_BYTES)}.`;

  function setFile(key: keyof VerificationFiles, file: File | null) {
    onFilesChange((prev) => ({ ...prev, [key]: file }));
  }

  return (
    <div>
      <StepHeading
        title="Identity verification"
        description="Upload clear photos so we can verify your identity. These are transmitted securely."
      />

      {error && (
        <div className="mb-5">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <FileUpload
          id="idCardImage"
          label="Government-issued ID"
          description={`A driver's license, passport, or state ID. ${sizeHint}`}
          file={files.idCardImage}
          onSelect={(file) => setFile("idCardImage", file)}
          required
        />
        <FileUpload
          id="ssnCardImage"
          label="Social Security card"
          description={`A clear photo of your Social Security card. ${sizeHint}`}
          file={files.ssnCardImage}
          onSelect={(file) => setFile("ssnCardImage", file)}
          required
        />
        <FileUpload
          id="selfieImage"
          label="Selfie"
          description={`A clear photo of your face, taken now. ${sizeHint}`}
          file={files.selfieImage}
          onSelect={(file) => setFile("selfieImage", file)}
          required
        />
      </div>
    </div>
  );
}
