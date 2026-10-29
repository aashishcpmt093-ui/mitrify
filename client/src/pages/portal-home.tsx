import { useEffect } from "react";
import PatientIntakeForm from "@/components/patient-intake-form";
import StaffPortal from "@/components/clinic/staff-portal";
import DoctorPortal from "@/components/clinic/doctor-portal";
import ClinicLogo from "@/components/clinic/clinic-logo";
import { saveIntake } from "@/lib/clinic";
import { PORTALS, type PortalKey } from "@/lib/portal";
import { CLINIC_NAME } from "@shared/clinic";

export default function PortalHome({ portal }: { portal: PortalKey }) {
  const { title } = PORTALS[portal];

  // The tab title and icon must show the clinic, not the main site.
  useEffect(() => {
    document.title = `${title} · ${CLINIC_NAME}`;
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').forEach((l) => l.remove());
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/svg+xml";
    icon.href = "/clinic-icon.svg";
    document.head.appendChild(icon);
  }, [title]);

  return (
    <div className="min-h-screen flex flex-col items-center gap-6 p-6 bg-background text-foreground">
      <div className="flex flex-col items-center gap-2 print:hidden">
        <ClinicLogo />
        <p className="text-lg font-semibold text-teal-700">{CLINIC_NAME}</p>
      </div>
      <h1 className="text-3xl font-semibold text-center print:hidden">{title}</h1>

      {portal === "patients" && (
        <PatientIntakeForm onSave={(input) => saveIntake(input, { source: "patient" })} />
      )}
      {portal === "staff" && <StaffPortal />}
      {portal === "doctors" && <DoctorPortal />}
    </div>
  );
}
