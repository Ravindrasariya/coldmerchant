const istFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getTodayIST(): string {
  return istFormatter.format(new Date());
}

export function formatDateIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return istFormatter.format(d);
}

export function getISTYear(date?: Date | string): number {
  const d = date == null ? new Date() : (typeof date === 'string' ? new Date(date) : date);
  // istFormatter (en-CA) yields "YYYY-MM-DD" — first 4 chars are the IST year.
  return parseInt(istFormatter.format(d).slice(0, 4), 10);
}
