import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Hero from "../components/landing/Hero";
import HowItWorks from "../components/landing/HowItWorks";
import Eligibility from "../components/landing/Eligibility";
import SecuritySection from "../components/landing/SecuritySection";
import FinalCta from "../components/landing/FinalCta";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function LandingPage() {
  useDocumentTitle();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Eligibility />
        <SecuritySection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
