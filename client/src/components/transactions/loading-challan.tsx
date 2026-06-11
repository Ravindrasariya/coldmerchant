import { useRef, useState } from "react";
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

  const challanFilename = () => {
    const buyerName = (transaction?.partyName || buyer?.name || "Challan").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const dateStr = transaction?.createdAt ? new Date(transaction.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "";
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
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .header p { margin: 5px 0; color: #555; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; line-height: 1.4; }
            .info-row > div { text-align: left; }
            .info-row .right { text-align: right; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: center; }
            th { background-color: #f5f5f5; }
            .hindi { font-size: 0.9em; color: #666; }
            @media print { body { padding: 0; } button { display: none; } }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
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

  const txnCropForView = transaction?.crop || cropType || "potato";

  const totalFreight = parseFloat(transaction?.totalFreight || "0");
  const driverAdvance = parseFloat(transaction?.advancePayment || "0");
  const remainingFreight = Math.max(0, totalFreight - driverAdvance);

  const fmtInr = (v: number) => `₹${parseFloat(v.toFixed(1)).toLocaleString('en-IN')}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Loading Challan</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleShare} size="sm" variant="outline" disabled={sharing || isLoading} data-testid="button-share-loading-challan">
                {sharing ? (
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                {sharing ? "..." : "Share"}
              </Button>
              <Button onClick={handlePrint} size="sm" data-testid="button-print-loading-challan">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
          <DialogDescription>
            Preview and print the loading challan
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
          <div ref={printRef} className="space-y-6 p-4 bg-white text-black min-w-[650px]">
            <div className="header text-center border-b-2 border-black pb-4">
              {merchant.receiptHeaderImage ? (
                <img src={`/api/merchants/${merchantId}/receipt-header`} alt={merchant.name} className="max-h-24 mx-auto object-contain" />
              ) : (
                <div>
                  <h1 className="text-2xl font-bold">{merchant.name}</h1>
                  {merchant.address && <p className="text-gray-600">{merchant.address}</p>}
                  {merchant.contactNumber && <p className="text-gray-600">{merchant.contactNumber}</p>}
                </div>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-xl font-semibold">
                Loading Challan / लोडिंग चालान
              </h2>
            </div>

            <div className="info-row flex justify-between text-sm" style={{ lineHeight: "1.4" }}>
              <div>
                <div><strong>Challan No / चालान नं:</strong> #{transaction.transactionNumber}</div>
                <div><strong>Date / तारीख:</strong> {new Date(transaction.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}</div>
                {transaction.vehicleNumber && (
                  <div><strong>Vehicle # / वाहन नं:</strong> {transaction.vehicleNumber}</div>
                )}
              </div>
              <div className="text-right right">
                {transaction.partyName && (
                  <div><strong>Buyer / खरीदार:</strong> {transaction.partyName}</div>
                )}
                {(buyer?.address || transaction.partyAddress) && (
                  <div className="text-gray-600">{buyer?.address || transaction.partyAddress}</div>
                )}
              </div>
            </div>

            <div className="info-row flex justify-between text-sm border-t border-b border-gray-300 py-3" style={{ lineHeight: "1.6" }}>
              <div>
                <div><strong>Transporter Name / ट्रांसपोर्टर नाम:</strong> {transaction.transporterName ? ` ${transaction.transporterName}` : " ___________"}</div>
                <div><strong>Driver Name / ड्राइवर नाम:</strong> ___________</div>
                <div><strong>Driver Contact / ड्राइवर संपर्क:</strong> {transaction.driverContact ? ` ${transaction.driverContact}` : " ___________"}</div>
              </div>
              <div className="text-right right">
                <div><strong>Total Freight / कुल भाड़ा:</strong> {fmtInr(totalFreight)}</div>
                <div><strong>Driver Advance / ड्राइवर अग्रिम:</strong> {fmtInr(driverAdvance)}</div>
                <div><strong>Remaining Freight / शेष भाड़ा:</strong> {fmtInr(remainingFreight)}</div>
              </div>
            </div>

            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-center">Item Name / वस्तु का नाम</th>
                  <th className="border px-2 py-1 text-center">Marka / मार्का</th>
                  <th className="border px-2 py-1 text-center">No. of Bags / बोरियों की संख्या</th>
                </tr>
              </thead>
              <tbody>
                {transaction.items.map((item) => (
                  <tr key={item.id}>
                    <td className="border px-2 py-1 text-center">{cropToLabel(item.crop || txnCropForView)}{item.potatoType ? ` (${item.potatoType})` : ""}</td>
                    <td className="border px-2 py-1 text-center">{item.marka || ""}</td>
                    <td className="border px-2 py-1 text-center">{item.bagsMoved}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="border px-2 py-1 text-center" colSpan={2}>Total / कुल</td>
                  <td className="border px-2 py-1 text-center">{transaction.totalBags}</td>
                </tr>
              </tfoot>
            </table>

            <div className="text-sm">
              <strong>Remaining Freight in words / शेष भाड़ा शब्दों में:</strong> {numberToIndianWords(Math.round(remainingFreight))}
            </div>

            <div className="border-t pt-6 mt-6 flex justify-between">
              <div className="text-center" style={{ minWidth: "180px" }}>
                <div className="border-b border-gray-400 mb-1" style={{ height: "40px" }}></div>
                <p className="text-sm text-gray-600">Driver's Signature / ड्राइवर के हस्ताक्षर</p>
              </div>
              <div className="text-center" style={{ minWidth: "180px" }}>
                <div className="border-b border-gray-400 mb-1" style={{ height: "40px" }}></div>
                <p className="text-sm text-gray-600">For {merchant.name}</p>
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
