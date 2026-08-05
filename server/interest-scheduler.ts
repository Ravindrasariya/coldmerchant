import { db } from "./db";
import { cashFarmers, farmers, lots, seedTransactions } from "@shared/schema";
import { gt, isNotNull, and, sql } from "drizzle-orm";
import { calculateSimpleInterest, getISTDateString } from "./ist-utils";
import { log } from "./index";

export async function accrueInterestForAll(): Promise<void> {
  const today = getISTDateString();
  let farmerCount = 0;
  let lotCount = 0;
  let seedTxnCount = 0;

  // Each farmer receivable is its own cash_farmers row carrying its own amount,
  // interest rate and start date; the farmers table only holds the rolled-up
  // total. So interest is computed per receivable from that receivable's own
  // start date and summed — the same shape as the lot and seed adjustments
  // below. Because every term is derived from stored inputs rather than added
  // to a running balance, re-running this is a no-op and a day missed while the
  // app was down is picked up on the next run.
  const allCashFarmers = await db.select().from(cashFarmers).where(isNotNull(cashFarmers.farmerId));
  const receivablesByFarmer = new Map<number, typeof allCashFarmers>();
  for (const cf of allCashFarmers) {
    if (!cf.farmerId) continue;
    const list = receivablesByFarmer.get(cf.farmerId);
    if (list) list.push(cf);
    else receivablesByFarmer.set(cf.farmerId, [cf]);
  }

  // Fully paid receivables stop accruing, matching previous behaviour. This
  // filter is required: without it a settled receivable would keep deriving
  // interest from its original dates and resurrect a balance the farmer has
  // already cleared.
  //
  // CONFIRMED POLICY: if a payment that cleared a receivable is later reversed,
  // the next run charges interest for the whole period the balance sat at zero.
  // Rationale: a reversal means the payment never really happened, so the money
  // was owed throughout — the cleared period is not forgiven. This was
  // explicitly confirmed by the business owner (August 2026) and differs from
  // the old behaviour, which resumed from the reversal date and silently
  // forgave that interval. Do not change this without a new explicit decision.
  const allFarmers = await db.select().from(farmers).where(
    gt(sql`CAST(${farmers.remainingReceivable} AS numeric)`, 0)
  );

  for (const farmer of allFarmers) {
    // Principal is the original receivable, never reduced by payments, so
    // interest stays simple rather than compounding on accrued interest.
    const principalTotal = parseFloat(farmer.pyReceivable || "0");
    if (principalTotal <= 0) continue;

    const receivables = receivablesByFarmer.get(farmer.id) || [];
    let accruedInterest = 0;

    if (receivables.length > 0) {
      for (const r of receivables) {
        const principal = parseFloat(r.pendingDueToBePaid || "0");
        const rate = parseFloat(r.rateOfInterest || "0");
        if (principal <= 0 || rate <= 0 || !r.effectiveDate) continue;
        accruedInterest += calculateSimpleInterest(principal, rate, r.effectiveDate, null) - principal;
      }
    } else {
      // Receivable set directly on the farmer with no cash entry behind it:
      // treat the farmer's own rate and start date as a single receivable.
      const rate = parseFloat(farmer.receivableInterestRate || "0");
      if (rate > 0 && farmer.receivableEffectiveDate) {
        accruedInterest = calculateSimpleInterest(principalTotal, rate, farmer.receivableEffectiveDate, null) - principalTotal;
      }
    }

    // Round before comparing: the stored value is 2dp, so comparing it against a
    // full-precision total would leave a sub-paisa difference every run and the
    // balance would creep. Both sides rounded means a repeat run is exactly zero.
    const newFinal = Math.round((principalTotal + accruedInterest) * 100) / 100;
    const storedFinal = parseFloat(farmer.pyReceivableFinalAmount || "0");
    const oldFinal = storedFinal > 0 ? storedFinal : principalTotal;
    const interestDelta = newFinal - oldFinal;
    if (Math.abs(interestDelta) < 0.005) continue;

    // Apply only the change, so payments already deducted stay deducted.
    const oldRemaining = parseFloat(farmer.remainingReceivable || "0");
    const newRemaining = Math.max(0, oldRemaining + interestDelta);

    await db.update(farmers)
      .set({
        pyReceivableFinalAmount: newFinal.toFixed(2),
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

    // Skip accrual entirely when today is past the end date
    const endDate = (lot as any).adjustedAmountEndDate as string | null | undefined;
    if (endDate && today > endDate) continue;

    const oldFinal = parseFloat(lot.adjustedAmountFinal || String(principal));
    const newFinal = calculateSimpleInterest(principal, rate, lot.adjustedAmountEffectiveDate, endDate || null);
    const interestDelta = newFinal - oldFinal;
    const oldNetPayable = parseFloat(lot.netPayable || "0");
    const adjType = lot.adjustedAmountType;
    const signedDelta = adjType === "credit" ? interestDelta : adjType === "debit" ? -interestDelta : 0;
    const newNetPayable = oldNetPayable + signedDelta;

    await db.update(lots)
      .set({
        adjustedAmountFinal: newFinal.toFixed(2),
        netPayable: newNetPayable.toFixed(2),
      })
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

    // Skip accrual entirely when today is past the end date
    const endDate = (txn as any).adjustmentEndDate as string | null | undefined;
    if (endDate && today > endDate) continue;

    const oldFinal = parseFloat(txn.adjustmentAmountFinal || String(principal));
    const newFinal = calculateSimpleInterest(principal, rate, txn.adjustmentEffectiveDate, endDate || null);
    const interestDelta = newFinal - oldFinal;
    const oldDue = parseFloat(txn.totalDueToFarmer || "0");
    const adjType = txn.adjustmentType;
    const signedDelta = adjType === "credit" ? interestDelta : adjType === "debit" ? -interestDelta : 0;
    const newDue = oldDue + signedDelta;

    await db.update(seedTransactions)
      .set({
        adjustmentAmountFinal: newFinal.toFixed(2),
        totalDueToFarmer: newDue.toFixed(2),
      })
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
  // Every branch of accrueInterestForAll recomputes totals from stored dates and
  // applies only the difference, so running it on each start is safe and lets a
  // day missed while the app was down be picked up immediately.
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
