import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  AlertCircle, Loader2, MapPin, Navigation, Phone, X, Plus, CheckCircle2, LogOut
} from "lucide-react";
import logoImg from "@assets/772B17C5-7738-43B8-B5C0-04A7F2A6561B_1773842365564.png";

interface ProfileStatus {
  exists: boolean;
  profileComplete: boolean;
  missingFields: string[];
}

export default function ProviderCompleteProfilePage() {
  const { logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [approxCharge, setApproxCharge] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [mobileNumbers, setMobileNumbers] = useState<string[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: status, isLoading: statusLoading } = useQuery<ProfileStatus>({
    queryKey: ["/api/providers/profile-status"],
    queryFn: async () => {
      const res = await fetch("/api/providers/profile-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 0,
    retry: false,
  });

  const { data: provider } = useQuery<any>({
    queryKey: ["/api/providers/me"],
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (provider) {
      if (provider.serviceName) setServiceName(provider.serviceName);
      if (provider.description) setDescription(provider.description);
      if (provider.approxCharge) setApproxCharge(provider.approxCharge);
      if (provider.address) setAddress(provider.address);
      if (provider.latitude) setLat(provider.latitude);
      if (provider.longitude) setLng(provider.longitude);
      if (provider.mobileNumbers?.length) setMobileNumbers(provider.mobileNumbers);
    }
  }, [provider]);

  // ── Back button trap: force logout when user tries to navigate away ─────────
  const handlePopState = useCallback(() => {
    // Preferred strict behavior: log the user out on any back attempt
    logout();
  }, [logout]);

  useEffect(() => {
    // Replace current history entry, then push a dummy state on top.
    // This means pressing Back fires popstate instead of leaving the page.
    window.history.replaceState(null, "", window.location.href);
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  // ── If profile is already complete, redirect to dashboard ───────────────────
  useEffect(() => {
    if (!statusLoading && status?.profileComplete) {
      setLocation("/provider/dashboard");
    }
  }, [status, statusLoading, setLocation]);

  // ── Geolocation ─────────────────────────────────────────────────────────────
  const handleGPS = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS not supported — enter address manually", variant: "destructive" });
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGeoLoading(false);
        toast({ title: "Location captured!" });
      },
      () => {
        setGeoLoading(false);
        toast({ title: "GPS failed — enter address manually", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleGeocodeAddress = async () => {
    if (!address.trim()) {
      toast({ title: "Pehle address likho", variant: "destructive" });
      return;
    }
    setGeoLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      );
      const data = await res.json();
      if (data?.[0]) {
        setLat(parseFloat(data[0].lat));
        setLng(parseFloat(data[0].lon));
        toast({ title: "Location address se set ho gayi!" });
      } else {
        toast({ title: "Address nahi mila — aur specific address likho", variant: "destructive" });
      }
    } finally {
      setGeoLoading(false);
    }
  };

  const addPhone = () => {
    const val = newPhone.trim();
    if (!val) return;
    if (mobileNumbers.includes(val)) {
      toast({ title: "Yeh number pehle se add hai", variant: "destructive" });
      return;
    }
    setMobileNumbers(prev => [...prev, val]);
    setNewPhone("");
  };

  // ── Inline validation ────────────────────────────────────────────────────────
  const validateFields = (missingFields: string[]): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (missingFields.includes("serviceName") && !serviceName.trim())
      errors.serviceName = "Service naam zaroori hai";
    if (missingFields.includes("description") && !description.trim())
      errors.description = "Description zaroori hai";
    if (missingFields.includes("approxCharge") && !approxCharge.trim())
      errors.approxCharge = "Approx charge zaroori hai";
    if (missingFields.includes("location") && !address.trim() && (lat == null || lng == null))
      errors.location = "Address likhna ya GPS button dabana zaroori hai";
    if (missingFields.includes("mobileNumbers") && mobileNumbers.length === 0)
      errors.mobileNumbers = "Kam se kam ek mobile number add karo";
    return errors;
  };

  // ── Save mutation ────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const missingFields = status?.missingFields || [];
      const errors = validateFields(missingFields);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        throw new Error("validation");
      }
      setFieldErrors({});

      const body: Record<string, any> = {};
      if (missingFields.includes("serviceName")) body.serviceName = serviceName.trim();
      if (missingFields.includes("description")) body.description = description.trim();
      if (missingFields.includes("approxCharge")) body.approxCharge = approxCharge.trim();
      if (missingFields.includes("location")) {
        body.address = address.trim() || null;
        body.latitude = lat;
        body.longitude = lng;
      }
      if (missingFields.includes("mobileNumbers")) body.mobileNumbers = mobileNumbers;

      await apiRequest("PUT", "/api/providers/me", body);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/profile-status"] });

      const check = await fetch("/api/providers/profile-status", { credentials: "include" });
      const freshStatus: ProfileStatus = await check.json();
      if (freshStatus.profileComplete) {
        toast({ title: "Profile complete ho gayi!", description: "Dashboard access kar sakte ho ab." });
        setLocation("/provider/dashboard");
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/providers/profile-status"] });
      }
    },
    onError: (err: any) => {
      if (err.message !== "validation") {
        toast({ title: "Save failed", description: err.message, variant: "destructive" });
      }
    },
  });

  const missing = status?.missingFields || [];

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="Mitrify" className="w-7 h-7 rounded-md" />
            <span className="font-bold">Mitrify</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive gap-1.5"
            onClick={() => logout()}
            data-testid="button-logout-complete-profile"
          >
            <LogOut className="w-4 h-4" /> Logout
          </Button>
        </div>
      </header>

      <main className="p-4 max-w-md mx-auto pb-12">
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 mb-5">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">Profile Incomplete hai</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                Dashboard access karne ke liye pehle yeh fields complete karo. Jab tak profile poora nahi hota, app use nahi kar sakte.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {missing.includes("serviceName") && (
            <Card data-testid="card-field-serviceName" className={fieldErrors.serviceName ? "border-destructive" : ""}>
              <CardContent className="p-4 space-y-2">
                <Label htmlFor="cp-serviceName" className="flex items-center gap-1">
                  Service naam <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cp-serviceName"
                  value={serviceName}
                  onChange={e => { setServiceName(e.target.value); setFieldErrors(p => ({ ...p, serviceName: "" })); }}
                  placeholder="e.g. Plumber, Electrician, Painter"
                  className={fieldErrors.serviceName ? "border-destructive focus-visible:ring-destructive" : ""}
                  data-testid="input-complete-serviceName"
                />
                {fieldErrors.serviceName && (
                  <p className="text-xs text-destructive flex items-center gap-1" data-testid="error-serviceName">
                    <AlertCircle className="w-3 h-3 shrink-0" />{fieldErrors.serviceName}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {missing.includes("description") && (
            <Card data-testid="card-field-description" className={fieldErrors.description ? "border-destructive" : ""}>
              <CardContent className="p-4 space-y-2">
                <Label htmlFor="cp-description" className="flex items-center gap-1">
                  Service description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="cp-description"
                  value={description}
                  onChange={e => { setDescription(e.target.value); setFieldErrors(p => ({ ...p, description: "" })); }}
                  placeholder="Apni service ke baare mein batao — kya karte ho, kitne saal ka experience hai..."
                  rows={4}
                  className={fieldErrors.description ? "border-destructive focus-visible:ring-destructive" : ""}
                  data-testid="input-complete-description"
                />
                {fieldErrors.description && (
                  <p className="text-xs text-destructive flex items-center gap-1" data-testid="error-description">
                    <AlertCircle className="w-3 h-3 shrink-0" />{fieldErrors.description}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {missing.includes("approxCharge") && (
            <Card data-testid="card-field-approxCharge" className={fieldErrors.approxCharge ? "border-destructive" : ""}>
              <CardContent className="p-4 space-y-2">
                <Label htmlFor="cp-approxCharge" className="flex items-center gap-1">
                  Approx charge <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cp-approxCharge"
                  value={approxCharge}
                  onChange={e => { setApproxCharge(e.target.value); setFieldErrors(p => ({ ...p, approxCharge: "" })); }}
                  placeholder="e.g. ₹200/hr, ₹500 minimum"
                  className={fieldErrors.approxCharge ? "border-destructive focus-visible:ring-destructive" : ""}
                  data-testid="input-complete-approxCharge"
                />
                {fieldErrors.approxCharge && (
                  <p className="text-xs text-destructive flex items-center gap-1" data-testid="error-approxCharge">
                    <AlertCircle className="w-3 h-3 shrink-0" />{fieldErrors.approxCharge}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {missing.includes("mobileNumbers") && (
            <Card data-testid="card-field-mobileNumbers" className={fieldErrors.mobileNumbers ? "border-destructive" : ""}>
              <CardContent className="p-4 space-y-3">
                <Label className="flex items-center gap-1">
                  Contact mobile numbers <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">Yeh numbers customers ko dikhaye jaate hain call karne ke liye.</p>
                {mobileNumbers.map((num, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg" data-testid={`complete-phone-chip-${i}`}>
                    <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="flex-1 text-sm font-medium">{num}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => { setMobileNumbers(mobileNumbers.filter((_, j) => j !== i)); setFieldErrors(p => ({ ...p, mobileNumbers: "" })); }}
                      data-testid={`complete-phone-remove-${i}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPhone(); } }}
                    placeholder="+91XXXXXXXXXX ya 10-digit number"
                    type="tel"
                    data-testid="input-complete-newPhone"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addPhone} data-testid="button-complete-addPhone">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {fieldErrors.mobileNumbers && (
                  <p className="text-xs text-destructive flex items-center gap-1" data-testid="error-mobileNumbers">
                    <AlertCircle className="w-3 h-3 shrink-0" />{fieldErrors.mobileNumbers}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {missing.includes("location") && (
            <Card data-testid="card-field-location" className={fieldErrors.location ? "border-destructive" : ""}>
              <CardContent className="p-4 space-y-3">
                <Label className="flex items-center gap-1">
                  Location / Address <span className="text-destructive">*</span>
                </Label>
                {(lat != null && lng != null) && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    GPS coordinates set: {lat.toFixed(4)}, {lng.toFixed(4)}
                  </div>
                )}
                <Textarea
                  value={address}
                  onChange={e => { setAddress(e.target.value); setFieldErrors(p => ({ ...p, location: "" })); }}
                  placeholder="Ghar/dukan ka address — mohalla, city, state..."
                  rows={3}
                  className={fieldErrors.location ? "border-destructive focus-visible:ring-destructive" : ""}
                  data-testid="input-complete-address"
                />
                {fieldErrors.location && (
                  <p className="text-xs text-destructive flex items-center gap-1" data-testid="error-location">
                    <AlertCircle className="w-3 h-3 shrink-0" />{fieldErrors.location}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={handleGPS}
                    disabled={geoLoading}
                    data-testid="button-complete-gps"
                  >
                    {geoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                    GPS location
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={handleGeocodeAddress}
                    disabled={geoLoading}
                    data-testid="button-complete-geocode"
                  >
                    {geoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                    Address se set karo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            className="w-full font-semibold"
            size="lg"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-complete-save"
          >
            {saveMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
            ) : (
              "Profile Complete Karo →"
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Agar account delete karna chahte ho ya koi problem hai, logout karke support se contact karo.
          </p>
        </div>
      </main>
    </div>
  );
}
