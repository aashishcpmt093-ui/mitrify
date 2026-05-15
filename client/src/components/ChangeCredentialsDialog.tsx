import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { sendFirebaseOtp, verifyFirebaseOtp } from "@/lib/firebase";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock, ShieldCheck } from "lucide-react";

export default function ChangeCredentialsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();

  // Fetch the SERVER-AUTHORITATIVE registered phone (never trust unsaved form state)
  const { data: localUser } = useQuery<{ phone: string | null; username: string | null }>({
    queryKey: ["/api/local/user"],
    queryFn: async () => {
      const res = await fetch("/api/local/user", { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: open,
  });
  const registeredPhone = localUser?.phone || null;
  const [step, setStep] = useState<"phone" | "otp" | "creds">("phone");
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep("phone");
    setOtp("");
    setUsername("");
    setPassword("");
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const sendOtp = async () => {
    if (!registeredPhone) {
      toast({ title: "Mobile number missing", description: "Pehle apna mobile number profile mein add karein", variant: "destructive" });
      return;
    }
    setOtpSending(true);
    try {
      await sendFirebaseOtp(registeredPhone, "change-creds-send-otp-btn");
      setStep("otp");
      toast({ title: "OTP bhej diya gaya hai" });
    } catch (err: any) {
      const code = String(err?.code || "");
      const msg = code === "auth/too-many-requests"
        ? err?.message || "Bahut zyada attempts. Thodi der baad try karein."
        : code === "auth/invalid-phone-number"
          ? err?.message || "Galat mobile number format. Format: +91XXXXXXXXXX"
          : err?.message || "OTP bhejne mein dikkat aayi";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) {
      toast({ title: "OTP enter karein", variant: "destructive" });
      return;
    }
    setOtpVerifying(true);
    try {
      await verifyFirebaseOtp(otp.trim());
      const res = await fetch("/api/local/credential-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: registeredPhone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Server verify failed");
      }
      setStep("creds");
      toast({ title: "OTP verified ✓" });
    } catch (err: any) {
      const msg = err?.code === "auth/invalid-verification-code"
        ? "Galat OTP. Phir se try karein."
        : err?.code === "auth/code-expired"
          ? "OTP expire ho gaya. Naya OTP request karein."
          : "Verification fail ho gaya";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setOtpVerifying(false);
    }
  };

  const saveCreds = async () => {
    const u = username.trim();
    if (!u || /\s/.test(u)) {
      toast({ title: "Username valid hona chahiye (no spaces)", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password kam se kam 6 characters ka ho", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/local/change-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: u, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");
      toast({ title: "Username aur password update ho gaye!" });
      handleClose(false);
    } catch (err: any) {
      toast({ title: err.message || "Save fail ho gaya", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" /> Change Username &amp; Password
          </DialogTitle>
          <DialogDescription>
            OTP verify karke apna login username aur password badal sakte hain.
          </DialogDescription>
        </DialogHeader>

        {step === "phone" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="text-xs text-muted-foreground mb-1">Registered Mobile</p>
              <p className="font-semibold" data-testid="text-registered-phone">{registeredPhone || "Not set"}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Aapke registered mobile par OTP bheja jayega taaki credentials change karne ki permission verify ho sake.
            </p>
            <Button
              id="change-creds-send-otp-btn"
              className="w-full"
              onClick={sendOtp}
              disabled={!registeredPhone || otpSending}
              data-testid="button-send-otp"
            >
              {otpSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</> : "Send OTP"}
            </Button>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              OTP {registeredPhone} par bheja gaya hai
            </p>
            <div className="space-y-2">
              <Label htmlFor="change-otp">Enter OTP</Label>
              <Input
                id="change-otp"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit OTP"
                maxLength={6}
                inputMode="numeric"
                data-testid="input-otp"
              />
            </div>
            <Button className="w-full" onClick={verifyOtp} disabled={otpVerifying} data-testid="button-verify-otp">
              {otpVerifying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</> : "Verify OTP"}
            </Button>
            <Button id="change-creds-send-otp-btn" variant="ghost" className="w-full text-xs" onClick={sendOtp} disabled={otpSending} data-testid="button-resend-otp">
              Resend OTP
            </Button>
          </div>
        )}

        {step === "creds" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 text-xs">
              <ShieldCheck className="w-4 h-4" /> OTP verified
            </div>
            <div className="space-y-2">
              <Label htmlFor="change-username">New Username</Label>
              <Input
                id="change-username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="No spaces"
                autoComplete="username"
                data-testid="input-new-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="change-password">New Password</Label>
              <Input
                id="change-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                autoComplete="new-password"
                data-testid="input-new-password"
              />
            </div>
            <Button className="w-full" onClick={saveCreds} disabled={saving} data-testid="button-save-credentials">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Save Changes"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
