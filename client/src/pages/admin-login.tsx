import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BackButton } from "@/components/BackButton";

export default function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [id, setId] = useState(() => localStorage.getItem("mitrify_admin_id") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
    } catch (error: any) {
      toast({ title: "Login Failed", description: "Invalid credentials", variant: "destructive" });
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
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
