// Pluralized forms for known unit names
const PLURAL_MAP: Record<string, string> = {
  "Day of Education": "Days of Education",
  "Life-Saving Meal": "Life-Saving Meals",
  "Emergency Meal": "Emergency Meals",
  "Meal for Families": "Meals for Families",
};

/**
 * Formats a dollar amount as a human-readable unit count.
 * e.g. formatUnits(4.11, 0.822, "Day of Education") → "5 Days of Education"
 */
export function formatUnits(amount: number, unitCost: number, unitName: string): string {
  const count = amount / unitCost;
  const display = count >= 10 ? Math.round(count) : parseFloat(count.toFixed(1));
  const label = count === 1 ? unitName : (PLURAL_MAP[unitName] ?? unitName + "s");
  return `${display} ${label}`;
}
