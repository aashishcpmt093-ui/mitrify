import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Eye, EyeOff, Phone, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { sendFirebaseOtp, verifyFirebaseOtp } from "@/lib/firebase";
import { markShowWelcomePopup } from "@/components/welcome-popup";
import logoImg from "@assets/772B17C5-7738-43B8-B5C0-04A7F2A6561B_1773842365564.png";

type Step = "contact" | "otp" | "credentials";

function generateUsernameSuggestions(phone: string): string[] {
  const digits = phone.replace(/\D/g, "").slice(-4);
  const prefix = phone.replace(/\D/g, "").slice(2, 5);
  return [
    `mitrify${digits}`,
    `mitra${prefix}${digits.slice(-2)}`,
    `user${digits}`,
    `seva${digits}`,
  ];
}

export default function SignupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("contact");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);

  const suggestions = useMemo(() => generateUsernameSuggestions(phone), [phone]);

  const sendOtpInBackground = async () => {
    setOtpSending(true);
    try {
      await sendFirebaseOtp(phone.trim(), "signup-send-otp-btn");
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: data.message || "Failed to send OTP", variant: "destructive" });
        setStep("contact");
        return;
      }
      toast({ title: "OTP sent to your mobile" });
    } catch (err: any) {
      const msg = err?.code === "auth/too-many-requests"
        ? "Too many attempts. Please try again later."
        : err?.code === "auth/invalid-phone-number"
          ? "Invalid number. Use format: +91XXXXXXXXXX"
          : "Failed to send OTP";
      toast({ title: msg, variant: "destructive" });
      setStep("contact");
    } finally {
      setOtpSending(false);
    }
  };

  const handleSendOtp = () => {
    if (!phone.trim()) {
      toast({ title: "Mobile number required", variant: "destructive" });
      return;
    }
    setStep("otp");
    sendOtpInBackground();
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.trim().length < 5) {
      toast({ title: "Enter 6-digit OTP", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await verifyFirebaseOtp(otp.trim());
      const res = await fetch("/api/otp/verify-firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phone.trim(), loginOnly: true }),
      });
      if (!res.ok) {
        toast({ title: "Server verification failed", variant: "destructive" });
        return;
      }
      toast({ title: "Mobile verified!" });
      setStep("credentials");
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

  const handleSignup = async () => {
    if (!username.trim() || !password.trim()) {
      toast({ title: "Username and password required", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 4) {
      toast({ title: "Password must be at least 4 characters", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/local/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Registration failed", variant: "destructive" });
        return;
      }
      // Save username so login page can autofill it
      localStorage.setItem("mitrify_saved_username", username.trim());
      markShowWelcomePopup();
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Account created successfully!" });
      setLocation("/select-role");
    } catch {
      toast({ title: "Registration failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step === "credentials") setStep("otp");
            else if (step === "otp") setStep("contact");
            else setLocation("/login");
          }}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 pt-2">
        <div className="w-14 h-14 mb-4">
          <img src={logoImg} alt="Mitrify" className="w-14 h-14 object-contain" />
        </div>
        <h2 className="text-2xl font-bold mb-1" data-testid="text-signup-title">Create Account</h2>
        <p className="text-muted-foreground mb-6 text-center text-sm">Join Mitrify to find or offer services</p>

        {/* Progress steps */}
        <div className="flex gap-2 mb-6">
          {["contact", "otp", "credentials"].map((s, i) => (
            <div
              key={s}
              className={`h-1.5 w-12 rounded-full transition-colors ${
                i <= ["contact", "otp", "credentials"].indexOf(step) ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="w-full max-w-sm space-y-4">

          {/* Step 1: Phone Number */}
          {step === "contact" && (
            <>
              <div className="space-y-3">
                <a href="/api/auth/google" className="block">
                  <Button className="w-full h-12" variant="outline" data-testid="button-signup-google">
                    <SiGoogle className="w-5 h-5 mr-2" />
                    Continue with Google
                  </Button>
                </a>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or sign up with mobile OTP</span>
                </div>
              </div>

              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">Mobile number verification is required for account security</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">
                      <Phone className="w-3.5 h-3.5 inline mr-1" />
                      Mobile Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      name="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 XXXXXXXXXX"
                      data-testid="input-signup-contact"
                    />
                    <p className="text-xs text-muted-foreground">Include country code, e.g. +91 for India</p>
                  </div>

                  {/* Hidden reCAPTCHA container for Firebase */}
                  <div id="signup-send-otp-btn" style={{ position: "absolute", left: "-9999px" }} />

                  <Button
                    className="w-full"
                    onClick={handleSendOtp}
                    data-testid="button-send-otp"
                  >
                    <Phone className="w-4 h-4 mr-2" />Send OTP
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* Step 2: OTP Verification */}
          {step === "otp" && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="text-center mb-2">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Phone className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">OTP Sent</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {otpSending ? (
                      <>Sending OTP to <span className="font-medium text-foreground">{phone}</span>...</>
                    ) : (
                      <>Verification code sent to <span className="font-medium text-foreground">{phone}</span></>
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otp">Enter 6-digit OTP</Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="● ● ● ● ● ●"
                    className="text-center text-lg tracking-widest font-semibold"
                    data-testid="input-signup-otp"
                  />
                </div>
                <Button className="w-full" onClick={handleVerifyOtp} disabled={loading} data-testid="button-verify-otp">
                  {loading ? "Verifying..." : "Verify OTP"}
                </Button>
                <Button variant="ghost" className="w-full text-sm" onClick={() => { setStep("contact"); setOtp(""); }} disabled={loading} data-testid="button-resend-otp">
                  Change Number / Resend OTP
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Set Username & Password */}
          {step === "credentials" && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{phone} verified successfully</span>
                </div>

                {/* Browser password manager form — autocomplete triggers save prompt */}
                <form
                  autoComplete="on"
                  onSubmit={(e) => { e.preventDefault(); handleSignup(); }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Choose a username"
                      data-testid="input-signup-username"
                    />

                    {/* Username suggestions */}
                    {!username && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Suggested usernames:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {suggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setUsername(s)}
                              className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                              data-testid={`chip-username-${s}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a password"
                        data-testid="input-signup-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-signup-password-visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      name="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      data-testid="input-signup-confirm-password"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                    data-testid="button-signup-submit"
                  >
                    {loading ? "Creating Account..." : "Create Account"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="text-center">
            <Button variant="link" className="text-sm" onClick={() => setLocation("/login")} data-testid="button-goto-login">
              Already have an account? Login
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
