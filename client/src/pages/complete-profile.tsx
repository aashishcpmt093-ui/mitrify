import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { MapPin, Loader2, CheckCircle2 } from "lucide-react";

export default function CompleteProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locationFetched, setLocationFetched] = useState(false);

  // Fetch live location on component mount
  useEffect(() => {
    if (!locationFetched) {
      fetchLocation();
    }
  }, [locationFetched]);

  const fetchLocation = async () => {
    setGeoLoading(true);
    setGeoError(null);
    
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser");
      setGeoLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        setLocationFetched(true);
        setGeoLoading(false);
        toast({ title: "✓ Location captured", description: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}` });
      },
      (error) => {
        console.error("Geolocation error:", error);
        let msg = "Could not get your location";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Location permission denied. Please enable it in your browser settings.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "Location information is unavailable";
        } else if (error.code === error.TIMEOUT) {
          msg = "Location request timed out";
        }
        setGeoError(msg);
        setGeoLoading(false);
        toast({ title: "Location Error", description: msg, variant: "destructive" });
      }
    );
  };

  const completeProfile = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error("Name is required");
      }
      if (!mobile.trim()) {
        throw new Error("Mobile number is required");
      }
      if (latitude === null || longitude === null) {
        throw new Error("Location is required");
      }

      const res = await apiRequest("PUT", "/api/profiles/me", {
        name: name.trim(),
        mobile: mobile.trim(),
        latitude,
        longitude,
        role: "customer",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✓ Profile Completed!", description: "Welcome to Mitrify! Redirecting..." });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      // Redirect to customer home after a short delay
      setTimeout(() => {
        setLocation("/customer/home");
      }, 1500);
    },
    onError: (err: any) => {
      toast({ 
        title: "Error", 
        description: err.message || "Failed to complete profile", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    completeProfile.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 pt-4">
          <h1 className="text-2xl font-bold">Complete Your Profile</h1>
          <p className="text-sm text-muted-foreground">
            Let's set up your account to get started on Mitrify
          </p>
        </div>

        {/* Main Card */}
        <Card className="border-primary/20">
          <CardContent className="p-6 space-y-6">
            {/* Location Status */}
            <div className="p-4 rounded-lg bg-secondary/50 border border-primary/10 space-y-3">
              <div className="flex items-center gap-2">
                {geoLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : locationFetched ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <MapPin className="w-5 h-5 text-amber-500" />
                )}
                <span className="font-medium text-sm">Live Location</span>
              </div>
              
              {geoError && (
                <div className="text-xs text-destructive space-y-2">
                  <p>{geoError}</p>
                  <Button 
                    type="button"
                    variant="outline" 
                    size="sm"
                    onClick={fetchLocation}
                    disabled={geoLoading}
                    className="w-full"
                  >
                    {geoLoading ? "Fetching..." : "Try Again"}
                  </Button>
                </div>
              )}
              
              {locationFetched && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>✓ Latitude: <span className="font-mono">{latitude?.toFixed(6)}</span></p>
                  <p>✓ Longitude: <span className="font-mono">{longitude?.toFixed(6)}</span></p>
                </div>
              )}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  Full Name *
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10"
                  disabled={saving}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile" className="text-sm font-medium">
                  Mobile Number *
                </Label>
                <Input
                  id="mobile"
                  type="tel"
                  placeholder="10 digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="h-10"
                  disabled={saving}
                  maxLength={20}
                />
              </div>

              <Button
                type="submit"
                disabled={saving || !locationFetched || latitude === null || longitude === null}
                className="w-full h-10 font-medium"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Completing...
                  </>
                ) : (
                  "Complete Profile"
                )}
              </Button>

              {/* Skip button (optional - remove if not needed) */}
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => setLocation("/customer/home")}
                className="w-full text-xs"
              >
                Skip for now
              </Button>
            </form>

            {/* Info text */}
            <p className="text-xs text-muted-foreground text-center">
              Your location helps us connect you with providers near you.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
