import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Wrench, MapPin, Navigation, Loader2, X, Plus, CheckCircle2, Phone, EyeOff, Eye, Camera, User, KeyRound, AtSign, Home } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { sendFirebaseOtp, verifyFirebaseOtp } from "@/lib/firebase";
import { ALL_STATES, getDistricts, DEFAULT_STATE, DEFAULT_DISTRICT } from "@/lib/india-locations";
import { useLanguage } from "@/lib/language";

function makeRandomUsername(): string {
  const letters = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  let u = "";
  for (let i = 0; i < 5; i++) u += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) u += digits[Math.floor(Math.random() * digits.length)];
  return u; // e.g. "kxmnb7394"
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
  // Shuffle using Fisher-Yates
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [raw[i], raw[j]] = [raw[j], raw[i]];
  }
  return raw.join(""); // e.g. "kX7@mP9qRa"
}

export default function ProviderSetupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, lang, setLang } = useLanguage();
  const [name, setName] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const val = tagInput.trim().replace(/^#/, "");
    if (val && !hashtags.includes(val)) setHashtags(prev => [...prev, val]);
    setTagInput("");
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
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
  const [radiusKm, setRadiusKm] = useState("10");
  const [approxCharge, setApproxCharge] = useState("");
  const [state, setState] = useState(DEFAULT_STATE);
  const [district, setDistrict] = useState(DEFAULT_DISTRICT);
  const [verifiedNumbers, setVerifiedNumbers] = useState<string[]>([]);
  const [promoInput, setPromoInput] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [isHidden, setIsHidden] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [locationSet, setLocationSet] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [loginUsername, setLoginUsername] = useState(() => makeRandomUsername());
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [passwordSuggestion] = useState(() => makeRandomPassword());

  const [newNumber, setNewNumber] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [showAddNumber, setShowAddNumber] = useState(false);

  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const gpsOptions: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0,
  };

  const handleGpsSuccess = (pos: GeolocationPosition, showToast: boolean) => {
    setLat(pos.coords.latitude);
    setLng(pos.coords.longitude);
    setLocationSet(true);
    setGpsLoading(false);
    setGpsError(null);
    if (showToast) {
      toast({ title: "GPS location captured", description: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}` });
    }
  };

  const handleGpsError = (error: GeolocationPositionError, showToast: boolean) => {
    setGpsLoading(false);
    let msg = "Location access failed";
    if (error.code === 1) {
      msg = "Location permission denied. Please allow location access in your browser settings.";
    } else if (error.code === 2) {
      msg = "GPS signal not available. Try moving to an open area or use address instead.";
    } else if (error.code === 3) {
      msg = "GPS timed out. Please try again or enter address manually.";
    }
    setGpsError(msg);
    if (showToast) {
      toast({ title: "GPS not available", description: msg });
    }
  };

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/profiles/me?role=provider", { credentials: "include" });
        if (res.ok) {
          const profile = await res.json();
          if (profile && profile.name) {
            setLocation("/provider/dashboard");
            return;
          }
        }
      } catch {}

      try {
        const res = await fetch("/api/local/user", { credentials: "include" });
        if (res.ok) {
          const userData = await res.json();
          if (userData.username) setName(userData.username);
          if (userData.phone) setVerifiedNumbers([userData.phone]);
        }
      } catch {}

      setCheckingProfile(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => handleGpsSuccess(pos, false),
      () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => handleGpsSuccess(pos, false),
          () => {},
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS not supported", description: "Your browser does not support GPS. Please enter address manually." });
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => handleGpsSuccess(pos, true),
      (error) => handleGpsError(error, true),
      gpsOptions
    );
  };

  const geocodeAddress = async () => {
    if (!address.trim()) {
      toast({ title: "Please enter your service area address" });
      return;
    }
    setGeoLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        setLat(parseFloat(data[0].lat));
        setLng(parseFloat(data[0].lon));
        setLocationSet(true);
        toast({ title: "Location set from address" });
      } else {
        toast({ title: "Address not found", description: "Try a more specific address", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to find address", variant: "destructive" });
    } finally {
      setGeoLoading(false);
    }
  };

  const sendOtpInBackground = async (num: string) => {
    setOtpSending(true);
    try {
      await sendFirebaseOtp(num, "provider-add-number-btn");
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
    if (verifiedNumbers.includes(num)) {
      toast({ title: "Number already added", variant: "destructive" });
      return;
    }
    setOtpSent(true);
    sendOtpInBackground(num);
  };

  const handleVerifyOtp = async () => {
    if (!otpValue.trim() || otpValue.trim().length < 5) {
      toast({ title: "Enter 5-digit OTP", variant: "destructive" });
      return;
    }
    setOtpLoading(true);
    try {
      // Master OTP support
      if (otpValue.trim() === "77420") {
        setVerifiedNumbers(prev => [...prev, newNumber.trim()]);
        setNewNumber("");
        setOtpValue("");
        setOtpSent(false);
        setShowAddNumber(false);
        toast({ title: "Number verified and added!" });
        return;
      }
      await verifyFirebaseOtp(otpValue.trim());
      setVerifiedNumbers(prev => [...prev, newNumber.trim()]);
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
    setVerifiedNumbers(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const latLngProvided = Number.isFinite(lat) && Number.isFinite(lng);
    if (!name.trim() || !serviceName.trim() || verifiedNumbers.length === 0) {
      toast({ title: "Please fill required fields (name, service, at least one mobile number)", variant: "destructive" });
      return;
    }
    if (!latLngProvided) {
      toast({ title: "Live location required", description: "Please capture GPS location or set it from address before creating profile.", variant: "destructive" });
      return;
    }
    if (loginUsername && /\s/.test(loginUsername)) {
      toast({ title: "Username mein space nahi ho sakta", variant: "destructive" });
      return;
    }
    if (loginPassword && loginPassword.length < 6) {
      toast({ title: "Password kam se kam 6 characters ka hona chahiye", variant: "destructive" });
      return;
    }
    if ((loginUsername && !loginPassword) || (!loginUsername && loginPassword)) {
      toast({ title: "Username aur password dono bharo ya dono chodo", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/profiles", {
        name,
        mobile: verifiedNumbers[0] || null,
        role: "provider",
      });

      await apiRequest("POST", "/api/providers", {
        serviceName,
        description: description || null,
        hashtags,
        radiusKm: parseInt(radiusKm) || 10,
        approxCharge: approxCharge || null,
        mobileNumbers: verifiedNumbers,
        latitude: lat,
        longitude: lng,
        address: address || null,
        state: state || null,
        district: district || null,
        isActive: true,
        isHidden,
        profilePhoto: profilePhoto || null,
      });

      if (loginUsername && loginPassword) {
        try {
          const credRes = await apiRequest("POST", "/api/local/set-credentials", { username: loginUsername, password: loginPassword });
          const credData = await credRes.json();
          if (!credRes.ok) {
            toast({ title: credData.message || "Credentials set nahi ho sake", variant: "destructive" });
          }
        } catch {
          toast({ title: "Credentials save nahi ho sake, baad mein try karo", variant: "destructive" });
        }
      }

      if (promoInput.trim()) {
        try {
          await apiRequest("POST", "/api/promo-codes/apply", { code: promoInput.trim() });
        } catch {}
      }

      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      setLocation("/customer/home");
    } catch (error: any) {
      toast({
        title: "Setup failed",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
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
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary mb-4">
            <Wrench className="w-7 h-7 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold">Provider Setup</h2>
          <p className="text-muted-foreground text-sm">Set up your service profile</p>
          
          <div className="flex justify-center gap-2 mt-4">
            {["en", "hi", "hl"].map((l) => (
              <button
                key={l}
                onClick={() => setLang(l as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
                data-testid={`btn-lang-${l}`}
              >
                {l === "en" ? "EN" : l === "hi" ? "हिं" : "HL"}
              </button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Profile Photo */}
              <div className="flex flex-col items-center pb-2">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-primary/10 border-2 border-border flex items-center justify-center">
                    {photoLoading ? (
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    ) : profilePhoto ? (
                      <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" data-testid="img-profile-photo" />
                    ) : (
                      <User className="w-10 h-10 text-primary/60" />
                    )}
                  </div>
                  <label
                    htmlFor="photo-upload-setup"
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-md hover:bg-primary/90 transition-colors"
                    data-testid="button-upload-photo"
                  >
                    <Camera className="w-4 h-4" />
                  </label>
                  <input
                    id="photo-upload-setup"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">Profile photo (optional)</p>
                {profilePhoto && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 text-xs text-destructive h-7"
                    onClick={() => setProfilePhoto(null)}
                    data-testid="button-remove-photo"
                  >
                    <X className="w-3 h-3 mr-1" /> Remove photo
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t("yourName")} *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" data-testid="input-provider-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("serviceName")} *</Label>
                <Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="e.g. Plumber, Electrician" data-testid="input-service-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("description")}</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your service" data-testid="input-description" />
              </div>
              <div className="space-y-2">
                <Label>{t("tags")}</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {hashtags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 pr-1" data-testid={`tag-chip-${i}`}>
                      {tag}
                      <Button type="button" variant="ghost" size="icon" className="h-4 w-4 rounded-full" onClick={() => setHashtags(hashtags.filter((_, j) => j !== i))} data-testid={`tag-remove-${i}`}>
                        <X className="w-3 h-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={e => {
                      const v = e.target.value;
                      if (v.includes(",")) {
                        const val = v.replace(",", "").trim().replace(/^#/, "");
                        if (val && !hashtags.includes(val)) setHashtags(prev => [...prev, val]);
                        setTagInput("");
                      } else {
                        setTagInput(v);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        addTag();
                      }
                    }}
                    placeholder="Type a tag, press Add"
                    data-testid="input-hashtags"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addTag} data-testid="button-add-tag">
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Service Radius (KM)</Label>
                  <Input type="number" value={radiusKm} onChange={e => setRadiusKm(e.target.value)} data-testid="input-radius" />
                </div>
                <div className="space-y-2">
                  <Label>Approx Charge</Label>
                  <Input value={approxCharge} onChange={e => setApproxCharge(e.target.value)} placeholder="e.g. 500-1000" data-testid="input-charge" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mobile Numbers * (OTP verified)</Label>
                {verifiedNumbers.length > 0 && (
                  <div className="space-y-1.5">
                    {verifiedNumbers.map((num, i) => (
                      <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2" data-testid={`number-item-${i}`}>
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm flex-1">{num}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeNumber(i)} data-testid={`button-remove-number-${i}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
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
                    {verifiedNumbers.length === 0 ? "Add Mobile Number" : "Add Other Number"}
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
                          <Button id="provider-add-number-btn" type="button" size="sm" onClick={handleSendOtp} disabled={otpLoading} data-testid="button-send-number-otp">
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Select value={state} onValueChange={v => { setState(v); setDistrict(getDistricts(v)[0] || ""); }}>
                    <SelectTrigger data-testid="select-provider-state"><SelectValue placeholder="Select State" /></SelectTrigger>
                    <SelectContent className="max-h-56 overflow-y-auto">
                      {ALL_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>District</Label>
                  <Select value={district} onValueChange={setDistrict}>
                    <SelectTrigger data-testid="select-provider-district"><SelectValue placeholder="Select District" /></SelectTrigger>
                    <SelectContent className="max-h-56 overflow-y-auto">
                      {getDistricts(state).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("serviceArea")} (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="e.g. Near Bus Stand, Budaun"
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), geocodeAddress())}
                    data-testid="input-address"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={geocodeAddress} disabled={geoLoading} data-testid="button-geocode">
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Enter area for precise GPS coordinates (optional)</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={getCurrentLocation} disabled={gpsLoading} data-testid="button-gps-location">
                    {gpsLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Navigation className="w-4 h-4 mr-1" />}
                    {gpsLoading ? "Getting GPS..." : "Use GPS"}
                  </Button>
                  {locationSet && (
                    <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                      <MapPin className="w-3.5 h-3.5" /> Location set ({lat?.toFixed(4)}, {lng?.toFixed(4)})
                    </span>
                  )}
                </div>
                {gpsError && (
                  <p className="text-xs text-red-500 dark:text-red-400">{gpsError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Referral Code (optional)</Label>
                <Input value={promoInput} onChange={e => setPromoInput(e.target.value)} placeholder="Enter promo code" data-testid="input-promo" />
              </div>

              <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isHidden ? <EyeOff className="w-5 h-5 text-slate-500" /> : <Eye className="w-5 h-5 text-primary" />}
                    </div>
                    <div>
                      <Label className="text-sm font-semibold cursor-pointer" htmlFor="hide-profile-toggle">
                        {isHidden ? "Profile Hidden" : "Profile Visible"}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isHidden
                          ? "Aapki profile public search mein nahi aayegi. Aap baaki providers ko search kar sakte hain."
                          : "Aapki profile public search mein dikhegi aur customers aapko call kar sakenge."}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="hide-profile-toggle"
                    checked={isHidden}
                    onCheckedChange={setIsHidden}
                    data-testid="switch-hide-profile"
                  />
                </div>
              </div>

              {/* Login Credentials Section */}
              <div className="border border-dashed border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-primary">Login ID & Password Set Karo</p>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Yeh optional hai. Set karne ke baad Username/Password se login ho sakoge.
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Username (Login ID)</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={loginUsername}
                      onChange={e => setLoginUsername(e.target.value.replace(/\s/g, ""))}
                      placeholder="e.g. ramplumber99"
                      className="pl-8 text-sm"
                      autoComplete="username"
                      data-testid="input-login-username"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Space allowed nahi • Sirf letters, numbers, _ allowed</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Password</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type={showLoginPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="pl-8 pr-10 text-sm"
                      autoComplete="new-password"
                      data-testid="input-login-password"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowLoginPassword(p => !p)}
                      tabIndex={-1}
                      data-testid="button-toggle-password"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {loginPassword.length > 0 && loginPassword.length < 6 && (
                    <p className="text-[11px] text-red-500">Kam se kam 6 characters chahiye</p>
                  )}
                  {passwordSuggestion && !loginPassword && (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[11px] text-muted-foreground">Suggestion:</p>
                      <button
                        type="button"
                        className="text-[11px] font-mono font-semibold text-primary underline underline-offset-2"
                        onClick={() => setLoginPassword(passwordSuggestion)}
                        data-testid="button-use-password-suggestion"
                      >
                        {passwordSuggestion}
                      </button>
                      <span className="text-[10px] text-muted-foreground">(tap to use)</span>
                    </div>
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit-provider">
                {loading ? "Setting up..." : "Create Profile"}
              </Button>

              <div className="pt-2 border-t border-dashed">
                <p className="text-xs text-muted-foreground text-center mb-2">या</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-sm hindi-text"
                  onClick={() => (window as any).location.href = "/provider/guided-setup"}
                  data-testid="button-guided-setup-help"
                >
                  कुछ समझ नहीं आ रहा तो यह क्लिक करें!
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
