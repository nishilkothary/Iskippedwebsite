import { LARGE_AMOUNT_CONFIRMATION_THRESHOLD } from "@/lib/constants/amountLimits";
import { formatCurrency } from "@/lib/utils/currency";

type LargeAmountKind = "skip" | "donation";

export function needsLargeAmountConfirmation(amount: number): boolean {
  return Number.isFinite(amount) && amount >= LARGE_AMOUNT_CONFIRMATION_THRESHOLD;
}

export function getLargeAmountConfirmationMessage(
  kind: LargeAmountKind,
  amount: number,
  destination?: string,
): string {
  if (kind === "skip") {
    const destinationText = destination ? ` for ${destination}` : "";
    return `That’s a big skip—nice!\n\nYou’re about to log ${formatCurrency(amount)} as a skip${destinationText}. Is that correct?`;
  }

  const destinationText = destination ? ` to ${destination}` : "";
  return `What a generous donation!\n\nYou’re about to log a ${formatCurrency(amount)} donation${destinationText}. Is that correct?`;
}

export function confirmLargeAmount(
  kind: LargeAmountKind,
  amount: number,
  destination?: string,
): boolean {
  return !needsLargeAmountConfirmation(amount)
    || window.confirm(getLargeAmountConfirmationMessage(kind, amount, destination));
}
