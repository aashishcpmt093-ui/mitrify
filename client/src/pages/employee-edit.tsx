import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Upload, Loader2 } from "lucide-react";

interface Employee {
  id: number;
  coAdminId: number;
  name: string;
  post: string;
  education?: string;
  description?: string;
  profilePhoto?: string;
}

export default function EmployeeEditPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [coAdminId, setCoAdminId] = useState<number | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [formData, setFormData] = useState<Partial<Employee>>({
    name: "",
    post: "",
    education: "",
    description: "",
    profilePhoto: "",
  });

  const urlParams = new URLSearchParams(window.location.search);
  const idParam = urlParams.get("id");

  // Check co-admin auth first
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/coadmin/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setCoAdminId(data.id);
          setAuthChecked(true);
          return;
        }
      } catch (e) {
        // Not a co-admin, continue
      }
      // Check regular user auth
      const adminRes = await fetch("/api/admin/status", { credentials: "include" });
      if (adminRes.ok) {
        const data = await adminRes.json();
        if (data.isAdmin) {
          setCoAdminId(-1); // Indicate admin user
          setAuthChecked(true);
          return;
        }
      }
      setAuthChecked(true);
      setLocation("/login");
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (idParam && authChecked) {
      setEmployeeId(parseInt(idParam));
    }
  }, [idParam, authChecked]);

  const { data: employee, isLoading: employeeLoading } = useQuery<Employee | null>({
    queryKey: ["/api/employees", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const res = await fetch(`/api/employees/${employeeId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!employeeId && authChecked,
  });

  useEffect(() => {
    if (employee) {
      setFormData(employee);
    }
  }, [employee]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Employee>) => {
      if (employeeId) {
        return apiRequest("PATCH", `/api/employees/${employeeId}`, data);
      } else {
        return apiRequest("POST", `/api/employees`, { ...data, coAdminId });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/employees"] });
      qc.refetchQueries({ queryKey: ["/api/employees"] });
      toast({ title: "✅ Profile updated successfully" });
      setTimeout(() => setLocation("/our-team"), 1000);
    },
    onError: (err: any) => {
      toast({ title: `❌ ${err.message || "Update failed"}`, variant: "destructive" });
    },
  });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData((prev) => ({ ...prev, profilePhoto: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.post) {
      toast({ title: "Name and post are required", variant: "destructive" });
      return;
    }
    updateMutation.mutate(formData);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="gradient-hero dark:gradient-hero-dark pt-3 pb-4 px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="text-white/80" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-white">Edit Profile</h1>
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 max-w-lg mx-auto space-y-4">
        {employeeLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 pb-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Photo Upload */}
                <div>
                  <label className="text-sm font-medium">Profile Photo</label>
                  <div className="mt-2 flex flex-col gap-2">
                    {formData.profilePhoto && (
                      <img
                        src={formData.profilePhoto}
                        alt="Profile"
                        className="w-24 h-24 rounded-full object-cover mx-auto"
                        data-testid="img-preview"
                      />
                    )}
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        className="hidden"
                        id="photo-input"
                        data-testid="input-photo"
                      />
                      <label htmlFor="photo-input">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full cursor-pointer gap-2"
                          onClick={() => document.getElementById("photo-input")?.click()}
                          data-testid="button-upload-photo"
                        >
                          <Upload className="w-4 h-4" />
                          Upload Photo
                        </Button>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={formData.name || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Full name"
                    className="mt-1"
                    data-testid="input-name"
                  />
                </div>

                {/* Post */}
                <div>
                  <label className="text-sm font-medium">Post / Designation</label>
                  <Input
                    value={formData.post || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, post: e.target.value }))}
                    placeholder="e.g., Software Engineer, Manager"
                    className="mt-1"
                    data-testid="input-post"
                  />
                </div>

                {/* Education */}
                <div>
                  <label className="text-sm font-medium">Education</label>
                  <Input
                    value={formData.education || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, education: e.target.value }))}
                    placeholder="e.g., B.Tech, MBA"
                    className="mt-1"
                    data-testid="input-education"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm font-medium">About / Bio</label>
                  <Textarea
                    value={formData.description || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description about yourself..."
                    className="mt-1 resize-none"
                    rows={4}
                    data-testid="input-description"
                  />
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Profile"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
