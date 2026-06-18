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

// Resolve the business date for a transaction as a JS Date.
// Prefers the user-chosen "Date of Loading" (a plain YYYY-MM-DD string) and
// falls back to the row creation timestamp for legacy rows that never stored
// one. The YYYY-MM-DD value is parsed as LOCAL midnight (not UTC) so the
// displayed/filtered calendar day stays correct for IST users.
export function resolveTxnDate(txn: { dateOfLoading?: string | null; createdAt: string | Date }): Date {
  const dol = txn.dateOfLoading;
  if (dol && /^\d{4}-\d{2}-\d{2}/.test(dol)) {
    const [y, m, d] = dol.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(txn.createdAt);
}
