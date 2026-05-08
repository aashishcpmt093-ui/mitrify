let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

export async function sendAiWeeklyReport(): Promise<{ sent: boolean; error?: string }> {
  console.log("[AI Weekly Report] sendAiWeeklyReport called — not yet implemented");
  return { sent: false, error: "Weekly report not yet implemented" };
}

export function rescheduleAiWeeklyReport(_day: number, _hour: number): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

export async function startAiWeeklyReportScheduler(): Promise<void> {
  console.log("[AI Weekly Report] Scheduler stub — not yet implemented");
}
