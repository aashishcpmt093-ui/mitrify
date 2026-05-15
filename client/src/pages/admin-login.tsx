import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, KeyRound, Mail } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BackButton } from "@/components/BackButton";

type Mode = "login" | "reset-request" | "reset-confirm";

export default function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [id, setId] = useState(() => localStorage.getItem("mitrify_admin_id") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/login", { id, password });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("mitrify_admin_id", id);
        queryClient.setQueryData(["/api/admin/check"], true);
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setLocation("/admin/dashboard");
      } else {
        toast({ title: "Login Failed", description: "Invalid credentials", variant: "destructive" });
      }
    } catch {
      toast({ title: "Login Failed", description: "Invalid credentials", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetOtp = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/send-reset-otp", {});
      const data = await res.json();
      if (res.ok) {
        toast({ title: "OTP Bhej Diya", description: data.message });
        setMode("reset-confirm");
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "OTP nahi bheja ja saka", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Dono passwords match nahi kar rahe", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "Password kam se kam 8 characters ka hona chahiye", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/reset-password", { otp: resetOtp, newPassword });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: "Password Change Ho Gaya!", description: "Ab naye password se login karo" });
        setMode("login");
        setPassword("");
        setResetOtp("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Password reset nahi ho saka", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <BackButton />
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary mb-6">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>

          {mode === "login" && (
            <>
              <h2 className="text-2xl font-bold mb-6">Admin Login</h2>
              <Card className="w-full max-w-sm">
                <CardContent className="pt-6">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="admin-id">Admin ID</Label>
                      <Input
                        id="admin-id"
                        value={id}
                        onChange={e => setId(e.target.value)}
                        placeholder="Enter admin ID"
                        data-testid="input-admin-id"
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-password">Password</Label>
                      <Input
                        id="admin-password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter password"
                        data-testid="input-admin-password"
                        autoComplete="current-password"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading} data-testid="button-admin-submit">
                      {loading ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      className="text-sm text-primary underline underline-offset-2"
                      onClick={() => setMode("reset-request")}
                    >
                      Password bhool gaye? OTP se reset karo
                    </button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {mode === "reset-request" && (
            <>
              <h2 className="text-2xl font-bold mb-2">Password Reset</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
                Admin email par OTP bheja jaayega. Confirm karo.
              </p>
              <Card className="w-full max-w-sm">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <Mail className="w-5 h-5 text-blue-600 shrink-0" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">OTP admin email par aayega</p>
                  </div>
                  <Button className="w-full" onClick={handleSendResetOtp} disabled={loading}>
                    {loading ? "Bhej raha hoon..." : "OTP Bhejo"}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setMode("login")}>
                    Wapas Login Par
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {mode === "reset-confirm" && (
            <>
              <h2 className="text-2xl font-bold mb-2">Naya Password Set Karo</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
                Admin email par aaya OTP daalo aur naya password set karo
              </p>
              <Card className="w-full max-w-sm">
                <CardContent className="pt-6">
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-otp">
                        <KeyRound className="w-3.5 h-3.5 inline mr-1" />
                        OTP (Email se)
                      </Label>
                      <Input
                        id="reset-otp"
                        value={resetOtp}
                        onChange={e => setResetOtp(e.target.value)}
                        placeholder="6-digit OTP"
                        maxLength={6}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">Naya Password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Kam se kam 8 characters"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Password Confirm Karo</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Same password dobara daalo"
                        autoComplete="new-password"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Change ho raha hai..." : "Password Change Karo"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-sm"
                      onClick={handleSendResetOtp}
                      disabled={loading}
                    >
                      OTP Dobara Bhejo
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
