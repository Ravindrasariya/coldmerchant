/**
 * Outstanding-freight helpers.
 *
 * A freight payment is pointed at a truck, and a truck is identified by the
 * (loading date, transporter, vehicle number) triple rather than a transaction
 * id. One "Load A Truck" submission can create several transaction rows — one
 * per buyer — that all share the same triple and each carry the *same* Total
 * Freight, so freight must be counted once per loading session, never summed
 * across those rows.
 *
 * A blank vehicle number is normal in this data and is a legitimate key value;
 * it must not cause a truck to be skipped.
 */

export interface FreightTruckLike {
  id: number;
  tnxGroupId?: string | null;
  transactionNumber?: number | null;
  transactionType?: string | null;
  dateOfLoading?: string | null;
  transporterName?: string | null;
  vehicleNumber?: string | null;
  totalFreight?: string | null;
  freightPaidSeparately?: boolean | null;
}

export interface FreightPaymentLike {
  direction?: string | null;
  expenseType?: string | null;
  isReversed?: boolean | null;
  amount: string;
  freightLoadingDate?: string | null;
  freightTransporterName?: string | null;
  freightVehicleNumber?: string | null;
}

export interface OutstandingFreightTruck {
  key: string;
  dateOfLoading: string;
  transporterName: string;
  vehicleNumber: string;
  transactionNumbers: number[];
  totalFreight: number;
  paidAmount: number;
  remainingFreight: number;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Canonical identity of a truck for freight settlement. */
export function freightKey(
  dateOfLoading: string | null | undefined,
  transporterName: string | null | undefined,
  vehicleNumber: string | null | undefined,
): string {
  return `${norm(dateOfLoading)}|${norm(transporterName)}|${norm(vehicleNumber)}`;
}

/** True when a cash entry is a freight payment aimed at a specific truck. */
export function isTargetedFreightPayment(e: FreightPaymentLike): boolean {
  return (
    e.direction === "outflow" &&
    e.expenseType === "transport_freight" &&
    e.isReversed !== true &&
    !!e.freightLoadingDate
  );
}

/**
 * Total freight already paid against each truck, keyed by freightKey.
 * Reversed entries are excluded, so reversing a payment restores the balance.
 */
export function sumFreightPaidByTruck(
  cashEntries: FreightPaymentLike[],
): Map<string, number> {
  const paid = new Map<string, number>();
  for (const e of cashEntries) {
    if (!isTargetedFreightPayment(e)) continue;
    const key = freightKey(e.freightLoadingDate, e.freightTransporterName, e.freightVehicleNumber);
    paid.set(key, (paid.get(key) || 0) + (parseFloat(e.amount) || 0));
  }
  return paid;
}

/**
 * Trucks whose freight the user pays themselves, with how much is still owed.
 *
 * Only loading transactions flagged freightPaidSeparately are considered — when
 * freight is billed to the buyer it is not the user's payable. The driver
 * advance is deliberately ignored: only Cash tab payments reduce the balance.
 *
 * Pass includeSettled to keep trucks whose remaining has reached zero (used when
 * validating a payment against a truck that a concurrent payment just settled).
 */
export function computeOutstandingFreight(
  txns: FreightTruckLike[],
  cashEntries: FreightPaymentLike[],
  includeSettled = false,
): OutstandingFreightTruck[] {
  const paidByTruck = sumFreightPaidByTruck(cashEntries);

  // key -> loading session -> that session's freight (counted once)
  const sessions = new Map<string, Map<string, number>>();
  const meta = new Map<string, { date: string; transporter: string; vehicle: string; tnxNos: Set<number> }>();

  for (const tx of txns) {
    if (tx.transactionType !== "loading") continue;
    if (tx.freightPaidSeparately !== true) continue;
    if (!tx.dateOfLoading) continue;
    const freight = parseFloat(tx.totalFreight || "0") || 0;
    if (freight <= 0) continue;

    const key = freightKey(tx.dateOfLoading, tx.transporterName, tx.vehicleNumber);
    // Rows without a group id predate grouping; treat each as its own session.
    const sessionId = tx.tnxGroupId || `tx-${tx.id}`;

    if (!sessions.has(key)) sessions.set(key, new Map());
    const bySession = sessions.get(key)!;
    // Same freight is repeated on every row of a session — take it once.
    bySession.set(sessionId, Math.max(bySession.get(sessionId) || 0, freight));

    if (!meta.has(key)) {
      meta.set(key, {
        date: tx.dateOfLoading,
        transporter: (tx.transporterName || "").trim(),
        vehicle: (tx.vehicleNumber || "").trim(),
        tnxNos: new Set(),
      });
    }
    if (tx.transactionNumber != null) meta.get(key)!.tnxNos.add(tx.transactionNumber);
  }

  const out: OutstandingFreightTruck[] = [];
  for (const [key, bySession] of sessions) {
    const totalFreight = Array.from(bySession.values()).reduce((s, v) => s + v, 0);
    const paidAmount = paidByTruck.get(key) || 0;
    const remainingFreight = Math.round((totalFreight - paidAmount) * 100) / 100;
    if (!includeSettled && remainingFreight <= 0.005) continue;
    const m = meta.get(key)!;
    out.push({
      key,
      dateOfLoading: m.date,
      transporterName: m.transporter,
      vehicleNumber: m.vehicle,
      transactionNumbers: Array.from(m.tnxNos).sort((a, b) => a - b),
      totalFreight,
      paidAmount,
      remainingFreight,
    });
  }

  // Oldest loading first — that is the one most likely being settled.
  out.sort((a, b) => a.dateOfLoading.localeCompare(b.dateOfLoading) || a.key.localeCompare(b.key));
  return out;
}
