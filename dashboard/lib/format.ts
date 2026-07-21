// Compact number formatting: 4400000 -> '4.4M', 163000 -> '163k',
// 25000 -> '25k', 9500 -> '9.5k', 850 -> '850'
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return Math.round(n / 1000) + "k";
  if (n >= 1_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toLocaleString();
}
