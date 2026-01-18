export type StatusLevel = "good" | "warning" | "bad";

interface StatusIndicatorProps {
  status: StatusLevel;
  label?: string;
}

const statusConfig: Record<StatusLevel, { color: string; text: string }> = {
  good: { color: "text-emerald-400", text: "good" },
  warning: { color: "text-amber-400", text: "okay" },
  bad: { color: "text-red-400", text: "low" },
};

export default function StatusIndicator({ status, label }: StatusIndicatorProps) {
  const config = statusConfig[status];
  return (
    <div className={`flex items-center gap-1.5 ${config.color}`}>
      <span className="text-[10px]">●</span>
      <span className="text-[10px] uppercase tracking-wider">{label || config.text}</span>
    </div>
  );
}
