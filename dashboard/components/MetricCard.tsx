import StatusIndicator, { StatusLevel } from "./StatusIndicator";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  status: StatusLevel;
  subtitle?: string;
}

export default function MetricCard({ label, value, unit, status, subtitle }: MetricCardProps) {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-4 sm:px-6 py-4 text-center min-w-[120px]">
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-2xl sm:text-3xl font-bold text-zinc-100 font-mono">{value}</span>
        {unit && <span className="text-xs sm:text-sm text-zinc-500">{unit}</span>}
      </div>
      <div className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider mt-1">{label}</div>
      <div className="mt-2 flex justify-center">
        <StatusIndicator status={status} />
      </div>
      {subtitle && <div className="text-[9px] text-zinc-600 mt-1">{subtitle}</div>}
    </div>
  );
}
