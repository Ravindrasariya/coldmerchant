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
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .header p {
              margin: 5px 0;
              color: #555;
            }
            .receipt-info {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
            }
            .receipt-info div {
              text-align: left;
            }
            .receipt-info .right {
              text-align: right;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 10px;
              text-align: left;
            }
            th {
              background-color: #f5f5f5;
            }
            .totals-section {
              margin-top: 20px;
              border: 2px solid #000;
              padding: 15px;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 5px 0;
              border-bottom: 1px dotted #ccc;
            }
            .totals-row:last-child {
              border-bottom: none;
            }
            .totals-row.highlight {
              background-color: #f5f5f5;
              font-weight: bold;
              font-size: 16px;
              padding: 10px;
              margin: 5px -15px;
            }
            .totals-row.final {
              background-color: #e8f5e9;
              font-weight: bold;
              font-size: 18px;
              padding: 12px;
              margin: 10px -15px -15px -15px;
              border-top: 2px solid #000;
            }
            .profit { color: #2e7d32; }
            .loss { color: #c62828; }
            .bilingual {
              display: block;
            }
            .hindi {
              font-size: 0.9em;
              color: #666;
            }
            .disclaimer {
              margin-top: 30px;
              padding: 10px;
              border: 1px dashed #999;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
            @media print {
              body { padding: 0; }
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
          <div ref={printRef} className="space-y-6 p-4 bg-white text-black">
            <div className="header text-center border-b-2 border-black pb-4">
              <h1 className="text-2xl font-bold">{merchant.name}</h1>
              {merchant.address && <p className="text-sm text-gray-600 mt-1">{merchant.address}</p>}
              {merchant.contactNumber && (
                <p className="text-sm text-gray-600">
                  Phone / फोन: {merchant.contactNumber}
                </p>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-xl font-semibold">
                Seed Sales Receipt / बीज बिक्री रसीद
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
              </div>
              <div className="text-right">
                <p><strong>Farmer / किसान:</strong> {transaction.farmerName}</p>
                {transaction.farmerContact && (
                  <p><strong>Contact / संपर्क:</strong> {transaction.farmerContact}</p>
                )}
                <p><strong>Location / स्थान:</strong> {[transaction.village, transaction.tehsil, transaction.district, transaction.state].filter(Boolean).join(", ")}</p>
              </div>
            </div>

            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">S.No / क्र.सं.</th>
                  <th className="border p-2 text-left">Lot Details / लॉट विवरण</th>
                  <th className="border p-2 text-left">Type / प्रकार</th>
                  <th className="border p-2 text-left">Size / आकार</th>
                  <th className="border p-2 text-right">Bags / बोरी</th>
                  <th className="border p-2 text-right">Rate/Bag / दर</th>
                  <th className="border p-2 text-right">Amount / राशि</th>
                </tr>
              </thead>
              <tbody>
                {transaction.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="border p-2">{idx + 1}</td>
                    <td className="border p-2">S#{item.serialNumber} - {item.coldStoreName}</td>
                    <td className="border p-2">{item.potatoType}</td>
                    <td className="border p-2">{item.size || "Mixed / मिश्रित"}</td>
                    <td className="border p-2 text-right">{item.bagsMoved}</td>
                    <td className="border p-2 text-right">{formatCurrency(item.pricePerBag)}</td>
                    <td className="border p-2 text-right">{formatCurrency(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="border p-2" colSpan={4}>Total / कुल</td>
                  <td className="border p-2 text-right">{transaction.totalBags}</td>
                  <td className="border p-2"></td>
                  <td className="border p-2 text-right">{formatCurrency(transaction.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="totals-section border-2 border-black p-4">
              <h3 className="text-lg font-semibold mb-3 text-center border-b pb-2">
                Bill Summary / बिल सारांश
              </h3>
              
              <div className="space-y-2">
                <div className="totals-row flex justify-between py-1 border-b border-dotted border-gray-300">
                  <span>Total Sale Amount / कुल बिक्री राशि:</span>
                  <span className="font-medium">{formatCurrency(transaction.totalRevenue)}</span>
                </div>
                
                {transportCharges > 0 && (
                  <div className="totals-row flex justify-between py-1 border-b border-dotted border-gray-300">
                    <span>Transport Charges / परिवहन शुल्क:</span>
                    <span className="font-medium">+ {formatCurrency(transaction.transportCharges)}</span>
                  </div>
                )}
                
                {otherCharges > 0 && (
                  <div className="totals-row flex justify-between py-1 border-b border-dotted border-gray-300">
                    <span>
                      Other Charges / अन्य शुल्क
                      {transaction.otherChargesRemarks && <span className="text-gray-500 text-sm"> ({transaction.otherChargesRemarks})</span>}:
                    </span>
                    <span className="font-medium">+ {formatCurrency(transaction.otherCharges)}</span>
                  </div>
                )}

                <div className="totals-row highlight flex justify-between bg-gray-100 p-3 font-bold text-lg -mx-4 my-2">
                  <span>Total Due to Farmer / किसान को देय:</span>
                  <span>{formatCurrency(transaction.totalDueToFarmer)}</span>
                </div>

                <div className="border-t-2 border-black pt-3 mt-3">
                  <div className="totals-row flex justify-between py-1 text-sm text-gray-600">
                    <span>Purchase Cost / खरीद लागत:</span>
                    <span>{formatCurrency(transaction.totalCost)}</span>
                  </div>
                  <div className="totals-row flex justify-between py-1 text-sm text-gray-600">
                    <span>Sale Revenue / बिक्री आय:</span>
                    <span>{formatCurrency(transaction.totalRevenue)}</span>
                  </div>
                  <div className={`totals-row flex justify-between py-2 font-semibold ${totalProfitLoss >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    <span>{totalProfitLoss >= 0 ? "Profit / लाभ:" : "Loss / हानि:"}</span>
                    <span>{totalProfitLoss >= 0 ? "" : "-"}{formatCurrency(Math.abs(totalProfitLoss).toString())}</span>
                  </div>
                </div>

                <div className="totals-row final flex justify-between bg-green-100 p-4 font-bold text-lg -mx-4 -mb-4 mt-4 border-t-2 border-black">
                  <span>Amount Payable / भुगतान योग्य राशि:</span>
                  <span className="text-xl">{formatCurrency(transaction.totalDueToFarmer)}</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 text-center text-sm text-gray-500">
              <p>Thank you for your business! / आपके व्यापार के लिए धन्यवाद!</p>
            </div>

            <div className="disclaimer border border-dashed border-gray-400 p-3 text-center text-sm text-gray-600 mt-6">
              <p>No need to sign/stamp the online generated receipt</p>
              <p className="hindi">ऑनलाइन जनरेट रसीद पर हस्ताक्षर/मुहर की आवश्यकता नहीं है</p>
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
