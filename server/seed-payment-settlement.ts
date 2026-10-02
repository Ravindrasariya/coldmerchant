import { SeedPaymentValidationError, seedMoneyCents } from "@shared/seed-payment";
import type { SeedSettlementTarget } from "@shared/schema";
import { cashEntries, farmers, seedTransactions } from "@shared/schema";
import { and, asc, eq } from "drizzle-orm";

type SeedCashEntryInput = {
  id: number;
  merchantId: number;
  amount: string | number;
  pettyAdjustment?: string | number | null;
  farmerId?: number | null;
  farmerName?: string | null;
  farmerContact?: string | null;
  farmerVillage?: string | null;
};

const normalize = (value: string | null | undefined): string =>
  (value || "").trim().toLowerCase();

function moneyToCents(value: string | number | null | undefined, label: string): number {
  const normalized = typeof value === "string" ? value.trim() : value;
  return seedMoneyCents(normalized === "" || normalized == null ? 0 : normalized, label);
}

const centsString = (value: number): string => (value / 100).toFixed(2);

/**
 * Atomically applies a seed sale receipt and its non-cash petty adjustment in
 * receivable-first, then oldest-seed-transaction order. The caller owns the
 * surrounding transaction and has already inserted the cash entry.
 */
export async function settleSeedPayment(tx: any, entry: SeedCashEntryInput): Promise<SeedSettlementTarget[]> {
  // Lock merchant farmer rows and seed transactions before resolving identity
  // or inspecting due balances. This serializes concurrent payments to a farmer.
  const merchantFarmers = await tx.select().from(farmers)
    .where(eq(farmers.merchantId, entry.merchantId))
    .orderBy(asc(farmers.id))
    .for("update");
  const merchantSeedTxns = await tx.select().from(seedTransactions)
    .where(eq(seedTransactions.merchantId, entry.merchantId))
    .orderBy(asc(seedTransactions.createdAt), asc(seedTransactions.id))
    .for("update");

  let actualCents = moneyToCents(entry.amount, "Amount");
  let pettyCents = moneyToCents(entry.pettyAdjustment, "Petty adjustment");
  const totalCents = actualCents + pettyCents;
  if (totalCents <= 0) {
    throw new SeedPaymentValidationError("Amount and petty adjustment must settle a positive amount");
  }

  let normalizedName = normalize(entry.farmerName);
  let normalizedContact = normalize(entry.farmerContact);
  let normalizedVillage = normalize(entry.farmerVillage);
  if (!normalizedName) {
    throw new SeedPaymentValidationError("A farmer is required for a seed payment");
  }
  const matchesComposite = (row: { name?: string | null; farmerName?: string | null; contact?: string | null; farmerContact?: string | null; village?: string | null }) =>
    normalize(row.name ?? row.farmerName) === normalizedName &&
    normalize(row.contact ?? row.farmerContact) === normalizedContact &&
    normalize(row.village) === normalizedVillage;

  let matchedFarmer: typeof merchantFarmers[number] | undefined;
  if (entry.farmerId != null) {
    if (!Number.isInteger(entry.farmerId) || entry.farmerId <= 0) {
      throw new SeedPaymentValidationError("Invalid farmer ID");
    }
    matchedFarmer = merchantFarmers.find((farmer: any) => farmer.id === entry.farmerId);
    if (!matchedFarmer) {
      throw new SeedPaymentValidationError("Farmer does not exist for this merchant");
    }
    if (normalizedName !== normalize(matchedFarmer.name) ||
        (normalizedContact && normalizedContact !== normalize(matchedFarmer.contact)) ||
        (normalizedVillage && normalizedVillage !== normalize(matchedFarmer.village))) {
      throw new SeedPaymentValidationError("Farmer ID does not match the selected farmer");
    }
    // The selected ledger row is authoritative for matching older transactions
    // that predate farmer IDs, even when optional contact/village weren't sent.
    normalizedContact = normalize(matchedFarmer.contact);
    normalizedVillage = normalize(matchedFarmer.village);
  } else {
    const matches = merchantFarmers.filter((farmer: any) => matchesComposite(farmer));
    if (matches.length > 1) {
      throw new SeedPaymentValidationError("Farmer identity is ambiguous; select a farmer ID");
    }
    matchedFarmer = matches[0];
  }

  const matchedFarmerId = matchedFarmer?.id ?? null;
  const matchingSeedTxns = merchantSeedTxns.filter((txn: any) => {
    if (matchedFarmerId != null) {
      return txn.farmerId === matchedFarmerId || (txn.farmerId == null && matchesComposite(txn));
    }
    return txn.farmerId == null && matchesComposite(txn);
  });

  let remainingDueCents = 0;
  let receivableCents = 0;
  if (matchedFarmer) {
    receivableCents = moneyToCents(matchedFarmer.remainingReceivable || "0", "Farmer receivable");
    remainingDueCents += receivableCents;
  }
  const seedDueCents = new Map<number, number>();
  for (const txn of matchingSeedTxns) {
    const due = moneyToCents(txn.totalDueToFarmer || "0", "Seed transaction due");
    seedDueCents.set(txn.id, due);
    remainingDueCents += due;
  }

  if (remainingDueCents <= 0) {
    throw new SeedPaymentValidationError("This farmer has no outstanding seed sale due");
  }
  if (totalCents > remainingDueCents) {
    throw new SeedPaymentValidationError(`Settlement total ₹${centsString(totalCents)} exceeds outstanding due ₹${centsString(remainingDueCents)}`);
  }

  const targets: SeedSettlementTarget[] = [];
  let totalLeft = totalCents;
  const addTarget = async (target: { farmerId?: number; seedTransactionId?: number }, dueCents: number) => {
    const settledCents = Math.min(totalLeft, dueCents);
    if (settledCents <= 0) return;
    const actualPart = Math.min(actualCents, settledCents);
    const pettyPart = settledCents - actualPart;
    actualCents -= actualPart;
    pettyCents -= pettyPart;
    totalLeft -= settledCents;
    targets.push({
      ...target,
      amount: centsString(actualPart),
      pettyAdjustment: centsString(pettyPart),
    });

    if (target.farmerId != null) {
      const updated = Math.max(0, dueCents - settledCents);
      const rows = await tx.update(farmers)
        .set({ remainingReceivable: centsString(updated) })
        .where(and(eq(farmers.id, target.farmerId), eq(farmers.merchantId, entry.merchantId)))
        .returning({ id: farmers.id });
      if (!rows.length) throw new SeedPaymentValidationError("Farmer receivable target disappeared during settlement");
    } else if (target.seedTransactionId != null) {
      const updated = dueCents - settledCents;
      const rows = await tx.update(seedTransactions)
        .set({ totalDueToFarmer: centsString(updated) })
        .where(and(eq(seedTransactions.id, target.seedTransactionId), eq(seedTransactions.merchantId, entry.merchantId)))
        .returning({ id: seedTransactions.id });
      if (!rows.length) throw new SeedPaymentValidationError("Seed transaction target disappeared during settlement");
    }
  };

  if (matchedFarmer && receivableCents > 0) {
    await addTarget({ farmerId: matchedFarmer.id }, receivableCents);
  }
  for (const txn of matchingSeedTxns) {
    if (totalLeft <= 0) break;
    const due = seedDueCents.get(txn.id) || 0;
    if (due > 0) await addTarget({ seedTransactionId: txn.id }, due);
  }
  if (totalLeft !== 0) {
    throw new SeedPaymentValidationError("Settlement could not be fully allocated to current due");
  }

  const normalizedActual = moneyToCents(entry.amount, "Amount");
  const normalizedPetty = moneyToCents(entry.pettyAdjustment, "Petty adjustment");
  await tx.update(cashEntries)
    .set({
      amount: centsString(normalizedActual),
      pettyAdjustment: centsString(normalizedPetty),
      farmerId: matchedFarmerId,
      seedSettlementTargets: targets,
    })
    .where(and(eq(cashEntries.id, entry.id), eq(cashEntries.merchantId, entry.merchantId)));

  return targets;
}