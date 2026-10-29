import { createRoot } from "react-dom/client";
import "./lib/backend-off";
import "./index.css";
import { getPortal } from "./lib/portal";

const root = createRoot(document.getElementById("root")!);
const portal = getPortal();

// Clinic portals load only their own code, not the main site's, so they open quickly on low-end phones.
if (portal) {
  import("./pages/portal-home").then(({ default: PortalHome }) => root.render(<PortalHome portal={portal} />));
} else {
  import("./App").then(({ default: App }) => root.render(<App />));
}
