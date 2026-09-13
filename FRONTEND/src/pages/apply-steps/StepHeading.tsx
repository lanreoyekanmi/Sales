interface StepHeadingProps {
  title: string;
  description?: string;
}

export default function StepHeading({ title, description }: StepHeadingProps) {
  return (
    <div className="mb-6">
      <h2 id="wizard-step-heading" className="text-lg font-semibold text-slate-900">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
  );
}
