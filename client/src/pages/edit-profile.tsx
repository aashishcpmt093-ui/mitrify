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
import { ArrowLeft, Save, Loader2, User, Lock } from "lucide-react";
import ChangeCredentialsDialog from "@/components/ChangeCredentialsDialog";

export default function EditProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/profiles/me", "customer"],
    queryFn: async () => {
      const res = await fetch("/api/profiles/me?role=customer", { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setMobile(profile.mobile || "");
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/profiles/me", {
        name,
        mobile,
        role: "customer",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile Updated", description: "Your details have been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/me"] });
      setLocation("/customer/home");
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
    if (!mobile.trim()) {
      toast({ title: "Mobile number is required", variant: "destructive" });
      return;
    }
    updateProfile.mutate();
  };

  if (isLoading) {
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
          <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/home")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold text-lg">Edit Profile</h1>
        </div>
      </header>

      <main className="p-4 max-w-md mx-auto">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-10 h-10 text-primary" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  data-testid="input-edit-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile Number</Label>
                <Input
                  id="mobile"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="Enter mobile number"
                  data-testid="input-edit-mobile"
                />
              </div>

              {profile?.promoCode && (
                <div className="space-y-2">
                  <Label>Your Referral Code</Label>
                  <div className="bg-muted px-3 py-2 rounded-md text-sm font-mono" data-testid="text-promo-code">
                    {profile.promoCode}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full"
            disabled={updateProfile.isPending}
            data-testid="button-save-profile"
          >
            {updateProfile.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Save Changes</>
            )}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCredsOpen(true)}
                  data-testid="button-open-change-credentials"
                >
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </main>

      <ChangeCredentialsDialog
        open={credsOpen}
        onOpenChange={setCredsOpen}
      />
    </div>
  );
}
