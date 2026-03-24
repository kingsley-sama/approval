"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { motion } from "framer-motion";

const VideoDemo = () => {
  const router = useRouter();

  return (
    <section id="demo" className="py-24 surface-low">
      <div className="container px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-4">
            See it in action
          </h2>
          <p className="text-lg text-muted-foreground max-w-md mx-auto font-body">
            Watch how the team uses ProtoFlow to streamline design reviews.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-4xl mx-auto mb-14"
        >
          <div className="rounded-2xl overflow-hidden bg-foreground/50 aspect-video flex items-center justify-center cursor-pointer group">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-primary/80 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Play className="w-8 h-8 text-accent-foreground ml-1" fill="currentColor" />
              </div>
              <p className="text-background font-display text-xl font-bold">Product Demo</p>
              <p className="text-background/40 text-sm mt-2 font-body">Video coming soon</p>
            </div>
          </div>
        </motion.div>

        <div className="text-center">
          <Button
            size="lg"
            onClick={() => router.push("/login")}
            className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-8 h-12 text-base font-display font-semibold gap-2"
          >
            Login to ProtoFlow <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default VideoDemo;
