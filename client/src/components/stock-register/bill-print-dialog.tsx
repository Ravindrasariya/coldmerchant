import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Printer } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface StockEntryWithLots {
  id: number;
  serialNumber: number;
  purchaseDate: string;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  paymentStatus: string;
  remarks: string | null;
  lots: Array<{
    id: number;
    coldStoreName: string;
    originalBags: number;
    remainingBags: number;
    potatoType: string;
    bagType: string;
    quality: string;
    cutType: string;
    size: string | null;
    pricePerKg: string | null;
    remarks: string | null;
    bagBreakdowns: Array<{
      id: number;
      size: string;
      numberOfBags: number;
      weight: string | null;
      pricePerKg: string | null;
      totalAmount: string | null;
    }>;
  }>;
}

interface BillPrintDialogProps {
  entry: StockEntryWithLots;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillPrintDialog({ entry, open, onOpenChange }: BillPrintDialogProps) {
  const { user } = useAuth();

  const totalOriginalBags = entry.lots.reduce((sum, lot) => sum + lot.originalBags, 0);
  const totalRemainingBags = entry.lots.reduce((sum, lot) => sum + lot.remainingBags, 0);

  const calculateGrandTotal = () => {
    let total = 0;
    entry.lots.forEach(lot => {
      lot.bagBreakdowns.forEach(bd => {
        if (bd.totalAmount) {
          total += parseFloat(bd.totalAmount);
        } else if (bd.weight && bd.pricePerKg) {
          total += parseFloat(bd.weight) * parseFloat(bd.pricePerKg);
        }
      });
    });
    return total;
  };

  const grandTotal = calculateGrandTotal();

  const getSizeBilingual = (size: string) => {
    const sizeMap: Record<string, string> = {
      "Large": "Large / बड़ा",
      "Medium": "Medium / मध्यम",
      "Small": "Small / छोटा",
      "Wastage": "Wastage / कचरा",
    };
    return sizeMap[size] || size;
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const lotsHtml = entry.lots.map((lot) => {
      let breakdownHtml = "";
      
      if (lot.cutType === "gate_cut" && lot.size) {
        breakdownHtml = `
          <div style="background: #f5f5f5; padding: 12px; border-radius: 4px; margin-top: 12px;">
            <p style="margin: 0;"><span style="color: #666;">Size / आकार:</span> ${getSizeBilingual(lot.size)}</p>
            ${lot.pricePerKg ? `<p style="margin: 4px 0 0 0;"><span style="color: #666;">Price/kg / मूल्य प्रति किलो:</span> ₹${parseFloat(lot.pricePerKg).toFixed(2)}</p>` : ""}
          </div>
        `;
      }
      
      if (lot.cutType === "bilty_cut" && lot.bagBreakdowns.length > 0) {
        const rows = lot.bagBreakdowns.map((bd) => {
          const weight = bd.weight ? parseFloat(bd.weight) : 0;
          const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
          const amount = bd.totalAmount ? parseFloat(bd.totalAmount) : weight * price;
          return `
            <tr>
              <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">${getSizeBilingual(bd.size)}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${bd.numberOfBags}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${weight > 0 ? weight.toFixed(2) : "—"}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${price > 0 ? `₹${price.toFixed(2)}` : "—"}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: 600;">${amount > 0 ? `₹${amount.toFixed(2)}` : "—"}</td>
            </tr>
          `;
        }).join("");
        
        breakdownHtml = `
          <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 8px 12px; text-align: left; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Size / आकार</th>
                <th style="padding: 8px 12px; text-align: right; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;"># Bags / बोरी</th>
                <th style="padding: 8px 12px; text-align: right; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Weight (kg) / वजन</th>
                <th style="padding: 8px 12px; text-align: right; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Price/kg / मूल्य</th>
                <th style="padding: 8px 12px; text-align: right; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Amount / राशि</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `;
      }

      const lotRemarksHtml = lot.remarks ? `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #666; margin: 0;">Remarks / टिप्पणी: <span style="color: #000;">${lot.remarks}</span></p>
        </div>
      ` : "";

      return `
        <div style="border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <p style="font-weight: 600; font-size: 14px; margin: 0 0 4px 0;">${lot.coldStoreName}</p>
              <p style="font-size: 11px; color: #666; margin: 0;">
                ${lot.potatoType} • ${lot.bagType} • ${lot.cutType === "gate_cut" ? "Gate Cut / गेट कट" : "Bilty Cut / बिल्टी कट"}
              </p>
            </div>
            <div style="text-align: right;">
              <p style="font-family: monospace; font-size: 13px; margin: 0;"><span style="font-weight: 600;">${lot.remainingBags}</span>/${lot.originalBags} bags / बोरी</p>
            </div>
          </div>
          ${breakdownHtml}
          ${lotRemarksHtml}
        </div>
      `;
    }).join("");

    const address = [entry.village, entry.tehsil, entry.district, entry.state].filter(Boolean).join(", ");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt #${entry.serialNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              padding: 24px;
              font-size: 12px;
              color: #1a1a1a;
              line-height: 1.5;
            }
            @media print {
              body { padding: 12px; }
            }
          </style>
        </head>
        <body>
          <div style="max-width: 800px; margin: 0 auto;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1a1a1a;">
              <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 8px;">${user?.merchantName || "Merchant"}</h1>
              <p style="font-size: 16px; font-weight: 600; color: #333;">Purchase Receipt / खरीद रसीद</p>
            </div>

            <!-- Bill & Farmer Details -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
              <div style="flex: 1;">
                <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.05em;">Bill Details / बिल विवरण</h3>
                <p style="margin: 0 0 4px 0;"><span style="color: #666;">Bill No / बिल नंबर:</span> <span style="font-family: monospace; font-weight: 600;">#${entry.serialNumber}</span></p>
                <p style="margin: 0 0 4px 0;"><span style="color: #666;">Date / दिनांक:</span> <span style="font-weight: 500;">${new Date(entry.purchaseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</span></p>
                <p style="margin: 0;"><span style="color: #666;">Status / स्थिति:</span> <span style="font-weight: 500; color: ${entry.paymentStatus === "paid" ? "#15803d" : "#c2410c"};">${entry.paymentStatus === "paid" ? "Paid / भुगतान हुआ" : "Due / बाकी"}</span></p>
              </div>
              <div style="flex: 1; text-align: right;">
                <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.05em;">Farmer Details / किसान विवरण</h3>
                <p style="font-weight: 600; margin: 0 0 4px 0;">${entry.farmerName}</p>
                ${entry.farmerContact ? `<p style="color: #666; margin: 0 0 4px 0;">${entry.farmerContact}</p>` : ""}
                <p style="color: #666; margin: 0;">${address}</p>
              </div>
            </div>

            <!-- Separator -->
            <div style="height: 1px; background: #ddd; margin: 24px 0;"></div>

            <!-- Lot Details -->
            <div>
              <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 16px; letter-spacing: 0.05em;">Lot Details / लॉट विवरण</h3>
              ${lotsHtml}
            </div>

            <!-- Totals -->
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <p style="margin: 0;"><span style="color: #666;">Total Bags / कुल बोरी:</span> <span style="font-family: monospace; font-weight: 600;">${totalRemainingBags}/${totalOriginalBags}</span></p>
              </div>
              ${grandTotal > 0 ? `
                <div style="text-align: right;">
                  <p style="font-size: 10px; text-transform: uppercase; color: #666; margin: 0 0 4px 0;">Grand Total / कुल राशि</p>
                  <p style="font-size: 24px; font-weight: 700; font-family: monospace; margin: 0;">₹${grandTotal.toFixed(2)}</p>
                </div>
              ` : ""}
            </div>

            ${entry.remarks ? `
              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd;">
                <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.05em;">Remarks / टिप्पणी</h3>
                <p style="margin: 0;">${entry.remarks}</p>
              </div>
            ` : ""}

            <!-- Footer -->
            <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center;">
              <p style="font-size: 11px; color: #666; margin: 0 0 12px 0;">Thank you for your business! / व्यापार के लिए धन्यवाद!</p>
              <p style="font-size: 11px; color: #888; font-style: italic; margin: 0 0 4px 0;">
                This receipt is generated online and does not require any company stamp.
              </p>
              <p style="font-size: 11px; color: #888; font-style: italic; margin: 0;">
                यह रसीद ऑनलाइन जनरेट की गई है और इसे किसी कंपनी की मुहर की आवश्यकता नहीं है।
              </p>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Bill Preview / बिल पूर्वावलोकन</DialogTitle>
            <Button onClick={handlePrint} data-testid="button-print-bill">
              <Printer className="h-4 w-4 mr-2" />
              Print Bill / प्रिंट करें
            </Button>
          </div>
        </DialogHeader>

        <div className="bg-white p-6 rounded-lg text-black" data-testid="bill-preview">
          <div className="bill-container">
            <div className="text-center mb-6 pb-4 border-b-2 border-black">
              {user?.merchantName && (
                <h1 className="text-3xl font-bold mb-2">{user.merchantName}</h1>
              )}
              <p className="text-lg font-semibold">Purchase Receipt / खरीद रसीद</p>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-6">
              <div>
                <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide mb-2">Bill Details / बिल विवरण</h3>
                <div className="space-y-1 text-sm">
                  <p><span className="text-gray-600">Bill No / बिल नंबर:</span> <span className="font-mono font-semibold">#{entry.serialNumber}</span></p>
                  <p><span className="text-gray-600">Date / दिनांक:</span> <span className="font-medium">{new Date(entry.purchaseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</span></p>
                  <p><span className="text-gray-600">Status / स्थिति:</span> <span className={`font-medium ${entry.paymentStatus === "paid" ? "text-green-700" : "text-orange-600"}`}>{entry.paymentStatus === "paid" ? "Paid / भुगतान हुआ" : "Due / बाकी"}</span></p>
                </div>
              </div>

              <div>
                <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide mb-2">Farmer Details / किसान विवरण</h3>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">{entry.farmerName}</p>
                  {entry.farmerContact && <p className="text-gray-600">{entry.farmerContact}</p>}
                  <p className="text-gray-600">
                    {[entry.village, entry.tehsil, entry.district, entry.state]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            </div>

            <Separator className="my-6 bg-gray-300" />

            <div className="space-y-4">
              <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide">Lot Details / लॉट विवरण</h3>
              
              {entry.lots.map((lot) => (
                <div key={lot.id} className="border border-gray-300 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold">{lot.coldStoreName}</p>
                      <p className="text-xs text-gray-600">
                        {lot.potatoType} • {lot.bagType} • {lot.cutType === "gate_cut" ? "Gate Cut / गेट कट" : "Bilty Cut / बिल्टी कट"}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-mono"><span className="font-semibold">{lot.remainingBags}</span>/{lot.originalBags} bags / बोरी</p>
                    </div>
                  </div>

                  {lot.cutType === "gate_cut" && lot.size && (
                    <div className="text-sm bg-gray-100 rounded p-3">
                      <p><span className="text-gray-600">Size / आकार:</span> {getSizeBilingual(lot.size)}</p>
                      {lot.pricePerKg && <p><span className="text-gray-600">Price/kg / मूल्य प्रति किलो:</span> ₹{parseFloat(lot.pricePerKg).toFixed(2)}</p>}
                    </div>
                  )}

                  {lot.cutType === "bilty_cut" && lot.bagBreakdowns.length > 0 && (
                    <table className="w-full text-sm mt-3 border-collapse">
                      <thead>
                        <tr className="border-b bg-gray-100">
                          <th className="text-left py-2 px-3 text-xs uppercase text-gray-600 font-semibold">Size / आकार</th>
                          <th className="text-right py-2 px-3 text-xs uppercase text-gray-600 font-semibold"># Bags / बोरी</th>
                          <th className="text-right py-2 px-3 text-xs uppercase text-gray-600 font-semibold">Weight (kg) / वजन</th>
                          <th className="text-right py-2 px-3 text-xs uppercase text-gray-600 font-semibold">Price/kg / मूल्य</th>
                          <th className="text-right py-2 px-3 text-xs uppercase text-gray-600 font-semibold">Amount / राशि</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lot.bagBreakdowns.map((bd, bdIndex) => {
                          const weight = bd.weight ? parseFloat(bd.weight) : 0;
                          const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
                          const amount = bd.totalAmount ? parseFloat(bd.totalAmount) : weight * price;
                          return (
                            <tr key={bd.id || bdIndex} className="border-b border-gray-200">
                              <td className="py-2 px-3">{getSizeBilingual(bd.size)}</td>
                              <td className="py-2 px-3 text-right font-mono">{bd.numberOfBags}</td>
                              <td className="py-2 px-3 text-right font-mono">{weight > 0 ? weight.toFixed(2) : "—"}</td>
                              <td className="py-2 px-3 text-right font-mono">{price > 0 ? `₹${price.toFixed(2)}` : "—"}</td>
                              <td className="py-2 px-3 text-right font-mono font-medium">{amount > 0 ? `₹${amount.toFixed(2)}` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {lot.remarks && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600">Remarks / टिप्पणी: <span className="text-black">{lot.remarks}</span></p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-300">
              <div className="flex justify-between items-center">
                <div className="text-sm">
                  <p><span className="text-gray-600">Total Bags / कुल बोरी:</span> <span className="font-mono font-semibold">{totalRemainingBags}/{totalOriginalBags}</span></p>
                </div>
                {grandTotal > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-600 uppercase">Grand Total / कुल राशि</p>
                    <p className="text-2xl font-bold font-mono">₹{grandTotal.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </div>

            {entry.remarks && (
              <div className="mt-6 pt-4 border-t border-gray-300">
                <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide mb-2">Remarks / टिप्पणी</h3>
                <p className="text-sm">{entry.remarks}</p>
              </div>
            )}

            <div className="mt-8 pt-4 border-t border-gray-300 text-center">
              <p className="text-xs text-gray-600">Thank you for your business! / व्यापार के लिए धन्यवाद!</p>
              <p className="text-xs text-gray-500 mt-3 italic">
                This receipt is generated online and does not require any company stamp.
              </p>
              <p className="text-xs text-gray-500 italic">
                यह रसीद ऑनलाइन जनरेट की गई है और इसे किसी कंपनी की मुहर की आवश्यकता नहीं है।
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
