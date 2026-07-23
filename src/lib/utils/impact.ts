// Pluralized forms for known unit names
const PLURAL_MAP: Record<string, string> = {
  "Day of Education": "Days of Education",
  "Day of Educational Support": "Days of Educational Support",
  "Life-Saving Meal": "Life-Saving Meals",
  "Emergency Meal": "Emergency Meals",
  "Meal for Families": "Meals for Families",
  "Meal": "Meals",
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

/**
 * Singular form of a unit name. `unitName` is meant to be singular already, but some
 * cause docs were saved with a plural ("Chromebooks"), so fold those back.
 */
export function singularUnit(unitName: string): string {
  const fromMap = Object.entries(PLURAL_MAP).find(([, plural]) => plural === unitName)?.[0];
  if (fromMap) return fromMap;
  if (/(?:ss|us|is)$/i.test(unitName)) return unitName;
  return unitName.replace(/s$/, "");
}

/**
 * One unit with its article, for "88% of ___" phrasing on goal-style causes.
 * e.g. "a Chromebook", "an Emergency Meal"
 */
export function oneUnitPhrase(unitName: string): string {
  const singular = singularUnit(unitName);
  return `${/^[aeiou]/i.test(singular) ? "an" : "a"} ${singular}`;
}
