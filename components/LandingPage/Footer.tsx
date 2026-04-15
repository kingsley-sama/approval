import Image from "next/image";

const Footer = () => {
  return (
    <footer className="bg-white py-12 border-t-1 border-black/10 ">
      <div className="container px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden">
              <Image
                src="/logo.png"
                alt="Company logo"
                width={28}
                height={28}
                className="object-contain h-full w-full"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              — ExposéProfi
            </div>
          </div>
          <p className="text-sm text-black/60 font-body">© 2026 ExposéProfi. Internal use only.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
