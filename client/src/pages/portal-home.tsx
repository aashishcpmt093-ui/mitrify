import { lazy, Suspense, useEffect } from "react";
import PatientIntakeForm from "@/components/patient-intake-form";
import ClinicLogo from "@/components/clinic/clinic-logo";
import { saveIntake, useClinicProfile } from "@/lib/clinic";
import { PORTALS, type PortalKey } from "@/lib/portal";

// The patient page stays small; staff and doctor code loads only on those pages.
const StaffPortal = lazy(() => import("@/components/clinic/staff-portal"));
const DoctorPortal = lazy(() => import("@/components/clinic/doctor-portal"));

export default function PortalHome({ portal }: { portal: PortalKey }) {
  const { title } = PORTALS[portal];
  const { clinicName } = useClinicProfile();

  // The tab title and icon must show the clinic, not the main site.
  useEffect(() => {
    document.title = `${title} · ${clinicName}`;
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').forEach((l) => l.remove());
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/svg+xml";
    icon.href = "/clinic-icon.svg";
    document.head.appendChild(icon);
  }, [title, clinicName]);

  return (
    <div className="min-h-screen flex flex-col items-center gap-6 p-6 bg-background text-foreground print:block print:p-0 print:min-h-0 print:bg-white">
      <div className="flex flex-col items-center gap-2 print:hidden">
        <ClinicLogo />
        <p className="text-lg font-semibold text-teal-700">{clinicName}</p>
      </div>
      <h1 className="text-3xl font-semibold text-center print:hidden">{title}</h1>

      {portal === "patients" && (
        <PatientIntakeForm onSave={(input) => saveIntake(input, { source: "patient" })} />
      )}
      <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
        {portal === "staff" && <StaffPortal />}
        {portal === "doctors" && <DoctorPortal />}
      </Suspense>
    </div>
  );
}
