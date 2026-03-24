'use client';
import { motion } from "framer-motion";
import beforeAfter from "@/assets/before-after.png";
import Image from "next/image";

const ProblemSection = () => {
  return (
    <section className="py-24">
      <div className="container px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-xs font-medium uppercase tracking-widest text-accent mb-4">The Problem</p>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-6 text-balance leading-snug tracking-tight">
              "Managing feedback across emails, ClickUp, and screenshots was eating 80% of our project time."
            </h2>
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                <span className="text-accent text-xs font-display font-bold">TW</span>
              </div>
              <div className="text-left">
                <p className="font-display font-semibold text-foreground text-sm">Stylish Wolf</p>
                <p className="text-muted-foreground text-xs font-body">Project Manager, ExposéProfi</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="rounded-2xl overflow-hidden border border-border shadow-lg mb-12"
          >
            <Image
              src={beforeAfter}
              alt="Before: chaotic feedback. After: organized feedback in ProtoFlow"
              className="w-full"
            />
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="surface-low rounded-2xl p-8"
            >
              <h3 className="font-display font-bold text-foreground text-lg mb-4">Before ProtoFlow</h3>
              <ul className="space-y-3 text-muted-foreground text-sm font-body">
                <li className="flex items-start gap-3">
                  <span className="text-destructive mt-0.5 font-bold">✕</span>
                  Screenshots scattered across Slack & email
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-destructive mt-0.5 font-bold">✕</span>
                  Vague feedback leading to constant rework
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-destructive mt-0.5 font-bold">✕</span>
                  No single source of truth for revisions
                </li>
              </ul>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-primary rounded-2xl p-8"
            >
              <h3 className="font-display font-bold text-background text-lg mb-4">With ProtoFlow</h3>
              <ul className="space-y-3 text-background/70 text-sm font-body">
                <li className="flex items-start gap-3">
                  <span className="text-accent mt-0.5 font-bold">✓</span>
                  Feedback pinned directly on the image
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-accent mt-0.5 font-bold">✓</span>
                  Clear, contextual comments that save time
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-accent mt-0.5 font-bold">✓</span>
                  All revisions tracked in one organized place
                </li>
              </ul>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
