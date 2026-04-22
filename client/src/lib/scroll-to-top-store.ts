import { useEffect, useState } from "react";

let visible = false;
const listeners = new Set<(v: boolean) => void>();

export function setScrollToTopVisible(v: boolean) {
  if (visible === v) return;
  visible = v;
  listeners.forEach((l) => l(v));
}

export function useScrollToTopVisible(): boolean {
  const [v, setV] = useState(visible);
  useEffect(() => {
    listeners.add(setV);
    setV(visible);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}
