import { useCallback, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import StepIndicator from "../components/apply/StepIndicator";
import PersonalInfoStep from "./apply-steps/PersonalInfoStep";
import ContactInfoStep from "./apply-steps/ContactInfoStep";
import EmploymentStep from "./apply-steps/EmploymentStep";
import LoanRequestStep from "./apply-steps/LoanRequestStep";
import LoanHistoryStep from "./apply-steps/LoanHistoryStep";
import DisbursementStep from "./apply-steps/DisbursementStep";
import DocumentsStep from "./apply-steps/DocumentsStep";
import ReviewStep from "./apply-steps/ReviewStep";
import SuccessScreen from "./apply-steps/SuccessScreen";
import Alert from "../components/ui/Alert";
import Spinner from "../components/ui/Spinner";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  applicationFormDefaultValues,
  applicationFormSchema,
  type ApplicationFormInput,
  type ApplicationFormValues,
} from "../lib/validation";
import { submitApplication, type VerificationFiles } from "../api/applications";
import { ApplicationApiError } from "../api/types";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WizardStepDef {
  id: string;
  label: string;
  fields: string[];
}

const WIZARD_STEPS: WizardStepDef[] = [
  { id: "personal", label: "Personal", fields: ["applicant.firstName", "applicant.lastName", "applicant.dateOfBirth", "applicant.gender"] },
  { id: "contact", label: "Contact", fields: ["applicant.email", "applicant.phoneNumber", "applicant.residentialAddress", "applicant.city", "applicant.state"] },
  { id: "employment", label: "Employment", fields: ["employment.employmentStatus", "employment.employerName", "employment.jobTitle", "employment.employmentDurationMonths", "employment.monthlyIncome", "employment.incomeFrequency"] },
  { id: "loan-request", label: "Loan request", fields: ["loanRequest.requestedLoanAmount", "loanRequest.loanPurpose", "loanRequest.preferredRepaymentPeriodMonths", "loanRequest.repaymentFrequency"] },
  { id: "loan-history", label: "Loan history", fields: ["loanHistory"] },
  { id: "disbursement", label: "Disbursement", fields: ["disbursement.preferredMethod", "disbursement.otherMethodDetails", "disbursement.bankDetails"] },
  { id: "documents", label: "Documents", fields: [] },
  { id: "review", label: "Review", fields: ["consent.termsAccepted", "consent.dataProcessingAccepted"] },
];

type SubmissionStatus = "idle" | "submitting" | "success" | "error";

const FIELD_TOP_KEY_TO_STEP: Record<string, string> = {
  applicant: "personal",
  employment: "employment",
  loanRequest: "loan-request",
  loanHistory: "loan-history",
  disbursement: "disbursement",
  consent: "review",
};

function emptyFiles(): Record<keyof VerificationFiles, File | null> {
  return { idCardImage: null, ssnCardImage: null, selfieImage: null };
}

