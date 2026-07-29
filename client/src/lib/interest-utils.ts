export function dateDiffInDays(startDateStr: string, toDateStr?: string): number {
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  let endMs: number;
  if (toDateStr) {
    const [ey, em, ed] = toDateStr.split('-').map(Number);
    endMs = Date.UTC(ey, em - 1, ed);
  } else {
    const now = new Date();
    endMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
}

/**
 * Compute interest breakdown from effectiveDate.
 * When endDate is provided, interest is capped at min(today, endDate) —
 * interest stops accumulating after the end date even if the amount is still due.
 */
export function calculateSimpleInterest(
  principal: number,
  rateOfInterest: number,
  effectiveDate: string | null,
  endDate?: string | null,
): { interest: number; days: number; finalAmount: number } {
  if (!effectiveDate || !rateOfInterest || rateOfInterest <= 0 || principal <= 0) {
    return { interest: 0, days: 0, finalAmount: principal > 0 ? principal : 0 };
  }
  // Determine effective "to" date: min(today, endDate) when endDate is provided
  let toDateStr: string | undefined;
  if (endDate) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // Only cap if endDate is strictly before today
    toDateStr = endDate < today ? endDate : undefined;
  }
  const days = dateDiffInDays(effectiveDate, toDateStr);
  if (days <= 0) return { interest: 0, days: 0, finalAmount: principal };
  const interest = Math.round((principal * rateOfInterest * days / (365 * 100)) * 100) / 100;
  return { interest, days, finalAmount: principal + interest };
}

export function calculateInterestOnly(
  principal: number,
  rateOfInterest: number,
  effectiveDate: string | null,
  endDate?: string | null,
): { interest: number; days: number } {
  const result = calculateSimpleInterest(principal, rateOfInterest, effectiveDate, endDate);
  return { interest: result.interest, days: result.days };
}
