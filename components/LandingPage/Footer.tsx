import Image from "next/image";

const Footer = () => {
  return (
    <footer className="bg-white py-12 border-t-1 border-black/10 ">
      <div className="container px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center">
              <Image 
                src="/logo.png" 
                alt="Company logo" 
                width={20} 
                height={20} 
                className="object-contain" 
              />
            </div>
            <span className="font-display font-bold text-black/70"></span>
          </div>
          <p className="text-sm text-black/60 font-body">© 2026 ExposéProfi. Internal use only.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
