import Spinner from "./Spinner";

export default function PageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <Spinner size={28} />
    </div>
  );
}
