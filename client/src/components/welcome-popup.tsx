import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { PartyPopper, Sparkles, Heart, ArrowRight, CheckCircle2 } from "lucide-react";

const STORAGE_KEY = "mitrify_show_welcome";

export function markShowWelcomePopup() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
}

export default function WelcomePopup() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") {
        setOpen(true);
      }
    } catch {}
  }, []);

  const close = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="welcome-popup">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" />

      <div className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 fade-in duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500" />
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/20 animate-pulse" />
        <div className="absolute -bottom-12 -right-8 w-44 h-44 rounded-full bg-white/15 animate-pulse" style={{ animationDelay: "0.4s" }} />
        <div className="absolute top-1/3 right-6 w-3 h-3 rounded-full bg-white/60 animate-ping" />
        <div className="absolute bottom-1/4 left-8 w-2 h-2 rounded-full bg-white/70 animate-ping" style={{ animationDelay: "0.8s" }} />

        <div className="relative p-6 sm:p-7 text-white">
          {step === 1 && (
            <div className="flex flex-col items-center text-center animate-in slide-in-from-bottom-4 duration-500">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full bg-white/30 blur-xl animate-pulse" />
                <div className="relative w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-xl">
                  <PartyPopper className="w-10 h-10 text-orange-500" />
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-bold tracking-wide uppercase">Congratulations</span>
                <Sparkles className="w-3.5 h-3.5" />
              </div>

              <h2 className="text-2xl font-extrabold mb-3 hindi-text drop-shadow" data-testid="text-welcome-title-1">
                बहुत-बहुत बधाई!
              </h2>

              <p className="text-base font-medium leading-relaxed hindi-text text-white/95 mb-6" data-testid="text-welcome-body-1">
                अब आप हम से जुड़ गए हैं, जल्द ही हम आपके ग्राहक ढूँढने का प्रचार शुरू करेंगे!
              </p>

              <Button
                onClick={() => setStep(2)}
                className="w-full h-12 rounded-2xl bg-white text-orange-600 hover:bg-white/95 font-bold text-base shadow-lg gap-2 group"
                data-testid="button-welcome-next"
              >
                Next
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Button>

              <div className="flex gap-1.5 mt-4">
                <span className="w-6 h-1.5 rounded-full bg-white" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col text-center animate-in slide-in-from-right-4 fade-in duration-500">
              <div className="flex justify-center mb-3">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-white/30 blur-xl animate-pulse" />
                  <div className="relative w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-xl">
                    <Heart className="w-8 h-8 text-pink-500 fill-pink-500" />
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-extrabold mb-3 hindi-text" data-testid="text-welcome-title-2">
                हमारा मिशन
              </h3>

              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 mb-5 max-h-[50vh] overflow-y-auto text-left">
                <p className="text-sm leading-relaxed hindi-text text-white mb-3" data-testid="text-welcome-body-2">
                  हमारी वेबसाइट उन गरीब मजदूरों और छोटे कारीगरों के लिए है, जिनका काम-धंधा इन दिनों ठीक से नहीं चल रहा है और जो अपने काम का सही तरीके से प्रचार नहीं कर पा रहे हैं।
                </p>
                <p className="text-sm leading-relaxed hindi-text text-white mb-3">
                  जब एक बार बड़ी संख्या में ऐसे मेहनती मजदूर और कारीगर हमारी वेबसाइट पर रजिस्टर हो जाएंगे, तब हम उनके लिए ग्राहकों को ढूंढने हेतु व्यापक प्रचार-प्रसार शुरू करेंगे।
                </p>
                <p className="text-sm leading-relaxed hindi-text text-white font-semibold">
                  आप अपने दोस्तों, भाइयों और रिश्तेदारों को भी <span className="underline decoration-white/70">mitrify.com</span> पर आमंत्रित करें, ताकि हम जल्द से जल्द ग्राहकों को जोड़ने का कार्य शुरू कर सकें।
                </p>
              </div>

              <Button
                onClick={close}
                className="w-full h-12 rounded-2xl bg-white text-orange-600 hover:bg-white/95 font-bold text-base shadow-lg gap-2"
                data-testid="button-welcome-done"
              >
                <CheckCircle2 className="w-5 h-5" />
                Done
              </Button>

              <div className="flex justify-center gap-1.5 mt-4">
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                <span className="w-6 h-1.5 rounded-full bg-white" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
