import { Button } from "@/components/ui/button";
import PatientIntakeForm from "@/components/patient-intake-form";
import StaffPortal from "@/components/clinic/staff-portal";
import DoctorPortal from "@/components/clinic/doctor-portal";
import { saveIntake } from "@/lib/clinic";
import { MAIN_SITE_URL, PORTALS, type PortalKey } from "@/lib/portal";

export default function PortalHome({ portal }: { portal: PortalKey }) {
  const { title } = PORTALS[portal];

  return (
    <div className="min-h-screen flex flex-col items-center gap-6 p-6 bg-background text-foreground">
      <img src="/logo.png" alt="Mitrify" className="h-16 w-auto" />
      <h1 className="text-3xl font-semibold text-center">{title}</h1>

      {portal === "patients" && (
        <PatientIntakeForm onSave={(input) => saveIntake(input, { source: "patient" })} />
      )}
      {portal === "staff" && <StaffPortal />}
      {portal === "doctors" && <DoctorPortal />}

      <Button asChild variant="ghost" size="sm" className="print:hidden">
        <a href={MAIN_SITE_URL}>Go to Mitrify</a>
      </Button>
    </div>
  );
}
