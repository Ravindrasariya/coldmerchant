import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface LotData {
  id: number;
  place: string | null;
  crop?: string;
  originalBags: number;
  totalWeight: string | null;
  pricePerKg: string | null;
  mandiCommissionPercent: string | null;
  aadhatCommissionPercent: string | null;
  hammaliPerBag: string | null;
  mandiExtraCharges: string | null;
  charges: Array<{ type: string; amount: number | string }> | null;
}

interface EntryData {
  id: number;
  serialNumber: number;
  purchaseDate: string;
  place: string | null;
  farmerName: string;
  aadhatName: string | null;
  crop?: string;
  lots: LotData[];
}

interface LoadingNakalDialogProps {
  entries: EntryData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterDay: number | null;
  filterMonths: number[];
  filterYear: string;
}

function getCropLabel(crop: string | undefined): string {
  if (crop === "onion") return "ONION";
  if (crop === "garlic") return "GARLIC";
  return "POTATO";
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeLotAmount(lot: LotData): number {
  const w = parseFloat(lot.totalWeight || "0");
  const p = parseFloat(lot.pricePerKg || "0");
  return w * p;
}

function computePurDami(lots: LotData[]): number {
  return lots.reduce((total, lot) => {
    const w = parseFloat(lot.totalWeight || "0");
    const p = parseFloat(lot.pricePerKg || "0");
    const base = w * p;
    const aadhat = (parseFloat(lot.aadhatCommissionPercent || "0") / 100) * base;
    const mandi = (parseFloat(lot.mandiCommissionPercent || "0") / 100) * base;
    const hammali = parseFloat(lot.hammaliPerBag || "0") * lot.originalBags;
    const extra = parseFloat(lot.mandiExtraCharges || "0");
    const dynamic = (lot.charges || []).reduce(
      (s, c) => s + parseFloat(String(c.amount ?? 0)), 0
    );
    return total + aadhat + mandi + hammali + extra + dynamic;
  }, 0);
}

function getDateLabel(filterDay: number | null, filterMonths: number[], filterYear: string): string {
  let date: Date;
  if (filterDay !== null && filterMonths.length === 1) {
    date = new Date(parseInt(filterYear), filterMonths[0], filterDay);
  } else {
    date = new Date();
  }
  const dayName = format(date, "EEEE");
  const dd = format(date, "d");
  const month = format(date, "MMMM");
  const yyyy = format(date, "yyyy");
  const compact = `${format(date, "d")}-${format(date, "M")}-${format(date, "yyyy")}`;
  return `${dayName}, ${dd} ${month}, ${yyyy} (${compact})`;
}

function buildPrintHtml(
  entries: EntryData[],
  merchantName: string,
  merchantAddress: string | null | undefined,
  dateLabel: string,
  totalPages: number
): string {
  const sorted = [...entries].sort((a, b) => a.serialNumber - b.serialNumber);

  let grandBags = 0;
  let grandWeight = 0;
  let grandAmount = 0;

  let bodyRows = "";

  sorted.forEach((entry) => {
    const isMandi = entry.place === "mandi";
    const particulars = isMandi
      ? `${entry.aadhatName || "-"} (Sr #${entry.serialNumber})`
      : `${entry.farmerName} (Sr #${entry.serialNumber})`;

    const lotAmounts = entry.lots.map(computeLotAmount);
    const purDami = isMandi ? computePurDami(entry.lots) : 0;
    const entryBags = entry.lots.reduce((s, l) => s + l.originalBags, 0);
    const entryWeight = entry.lots.reduce((s, l) => s + parseFloat(l.totalWeight || "0"), 0);
    const entryTotal = lotAmounts.reduce((s, a) => s + a, 0) + purDami;

    grandBags += entryBags;
    grandWeight += entryWeight;
    grandAmount += entryTotal;

    const rowspan = entry.lots.length + (isMandi ? 1 : 0);

    entry.lots.forEach((lot, idx) => {
      const crop = getCropLabel(lot.crop || entry.crop);
      const w = parseFloat(lot.totalWeight || "0");
      const p = parseFloat(lot.pricePerKg || "0");
      const amount = lotAmounts[idx];
      const remark = `${crop} - ${lot.originalBags} Bags x ${w.toFixed(1)} Kg x ₹${p.toFixed(2)}`;

      if (idx === 0) {
        bodyRows += `
          <tr>
            <td rowspan="${rowspan}" style="vertical-align:top;padding:5px 8px;border:1px solid #ccc;font-size:13px;">${particulars}</td>
            <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;">${remark}</td>
            <td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:13px;white-space:nowrap;">₹${fmt(amount)}</td>
          </tr>`;
      } else {
        bodyRows += `
          <tr>
            <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;">${remark}</td>
            <td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:13px;white-space:nowrap;">₹${fmt(amount)}</td>
          </tr>`;
      }
    });

    if (isMandi && purDami > 0) {
      bodyRows += `
        <tr>
          <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;">Add: Pur. Dami</td>
          <td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:13px;white-space:nowrap;">₹${fmt(purDami)}</td>
        </tr>`;
    }

    bodyRows += `
      <tr style="background:#f9f9f9;">
        <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;font-weight:600;">
          Qty: ${entryBags} Bags &nbsp;&nbsp; Weight: ${entryWeight.toFixed(1)} Kg
        </td>
        <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;font-weight:600;">Total</td>
        <td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:13px;font-weight:600;white-space:nowrap;">₹${fmt(entryTotal)}</td>
      </tr>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Loading Nakal</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, serif; margin: 0; padding: 16px 24px; background: #fff; color: #000; }
    .nakal-header { margin-bottom: 12px; }
    .merchant-name { text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 4px; }
    .merchant-address { text-align: center; font-size: 13px; color: #555; margin-bottom: 6px; }
    .header-row { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin-bottom: 0; }
    .header-date { font-size: 13px; }
    .header-title { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
    .header-page { font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 0; }
    thead th { background: #eee; border: 1px solid #ccc; padding: 6px 8px; font-size: 13px; font-weight: bold; }
    .grand-row td { border: 1px solid #ccc; padding: 6px 8px; font-size: 13px; font-weight: bold; background: #e8e8e8; }
    @media print { body { padding: 8px 16px; } }
  </style>
</head>
<body>
  <div class="nakal-header">
    <div class="merchant-name">${merchantName}</div>
    ${merchantAddress ? `<div class="merchant-address">${merchantAddress}</div>` : ""}
    <div class="header-row">
      <span class="header-date">Date : ${dateLabel}</span>
      <span class="header-title">LOADING NAKAL</span>
      <span class="header-page">Page 1 of ${totalPages}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:33%;text-align:left;">Particulars</th>
        <th style="width:45%;text-align:left;">Remarks</th>
        <th style="width:22%;text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
    <tfoot>
      <tr class="grand-row">
        <td>Debit Total</td>
        <td>Total Qty: ${grandBags} Bags &nbsp;&nbsp; Total Weight: ${grandWeight.toFixed(1)} Kg</td>
        <td style="text-align:right;white-space:nowrap;">₹${fmt(grandAmount)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

export function LoadingNakalDialog({
  entries,
  open,
  onOpenChange,
  filterDay,
  filterMonths,
  filterYear,
}: LoadingNakalDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const merchantName = user?.merchantName || "Merchant";
  const merchantAddress = user?.merchantAddress || null;
  const dateLabel = getDateLabel(filterDay, filterMonths, filterYear);

  const sorted = [...entries].sort((a, b) => a.serialNumber - b.serialNumber);

  const handlePrint = () => {
    const html = buildPrintHtml(sorted, merchantName, merchantAddress, dateLabel, 1);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  };

  const handleShare = async () => {
    if (!printRef.current) return;
    setSharing(true);
    try {
      await shareReceiptAsPdf(printRef.current, `Loading-Nakal`);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "PDF generation failed", description: "Please try again", variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  };

  if (!open) return null;

  let grandBags = 0;
  let grandWeight = 0;
  let grandAmount = 0;

  const entryBlocks = sorted.map((entry) => {
    const isMandi = entry.place === "mandi";
    const particulars = isMandi
      ? `${entry.aadhatName || "-"} (Sr #${entry.serialNumber})`
      : `${entry.farmerName} (Sr #${entry.serialNumber})`;

    const lotAmounts = entry.lots.map(computeLotAmount);
    const purDami = isMandi ? computePurDami(entry.lots) : 0;
    const entryBags = entry.lots.reduce((s, l) => s + l.originalBags, 0);
    const entryWeight = entry.lots.reduce((s, l) => s + parseFloat(l.totalWeight || "0"), 0);
    const entryTotal = lotAmounts.reduce((s, a) => s + a, 0) + purDami;

    grandBags += entryBags;
    grandWeight += entryWeight;
    grandAmount += entryTotal;

    return { entry, isMandi, particulars, lotAmounts, purDami, entryBags, entryWeight, entryTotal };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Loading Nakal</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleShare} size="sm" variant="outline" disabled={sharing || entries.length === 0} data-testid="button-share-nakal">
                {sharing ? (
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                {sharing ? "..." : "Share"}
              </Button>
              <Button onClick={handlePrint} size="sm" disabled={entries.length === 0} data-testid="button-print-nakal">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
          <DialogDescription>
            Preview and print the loading nakal for {entries.length} entries
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto -mx-4 px-4">
          <div ref={printRef} className="bg-white text-black p-4 min-w-[640px]" style={{ fontFamily: "Georgia, serif" }}>
            <div className="text-center text-2xl font-bold mb-1">{merchantName}</div>
            {merchantAddress && (
              <div className="text-center text-sm text-gray-600 mb-2">{merchantAddress}</div>
            )}
            <div className="flex justify-between items-center border-t-2 border-b border-black py-1 mb-0 text-sm">
              <span>Date : {dateLabel}</span>
              <span className="font-bold text-base tracking-wide">LOADING NAKAL</span>
              <span>Page 1 of 1</span>
            </div>

            {entries.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No entries to display</div>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-1.5 text-left w-[33%]">Particulars</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-left w-[45%]">Remarks</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-right w-[22%]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {entryBlocks.map(({ entry, isMandi, particulars, lotAmounts, purDami, entryBags, entryWeight, entryTotal }) => {
                    const rowspan = entry.lots.length + (isMandi && purDami > 0 ? 1 : 0);
                    return (
                      <>
                        {entry.lots.map((lot, idx) => {
                          const crop = getCropLabel(lot.crop || entry.crop);
                          const w = parseFloat(lot.totalWeight || "0");
                          const p = parseFloat(lot.pricePerKg || "0");
                          const amount = lotAmounts[idx];
                          const remark = `${crop} - ${lot.originalBags} Bags x ${w.toFixed(1)} Kg x ₹${p.toFixed(2)}`;

                          if (idx === 0) {
                            return (
                              <tr key={`${entry.id}-lot-${lot.id}`}>
                                <td
                                  rowSpan={rowspan}
                                  className="border border-gray-300 px-2 py-1 align-top text-sm"
                                >
                                  {particulars}
                                </td>
                                <td className="border border-gray-300 px-2 py-1 text-sm">{remark}</td>
                                <td className="border border-gray-300 px-2 py-1 text-right text-sm whitespace-nowrap">
                                  ₹{fmt(amount)}
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={`${entry.id}-lot-${lot.id}`}>
                              <td className="border border-gray-300 px-2 py-1 text-sm">{remark}</td>
                              <td className="border border-gray-300 px-2 py-1 text-right text-sm whitespace-nowrap">
                                ₹{fmt(amount)}
                              </td>
                            </tr>
                          );
                        })}

                        {isMandi && purDami > 0 && (
                          <tr key={`${entry.id}-purdami`}>
                            <td className="border border-gray-300 px-2 py-1 text-sm">Add: Pur. Dami</td>
                            <td className="border border-gray-300 px-2 py-1 text-right text-sm whitespace-nowrap">
                              ₹{fmt(purDami)}
                            </td>
                          </tr>
                        )}

                        <tr key={`${entry.id}-summary`} className="bg-gray-50">
                          <td className="border border-gray-300 px-2 py-1 text-sm font-semibold">
                            Qty: {entryBags} Bags &nbsp; Weight: {entryWeight.toFixed(1)} Kg
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-sm font-semibold">Total</td>
                          <td className="border border-gray-300 px-2 py-1 text-right text-sm font-semibold whitespace-nowrap">
                            ₹{fmt(entryTotal)}
                          </td>
                        </tr>
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-200 font-bold">
                    <td className="border border-gray-300 px-2 py-1.5 text-sm">Debit Total</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-sm">
                      Total Qty: {grandBags} Bags &nbsp; Total Weight: {grandWeight.toFixed(1)} Kg
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right text-sm whitespace-nowrap">
                      ₹{fmt(grandAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
