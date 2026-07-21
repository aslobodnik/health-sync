// All date strings in this app are 'YYYY-MM-DD' in Eastern time (the DB
// converts with AT TIME ZONE 'America/New_York'). These helpers keep that
// discipline on the server (Vercel runs UTC) and the client alike.

const ET = "America/New_York";

// Today's date in Eastern time as 'YYYY-MM-DD'
export function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ET }).format(new Date());
}

// Day-of-year (1-366) for today in Eastern time
export function dayOfYearET(): number {
  const today = parseLocalDate(todayET());
  const jan1 = new Date(today.getFullYear(), 0, 1);
  return Math.round((today.getTime() - jan1.getTime()) / 86_400_000) + 1;
}

// Parse 'YYYY-MM-DD' as a local Date (no UTC shift). ISO timestamps pass
// through to the native parser.
export function parseLocalDate(dateStr: string): Date {
  if (dateStr.includes("T") || dateStr.includes(" ")) return new Date(dateStr);
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// 'Jul 19'
export function formatShortDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// 'MON'
export function weekdayShort(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
  });
}

// 'today' / 'yesterday' / 'Mon' (within a week) / 'Jul 19', relative to ET today
export function relativeDay(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const today = parseLocalDate(todayET());
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays > 1 && diffDays < 7) return weekdayShort(dateStr);
  return formatShortDate(dateStr);
}

export function isTodayET(dateStr: string): boolean {
  return dateStr.slice(0, 10) === todayET();
}
