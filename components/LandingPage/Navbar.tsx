'use client';
import { Button } from "@/components/ui/button";
import Image from "next/image";
import  {useRouter} from "next/navigation";

const Navbar = () => {
  const router = useRouter();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border flex items-center justify-center h-16">
      <div className="container flex items-center justify-between h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
            <Image
                src="/logo.png"
                alt="Company logo"
                width={32}
                height={32}
                className="object-contain h-full w-full"
              />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            — ExposéProfi
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
          <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it works</a>
          <a href="#demo" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Demo</a>
        </div>

        <Button
          size="sm"
          onClick={() => router.push("/login")}
          className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-6"
        >
          Sign in
        </Button>
      </div>
    </nav>
  );
};

export default Navbar;
