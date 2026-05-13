import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Save, Loader2, Wrench, X, Plus, Phone, Camera, User, EyeOff, Eye, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ChangeCredentialsDialog from "@/components/ChangeCredentialsDialog";
import type { Provider } from "@shared/schema";

export default function ProviderEditProfilePage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [approxCharge, setApproxCharge] = useState("");
  const [address, setAddress] = useState("");
  const [mobileNumbers, setMobileNumbers] = useState<string[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);

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

  const addPhone = () => {
    const val = newPhone.trim();
    if (val && !mobileNumbers.includes(val)) setMobileNumbers(prev => [...prev, val]);
    setNewPhone("");
  };

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/profiles/me", "provider"],
    queryFn: async () => {
      const res = await fetch("/api/profiles/me?role=provider", { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: provider, isLoading: providerLoading } = useQuery<Provider>({
    queryKey: ["/api/providers/me"],
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setMobile(profile.mobile || "");
    }
  }, [profile]);

  useEffect(() => {
    if (provider) {
      setServiceName(provider.serviceName || "");
      setDescription(provider.description || "");
      setHashtags(provider.hashtags || []);
      setApproxCharge(provider.approxCharge || "");
      setAddress(provider.address || "");
      setLat(provider.latitude ?? null);
      setLng(provider.longitude ?? null);
      setMobileNumbers(provider.mobileNumbers || []);
      setProfilePhoto(provider.profilePhoto || null);
      setIsHidden(provider.isHidden || false);
    }
  }, [provider]);

  const mobilePreFilled = useRef(false);
  useEffect(() => {
    if (mobilePreFilled.current) return;
    if (provider && profile) {
      mobilePreFilled.current = true;
      if ((provider.mobileNumbers || []).length === 0 && profile.mobile) {
        setMobileNumbers([profile.mobile]);
      }
    }
  }, [provider, profile]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Location not supported", variant: "destructive" });
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGeoLoading(false);
        toast({ title: "Location updated" });
      },
      () => {
        setGeoLoading(false);
        toast({ title: "Could not get location", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleGeocodeAddress = async () => {
    if (!address.trim()) {
      toast({ title: "Enter address first", variant: "destructive" });
      return;
    }
    setGeoLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
      const data = await res.json();
      if (data?.[0]) {
        setLat(parseFloat(data[0].lat));
        setLng(parseFloat(data[0].lon));
        toast({ title: "Location set from address" });
      } else {
        toast({ title: "Address not found", variant: "destructive" });
      }
    } finally {
      setGeoLoading(false);
    }
  };

  const updateProfile = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/profiles/me", {
        name,
        mobile,
        role: "provider",
      });
      await apiRequest("PUT", "/api/providers/me", {
        serviceName,
        description,
        hashtags,
        approxCharge,
        address,
        latitude: lat,
        longitude: lng,
        mobileNumbers,
        profilePhoto,
        isHidden,
      });
    },
    onSuccess: () => {
      toast({ title: "Profile Updated", description: "Your details have been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
      setLocation("/provider/dashboard");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update profile", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    updateProfile.mutate();
  };

  if (profileLoading || providerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/provider/dashboard")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold text-lg">Edit Provider Profile</h1>
        </div>
      </header>

      <main className="p-4 max-w-md mx-auto pb-10">
        <div className="flex flex-col items-center mb-6">
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
            <label htmlFor="photo-upload" className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-md hover:bg-primary/90 transition-colors" data-testid="button-upload-photo">
              <Camera className="w-4 h-4" />
            </label>
            <input id="photo-upload" type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Tap camera icon to upload photo</p>
          {profilePhoto && (
            <Button type="button" variant="ghost" size="sm" className="mt-1 text-xs text-destructive h-7" onClick={() => setProfilePhoto(null)} data-testid="button-remove-photo">
              <X className="w-3 h-3 mr-1" /> Remove photo
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Basic Information</h3>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" data-testid="input-edit-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile">Primary Mobile Number</Label>
                <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Enter mobile number" data-testid="input-edit-mobile" />
                <p className="text-xs text-muted-foreground">This is your account mobile (for login/OTP)</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">Contact Numbers for Customers</h3>
                <p className="text-xs text-muted-foreground">These numbers will be shown to customers when they want to call you. Add all numbers where you want to receive calls.</p>
              </div>
              {mobileNumbers.length > 0 && (
                <div className="space-y-2">
                  {mobileNumbers.map((num, i) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg" data-testid={`phone-chip-${i}`}>
                      <Phone className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="flex-1 text-sm font-medium">{num}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setMobileNumbers(mobileNumbers.filter((_, j) => j !== i))} data-testid={`phone-remove-${i}`}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPhone(); } }} placeholder="+91 XXXXXXXXXX or 0XXXXXXXXXX" type="tel" data-testid="input-new-phone" />
                <Button type="button" variant="outline" size="sm" onClick={addPhone} data-testid="button-add-phone">
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
              {mobileNumbers.length === 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-400">⚠️ No contact numbers added. Customers won't be able to call you.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Service Details</h3>
              <div className="space-y-2">
                <Label htmlFor="serviceName">Service Name</Label>
                <Input id="serviceName" value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="e.g. Plumbing, Electrician" data-testid="input-edit-service" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your service" data-testid="input-edit-description" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hashtags">Tags</Label>
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
                  <Input id="hashtags" value={tagInput} onChange={e => { const v = e.target.value; if (v.includes(",")) { const val = v.replace(",", "").trim().replace(/^#/, ""); if (val && !hashtags.includes(val)) setHashtags(prev => [...prev, val]); setTagInput(""); } else { setTagInput(v); } }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); addTag(); } }} placeholder="Type a tag, press Add" data-testid="input-edit-hashtags" />
                  <Button type="button" variant="outline" size="sm" onClick={addTag} data-testid="button-add-tag">
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="charge">Approx Charge (Rs.)</Label>
                <Input id="charge" value={approxCharge} onChange={(e) => setApproxCharge(e.target.value)} placeholder="e.g. 500" data-testid="input-edit-charge" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Service Area Address</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter your service area" data-testid="input-edit-address" />
              </div>
              <div className="space-y-2">
                <Label>Live Location</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleUseCurrentLocation} disabled={geoLoading} data-testid="button-use-current-location">
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Use Current Location"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleGeocodeAddress} disabled={geoLoading} data-testid="button-geocode-address">
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set From Address"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground" data-testid="text-current-location">
                  {lat && lng ? `Saved: ${lat.toFixed(4)}, ${lng.toFixed(4)}` : "No live location saved yet"}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {isHidden ? <EyeOff className="w-5 h-5 text-slate-500" /> : <Eye className="w-5 h-5 text-primary" />}
                </div>
                <div>
                  <Label className="text-sm font-semibold cursor-pointer" htmlFor="edit-hide-toggle">
                    {isHidden ? "Profile Hidden" : "Profile Visible"}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isHidden ? "Aapki profile public search mein nahi aayegi. Aap baaki providers ko search kar sakte hain." : "Aapki profile public search mein dikhegi."}
                  </p>
                </div>
              </div>
              <Switch id="edit-hide-toggle" checked={isHidden} onCheckedChange={setIsHidden} data-testid="switch-edit-hide-profile" />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={updateProfile.isPending} data-testid="button-save-profile">
            {updateProfile.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>) : (<><Save className="w-4 h-4 mr-2" /> Save Changes</>)}
          </Button>

          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Edit Username/Password</p>
                    <p className="text-xs text-muted-foreground">OTP verify karke login details badlein</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setCredsOpen(true)} data-testid="button-open-change-credentials">
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </main>

      <ChangeCredentialsDialog open={credsOpen} onOpenChange={setCredsOpen} />
    </div>
  );
}
