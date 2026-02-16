const IST_TZ = 'Asia/Kolkata';

export function getISTDateString(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts;
}

export function getISTDateYYYYMMDD(): string {
  return getISTDateString().replace(/-/g, '');
}

export function getISTYear(): number {
  const now = new Date();
  return parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric' }).format(now));
}

export function dateDiffInDaysIST(startDateStr: string, endDateStr?: string): number {
  const endStr = endDateStr || getISTDateString();
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
}

export function dateToISTString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function calculateSimpleInterest(principal: number, rateOfInterest: number, effectiveDate: string | null): number {
  if (!effectiveDate || !rateOfInterest || rateOfInterest <= 0 || principal <= 0) {
    return principal;
  }
  const days = dateDiffInDaysIST(effectiveDate);
  if (days <= 0) return principal;
  return principal + (principal * rateOfInterest * days / (365 * 100));
}
