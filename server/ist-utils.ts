const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function getISTNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MS);
}

export function getISTDateString(): string {
  const ist = getISTNow();
  return ist.toISOString().split('T')[0];
}

export function getISTDateYYYYMMDD(): string {
  return getISTDateString().replace(/-/g, '');
}

export function getISTYear(): number {
  return getISTNow().getUTCFullYear();
}

export function getISTMidnight(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

export function getISTTodayMidnight(): Date {
  return getISTMidnight(getISTDateString());
}

export function dateDiffInDaysIST(startDateStr: string, endDateStr?: string): number {
  const endStr = endDateStr || getISTDateString();
  const start = getISTMidnight(startDateStr);
  const end = getISTMidnight(endStr);
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function toISTTimestamp(): Date {
  return getISTNow();
}

export function dateToISTString(date: Date): string {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  return istDate.toISOString().split('T')[0];
}
