import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Printer, Share2, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SeedStockEntryWithLots } from "@shared/schema";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { printHtmlDocument } from "@/lib/print-receipt";
import { useToast } from "@/hooks/use-toast";

interface SeedBillPrintDialogProps {
  entry: SeedStockEntryWithLots;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoAction?: "print" | "share";
}

export function SeedBillPrintDialog({ entry, open, onOpenChange, autoAction }: SeedBillPrintDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const billRef = React.useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const autoActionDone = React.useRef(false);

  const [headerImageDataUri, setHeaderImageDataUri] = useState<string | null>(null);

  const { data: merchantData, isLoading: merchantLoading } = useQuery<{ receiptHeaderImage: string | null }>({
    queryKey: ["/api/merchants", user?.merchantId],
    enabled: !!user?.merchantId && open,
  });

  React.useEffect(() => {
    if (!merchantData?.receiptHeaderImage || !user?.merchantId) {
      setHeaderImageDataUri(null);
      return;
    }
    const fetchImage = async () => {
      try {
        const res = await fetch(`/api/merchants/${user.merchantId}/receipt-header`, { credentials: "include" });
        if (!res.ok) { setHeaderImageDataUri(null); return; }
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => setHeaderImageDataUri(reader.result as string);
        reader.readAsDataURL(blob);
      } catch {
        setHeaderImageDataUri(null);
      }
    };
    fetchImage();
  }, [merchantData?.receiptHeaderImage, user?.merchantId]);

  const handleShare = async () => {
    if (!billRef.current) return;
    setSharing(true);
    try {
      await shareReceiptAsPdf(billRef.current, `Seed-Purchase-Receipt-${entry.serialNumber}`);
    } catch (err: any) {
      console.error("Share/PDF error:", err);
      if (err?.name !== "AbortError") {
        toast({ title: "PDF generation failed", description: String(err?.message || err), variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  };

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

  const grandTotal = calculateGrandTotal();

  const getSizeBilingual = (size: string) => {
    const sizeMap: Record<string, string> = {
      "Large": "Large / बड़ा",
      "Medium": "Medium / मध्यम",
      "Small": "Small / छोटा",
    };
    return sizeMap[size] || size;
  };

  const handlePrint = () => {
    if (merchantLoading || (merchantData?.receiptHeaderImage && !headerImageDataUri)) return;

    const address = [entry.address, entry.district, entry.state].filter(Boolean).join(", ");

    const lotsHtml = entry.seedLots.map((lot, index) => {
      const pricePerBag = lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0;
      const lotTotal = lot.originalBags * pricePerBag;

      return `
        <div style="border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <span style="font-weight: 600; font-size: 13px;">Lot ${index + 1}</span>
              <span style="font-size: 11px; color: #666; margin-left: 8px;">${lot.potatoType} • ${lot.bagType} • ${getSizeBilingual(lot.size)}</span>
            </div>
            <span style="font-family: monospace; font-size: 12px;"><strong>${lot.remainingBags}</strong>/${lot.originalBags} bags</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span>₹${parseFloat(pricePerBag.toFixed(1))}/bag</span>
            <span style="font-weight: 600;">₹${lotTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
          </div>
          ${lot.remarks ? `<p style="font-size: 10px; color: #666; margin-top: 6px;">Remarks: ${lot.remarks}</p>` : ""}
        </div>
      `;
    }).join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Seed Purchase Receipt #${entry.serialNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              padding: 20px;
              font-size: 12px;
              color: #1a1a1a;
              line-height: 1.4;
            }
            @media print {
              body { padding: 10px; }
            }
          </style>
        </head>
        <body>
          <div style="max-width: 800px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 16px; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px;">
              ${headerImageDataUri
                ? `<img src="${headerImageDataUri}" alt="${user?.merchantName || 'Merchant'}" style="width: 100%; margin: 0 auto 4px; display: block;" />`
                : `<h1 style="font-size: 18px; font-weight: 700; margin-bottom: 2px;">${user?.merchantName || "Merchant"}</h1>
              ${user?.merchantAddress ? `<p style="font-size: 11px; color: #444; margin-bottom: 2px;">${user.merchantAddress}</p>` : ""}
              ${user?.merchantContact ? `<p style="font-size: 11px; color: #666; margin-bottom: 4px;">Ph: ${user.merchantContact}</p>` : ""}`}
              <p style="font-size: 12px; color: #666;">Seed Purchase Receipt / बीज खरीद रसीद</p>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div>
                <span style="font-size: 10px; color: #666;">Receipt No.:</span>
                <span style="font-size: 16px; font-weight: 700; font-family: monospace; margin-left: 4px;">#${entry.serialNumber}</span>
              </div>
              <div>
                <span style="font-size: 10px; color: #666;">Date:</span>
                <span style="font-size: 12px; font-weight: 600; margin-left: 4px;">${new Date(entry.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>

            <div style="background: #f8f8f8; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <span style="font-weight: 600; font-size: 14px;">${entry.supplierName}</span>
                  ${entry.supplierContact ? `<span style="font-size: 11px; color: #666; margin-left: 12px;">${entry.supplierContact}</span>` : ""}
                </div>
              </div>
              ${address ? `<p style="font-size: 11px; color: #666; margin-top: 4px;">${address}</p>` : ""}
            </div>

            <div style="margin-bottom: 16px;">
              <p style="font-size: 10px; color: #666; text-transform: uppercase; margin-bottom: 8px;">Seed Lots / बीज लॉट</p>
              ${lotsHtml}
            </div>

            <div style="background: #1a1a1a; color: white; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 11px;">Total Bags / कुल बोरी</span>
                <span style="font-size: 13px; font-weight: 600; font-family: monospace;">${totalRemainingBags}/${totalOriginalBags}</span>
              </div>
              <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 6px; margin-top: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 13px; font-weight: 600;">Grand Total / कुल योग</span>
                  <span style="font-size: 16px; font-weight: 700; font-family: monospace;">₹${Math.round(grandTotal).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            ${entry.remarks ? `
            <div style="margin-bottom: 16px; padding: 10px; background: #fffbeb; border-radius: 6px; border: 1px solid #fcd34d;">
              <p style="font-size: 10px; color: #666; margin-bottom: 2px;">Remarks / टिप्पणी</p>
              <p style="font-size: 11px;">${entry.remarks}</p>
            </div>
            ` : ""}

            <div style="text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd;">
              <p style="font-size: 9px; color: #999;">This is a computer generated receipt / यह कंप्यूटर जनित रसीद है</p>
            </div>
          </div>
        </body>
      </html>
    `;

    printHtmlDocument(html);
  };

  const renderBillContent = () => (
    <>
      <div className="text-center mb-3 pb-2 border-b-2 border-black">
        {merchantData?.receiptHeaderImage ? (
          <img src={`/api/merchants/${user?.merchantId}/receipt-header`} alt={user?.merchantName || "Merchant"} className="w-full mx-auto mb-1" />
        ) : (
          <>
            {user?.merchantName && <h1 className="text-xl font-bold mb-0.5">{user.merchantName}</h1>}
            {user?.merchantAddress && <p className="text-xs text-gray-500">{user.merchantAddress}</p>}
            {user?.merchantContact && <p className="text-xs text-gray-500">Ph: {user.merchantContact}</p>}
          </>
        )}
        <p className="text-sm font-semibold mt-1">Seed Purchase Receipt / बीज खरीद रसीद</p>
      </div>
      <div className="bg-muted/30 p-3 rounded-lg">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="font-semibold">{entry.supplierName}</span>
            {entry.supplierContact && (
              <span className="text-sm text-muted-foreground">{entry.supplierContact}</span>
            )}
          </div>
          <span className="text-sm">
            {new Date(entry.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
        {(entry.address || entry.district || entry.state) && (
          <p className="text-sm text-muted-foreground mt-1">
            {[entry.address, entry.district, entry.state].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Seed Lots / बीज लॉट</p>
        {entry.seedLots.map((lot, index) => {
          const pricePerBag = lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0;
          const lotTotal = lot.originalBags * pricePerBag;
          return (
            <div key={lot.id} className="border rounded-lg p-2.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Lot {index + 1}</span>
                  <span className="text-xs text-muted-foreground">{lot.potatoType} • {lot.bagType} • {lot.size}</span>
                </div>
                <span className="font-mono text-sm">
                  <span className="font-semibold">{lot.remainingBags}</span>/{lot.originalBags}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm mt-1">
                <span className="text-muted-foreground">₹{pricePerBag}/bag</span>
                <span className="font-medium">₹{lotTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Separator />

      <div className="bg-primary/5 p-3 rounded-lg space-y-1.5">
        <div className="flex justify-between text-sm">
          <span>Total Bags / कुल बोरी</span>
          <span className="font-mono font-medium">{totalRemainingBags}/{totalOriginalBags}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>Grand Total / कुल योग</span>
          <span className="font-mono">₹{Math.round(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
        </div>
      </div>
    </>
  );

  const imageReady = !merchantLoading && (!merchantData?.receiptHeaderImage || !!headerImageDataUri);

  React.useEffect(() => {
    if (!open || !autoAction || autoActionDone.current) return;
    if (autoAction === "print") {
      if (!imageReady) return;
      autoActionDone.current = true;
      handlePrint();
      onOpenChange(false);
    } else if (autoAction === "share") {
      autoActionDone.current = true;
      const timer = setTimeout(async () => {
        if (!billRef.current) {
          onOpenChange(false);
          return;
        }
        await handleShare();
        onOpenChange(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open, autoAction, imageReady]);

  React.useEffect(() => {
    if (!open) {
      autoActionDone.current = false;
    }
  }, [open]);

  if (autoAction === "print") {
    return null;
  }

  const isAutoShare = autoAction === "share";

  return (
    <Dialog open={open} onOpenChange={isAutoShare ? undefined : onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined} style={isAutoShare ? { pointerEvents: "none" } : undefined}>
        {isAutoShare ? (
          <DialogTitle className="sr-only">Generating PDF</DialogTitle>
        ) : (
          <DialogHeader>
            <DialogTitle>Seed Purchase Receipt / बीज खरीद रसीद #{entry.serialNumber}</DialogTitle>
          </DialogHeader>
        )}

        <div className="overflow-x-auto -mx-4 px-4">
          <div ref={billRef} className="space-y-3 min-w-[600px]">
            {renderBillContent()}

            {!isAutoShare && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-seed-print-close">
                Close / बंद करें
              </Button>
              <Button onClick={handleShare} variant="outline" disabled={sharing} data-testid="button-seed-share">
                {sharing ? (
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : isMobile ? (
                  <Share2 className="h-4 w-4 mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {sharing ? "..." : isMobile ? "Share" : "PDF"}
              </Button>
              <Button onClick={handlePrint} data-testid="button-seed-print-confirm">
                <Printer className="h-4 w-4 mr-2" />
                Print / प्रिंट
              </Button>
            </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
