import { db } from "./db";
import { farmers, lots, seedTransactions } from "@shared/schema";
import { gt, isNotNull, and, sql } from "drizzle-orm";
import { calculateSimpleInterest, getISTDateString } from "./ist-utils";
import { log } from "./index";

export async function accrueInterestForAll(): Promise<void> {
  const today = getISTDateString();
  let farmerCount = 0;
  let lotCount = 0;
  let seedTxnCount = 0;

  const allFarmers = await db.select().from(farmers).where(
    and(
      gt(sql`CAST(${farmers.receivableInterestRate} AS numeric)`, 0),
      gt(sql`CAST(${farmers.remainingReceivable} AS numeric)`, 0),
      isNotNull(farmers.receivableEffectiveDate)
    )
  );

  for (const farmer of allFarmers) {
    const remaining = parseFloat(farmer.remainingReceivable || "0");
    const rate = parseFloat(farmer.receivableInterestRate || "0");
    if (remaining <= 0 || rate <= 0) continue;

    const dailyInterest = remaining * rate / (365 * 100);
    const currentFinal = parseFloat(farmer.pyReceivableFinalAmount || farmer.pyReceivable || "0");
    const newFinalAmount = currentFinal + dailyInterest;
    const newRemaining = remaining + dailyInterest;

    await db.update(farmers)
      .set({
        pyReceivableFinalAmount: newFinalAmount.toFixed(2),
        remainingReceivable: newRemaining.toFixed(2),
      })
      .where(sql`${farmers.id} = ${farmer.id}`);
    farmerCount++;
  }

  const allLots = await db.select().from(lots).where(
    and(
      gt(sql`CAST(${lots.adjustedAmountRate} AS numeric)`, 0),
      isNotNull(lots.adjustedAmount),
      isNotNull(lots.adjustedAmountEffectiveDate)
    )
  );

  for (const lot of allLots) {
    const principal = parseFloat(lot.adjustedAmount || "0");
    const rate = parseFloat(lot.adjustedAmountRate || "0");
    if (principal <= 0 || rate <= 0 || !lot.adjustedAmountEffectiveDate) continue;

    const finalAmount = calculateSimpleInterest(principal, rate, lot.adjustedAmountEffectiveDate);
    await db.update(lots)
      .set({ adjustedAmountFinal: finalAmount.toFixed(2) })
      .where(sql`${lots.id} = ${lot.id}`);
    lotCount++;
  }

  const allSeedTxns = await db.select().from(seedTransactions).where(
    and(
      gt(sql`CAST(${seedTransactions.adjustmentRate} AS numeric)`, 0),
      isNotNull(seedTransactions.adjustmentAmount),
      isNotNull(seedTransactions.adjustmentEffectiveDate)
    )
  );

  for (const txn of allSeedTxns) {
    const principal = parseFloat(txn.adjustmentAmount || "0");
    const rate = parseFloat(txn.adjustmentRate || "0");
    if (principal <= 0 || rate <= 0 || !txn.adjustmentEffectiveDate) continue;

    const finalAmount = calculateSimpleInterest(principal, rate, txn.adjustmentEffectiveDate);
    await db.update(seedTransactions)
      .set({ adjustmentAmountFinal: finalAmount.toFixed(2) })
      .where(sql`${seedTransactions.id} = ${txn.id}`);
    seedTxnCount++;
  }

  log(`Interest accrual complete: ${farmerCount} farmers, ${lotCount} harvest lots, ${seedTxnCount} seed transactions updated`, "interest-scheduler");
}

function getMillisUntilMidnightIST(): number {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istMidnight = new Date(istNow);
  istMidnight.setUTCHours(0, 0, 0, 0);
  istMidnight.setUTCDate(istMidnight.getUTCDate() + 1);
  return istMidnight.getTime() - istNow.getTime();
}

export function startInterestScheduler(): void {
  accrueInterestForAll().catch(err => {
    log(`Initial interest accrual error: ${err.message}`, "interest-scheduler");
  });

  function scheduleNext() {
    const msUntilMidnight = getMillisUntilMidnightIST();
    log(`Next interest accrual scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes (midnight IST)`, "interest-scheduler");

    setTimeout(async () => {
      try {
        await accrueInterestForAll();
      } catch (err: any) {
        log(`Midnight interest accrual error: ${err.message}`, "interest-scheduler");
      }
      scheduleNext();
    }, msUntilMidnight);
  }

  scheduleNext();
}
