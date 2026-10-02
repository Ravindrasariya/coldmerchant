import { useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Share2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { printHtmlDocument } from "@/lib/print-receipt";
import { useToast } from "@/hooks/use-toast";
import { buildSeedSalesBill, type SeedBillTransaction, type SeedBillMerchant } from "@/lib/seed-sales-bill";

interface Merchant extends SeedBillMerchant {
  receiptHeaderImage: string | null;
}

interface SeedSalesReceiptDialogProps {
  transactionId: number | null;
  merchantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoAction?: "print" | "share";
}

export function SeedSalesReceiptDialog({ transactionId, merchantId, open, onOpenChange, autoAction }: SeedSalesReceiptDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const autoActionDone = useRef(false);

  const { data: transaction, isLoading: txnLoading, error: txnError } = useQuery<SeedBillTransaction>({
    queryKey: ["/api/seed-transactions", transactionId],
    enabled: !!transactionId && open,
  });
  const { data: merchant, isLoading: merchantLoading, error: merchantError } = useQuery<Merchant>({
    queryKey: ["/api/merchants", merchantId],
    enabled: !!merchantId && open,
  });
  const isLoading = txnLoading || merchantLoading;
  const bill = useMemo(() => transaction && merchant
    ? buildSeedSalesBill(transaction, merchant,
      merchant.receiptHeaderImage ? `/api/merchants/${merchantId}/receipt-header` : undefined)
    : null, [transaction, merchant, merchantId]);

  const handleShare = async () => {
    if (!printRef.current || !bill) return;
    setSharing(true);
    try {
      const outcome = await shareReceiptAsPdf(
        printRef.current, `Seed-Sales-Receipt-${transaction?.transactionNumber || ""}`, bill.html,
      );
      if (outcome.method === "download" && outcome.reason) {
        toast({ title: "Receipt downloaded", description: outcome.reason });
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "PDF generation failed", description: String(err?.message || err), variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  };

  const handlePrint = () => {
    // Automatic Print renders no preview/ref. Print the prepared document,
    // not copied preview markup; the helper waits for its header image.
    if (bill) printHtmlDocument(bill.html);
  };

  useEffect(() => {
    if (!open || !autoAction || autoActionDone.current || isLoading) return;
    if (!bill) {
      if (txnError || merchantError) {
        autoActionDone.current = true;
        toast({ title: "Receipt could not be loaded", description: "Please try again.", variant: "destructive" });
        onOpenChange(false);
      }
      return;
    }
    if (autoAction === "print") {
      autoActionDone.current = true;
      handlePrint();
      onOpenChange(false);
    } else {
      // Set the guard when the timer runs, not before: a query rerender or
      // StrictMode cleanup must not cancel the timer and suppress its retry.
      const timer = setTimeout(async () => {
        autoActionDone.current = true;
        try {
          await handleShare();
        } finally {
          onOpenChange(false);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open, autoAction, isLoading, bill, txnError, merchantError]);

  useEffect(() => {
    if (!open) autoActionDone.current = false;
  }, [open]);

  if (!open || autoAction === "print") return null;

  const receiptContent = bill ? (
    <div ref={printRef} data-testid="seed-sales-bill-preview" dangerouslySetInnerHTML={{ __html: bill.markup }} />
  ) : null;

  // Keep auto-share non-modal, as before; nothing can trap the user while
  // PDF generation or the native share sheet is running.
  if (autoAction === "share") {
    return (
      <div aria-hidden="true" style={{ position: "fixed", left: "-9999px", top: 0, pointerEvents: "none" }}>
        {receiptContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <DialogTitle>Seed Sales Receipt</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleShare} size="sm" variant="outline" disabled={sharing || isLoading || !bill} data-testid="button-share-seed-receipt">
                {sharing ? (
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                {sharing ? "..." : "Share"}
              </Button>
              <Button onClick={handlePrint} size="sm" disabled={isLoading || !bill} data-testid="button-print-seed-receipt">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
          <DialogDescription>Preview and print the seed sales receipt</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : receiptContent ? (
          <div className="overflow-x-auto -mx-4 px-4">{receiptContent}</div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            {t("Transaction not found", "लेनदेन नहीं मिला")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}