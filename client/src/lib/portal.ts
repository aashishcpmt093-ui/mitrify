// Subdomain portals: patients.mitrify.com, staff.mitrify.com, doctors.mitrify.com.
// All three are served by the same build; the first label of the hostname picks the portal.
export const PORTALS = {
  patients: {
    title: "Patient Portal",
    description: "Mitrify patients: sign in to find care and manage your details.",
  },
  staff: {
    title: "Staff Portal",
    description: "Mitrify staff: sign in to access your daily work.",
  },
  doctors: {
    title: "Doctor Portal",
    description: "Mitrify doctors: sign in to view your patients and schedule.",
  },
} as const;

export type PortalKey = keyof typeof PORTALS;

export const MAIN_SITE_URL = "https://mitrify.com";

export function getPortal(hostname: string = window.location.hostname): PortalKey | null {
  const label = hostname.split(".")[0];
  return label in PORTALS ? (label as PortalKey) : null;
}
