import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface TransactionItem {
  id: number;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string;
  size: string | null;
  bagsMoved: number;
  pricePerBag: string;
  totalAmount: string;
  costPerBag: string;
  lotCost: string;
}

interface SeedTransaction {
  id: number;
  transactionNumber: number;
  merchantId: number;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  vehicleNumber: string | null;
  transportCharges: string | null;
  otherCharges: string | null;
  otherChargesRemarks: string | null;
  totalBags: number;
  totalCost: string | null;
  totalRevenue: string | null;
  totalProfitLoss: string | null;
  totalDueToFarmer: string | null;
  createdAt: string;
  items: TransactionItem[];
}

interface Merchant {
  id: number;
  name: string;
  contactNumber: string | null;
  address: string | null;
}

interface SeedSalesReceiptDialogProps {
  transactionId: number | null;
  merchantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SeedSalesReceiptDialog({ transactionId, merchantId, open, onOpenChange }: SeedSalesReceiptDialogProps) {
  const { t } = useLanguage();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: transaction, isLoading: txnLoading } = useQuery<SeedTransaction>({
    queryKey: ["/api/seed-transactions", transactionId],
    enabled: !!transactionId && open,
  });

  const { data: merchant, isLoading: merchantLoading } = useQuery<Merchant>({
    queryKey: ["/api/merchants", merchantId],
    enabled: !!merchantId && open,
  });

