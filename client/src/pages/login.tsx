import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Home, Zap, Phone, KeyRound, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { SiGoogle, SiApple } from "react-icons/si";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { sendFirebaseOtp, verifyFirebaseOtp } from "@/lib/firebase";
import { useLanguage, Language } from "@/lib/language";
import logoImg from "@assets/772B17C5-7738-43B8-B5C0-04A7F2A6561B_1773842365564.png";

async function enterGuestMode() {
  localStorage.removeItem("mitrify_auth_v1");
  queryClient.setQueryData(["/api/auth/user"], null);
  try { await fetch("/api/guest-mode", { method: "POST", credentials: "include" }); } catch {}
}

function postLoginPathFromResponse(data: { profileExists?: boolean; isProfileComplete?: boolean | null }): string {
  if (!data.profileExists) return "/provider/guided-setup";
  if (!data.isProfileComplete) return "/provider/complete-profile";
  return "/provider/dashboard";
}


const FIREBASE_DOMAIN_ERRORS = new Set([
  "auth/unauthorized-domain",
  "auth/invalid-app-credential",
  "auth/operation-not-allowed",
  "auth/app-not-authorized",
]);

type Tab = "social" | "password" | "otp";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, lang, setLang } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>("social");
  const [otpContact, setOtpContact] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpUnavailable, setOtpUnavailable] = useState(false);
  const [username, setUsername] = useState(() => localStorage.getItem("mitrify_saved_username") || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendOtpInBackground = async () => {
    setOtpSending(true);
    setOtpUnavailable(false);
    try {
      await sendFirebaseOtp(otpContact.trim(), "login-send-otp-btn");
      setOtpSent(true);
      toast({ title: "OTP sent to your mobile" });
    } catch (err: any) {
      const code = String(err?.code || "");
      if (FIREBASE_DOMAIN_ERRORS.has(code)) {
        setOtpUnavailable(true);
      } else if (code === "auth/too-many-requests") {
        toast({ title: err?.message || "Too many attempts. Try again later.", variant: "destructive" });
      } else if (code === "auth/invalid-phone-number") {
        toast({ title: err?.message || "Invalid number. Use format: +91XXXXXXXXXX", variant: "destructive" });
      } else {
        setOtpUnavailable(true);
        toast({ title: err?.message || "Failed to send OTP", variant: "destructive" });
      }
    } finally {
      setOtpSending(false);
    }
  };

  const handleSendOtp = () => {
    if (!otpContact.trim()) {
      toast({ title: "Mobile number required", variant: "destructive" });
      return;
    }
    sendOtpInBackground();
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      toast({ title: "Please enter OTP", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await verifyFirebaseOtp(otp.trim());
      const res = await fetch("/api/otp/verify-firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: otpContact.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Login failed", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation(postLoginPathFromResponse(data));
    } catch (err: any) {
      const msg = err?.code === "auth/invalid-verification-code"
        ? "Invalid OTP. Please check and try again."
        : err?.code === "auth/code-expired"
          ? "OTP expired. Please request a new one."
          : "Verification failed";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!username.trim() || !password.trim()) {
      toast({ title: "Username and password required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Login failed", variant: "destructive" });
        return;
      }
      localStorage.setItem("mitrify_saved_username", username.trim());
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation(postLoginPathFromResponse(data));
    } catch {
      toast({ title: "Login failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "social", label: "Social", icon: SiGoogle },
    { key: "password", label: "ID & Password", icon: KeyRound },
    { key: "otp", label: "Mobile OTP", icon: Phone },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="gradient-hero dark:gradient-hero-dark pt-4 pb-12 px-4 rounded-b-[2rem] relative overflow-hidden">
        <div className="absolute top-10 right-0 w-32 h-32 rounded-full bg-white/5 animate-float" />
        <div className="absolute -bottom-4 -left-6 w-20 h-20 rounded-full bg-white/10 animate-float delay-200" />

        <div className="relative z-10">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/home")} className="text-white/80" data-testid="button-home">
            <Home className="w-5 h-5" />
          </Button>

          <div className="flex flex-col items-center mt-2 mb-2">
            <div className="w-14 h-14 mb-3">
              <img src={logoImg} alt="Mitrify" className="w-14 h-14 object-contain" />
            </div>
            <h2 className="text-2xl font-bold text-white" data-testid="text-login-title">Welcome Back</h2>
            <p className="text-white/70 text-sm mt-1">Sign in to your Mitrify account</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 -mt-6">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="flex rounded-xl border bg-card p-1 mb-4 shadow-md">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setOtpSent(false); setOtp(""); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${tab.key}`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          <Card className="shadow-lg border-0 ring-1 ring-border/50">
            <CardContent className="pt-6">
              {activeTab === "social" && (
                <div className="space-y-3 animate-fade-in">
                  <a href="/api/auth/google" className="block">
                    <Button className="w-full py-3 font-medium" variant="outline" data-testid="button-login-google">
                      <SiGoogle className="w-5 h-5 mr-2 text-red-500" />
                      Continue with Google
                    </Button>
                  </a>
                  <a href="/api/auth/apple" className="block">
                    <Button className="w-full py-3 font-medium bg-black hover:bg-gray-900 text-white border-0 dark:bg-white dark:hover:bg-gray-100 dark:text-black" data-testid="button-login-apple">
                      <SiApple className="w-5 h-5 mr-2" />
                      Continue with Apple
                    </Button>
                  </a>
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Quick and secure login with your existing account
                  </p>
                </div>
              )}

              {activeTab === "password" && (
                <form
                  autoComplete="on"
                  onSubmit={(e) => { e.preventDefault(); handlePasswordLogin(); }}
                  className="space-y-4 animate-fade-in"
                >
                  <div className="space-y-2">
                    <Label htmlFor="username">Username / ID</Label>
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      data-testid="input-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        data-testid="input-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password-visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full font-semibold" disabled={loading} data-testid="button-login-password">
                    {loading ? "Logging in..." : "Login"}
                  </Button>
                  <div className="flex items-center justify-between">
                    <Button type="button" variant="link" className="text-sm px-0" onClick={() => setLocation("/forgot-password")} data-testid="button-forgot-password">
                      Forgot Password?
                    </Button>
                    <Button type="button" variant="link" className="text-sm px-0" onClick={() => setLocation("/signup")} data-testid="button-goto-signup">
                      New user? Sign Up
                    </Button>
                  </div>
                </form>
              )}

              {activeTab === "otp" && (
                <div className="space-y-4 animate-fade-in">
                  {/* Hidden reCAPTCHA container for Firebase */}
                  <div id="login-send-otp-btn" style={{ position: "absolute", left: "-9999px" }} />

                  {otpUnavailable ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                          Mobile OTP abhi available nahi hai
                        </p>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Please use <strong>ID & Password</strong> or <strong>Google login</strong> to sign in.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => { setActiveTab("password"); setOtpUnavailable(false); }}
                          data-testid="button-switch-to-password"
                        >
                          <KeyRound className="w-3.5 h-3.5 mr-1.5" />ID & Password
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => { setActiveTab("social"); setOtpUnavailable(false); }}
                          data-testid="button-switch-to-google"
                        >
                          Google Login
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="otpContact">Mobile Number</Label>
                        <Input
                          id="otpContact"
                          type="tel"
                          value={otpContact}
                          onChange={(e) => setOtpContact(e.target.value)}
                          placeholder="+91 XXXXXXXXXX"
                          disabled={otpSent}
                          data-testid="input-otp-contact"
                        />
                        <p className="text-xs text-muted-foreground">Enter your registered mobile number with country code</p>
                      </div>

                      {otpSent && (
                        <>
                          <p className="text-xs text-muted-foreground text-center">
                            {otpSending ? "Sending OTP..." : `OTP sent to ${otpContact}`}
                          </p>
                          <div className="space-y-2">
                            <Label htmlFor="otp">Enter OTP</Label>
                            <Input
                              id="otp"
                              value={otp}
                              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                              placeholder="Enter 6-digit OTP"
                              maxLength={6}
                              inputMode="numeric"
                              className="text-center text-lg tracking-widest font-semibold"
                              data-testid="input-otp"
                            />
                          </div>
                        </>
                      )}

                      {!otpSent ? (
                        <Button className="w-full font-semibold" onClick={handleSendOtp} data-testid="button-send-otp">
                          <Phone className="w-4 h-4 mr-2" />Send OTP
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <Button className="w-full font-semibold" onClick={handleVerifyOtp} disabled={loading} data-testid="button-verify-otp">
                            {loading ? "Verifying..." : "Verify & Login"}
                          </Button>
                          <Button variant="ghost" className="w-full text-sm" onClick={() => { setOtpSent(false); setOtp(""); setOtpUnavailable(false); }} data-testid="button-resend-otp">
                            Change Number / Resend OTP
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {activeTab !== "password" && (
            <div className="text-center mt-4">
              <Button variant="link" className="text-sm" onClick={() => setLocation("/signup")} data-testid="button-signup-link">
                Don't have an account? Sign Up
              </Button>
            </div>
          )}

          <div className="mt-4">
            <Button
              variant="ghost"
              className="w-full text-muted-foreground text-sm"
              onClick={async () => { await enterGuestMode(); setLocation("/customer/home"); }}
              data-testid="button-skip-login"
            >
              {t("skipForNow")}
            </Button>
          </div>

          {/* Language switcher */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {(["en", "hi", "hl"] as Language[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${lang === l ? "bg-primary text-primary-foreground shadow" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                data-testid={`button-lang-login-${l}`}
              >
                {l === "en" ? "EN" : l === "hi" ? "हिं" : "HL"}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 mt-2">
            <button onClick={() => setLocation("/about")} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-about">
              About Us
            </button>
            <span className="text-muted-foreground/50">|</span>
            <button onClick={() => setLocation("/terms")} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-terms">
              Terms & Conditions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
