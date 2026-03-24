const Footer = () => {
  return (
    <footer className="bg-white py-12 border-t-1 border-black/10 ">
      <div className="container px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-accent-foreground font-display font-bold text-xs">EP</span>
            </div>
            <span className="font-display font-bold text-black/70">ProtoFlow</span>
          </div>
          <p className="text-sm text-black/60 font-body">© 2026 ExposéProfi. Internal use only.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
