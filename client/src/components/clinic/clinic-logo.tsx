import { CLINIC_NAME } from "@shared/clinic";

// Same artwork as /clinic-icon.svg, inline so it shows without an extra request.
export default function ClinicLogo({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={CLINIC_NAME}>
      <rect width="64" height="64" rx="16" fill="#0f766e" />
      <path d="M27 14h10v13h13v10H37v13H27V37H14V27h13z" fill="#ffffff" />
    </svg>
  );
}
