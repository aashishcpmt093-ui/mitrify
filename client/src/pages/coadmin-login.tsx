import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { BackButton } from "@/components/BackButton";

export default function CoAdminLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState(() => localStorage.getItem("mitrify_coadmin_username") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast({ title: "Username aur password required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/coadmin/login", { username: username.trim(), password: password.trim() });
      const data = await res.json();
      localStorage.setItem("mitrify_coadmin_username", username.trim());
      if (data.role === "testadmin" || data.role === "mainadmin") {
        setLocation("/verify/dashboard");
      } else {
        setLocation("/coadmin/dashboard");
      }
    } catch (err: any) {
      toast({ title: err.message || "Login failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <BackButton />
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary mb-4">
            <ShieldCheck className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">Co-Admin Login</h1>
          <p className="text-muted-foreground text-sm mt-1">Mitrify Staff Portal</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  data-testid="input-coadmin-username"
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  data-testid="input-coadmin-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-coadmin-login">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Login"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  );
}
