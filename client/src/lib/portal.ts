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

const isPortal = (value: string | null): value is PortalKey => value !== null && value in PORTALS;

// "?portal=doctors" on any host opens that portal too, so the portals work before
// the subdomains are connected.
export function getPortal(
  hostname: string = window.location.hostname,
  search: string = window.location.search,
): PortalKey | null {
  const fromQuery = new URLSearchParams(search).get("portal");
  if (isPortal(fromQuery)) return fromQuery;
  const label = hostname.split(".")[0];
  return isPortal(label) ? label : null;
}
