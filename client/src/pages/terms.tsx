import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ScrollText } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useHomeRoute } from "@/hooks/use-auth";

const defaultTerms = {
  intro: "Mitrify.com का उपयोग करने से पहले कृपया निम्नलिखित नियमों और शर्तों को ध्यान से पढ़ें। इस वेबसाइट का उपयोग करके, आप इन शर्तों से सहमत होते हैं:",
  sections: [
    {
      title: "1. हमारी भूमिका (Our Role)",
      content: "Mitrify.com एक सूचना प्रदाता (Information Provider) मंच है। हमारा प्राथमिक कार्य केवल उन ग्राहकों को सर्विस प्रोवाइडर्स (Service Providers) के संपर्क नंबर और जानकारी प्रदान करना है, जिन्हें किसी विशिष्ट सेवा की आवश्यकता है।"
    },
    {
      title: "2. हम सर्विस प्रोवाइडर नहीं हैं",
      content: "यह स्पष्ट किया जाता है कि Mitrify.com स्वयं कोई सेवा (जैसे रिपेयरिंग, इंस्टॉलेशन, या अन्य प्रोफेशनल वर्क) प्रदान नहीं करता है। हम केवल एक माध्यम (Bridge) हैं जो आपको स्वतंत्र सर्विस प्रोवाइडर्स के साथ जोड़ते हैं।"
    },
    {
      title: "3. कार्य की गुणवत्ता और गारंटी (Service Quality)",
      content: "हम किसी भी सर्विस प्रोवाइडर द्वारा किए गए कार्य की गुणवत्ता, शुद्धता या पूर्णता की गारंटी नहीं देते हैं। ग्राहक और सर्विस प्रोवाइडर के बीच होने वाले किसी भी विवाद, काम में देरी, या काम की खराबी के लिए Mitrify.com उत्तरदायी नहीं होगा।"
    },
    {
      title: "4. भुगतान और वित्तीय लेन-देन (Payments & Transactions)",
      content: "ग्राहक और सर्विस प्रोवाइडर के बीच होने वाले किसी भी पैसों के लेन-देन, फीस, या भुगतान (Payment) से Mitrify.com का कोई संबंध नहीं है। हम किसी भी प्रकार के वित्तीय नुकसान, धोखाधड़ी या भुगतान संबंधी विवादों के लिए ज़िम्मेदार नहीं होंगे। हम ग्राहकों को सलाह देते हैं कि भुगतान करने से पहले सर्विस प्रोवाइडर की पूरी जाँच कर लें।"
    },
    {
      title: "5. डेटा और संपर्क जानकारी",
      content: "हम सर्विस प्रोवाइडर्स द्वारा दी गई जानकारी के आधार पर उनके नंबर साझा करते हैं। हालांकि हम जानकारी को सही रखने का प्रयास करते हैं, लेकिन हम किसी भी नंबर की निरंतर उपलब्धता या उसकी सत्यता की गारंटी नहीं देते।"
    },
    {
      title: "6. सुरक्षा और सावधानी",
      content: "ग्राहकों को सलाह दी जाती है कि किसी भी अनजान व्यक्ति (सर्विस प्रोवाइडर) को अपने घर या कार्यस्थल पर बुलाते समय अपनी सुरक्षा का ध्यान रखें। किसी भी अप्रिय घटना या सुरक्षा संबंधी समस्या के लिए Mitrify.com जिम्मेदार नहीं होगा।"
    },
    {
      title: "7. शर्तों में बदलाव",
      content: "Mitrify.com के पास बिना किसी पूर्व सूचना के इन नियमों और शर्तों को बदलने का पूर्ण अधिकार सुरक्षित है।"
    },
  ],
  footer: "Mitrify.com का उपयोग करने का अर्थ है कि आपने उपरोक्त सभी शर्तों को समझ लिया है और आप इनसे पूरी तरह सहमत हैं।",
};

export default function TermsPage() {
  const [, setLocation] = useLocation();
  const homeRoute = useHomeRoute();

  const { data: termsData } = useQuery<typeof defaultTerms | null>({
    queryKey: ["/api/content", "terms"],
    queryFn: async () => {
      const res = await fetch("/api/content/terms");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 0,
  });

  const terms = termsData || defaultTerms;

  return (
    <div className="min-h-screen bg-background">
      <div className="gradient-hero dark:gradient-hero-dark pt-3 pb-4 px-4 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation(homeRoute)} className="text-white/80" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-white" />
              <div>
                <h1 className="text-lg font-bold text-white leading-tight" data-testid="text-terms-title">नियम एवं शर्तें</h1>
                <p className="text-white/70 text-xs">Terms & Conditions & Disclaimer</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 max-w-lg mx-auto space-y-3">
        <Card className="shadow-lg border-0 ring-1 ring-border/50">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {terms.intro}
            </p>
          </CardContent>
        </Card>

        {terms.sections.map((section: any, i: number) => (
          <Card key={i} className="shadow-sm border-0 ring-1 ring-border/50">
            <CardContent className="pt-5 pb-4">
              <h3 className="text-sm font-semibold mb-2 text-foreground" data-testid={`text-section-${i + 1}`}>{section.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
            </CardContent>
          </Card>
        ))}

        <Card className="shadow-lg border-0 ring-1 ring-border/50 bg-primary/5">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground leading-relaxed text-center font-medium">
              {terms.footer}
            </p>
          </CardContent>
        </Card>

        <div className="text-center pt-2 pb-6">
          <Button variant="link" className="text-sm" onClick={() => setLocation("/about")} data-testid="link-about">
            About Us
          </Button>
          <span className="text-muted-foreground mx-2">|</span>
          <Button variant="link" className="text-sm" onClick={() => setLocation(homeRoute)} data-testid="link-back">
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
