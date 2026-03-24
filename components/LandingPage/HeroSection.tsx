'use client';
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image"; 
import { motion } from "framer-motion";
import heroProduct from "@/assets/hero-product.png";

const HeroSection = () => {
  const router = useRouter();

  return (
    <section className="pt-32 pb-20 px-4">
      <div className="container">
        {/* Centered hero text */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            — ExposéProfi
          </div>

          <h1 className="font-display text-4xl lg:text-6xl font-800 leading-[1.05] tracking-tight text-foreground mb-6 text-balance">
            Proof faster, Proof together
          </h1>

          <p className="font-body text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
            Drop feedback directly on designs, 3D renderings, and documents. Streamline approvals and keep everyone in sync with real-time collaboration.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => router.push("/login")}
              className="bg-primary text-accent-foreground hover:bg-accent/90 rounded-full px-8 h-12 text-base font-display font-semibold gap-2"
            >
              Login to get started <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full px-8 h-12 text-base font-display font-medium"
              onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
            >
              Watch demo
            </Button>
          </div>
        </motion.div>

        {/* Product screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          className="max-w-5xl mx-auto"
        >
          <div className="rounded-2xl overflow-hidden border border-border shadow-2xl shadow-foreground/5">
            <Image
              src={heroProduct}
              alt="ProtoFlow interface showing team collaboration on real estate designs"
              className="w-full"
            />
          </div>
        </motion.div>

        {/* Social proof strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-16 flex flex-row sm:flex-row items-center justify-center gap-8 text-center"
        >
          <div>
            <p className="font-display text-3xl font-bold text-foreground">80%</p>
            <p className="text-xs text-muted-foreground font-body">faster approvals</p>
          </div>
          <div className="hidden sm:block w-px h-10 bg-border" />
          <div>
            <p className="font-display text-3xl font-bold text-foreground">3x</p>
            <p className="text-xs text-muted-foreground font-body">fewer revision rounds</p>
          </div>
          <div className="hidden sm:block w-px h-10 bg-border" />
          <div>
            <p className="font-display text-3xl font-bold text-foreground">100%</p>
            <p className="text-xs text-muted-foreground font-body">team adoption</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
