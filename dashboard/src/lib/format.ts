/**
 * Shared cost-formatting utility for the dashboard.
 * - n < $0.01  → "<$0.01"
 * - n >= $1000 → "$1,234.56"  (thousands separator)
 * - otherwise  → "$0.12"
 */
export function formatCost(n: number): string {
  if (n < 0.01) return '<$0.01';
  if (n >= 1_000) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return `$${n.toFixed(2)}`;
}

export function formatCostRange(low: number, high: number): string {
  return `${formatCost(low)} – ${formatCost(high)}`;
}
