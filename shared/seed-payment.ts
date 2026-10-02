/** Seed settlement is not cash movement: never add petty to cash-entry amount. */
export class SeedPaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedPaymentValidationError";
  }
}

export function seedMoneyCents(value: unknown, label: string, blankIsZero = false): number {
  if (blankIsZero && (value === undefined || value === null || value === "")) return 0;
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))) {
    throw new SeedPaymentValidationError(`${label} must be a non-negative amount with at most two decimal places`);
  }
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents) ||
      cents > 999999999999 || Math.abs(amount * 100 - cents) > 0.0001) {
    throw new SeedPaymentValidationError(`${label} must be a finite non-negative amount with at most two decimal places`);
  }
  return cents;
}

export function validateSeedPayment(amount: unknown, petty: unknown, due?: unknown) {
  const amountCents = seedMoneyCents(amount, "Amount");
  const pettyCents = seedMoneyCents(petty, "Petty Adj", true);
  const totalCents = amountCents + pettyCents;
  if (totalCents <= 0) throw new SeedPaymentValidationError("Amount + Petty Adj must be greater than zero");
  if (due !== undefined) {
    const dueCents = seedMoneyCents(due, "Outstanding due");
    if (dueCents <= 0 || totalCents > dueCents) {
      throw new SeedPaymentValidationError(`Total Settled cannot exceed outstanding due (₹${(dueCents / 100).toLocaleString("en-IN")})`);
    }
  }
  return { amountCents, pettyCents, totalCents };
}