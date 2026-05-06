import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Zap, LogIn, Shield, Moon, Sun, Sparkles, Phone, MapPin, UserCog, Eye } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useLanguage } from "@/lib/language";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import logoImg from "@assets/772B17C5-7738-43B8-B5C0-04A7F2A6561B_1773842365564.png";

async function enterGuestMode() {
  localStorage.removeItem("mitrify_auth_v1");
  queryClient.setQueryData(["/api/auth/user"], null);
  try { await fetch("/api/guest-mode", { method: "POST", credentials: "include" }); } catch {}
}

export default function WelcomePage() {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error === "google_auth_failed") {
      toast({
        title: "Google Login Failed",
        description: "Google se login nahi ho saka. Please email/password se try karein ya Google Cloud Console mein callback URL check karein.",
        variant: "destructive",
      });
    } else if (error === "apple_auth_failed") {
      toast({
        title: "Apple Login Failed",
        description: "Apple se login nahi ho saka. Please email/password se try karein.",
        variant: "destructive",
      });
    } else if (error === "session_error") {
      toast({
        title: "Session Error",
        description: "Login session save nahi ho saka. Please dobara try karein.",
        variant: "destructive",
      });
    }
    if (error) {
      window.history.replaceState({}, "", "/welcome");
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className={`absolute inset-0 ${theme === "dark" ? "gradient-hero-dark" : "gradient-hero"}`} />

      <div className="absolute top-20 -left-10 w-40 h-40 rounded-full bg-white/10 animate-float" />
      <div className="absolute top-40 right-0 w-28 h-28 rounded-full bg-white/5 animate-float delay-200" />
      <div className="absolute bottom-32 -left-6 w-24 h-24 rounded-full bg-white/5 animate-float delay-300" />
      <div className="absolute bottom-20 right-10 w-16 h-16 rounded-full bg-white/10 animate-float delay-100" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <div className="absolute top-4 right-4">
          <Button size="icon" variant="ghost" onClick={toggleTheme} className="text-white/80" data-testid="button-theme-toggle">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>

        {/* Promotional Banner */}
        <div className="w-full bg-gradient-to-r from-amber-400/20 via-yellow-400/20 to-amber-400/20 border-b border-amber-300/40 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center justify-center gap-6 flex-wrap">
              <div className="text-center">
                <p className="text-white font-bold text-base hindi-text">
                  अभी रजिस्टर करें और <span className="text-amber-300">20₹ क्रेडिट फ्री पाएं!</span>
                </p>
                <p className="text-white/80 text-xs mt-1 hindi-text">प्रोमोकोड: <span className="font-mono font-semibold text-amber-200">Newuser</span></p>
              </div>
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm px-6"
                onClick={() => setLocation("/signup")}
                data-testid="button-register-banner"
              >
                रजिस्टर करें
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="text-center mb-10 animate-fade-in">

            {/* Highlighted Hindi tagline — above logo */}
            <div className="mb-6 px-4">
              <div className="inline-block bg-amber-400 rounded-2xl px-5 py-3 shadow-lg shadow-amber-500/30 border-2 border-amber-300">
                <p className="text-gray-900 font-extrabold text-lg leading-snug hindi-text tracking-wide">
                  हम आपके ग्राहक डायरेक्टली बढ़ा सकते हैं!
                </p>
                <p className="text-gray-800 font-semibold text-base hindi-text mt-0.5">
                  आप क्या काम करते हो?
                </p>
              </div>
            </div>

            <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-6 animate-pulse-glow">
              <img src={logoImg} alt="Mitrify" className="w-24 h-24 object-contain drop-shadow-lg" />
            </div>
            <h1 className="text-5xl font-bold tracking-tight mb-3 text-white drop-shadow-md">Mitrify</h1>
            <p className="text-white/80 text-lg font-medium">Fast Service, Instant Connect.</p>
          </div>

          <div className="flex items-center gap-6 mb-10 animate-slide-up delay-100">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs text-white/70 font-medium">Nearby</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <Phone className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs text-white/70 font-medium">Instant Call</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs text-white/70 font-medium">Trusted</span>
            </div>
          </div>

          <div className="w-full max-w-sm space-y-3 animate-slide-up delay-200">
            <Button
              className="w-full py-4 text-base bg-white text-primary font-semibold shadow-xl"
              onClick={() => setLocation("/login")}
              data-testid="button-login"
            >
              <LogIn className="w-5 h-5 mr-2" />
              Login
            </Button>

            <Button
              className="w-full py-4 text-base bg-amber-400 hover:bg-amber-500 text-gray-900 font-semibold shadow-xl"
              onClick={() => setLocation("/signup")}
              data-testid="button-signup"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Sign Up
            </Button>

            <Button
              className="w-full py-4 text-base glass-card text-white font-medium border-0"
              variant="outline"
              onClick={() => setLocation("/coadmin/login")}
              data-testid="button-coadmin-login"
            >
              <UserCog className="w-5 h-5 mr-2" />
              Co-Admin Login
            </Button>

            <Button
              className="w-full py-2.5 text-sm text-white/80 font-medium border border-white/20 bg-white/5 hover:bg-white/10"
              variant="ghost"
              onClick={async () => { await enterGuestMode(); setLocation("/customer/home"); }}
              data-testid="button-guest-browse"
            >
              <Eye className="w-4 h-4 mr-2 opacity-70" />
              {t("skipForNow")}
            </Button>
          </div>

          <div className="flex items-center justify-center gap-3 mt-8 animate-fade-in delay-400">
            <button
              onClick={() => setLocation("/about")}
              className="text-xs text-white/50 hover:text-white/80 transition-colors"
              data-testid="link-about"
            >
              About Us
            </button>
            <span className="text-white/30">|</span>
            <button
              onClick={() => setLocation("/terms")}
              className="text-xs text-white/50 hover:text-white/80 transition-colors"
              data-testid="link-terms"
            >
              Terms & Conditions
            </button>
            <span className="text-white/30">|</span>
            <button
              onClick={() => setLocation("/admin/login")}
              className="text-xs text-white/50 hover:text-white/80 transition-colors flex items-center gap-1"
              data-testid="link-admin-login"
            >
              <Shield className="w-3 h-3" />
              Admin
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
