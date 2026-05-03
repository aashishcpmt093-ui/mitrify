import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { sendFirebaseOtp, verifyFirebaseOtp } from "@/lib/firebase";
import { useLanguage } from "@/lib/language";
import { BackButton } from "@/components/BackButton";
import logoImg from "@assets/772B17C5-7738-43B8-B5C0-04A7F2A6561B_1773842365564.png";

export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendOtpInBackground = async () => {
    setOtpSending(true);
    try {
      await sendFirebaseOtp(phone.trim(), "forgot-send-otp-btn");
      toast({ title: t("forgotOtpSentToast") });
    } catch (err: any) {
      const msg = err?.code === "auth/too-many-requests"
        ? t("signupTooMany")
        : err?.code === "auth/invalid-phone-number"
          ? t("signupInvalidNumber")
          : t("signupOtpFailToast");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setOtpSending(false);
    }
  };

  const handleSendOtp = () => {
    if (!phone.trim()) {
      toast({ title: t("forgotPhoneRequired"), variant: "destructive" });
      return;
    }
    setOtpSent(true);
    sendOtpInBackground();
  };

  const handleVerifyAndReset = async () => {
    if (!otp.trim()) {
      toast({ title: t("forgotEnterOtp"), variant: "destructive" });
      return;
    }
    if (!newPassword.trim() || newPassword.length < 4) {
      toast({ title: t("forgotPwLen"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await verifyFirebaseOtp(otp.trim());

      const res = await fetch("/api/local/reset-password-firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), newPassword: newPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || t("forgotResetFail"), variant: "destructive" });
        return;
      }
      toast({ title: t("forgotResetOk") });
      setLocation("/welcome");
    } catch (err: any) {
      const msg = err?.code === "auth/invalid-verification-code"
        ? t("signupInvalidOtp")
        : err?.code === "auth/code-expired"
          ? t("signupOtpExpired")
          : t("forgotResetFail");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="p-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/welcome")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 pt-4">
        <div className="w-14 h-14 mb-4">
          <img src={logoImg} alt="Mitrify" className="w-14 h-14 object-contain" />
        </div>
        <h2 className="text-2xl font-bold mb-1" data-testid="text-forgot-title">{t("forgotTitle")}</h2>
        <p className="text-muted-foreground mb-6 text-center text-sm">{t("forgotSubtitle")}</p>

        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">{t("forgotPhoneLabel")}</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 XXXXXXXXXX"
                  disabled={otpSent}
                  data-testid="input-forgot-phone"
                />
              </div>

              {otpSent && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {otpSending ? t("forgotSendingOtp") : `${t("forgotOtpSentTo")} ${phone}`}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="otp">{t("forgotOtpLabel")}</Label>
                    <Input
                      id="otp"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder={t("forgotOtpPh")}
                      maxLength={6}
                      inputMode="numeric"
                      data-testid="input-forgot-otp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">{t("forgotNewPwLabel")}</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t("forgotNewPwPh")}
                      data-testid="input-forgot-new-password"
                    />
                  </div>
                </>
              )}

              {!otpSent ? (
                <Button id="forgot-send-otp-btn" className="w-full" onClick={handleSendOtp} data-testid="button-forgot-send-otp">
                  {t("signupSendOtp")}
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button className="w-full" onClick={handleVerifyAndReset} disabled={loading} data-testid="button-forgot-reset">
                    {loading ? t("forgotResetting") : t("forgotResetBtn")}
                  </Button>
                  <Button variant="ghost" className="w-full text-sm" onClick={() => { setOtpSent(false); setOtp(""); }} data-testid="button-forgot-resend">
                    {t("forgotResendBtn")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-center mt-4">
            <Button
              variant="link"
              className="text-sm"
              onClick={() => setLocation("/welcome")}
              data-testid="button-back-to-login"
            >
              {t("forgotBackToLogin")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
