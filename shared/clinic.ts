// Clinic branding for the patients / staff / doctors portals. These portals must not show
// Mitrify anywhere, so they use this name and the clinic icon instead. Change the name here.
export const CLINIC_NAME = "Dr. Asheesh Clinic";

// Hostname labels (and ?portal= values) that open a clinic portal.
export const PORTAL_KEYS = ["patients", "staff", "doctors"] as const;

// Printed prescription pad, copied from the doctor's paper pad.
export const PRESCRIPTION_PAD = {
  doctorName: "DR. ASHEESH",
  degrees: "M.B.B.S., F.I.P",
  registration: "Regd.No.89981",
  addressLines: ["Near Punjab National Bank", "Labella Chowk", "Bundaun"],
  mobile: "Mob.: 8949199709",
  timings: ["Evening: 5:30 pm to 8:00 pm"],
};

// Firebase project the clinic portals use; the server checks doctor sign-ins against it.
export const FIREBASE_PROJECT_ID = "mitrify-asheesh";