  const isLoading = txnLoading || merchantLoading;

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "₹0.00";
    return `₹${parseFloat(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Seed Sales Receipt / बीज बिक्री रसीद #${transaction?.transactionNumber}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 10px 15px;
              max-width: 800px;
              margin: 0 auto;
              font-size: 11px;
              line-height: 1.3;
            }
            .header {
              text-align: center;
              border-bottom: 1px solid #000;
              padding-bottom: 6px;
              margin-bottom: 8px;
            }
            .header h1 {
              margin: 0;
              font-size: 16px;
            }
            .header p {
              margin: 2px 0;
              color: #555;
              font-size: 10px;
            }
            .receipt-title {
              text-align: center;
              font-size: 13px;
              font-weight: 600;
              margin: 6px 0;
            }
            .receipt-info {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8px;
              font-size: 10px;
            }
            .receipt-info p {
              margin: 1px 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 8px;
              font-size: 10px;
            }
            th, td {
              border: 1px solid #999;
              padding: 3px 5px;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
              font-size: 9px;
            }
            .totals-section {
              border: 1px solid #000;
              padding: 6px 8px;
              margin-top: 8px;
            }
            .totals-section h3 {
              font-size: 11px;
              margin: 0 0 4px 0;
              padding-bottom: 3px;
              border-bottom: 1px solid #ccc;
              text-align: center;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 2px 0;
              font-size: 10px;
            }
            .totals-row.highlight {
              background-color: #f5f5f5;
              font-weight: bold;
              font-size: 11px;
              padding: 4px 6px;
              margin: 3px -8px;
            }
            .totals-row.final {
              background-color: #e8f5e9;
              font-weight: bold;
              font-size: 12px;
              padding: 5px 6px;
              margin: 4px -8px -6px -8px;
              border-top: 1px solid #000;
            }
            .profit { color: #2e7d32; }
            .loss { color: #c62828; }
            .disclaimer {
              margin-top: 10px;
              padding: 4px;
              border: 1px dashed #999;
              text-align: center;
              font-size: 9px;
              color: #666;
            }
            .disclaimer p { margin: 1px 0; }
            .thank-you {
              text-align: center;
              font-size: 9px;
              color: #666;
              margin: 6px 0;
            }
            @media print {
              body { padding: 8px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (!open) return null;

  const transportCharges = parseFloat(transaction?.transportCharges || "0");
  const otherCharges = parseFloat(transaction?.otherCharges || "0");
  const totalCost = parseFloat(transaction?.totalCost || "0");
  const totalRevenue = parseFloat(transaction?.totalRevenue || "0");
  const totalProfitLoss = parseFloat(transaction?.totalProfitLoss || "0");
  const totalDueToFarmer = parseFloat(transaction?.totalDueToFarmer || "0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{t("Seed Sales Receipt", "बीज बिक्री रसीद")}</span>
            <Button onClick={handlePrint} size="sm" data-testid="button-print-seed-receipt">
              <Printer className="h-4 w-4 mr-2" />
              {t("Print", "प्रिंट")}
            </Button>
          </DialogTitle>
          <DialogDescription>
            {t("Preview and print the seed sales receipt", "बीज बिक्री रसीद का पूर्वावलोकन और प्रिंट करें")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : transaction && merchant ? (
          <div ref={printRef} className="space-y-2 p-3 bg-white text-black text-xs">
            <div className="header text-center border-b border-black pb-2">
              <h1 className="text-base font-bold">{merchant.name}</h1>
              {merchant.address && <p className="text-[10px] text-gray-600">{merchant.address}</p>}
              {merchant.contactNumber && (
                <p className="text-[10px] text-gray-600">Phone / फोन: {merchant.contactNumber}</p>
              )}
            </div>

            <div className="receipt-title text-center text-sm font-semibold">
              Seed Sales Receipt / बीज बिक्री रसीद
            </div>

            <div className="receipt-info flex justify-between text-[10px]">
              <div className="space-y-0.5">
                <p><strong>Receipt No:</strong> #{transaction.transactionNumber}</p>
                <p><strong>Date:</strong> {new Date(transaction.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}</p>
                {transaction.vehicleNumber && <p><strong>Vehicle:</strong> {transaction.vehicleNumber}</p>}
              </div>
              <div className="text-right space-y-0.5">
                <p><strong>Farmer:</strong> {transaction.farmerName}</p>
                {transaction.farmerContact && <p><strong>Contact:</strong> {transaction.farmerContact}</p>}
                <p><strong>Location:</strong> {[transaction.village, transaction.district, transaction.state].filter(Boolean).join(", ")}</p>
              </div>
            </div>

            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 px-1 py-0.5 text-left">S#</th>
                  <th className="border border-gray-400 px-1 py-0.5 text-left">Lot</th>
                  <th className="border border-gray-400 px-1 py-0.5 text-left">Type</th>
                  <th className="border border-gray-400 px-1 py-0.5 text-left">Size</th>
                  <th className="border border-gray-400 px-1 py-0.5 text-right">Bags</th>
                  <th className="border border-gray-400 px-1 py-0.5 text-right">Rate</th>
                  <th className="border border-gray-400 px-1 py-0.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transaction.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="border border-gray-400 px-1 py-0.5">{idx + 1}</td>
                    <td className="border border-gray-400 px-1 py-0.5">S#{item.serialNumber} - {item.coldStoreName}</td>
                    <td className="border border-gray-400 px-1 py-0.5">{item.potatoType}</td>
                    <td className="border border-gray-400 px-1 py-0.5">{item.size || "Mixed"}</td>
                    <td className="border border-gray-400 px-1 py-0.5 text-right">{item.bagsMoved}</td>
                    <td className="border border-gray-400 px-1 py-0.5 text-right">{formatCurrency(item.pricePerBag)}</td>
                    <td className="border border-gray-400 px-1 py-0.5 text-right">{formatCurrency(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="border border-gray-400 px-1 py-0.5" colSpan={4}>Total / कुल</td>
                  <td className="border border-gray-400 px-1 py-0.5 text-right">{transaction.totalBags}</td>
                  <td className="border border-gray-400 px-1 py-0.5"></td>
                  <td className="border border-gray-400 px-1 py-0.5 text-right">{formatCurrency(transaction.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="totals-section border border-black p-2">
              <h3 className="text-xs font-semibold mb-1 text-center border-b border-gray-300 pb-1">
                Bill Summary / बिल सारांश
              </h3>
              
              <div className="space-y-0.5 text-[10px]">
                <div className="totals-row flex justify-between">
                  <span>Sale Amount / बिक्री राशि:</span>
                  <span className="font-medium">{formatCurrency(transaction.totalRevenue)}</span>
                </div>
                
                {transportCharges > 0 && (
                  <div className="totals-row flex justify-between">
                    <span>Transport / परिवहन:</span>
                    <span className="font-medium">+ {formatCurrency(transaction.transportCharges)}</span>
                  </div>
                )}
                
                {otherCharges > 0 && (
                  <div className="totals-row flex justify-between">
                    <span>Other{transaction.otherChargesRemarks && ` (${transaction.otherChargesRemarks})`}:</span>
                    <span className="font-medium">+ {formatCurrency(transaction.otherCharges)}</span>
                  </div>
                )}

                <div className="totals-row highlight flex justify-between bg-gray-100 px-2 py-1 font-bold text-xs -mx-2 my-1">
                  <span>Due to Farmer / किसान को देय:</span>
                  <span>{formatCurrency(transaction.totalDueToFarmer)}</span>
                </div>

                <div className="border-t border-black pt-1 mt-1">
                  <div className="flex justify-between text-[9px] text-gray-600">
                    <span>Cost: {formatCurrency(transaction.totalCost)}</span>
                    <span>Revenue: {formatCurrency(transaction.totalRevenue)}</span>
                    <span className={totalProfitLoss >= 0 ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                      {totalProfitLoss >= 0 ? "Profit" : "Loss"}: {formatCurrency(Math.abs(totalProfitLoss).toString())}
                    </span>
                  </div>
                </div>

                <div className="totals-row final flex justify-between bg-green-100 px-2 py-1.5 font-bold text-xs -mx-2 -mb-2 mt-1 border-t border-black">
                  <span>Amount Payable / भुगतान योग्य:</span>
                  <span className="text-sm">{formatCurrency(transaction.totalDueToFarmer)}</span>
                </div>
              </div>
            </div>

            <div className="thank-you text-center text-[9px] text-gray-500 pt-1">
              Thank you! / धन्यवाद!
            </div>

            <div className="disclaimer border border-dashed border-gray-400 p-1 text-center text-[8px] text-gray-500">
              <p>No signature/stamp required for online receipt | ऑनलाइन रसीद पर हस्ताक्षर/मुहर आवश्यक नहीं</p>
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
