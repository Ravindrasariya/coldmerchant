import { useRef, useState, useEffect } from "react";
import { resolveTxnDate } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Share2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { printHtmlDocument } from "@/lib/print-receipt";
import { useToast } from "@/hooks/use-toast";
import { numberToIndianWords } from "@/lib/number-to-words";
import { defaultBikriTemplate } from "@/lib/default-bikri-template";

interface TransactionItem {
  id: number;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  netWeight: string | null;
  revenue: string | null;
  marka: string | null;
  crop: string | null;
}

function cropToLabel(crop: string | null | undefined): string {
  if (crop === "onion") return "Onion / प्याज";
  if (crop === "garlic") return "Garlic / लहसुन";
  return "Potato / आलू";
}

interface Transaction {
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
  revenue: string | null;
  totalBags: number;
  totalNetWeight: string | null;
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
  salesReceiptHtmlTemplate: string | null;
  receiptNotes: string | null;
}

interface SalesReceiptDialogProps {
  transactionId: number | null;
  merchantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoAction?: "print" | "share";
  cropType?: "potato" | "onion" | "garlic";
}

export function SalesReceiptDialog({ transactionId, merchantId, open, onOpenChange, autoAction, cropType = "potato" }: SalesReceiptDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const autoActionDone = useRef(false);
  const [headerImageDataUri, setHeaderImageDataUri] = useState<string | null>(null);

  const receiptFilename = () => {
    if (!transaction) return "Bikri-Receipt";
    const buyerName = transaction.partyName || buyer?.name || "Receipt";
    const date = resolveTxnDate(transaction);
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const cleanName = buyerName.replace(/[^a-zA-Z0-9\u0900-\u097F ]/g, "").replace(/\s+/g, "_");
    return `${cleanName}_${dd}-${mm}-${yyyy}`;
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

  const { data: transaction, isLoading: txnLoading } = useQuery<Transaction>({
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

    const printTitle = receiptFilename();
    let html: string;
    if (customHtml) {
      html = customHtml.replace(/<head>/i, `<head><title>${printTitle}</title>`);
    } else {
      const printContent = printRef.current.innerHTML;
      html = `
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
              .grand-total { font-size: 20px; font-weight: bold; text-align: right; border-top: 2px solid #000; padding-top: 10px; margin-top: 10px; }
              .hindi { font-size: 0.9em; color: #666; }
              @media print { body { padding: 0; } button { display: none; } }
            </style>
          </head>
          <body>${printContent}</body>
        </html>
      `;
    }
    printHtmlDocument(html);
  };

  useEffect(() => {
    if (!open || !autoAction || autoActionDone.current || isLoading) return;
    autoActionDone.current = true;
    if (autoAction === "print") {
      handlePrint();
      onOpenChange(false);
    } else if (autoAction === "share") {
      const timer = setTimeout(async () => {
        if (!printRef.current) {
          onOpenChange(false);
          return;
        }
        await handleShare();
        onOpenChange(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open, autoAction, isLoading]);

  useEffect(() => {
    if (!open) {
      autoActionDone.current = false;
    }
  }, [open]);

  const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const fmtInr = (v: number) => `₹${parseFloat(v.toFixed(1)).toLocaleString("en-IN")}`;

  // Total Value: overall transaction revenue when set, otherwise the sum of
  // per-lot revenues (mirrors the register's revenue display convention).
  const lotRevenueSum = transaction?.items.reduce((sum, item) => sum + parseFloat(item.revenue || "0"), 0) || 0;
  const storedRevenue = parseFloat(transaction?.revenue || "0");
  const totalValue = storedRevenue > 0 ? storedRevenue : lotRevenueSum;

  const buildCustomHtml = () => {
    if (!transaction || !merchant) return null;
    // Priority 1: custom per-merchant Bikri/sales HTML template
    // Priority 2: built-in default Bikri template (with header image if set)
    let html: string;
    let minRows: number;
    if (merchant?.salesReceiptHtmlTemplate) {
      html = merchant.salesReceiptHtmlTemplate;
      minRows = 18;
    } else {
      html = defaultBikriTemplate;
      // Dynamic row count: A4 content height (~1047px) minus fixed elements.
      // Fixed px: header 91 + buyer-table 107 + items-thead 28 + items-tfoot 28
      //   + charges block (2 rows ≈ 52) + words-row 28 + signature 17 + buffer 41 = 392px.
      const _availPx = 1047 - 392;
      // Subtract 3 rows so the bill keeps ~3 rows of breathing space at the
      // bottom and never spills the footer blocks onto a second page.
      minRows = Math.max(transaction.items.length, Math.floor(_availPx / 24) - 9);
    }
    const txnCrop = transaction.crop || cropType || "potato";
    const distinctCrops = transaction.items.length > 0
      ? Array.from(new Set(transaction.items.map((it) => it.crop || txnCrop)))
      : [txnCrop];
    const cropLabel = distinctCrops.map(cropToLabel).join(", ");
    const dateStr = resolveTxnDate(transaction).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const numCols = 5;
    const itemsDataRows = transaction.items.map((item) => {
      const rev = parseFloat(item.revenue || "0");
      return `<tr><td>${escHtml(cropToLabel(item.crop || txnCrop))}${item.potatoType ? ` (${escHtml(item.potatoType)})` : ""}</td><td>${item.marka ? escHtml(item.marka) : ""}</td><td>${item.bagsMoved}</td><td>${parseFloat(item.netWeight || "0").toFixed(1)}</td><td style="text-align:right">${rev > 0 ? fmtInr(rev) : "&nbsp;"}</td></tr>`;
    }).join("");
    const blankCount = Math.max(0, minRows - transaction.items.length);
    const blankRows = Array(blankCount).fill(`<tr>${"<td>&nbsp;</td>".repeat(numCols)}</tr>`).join("");
    const itemRowsHtml = itemsDataRows + blankRows;
    const fmtFinal = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
    const itemsTableHtml = `<table><thead><tr><th>Item Name</th><th>Marka</th><th>Quantity</th><th>Weight</th><th style="text-align:right">Value</th></tr></thead><tbody>${itemRowsHtml}</tbody><tfoot><tr style="font-weight:bold;border-top:1px solid #000"><td>Total</td><td></td><td>${transaction.totalBags}</td><td>${parseFloat(transaction.totalNetWeight || "0").toFixed(1)}</td><td style="text-align:right">${fmtFinal(totalValue)}</td></tr></tfoot></table>`;

    // Build notes HTML from merchant's custom notes (one line per note, auto-numbered).
    const notesLines = (merchant.receiptNotes || "").split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const receiptNotesHtml = notesLines.length > 0
      ? `<div style="font-weight:normal;font-size:12px;margin-top:8px;line-height:1.6">${notesLines.map((l, i) => `${i + 1}. ${escHtml(l)}`).join("<br>")}</div>`
      : "";

    // No deductions/additions on the Bikri bill: Net Amount === Total Value.
    const chargesRowsHtml = `<tr><td colspan="2" rowspan="2" style="vertical-align:top;border:1px solid #000"><div style="font-weight:bold">SALES BILL</div>${receiptNotesHtml}</td><td colspan="2" style="border:1px solid #000">&nbsp;</td><td style="border:1px solid #000">&nbsp;</td></tr>`;

    const headerHtml = headerImageDataUri
      ? `<div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px;margin-left:-8px;margin-right:-8px"><img src="${headerImageDataUri}" style="width:100%;height:auto;display:block"></div>`
      : `<div class="header"><h1>${escHtml(merchant.name || "")}</h1><p>${escHtml(merchant.address || "")}</p><p>Phone : Mobile&nbsp; &ndash; ${escHtml(merchant.contactNumber || "")}</p><p class="tagline">Commission Agent &amp; Order Suppliers of Potato, Onion, Garlic, Ginger &amp; Arbi</p></div>`;

    const replacements: Record<string, string> = {
      "{{headerHtml}}": headerHtml,
      "{{receiptNotesHtml}}": receiptNotesHtml,
      "{{merchantName}}": escHtml(merchant.name || ""),
      "{{merchantAddress}}": escHtml(merchant.address || ""),
      "{{merchantContact}}": escHtml(merchant.contactNumber || ""),
      "{{receiptNumber}}": String(transaction.transactionNumber),
      "{{date}}": dateStr,
      "{{buyerName}}": escHtml(transaction.partyName || buyer?.name || ""),
      "{{buyerContact}}": buyer?.contact && buyer.contact.trim()
        ? `<div style="margin-top:auto;font-weight:normal;font-size:13px">Mobile: ${escHtml(buyer.contact)}</div>`
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
      "{{totalAmount}}": `₹${Math.round(totalValue).toLocaleString("en-IN")}`,
      "{{driverAdvance}}": fmtInr(parseFloat(transaction.advancePayment || "0")),
      "{{grandTotal}}": `₹${Math.round(totalValue).toLocaleString("en-IN")}`,
      "{{grandTotalRaw}}": totalValue.toFixed(1),
      "{{amountInWords}}": numberToIndianWords(Math.round(totalValue)),
    };
    for (const [key, val] of Object.entries(replacements)) {
      html = html.split(key).join(val);
    }
    return html;
  };

  const customHtml = buildCustomHtml();

  if (!open) return null;

  if (autoAction === "print") {
    return null;
  }

  const isAutoShare = autoAction === "share";

  return (
    <Dialog open={open} onOpenChange={isAutoShare ? undefined : onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined} style={isAutoShare ? { pointerEvents: "none" } : undefined}>
        {isAutoShare ? (
          <DialogTitle className="sr-only">Generating PDF</DialogTitle>
        ) : (
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>{t("Bikri Receipt", "बिक्री रसीद")}</DialogTitle>
              <div className="flex gap-2">
                <Button onClick={handleShare} size="sm" variant="outline" disabled={sharing || isLoading} data-testid="button-share-receipt">
                  {sharing ? (
                    <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Share2 className="h-4 w-4 mr-2" />
                  )}
                  {sharing ? "..." : t("Share", "साझा करें")}
                </Button>
                <Button onClick={handlePrint} size="sm" data-testid="button-print">
                  <Printer className="h-4 w-4 mr-2" />
                  {t("Print", "प्रिंट करें")}
                </Button>
              </div>
            </div>
            <DialogDescription>
              {t("Preview and print the Bikri receipt", "बिक्री रसीद देखें और प्रिंट करें")}
            </DialogDescription>
          </DialogHeader>
        )}

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
