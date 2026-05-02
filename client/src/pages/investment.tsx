import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Mail, Phone, User } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useLanguage } from "@/lib/language";

export default function InvestmentPage() {
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="gap-1"
            data-testid="button-investment-back"
          >
            <ArrowLeft className="w-4 h-4" /> {t("back")}
          </Button>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white drop-shadow-lg mb-2">
            {t("investTitle")}
          </h1>
          <p className="text-white/70">{t("investSubtitle")}</p>
        </div>

        {/* Founder Card */}
        <Card className="border-2 border-yellow-400/50 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl shadow-yellow-500/20 mb-6">
          <CardHeader className="bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-900 rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl">👨‍⚕️</span>
              Dr. Asheesh
            </CardTitle>
            <p className="text-sm font-semibold text-slate-800 mt-2">{t("investFounderRole")}</p>
          </CardHeader>

          <CardContent className="pt-6 space-y-4">
            {/* Email */}
            <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <Mail className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/60 font-medium mb-1">{t("investEmailLabel")}</p>
                <a
                  href="mailto:aashishcpmt093@gmail.com"
                  className="text-sm font-semibold text-yellow-300 hover:text-yellow-200 break-all transition-colors"
                  data-testid="link-investment-email"
                >
                  aashishcpmt093@gmail.com
                </a>
              </div>
            </div>

            {/* Phone Numbers */}
            <div className="space-y-3">
              <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <Phone className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="text-xs text-white/60 font-medium mb-1">{t("investMobile1")}</p>
                  <a
                    href="tel:+918949199709"
                    className="text-sm font-semibold text-yellow-300 hover:text-yellow-200 transition-colors"
                    data-testid="link-investment-phone1"
                  >
                    +91 8949199709
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <Phone className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="text-xs text-white/60 font-medium mb-1">{t("investMobile2")}</p>
                  <a
                    href="tel:+917742039808"
                    className="text-sm font-semibold text-yellow-300 hover:text-yellow-200 transition-colors"
                    data-testid="link-investment-phone2"
                  >
                    +91 7742039808
                  </a>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <User className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="text-xs text-white/60 font-medium mb-1">{t("investLocationLabel")}</p>
                <p className="text-sm text-white">{t("investLocationValue")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <div className="bg-blue-900/30 border border-blue-400/50 rounded-lg p-4 text-center">
          <p className="text-sm text-blue-200">
            {t("investCta")}
          </p>
        </div>
      </div>
    </div>
  );
}
