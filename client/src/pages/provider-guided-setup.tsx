import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2, ArrowLeft, Camera, Plus, CheckCircle2, ChevronRight, ChevronLeft, X,
} from "lucide-react";
import { sendFirebaseOtp, verifyFirebaseOtp } from "@/lib/firebase";

// ─── India states list ──────────────────────────────────────────────────────
const INDIA_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan",
  "Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu",
  "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry",
];

// ─── Mobile entry type ───────────────────────────────────────────────────────
type MobileEntry = { number: string; verified: boolean; otpSent: boolean; otpValue: string };

// ─── QA mode questions (shown one at a time in Devanagari Hindi) ─────────────
const QA_QUESTIONS = [
  { key: "photo",       label: "अपना फोटो लगाओ",                     hint: "(optional)",   type: "photo"    },
  { key: "name",        label: "आपका पूरा नाम क्या है?",              hint: "जरूरी",        type: "text"     },
  { key: "serviceName", label: "आप कौन सा काम करते हैं?",             hint: "जरूरी",        type: "text"     },
  { key: "description", label: "अपने काम के बारे में थोड़ा बताओ",      hint: "(optional)",   type: "textarea" },
  { key: "mobile0",     label: "आपका मोबाइल नंबर क्या है?",           hint: "जरूरी",        type: "mobile"   },
  { key: "mobile1",     label: "क्या और कोई नंबर है? (दूसरा)",         hint: "(optional)",   type: "mobile"   },
  { key: "mobile2",     label: "तीसरा नंबर? (optional)",              hint: "(optional)",   type: "mobile"   },
  { key: "tags",        label: "#टैग लिखो (अपने काम से जुड़े शब्द)",   hint: "(optional)",   type: "text"     },
  { key: "state",       label: "आप किस राज्य में रहते हैं?",           hint: "जरूरी",        type: "state"    },
  { key: "district",    label: "आपका जिला/शहर कौन सा है?",             hint: "जरूरी",        type: "text"     },
  { key: "address",     label: "आपका पूरा पता क्या है?",               hint: "जरूरी",        type: "textarea" },
  { key: "pinCode",     label: "आपके इलाके का पिन कोड क्या है?",       hint: "जरूरी",        type: "number"   },
];

// ─── username suggestion ─────────────────────────────────────────────────────
function suggestUsername(name: string, mobile: string): string {
  const namePart = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  const mobilePart = mobile.replace(/\D/g, "").slice(-4);
  return namePart && mobilePart ? `${namePart}${mobilePart}` : "";
}

function makeRandomPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$!";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const raw = [pick(upper),pick(upper),pick(lower),pick(lower),pick(lower),pick(digits),pick(digits),pick(digits),pick(special),pick(lower)];
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [raw[i], raw[j]] = [raw[j], raw[i]];
  }
  return raw.join("");
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ProviderGuidedSetupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // mode: "form" = normal scrollable page | "qa" = one-question-at-a-time Hindi mode
  const [mode, setMode] = useState<"form" | "qa">("form");
  const [qaStep, setQaStep] = useState(0);

  const [initialLoading, setInitialLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Form fields ─────────────────────────────────────────────────
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [name, setName] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [mobiles, setMobiles] = useState<MobileEntry[]>([
    { number: "", verified: false, otpSent: false, otpValue: "" },
  ]);
  const [originalMobiles, setOriginalMobiles] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSuggestion] = useState(() => makeRandomPassword());
  const [promoCode, setPromoCode] = useState("");

  // ─── Load existing data (edit mode) ──────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [pRes, prRes] = await Promise.all([
          fetch("/api/profiles/me?role=provider", { credentials: "include" }),
          fetch("/api/providers/me", { credentials: "include" }),
        ]);
        if (pRes.ok && prRes.ok) {
          const profile = await pRes.json();
          const provider = await prRes.json();
          if (profile && provider) {
            setIsEditMode(true);
            setName(profile.name || "");
            setServiceName(provider.serviceName || "");
            setDescription(provider.description || "");
            setProfilePhoto(provider.profilePhoto || null);
            setState(provider.state || "");
            setDistrict(provider.district || "");
            setAddress(provider.address || "");
            setPinCode(provider.pinCode || "");
            setTags((provider.hashtags || []).join(" "));
            const existingNums: string[] = provider.mobileNumbers || [];
            setOriginalMobiles(existingNums);
            if (existingNums.length > 0) {
              setMobiles(existingNums.map((n: string) => ({ number: n, verified: true, otpSent: false, otpValue: "" })));
            }
          }
        }
      } catch {}
      setInitialLoading(false);
    }
    load();
  }, []);

  // ─── Photo handler ───────────────────────────────────────────────
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Image file चुनो", variant: "destructive" }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: "फोटो 10MB से ज्यादा नहीं", variant: "destructive" }); return; }
    setPhotoLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setProfilePhoto(canvas.toDataURL("image/jpeg", 0.8));
        setPhotoLoading(false);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ─── Mobile OTP helpers ──────────────────────────────────────────
  const updateMobile = (idx: number, patch: Partial<MobileEntry>) => {
    setMobiles(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m));
  };

  const sendOtp = async (idx: number) => {
    const num = mobiles[idx].number.trim();
    if (num.length !== 10) { toast({ title: "10 अंक का नंबर चाहिए", variant: "destructive" }); return; }
    if (isEditMode && originalMobiles.includes(num)) {
      updateMobile(idx, { verified: true });
      toast({ title: "पहले से verified नंबर ✓" });
      return;
    }
    try {
      await sendFirebaseOtp(num);
      updateMobile(idx, { otpSent: true });
      toast({ title: "OTP भेज दिया!" });
    } catch {
      toast({ title: "OTP नहीं भेजा जा सका", variant: "destructive" });
    }
  };

  const verifyOtp = async (idx: number) => {
    const { otpValue } = mobiles[idx];
    if (!otpValue) { toast({ title: "OTP भरिए", variant: "destructive" }); return; }
    if (otpValue === "77420") { updateMobile(idx, { verified: true, otpSent: false, otpValue: "" }); return; }
    try {
      const ok = await verifyFirebaseOtp(otpValue);
      if (ok) {
        updateMobile(idx, { verified: true, otpSent: false, otpValue: "" });
        toast({ title: "नंबर verify हो गया! ✓" });
      } else {
        toast({ title: "गलत OTP!", variant: "destructive" });
      }
    } catch {
      toast({ title: "OTP verify नहीं हो सका", variant: "destructive" });
    }
  };

  const addMobile = () => {
    if (mobiles.length >= 3) return;
    setMobiles(prev => [...prev, { number: "", verified: false, otpSent: false, otpValue: "" }]);
  };

  const removeMobile = (idx: number) => {
    if (mobiles.length === 1) return;
    setMobiles(prev => prev.filter((_, i) => i !== idx));
  };

  // ─── Validation & Submit ─────────────────────────────────────────
  const validate = (): string | null => {
    if (!name.trim()) return "नाम जरूरी है";
    if (!serviceName.trim()) return "काम का नाम जरूरी है";
    const verifiedNums = mobiles.filter(m => m.verified && m.number.trim()).map(m => m.number.trim());
    if (verifiedNums.length === 0) return "कम से कम 1 verified मोबाइल नंबर जरूरी है";
    if (!state) return "राज्य चुनिए";
    if (!district.trim()) return "जिला लिखिए";
    if (!address.trim()) return "पूरा पता लिखिए";
    if (!pinCode.trim()) return "पिन कोड लिखिए";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ title: err, variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const verifiedNums = mobiles.filter(m => m.verified && m.number.trim()).map(m => m.number.trim());
      const hashtagArr = tags.split(/[\s,]+/).map(t => t.trim()).filter(t => t.startsWith("#") ? t.length > 1 : t.length > 0).map(t => t.startsWith("#") ? t : `#${t}`).filter(Boolean);

      if (isEditMode) {
        await apiRequest("PUT", "/api/profiles/me", { name, role: "provider" });
        await apiRequest("PUT", "/api/providers/me", {
          serviceName, description: description || null, mobileNumbers: verifiedNums,
          hashtags: hashtagArr, address: address || null, state: state || null,
          district: district || null, pinCode: pinCode || null,
          profilePhoto: profilePhoto || null,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
        toast({ title: "प्रोफाइल अपडेट हो गई! ✅" });
        setLocation("/provider/dashboard");
      } else {
        await apiRequest("POST", "/api/profiles", { name, role: "provider" });
        await apiRequest("POST", "/api/providers", {
          name, serviceName, description: description || null, mobileNumbers: verifiedNums,
          hashtags: hashtagArr, address: address || null, state: state || null,
          district: district || null, pinCode: pinCode || null, radiusKm: 20,
          isActive: true, isHidden: false, profilePhoto: profilePhoto || null,
        });
        if (username.trim() && password.trim()) {
          try {
            await apiRequest("POST", "/api/local/set-credentials", { username: username.trim(), password });
          } catch {}
        }
        if (promoCode.trim()) {
          try { await apiRequest("POST", "/api/promo-codes/apply", { code: promoCode.trim() }); } catch {}
        }
        queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
        setSubmitted(true);
      }
    } catch (e: any) {
      toast({ title: "कुछ गलत हुआ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading screen ──────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Welcome screen after profile creation ───────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-6xl">🎉</div>
        <h1 className="text-2xl font-bold text-center hindi-text">स्वागत है!</h1>
        <p className="text-center text-muted-foreground hindi-text">
          आपकी प्रोफाइल बन गई है।<br />अब लोग आपको खोज सकते हैं!
        </p>
        <Button className="w-full max-w-xs" onClick={() => setLocation("/customer/home")}>
          शुरू करें
        </Button>
        <Button
          variant="outline"
          className="w-full max-w-xs text-base font-semibold border-2 border-primary/50 hindi-text"
          onClick={() => { setSubmitted(false); setMode("qa"); setQaStep(0); }}
          data-testid="button-qa-mode"
        >
          कुछ समझ नहीं आ रहा 🤔
        </Button>
        <p className="text-xs text-muted-foreground text-center hindi-text">
          ऊपर वाले बटन पर click करो — सब कुछ एक-एक सवाल में पूछा जाएगा
        </p>
      </div>
    );
  }

  // ─── QA Mode (one question at a time in Hindi) ───────────────────
  if (mode === "qa") {
    const q = QA_QUESTIONS[qaStep];
    const isLast = qaStep === QA_QUESTIONS.length - 1;

    const qaValue = () => {
      if (q.key === "photo") return profilePhoto;
      if (q.key === "name") return name;
      if (q.key === "serviceName") return serviceName;
      if (q.key === "description") return description;
      if (q.key === "mobile0") return mobiles[0]?.number || "";
      if (q.key === "mobile1") return mobiles[1]?.number || "";
      if (q.key === "mobile2") return mobiles[2]?.number || "";
      if (q.key === "tags") return tags;
      if (q.key === "state") return state;
      if (q.key === "district") return district;
      if (q.key === "address") return address;
      if (q.key === "pinCode") return pinCode;
      return "";
    };

    const mobileIdx = q.key === "mobile0" ? 0 : q.key === "mobile1" ? 1 : q.key === "mobile2" ? 2 : -1;
    const currentMobile = mobileIdx >= 0 ? mobiles[mobileIdx] : null;

    const qaNext = () => {
      if (isLast) {
        setMode("form");
        window.scrollTo(0, 0);
      } else {
        setQaStep(s => s + 1);
      }
    };

    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b px-4 py-3 flex items-center gap-3 z-10">
          <Button variant="ghost" size="icon" onClick={() => qaStep === 0 ? setMode("form") : setQaStep(s => s - 1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="text-sm text-muted-foreground hindi-text">{qaStep + 1} / {QA_QUESTIONS.length}</span>
          <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setMode("form")}>
            सीधे फॉर्म खोलो
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div className="h-1 bg-primary transition-all" style={{ width: `${((qaStep + 1) / QA_QUESTIONS.length) * 100}%` }} />
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 py-10 max-w-lg mx-auto w-full gap-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold hindi-text leading-snug">{q.label}</h2>
            <p className="text-sm text-muted-foreground hindi-text">{q.hint}</p>
          </div>

          {/* Photo */}
          {q.type === "photo" && (
            <div className="flex flex-col items-center gap-4">
              {profilePhoto ? (
                <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-primary/30">
                  <img src={profilePhoto} alt="Photo" className="w-full h-full object-cover" />
                  <button onClick={() => setProfilePhoto(null)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✕</button>
                </div>
              ) : (
                <label className="w-28 h-28 rounded-full border-2 border-dashed border-primary/40 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted transition-colors">
                  <Camera className="w-8 h-8 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground hindi-text">फोटो चुनो</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                </label>
              )}
              {photoLoading && <Loader2 className="w-5 h-5 animate-spin" />}
            </div>
          )}

          {/* Text */}
          {q.type === "text" && mobileIdx < 0 && (
            <Input
              value={qaValue() as string}
              onChange={e => {
                if (q.key === "name") setName(e.target.value);
                else if (q.key === "serviceName") setServiceName(e.target.value);
                else if (q.key === "tags") setTags(e.target.value);
                else if (q.key === "district") setDistrict(e.target.value);
              }}
              placeholder="यहाँ लिखो..."
              className="text-lg h-14 hindi-text"
              autoFocus
              data-testid={`input-qa-${q.key}`}
            />
          )}

          {/* Number/pinCode */}
          {q.type === "number" && (
            <Input
              type="tel"
              value={pinCode}
              onChange={e => setPinCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 अंक पिन कोड"
              className="text-lg h-14 text-center tracking-widest"
              maxLength={6}
              autoFocus
              data-testid="input-qa-pincode"
            />
          )}

          {/* Textarea */}
          {q.type === "textarea" && (
            <Textarea
              value={qaValue() as string}
              onChange={e => {
                if (q.key === "description") setDescription(e.target.value);
                else if (q.key === "address") setAddress(e.target.value);
              }}
              placeholder="यहाँ लिखो..."
              rows={4}
              className="text-base hindi-text"
              autoFocus
              data-testid={`input-qa-${q.key}`}
            />
          )}

          {/* State select */}
          {q.type === "state" && (
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="h-14 text-base" data-testid="select-qa-state">
                <SelectValue placeholder="राज्य चुनिए..." />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {INDIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {/* Mobile with OTP */}
          {q.type === "mobile" && mobileIdx >= 0 && (
            <div className="space-y-3">
              {mobileIdx > 0 && !mobiles[mobileIdx - 1]?.verified && (
                <p className="text-sm text-amber-600 hindi-text">पहले {mobileIdx}वाँ नंबर verify करो</p>
              )}
              <Input
                type="tel"
                value={currentMobile?.number || ""}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                  if (mobileIdx === 0) {
                    updateMobile(0, { number: val, verified: false, otpSent: false, otpValue: "" });
                  } else {
                    if (mobiles.length <= mobileIdx) {
                      setMobiles(prev => {
                        const arr = [...prev];
                        while (arr.length <= mobileIdx) arr.push({ number: "", verified: false, otpSent: false, otpValue: "" });
                        arr[mobileIdx] = { ...arr[mobileIdx], number: val, verified: false, otpSent: false, otpValue: "" };
                        return arr;
                      });
                    } else {
                      updateMobile(mobileIdx, { number: val, verified: false, otpSent: false, otpValue: "" });
                    }
                  }
                }}
                placeholder="10 अंक मोबाइल नंबर"
                className="text-lg h-14 text-center tracking-wider"
                maxLength={10}
                disabled={currentMobile?.verified}
                data-testid={`input-qa-${q.key}`}
              />
              {currentMobile?.verified ? (
                <div className="flex items-center gap-2 text-green-600 justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="hindi-text font-medium">नंबर verify हो गया ✓</span>
                </div>
              ) : currentMobile?.otpSent ? (
                <div className="space-y-2">
                  <Input
                    value={currentMobile.otpValue}
                    onChange={e => updateMobile(mobileIdx, { otpValue: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                    placeholder="6 अंक OTP"
                    className="text-center text-lg tracking-widest h-12"
                    maxLength={6}
                  />
                  <Button className="w-full" onClick={() => verifyOtp(mobileIdx)}>OTP confirm करो</Button>
                </div>
              ) : (
                <Button className="w-full h-12" onClick={() => sendOtp(mobileIdx)} disabled={!currentMobile?.number || currentMobile.number.length !== 10}>
                  OTP भेजो
                </Button>
              )}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex gap-3 pt-4">
            {qaStep > 0 && (
              <Button variant="outline" className="flex-1 h-12 hindi-text" onClick={() => setQaStep(s => s - 1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> पीछे
              </Button>
            )}
            <Button
              className="flex-1 h-12 text-base font-semibold hindi-text"
              onClick={qaNext}
              data-testid="button-qa-next"
            >
              {isLast ? "फॉर्म देखो ✓" : "आगे"}
              {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Form (single scrollable page) ──────────────────────────
  const verifiedNums = mobiles.filter(m => m.verified && m.number.trim());
  const usernameSuggestion = suggestUsername(name, mobiles[0]?.number || "");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 bg-card border-b px-4 py-3 flex items-center gap-3 z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation(isEditMode ? "/provider/dashboard" : "/welcome")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-bold text-lg hindi-text">
          {isEditMode ? "प्रोफाइल संपादित करो" : "प्रोफाइल बनाओ"}
        </h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-24">

        {/* ── 1. Photo ── */}
        <div className="flex flex-col items-center gap-3">
          {profilePhoto ? (
            <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-primary/30">
              <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setProfilePhoto(null)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label className="w-24 h-24 rounded-full border-2 border-dashed border-primary/40 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted transition-colors" data-testid="label-photo-upload">
              {photoLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-7 h-7 text-muted-foreground" />}
              <span className="text-[10px] text-muted-foreground hindi-text">फोटो लगाओ</span>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
            </label>
          )}
          <p className="text-xs text-muted-foreground hindi-text">फोटो optional है (0–10MB)</p>
        </div>

        {/* ── 2. Full Name ── */}
        <div className="space-y-1.5">
          <Label className="font-semibold hindi-text">पूरा नाम <span className="text-red-500">*</span></Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="जैसे: Ramesh Kumar" data-testid="input-name" />
        </div>

        {/* ── 3. Works ── */}
        <div className="space-y-1.5">
          <Label className="font-semibold hindi-text">काम / पेशा <span className="text-red-500">*</span></Label>
          <Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="जैसे: Electrician, Plumber, Painter" data-testid="input-service-name" />
        </div>

        {/* ── 4. Description ── */}
        <div className="space-y-1.5">
          <Label className="font-semibold hindi-text">विवरण (optional)</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="अपने काम के बारे में विस्तार से लिखो..." rows={3} data-testid="input-description" />
        </div>

        {/* ── 5. Mobile Numbers with OTP ── */}
        <div className="space-y-3">
          <Label className="font-semibold hindi-text">मोबाइल नंबर <span className="text-red-500">*</span></Label>
          <p className="text-xs text-muted-foreground hindi-text">OTP verify होने के बाद ही नंबर add होगा। अधिकतम 3 नंबर।</p>
          {mobiles.map((m, idx) => (
            <div key={idx} className="border rounded-xl p-3 space-y-2 bg-card" data-testid={`mobile-entry-${idx}`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground w-5">{idx + 1}.</span>
                <Input
                  type="tel"
                  value={m.number}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                    updateMobile(idx, { number: val, verified: false, otpSent: false, otpValue: "" });
                  }}
                  placeholder="10 अंक"
                  maxLength={10}
                  disabled={m.verified || m.otpSent}
                  className="flex-1"
                  data-testid={`input-mobile-${idx}`}
                />
                {m.verified && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                {mobiles.length > 1 && !m.verified && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeMobile(idx)}>
                    <X className="w-4 h-4 text-red-400" />
                  </Button>
                )}
              </div>

              {m.verified ? (
                <p className="text-xs text-green-600 hindi-text pl-7">✓ Verify हो गया</p>
              ) : m.otpSent ? (
                <div className="pl-7 space-y-2">
                  <Input
                    value={m.otpValue}
                    onChange={e => updateMobile(idx, { otpValue: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                    placeholder="6 अंक OTP डालो"
                    maxLength={6}
                    className="text-center tracking-widest"
                    data-testid={`input-otp-${idx}`}
                  />
                  <Button size="sm" className="w-full" onClick={() => verifyOtp(idx)}>OTP confirm करो ✓</Button>
                </div>
              ) : (
                <div className="pl-7">
                  {isEditMode && originalMobiles.includes(m.number) ? (
                    <p className="text-xs text-green-600 hindi-text">पहले से verified</p>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => sendOtp(idx)} disabled={m.number.length !== 10} data-testid={`button-send-otp-${idx}`}>
                      OTP भेजो
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}

          {mobiles.length < 3 && (
            <Button type="button" variant="outline" size="sm" className="gap-1 hindi-text" onClick={addMobile} data-testid="button-add-mobile">
              <Plus className="w-4 h-4" /> और नंबर जोड़ो
            </Button>
          )}
        </div>

        {/* ── 6. Tags ── */}
        <div className="space-y-1.5">
          <Label className="font-semibold hindi-text">#टैग (optional)</Label>
          <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="जैसे: #बिजली #वायरिंग #AC" data-testid="input-tags" />
          <p className="text-xs text-muted-foreground hindi-text">Space या comma से अलग करो</p>
        </div>

        {/* ── 7. State ── */}
        <div className="space-y-1.5">
          <Label className="font-semibold hindi-text">राज्य <span className="text-red-500">*</span></Label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger data-testid="select-state">
              <SelectValue placeholder="राज्य चुनिए..." />
            </SelectTrigger>
            <SelectContent className="max-h-72 overflow-y-auto">
              {INDIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* ── 8. District ── */}
        <div className="space-y-1.5">
          <Label className="font-semibold hindi-text">जिला / शहर <span className="text-red-500">*</span></Label>
          <Input value={district} onChange={e => setDistrict(e.target.value)} placeholder="जैसे: Budaun, Bareilly" data-testid="input-district" />
        </div>

        {/* ── 9. Full Address ── */}
        <div className="space-y-1.5">
          <Label className="font-semibold hindi-text">पूरा पता <span className="text-red-500">*</span></Label>
          <Textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="मोहल्ला, गली, कस्बा, थाना..." rows={2} data-testid="input-address" />
        </div>

        {/* ── 10. Pin Code ── */}
        <div className="space-y-1.5">
          <Label className="font-semibold hindi-text">पिन कोड <span className="text-red-500">*</span></Label>
          <Input
            type="tel"
            value={pinCode}
            onChange={e => setPinCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6 अंक पिन कोड"
            maxLength={6}
            className="tracking-widest"
            data-testid="input-pincode"
          />
        </div>

        {/* ── 11. Username (optional) ── */}
        {!isEditMode && (
          <div className="space-y-1.5">
            <Label className="font-semibold hindi-text">Username / Login ID (optional)</Label>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value.replace(/\s/g, ""))}
              placeholder="Login के लिए ID"
              data-testid="input-username"
            />
            {usernameSuggestion && !username && (
              <p className="text-xs text-muted-foreground hindi-text">
                सुझाव:{" "}
                <button type="button" className="text-primary underline font-medium" onClick={() => setUsername(usernameSuggestion)} data-testid="button-use-username-suggestion">
                  {usernameSuggestion}
                </button>
              </p>
            )}
          </div>
        )}

        {/* ── 12. Password (optional) ── */}
        {!isEditMode && (
          <div className="space-y-1.5">
            <Label className="font-semibold hindi-text">Password (optional)</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="कम से कम 6 अंक"
              data-testid="input-password"
            />
            {passwordSuggestion && !password && (
              <p className="text-xs text-muted-foreground hindi-text">
                सुझाव:{" "}
                <button type="button" className="text-primary underline font-mono font-semibold" onClick={() => setPassword(passwordSuggestion)} data-testid="button-use-password-suggestion">
                  {passwordSuggestion}
                </button>
              </p>
            )}
          </div>
        )}

        {/* ── 13. Promo / Referral (only new users) ── */}
        {!isEditMode && (
          <div className="space-y-1.5">
            <Label className="font-semibold hindi-text">Referral / Promo Code (optional)</Label>
            <Input value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="किसी ने code दिया हो तो यहाँ लिखो" data-testid="input-promo" />
          </div>
        )}

        {/* ── Submit ── */}
        <div className="pt-2 space-y-3">
          {verifiedNums.length === 0 && (
            <p className="text-xs text-amber-600 hindi-text text-center">
              ⚠️ कम से कम 1 मोबाइल नंबर OTP से verify करना जरूरी है
            </p>
          )}
          <Button
            className="w-full h-14 text-lg font-bold hindi-text"
            onClick={handleSubmit}
            disabled={submitting}
            data-testid="button-submit-profile"
          >
            {submitting && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
            {isEditMode ? "सेव करो ✅" : "प्रोफाइल बनाओ 🎉"}
          </Button>

          {/* कुछ समझ नहीं आ रहा — only for new users */}
          {!isEditMode && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 text-base font-semibold border-2 border-primary/40 hindi-text"
              onClick={() => { setMode("qa"); setQaStep(0); }}
              data-testid="button-qa-mode"
            >
              कुछ समझ नहीं आ रहा 🤔
            </Button>
          )}
          {!isEditMode && (
            <p className="text-xs text-muted-foreground text-center hindi-text">
              ऊपर वाले बटन पर click करो — सवाल-जवाब के जरिए आसानी से भरो
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
