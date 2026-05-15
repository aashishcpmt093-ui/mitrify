import { initializeApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAqb1v62CsRF04e67T7DtZFGssr5KT0wYA",
  authDomain: "mitrifyindia.firebaseapp.com",
  projectId: "mitrifyindia",
  storageBucket: "mitrifyindia.firebasestorage.app",
  messagingSenderId: "100179659463",
  appId: "1:100179659463:web:254dd7853b43e3b69b0ce2",
  measurementId: "G-J7HV79T83H",
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
firebaseAuth.useDeviceLanguage();

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;
const RECAPTCHA_CONTAINER_ID = "firebase-recaptcha-container";

function getOrCreateRecaptchaContainer(): HTMLElement {
  let container = document.getElementById(RECAPTCHA_CONTAINER_ID);
  if (container) {
    container.remove();
  }
  container = document.createElement("div");
  container.id = RECAPTCHA_CONTAINER_ID;
  container.style.position = "fixed";
  container.style.bottom = "0";
  container.style.right = "0";
  container.style.width = "0";
  container.style.height = "0";
  container.style.overflow = "hidden";
  container.style.opacity = "0";
  document.body.appendChild(container);
  return container;
}

function cleanupRecaptcha() {
  if (recaptchaVerifier) {
    try { recaptchaVerifier.clear(); } catch {}
    recaptchaVerifier = null;
  }
  const container = document.getElementById(RECAPTCHA_CONTAINER_ID);
  if (container) {
    container.remove();
  }
}

function normalizePhoneNumber(phoneNumber: string): string {
  let formatted = phoneNumber.trim();
  if (!formatted) throw new Error("Mobile number required");
  if (!formatted.startsWith("+")) {
    formatted = "+91" + formatted.replace(/^0+/, "");
  }
  const digits = formatted.replace(/\D/g, "");
  if (digits.length < 10) {
    throw new Error("Invalid phone number. Use format: +91XXXXXXXXXX");
  }
  if (!formatted.startsWith("+")) {
    formatted = "+91" + digits.slice(-10);
  }
  return formatted;
}

function mapFirebaseOtpError(error: any): Error {
  const code = String(error?.code || "");
  if (code === "auth/operation-not-allowed") return new Error("Phone OTP is disabled. Please try another login method.");
  if (code === "auth/invalid-app-credential") return new Error("reCAPTCHA verification failed. Please try again.");
  if (code === "auth/too-many-requests") return new Error("Too many OTP attempts. Try again later.");
  if (code === "auth/invalid-phone-number") return new Error("Invalid phone number. Use format: +91XXXXXXXXXX");
  if (code === "auth/unauthorized-domain") return new Error("This domain is not authorized for OTP. Contact support.");
  if (code === "auth/app-not-authorized") return new Error("App not authorized for phone auth.");
  return error instanceof Error ? error : new Error("Failed to send OTP");
}

export async function sendFirebaseOtp(phoneNumber: string, _buttonId?: string): Promise<boolean> {
  try {
    const formatted = normalizePhoneNumber(phoneNumber);

    cleanupRecaptcha();
    const container = getOrCreateRecaptchaContainer();

    recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, container, {
      size: "invisible",
      callback: () => {},
    });

    await recaptchaVerifier.render();
    confirmationResult = await signInWithPhoneNumber(firebaseAuth, formatted, recaptchaVerifier);
    return true;
  } catch (error: any) {
    console.error("Firebase OTP send error:", error);
    cleanupRecaptcha();
    throw mapFirebaseOtpError(error);
  }
}

export async function verifyFirebaseOtp(otp: string): Promise<boolean> {
  if (!confirmationResult) {
    throw new Error("No OTP was sent. Please request OTP first.");
  }
  try {
    await confirmationResult.confirm(otp);
    confirmationResult = null;
    return true;
  } catch (error: any) {
    console.error("Firebase OTP verify error:", error);
    throw error;
  }
}
