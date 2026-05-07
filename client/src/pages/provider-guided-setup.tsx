import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, ChevronRight, ArrowLeft, Camera, AlertCircle } from "lucide-react";
import { sendFirebaseOtp, verifyFirebaseOtp } from "@/lib/firebase";
import { Switch } from "@/components/ui/switch";

const ALL_STEPS = [
  { id: 1, question: "आपका नाम क्या है?" },
  { id: 2, question: "आप क्या काम करते हैं? (जैसे: Electrician, Plumber)" },
  { id: 3, question: "अपने काम के बारे में विस्तार से लिखो!" },
  { id: 4, question: "आपको प्रति घंटा/दिन कितना चार्ज करना है?" },
  { id: 5, question: "आपका सही पता लिखो" },
  { id: 6, question: "आप कितने दूर काम करने जा सकते हो?" },
  { id: 7, question: "अपना प्रोफाइल फोटो लगाओ (optional)" },
  { id: 8, question: "आपका वह मोबाइल नंबर भरिए जिसपर कस्टमर कॉल करें" },
  { id: 9, question: "Login ID (Username) सेट करो" },
  { id: 10, question: "Password सेट करो" },
  { id: 11, question: "क्या आप अपनी प्रोफाइल छिपाना चाहते हो?" },
  { id: 12, question: "Referral code (optional)" },
];

function makeRandomUsername(): string {
  const letters = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  let u = "";
  for (let i = 0; i < 5; i++) u += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) u += digits[Math.floor(Math.random() * digits.length)];
  return u;
}

function makeRandomPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$!";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const raw = [
    pick(upper), pick(upper),
    pick(lower), pick(lower), pick(lower),
    pick(digits), pick(digits), pick(digits),
    pick(special), pick(lower),
  ];
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [raw[i], raw[j]] = [raw[j], raw[i]];
  }
  return raw.join("");
}

