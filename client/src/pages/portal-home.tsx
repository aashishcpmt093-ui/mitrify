import { Button } from "@/components/ui/button";
import PatientIntakeForm from "@/components/patient-intake-form";
import { MAIN_SITE_URL, PORTALS, type PortalKey } from "@/lib/portal";

export default function PortalHome({ portal }: { portal: PortalKey }) {
  const { title, description } = PORTALS[portal];

  // Patient and staff portals show the intake form only.
  if (portal === "patients" || portal === "staff") {
    return (
      <div className="min-h-screen flex flex-col items-center gap-6 p-6 bg-background text-foreground">
        <img src="/logo.png" alt="Mitrify" className="h-16 w-auto" />
        <h1 className="text-3xl font-semibold text-center">{title}</h1>
        <PatientIntakeForm />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center bg-background text-foreground">
      <img src="/logo.png" alt="Mitrify" className="h-16 w-auto" />
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="max-w-md text-muted-foreground">{description}</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button asChild size="lg">
          <a href={`${MAIN_SITE_URL}/login`}>Sign in</a>
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href={MAIN_SITE_URL}>Go to Mitrify</a>
        </Button>
      </div>
    </div>
  );
}
