import { useRef, useState, useEffect } from "react";
import { resolveTxnDate } from "@/lib/date-utils";
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
  marka: string | null;
  crop: string | null;
}

function cropToLabel(crop: string | null | undefined): string {
  if (crop === "onion") return "Onion / प्याज";
  if (crop === "garlic") return "Garlic / लहसुन";
  return "Potato / आलू";
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
  debit: string | null;
  crop: string | null;
  createdAt: string;
  dateOfLoading: string | null;
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
  receiptNotes: string | null;
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
  const [headerImageDataUri, setHeaderImageDataUri] = useState<string | null>(null);

  const receiptFilename = () => {
    const buyerName = (transaction?.partyName || buyer?.name || "Receipt").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const dateStr = transaction ? resolveTxnDate(transaction).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "";
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

  useEffect(() => {
    if (!merchant?.receiptHeaderImage) { setHeaderImageDataUri(null); return; }
    const fetchImage = async () => {
      try {
        const res = await fetch(`/api/merchants/${merchantId}/receipt-header`, { credentials: "include" });
        if (!res.ok) { setHeaderImageDataUri(null); return; }
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => setHeaderImageDataUri(reader.result as string);
        reader.readAsDataURL(blob);
      } catch { setHeaderImageDataUri(null); }
    };
    fetchImage();
  }, [merchant?.receiptHeaderImage, merchantId]);

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
    if (!transaction || !merchant) return null;
    // Priority 1: custom per-merchant HTML template
    // Priority 2: built-in Indore default template (with header image if set)
    let html: string;
    let minRows: number;
    if (merchant?.receiptHtmlTemplate) {
      html = merchant.receiptHtmlTemplate;
      minRows = 18;
    } else {
      html = defaultLoadingTemplate;
      // Dynamic row count: A4 content height (~1047px) minus all fixed elements.
      // Fixed px breakdown (estimates): header 91 + buyer-table 107 +
      //   items-thead 28 + items-tfoot 28 + words-row 28 + signature 17
      //   + safety buffer 41 = 340px. Each charge row ~26px.
      // chargeRows = max(nonZeroCount, 1) + 1 (SALES BILL label + net-amount row).
      const _nonZeroCount = [
        parseFloat(transaction.totalHammali || "0"),
        parseFloat(transaction.salesCommission || "0"),
        parseFloat(transaction.totalMandiCommission || "0"),
        parseFloat(transaction.totalAadhatCommission || "0"),
        parseFloat(transaction.totalMandiExtraCharges || "0"),
        parseFloat(transaction.tulai || "0"),
        parseFloat(transaction.majduri || "0"),
        parseFloat(transaction.thelaBhada || "0"),
        parseFloat(transaction.palaKarai || "0"),
        parseFloat(transaction.bardan || "0"),
        parseFloat(transaction.advancePayment || "0"),
        parseFloat(transaction.otherCharges || "0"),
        parseFloat(transaction.debit || "0"),
      ].filter(v => v > 0).length;
      const _chargeRows = Math.max(_nonZeroCount, 1) + 1;
      const _fixedPx = 340 + _chargeRows * 26;
      const _availPx = 1047 - _fixedPx;
      minRows = Math.max(transaction.items.length, Math.floor(_availPx / 24) - 5);
    }
    const txnCrop = transaction.crop || cropType || "potato";
    const distinctCrops = transaction.items.length > 0
      ? Array.from(new Set(transaction.items.map((it) => it.crop || txnCrop)))
      : [txnCrop];
    const cropLabel = distinctCrops.map(cropToLabel).join(", ");
    const dateStr = resolveTxnDate(transaction).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const numCols = 6;
    const itemsDataRows = transaction.items.map((item) =>
      `<tr><td>${escHtml(cropToLabel(item.crop || txnCrop))}</td><td>${item.marka ? escHtml(item.marka) : ""}</td><td>${item.bagsMoved}</td><td>${parseFloat(item.netWeight || "0").toFixed(1)}</td><td>${item.pricePerKg ? `₹${parseFloat(item.pricePerKg).toFixed(2)}` : "-"}</td><td style="text-align:right">₹${parseFloat(parseFloat(item.amount || "0").toFixed(1)).toLocaleString("en-IN")}</td></tr>`
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
    const dbt = parseFloat(transaction.debit || "0");
    const gt = totalAmount + mandiComm + aadhatComm + hamm + extra + salesComm + addlCharges + drvAdv - advAmt - dbt;

    const fmtInr = (v: number) => `₹${parseFloat(v.toFixed(1)).toLocaleString("en-IN")}`;

    const chargesList: [string, number][] = [
      ["Pur. Comm.", salesComm],
      ["Mandi Tax", mandiComm],
      ["Aadhat Comm.", aadhatComm],
      ["Hammali", hamm],
      ["Extra Charges", extra],
      ["Tulai", tl],
      ["Majduri", mj],
      ["Thela Bhada", tb],
      ["Pala Karai", pk],
      ["Bardan (Bags)", bd],
      ["Driver Advance", drvAdv],
      ["Advance Amount", advAmt],
      ["Debit", dbt],
    ];
    const nonZeroCharges = chargesList.filter(([, v]) => v > 0);
    const notesLines = (merchant.receiptNotes || "").split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const notesDiv = notesLines.length > 0
      ? `<div style="font-weight:normal;font-size:12px;margin-top:8px;line-height:1.6">${notesLines.map((l, i) => `${i + 1}. ${escHtml(l)}`).join("<br>")}</div>`
      : "";
    const salesBillInner = `<div style="font-weight:bold">SALES BILL</div>${notesDiv}`;
    let chargesRowsHtml: string;
    const isDeduction = (label: string) => label === "Advance Amount" || label === "Debit";
    if (nonZeroCharges.length > 0) {
      chargesRowsHtml = nonZeroCharges
        .map(([name, v], i) => {
          const labelCell = i === 0 ? `<td colspan="3" rowspan="${nonZeroCharges.length}" style="vertical-align:top;border:1px solid #000">${salesBillInner}</td>` : "";
          const dedu = isDeduction(name);
          const valStyle = dedu ? "text-align:right;border:1px solid #000;color:#dc2626" : "text-align:right;border:1px solid #000";
          const valText = dedu ? `-${fmtInr(v)}` : fmtInr(v);
          return `<tr>${labelCell}<td colspan="2" style="border:1px solid #000">${name}</td><td style="${valStyle}">${valText}</td></tr>`;
        })
        .join("");
    } else {
      chargesRowsHtml = `<tr><td colspan="3" style="vertical-align:top;border:1px solid #000">${salesBillInner}</td><td colspan="2" style="border:1px solid #000">&nbsp;</td><td style="border:1px solid #000">&nbsp;</td></tr>`;
    }

    const headerHtml = headerImageDataUri
      ? `<div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px;margin-left:-8px;margin-right:-8px"><img src="${headerImageDataUri}" style="width:100%;height:auto;display:block"></div>`
      : `<div class="header"><h1>${escHtml(merchant.name || "")}</h1><p>${escHtml(merchant.address || "")}</p><p>Phone : Mobile&nbsp; &ndash; ${escHtml(merchant.contactNumber || "")}</p><p class="tagline">Commission Agent &amp; Order Suppliers of Potato, Onion, Garlic, Ginger &amp; Arbi</p></div>`;

    const replacements: Record<string, string> = {
      "{{headerHtml}}": headerHtml,
      "{{merchantName}}": escHtml(merchant.name || ""),
      "{{merchantAddress}}": escHtml(merchant.address || ""),
      "{{merchantContact}}": escHtml(merchant.contactNumber || ""),
      "{{receiptNumber}}": String(transaction.transactionNumber),
      "{{date}}": dateStr,
      "{{buyerName}}": escHtml(transaction.partyName || buyer?.name || ""),
      "{{buyerContact}}": buyer?.contact && buyer.contact.trim()
        ? `<div style="margin-top:auto;font-weight:normal;font-size:13px">Mobile: ${escHtml(buyer.contact)}</div>`
        : "",
      "{{purchaseOrder}}": transaction.purchaseOrder
        ? `<div style="font-weight:normal;font-size:12px;margin-top:2px">PO#: ${escHtml(transaction.purchaseOrder)}</div>`
        : "",
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
      "{{debit}}": fmtInr(dbt),
      "{{grandTotal}}": `₹${Math.round(gt).toLocaleString("en-IN")}`,
      "{{grandTotalRaw}}": gt.toFixed(1),
      "{{amountInWords}}": numberToIndianWords(Math.round(gt)),
    };
    for (const [key, val] of Object.entries(replacements)) {
      html = html.split(key).join(val);
    }
    return html;
  };

  const customHtml = buildCustomHtml();

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
          <div ref={printRef} className="p-4 bg-white text-black min-w-[650px]" dangerouslySetInnerHTML={{ __html: customHtml! }} />
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
