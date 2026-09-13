import { Link } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function NotFoundPage() {
  useDocumentTitle("Page not found");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <p className="text-sm font-semibold text-teal-700">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link to="/" className="btn-primary mt-8">
          Back to home
        </Link>
      </main>
      <Footer />
    </div>
  );
}
