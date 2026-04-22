import { useState, useEffect, useCallback } from "react";

let deferredPrompt: any = null;

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    setIsStandalone(standalone);
    if (standalone) {
      setCanInstall(false);
      return;
    }

    setCanInstall(true);

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
    };

    window.addEventListener("beforeinstallprompt", handler);

    const installed = () => {
      setCanInstall(false);
      setIsStandalone(true);
      deferredPrompt = null;
    };
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const install = useCallback(async (): Promise<"installed" | "manual"> => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        setCanInstall(false);
        deferredPrompt = null;
        return "installed";
      }
      return "manual";
    }
    return "manual";
  }, []);

  return { canInstall, isStandalone, install };
}
