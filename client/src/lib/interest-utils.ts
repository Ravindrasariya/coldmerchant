export function dateDiffInDays(startDateStr: string): number {
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const now = new Date();
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((todayMs - startMs) / (1000 * 60 * 60 * 24));
}

export function calculateSimpleInterest(
  principal: number,
  rateOfInterest: number,
  effectiveDate: string | null
): { interest: number; days: number; finalAmount: number } {
  if (!effectiveDate || !rateOfInterest || rateOfInterest <= 0 || principal <= 0) {
    return { interest: 0, days: 0, finalAmount: principal > 0 ? principal : 0 };
  }
  const days = dateDiffInDays(effectiveDate);
  if (days <= 0) return { interest: 0, days: 0, finalAmount: principal };
  const interest = Math.round((principal * rateOfInterest * days / (365 * 100)) * 100) / 100;
  return { interest, days, finalAmount: principal + interest };
}

export function calculateInterestOnly(
  principal: number,
  rateOfInterest: number,
  effectiveDate: string | null
): { interest: number; days: number } {
  const result = calculateSimpleInterest(principal, rateOfInterest, effectiveDate);
  return { interest: result.interest, days: result.days };
}
