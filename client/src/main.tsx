import { createRoot } from "react-dom/client";
import "./lib/backend-off";
import "./index.css";
import { getPortal, isApiPortal } from "./lib/portal";

const root = createRoot(document.getElementById("root")!);
const portal = getPortal();

// Clinic portals load only their own code, not the main site's, so they open quickly on low-end phones.
// The API portal does the same.
if (isApiPortal()) {
  import("./pages/api-portal").then(({ default: ApiPortal }) => root.render(<ApiPortal />));
} else if (portal) {
  import("./pages/portal-home").then(({ default: PortalHome }) => root.render(<PortalHome portal={portal} />));
} else {
  import("./App").then(({ default: App }) => root.render(<App />));
}
