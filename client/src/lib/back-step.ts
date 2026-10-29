import { useEffect, useRef } from "react";

// Screens opened inside a portal page (a patient's prescription, a registration form, ...) each add a
// browser history entry, so the phone's back button closes the screen instead of leaving the site.
// Screens can be nested; back always closes the innermost one.

type Step = { close: () => boolean | void; closedByBack: boolean };

const steps: Step[] = [];
// History moves this code makes itself (after a screen is closed with an on-screen button) are skipped.
let ownMoves = 0;
let pendingBacks = 0;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (ownMoves > 0) {
      ownMoves -= 1;
      return;
    }
    const step = steps.pop();
    if (!step) return;
    // A screen may refuse to close (e.g. the doctor chooses to keep an unsaved prescription).
    if (step.close() === false) {
      steps.push(step);
      history.pushState({ clinicStep: true }, "");
      return;
    }
    step.closedByBack = true;
  });
}

// Several screens closing together (an outer one takes inner ones with it) need a single history move.
function goBackOnce() {
  pendingBacks += 1;
  if (pendingBacks > 1) return;
  queueMicrotask(() => {
    const count = pendingBacks;
    pendingBacks = 0;
    ownMoves += 1;
    history.go(-count);
  });
}

// While `open`, the phone's back button calls `close`. Return false from `close` to stay open.
export function useBackStep(open: boolean, close: () => boolean | void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const step: Step = { close: () => closeRef.current(), closedByBack: false };
    steps.push(step);
    history.pushState({ clinicStep: true }, "");
    return () => {
      if (step.closedByBack) return;
      const i = steps.indexOf(step);
      if (i >= 0) steps.splice(i, 1);
      goBackOnce();
    };
  }, [open]);
}
