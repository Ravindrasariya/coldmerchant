import { Fragment, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Share2 } from "lucide-react";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { useToast } from "@/hooks/use-toast";

interface TxnItem {
  id: number;
  serialNumber: number;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  netWeight: string | null;
  pricePerKgSnapshot: string | null;
  costOfGoods: string | null;
  revenue: string | null;
  pricePerKg: string | null;
  amount: string | null;
  crop?: string;
}

interface TxnData {
  id: number;
  transactionNumber: number;
  transactionType: string | null;
  partyName: string | null;
  vehicleNumber: string | null;
  revenue: string | null;
  crop?: string | null;
  items: TxnItem[];
}

interface TransactionNakalDialogProps {
  transactions: TxnData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantName: string;
  dateLabel: string;
}

function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCropLabel(crop: string | undefined): string {
  if (crop === "onion") return "ONION";
  if (crop === "garlic") return "GARLIC";
  return "POTATO";
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeItemRemark(item: TxnItem, isLoading: boolean, txnCrop?: string | null): string {
  const crop = getCropLabel(txnCrop || item.crop);
  const bags = item.bagsMoved;
  const weight = parseFloat(item.netWeight || "0");
  const sr = `(Sr#${item.serialNumber})`;

  if (isLoading) {
    const sellingPrice = parseFloat(item.pricePerKg || "0");
    return `${crop} - ${bags} Bags x ${weight.toFixed(1)} Kg x ₹${sellingPrice.toFixed(2)}/kg ${sr}`;
  } else {
    const costPerBag = bags > 0 ? parseFloat(item.costOfGoods || "0") / bags : 0;
    return `${crop} - ${bags} Bags x ${weight.toFixed(1)} Kg x ₹${costPerBag.toFixed(2)}/Bag ${sr}`;
  }
}

function computeItemAmount(item: TxnItem, isLoading: boolean): number {
  if (isLoading) {
    return parseFloat(item.amount || "0");
  }
  return parseFloat(item.costOfGoods || "0");
}

function buildPrintHtml(
  transactions: TxnData[],
  merchantName: string,
  dateLabel: string
): string {
  const sorted = [...transactions].sort((a, b) => a.transactionNumber - b.transactionNumber);

  let grandBags = 0;
  let grandWeight = 0;
  let grandAmount = 0;

  let bodyRows = "";

  sorted.forEach((txn) => {
    const isLoading = txn.transactionType === "loading";
    const particulars = `${escHtml(txn.partyName || "-")}${txn.vehicleNumber ? " - " + escHtml(txn.vehicleNumber) : ""} (Txn #${txn.transactionNumber})`;

    const txnAmount = isLoading
      ? parseFloat(txn.revenue || "0")
      : txn.items.reduce((sum, item) => sum + computeItemAmount(item, false), 0);

    const txnBags = txn.items.reduce((s, i) => s + i.bagsMoved, 0);
    const txnWeight = txn.items.reduce((s, i) => s + parseFloat(i.netWeight || "0"), 0);

    grandBags += txnBags;
    grandWeight += txnWeight;
    grandAmount += txnAmount;

    const rowspan = Math.max(txn.items.length, 1);

    if (txn.items.length === 0) {
      bodyRows += `
        <tr>
          <td style="vertical-align:top;padding:5px 8px;border:1px solid #ccc;font-size:13px;">${particulars}</td>
          <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;color:#888;">No items</td>
          <td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:13px;white-space:nowrap;">&#8377;${escHtml(fmt(txnAmount))}</td>
        </tr>`;
    }

    txn.items.forEach((item, idx) => {
      const remark = escHtml(computeItemRemark(item, isLoading, txn.crop));
      const itemAmt = isLoading ? "" : `&#8377;${escHtml(fmt(computeItemAmount(item, false)))}`;

      if (idx === 0) {
        bodyRows += `
          <tr>
            <td rowspan="${rowspan}" style="vertical-align:top;padding:5px 8px;border:1px solid #ccc;font-size:13px;">${particulars}</td>
            <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;">${remark}</td>
            <td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:13px;white-space:nowrap;">${itemAmt}</td>
          </tr>`;
      } else {
        bodyRows += `
          <tr>
            <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;">${remark}</td>
            <td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:13px;white-space:nowrap;">${itemAmt}</td>
          </tr>`;
      }
    });

    bodyRows += `
      <tr style="background:#f9f9f9;">
        <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;font-weight:600;">Total</td>
        <td style="padding:5px 8px;border:1px solid #ccc;font-size:13px;font-weight:600;">
          ${txnBags} Bags &nbsp;&nbsp; ${txnWeight.toFixed(1)} Kg
        </td>
        <td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:13px;font-weight:600;white-space:nowrap;">&#8377;${escHtml(fmt(txnAmount))}</td>
      </tr>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Transaction Nakal</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, serif; margin: 0; padding: 16px 24px; background: #fff; color: #000; }
    .merchant-name { text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 6px; }
    .header-row { display: flex; justify-content: space-between; align-items: center;
      border-top: 2px solid #000; border-bottom: 1px solid #000; padding: 4px 0; }
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
  <div class="merchant-name">${escHtml(merchantName)}</div>
  <div class="header-row">
    <span class="header-date">Date : ${escHtml(dateLabel)}</span>
    <span class="header-title">TRANSACTION NAKAL</span>
    <span class="header-page">Page 1 of 1</span>
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
        <td>Grand Total</td>
        <td>Total Qty: ${grandBags} Bags &nbsp;&nbsp; Total Weight: ${grandWeight.toFixed(1)} Kg</td>
        <td style="text-align:right;white-space:nowrap;">&#8377;${escHtml(fmt(grandAmount))}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

export function TransactionNakalDialog({
  transactions,
  open,
  onOpenChange,
  merchantName,
  dateLabel,
}: TransactionNakalDialogProps) {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const sorted = [...transactions].sort((a, b) => a.transactionNumber - b.transactionNumber);

  const handlePrint = () => {
    const html = buildPrintHtml(sorted, merchantName, dateLabel);
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
      await shareReceiptAsPdf(printRef.current, `Transaction-Nakal`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
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

  const txnBlocks = sorted.map((txn) => {
    const isLoading = txn.transactionType === "loading";
    const particulars = `${txn.partyName || "-"}${txn.vehicleNumber ? " - " + txn.vehicleNumber : ""} (Txn #${txn.transactionNumber})`;

    const txnAmount = isLoading
      ? parseFloat(txn.revenue || "0")
      : txn.items.reduce((sum, item) => sum + computeItemAmount(item, false), 0);

    const txnBags = txn.items.reduce((s, i) => s + i.bagsMoved, 0);
    const txnWeight = txn.items.reduce((s, i) => s + parseFloat(i.netWeight || "0"), 0);

    grandBags += txnBags;
    grandWeight += txnWeight;
    grandAmount += txnAmount;

    return { txn, isLoading, particulars, txnAmount, txnBags, txnWeight };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Transaction Nakal</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleShare} size="sm" variant="outline" disabled={sharing || transactions.length === 0} data-testid="button-share-txn-nakal">
                {sharing ? (
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                {sharing ? "..." : "Share"}
              </Button>
              <Button onClick={handlePrint} size="sm" disabled={transactions.length === 0} data-testid="button-print-txn-nakal">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
          <DialogDescription>
            Preview and print the transaction nakal for {transactions.length} {transactions.length === 1 ? "transaction" : "transactions"}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto -mx-4 px-4">
          <div ref={printRef} className="bg-white text-black p-4 min-w-[640px]" style={{ fontFamily: "Georgia, serif" }}>
            <div className="text-center text-2xl font-bold mb-2">{merchantName}</div>
            <div className="flex justify-between items-center border-t-2 border-b border-black py-1 mb-0 text-sm">
              <span>Date : {dateLabel}</span>
              <span className="font-bold text-base tracking-wide">TRANSACTION NAKAL</span>
              <span>Page 1 of 1</span>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No transactions to display</div>
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
                  {txnBlocks.map(({ txn, isLoading, particulars, txnAmount, txnBags, txnWeight }) => {
                    const rowspan = Math.max(txn.items.length, 1);
                    return (
                      <Fragment key={txn.id}>
                        {txn.items.length === 0 && (
                          <tr>
                            <td className="border border-gray-300 px-2 py-1 align-top text-sm">{particulars}</td>
                            <td className="border border-gray-300 px-2 py-1 text-sm text-gray-400">No items</td>
                            <td className="border border-gray-300 px-2 py-1 text-right text-sm whitespace-nowrap">₹{fmt(txnAmount)}</td>
                          </tr>
                        )}
                        {txn.items.map((item, idx) => {
                          const remark = computeItemRemark(item, isLoading, txn.crop);
                          const itemAmt = isLoading ? "" : `₹${fmt(computeItemAmount(item, false))}`;

                          if (idx === 0) {
                            return (
                              <tr key={`${txn.id}-item-${item.id}`}>
                                <td
                                  rowSpan={rowspan}
                                  className="border border-gray-300 px-2 py-1 align-top text-sm"
                                >
                                  {particulars}
                                </td>
                                <td className="border border-gray-300 px-2 py-1 text-sm">{remark}</td>
                                <td className="border border-gray-300 px-2 py-1 text-right text-sm whitespace-nowrap">
                                  {itemAmt}
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={`${txn.id}-item-${item.id}`}>
                              <td className="border border-gray-300 px-2 py-1 text-sm">{remark}</td>
                              <td className="border border-gray-300 px-2 py-1 text-right text-sm whitespace-nowrap">
                                {itemAmt}
                              </td>
                            </tr>
                          );
                        })}

                        <tr key={`${txn.id}-summary`} className="bg-gray-50">
                          <td className="border border-gray-300 px-2 py-1 text-sm font-semibold">
                            Total
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-sm font-semibold">
                            {txnBags} Bags &nbsp; {txnWeight.toFixed(1)} Kg
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-right text-sm font-semibold whitespace-nowrap">
                            ₹{fmt(txnAmount)}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-200 font-bold">
                    <td className="border border-gray-300 px-2 py-1.5 text-sm">Grand Total</td>
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
