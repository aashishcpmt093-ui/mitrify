import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, MapPin, GraduationCap, Heart, Users, Phone, Globe, Info, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useHomeRoute } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/language";
import founderImage from "@assets/IMG_8630_1771950896722.jpeg";

const defaultAbout = {
  founderName: "Dr. Asheesh",
  founderTitle: "Founder & Developer",
  location: "District Budaun, Uttar Pradesh, India",
  education: "MBBS, Government Medical College (GMC), Kota, Rajasthan",
  missionTitle: "Our Mission",
  missionText: "Mitrify ka mission hai ki har vyakti ko apne aas-paas ke service providers se turant jodna. Chahe aapko plumber chahiye, electrician, ya koi bhi service — Mitrify aapko sabse nazdeeki aur bharosemand service provider se connect karta hai, bas ek click mein.",
  whatIsTitle: "Mitrify Kya Hai?",
  whatIsText: "Mitrify ek service marketplace platform hai jo customers aur service providers ke beech ka bridge ka kaam karta hai. Hum sirf ek information provider hain — hum aapko service providers ki contact details aur jankari provide karte hain.",
  feature1: "Customers ko nearby service providers milte hain",
  feature2: "Ek click mein direct call karo",
  feature3: "Location-based search se sabse paas wale providers dikhte hain",
};

export default function AboutPage() {
  const [, setLocation] = useLocation();
  const homeRoute = useHomeRoute();
  const { t } = useLanguage();

  const { data: aboutData } = useQuery<typeof defaultAbout | null>({
    queryKey: ["/api/content", "about"],
    queryFn: async () => {
      const res = await fetch("/api/content/about");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 0,
  });

  const about = aboutData || defaultAbout;

  return (
    <div className="min-h-screen bg-background">
      <div className="gradient-hero dark:gradient-hero-dark pt-3 pb-4 px-4 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/home")} className="text-white/80" data-testid="button-home">
              <Home className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-white" />
              <div>
                <h1 className="text-lg font-bold text-white leading-tight" data-testid="text-about-title">{t("aboutPageTitle")}</h1>
                <p className="text-white/70 text-xs">{t("aboutPageTagline")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 max-w-lg mx-auto space-y-4">
        <Card className="shadow-lg border-0 ring-1 ring-border/50 overflow-hidden">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-primary/20 shadow-lg mb-4">
                <img src={founderImage} alt={about.founderName} className="w-full h-full object-cover" data-testid="img-founder" />
              </div>
              <h2 className="text-xl font-bold" data-testid="text-founder-name">{about.founderName}</h2>
              <p className="text-sm text-primary font-medium">{about.founderTitle}</p>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <span>{about.location}</span>
              </div>
              <div className="flex items-start gap-3">
                <GraduationCap className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <span>{about.education}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 ring-1 ring-border/50">
          <CardContent className="pt-6 pb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" />
              {about.missionTitle}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {about.missionText}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 ring-1 ring-border/50">
          <CardContent className="pt-6 pb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              {about.whatIsTitle}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              {about.whatIsText}
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <span className="text-sm text-muted-foreground">{about.feature1}</span>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <span className="text-sm text-muted-foreground">{about.feature2}</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <span className="text-sm text-muted-foreground">{about.feature3}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 ring-1 ring-border/50 overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="pt-6 pb-6">
            <Button
              className="w-full h-12 text-base font-semibold gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              onClick={() => setLocation("/our-team")}
              data-testid="button-our-team"
            >
              <Users className="w-5 h-5" />
              {t("aboutOurTeamBtn")}
            </Button>
          </CardContent>
        </Card>

        <div className="text-center pt-2">
          <Button variant="link" className="text-sm" onClick={() => setLocation("/terms")} data-testid="link-terms">
            {t("terms")}
          </Button>
          <span className="text-muted-foreground mx-2">|</span>
          <Button variant="link" className="text-sm" onClick={() => setLocation(homeRoute)} data-testid="link-back">
            {t("back")}
          </Button>
        </div>
      </div>
    </div>
  );
}
