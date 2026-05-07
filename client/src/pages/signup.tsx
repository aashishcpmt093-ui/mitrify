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
import { useLanguage } from "@/lib/language";
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
  const { t } = useLanguage();

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
        toast({ title: data.message || t("signupOtpFailToast"), variant: "destructive" });
        setStep("contact");
        return;
      }
      toast({ title: t("signupOtpSentToast") });
    } catch (err: any) {
      const msg = err?.code === "auth/too-many-requests"
        ? t("signupTooMany")
        : err?.code === "auth/invalid-phone-number"
          ? t("signupInvalidNumber")
          : t("signupOtpFailToast");
      toast({ title: msg, variant: "destructive" });
      setStep("contact");
    } finally {
      setOtpSending(false);
    }
  };

  const handleSendOtp = () => {
    if (!phone.trim()) {
      toast({ title: t("signupMobileRequired"), variant: "destructive" });
      return;
    }
    setStep("otp");
    sendOtpInBackground();
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.trim().length < 5) {
      toast({ title: t("signupEnter6Otp"), variant: "destructive" });
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
        toast({ title: t("signupServerVerifyFail"), variant: "destructive" });
        return;
      }
      toast({ title: t("signupMobileVerified") });
      setStep("credentials");
    } catch (err: any) {
      const msg = err?.code === "auth/invalid-verification-code"
        ? t("signupInvalidOtp")
        : err?.code === "auth/code-expired"
          ? t("signupOtpExpired")
          : t("signupVerifyFail");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!username.trim() || !password.trim()) {
      toast({ title: t("signupUserPwRequired"), variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: t("signupPwMismatch"), variant: "destructive" });
      return;
    }
    if (password.length < 4) {
      toast({ title: t("signupPwLen"), variant: "destructive" });
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
        toast({ title: data.message || t("signupRegFail"), variant: "destructive" });
        return;
      }
      // Save username so login page can autofill it
      localStorage.setItem("mitrify_saved_username", username.trim());
      markShowWelcomePopup();
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: t("signupAccountCreated") });
      setLocation("/provider/guided-setup");
    } catch {
      toast({ title: t("signupRegFail"), variant: "destructive" });
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
            else setLocation("/welcome");
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
        <h2 className="text-2xl font-bold mb-1" data-testid="text-signup-title">{t("signupCreateBtn")}</h2>
        <p className="text-muted-foreground mb-6 text-center text-sm">{t("signupSubtitle")}</p>

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
                    {t("signupContinueGoogle")}
                  </Button>
                </a>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">{t("signupOrMobile")}</span>
                </div>
              </div>

              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">{t("signupSecurityNote")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">
                      <Phone className="w-3.5 h-3.5 inline mr-1" />
                      {t("signupMobileLabel")}
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
                    <p className="text-xs text-muted-foreground">{t("signupMobileHint")}</p>
                  </div>

                  {/* Hidden reCAPTCHA container for Firebase */}
                  <div id="signup-send-otp-btn" style={{ position: "absolute", left: "-9999px" }} />

                  <Button
                    className="w-full"
                    onClick={handleSendOtp}
                    data-testid="button-send-otp"
                  >
                    <Phone className="w-4 h-4 mr-2" />{t("signupSendOtp")}
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
                  <p className="text-sm font-medium">{t("signupOtpSentTitle")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {otpSending ? (
                      <>{t("signupSendingTo")} <span className="font-medium text-foreground">{phone}</span>...</>
                    ) : (
                      <>{t("signupSentTo")} <span className="font-medium text-foreground">{phone}</span></>
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otp">{t("signupEnterOtp")}</Label>
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
                  {loading ? t("signupVerifying") : t("signupVerifyOtp")}
                </Button>
                <Button variant="ghost" className="w-full text-sm" onClick={() => { setStep("contact"); setOtp(""); }} disabled={loading} data-testid="button-resend-otp">
                  {t("signupChangeResend")}
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
                  <span>{phone} {t("signupVerifiedOk")}</span>
                </div>

                {/* Browser password manager form — autocomplete triggers save prompt */}
                <form
                  autoComplete="on"
                  onSubmit={(e) => { e.preventDefault(); handleSignup(); }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="username">{t("signupUsernameLabel")}</Label>
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t("signupUsernamePh")}
                      data-testid="input-signup-username"
                    />

                    {/* Username suggestions */}
                    {!username && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {t("signupSuggested")}
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
                    <Label htmlFor="password">{t("signupPwLabel")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("signupPwPh")}
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
                    <Label htmlFor="confirm-password">{t("signupConfirmPwLabel")}</Label>
                    <Input
                      id="confirm-password"
                      name="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t("signupConfirmPwPh")}
                      data-testid="input-signup-confirm-password"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                    data-testid="button-signup-submit"
                  >
                    {loading ? t("signupCreating") : t("signupCreateBtn")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="text-center">
            <Button variant="link" className="text-sm" onClick={() => setLocation("/welcome")} data-testid="button-goto-login">
              {t("signupAlreadyHave")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
