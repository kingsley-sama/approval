'use client';
import { motion } from "framer-motion";
import sliderWebsite from "@/assets/slider-website.png";
import sliderFloorplan from "@/assets/slider-floorplan.png";
import sliderBrochure from "@/assets/slider-brochure.png";
import sliderInterior from "@/assets/slider-interior.png";
import sliderPresentation from "@/assets/slider-presentation.png";
import Image from "next/image";

const slides = [
  { image: sliderWebsite, label: "Live Websites" },
  { image: sliderFloorplan, label: "Floor Plans" },
  { image: sliderBrochure, label: "Brochures & PDFs" },
  { image: sliderInterior, label: "Interior Renderings" },
  { image: sliderPresentation, label: "Presentations" },
];

const UseCaseSlider = () => {
  const allSlides = [...slides, ...slides];

  return (
    <section className="py-24 surface-low overflow-hidden">
      <div className="container px-4 mb-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-xl mx-auto"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">
            Works on any image file type
          </h2>
          <p className="text-lg text-muted-foreground font-body">
            3D renderings, floor plans, Site Plans, — review them all in one place.
          </p>
        </motion.div>
      </div>

      <div className="relative">
        <div className="flex gap-5 animate-scroll-left hover:[animation-play-state:paused]" style={{ width: "max-content" }}>
          {allSlides.map((slide, i) => (
            <div key={i} className="shrink-0 w-72">
              <div className="rounded-2xl overflow-hidden bg-background border border-border hover:shadow-lg transition-shadow group">
                <div className="overflow-hidden">
                  <Image
                    src={slide.image}
                    alt={slide.label}
                    className="w-full h-48 object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                </div>
                <div className="p-4">
                  <p className="text-sm font-display font-semibold text-foreground">{slide.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCaseSlider;
