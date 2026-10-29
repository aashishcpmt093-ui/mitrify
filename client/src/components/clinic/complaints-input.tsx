import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_COMPLAINTS } from "@/lib/medicines";

type Props = {
  value: string;
  onChange: (value: string) => void;
  // Complaints the doctor has typed before; built-in common complaints are added to these.
  remembered: string[];
};

// One complaint per line (Enter starts the next). While a line is being typed, matching complaints
// from memory are offered as buttons; tapping one completes the line.
export default function ComplaintsInput({ value, onChange, remembered }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lines = value.split("\n");
  const current = lines[lines.length - 1].trim().toLowerCase();
  const already = new Set(lines.slice(0, -1).map((l) => l.trim().toLowerCase()));

  const pool = [...remembered, ...COMMON_COMPLAINTS].filter(
    (c, i, all) => all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i,
  );
  const suggestions = current
    ? pool
        .filter((c) => c.toLowerCase().includes(current) && c.toLowerCase() !== current && !already.has(c.toLowerCase()))
        .slice(0, 6)
    : [];

  const pick = (complaint: string) => {
    onChange([...lines.slice(0, -1), complaint, ""].join("\n"));
    ref.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        ref={ref}
        id="complaints"
        rows={Math.min(6, Math.max(2, lines.length))}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"One complaint per line, e.g.\nFever x 3 days\nCough"}
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pick(s)}
              className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
