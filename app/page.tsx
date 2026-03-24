import Navbar from "@/components/LandingPage/Navbar";
import HeroSection from "@/components/LandingPage/HeroSection";
import UseCaseSlider from "@/components/LandingPage/UseCaseSlider";
import ProblemSection from "@/components/LandingPage/ProblemSection";
import FeaturesSection from "@/components/LandingPage/FeaturesSection";
import HowItWorksSection from "@/components/LandingPage/HowItWorksSection";
import FeatureShowcase from "@/components/LandingPage/FeatureShowcase";
import VideoDemo from "@/components/LandingPage/VideoDemo";
import Footer from "@/components/LandingPage/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <UseCaseSlider />
      <ProblemSection />
      <FeaturesSection />
      <HowItWorksSection />
      <FeatureShowcase />
      <VideoDemo />
      <Footer />
    </div>
  );
};

export default Index;