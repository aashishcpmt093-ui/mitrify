// Subdomain portals: patients.mitrify.com, staff.mitrify.com, doctors.mitrify.com.
// All three are served by the same build; the first label of the hostname picks the portal.
// They show the clinic's own branding (see @shared/clinic), never Mitrify.
import { PORTAL_KEYS } from "@shared/clinic";

export const PORTALS = {
  patients: { title: "Patient Registration" },
  staff: { title: "Staff" },
  doctors: { title: "Doctor" },
} as const satisfies Record<(typeof PORTAL_KEYS)[number], { title: string }>;

export type PortalKey = keyof typeof PORTALS;

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
