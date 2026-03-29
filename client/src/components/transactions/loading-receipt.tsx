import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Share2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { useToast } from "@/hooks/use-toast";
import { numberToIndianWords } from "@/lib/number-to-words";
import { defaultLoadingTemplate } from "@/lib/default-loading-template";

interface TransactionItem {
  id: number;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  netWeight: string | null;
  pricePerKg: string | null;
  amount: string | null;
  pricePerKgSnapshot: string | null;
  costOfGoods: string | null;
}

interface LoadingTransaction {
  id: number;
  transactionNumber: number;
  merchantId: number;
  transactionType: string | null;
  transporterName: string | null;
  driverContact: string | null;
  buyerId: number | null;
  partyName: string | null;
  partyAddress: string | null;
  vehicleNumber: string | null;
  advancePayment: string | null;
  otherCharges: string | null;
  revenue: string | null;
  totalBags: number;
  totalNetWeight: string | null;
  totalCostOfGoods: string | null;
  salesCommission: string | null;
  totalMandiCommission: string | null;
  totalAadhatCommission: string | null;
  totalHammali: string | null;
  totalMandiExtraCharges: string | null;
  tulai: string | null;
  majduri: string | null;
  thelaBhada: string | null;
  palaKarai: string | null;
  bardan: string | null;
  crop: string | null;
  createdAt: string;
  items: TransactionItem[];
}

interface Buyer {
  id: number;
  name: string;
  address: string;
  contact: string | null;
}

interface Merchant {
  id: number;
  name: string;
  contactNumber: string | null;
  address: string | null;
  receiptHeaderImage: string | null;
  receiptHtmlTemplate: string | null;
}

interface LoadingReceiptDialogProps {
  transactionId: number | null;
  merchantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cropType?: "potato" | "onion" | "garlic";
}