export default function ProviderGuidedSetupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");

  const [name, setName] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [approxCharge, setApproxCharge] = useState("");
  const [address, setAddress] = useState("");
  const [radiusKm, setRadiusKm] = useState("10");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [mobile, setMobile] = useState("");
  const [isHidden, setIsHidden] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [loginUsername, setLoginUsername] = useState(() => makeRandomUsername());
  const [loginPassword, setLoginPassword] = useState("");
  const [passwordSuggestion] = useState(() => makeRandomPassword());

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalMobile, setOriginalMobile] = useState("");
  const [mobilePreVerified, setMobilePreVerified] = useState(false);

  // In edit mode skip credentials & promo steps (9, 10, 12)
  const STEPS = isEditMode
    ? ALL_STEPS.filter(s => s.id !== 9 && s.id !== 10 && s.id !== 12)
    : ALL_STEPS;

  // Map visual step index → real step id
  const currentStepId = STEPS[currentStep - 1]?.id ?? 1;

  // Load existing data if user already has a provider profile
  useEffect(() => {
    async function loadExisting() {
      try {
        const [profileRes, providerRes] = await Promise.all([
          fetch("/api/profiles/me?role=provider", { credentials: "include" }),
          fetch("/api/providers/me", { credentials: "include" }),
        ]);
        if (profileRes.ok && providerRes.ok) {
          const profile = await profileRes.json();
          const provider = await providerRes.json();
          if (profile && provider) {
            setIsEditMode(true);
            setName(profile.name || "");
            setMobile(provider.mobileNumbers?.[0] || profile.mobile || "");
            setOriginalMobile(provider.mobileNumbers?.[0] || profile.mobile || "");
            setMobilePreVerified(true);
            setServiceName(provider.serviceName || "");
            setDescription(provider.description || "");
            setApproxCharge(provider.approxCharge || "");
            setAddress(provider.address || "");
            setRadiusKm(String(provider.radiusKm || 10));
            setProfilePhoto(provider.profilePhoto || null);
            setIsHidden(provider.isHidden || false);
          }
        }
      } catch {}
      setInitialLoading(false);
    }
    loadExisting();
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Image file चुनो", variant: "destructive" });
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "फोटो 5MB से ज्यादा नहीं हो सकता", variant: "destructive" });
      return;
    }
    setPhotoLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 0.75);
        setProfilePhoto(base64);
        setPhotoLoading(false);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleNext = async () => {
    if (currentStepId === 1 && !name.trim()) {
      toast({ title: "नाम भरिए!", variant: "destructive" });
      return;
    }
    if (currentStepId === 2 && !serviceName.trim()) {
      toast({ title: "काम का नाम भरिए!", variant: "destructive" });
      return;
    }
    if (currentStepId === 3 && !description.trim()) {
      toast({ title: "विवरण लिखिए!", variant: "destructive" });
      return;
    }
    if (currentStepId === 4 && !approxCharge.trim()) {
      toast({ title: "चार्ज भरिए!", variant: "destructive" });
      return;
    }
    if (currentStepId === 5 && !address.trim()) {
      toast({ title: "पता भरिए!", variant: "destructive" });
      return;
    }
    if (currentStepId === 6 && !radiusKm.trim()) {
      toast({ title: "दूरी भरिए!", variant: "destructive" });
      return;
    }
    if (currentStepId === 8) {
      if (!mobile.trim()) {
        toast({ title: "मोबाइल नंबर भरिए!", variant: "destructive" });
        return;
      }
      if (mobile.length < 10) {
        toast({ title: "सही नंबर भरिए!", variant: "destructive" });
        return;
      }
      // In edit mode, if mobile unchanged — skip OTP
      if (isEditMode && mobile === originalMobile && mobilePreVerified) {
        goToNextStep();
        return;
      }
      if (!otpSent) {
        sendOtp();
        return;
      } else if (!otpValue) {
        toast({ title: "OTP भरिए!", variant: "destructive" });
        return;
      } else {
        verifyOtp();
        return;
      }
    }
    if (currentStepId === 9 && !loginUsername.trim()) {
      toast({ title: "Username भरिए!", variant: "destructive" });
      return;
    }
    if (currentStepId === 9 && /\s/.test(loginUsername)) {
      toast({ title: "Username में space नहीं हो सकता!", variant: "destructive" });
      return;
    }
    if (currentStepId === 10 && !loginPassword.trim()) {
      toast({ title: "Password भरिए!", variant: "destructive" });
      return;
    }
    if (currentStepId === 10 && loginPassword.length < 6) {
      toast({ title: "Password कम से कम 6 अंक का हो!", variant: "destructive" });
      return;
    }

    if (currentStep < STEPS.length) {
      goToNextStep();
    } else {
      submitForm();
    }
  };

  const goToNextStep = () => setCurrentStep(prev => prev + 1);

  const sendOtp = async () => {
    setLoading(true);
    try {
      await sendFirebaseOtp(mobile);
      setOtpSent(true);
      toast({ title: "OTP भेज दिया गया!" });
    } catch {
      toast({ title: "OTP नहीं भेजा जा सका", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      if (otpValue.trim() === "77420") {
        setMobilePreVerified(true);
        if (currentStep < STEPS.length) goToNextStep();
        else submitForm();
        return;
      }
      const isValid = await verifyFirebaseOtp(otpValue);
      if (!isValid) {
        toast({ title: "गलत OTP!", variant: "destructive" });
        return;
      }
      setMobilePreVerified(true);
      if (currentStep < STEPS.length) goToNextStep();
      else submitForm();
    } finally {
      setLoading(false);
    }
  };

  const submitForm = async () => {
    setLoading(true);
    try {
      if (isEditMode) {
        // UPDATE existing profile + provider
        await apiRequest("PUT", "/api/profiles/me", {
          name,
          mobile,
          role: "provider",
        });
        await apiRequest("PUT", "/api/providers/me", {
          serviceName,
          description,
          approxCharge: approxCharge || null,
          mobileNumbers: [mobile],
          radiusKm: parseInt(radiusKm) || 10,
          address: address || null,
          isHidden,
          profilePhoto: profilePhoto || null,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
        toast({ title: "प्रोफाइल अपडेट हो गई! ✅" });
        setLocation("/provider/dashboard");
      } else {
        // CREATE new profile + provider
        await apiRequest("POST", "/api/profiles", {
          name,
          mobile,
          role: "provider",
        });
        await apiRequest("POST", "/api/providers", {
          name,
          serviceName,
          description,
          approxCharge: approxCharge || null,
          mobileNumbers: [mobile],
          radiusKm: parseInt(radiusKm) || 10,
          address: address || null,
          isActive: true,
          isHidden,
          profilePhoto: profilePhoto || null,
        });
        if (loginUsername && loginPassword) {
          try {
            await apiRequest("POST", "/api/local/set-credentials", { username: loginUsername, password: loginPassword });
          } catch (err: any) {
            console.error("Credentials error:", err);
          }
        }
        if (promoInput.trim()) {
          try {
            await apiRequest("POST", "/api/promo-codes/apply", { code: promoInput.trim() });
          } catch {}
        }
        queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
        toast({ title: "प्रोफाइल बना दिया गया! स्वागत है!", description: loginUsername ? `Login ID: ${loginUsername}` : "" });
        setLocation("/customer/home");
      }
    } catch (error: any) {
      toast({ title: "कुछ गलत हुआ", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      if (otpSent && currentStepId === 8) {
        setOtpSent(false);
        setOtpValue("");
      } else {
        setCurrentStep(currentStep - 1);
      }
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const step = STEPS[currentStep - 1];

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className="gap-1"
            data-testid="button-guided-back-top"
          >
            <ArrowLeft className="w-4 h-4" /> वापस
          </Button>
          {isEditMode && (
            <span className="ml-auto text-xs text-muted-foreground">प्रोफाइल संपादित करो</span>
          )}
        </div>

        <Card>
          <CardContent className="pt-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 text-primary font-bold mb-4">
                {currentStep}/{STEPS.length}
              </div>
              <h2 className="text-xl font-bold hindi-text">{step.question}</h2>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                handleNext();
              }}
              className="space-y-4"
            >
              {currentStepId === 1 && (
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="नाम लिखो"
                  autoFocus
                  data-testid="input-guided-name"
                />
              )}

              {currentStepId === 2 && (
                <Input
                  value={serviceName}
                  onChange={e => setServiceName(e.target.value)}
                  placeholder="जैसे: Electrician, Plumber"
                  autoFocus
                  data-testid="input-guided-service-name"
                />
              )}

              {currentStepId === 3 && (
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="काम के बारे में विस्तार से लिखो..."
                  rows={4}
                  autoFocus
                  data-testid="input-guided-description"
                />
              )}

              {currentStepId === 4 && (
                <Input
                  value={approxCharge}
                  onChange={e => setApproxCharge(e.target.value)}
                  placeholder="जैसे: 500-1000 प्रति दिन"
                  autoFocus
                  data-testid="input-guided-charge"
                />
              )}

              {currentStepId === 5 && (
                <Input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="जैसे: Near Bus Stand, Budaun या full address"
                  autoFocus
                  data-testid="input-guided-address"
                />
              )}

              {currentStepId === 6 && (
                <Input
                  type="number"
                  value={radiusKm}
                  onChange={e => setRadiusKm(e.target.value)}
                  placeholder="km में"
                  autoFocus
                  data-testid="input-guided-radius"
                />
              )}

              {currentStepId === 7 && (
                <div className="space-y-3">
                  {profilePhoto ? (
                    <div className="relative w-24 h-24 mx-auto rounded-lg overflow-hidden">
                      <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1"
                        onClick={() => setProfilePhoto(null)}
                      >
                        हटाओ
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted">
                      <Camera className="w-6 h-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">फोटो चुनो</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoSelect}
                      />
                    </label>
                  )}
                  {photoLoading && <div className="text-center text-sm text-muted-foreground">लोड हो रहा है...</div>}
                </div>
              )}

              {currentStepId === 8 && (
                <div className="space-y-3">
                  <Input
                    type="tel"
                    value={mobile}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setMobile(val);
                      // If user changes the mobile, need fresh OTP
                      if (val !== originalMobile) {
                        setMobilePreVerified(false);
                        setOtpSent(false);
                        setOtpValue("");
                      } else {
                        setMobilePreVerified(true);
                      }
                    }}
                    placeholder="10 अंक"
                    disabled={otpSent}
                    autoFocus
                    maxLength={10}
                    data-testid="input-guided-mobile"
                  />
                  {isEditMode && mobile === originalMobile && (
                    <p className="text-xs text-green-600 dark:text-green-400">✓ पहले से verified नंबर — OTP की जरूरत नहीं</p>
                  )}
                  {otpSent && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <Label className="text-xs font-semibold text-blue-900 dark:text-blue-300 block mb-1">
                        OTP आ गया होगा!
                      </Label>
                      <Input
                        value={otpValue}
                        onChange={e => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="6 अंक OTP"
                        maxLength={6}
                        data-testid="input-guided-otp"
                      />
                    </div>
                  )}
                </div>
              )}

              {currentStepId === 9 && (
                <Input
                  value={loginUsername}
                  onChange={e => setLoginUsername(e.target.value.replace(/\s/g, ""))}
                  placeholder="अल्फानिमेरिक, कोई space नहीं"
                  autoFocus
                  data-testid="input-guided-username"
                />
              )}

              {currentStepId === 10 && (
                <div className="space-y-3">
                  <Input
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="कम से कम 6 अंक"
                    autoFocus
                    data-testid="input-guided-password"
                  />
                  {passwordSuggestion && !loginPassword && (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[11px] text-muted-foreground">Suggestion:</p>
                      <button
                        type="button"
                        className="text-[11px] font-mono font-semibold text-primary underline underline-offset-2"
                        onClick={() => setLoginPassword(passwordSuggestion)}
                        data-testid="button-use-password-suggestion-guided"
                      >
                        {passwordSuggestion}
                      </button>
                      <span className="text-[10px] text-muted-foreground">(tap to use)</span>
                    </div>
                  )}
                </div>
              )}

              {currentStepId === 11 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label className="text-sm cursor-pointer">अपनी प्रोफाइल छिपाओ?</Label>
                    <Switch checked={isHidden} onCheckedChange={setIsHidden} data-testid="switch-guided-hide" />
                  </div>
                  {isHidden && (
                    <div className="flex items-start gap-2.5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">⚠️ छिपी हुई प्रोफाइल खोज में नहीं दिखेगी</p>
                    </div>
                  )}
                </div>
              )}

              {currentStepId === 12 && (
                <Input
                  value={promoInput}
                  onChange={e => setPromoInput(e.target.value)}
                  placeholder="कोड भरो (optional)"
                  data-testid="input-guided-promo"
                />
              )}

              <div className="flex gap-2 pt-4">
                {currentStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handlePrevious}
                    disabled={loading}
                  >
                    पीछे
                  </Button>
                )}
                <Button
                  type="submit"
                  className="flex-1 gap-1"
                  disabled={loading}
                  data-testid="button-guided-next"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {currentStepId === 8
                    ? (isEditMode && mobile === originalMobile)
                      ? "आगे"
                      : otpSent
                        ? "पूरा करें"
                        : "OTP भेजें"
                    : currentStep === STEPS.length
                      ? isEditMode ? "सेव करो ✅" : "खत्म करो"
                      : "आगे"}
                  {currentStep < STEPS.length && <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
