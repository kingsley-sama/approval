'use client';
import { motion } from "framer-motion";

const steps = [
  { number: "01", title: "Upload your prototype", description: "Drag and drop any file — Figma exports, images, PDFs, or paste a live URL." },
  { number: "02", title: "Review with the team", description: "Drop comments directly on the design. Tag colleagues and assign action items." },
  { number: "03", title: "Iterate and ship", description: "Resolve feedback, track changes, and push final designs to production." },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="py-24">
      <div className="container px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-4">
            How it works
          </h2>
          <p className="text-lg text-muted-foreground font-body">Three steps to faster feedback.</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="text-center"
            >
              <span className="font-display text-6xl font-800 text-accent/15 block mb-4">{step.number}</span>
              <h3 className="text-lg font-display font-bold text-foreground mb-3">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed font-body text-sm">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