export function LoadingReceiptDialog({ transactionId, merchantId, open, onOpenChange, cropType = "potato" }: LoadingReceiptDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const receiptFilename = () => {
    const buyerName = (transaction?.partyName || buyer?.name || "Receipt").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const dateStr = transaction?.createdAt ? new Date(transaction.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "";
    return `${buyerName}_${dateStr}`;
  };

  const handleShare = async () => {
    if (!printRef.current) return;
    setSharing(true);
    try {
      await shareReceiptAsPdf(printRef.current, receiptFilename(), customHtml);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "PDF generation failed", description: "Please try again", variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  };

  const { data: transaction, isLoading: txnLoading } = useQuery<LoadingTransaction>({
    queryKey: ["/api/transactions", transactionId],
    enabled: !!transactionId && open,
  });

  const { data: merchant, isLoading: merchantLoading } = useQuery<Merchant>({
    queryKey: ["/api/merchants", merchantId],
    enabled: !!merchantId && open,
  });

  const { data: buyers } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers"],
    enabled: !!transaction?.buyerId && open,
  });
  const buyer = buyers?.find(b => b.id === transaction?.buyerId);

  const isLoading = txnLoading || merchantLoading;

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const printTitle = receiptFilename();
    if (customHtml) {
      const htmlWithTitle = customHtml.replace(/<head>/i, `<head><title>${printTitle}</title>`);
      printWindow.document.write(htmlWithTitle);
    } else {
      const printContent = printRef.current.innerHTML;
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${printTitle}</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 20px;
                max-width: 800px;
                margin: 0 auto;
              }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
              .header h1 { margin: 0; font-size: 24px; }
              .header p { margin: 5px 0; color: #555; }
              .receipt-info { display: flex; justify-content: space-between; margin-bottom: 20px; line-height: 1.4; }
              .receipt-info > div { text-align: left; }
              .receipt-info .right { text-align: right; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: center; }
              th:last-child, td:last-child { text-align: right; }
              th { background-color: #f5f5f5; }
              .charges-section { margin-top: 20px; }
              .charges-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px; }
              .charge-item { display: flex; justify-content: space-between; padding: 4px 0; }
              .grand-total { font-size: 20px; font-weight: bold; text-align: right; border-top: 2px solid #000; padding-top: 10px; margin-top: 10px; }
              .hindi { font-size: 0.9em; color: #666; }
              .disclaimer { margin-top: 30px; padding: 10px; border: 1px dashed #999; text-align: center; font-size: 12px; color: #666; }
              @media print { body { padding: 0; } button { display: none; } }
            </style>
          </head>
          <body>${printContent}</body>
        </html>
      `);
    }
    printWindow.document.close();
    const imgs = printWindow.document.querySelectorAll('img');
    if (imgs.length > 0) {
      let loaded = 0;
      const tryPrint = () => { loaded++; if (loaded >= imgs.length) printWindow.print(); };
      imgs.forEach(img => {
        if (img.complete) tryPrint();
        else { img.onload = tryPrint; img.onerror = tryPrint; }
      });
    } else {
      printWindow.print();
    }
  };

  if (!open) return null;

  const totalAmount = transaction?.items.reduce((sum, item) => sum + parseFloat(item.amount || "0"), 0) || 0;

  const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const buildCustomHtml = () => {
    if (!transaction) return null;
    // Priority 1: custom per-merchant HTML template
    // Priority 2: header image → return null so JSX layout handles it
    // Priority 3: built-in Indore default template
    let html: string;
    let minRows: number;
    if (merchant?.receiptHtmlTemplate) {
      html = merchant.receiptHtmlTemplate;
      minRows = 18;
    } else if (merchant?.receiptHeaderImage) {
      return null;
    } else {
      html = defaultLoadingTemplate;
      minRows = 6;
    }
    const txnCrop = transaction.crop || cropType || "potato";
    const cropLabel = txnCrop === "potato" ? "Potato / आलू" : txnCrop === "onion" ? "Onion / प्याज" : "Garlic / लहसुन";
    const dateStr = new Date(transaction.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const numCols = 6;
    const itemsDataRows = transaction.items.map((item) =>
      `<tr><td>${escHtml(cropLabel)}</td><td></td><td>${item.bagsMoved}</td><td>${parseFloat(item.netWeight || "0").toFixed(1)}</td><td>${item.pricePerKg ? `₹${parseFloat(item.pricePerKg).toFixed(2)}` : "-"}</td><td style="text-align:right">₹${parseFloat(parseFloat(item.amount || "0").toFixed(1)).toLocaleString("en-IN")}</td></tr>`
    ).join("");
    const blankCount = Math.max(0, minRows - transaction.items.length);
    const blankRows = Array(blankCount).fill(`<tr>${"<td>&nbsp;</td>".repeat(numCols)}</tr>`).join("");
    const itemRowsHtml = itemsDataRows + blankRows;
    const itemsTableHtml = `<table><thead><tr><th>Item Name</th><th>Marka</th><th>Quantity</th><th>Weight</th><th>Rate</th><th style="text-align:right">Value</th></tr></thead><tbody>${itemRowsHtml}</tbody><tfoot><tr style="font-weight:bold;border-top:1px solid #000"><td>Total</td><td></td><td>${transaction.totalBags}</td><td>${parseFloat(transaction.totalNetWeight || "0").toFixed(1)}</td><td></td><td style="text-align:right">₹${parseFloat(totalAmount.toFixed(1)).toLocaleString("en-IN")}</td></tr></tfoot></table>`;

    const mandiComm = parseFloat(transaction.totalMandiCommission || "0");
    const aadhatComm = parseFloat(transaction.totalAadhatCommission || "0");
    const hamm = parseFloat(transaction.totalHammali || "0");
    const extra = parseFloat(transaction.totalMandiExtraCharges || "0");
    const salesComm = parseFloat(transaction.salesCommission || "0");
    const drvAdv = parseFloat(transaction.advancePayment || "0");
    const advAmt = parseFloat(transaction.otherCharges || "0");
    const tl = parseFloat(transaction.tulai || "0");
    const mj = parseFloat(transaction.majduri || "0");
    const tb = parseFloat(transaction.thelaBhada || "0");
    const pk = parseFloat(transaction.palaKarai || "0");
    const bd = parseFloat(transaction.bardan || "0");
    const addlCharges = tl + mj + tb + pk + bd;
    const gt = totalAmount + mandiComm + aadhatComm + hamm + extra + salesComm + addlCharges + drvAdv - advAmt;

    const fmtInr = (v: number) => `₹${parseFloat(v.toFixed(1)).toLocaleString("en-IN")}`;

    const chargesList: [string, number][] = [
      ["Hammali", hamm],
      ["Pur. Comm.", salesComm],
      ["Mandi Tax", mandiComm],
      ["Aadhat Comm.", aadhatComm],
      ["Tulai", tl],
      ["Bharai", mj],
      ["Khadi Karai", tb],
      ["Pala Karai", pk],
      ["Bardan", bd],
      ["Driver Advance", drvAdv],
      ["Advance Amount", advAmt],
    ];
    const nonZeroCharges = chargesList.filter(([, v]) => v > 0);
    let chargesRowsHtml: string;
    if (nonZeroCharges.length > 0) {
      chargesRowsHtml = nonZeroCharges
        .map(([name, v], i) => {
          const labelCell = i === 0 ? `<td colspan="3" rowspan="${nonZeroCharges.length}" style="font-weight:bold;vertical-align:top;border:1px solid #000">SALES BILL</td>` : "";
          return `<tr>${labelCell}<td colspan="2" style="border:1px solid #000">${name}</td><td style="text-align:right;border:1px solid #000">${fmtInr(v)}</td></tr>`;
        })
        .join("");
    } else {
      chargesRowsHtml = `<tr><td colspan="3" style="font-weight:bold;vertical-align:top;border:1px solid #000">SALES BILL</td><td colspan="2" style="border:1px solid #000">&nbsp;</td><td style="border:1px solid #000">&nbsp;</td></tr>`;
    }

    const replacements: Record<string, string> = {
      "{{merchantName}}": escHtml(merchant.name || ""),
      "{{merchantAddress}}": escHtml(merchant.address || ""),
      "{{merchantContact}}": escHtml(merchant.contactNumber || ""),
      "{{receiptNumber}}": String(transaction.transactionNumber),
      "{{date}}": dateStr,
      "{{buyerName}}": escHtml(transaction.partyName || buyer?.name || ""),
      "{{buyerAddress}}": escHtml(buyer?.address || transaction.partyAddress || ""),
      "{{driverContact}}": escHtml(transaction.driverContact || ""),
      "{{vehicleNumber}}": escHtml(transaction.vehicleNumber || ""),
      "{{cropName}}": cropLabel,
      "{{itemsTableHtml}}": itemsTableHtml,
      "{{itemRowsHtml}}": itemRowsHtml,
      "{{chargesRowsHtml}}": chargesRowsHtml,
      "{{totalBags}}": String(transaction.totalBags),
      "{{totalWeight}}": parseFloat(transaction.totalNetWeight || "0").toFixed(1),
      "{{totalAmount}}": fmtInr(totalAmount),
      "{{mandiCommission}}": fmtInr(mandiComm),
      "{{aadhatCommission}}": fmtInr(aadhatComm),
      "{{salesCommission}}": fmtInr(salesComm),
      "{{hammali}}": fmtInr(hamm),
      "{{extraCharges}}": fmtInr(extra),
      "{{tulai}}": fmtInr(tl),
      "{{majduri}}": fmtInr(mj),
      "{{thelaBhada}}": fmtInr(tb),
      "{{palaKarai}}": fmtInr(pk),
      "{{bardan}}": fmtInr(bd),
      "{{driverAdvance}}": fmtInr(drvAdv),
      "{{advanceAmount}}": fmtInr(advAmt),
      "{{grandTotal}}": fmtInr(gt),
      "{{grandTotalRaw}}": gt.toFixed(1),
      "{{amountInWords}}": numberToIndianWords(gt),
    };
    for (const [key, val] of Object.entries(replacements)) {
      html = html.split(key).join(val);
    }
    return html;
  };

  const customHtml = buildCustomHtml();
  const mandiCommission = parseFloat(transaction?.totalMandiCommission || "0");
  const aadhatCommission = parseFloat(transaction?.totalAadhatCommission || "0");
  const hammali = parseFloat(transaction?.totalHammali || "0");
  const extraCharges = parseFloat(transaction?.totalMandiExtraCharges || "0");
  const totalMandiCharges = mandiCommission + aadhatCommission + hammali + extraCharges;
  const salesCommission = parseFloat(transaction?.salesCommission || "0");
  const advanceAmount = parseFloat(transaction?.otherCharges || "0");
  const driverAdvance = parseFloat(transaction?.advancePayment || "0");
  const tulai = parseFloat(transaction?.tulai || "0");
  const majduri = parseFloat(transaction?.majduri || "0");
  const thelaBhada = parseFloat(transaction?.thelaBhada || "0");
  const palaKarai = parseFloat(transaction?.palaKarai || "0");
  const bardan = parseFloat(transaction?.bardan || "0");
  const totalAdditionalCharges = tulai + majduri + thelaBhada + palaKarai + bardan;
  const grandTotal = totalAmount + totalMandiCharges + salesCommission + totalAdditionalCharges + driverAdvance - advanceAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Loading Receipt</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleShare} size="sm" variant="outline" disabled={sharing || isLoading} data-testid="button-share-loading-receipt">
                {sharing ? (
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                {sharing ? "..." : "Share"}
              </Button>
              <Button onClick={handlePrint} size="sm" data-testid="button-print-loading">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
          <DialogDescription>
            Preview and print the loading receipt
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : transaction && merchant ? (
          <div className="overflow-x-auto -mx-4 px-4">
          {customHtml ? (
            <div ref={printRef} className="p-4 bg-white text-black min-w-[650px]" dangerouslySetInnerHTML={{ __html: customHtml }} />
          ) : (
          <div ref={printRef} className="space-y-6 p-4 bg-white text-black min-w-[650px]">
            <div className="header text-center border-b-2 border-black pb-4">
              <img src={`/api/merchants/${merchantId}/receipt-header`} alt={merchant.name} className="max-h-24 mx-auto object-contain" />
            </div>

            <div className="text-center">
              <h2 className="text-xl font-semibold">
                Loading Receipt / लोडिंग रसीद
              </h2>
            </div>

            <div className="receipt-info flex justify-between text-sm" style={{ lineHeight: "1.4" }}>
              <div>
                <div><strong>Receipt No / रसीद नं:</strong> #{transaction.transactionNumber}</div>
                <div><strong>Date / तारीख:</strong> {new Date(transaction.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}</div>
                {transaction.vehicleNumber && (
                  <div><strong>Vehicle # / वाहन नं:</strong> {transaction.vehicleNumber}</div>
                )}
                <div><strong>Crop / फसल:</strong> {(transaction.crop || cropType) === "potato" ? "Potato / आलू" : (transaction.crop || cropType) === "onion" ? "Onion / प्याज" : "Garlic / लहसुन"}</div>
              </div>
              <div className="text-right right">
                {transaction.partyName && (
                  <div><strong>Buyer / खरीदार:</strong> {transaction.partyName}</div>
                )}
                {(buyer?.address || transaction.partyAddress) && (
                  <div className="text-gray-600">{buyer?.address || transaction.partyAddress}</div>
                )}
                <div><strong>Driver Contact:</strong> {transaction.driverContact ? ` ${transaction.driverContact}` : " ___________"}</div>
              </div>
            </div>

            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-center">S.No / क्र.सं.</th>
                  <th className="border px-2 py-1 text-center">Variety / किस्म</th>
                  <th className="border px-2 py-1 text-center">Bags / बोरी</th>
                  <th className="border px-2 py-1 text-center">Weight (Kg) / वजन</th>
                  <th className="border px-2 py-1 text-center">₹/Kg</th>
                  <th className="border px-2 py-1 text-right">Amount / राशि</th>
                </tr>
              </thead>
              <tbody>
                {transaction.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="border px-2 py-1 text-center">{idx + 1}</td>
                    <td className="border px-2 py-1 text-center">{item.potatoType || ""}</td>
                    <td className="border px-2 py-1 text-center">{item.bagsMoved}</td>
                    <td className="border px-2 py-1 text-center">{parseFloat(item.netWeight || "0").toFixed(1)}</td>
                    <td className="border px-2 py-1 text-center">{item.pricePerKg ? `₹${parseFloat(item.pricePerKg).toFixed(2)}` : "-"}</td>
                    <td className="border px-2 py-1 text-right">₹{parseFloat(parseFloat(item.amount || "0").toFixed(1)).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="border px-2 py-1 text-center" colSpan={2}>Total / कुल</td>
                  <td className="border px-2 py-1 text-center">{transaction.totalBags}</td>
                  <td className="border px-2 py-1 text-center">{parseFloat(transaction.totalNetWeight || "0").toFixed(1)}</td>
                  <td className="border px-2 py-1 text-center"></td>
                  <td className="border px-2 py-1 text-right">₹{parseFloat(totalAmount.toFixed(1)).toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            </table>

            <div className="charges-section text-sm">
              {mandiCommission > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Mandi Commission / मंडी कमीशन</span>
                  <span>₹{parseFloat(mandiCommission.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}
              {aadhatCommission > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Aadhat Commission / आढ़त कमीशन</span>
                  <span>₹{parseFloat(aadhatCommission.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}
              {salesCommission > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Sales Commission / बिक्री कमीशन</span>
                  <span>₹{parseFloat(salesCommission.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}
              {hammali > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Hammali / हम्माली</span>
                  <span>₹{parseFloat(hammali.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}
              {extraCharges > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Extra Charges / अतिरिक्त शुल्क</span>
                  <span>₹{parseFloat(extraCharges.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}

              {tulai > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <span>Tulai / तुलाई</span>
                  <span>₹{parseFloat(tulai.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}
              {majduri > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <span>Majduri / मजदूरी</span>
                  <span>₹{parseFloat(majduri.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}
              {thelaBhada > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <span>Thela Bhada / ठेला भाड़ा</span>
                  <span>₹{parseFloat(thelaBhada.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}
              {palaKarai > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <span>Pala Karai / पाला कराई</span>
                  <span>₹{parseFloat(palaKarai.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}
              {bardan > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <span>Bardan (Bags) / बरदान (बोरी)</span>
                  <span>₹{parseFloat(bardan.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}

              {driverAdvance > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <span>Driver Advance / ड्राइवर अग्रिम</span>
                  <span>₹{parseFloat(driverAdvance.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}

              {advanceAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", color: "#dc2626" }}>
                  <span>Less: Advance Amount / अग्रिम राशि</span>
                  <span>-₹{parseFloat(advanceAmount.toFixed(1)).toLocaleString('en-IN')}</span>
                </div>
              )}

            </div>

            <div className="grand-total text-right border-t-2 border-black pt-3 mt-4">
              <span className="text-xl font-bold">
                Grand Total / कुल योग: ₹{parseFloat(grandTotal.toFixed(1)).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="border-t pt-6 mt-6 flex justify-end">
              <div className="text-center" style={{ minWidth: "150px" }}>
                <div className="border-b border-gray-400 mb-1" style={{ height: "40px" }}></div>
                <p className="text-sm text-gray-600">Signature / हस्ताक्षर</p>
              </div>
            </div>
          </div>
          )}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            {t("Transaction not found", "लेनदेन नहीं मिला")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
