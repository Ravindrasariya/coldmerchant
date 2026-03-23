import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Share2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { useToast } from "@/hooks/use-toast";

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

  const handleShare = async () => {
    if (!printRef.current) return;
    setSharing(true);
    try {
      await shareReceiptAsPdf(printRef.current, `Loading-Receipt-${transaction?.transactionNumber || ""}`);
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
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Loading Receipt / लोडिंग रसीद #${transaction?.transactionNumber}</title>
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
            .receipt-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .receipt-info div { text-align: left; }
            .receipt-info .right { text-align: right; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
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
          <div ref={printRef} className="space-y-6 p-4 bg-white text-black min-w-[650px]">
            <div className="header text-center border-b-2 border-black pb-4">
              {merchant.receiptHeaderImage ? (
                <img src={`/api/merchants/${merchantId}/receipt-header`} alt={merchant.name} className="max-h-24 mx-auto object-contain" />
              ) : (
                <>
                  <h1 className="text-2xl font-bold">{merchant.name}</h1>
                  {merchant.address && <p className="text-sm text-gray-600 mt-1">{merchant.address}</p>}
                  {merchant.contactNumber && (
                    <p className="text-sm text-gray-600">
                      Phone / फोन: {merchant.contactNumber}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-xl font-semibold">
                Loading Receipt / लोडिंग रसीद
              </h2>
            </div>

            <div className="receipt-info flex justify-between text-sm">
              <div>
                <p><strong>Receipt No / रसीद नं:</strong> #{transaction.transactionNumber}</p>
                <p><strong>Date / तारीख:</strong> {new Date(transaction.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}</p>
                {transaction.vehicleNumber && (
                  <p><strong>Vehicle # / वाहन नं:</strong> {transaction.vehicleNumber}</p>
                )}
                <p><strong>Crop / फसल:</strong> {cropType === "potato" ? "Potato / आलू" : cropType === "onion" ? "Onion / प्याज" : "Garlic / लहसुन"}</p>
              </div>
              <div className="text-right right">
                {transaction.partyName && (
                  <p><strong>Buyer / खरीदार:</strong> {transaction.partyName}</p>
                )}
                {(buyer?.address || transaction.partyAddress) && (
                  <p className="text-sm text-gray-600">{buyer?.address || transaction.partyAddress}</p>
                )}
                <p><strong>Driver Contact:</strong> {transaction.driverContact ? ` ${transaction.driverContact}` : " ___________"}</p>
                <p><strong>Driver Advance:</strong> {driverAdvance > 0 ? ` ₹${driverAdvance.toLocaleString("en-IN")}` : " ___________"}</p>
              </div>
            </div>

            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">S.No / क्र.सं.</th>
                  <th className="border p-2 text-left">Variety / किस्म</th>
                  <th className="border p-2 text-right">Bags / बोरी</th>
                  <th className="border p-2 text-right">Weight (Kg) / वजन</th>
                  <th className="border p-2 text-right">₹/Kg</th>
                  <th className="border p-2 text-right">Amount / राशि</th>
                </tr>
              </thead>
              <tbody>
                {transaction.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="border p-2">{idx + 1}</td>
                    <td className="border p-2">{item.potatoType || "-"}</td>
                    <td className="border p-2 text-right">{item.bagsMoved}</td>
                    <td className="border p-2 text-right">{parseFloat(item.netWeight || "0").toFixed(1)}</td>
                    <td className="border p-2 text-right">{item.pricePerKg ? `₹${parseFloat(item.pricePerKg).toFixed(2)}` : "-"}</td>
                    <td className="border p-2 text-right">₹{parseFloat(parseFloat(item.amount || "0").toFixed(1)).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="border p-2" colSpan={2}>Total / कुल</td>
                  <td className="border p-2 text-right">{transaction.totalBags}</td>
                  <td className="border p-2 text-right">{parseFloat(transaction.totalNetWeight || "0").toFixed(1)}</td>
                  <td className="border p-2"></td>
                  <td className="border p-2 text-right">₹{parseFloat(totalAmount.toFixed(1)).toLocaleString('en-IN')}</td>
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

              {salesCommission > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
                  <span>Sales Commission / बिक्री कमीशन</span>
                  <span>₹{parseFloat(salesCommission.toFixed(1)).toLocaleString('en-IN')}</span>
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

            <div className="border-t pt-4 text-center text-sm text-gray-500">
              <p>Thank you for your business! / आपके व्यापार के लिए धन्यवाद!</p>
            </div>

            <div className="disclaimer border border-dashed border-gray-400 p-3 text-center text-sm text-gray-600 mt-6">
              <p>No need to sign/stamp the online generated receipt</p>
              <p className="hindi">ऑनलाइन जनरेट रसीद पर हस्ताक्षर/मुहर की आवश्यकता नहीं है</p>
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