export default function ApplyPage() {
  useDocumentTitle("Apply for a loan");

  const methods = useForm<ApplicationFormInput, unknown, ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema) as unknown as Resolver<ApplicationFormInput, unknown, ApplicationFormValues>,
    defaultValues: applicationFormDefaultValues,
    mode: "onTouched",
    shouldFocusError: true,
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [files, setFiles] = useState(emptyFiles);
  const [documentsError, setDocumentsError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [applicationId, setApplicationId] = useState<string | undefined>(undefined);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const topRef = useRef<HTMLDivElement>(null);

  const currentStep = WIZARD_STEPS[stepIndex];

  const scrollToTop = useCallback(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      setStepIndex(index);
      scrollToTop();
    },
    [scrollToTop]
  );

  const handleNext = useCallback(async () => {
    if (currentStep.id === "documents") {
      const missing = (Object.keys(files) as Array<keyof VerificationFiles>).filter((key) => !files[key]);
      if (missing.length > 0) {
        setDocumentsError("All three verification images are required to continue.");
        return;
      }
      setDocumentsError(undefined);
    } else if (currentStep.fields.length > 0) {
      const valid = await methods.trigger(currentStep.fields as never);
      if (!valid) return;
    }

    const next = Math.min(stepIndex + 1, WIZARD_STEPS.length - 1);
    setStepIndex(next);
    setFurthestIndex((f) => Math.max(f, next));
    scrollToTop();
  }, [currentStep, files, methods, stepIndex, scrollToTop]);

  const handleBack = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
    scrollToTop();
  }, [scrollToTop]);

  const resetAll = useCallback(() => {
    methods.reset(applicationFormDefaultValues);
    setFiles(emptyFiles());
    setDocumentsError(undefined);
    setStatus("idle");
    setSubmitError(undefined);
    setApplicationId(undefined);
    idempotencyKeyRef.current = crypto.randomUUID();
    setStepIndex(0);
    setFurthestIndex(0);
  }, [methods]);

  const onValidSubmit = useCallback(
    async (values: ApplicationFormValues) => {
      if (status === "submitting") return;

      const missing = (Object.keys(files) as Array<keyof VerificationFiles>).filter((key) => !files[key]);
      if (missing.length > 0) {
        setDocumentsError("All three verification images are required to continue.");
        goToStep(WIZARD_STEPS.findIndex((s) => s.id === "documents"));
        return;
      }

      setStatus("submitting");
      setSubmitError(undefined);

      try {
        const result = await submitApplication(values, files as VerificationFiles, idempotencyKeyRef.current);
        setApplicationId(result.applicationId);
        setStatus("success");
        methods.reset(applicationFormDefaultValues);
        setFiles(emptyFiles());
      } catch (err) {
        setStatus("error");
        if (err instanceof ApplicationApiError) {
          setSubmitError(err.message);

          if (err.fieldErrors?.length) {
            let firstStepWithError: number | undefined;
            for (const fieldError of err.fieldErrors) {
              const topKey = fieldError.field.split(".")[0];
              if (topKey === "idCardImage" || topKey === "ssnCardImage" || topKey === "selfieImage") {
                setDocumentsError(fieldError.message);
                firstStepWithError ??= WIZARD_STEPS.findIndex((s) => s.id === "documents");
                continue;
              }
              methods.setError(fieldError.field as never, { type: "server", message: fieldError.message });
              const stepId = FIELD_TOP_KEY_TO_STEP[topKey];
              const index = WIZARD_STEPS.findIndex((s) => s.id === stepId);
              if (index >= 0) firstStepWithError ??= index;
            }
            if (firstStepWithError !== undefined) {
              setFurthestIndex((f) => Math.max(f, firstStepWithError!));
              goToStep(firstStepWithError);
              return;
            }
          }
        } else {
          setSubmitError("Something went wrong while submitting your application. Please try again.");
        }
        goToStep(WIZARD_STEPS.findIndex((s) => s.id === "review"));
      }
    },
    [files, goToStep, methods, status]
  );

  const stepsForIndicator = useMemo(() => WIZARD_STEPS.map((s) => ({ id: s.id, label: s.label })), []);

  if (status === "success" && applicationId) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 bg-slate-50">
          <SuccessScreen applicationId={applicationId} onStartNew={resetAll} />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />
      <main className="flex-1">
        <div ref={topRef} className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Loan application</h1>
            <p className="mt-3 text-base font-medium text-slate-700">
              Your Loan Journey Starts Here:
            </p>
            <p className="mt-1 max-w-xl text-sm text-slate-500 mx-auto">
              Complete your application in a few simple steps. We’ll review your information and guide you through the next stage.
            </p>
          </div>

          <div className="card mb-6 p-4 sm:p-5">
            <StepIndicator
              steps={stepsForIndicator}
              currentIndex={stepIndex}
              furthestIndex={furthestIndex}
              onStepSelect={goToStep}
            />
          </div>

          <FormProvider {...methods}>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (currentStep.id === "review") {
                  void methods.handleSubmit(onValidSubmit)(e);
                }
              }}
              className="card animate-fade-in p-5 sm:p-8"
              aria-labelledby="wizard-step-heading"
            >
              {currentStep.id === "personal" && <PersonalInfoStep />}
              {currentStep.id === "contact" && <ContactInfoStep />}
              {currentStep.id === "employment" && <EmploymentStep />}
              {currentStep.id === "loan-request" && <LoanRequestStep />}
              {currentStep.id === "loan-history" && <LoanHistoryStep />}
              {currentStep.id === "disbursement" && <DisbursementStep />}
              {currentStep.id === "documents" && (
                <DocumentsStep files={files} onFilesChange={setFiles} error={documentsError} />
              )}
              {currentStep.id === "review" && (
                <ReviewStep files={files} onEditStep={goToStep} stepIdToIndex={(id) => WIZARD_STEPS.findIndex((s) => s.id === id)} />
              )}

              {status === "error" && submitError && currentStep.id === "review" && (
                <div className="mt-6">
                  <Alert variant="error" title="We couldn't submit your application">
                    {submitError}
                  </Alert>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={stepIndex === 0 || status === "submitting"}
                  className="btn-secondary disabled:invisible"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </button>

                {currentStep.id === "review" ? (
                  <button type="submit" disabled={status === "submitting"} className="btn-accent min-w-[9rem]">
                    {status === "submitting" ? (
                      <>
                        <Spinner size={16} />
                        Submitting…
                      </>
                    ) : (
                      "Submit application"
                    )}
                  </button>
                ) : (
                  <button type="button" onClick={() => void handleNext()} className="btn-primary">
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </form>
          </FormProvider>
        </div>
      </main>
      <Footer />
    </div>
  );
}
