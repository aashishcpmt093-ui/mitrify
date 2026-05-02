import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Users, GraduationCap, Briefcase, Edit2, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth, useHomeRoute } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/language";

interface Employee {
  id: number;
  coAdminId: number;
  name: string;
  post: string;
  education?: string;
  description?: string;
  profilePhoto?: string;
  createdAt: string;
}

export default function OurTeamPage() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const homeRoute = useHomeRoute();
  const { t } = useLanguage();

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    staleTime: 0,
  });

  const isAdmin = user?.role === "mainadmin";
  const isCoAdmin = user?.role === "coadmin" || user?.role === "testadmin";

  return (
    <div className="min-h-screen bg-background">
      <div className="gradient-hero dark:gradient-hero-dark pt-3 pb-4 px-4 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation(homeRoute)} className="text-white/80" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-white" />
              <div>
                <h1 className="text-lg font-bold text-white leading-tight" data-testid="text-team-title">{t("ourTeamTitle")}</h1>
                <p className="text-white/70 text-xs">{t("ourTeamSubtitle")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 max-w-lg mx-auto space-y-4">
        {isAuthenticated && (isAdmin || isCoAdmin) && (
          <Button
            className="w-full gap-2 bg-primary hover:bg-primary/90"
            onClick={() => setLocation("/employee/edit")}
            data-testid="button-add-employee"
          >
            <Plus className="w-4 h-4" />
            {t("ourTeamAdd")}
          </Button>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-pulse text-muted-foreground">{t("loading")}</div>
          </div>
        ) : employees.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-8 pb-8 text-center">
              <Users className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t("ourTeamComing")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {employees.map((emp) => (
              <Card key={emp.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex gap-4">
                    {emp.profilePhoto ? (
                      <img
                        src={emp.profilePhoto}
                        alt={emp.name}
                        className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                        data-testid={`img-employee-${emp.id}`}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Users className="w-8 h-8 text-primary/60" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-base" data-testid={`text-employee-name-${emp.id}`}>
                            {emp.name}
                          </h3>
                          <p className="text-sm text-primary font-medium flex items-center gap-1" data-testid={`text-employee-post-${emp.id}`}>
                            <Briefcase className="w-3.5 h-3.5" />
                            {emp.post}
                          </p>
                        </div>
                        {isAuthenticated && isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setLocation(`/employee/edit?id=${emp.id}`)}
                            data-testid={`button-edit-employee-${emp.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {emp.education && (
                          <p className="flex items-center gap-1">
                            <GraduationCap className="w-3.5 h-3.5" />
                            {emp.education}
                          </p>
                        )}
                        {emp.description && (
                          <p className="line-clamp-2">{emp.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="text-center pt-2">
          <Button variant="link" className="text-sm" onClick={() => setLocation(homeRoute)} data-testid="link-back">
            {t("back")}
          </Button>
        </div>
      </div>
    </div>
  );
}
