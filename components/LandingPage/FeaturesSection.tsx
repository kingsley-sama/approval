'use client';
import { MessageSquare, Layers, Zap, Users } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: MessageSquare,
    title: "Contextual comments",
    description: "Add comments directly to images. The team sees exactly what you mean.",
  },
  {
    icon: Layers,
    title: "Duplicate Project",
    description: "Duplicate Projects easily. Chose what gets seen by others.",
  },
  {
    icon: Zap,
    title: "Real-time sync",
    description: "Changes appear instantly for everyone. No refresh needed.",
  },
  {
    icon: Users,
    title: "Team workspaces",
    description: "Organize projects by team or client. Keep everything tidy.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 surface-low">
      <div className="container px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-xl mx-auto"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-4">
            Built for our workflow
          </h2>
          <p className="text-lg text-muted-foreground font-body">
            Everything the team needs to review and iterate on prototypes.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="bg-background rounded-2xl p-8 border border-border hover:shadow-lg transition-shadow"
            >
              <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center mb-5">
                <feature.icon className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-lg font-display font-bold text-foreground mb-2">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed font-body text-sm">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
