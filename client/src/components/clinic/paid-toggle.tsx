// Paid / Unpaid choice for old patients and revisits, so a free follow-up does not count as revenue.
export default function PaidToggle({
  paid,
  fee,
  onChange,
}: {
  paid: boolean;
  fee: number;
  onChange: (paid: boolean) => void;
}) {
  const option = (value: boolean, label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={paid === value}
      className={`flex-1 px-3 py-2 text-sm font-medium ${
        paid === value
          ? value
            ? "bg-green-600 text-white"
            : "bg-slate-600 text-white"
          : "bg-background hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Fee</span>
      <div className="flex overflow-hidden rounded-md border">
        {option(true, fee ? `Paid · ₹${fee.toLocaleString("en-IN")}` : "Paid")}
        {option(false, "Unpaid / free")}
      </div>
    </div>
  );
}
