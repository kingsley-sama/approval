'use client';
import { motion } from "framer-motion";
import featureSync from "@/assets/feature-sync.png";
import featureResolved from "@/assets/feature-resolved.png";
import { Clock, Tag, MonitorSmartphone, PenLine, Pause } from "lucide-react";
import Image from "next/image";

const miniFeatures = [
  { icon: Pause, title: "Pause comments", desc: "Keep the team focused." },
  { icon: Clock, title: "Set deadlines", desc: "Schedule due dates." },
  { icon: Tag, title: "Organize with tags", desc: "Custom labels for tracking." },
  { icon: MonitorSmartphone, title: "Test responsiveness", desc: "Review across sizes." },
  { icon: PenLine, title: "Edit copy live", desc: "Text changes in one click." },
];

const FeatureShowcase = () => {
  return (
    <section className="py-24">
      <div className="container px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14 max-w-xl mx-auto"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground tracking-tight">
            5 ways to speed up approvals
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-4xl mx-auto mb-24">
          {miniFeatures.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="surface-low rounded-2xl p-5 text-center hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
                <f.icon className="w-4 h-4 text-accent" />
              </div>
              <h3 className="font-display font-bold text-foreground text-sm mb-1">{f.title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed font-body">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Feature: Sync */}
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-24 max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
              Turn comments into tasks
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6 font-body">
              Comments sync directly to your project management tools. No extra steps needed.
            </p>
            <div className="surface-low rounded-xl p-5 inline-block">
              <p className="text-sm text-foreground font-body italic">
                "We cut our approval time in half."
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-body">— Design Team Lead</p>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="rounded-2xl overflow-hidden border border-border shadow-lg"
          >
            <Image src={featureSync} alt="Comments syncing to project management tools" className="w-full" />
          </motion.div>
        </div>

        {/* Feature: Inbox zero */}
        <div className="grid lg:grid-cols-2 gap-16 items-center max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="order-2 lg:order-1 rounded-2xl overflow-hidden border border-border shadow-lg"
            >
              <Image src={featureResolved} alt="All feedback resolved" className="w-full" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="order-1 lg:order-2"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
              Resolve until inbox zero
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed font-body">
              Track progress visually and celebrate when everything is approved. Zero confusion.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default FeatureShowcase;
