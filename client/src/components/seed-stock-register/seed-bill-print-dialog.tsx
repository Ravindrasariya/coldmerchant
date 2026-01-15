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
import { SeedStockEntryWithLots } from "@shared/schema";

interface SeedBillPrintDialogProps {
  entry: SeedStockEntryWithLots;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SeedBillPrintDialog({ entry, open, onOpenChange }: SeedBillPrintDialogProps) {
  const { user } = useAuth();

  const totalOriginalBags = entry.seedLots.reduce((sum, lot) => sum + lot.originalBags, 0);
  const totalRemainingBags = entry.seedLots.reduce((sum, lot) => sum + lot.remainingBags, 0);

  const calculateGrandTotal = () => {
    let total = 0;
    entry.seedLots.forEach(lot => {
      const pricePerBag = lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0;
      total += lot.originalBags * pricePerBag;
    });
    return total;
  };

  const calculateColdStoreTotal = () => {
    let total = 0;
    entry.seedLots.forEach(lot => {
      const chargesPerBag = lot.coldStoreChargesPerBag ? parseFloat(lot.coldStoreChargesPerBag) : 0;
      total += lot.originalBags * chargesPerBag;
    });
    return total;
  };

  const grandTotal = calculateGrandTotal();
  const coldStoreTotal = calculateColdStoreTotal();

  const getSizeBilingual = (size: string) => {
    const sizeMap: Record<string, string> = {
      "Large": "Large / बड़ा",
      "Medium": "Medium / मध्यम",
      "Small": "Small / छोटा",
    };
    return sizeMap[size] || size;
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const lotsHtml = entry.seedLots.map((lot, index) => {
      const pricePerBag = lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0;
      const coldCharges = lot.coldStoreChargesPerBag ? parseFloat(lot.coldStoreChargesPerBag) : 0;
      const lotTotal = lot.originalBags * pricePerBag;
      const lotColdTotal = lot.originalBags * coldCharges;

      return `
        <div style="border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <p style="font-weight: 600; font-size: 14px; margin: 0 0 4px 0;">Lot ${index + 1} - ${lot.coldStoreName}</p>
              <p style="font-size: 11px; color: #666; margin: 0;">
                ${lot.potatoType} • ${lot.bagType} • ${getSizeBilingual(lot.size)}
              </p>
            </div>
            <div style="text-align: right;">
              <p style="font-family: monospace; font-size: 13px; margin: 0;"><span style="font-weight: 600;">${lot.remainingBags}</span>/${lot.originalBags} bags / बोरी</p>
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 8px 12px; text-align: left; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Details / विवरण</th>
                <th style="padding: 8px 12px; text-align: right; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Value / मूल्य</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">Bags / बोरी</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${lot.originalBags}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">Price per Bag / मूल्य प्रति बोरी</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">₹${pricePerBag.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">Lot Total / लॉट कुल</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: 600;">₹${lotTotal.toFixed(2)}</td>
              </tr>
              ${coldCharges > 0 ? `
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">Cold Store Charges/Bag / कोल्ड शुल्क प्रति बोरी</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">₹${coldCharges.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">Cold Store Total / कोल्ड स्टोर कुल</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">₹${lotColdTotal.toFixed(2)}</td>
              </tr>
              ` : ''}
            </tbody>
          </table>
          ${lot.remarks ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
              <p style="font-size: 11px; color: #666; margin: 0;">Remarks / टिप्पणी: <span style="color: #000;">${lot.remarks}</span></p>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

    const address = [entry.address, entry.district, entry.state].filter(Boolean).join(", ");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Seed Purchase Receipt #${entry.serialNumber}</title>
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
            <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px;">
              <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">${user?.merchantName || "Merchant"}</h1>
              <p style="font-size: 14px; color: #666;">Seed Purchase Receipt / बीज खरीद रसीद</p>
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
              <div>
                <p style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px;">Receipt No. / रसीद नं.</p>
                <p style="font-size: 18px; font-weight: 700; font-family: monospace;">#${entry.serialNumber}</p>
              </div>
              <div style="text-align: right;">
                <p style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px;">Date / तिथि</p>
                <p style="font-size: 14px; font-weight: 600;">${new Date(entry.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>

            <div style="background: #f8f8f8; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
              <p style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 8px;">Supplier Details / आपूर्तिकर्ता विवरण</p>
              <p style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${entry.supplierName}</p>
              ${entry.supplierContact ? `<p style="font-size: 12px; color: #666; margin-bottom: 4px;">Phone / फ़ोन: ${entry.supplierContact}</p>` : ""}
              <p style="font-size: 12px; color: #666;">${address}</p>
            </div>

            <div style="margin-bottom: 24px;">
              <p style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 12px;">Seed Lots / बीज लॉट</p>
              ${lotsHtml}
            </div>

            <div style="background: #1a1a1a; color: white; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px;">Total Bags / कुल बोरी</span>
                <span style="font-size: 14px; font-weight: 600; font-family: monospace;">${totalRemainingBags}/${totalOriginalBags}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px;">Seed Value / बीज मूल्य</span>
                <span style="font-size: 14px; font-weight: 600; font-family: monospace;">₹${grandTotal.toFixed(2)}</span>
              </div>
              ${coldStoreTotal > 0 ? `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px;">Cold Store Charges / कोल्ड स्टोर शुल्क</span>
                <span style="font-size: 14px; font-weight: 600; font-family: monospace;">₹${coldStoreTotal.toFixed(2)}</span>
              </div>
              ` : ''}
              <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 8px; margin-top: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 14px; font-weight: 600;">Grand Total / कुल योग</span>
                  <span style="font-size: 18px; font-weight: 700; font-family: monospace;">₹${(grandTotal + coldStoreTotal).toFixed(2)}</span>
                </div>
              </div>
            </div>

            ${entry.remarks ? `
            <div style="margin-bottom: 24px; padding: 12px; background: #fffbeb; border-radius: 6px; border: 1px solid #fcd34d;">
              <p style="font-size: 11px; color: #666; margin-bottom: 4px;">Remarks / टिप्पणी</p>
              <p style="font-size: 12px;">${entry.remarks}</p>
            </div>
            ` : ""}

            <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd;">
              <p style="font-size: 10px; color: #999;">This is a computer generated receipt / यह कंप्यूटर जनित रसीद है</p>
            </div>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Seed Purchase Receipt / बीज खरीद रसीद #{entry.serialNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/30 p-4 rounded-lg">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-sm text-muted-foreground">Supplier / आपूर्तिकर्ता</p>
                <p className="font-semibold text-lg">{entry.supplierName}</p>
                {entry.supplierContact && (
                  <p className="text-sm text-muted-foreground">{entry.supplierContact}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Date / तिथि</p>
                <p className="font-medium">
                  {new Date(entry.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {[entry.address, entry.district, entry.state].filter(Boolean).join(", ")}
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="font-medium">Seed Lots / बीज लॉट</p>
            {entry.seedLots.map((lot, index) => {
              const pricePerBag = lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0;
              const coldCharges = lot.coldStoreChargesPerBag ? parseFloat(lot.coldStoreChargesPerBag) : 0;
              const lotTotal = lot.originalBags * pricePerBag;

              return (
                <div key={lot.id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">Lot {index + 1} - {lot.coldStoreName}</p>
                      <p className="text-sm text-muted-foreground">{lot.potatoType} • {lot.bagType} • {lot.size}</p>
                    </div>
                    <p className="font-mono text-sm">
                      <span className="font-semibold">{lot.remainingBags}</span>/{lot.originalBags} bags
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Price/Bag:</span>{" "}
                      <span className="font-medium">₹{pricePerBag}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total:</span>{" "}
                      <span className="font-medium">₹{lotTotal.toLocaleString()}</span>
                    </div>
                    {coldCharges > 0 && (
                      <div>
                        <span className="text-muted-foreground">Cold Charges:</span>{" "}
                        <span className="font-medium">₹{coldCharges}/bag</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="bg-primary/5 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>Total Bags / कुल बोरी</span>
              <span className="font-mono font-medium">{totalRemainingBags}/{totalOriginalBags}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Seed Value / बीज मूल्य</span>
              <span className="font-mono font-medium">₹{grandTotal.toLocaleString()}</span>
            </div>
            {coldStoreTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span>Cold Store Charges / कोल्ड शुल्क</span>
                <span className="font-mono font-medium">₹{coldStoreTotal.toLocaleString()}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Grand Total / कुल योग</span>
              <span className="font-mono">₹{(grandTotal + coldStoreTotal).toLocaleString()}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-seed-print-close">
              Close / बंद करें
            </Button>
            <Button onClick={handlePrint} data-testid="button-seed-print-confirm">
              <Printer className="h-4 w-4 mr-2" />
              Print / प्रिंट
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
