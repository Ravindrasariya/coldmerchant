import { useRef, useState } from "react";
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

interface TransactionItem {
  id: number;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
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
  totalFreight: string | null;
  advancePayment: string | null;
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
}

interface LoadingChallanDialogProps {
  transactionId: number | null;
  merchantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cropType?: "potato" | "onion" | "garlic";
}

export function LoadingChallanDialog({ transactionId, merchantId, open, onOpenChange, cropType = "potato" }: LoadingChallanDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

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

  const isBikri = !!transaction && transaction.transactionType !== "loading";
  const challanTitle = isBikri ? t("Bikri Challan", "बिक्री चालान") : t("Loading Challan", "लोडिंग चालान");

  const challanFilename = () => {
    const buyerName = (transaction?.partyName || buyer?.name || "Challan").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const dateStr = transaction ? resolveTxnDate(transaction).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "";
    return `Challan_${buyerName}_${dateStr}`;
  };

  const handleShare = async () => {
    if (!printRef.current) return;
    setSharing(true);
    try {
      await shareReceiptAsPdf(printRef.current, challanFilename(), null);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "PDF generation failed", description: "Please try again", variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const printTitle = challanFilename();
    const printContent = printRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${printTitle}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
              color: #000;
            }
            table { width: 100%; border-collapse: collapse; }
            @media print { body { padding: 0; } button { display: none; } }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (!open) return null;

  const txnCropForView = transaction?.crop || cropType || "potato";

  const totalFreight = parseFloat(transaction?.totalFreight || "0");
  const driverAdvance = parseFloat(transaction?.advancePayment || "0");
  const netFreight = Math.max(0, totalFreight - driverAdvance);
  const totalBags = transaction?.totalBags || 0;
  const totalWeight = parseFloat(transaction?.totalNetWeight || "0");

  const fmtInr = (v: number) => `₹${parseFloat(v.toFixed(1)).toLocaleString('en-IN')}`;

  const border = "1px solid #000";
  const labelCell: React.CSSProperties = { border, padding: "4px 8px", fontSize: 13, textAlign: "left", verticalAlign: "top" };
  const valueCell: React.CSSProperties = { border, padding: "4px 8px", fontSize: 13, textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>{challanTitle}</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleShare} size="sm" variant="outline" disabled={sharing || isLoading} data-testid="button-share-loading-challan">
                {sharing ? (
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                {sharing ? "..." : t("Share", "साझा करें")}
              </Button>
              <Button onClick={handlePrint} size="sm" data-testid="button-print-loading-challan">
                <Printer className="h-4 w-4 mr-2" />
                {t("Print", "प्रिंट करें")}
              </Button>
            </div>
          </div>
          <DialogDescription>
            {isBikri
              ? t("Preview and print the Bikri challan", "बिक्री चालान देखें और प्रिंट करें")
              : t("Preview and print the loading challan", "लोडिंग चालान देखें और प्रिंट करें")}
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
          <div ref={printRef} style={{ background: "#fff", color: "#000", minWidth: 650, fontFamily: "Arial, sans-serif", padding: 8 }}>
            {/* Header — always text, no header image for challan */}
            <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 10, marginBottom: 12 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1 }}>{merchant.name}</h1>
              {merchant.address && <p style={{ margin: "2px 0", fontSize: 13 }}>{merchant.address}</p>}
              {merchant.contactNumber && <p style={{ margin: "2px 0", fontSize: 13 }}>{t("Phone", "फ़ोन")}: {merchant.contactNumber}</p>}
              <p style={{ margin: "6px 0 0", fontSize: 12 }}>
                {t("Commission Agent & Order Suppliers of Potato, Onion, Garlic, Ginger & Arbi", "आलू, प्याज, लहसुन, अदरक एवं अरबी के कमीशन एजेंट एवं ऑर्डर सप्लायर")}
              </p>
            </div>

            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{challanTitle}</h2>
            </div>

            <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 6 }}>
              {t("Challan No", "चालान नं")}: #{transaction.transactionNumber}
            </div>

            {/* Buyer "To" block (left) + freight info box (right) */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td rowSpan={7} style={{ border, padding: "6px 8px", width: "52%", verticalAlign: "top" }}>
                    <div style={{ fontWeight: "bold", fontSize: 13 }}>{t("To", "सेवा में")}:</div>
                    <div style={{ fontWeight: "bold", fontSize: 15, marginTop: 2 }}>{transaction.partyName || buyer?.name || ""}</div>
                    {(buyer?.address || transaction.partyAddress) && (
                      <div style={{ fontSize: 13, marginTop: 2 }}>{buyer?.address || transaction.partyAddress}</div>
                    )}
                    {buyer?.contact && buyer.contact.trim() && (
                      <div style={{ fontSize: 13, marginTop: 2 }}>{t("Mobile", "मोबाइल")}: {buyer.contact}</div>
                    )}
                    <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.8 }}>
                      <div><strong>{t("Transporter", "ट्रांसपोर्टर")}:</strong> {transaction.transporterName || ""}</div>
                      <div><strong>{t("Driver Name", "ड्राइवर नाम")}:</strong> </div>
                      <div><strong>{t("Driver Mobile", "ड्राइवर मोबाइल")}:</strong> {transaction.driverContact || ""}</div>
                    </div>
                  </td>
                  <td style={labelCell}>{t("Date", "दिनांक")}</td>
                  <td style={valueCell}>{resolveTxnDate(transaction).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                </tr>
                <tr>
                  <td style={labelCell}>{t("Total Bags", "कुल बोरी")}</td>
                  <td style={valueCell}>{totalBags}</td>
                </tr>
                <tr>
                  <td style={labelCell}>{t("Total Weight", "कुल वजन")}</td>
                  <td style={valueCell}>{totalWeight > 0 ? totalWeight.toFixed(1) : ""}</td>
                </tr>
                <tr>
                  <td style={labelCell}>{t("Lorry No.", "लॉरी नं")}</td>
                  <td style={valueCell}>{transaction.vehicleNumber || ""}</td>
                </tr>
                <tr>
                  <td style={labelCell}>{t("Total Freight", "कुल भाड़ा")}</td>
                  <td style={valueCell}>{fmtInr(totalFreight)}</td>
                </tr>
                <tr>
                  <td style={labelCell}>{t("Advance Paid", "अग्रिम भुगतान")}</td>
                  <td style={valueCell}>{fmtInr(driverAdvance)}</td>
                </tr>
                <tr>
                  <td style={{ ...labelCell, fontWeight: "bold", borderTop: "2px solid #000" }}>{t("Net Freight", "शेष भाड़ा")}</td>
                  <td style={{ ...valueCell, fontWeight: "bold", borderTop: "2px solid #000" }}>{fmtInr(netFreight)}</td>
                </tr>
              </tbody>
            </table>

            {/* One-liner between transport/info block and item details */}
            <div style={{ fontSize: 13, margin: "12px 0 6px", fontStyle: "italic" }}>
              {t("Item Details (given below) being sent to you — On Order", "नीचे दिए गए माल का विवरण आपको भेजा जा रहा है — ऑर्डर पर")}
            </div>

            {/* Items table — Item Name, No. of Bags, Marka (no weight/rate/amount) */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 2 }}>
              <thead>
                <tr>
                  <th style={{ border, padding: "6px 8px", fontSize: 13, textAlign: "left", background: "#f5f5f5" }}>{t("Item Name", "वस्तु का नाम")}</th>
                  <th style={{ border, padding: "6px 8px", fontSize: 13, textAlign: "center", background: "#f5f5f5" }}>{t("No. of Bags", "बोरियों की संख्या")}</th>
                  <th style={{ border, padding: "6px 8px", fontSize: 13, textAlign: "center", background: "#f5f5f5" }}>{t("Marka", "मार्का")}</th>
                </tr>
              </thead>
              <tbody>
                {transaction.items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border, padding: "4px 8px", fontSize: 13, textAlign: "left" }}>{cropToLabel(item.crop || txnCropForView)}{item.potatoType ? ` (${item.potatoType})` : ""}</td>
                    <td style={{ border, padding: "4px 8px", fontSize: 13, textAlign: "center" }}>{item.bagsMoved}</td>
                    <td style={{ border, padding: "4px 8px", fontSize: 13, textAlign: "center" }}>{item.marka || ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: "bold" }}>
                  <td style={{ border, padding: "4px 8px", fontSize: 13, textAlign: "left" }}>{t("Total", "कुल")}</td>
                  <td style={{ border, padding: "4px 8px", fontSize: 13, textAlign: "center" }}>{totalBags}</td>
                  <td style={{ border, padding: "4px 8px", fontSize: 13, textAlign: "center" }}></td>
                </tr>
              </tfoot>
            </table>

            {/* Net freight in words */}
            <div style={{ fontSize: 13, marginTop: 12 }}>
              <strong>{t("Net Freight in words", "शेष भाड़ा शब्दों में")}:</strong> {numberToIndianWords(Math.round(netFreight))}
            </div>

            {/* Note */}
            <div style={{ fontSize: 13, marginTop: 10 }}>
              <strong>{t("Note", "नोट")}:</strong>
            </div>

            {/* Signatures */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 48 }}>
              <div style={{ textAlign: "center", minWidth: 180 }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 4, fontSize: 13 }}>{t("Driver's Signature", "ड्राइवर के हस्ताक्षर")}</div>
              </div>
              <div style={{ textAlign: "center", minWidth: 180 }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 4, fontSize: 13, fontWeight: "bold" }}>{t("For", "के लिए")} {merchant.name}</div>
              </div>
            </div>
          </div>
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
