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
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  netWeight: string | null;
}

interface Transaction {
  id: number;
  transactionNumber: number;
  merchantId: number;
  partyName: string | null;
  vehicleNumber: string | null;
  advancePayment: string | null;
  totalBags: number;
  totalNetWeight: string | null;
  createdAt: string;
  items: TransactionItem[];
}

interface Merchant {
  id: number;
  name: string;
  contactNumber: string | null;
  address: string | null;
}

interface SalesReceiptDialogProps {
  transactionId: number | null;
  merchantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SalesReceiptDialog({ transactionId, merchantId, open, onOpenChange }: SalesReceiptDialogProps) {
  const { t } = useLanguage();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: transaction, isLoading: txnLoading } = useQuery<Transaction>({
    queryKey: ["/api/transactions", transactionId],
    enabled: !!transactionId && open,
  });

  const { data: merchant, isLoading: merchantLoading } = useQuery<Merchant>({
    queryKey: ["/api/merchants", merchantId],
    enabled: !!merchantId && open,
  });

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
          <title>Sales Receipt / बिक्री रसीद #${transaction?.transactionNumber}</title>
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
            .totals {
              margin-top: 20px;
              text-align: right;
            }
            .totals p {
              margin: 5px 0;
              font-size: 16px;
            }
            .totals .total {
              font-size: 18px;
              font-weight: bold;
            }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{t("Sales Receipt", "बिक्री रसीद")}</span>
            <Button onClick={handlePrint} size="sm" data-testid="button-print">
              <Printer className="h-4 w-4 mr-2" />
              {t("Print", "प्रिंट")}
            </Button>
          </DialogTitle>
          <DialogDescription>
            {t("Preview and print the sales receipt", "बिक्री रसीद का पूर्वावलोकन और प्रिंट करें")}
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
                Sales Receipt / बिक्री रसीद
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
                {transaction.partyName && (
                  <p><strong>Sent to / भेजा गया:</strong> {transaction.partyName}</p>
                )}
              </div>
            </div>

            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">S.No / क्र.सं.</th>
                  <th className="border p-2 text-left">Lot Details / लॉट विवरण</th>
                  <th className="border p-2 text-left">Potato Type / आलू का प्रकार</th>
                  <th className="border p-2 text-left">Size / आकार</th>
                  <th className="border p-2 text-right">Bags / बोरी</th>
                  <th className="border p-2 text-right">Weight (Kg) / वजन (किग्रा)</th>
                </tr>
              </thead>
              <tbody>
                {transaction.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="border p-2">{idx + 1}</td>
                    <td className="border p-2">S#{item.serialNumber} - {item.coldStoreName}</td>
                    <td className="border p-2">{item.potatoType || "-"}</td>
                    <td className="border p-2">{item.size || "Mixed / मिश्रित"}</td>
                    <td className="border p-2 text-right">{item.bagsMoved}</td>
                    <td className="border p-2 text-right">{parseFloat(item.netWeight || "0").toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="border p-2" colSpan={4}>Total / कुल</td>
                  <td className="border p-2 text-right">{transaction.totalBags}</td>
                  <td className="border p-2 text-right">{parseFloat(transaction.totalNetWeight || "0").toFixed(1)}</td>
                </tr>
              </tfoot>
            </table>

            {parseFloat(transaction.advancePayment || "0") > 0 && (
              <div className="border-t pt-4">
                <p className="text-right">
                  <strong>Advance Paid / अग्रिम भुगतान:</strong> ₹{parseFloat(transaction.advancePayment || "0").toFixed(2)}
                </p>
              </div>
            )}

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
