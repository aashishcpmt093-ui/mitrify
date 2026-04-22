import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X, LogOut, Camera, User, MapPin, Navigation, Clock, CheckCircle, AlertCircle, Phone, Edit2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ALL_STATES, getDistricts, DEFAULT_STATE, DEFAULT_DISTRICT } from "@/lib/india-locations";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  fake: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  rejected: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

export default function CoAdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobileNumbers, setMobileNumbers] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [address, setAddress] = useState("");
  const [state, setState] = useState(DEFAULT_STATE);
  const [district, setDistrict] = useState(DEFAULT_DISTRICT);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState("10");
  const [approxCharge, setApproxCharge] = useState("");
  const [isHidden, setIsHidden] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: me } = useQuery<{ username: string; role: string; id?: number }>({
    queryKey: ["/api/coadmin/me"],
  });

  const { data: myList = [], isLoading: listLoading } = useQuery<any[]>({
    queryKey: ["/api/coadmin/pending-providers", "coadmin"],
    queryFn: () =>
      fetch("/api/coadmin/pending-providers?status=all&limit=100", { credentials: "include" })
        .then(r => r.json())
        .then(d => d.data || []),
  });

  useEffect(() => {
    apiRequest("GET", "/api/coadmin/me").catch(() => setLocation("/coadmin/login"));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setProfilePhoto(canvas.toDataURL("image/jpeg", 0.75));
        setPhotoLoading(false);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const addTag = () => {
    const v = tagInput.trim().replace(/^#/, "");
    if (v && !hashtags.includes(v)) setHashtags(p => [...p, v]);
    setTagInput("");
  };

  const addNumber = () => {
    const v = newNumber.trim();
    if (v && !mobileNumbers.includes(v)) setMobileNumbers(p => [...p, v]);
    setNewNumber("");
  };

  const getGps = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setGpsLoading(false); toast({ title: "Location captured" }); },
      () => { setGpsLoading(false); toast({ title: "GPS failed. Enter address manually.", variant: "destructive" }); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !serviceName.trim()) {
      toast({ title: "Name aur Service Name required hai", variant: "destructive" });
      return;
    }
    const nums = mobile.trim() ? [mobile.trim(), ...mobileNumbers] : mobileNumbers;
    if (nums.length === 0) {
      toast({ title: "Kam se kam ek mobile number do", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/coadmin/pending-providers", {
        name: name.trim(),
        serviceName: serviceName.trim(),
        description: description.trim() || null,
        mobile: nums[0] || null,
        mobileNumbers: nums,
        hashtags,
        address: address.trim() || null,
        state: state || null,
        district: district || null,
        latitude: lat,
        longitude: lng,
        radiusKm: parseInt(radiusKm) || 10,
        approxCharge: approxCharge.trim() || null,
        isHidden,
        profilePhoto: profilePhoto || null,
      });
      toast({ title: "Provider data submit ho gaya! Verification pending hai." });
      qc.invalidateQueries({ queryKey: ["/api/coadmin/pending-providers"] });
      setName(""); setServiceName(""); setDescription(""); setMobile(""); setMobileNumbers([]);
      setHashtags([]); setTagInput(""); setAddress(""); setState(DEFAULT_STATE); setDistrict(DEFAULT_DISTRICT); setLat(null); setLng(null);
      setRadiusKm("10"); setApproxCharge(""); setIsHidden(false); setProfilePhoto(null);
    } catch (err: any) {
      toast({ title: err.message || "Submit failed", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await apiRequest("POST", "/api/coadmin/logout", {});
    setLocation("/coadmin/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">Co-Admin Dashboard</p>
          <p className="text-xs text-muted-foreground">{me?.username}</p>
        </div>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" data-testid="button-profile-menu">
              <User className="w-5 h-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" align="end">
            <div className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setMenuOpen(false);
                  setLocation(`/employee/edit`);
                }}
                data-testid="button-edit-profile"
              >
                <Edit2 className="w-4 h-4" />
                Edit Profile
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                data-testid="button-logout-menu"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Service Provider Add Karo</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col items-center pb-2">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 border-2 border-border flex items-center justify-center">
                    {photoLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : profilePhoto ? <img src={profilePhoto} className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-primary/60" />}
                  </div>
                  <label htmlFor="pp-photo" className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow">
                    <Camera className="w-3.5 h-3.5" />
                  </label>
                  <input id="pp-photo" type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} data-testid="input-camera-capture" />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Photo (optional)</p>
                {profilePhoto && <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setProfilePhoto(null)}><X className="w-3 h-3 mr-1" />Remove</Button>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" data-testid="input-pp-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Service Name *</Label>
                  <Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="e.g. Plumber" data-testid="input-pp-service" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Service details..." rows={2} />
              </div>

              <div className="space-y-1.5">
                <Label>Primary Mobile *</Label>
                <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Main mobile number" type="tel" data-testid="input-pp-mobile" />
              </div>

              <div className="space-y-1.5">
                <Label>Additional Numbers</Label>
                <div className="flex gap-2">
                  <Input value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="Extra number" type="tel" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNumber(); } }} />
                  <Button type="button" variant="outline" size="sm" onClick={addNumber}><Plus className="w-4 h-4" /></Button>
                </div>
                {mobileNumbers.map((n, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Phone className="w-3 h-3 text-muted-foreground" />{n}
                    <button type="button" onClick={() => setMobileNumbers(p => p.filter((_, j) => j !== i))} className="text-destructive ml-auto"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Tag add karo" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
                  <Button type="button" variant="outline" size="sm" onClick={addTag}><Plus className="w-4 h-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map(t => <Badge key={t} variant="secondary" className="text-xs">#{t} <button type="button" onClick={() => setHashtags(p => p.filter(x => x !== t))} className="ml-1"><X className="w-2.5 h-2.5" /></button></Badge>)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Select value={state} onValueChange={v => { setState(v); setDistrict(getDistricts(v)[0] || ""); }}>
                    <SelectTrigger data-testid="select-pp-state"><SelectValue placeholder="State" /></SelectTrigger>
                    <SelectContent className="max-h-52 overflow-y-auto">
                      {ALL_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>District</Label>
                  <Select value={district} onValueChange={setDistrict}>
                    <SelectTrigger data-testid="select-pp-district"><SelectValue placeholder="District" /></SelectTrigger>
                    <SelectContent className="max-h-52 overflow-y-auto">
                      {getDistricts(state).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Address (Optional)</Label>
                <div className="flex gap-2">
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Near Bus Stand, area..." className="flex-1" />
                  <Button type="button" variant="outline" size="sm" onClick={getGps} disabled={gpsLoading}>
                    {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                  </Button>
                </div>
                {lat && lng && <p className="text-xs text-green-600">GPS: {lat.toFixed(4)}, {lng.toFixed(4)}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Radius (KM)</Label>
                  <Input type="number" value={radiusKm} onChange={e => setRadiusKm(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Approx Charge</Label>
                  <Input value={approxCharge} onChange={e => setApproxCharge(e.target.value)} placeholder="e.g. 200-500" />
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Switch checked={isHidden} onCheckedChange={setIsHidden} id="pp-hidden" />
                <div>
                  <Label htmlFor="pp-hidden" className="text-sm font-medium">{isHidden ? "Hidden Profile" : "Visible Profile"}</Label>
                  <p className="text-xs text-muted-foreground">{isHidden ? "Public search mein nahi aayega" : "Search mein dikhega"}</p>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting} data-testid="button-submit-pending">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verification ke liye Submit Karo
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />Mere Submitted Providers</CardTitle>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : myList.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">Abhi koi data submit nahi kiya</p>
            ) : (
              <div className="space-y-3">
                {myList.map((pp: any) => (
                  <div key={pp.id} className="p-3 border rounded-lg space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{pp.name}</p>
                        <p className="text-xs text-muted-foreground">{pp.serviceName}</p>
                        <p className="text-xs text-muted-foreground">{pp.mobile}</p>
                      </div>
                      <Badge className={`text-xs shrink-0 ${STATUS_COLORS[pp.status] || ""}`}>
                        {pp.status === "pending" ? "Pending" : pp.status === "approved" ? "Live ✓" : pp.status === "fake" ? "Fake ✗" : "Rejected"}
                      </Badge>
                    </div>
                    {pp.notes && <p className="text-xs text-muted-foreground border-t pt-1 mt-1">Note: {pp.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
