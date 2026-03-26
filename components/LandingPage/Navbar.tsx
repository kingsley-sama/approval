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
          <div className="w-6 h-8 rounded-lg flex items-center justify-center">
            <Image
                src="/logo.png" 
                alt="Company logo" 
                width={20} 
                height={20} 
                className="object-contain" 
              />
          </div>
          <span className="font-display font-bold text-lg text-foreground"></span>
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
