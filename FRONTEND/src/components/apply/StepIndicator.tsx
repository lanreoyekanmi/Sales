import { Check } from "lucide-react";

export interface WizardStep {
  id: string;
  label: string;
}

interface StepIndicatorProps {
  steps: WizardStep[];
  currentIndex: number;
  furthestIndex: number;
  onStepSelect: (index: number) => void;
}

export default function StepIndicator({ steps, currentIndex, furthestIndex, onStepSelect }: StepIndicatorProps) {
  const total = steps.length;
  const progressPercent = Math.round((currentIndex / (total - 1)) * 100);

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-slate-500 sm:hidden">
        <span>
          Step {currentIndex + 1} of {total}
        </span>
        <span className="text-slate-700">{steps[currentIndex].label}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 sm:hidden">
        <div
          className="h-full rounded-full bg-teal-700 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <ol className="hidden flex-wrap items-start gap-x-2 gap-y-3 sm:flex" aria-label="Application progress">
        {steps.map((step, index) => {
          const isComplete = index < furthestIndex;
          const isCurrent = index === currentIndex;
          const isReachable = index <= furthestIndex;

          return (
            <li key={step.id} className="flex items-center">
              <button
                type="button"
                onClick={() => isReachable && onStepSelect(index)}
                disabled={!isReachable}
                aria-current={isCurrent ? "step" : undefined}
                className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-xs font-medium transition-colors ${
                  isCurrent
                    ? "bg-slate-900 text-white"
                    : isComplete
                      ? "text-teal-700 hover:bg-teal-50"
                      : "text-slate-400"
                } ${isReachable ? "cursor-pointer" : "cursor-not-allowed"}`}
              >
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] ${
                    isCurrent
                      ? "bg-white text-slate-900"
                      : isComplete
                        ? "bg-teal-100 text-teal-700"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isComplete ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
                </span>
                <span className="hidden lg:inline">{step.label}</span>
              </button>
              {index < total - 1 && <span className="mx-1 h-px w-3 flex-none bg-slate-200" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
