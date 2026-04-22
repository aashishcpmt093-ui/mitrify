import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Zap, Plus, X, CheckCircle2, Loader2, Phone } from "lucide-react";
import { sendFirebaseOtp, verifyFirebaseOtp } from "@/lib/firebase";
import { BackButton } from "@/components/BackButton";
import logoImg from "@assets/772B17C5-7738-43B8-B5C0-04A7F2A6561B_1773842365564.png";

export default function CustomerSetupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [mobileNumbers, setMobileNumbers] = useState<string[]>([]);
  const [promoInput, setPromoInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);

  const [newNumber, setNewNumber] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [showAddNumber, setShowAddNumber] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/profiles/me?role=customer", { credentials: "include" });
        if (res.ok) {
          const profile = await res.json();
          if (profile && profile.name) {
            setLocation("/customer/home");
            return;
          }
        }
      } catch {}

      try {
        const res = await fetch("/api/local/user", { credentials: "include" });
        if (res.ok) {
          const userData = await res.json();
          if (userData.username) setName(userData.username);
          if (userData.phone) setMobileNumbers([userData.phone]);
        }
      } catch {}

      setCheckingProfile(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLng(pos.coords.longitude);
      },
      () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setGpsLat(pos.coords.latitude);
            setGpsLng(pos.coords.longitude);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  const sendOtpInBackground = async (num: string) => {
    setOtpSending(true);
    try {
      await sendFirebaseOtp(num, "customer-add-number-btn");
      toast({ title: "OTP sent to " + num });
    } catch (err: any) {
      const msg = err?.code === "auth/too-many-requests"
        ? "Too many attempts. Try again later."
        : err?.code === "auth/invalid-phone-number"
          ? "Invalid number. Use format: +91XXXXXXXXXX"
          : "Failed to send OTP";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setOtpSending(false);
    }
  };

  const handleSendOtp = () => {
    const num = newNumber.trim();
    if (!num) {
      toast({ title: "Enter a mobile number", variant: "destructive" });
      return;
    }
    if (mobileNumbers.includes(num)) {
      toast({ title: "Number already added", variant: "destructive" });
      return;
    }
    setOtpSent(true);
    sendOtpInBackground(num);
  };

  const handleVerifyOtp = async () => {
    if (!otpValue.trim() || otpValue.trim().length < 5) {
      toast({ title: "Enter 6-digit OTP", variant: "destructive" });
      return;
    }
    setOtpLoading(true);
    try {
      await verifyFirebaseOtp(otpValue.trim());
      setMobileNumbers(prev => [...prev, newNumber.trim()]);
      setNewNumber("");
      setOtpValue("");
      setOtpSent(false);
      setShowAddNumber(false);
      toast({ title: "Number verified and added!" });
    } catch (err: any) {
      const msg = err?.code === "auth/invalid-verification-code"
        ? "Invalid OTP. Please check and try again."
        : err?.code === "auth/code-expired"
          ? "OTP expired. Request a new one."
          : "Verification failed";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const removeNumber = (index: number) => {
    setMobileNumbers(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const profileData: any = {
        name,
        mobile: mobileNumbers[0] || null,
        role: "customer",
      };
      if (gpsLat !== null && gpsLng !== null) {
        profileData.latitude = gpsLat;
        profileData.longitude = gpsLng;
      }
      await apiRequest("POST", "/api/profiles", profileData);

      if (promoInput.trim()) {
        try {
          await apiRequest("POST", "/api/promo-codes/apply", { code: promoInput.trim() });
          toast({ title: "Promo code applied!" });
        } catch {
          toast({ title: "Promo code invalid", variant: "destructive" });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      setLocation("/customer/home");
    } catch (error: any) {
      toast({ title: "Setup failed", description: "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-14 h-14 mb-4">
        <img src={logoImg} alt="Mitrify" className="w-14 h-14 object-contain" />
      </div>
      <h2 className="text-xl font-bold mb-1">Complete Your Profile</h2>
      <p className="text-muted-foreground mb-6 text-sm">Set up your customer account</p>

      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" data-testid="input-name" />
            </div>

            <div className="space-y-2">
              <Label>Mobile Numbers</Label>
              {mobileNumbers.length > 0 && (
                <div className="space-y-1.5">
                  {mobileNumbers.map((num, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2" data-testid={`number-item-${i}`}>
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm flex-1">{num}</span>
                      {i > 0 && (
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeNumber(i)} data-testid={`button-remove-number-${i}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!showAddNumber ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAddNumber(true)}
                  data-testid="button-add-number"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {mobileNumbers.length === 0 ? "Add Mobile Number" : "Add Other Number"}
                </Button>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="pt-4 pb-3 space-y-3">
                    <div className="flex gap-2">
                      <Input
                        value={newNumber}
                        onChange={e => setNewNumber(e.target.value)}
                        placeholder="+91 XXXXXXXXXX"
                        disabled={otpSent}
                        data-testid="input-new-number"
                      />
                      {!otpSent && (
                        <Button id="customer-add-number-btn" type="button" size="sm" onClick={handleSendOtp} disabled={otpLoading} data-testid="button-send-number-otp">
                          {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send OTP"}
                        </Button>
                      )}
                    </div>
                    {otpSent && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{otpSending ? "Sending OTP..." : `OTP sent to ${newNumber}`}</p>
                        <div className="flex gap-2">
                          <Input
                            value={otpValue}
                            onChange={e => setOtpValue(e.target.value.replace(/\D/g, ""))}
                            placeholder="Enter 6-digit OTP"
                            maxLength={6}
                            inputMode="numeric"
                            className="text-center tracking-widest"
                            data-testid="input-number-otp"
                          />
                          <Button type="button" size="sm" onClick={handleVerifyOtp} disabled={otpLoading} data-testid="button-verify-number-otp">
                            {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                          </Button>
                        </div>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => { setShowAddNumber(false); setOtpSent(false); setNewNumber(""); setOtpValue(""); }}
                      data-testid="button-cancel-add-number"
                    >
                      Cancel
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="promo">Referral Code (optional)</Label>
              <Input id="promo" value={promoInput} onChange={e => setPromoInput(e.target.value)} placeholder="Enter promo code" list="promo-suggestions" data-testid="input-promo" />
              <datalist id="promo-suggestions">
                <option value="Newuser" />
              </datalist>
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit-profile">
              {loading ? "Setting up..." : "Get Started"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
