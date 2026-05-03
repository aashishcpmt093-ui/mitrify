import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, MapPin, Clock, Users, AlertCircle, ArrowLeft, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { useLanguage } from "@/lib/language";

export default function JobDetailPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const jobId = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isDialing, setIsDialing] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["/api/jobs", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Job not found");
      return res.json();
    },
    enabled: !!jobId,
  });

  const handleCall = async () => {
    if (!user) {
      toast({ title: "Login required", description: "Please login to call" });
      setLocation("/welcome");
      return;
    }

    setIsDialing(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/call`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Call failed");
      const data = await res.json();

      if (data.phone) {
        window.location.href = `tel:${data.phone}`;
        toast({ title: "Calling...", description: `Calling ${data.phone}` });
      }
    } catch (e: any) {
      toast({ title: "Call failed", description: e.message || "Try again", variant: "destructive" });
    } finally {
      setIsDialing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">{t("loading") || "Loading..."}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Job not found</p>
          <Button onClick={() => setLocation("/customer/home")} variant="outline">
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const getWorkTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      field: "🚶 Field Work",
      office: "🏢 Office Work",
      remote: "💻 Work from Home",
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setLocation("/customer/home")}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="font-bold">{job.jobName}</h1>
          <div className="w-12" />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Main card */}
        <Card data-testid={`card-job-detail-${job.id}`}>
          <CardContent className="p-6 space-y-4">
            {/* Title */}
            <div>
              <h2 className="text-2xl font-bold">{job.jobName}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Posted on {new Date(job.createdAt).toLocaleDateString()}
              </p>
            </div>

            {/* Work type badge */}
            {job.workType && (
              <div>
                <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  {getWorkTypeLabel(job.workType)}
                </Badge>
              </div>
            )}

            {/* Location */}
            {job.location && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{job.location}</p>
                  {job.district && <p className="text-sm text-muted-foreground">{job.district}, {job.state}</p>}
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <h3 className="font-semibold mb-2">Job Details</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.description}</p>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3">
              {job.salary && (
                <div className="p-3 bg-muted/40 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-0.5">Salary</p>
                  <p className="font-medium text-sm">{job.salary}</p>
                </div>
              )}

              {job.workHours && (
                <div className="p-3 bg-muted/40 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Hours
                  </p>
                  <p className="font-medium text-sm">{job.workHours}</p>
                </div>
              )}

              {job.numEmployees && (
                <div className="p-3 bg-muted/40 rounded-lg col-span-2">
                  <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Looking for
                  </p>
                  <p className="font-medium text-sm">{job.numEmployees} person(s)</p>
                </div>
              )}
            </div>

            {!job.isActive && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-300">This job posting is no longer active</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Call section */}
        {job.isActive && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-6">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  📞 <strong>1 credit</strong> will be deducted from both your and the job poster's account
                </p>
                <Button
                  onClick={handleCall}
                  disabled={isDialing}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-call-job"
                >
                  <Phone className="w-4 h-4" />
                  {isDialing ? "Calling..." : "Call for this Job"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
