import React, { useRef, useState } from "react";
import { calculateInterestOnly } from "@/lib/interest-utils";
import { computeNetWeight } from "@shared/utils";
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
import { useQuery } from "@tanstack/react-query";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { printHtmlDocument } from "@/lib/print-receipt";
import { useToast } from "@/hooks/use-toast";
import krashuvedLogo from "@assets/Gemini_Generated_Image_lu75dlu75dlu75dl(1)_1777315339846.png";

interface StockEntryWithLots {
  id: number;
  serialNumber: number;
  crop?: string | null;
  purchaseDate: string;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  place?: string | null;
  aadhatDbId?: number | null;
  aadhatName?: string | null;
  paymentStatus: string;
  remarks: string | null;
  lots: Array<{
    id: number;
    place: string | null;
    coldStoreName: string | null;
    coldStoreLotNumber: string | null;
    crop?: string;
    originalBags: number;
    remainingBags: number;
    potatoType: string | null;
    harvestPotatoType: string | null;
    bagType: string;
    quality: string;
    cutType: string;
    size: string | null;
    marka?: string | null;
    pricePerKg: string | null;
    totalWeight: string | null;
    coldStoreChargesPerBag: string | null;
    hammaliGradingCharges: string | null;
    charges: Array<{ type: string; amount: number | string }> | null;
    mandiCommissionPercent: string | null;
    aadhatCommissionPercent: string | null;
    hammaliPerBag: string | null;
    mandiExtraCharges: string | null;
    coldStorageChargesPaid: string | null;
    earlyPayPercent: string | null;
    earlyPayAmount: string | null;
    adjustedAmount: string | null;
    adjustedAmountType: string | null;
    adjustedAmountRate: string | null;
    adjustedAmountEffectiveDate: string | null;
    adjustedAmountRemark: string | null;
    remarks: string | null;
    bagBreakdowns: Array<{
      id: number;
      size: string;
      numberOfBags: number;
      remainingBags: number | null;
      weight: string | null;
      pricePerKg: string | null;
      totalAmount: string | null;
      marka?: string | null;
    }>;
  }>;
}

interface BillPrintDialogProps {
  entry: StockEntryWithLots;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoAction?: "print" | "share";
}

export function BillPrintDialog({ entry, open, onOpenChange, autoAction }: BillPrintDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const billRef = React.useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const autoActionDone = React.useRef(false);

  const [headerImageDataUri, setHeaderImageDataUri] = useState<string | null>(null);
  const isMandi = !!(entry.aadhatDbId || entry.lots.some(l => l.place === "mandi"));

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

  const { data: aadhats, isLoading: aadhatLoading } = useQuery<Array<{ id: number; name: string; address: string; contact: string | null }>>({
    queryKey: ["/api/aadhats"],
    enabled: isMandi && !!entry.aadhatDbId,
  });
  const aadhatRecord = aadhats?.find(a => a.id === entry.aadhatDbId);

  const buildReceiptFilename = () => {
    const sanitizeForFilename = (s: string) =>
      s.replace(/[\/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    const formatDateForFilename = (iso: string) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d
        .toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .replace(/\s+/g, "-");
    };
    const cropRaw = (entry.crop || "potato").toLowerCase();
    const crop = cropRaw.charAt(0).toUpperCase() + cropRaw.slice(1);
    const farmer = sanitizeForFilename(entry.farmerName || "Farmer");
    const date = formatDateForFilename(entry.purchaseDate);
    return `${crop}_${farmer}_${date}_${entry.serialNumber}`;
  };

  const handleShare = async () => {
    if (!billRef.current) return;
    setSharing(true);
    try {
      await shareReceiptAsPdf(billRef.current, buildReceiptFilename());
    } catch (err: any) {
      console.error("Share/PDF error:", err);
      if (err?.name !== "AbortError") {
        toast({ title: "PDF generation failed", description: String(err?.message || err), variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  };

  const totalOriginalBags = entry.lots.reduce((sum, lot) => sum + lot.originalBags, 0);
  const totalRemainingBags = entry.lots.reduce((sum, lot) => sum + lot.remainingBags, 0);
  
  // For Gate Cut lots, the buyer takes the whole lot (incl. Wastage) at a
  // lump-sum rate, so the farmer must be paid for every bag — Wastage is NOT
  // excluded. For Bilty Cut lots, Wastage is filtered out (current behavior).
  const isPayableBreakdown = (bd: { size: string | null; numberOfBags: number }, cutType: string) => {
    if (!bd || bd.numberOfBags <= 0) return false;
    if (cutType === "gate_cut") return true;
    return bd.size !== "Wastage";
  };

  const SIZE_TIE_ORDER = ["Large", "Medium", "Small", "Wastage"];

  // Build a single consolidated row for a Gate Cut lot that has bag breakdowns.
  // Size = the size with the highest bag count (ties broken by the order above).
  // Rate = the rate of the dominant-size row. Amount = sum across all rows so it
  // still reconciles with the bill total even when rates differ.
  const buildGateCutConsolidatedRow = (lot: StockEntryWithLots["lots"][0]) => {
    let totalBags = 0;
    let totalNetWeight = 0;
    let totalGrossWeight = 0;
    let totalAmount = 0;
    const bySize: Record<string, number> = {};
    lot.bagBreakdowns.forEach(bd => {
      if (!bd.numberOfBags || bd.numberOfBags <= 0) return;
      const weight = bd.weight ? parseFloat(bd.weight) : 0;
      const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
      const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
      totalBags += bd.numberOfBags;
      totalNetWeight += netWeight;
      totalGrossWeight += weight;
      totalAmount += netWeight * price;
      bySize[bd.size || ""] = (bySize[bd.size || ""] || 0) + bd.numberOfBags;
    });
    let dominantSize = "Large";
    let maxBags = -1;
    for (const s of SIZE_TIE_ORDER) {
      const c = bySize[s] || 0;
      if (c > maxBags) { maxBags = c; dominantSize = s; }
    }
    const dominantBd = lot.bagBreakdowns.find(bd => bd.size === dominantSize && (bd.numberOfBags || 0) > 0);
    const dominantPrice = dominantBd?.pricePerKg ? parseFloat(dominantBd.pricePerKg) : 0;
    return { totalBags, totalNetWeight, totalGrossWeight, totalAmount, dominantSize, dominantPrice };
  };

  const totalBagsExcludingWastage = entry.lots.reduce((sum, lot) => {
    if (lot.bagBreakdowns.length > 0) {
      return sum + lot.bagBreakdowns
        .filter(bd => isPayableBreakdown(bd, lot.cutType))
        .reduce((bdSum, bd) => bdSum + (bd.numberOfBags || 0), 0);
    }
    return sum + lot.originalBags;
  }, 0);

  const calculateGrandTotal = () => {
    let total = 0;
    entry.lots.forEach(lot => {
      if (lot.bagBreakdowns.length > 0) {
        lot.bagBreakdowns.forEach(bd => {
          if (!isPayableBreakdown(bd, lot.cutType)) return;
          if (bd.weight && bd.pricePerKg) {
            const weight = parseFloat(bd.weight);
            const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
            total += netWeight * parseFloat(bd.pricePerKg);
          }
        });
      } else if (lot.totalWeight && lot.pricePerKg && lot.originalBags > 0) {
        const weight = parseFloat(lot.totalWeight);
        const netWeight = computeNetWeight(weight, lot.originalBags, lot.place);
        total += netWeight * parseFloat(lot.pricePerKg);
      }
    });
    return total;
  };

  const grandTotal = calculateGrandTotal();

  // Predicate: is this lot.charges entry shown as a farmer Deductions line on the bill?
  // - "Extra Charges to Buyer" is a buyer-side cost, never deducted from the farmer (any place).
  // - "Cold Charges" / "Ware House Charges" are merchant storage costs for Farm Gate / Mandi
  //   lots; only Cold Store lots show them as a farmer deduction.
  const isFarmerDeductionCharge = (c: { type?: string | null } | undefined, place: string | null | undefined) => {
    if (!c) return false;
    if (c.type === "Extra Charges to Buyer") return false;
    if ((place === "farm_gate" || place === "mandi") && (c.type === "Cold Charges" || c.type === "Ware House Charges")) return false;
    return true;
  };

  const calculateLotTotals = (lot: StockEntryWithLots["lots"][0]) => {
    let totalPayable: number;
    let totalBagsForMandi: number;

    if (lot.bagBreakdowns.length > 0) {
      totalPayable = lot.bagBreakdowns
        .filter(bd => isPayableBreakdown(bd, lot.cutType))
        .reduce((sum, bd) => {
          const weight = bd.weight ? parseFloat(bd.weight) : 0;
          const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
          const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
          return sum + (netWeight * price);
        }, 0);
      totalBagsForMandi = lot.bagBreakdowns
        .filter(bd => isPayableBreakdown(bd, lot.cutType))
        .reduce((sum, bd) => sum + (bd.numberOfBags || 0), 0);
    } else {
      const weight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
      const netWeight = computeNetWeight(weight, lot.originalBags, lot.place);
      const price = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
      totalPayable = netWeight * price;
      totalBagsForMandi = lot.originalBags;
    }
    
    const hammali = lot.hammaliGradingCharges ? parseFloat(lot.hammaliGradingCharges) : 0;
    const charges = lot.charges || [];
    const dynamicCharges = charges
      .filter(c => c.type !== "Early Pay/Bataw" && isFarmerDeductionCharge(c, lot.place))
      .reduce((sum, c) => {
        const amt = typeof c.amount === 'string' ? parseFloat(c.amount) : (c.amount || 0);
        return sum + amt;
      }, 0);

    const mandiPct = lot.mandiCommissionPercent ? parseFloat(lot.mandiCommissionPercent) : 0;
    const aadhatPct = lot.aadhatCommissionPercent ? parseFloat(lot.aadhatCommissionPercent) : 0;
    const hammaliRate = lot.hammaliPerBag ? parseFloat(lot.hammaliPerBag) : 0;
    const mandiExtra = lot.mandiExtraCharges ? parseFloat(lot.mandiExtraCharges) : 0;
    const mandiCommission = totalPayable * mandiPct / 100;
    const aadhatCommission = totalPayable * aadhatPct / 100;
    const mandiHammali = totalBagsForMandi * hammaliRate;
    const totalMandiCharges = mandiCommission + aadhatCommission + mandiHammali + mandiExtra;

    const earlyPayPct = lot.earlyPayPercent ? parseFloat(lot.earlyPayPercent) : 0;
    const earlyPayBase = totalPayable - (hammali + dynamicCharges);
    const earlyPayAmt = earlyPayPct > 0 && earlyPayBase > 0 ? earlyPayBase * earlyPayPct / 100 : 0;
    const totalDeductions = hammali + dynamicCharges + earlyPayAmt;
    
    const principal = lot.adjustedAmount ? parseFloat(lot.adjustedAmount) : 0;
    const rate = lot.adjustedAmountRate ? parseFloat(lot.adjustedAmountRate) : 0;
    const { interest, days: interestDays } = calculateInterestOnly(principal, rate, lot.adjustedAmountEffectiveDate || null);
    
    let adjustedValue = 0;
    if (interest > 0 && lot.adjustedAmountType) {
      adjustedValue = lot.adjustedAmountType === "credit" ? interest : -interest;
    }
    
    const netPayable = totalPayable - totalDeductions + totalMandiCharges + adjustedValue;
    
    return { totalPayable, hammali, charges, dynamicCharges, earlyPayPct, earlyPayAmt, mandiCommission, aadhatCommission, mandiHammali, mandiExtra, totalMandiCharges, totalDeductions, principal, rate, interestDays, interest, adjustedValue, netPayable };
  };

  const overallTotals = entry.lots.reduce((acc, lot) => {
    const lotTotals = calculateLotTotals(lot);
    return {
      totalPayable: acc.totalPayable + lotTotals.totalPayable,
      totalDeductions: acc.totalDeductions + lotTotals.totalDeductions,
      totalMandiCharges: acc.totalMandiCharges + lotTotals.totalMandiCharges,
      adjustedValue: acc.adjustedValue + lotTotals.adjustedValue,
      netPayable: acc.netPayable + lotTotals.netPayable,
    };
  }, { totalPayable: 0, totalDeductions: 0, totalMandiCharges: 0, adjustedValue: 0, netPayable: 0 });

  const aggregatedMandiCharges = (() => {
    let mandiCommission = 0, aadhatCommission = 0, mandiHammali = 0, mandiExtra = 0;
    let totalHammali = 0, totalAdjustedValue = 0, totalEarlyPayAmt = 0;
    const mandiPcts = new Set<number>();
    const aadhatPcts = new Set<number>();
    const chargesByType: Record<string, number> = {};

    entry.lots.forEach(lot => {
      const lotTotals = calculateLotTotals(lot);
      mandiCommission += lotTotals.mandiCommission;
      aadhatCommission += lotTotals.aadhatCommission;
      mandiHammali += lotTotals.mandiHammali;
      mandiExtra += lotTotals.mandiExtra;
      totalHammali += lotTotals.hammali;
      totalAdjustedValue += lotTotals.adjustedValue;
      totalEarlyPayAmt += lotTotals.earlyPayAmt;

      const mandiPct = lot.mandiCommissionPercent ? parseFloat(lot.mandiCommissionPercent) : 0;
      const aadhatPct = lot.aadhatCommissionPercent ? parseFloat(lot.aadhatCommissionPercent) : 0;
      if (mandiPct > 0) mandiPcts.add(mandiPct);
      if (aadhatPct > 0) aadhatPcts.add(aadhatPct);

      const charges = lot.charges || [];
      charges
        .filter(c => c.type !== "Early Pay/Bataw" && isFarmerDeductionCharge(c, lot.place))
        .forEach(c => {
          const amt = typeof c.amount === 'string' ? parseFloat(c.amount) : (c.amount || 0);
          if (amt > 0) {
            chargesByType[c.type || "Charge"] = (chargesByType[c.type || "Charge"] || 0) + amt;
          }
        });
    });

    const mandiPctLabel = mandiPcts.size === 1 ? ` (${[...mandiPcts][0]}%)` : "";
    const aadhatPctLabel = aadhatPcts.size === 1 ? ` (${[...aadhatPcts][0]}%)` : "";

    return { mandiCommission, aadhatCommission, mandiHammali, mandiExtra, totalHammali, totalAdjustedValue, totalEarlyPayAmt, chargesByType, mandiPctLabel, aadhatPctLabel };
  })();

  const getLotMarkaValue = (lot: StockEntryWithLots["lots"][0]) => {
    const distinct = Array.from(new Set(
      [lot.marka, ...(lot.bagBreakdowns || []).map((bd) => bd.marka)]
        .map((m) => (m || "").trim())
        .filter((m) => m.length > 0)
    ));
    return distinct.join(", ");
  };

  const allTableRows = (() => {
    const rows: Array<{ crop: string; bags: number; grossWeight: number; netWeight: number; price: number; amount: number; size?: string; marka?: string }> = [];
    entry.lots.forEach(lot => {
      if (lot.bagBreakdowns.length > 0) {
        if (lot.cutType === "gate_cut") {
          const c = buildGateCutConsolidatedRow(lot);
          if (c.totalBags > 0) {
            rows.push({ crop: lot.crop || "potato", bags: c.totalBags, grossWeight: c.totalGrossWeight, netWeight: c.totalNetWeight, price: c.dominantPrice, amount: c.totalAmount, size: c.dominantSize, marka: getLotMarkaValue(lot) });
          }
          return;
        }
        lot.bagBreakdowns.forEach(bd => {
          if (!isPayableBreakdown(bd, lot.cutType)) return;
          const weight = bd.weight ? parseFloat(bd.weight) : 0;
          const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
          const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
          rows.push({ crop: lot.crop || "potato", bags: bd.numberOfBags, grossWeight: weight, netWeight, price, amount: netWeight * price, marka: (bd.marka || "").trim() || getLotMarkaValue(lot) });
        });
      } else if (lot.originalBags > 0) {
        const weight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
        const netWeight = computeNetWeight(weight, lot.originalBags, lot.place);
        const price = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
        rows.push({ crop: lot.crop || "potato", bags: lot.originalBags, grossWeight: weight, netWeight, price, amount: netWeight * price, marka: getLotMarkaValue(lot) });
      }
    });
    return rows;
  })();

  const getSizeBilingual = (size: string) => {
    const sizeMap: Record<string, string> = {
      "Large": "Large / बड़ा",
      "Medium": "Medium / मध्यम",
      "Small": "Small / छोटा",
      "Wastage": "Wastage / कचरा",
    };
    return sizeMap[size] || size;
  };

  const getCropBilingual = (crop?: string) => {
    const cropMap: Record<string, string> = {
      "potato": "Potato / आलू",
      "garlic": "Garlic / लहसुन",
      "onion": "Onion / प्याज",
    };
    return cropMap[crop || "potato"] || crop || "Potato / आलू";
  };

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const formatMarkaSuffix = (val?: string | null) => {
    const m = (val || "").trim();
    return m ? ` <span style="color:#666; white-space:nowrap;">(Marka -${escapeHtml(m)})</span>` : "";
  };

  const getPlaceBilingual = (lot: StockEntryWithLots["lots"][0]) => {
    if (lot.place === "farm_gate") return "Farm Gate / फार्म गेट";
    if (lot.place === "mandi") return "Mandi / मंडी";
    return lot.coldStoreName || "Cold Store";
  };

  const handlePrint = () => {
    if (isMandi && entry.aadhatDbId && aadhatLoading) return;
    if (merchantLoading || (merchantData?.receiptHeaderImage && !headerImageDataUri)) return;

    const lotsHtml = entry.lots.map((lot) => {
      let breakdownHtml = "";
      
      if (lot.bagBreakdowns.length > 0) {
        const renderRow = (cropLabel: string, bags: number, netWeight: number, price: number, amount: number) => `
            <tr>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd;">${cropLabel}</td>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${bags}</td>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${netWeight > 0 ? netWeight.toFixed(2) : "—"}</td>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${price > 0 ? `₹${parseFloat((Math.trunc(price * 100) / 100).toFixed(2))}` : "—"}</td>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: 600;">${amount > 0 ? `₹${parseFloat(amount.toFixed(1)).toLocaleString('en-IN')}` : "—"}</td>
            </tr>
          `;
        let rows = "";
        if (lot.cutType === "gate_cut") {
          const c = buildGateCutConsolidatedRow(lot);
          if (c.totalBags > 0) {
            const cropLabel = `${getCropBilingual(lot.crop)} <span style="color:#666;">(${getSizeBilingual(c.dominantSize)})</span>${formatMarkaSuffix(getLotMarkaValue(lot))}`;
            rows = renderRow(cropLabel, c.totalBags, c.totalNetWeight, c.dominantPrice, c.totalAmount);
          }
        } else {
          rows = lot.bagBreakdowns
            .filter(bd => isPayableBreakdown(bd, lot.cutType))
            .map((bd) => {
              const weight = bd.weight ? parseFloat(bd.weight) : 0;
              const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
              const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
              const amount = netWeight * price;
              return renderRow(`${getCropBilingual(lot.crop)}${formatMarkaSuffix((bd.marka || "").trim() || getLotMarkaValue(lot))}`, bd.numberOfBags, netWeight, price, amount);
            }).join("");
        }
        
        breakdownHtml = `
          <table style="width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 3px 8px; text-align: left; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Crop / फसल</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;"># Bags / बोरी</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">${lot.place !== "mandi" ? "Net Wt (kg) / शुद्ध वजन" : "Weight (kg) / वजन"}</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Price/kg / मूल्य</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Amount / राशि</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `;
      } else {
        const lotWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
        const lotNetWeight = computeNetWeight(lotWeight, lot.originalBags, lot.place);
        const lotPrice = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
        const lotAmount = lotNetWeight * lotPrice;
        breakdownHtml = `
          <table style="width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 3px 8px; text-align: left; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Crop / फसल</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;"># Bags / बोरी</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">${lot.place !== "mandi" ? "Net Wt (kg) / शुद्ध वजन" : "Weight (kg) / वजन"}</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Price/kg / मूल्य</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Amount / राशि</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 3px 8px; border-bottom: 1px solid #ddd;">${getCropBilingual(lot.crop)}${formatMarkaSuffix(getLotMarkaValue(lot))}</td>
                <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${lot.originalBags}</td>
                <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${lotNetWeight > 0 ? lotNetWeight.toFixed(2) : "—"}</td>
                <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${lotPrice > 0 ? `₹${parseFloat((Math.trunc(lotPrice * 100) / 100).toFixed(2))}` : "—"}</td>
                <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: 600;">${lotAmount > 0 ? `₹${parseFloat(lotAmount.toFixed(1)).toLocaleString('en-IN')}` : "—"}</td>
              </tr>
            </tbody>
          </table>
        `;
      }

      const lotRemarksHtml = lot.remarks ? `
        <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #666; margin: 0;">Remarks / टिप्पणी: <span style="color: #000;">${lot.remarks}</span></p>
        </div>
      ` : "";

      const lotTotals = calculateLotTotals(lot);
      const hasDeductions = lotTotals.totalDeductions > 0 || lotTotals.adjustedValue !== 0;
      const hasMandiCharges = lotTotals.totalMandiCharges > 0;
      
      const chargesHtml = lotTotals.charges.filter(c => {
        if (!isFarmerDeductionCharge(c, lot.place)) return false;
        const amt = typeof c.amount === 'string' ? parseFloat(c.amount) : (c.amount || 0);
        return amt > 0;
      }).map(c => {
        const amt = typeof c.amount === 'string' ? parseFloat(c.amount) : (c.amount || 0);
        return `<div><span style="color: #666;">${c.type || "Charge"}:</span></div><div style="text-align: right; font-family: monospace;">₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>`;
      }).join("");
      
      const adjustmentLabel = lotTotals.rate > 0 && lotTotals.interestDays > 0 
        ? `Adjustment / समायोजन (₹${lotTotals.principal.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} + ${lotTotals.rate}% × ${lotTotals.interestDays}d${lot.adjustedAmountRemark ? `, ${lot.adjustedAmountRemark}` : ""})` 
        : `Adjustment / समायोजन${lot.adjustedAmountRemark ? ` (${lot.adjustedAmountRemark})` : ""}`;
      
      const mandiChargesBlockHtml = hasMandiCharges ? `
        <div style="margin-top: 6px; padding: 8px; background: #eff6ff; border-radius: 4px; border-left: 3px solid #3b82f6;">
          <p style="font-size: 10px; text-transform: uppercase; color: #666; margin: 0 0 4px 0; font-weight: 600;">Mandi Charges / मंडी शुल्क</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
            ${lotTotals.mandiCommission > 0 ? `<div><span style="color: #666;">Mandi Commission / मंडी कमीशन:</span></div><div style="text-align: right; font-family: monospace;">₹${lotTotals.mandiCommission.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>` : ""}
            ${lotTotals.aadhatCommission > 0 ? `<div><span style="color: #666;">Aadhat Commission / आढ़त कमीशन:</span></div><div style="text-align: right; font-family: monospace;">₹${lotTotals.aadhatCommission.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>` : ""}
            ${lotTotals.mandiHammali > 0 ? `<div><span style="color: #666;">Hammali / हम्माली:</span></div><div style="text-align: right; font-family: monospace;">₹${lotTotals.mandiHammali.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>` : ""}
            ${lotTotals.mandiExtra > 0 ? `<div><span style="color: #666;">Extra Charges / अतिरिक्त शुल्क:</span></div><div style="text-align: right; font-family: monospace;">₹${lotTotals.mandiExtra.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>` : ""}
          </div>
        </div>
      ` : "";

      const deductionsHtml = hasDeductions ? `
        <div style="margin-top: 6px; padding: 8px; background: #fff7ed; border-radius: 4px; border-left: 3px solid #f97316;">
          <p style="font-size: 10px; text-transform: uppercase; color: #666; margin: 0 0 4px 0; font-weight: 600;">Deductions / कटौती</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
            ${lotTotals.hammali > 0 ? `<div><span style="color: #666;">Hammali/Grading / हम्माली:</span></div><div style="text-align: right; font-family: monospace;">₹${lotTotals.hammali.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>` : ""}
            ${chargesHtml}
            ${lotTotals.earlyPayAmt > 0 ? `<div><span style="color: #666;">Early Pay/Bataw / जल्दी भुगतान (${lotTotals.earlyPayPct}%):</span></div><div style="text-align: right; font-family: monospace;">₹${lotTotals.earlyPayAmt.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>` : ""}
            ${lotTotals.adjustedValue !== 0 ? `<div><span style="color: #666;">${adjustmentLabel}:</span></div><div style="text-align: right; font-family: monospace; color: ${lotTotals.adjustedValue > 0 ? '#15803d' : '#dc2626'};">${lotTotals.adjustedValue > 0 ? '+' : ''}₹${Math.abs(lotTotals.adjustedValue).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>` : ""}
          </div>
        </div>
      ` : "";
      
      return `
        <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 8px; page-break-inside: avoid;">
          ${breakdownHtml}
          ${mandiChargesBlockHtml}
          ${deductionsHtml}
          ${lotRemarksHtml}
        </div>
      `;
    }).join("");

    const farmerAddress = [entry.village, entry.tehsil, entry.district, entry.state].filter(Boolean).join(", ");
    const address = isMandi ? (aadhatRecord?.address || "") : farmerAddress;
    const detailsLabel = isMandi ? "Aadhat Details / आढ़तिया विवरण" : "Farmer Details / किसान विवरण";
    const detailsName = isMandi && entry.aadhatName ? entry.aadhatName : entry.farmerName;
    const detailsContact = isMandi ? (aadhatRecord?.contact || null) : entry.farmerContact;
    const summaryLabel = isMandi ? "Aadhat Payment Summary / आढ़तिया भुगतान सारांश" : "Farmer Payment Summary / किसान भुगतान सारांश";
    const netDueLabel = isMandi ? "Net Due to Aadhat / आढ़तिया को देय" : "Net Due to Farmer / किसान को देय";

    let mandiUnifiedHtml = "";
    if (isMandi) {
      const tableRowsHtml = allTableRows.map(r => `
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid #ddd;">${getCropBilingual(r.crop)}${formatMarkaSuffix(r.marka)}</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${r.bags}</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${r.grossWeight > 0 ? r.grossWeight.toFixed(2) : "—"}</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${r.netWeight > 0 ? r.netWeight.toFixed(2) : "—"}</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${r.price > 0 ? "₹" + parseFloat((Math.trunc(r.price * 100) / 100).toFixed(2)) : "—"}</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: 600;">${r.amount > 0 ? "₹" + parseFloat(r.amount.toFixed(1)).toLocaleString('en-IN') : "—"}</td>
        </tr>
      `).join("");

      let mandiChargesLines = "";
      if (aggregatedMandiCharges.mandiCommission > 0) {
        mandiChargesLines += '<div><span style="color: #666;">Mandi Commission' + aggregatedMandiCharges.mandiPctLabel + ' / मंडी कमीशन' + aggregatedMandiCharges.mandiPctLabel + ':</span></div><div style="text-align: right; font-family: monospace;">₹' + aggregatedMandiCharges.mandiCommission.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '</div>';
      }
      if (aggregatedMandiCharges.aadhatCommission > 0) {
        mandiChargesLines += '<div><span style="color: #666;">Aadhat Commission' + aggregatedMandiCharges.aadhatPctLabel + ' / आढ़त कमीशन' + aggregatedMandiCharges.aadhatPctLabel + ':</span></div><div style="text-align: right; font-family: monospace;">₹' + aggregatedMandiCharges.aadhatCommission.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '</div>';
      }
      if (aggregatedMandiCharges.mandiHammali > 0) {
        mandiChargesLines += '<div><span style="color: #666;">Hammali / हम्माली:</span></div><div style="text-align: right; font-family: monospace;">₹' + aggregatedMandiCharges.mandiHammali.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '</div>';
      }
      if (aggregatedMandiCharges.mandiExtra > 0) {
        mandiChargesLines += '<div><span style="color: #666;">Extra Charges / अतिरिक्त शुल्क:</span></div><div style="text-align: right; font-family: monospace;">₹' + aggregatedMandiCharges.mandiExtra.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '</div>';
      }
      if (aggregatedMandiCharges.totalHammali > 0) {
        mandiChargesLines += '<div><span style="color: #666;">Hammali/Grading / हम्माली:</span></div><div style="text-align: right; font-family: monospace;">₹' + aggregatedMandiCharges.totalHammali.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '</div>';
      }
      Object.entries(aggregatedMandiCharges.chargesByType).forEach(([type, amt]) => {
        if (amt > 0) {
          mandiChargesLines += '<div><span style="color: #666;">' + type + ':</span></div><div style="text-align: right; font-family: monospace;">₹' + amt.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '</div>';
        }
      });
      if (aggregatedMandiCharges.totalEarlyPayAmt > 0) {
        mandiChargesLines += '<div><span style="color: #666;">Early Pay/Bataw / जल्दी भुगतान:</span></div><div style="text-align: right; font-family: monospace;">₹' + aggregatedMandiCharges.totalEarlyPayAmt.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '</div>';
      }
      if (aggregatedMandiCharges.totalAdjustedValue !== 0) {
        const adjColor = aggregatedMandiCharges.totalAdjustedValue > 0 ? '#15803d' : '#dc2626';
        const adjSign = aggregatedMandiCharges.totalAdjustedValue > 0 ? '+' : '';
        mandiChargesLines += '<div><span style="color: #666;">Adjustment / समायोजन:</span></div><div style="text-align: right; font-family: monospace; color: ' + adjColor + ';">' + adjSign + '₹' + Math.abs(aggregatedMandiCharges.totalAdjustedValue).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '</div>';
      }

      const mandiChargesBlockHtmlMandi = mandiChargesLines ? `
        <div style="margin-top: 6px; padding: 8px; background: #eff6ff; border-radius: 4px; border-left: 3px solid #3b82f6;">
          <p style="font-size: 10px; text-transform: uppercase; color: #666; margin: 0 0 4px 0; font-weight: 600;">Charges & Deductions / शुल्क एवं कटौती</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
            ${mandiChargesLines}
          </div>
        </div>
      ` : "";

      mandiUnifiedHtml = `
        <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; page-break-inside: avoid;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 3px 8px; text-align: left; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Crop / फसल</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;"># Bags / बोरी</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Gross Wt / कुल वजन</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Net Wt / शुद्ध वजन</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Price/kg / मूल्य</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Amount / राशि</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
          ${mandiChargesBlockHtmlMandi}
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt #${entry.serialNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              padding: 16px;
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
            <div style="text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #1a1a1a;">
              ${headerImageDataUri
                ? `<img src="${headerImageDataUri}" alt="${user?.merchantName || 'Merchant'}" style="width: 100%; margin: 0 auto 4px; display: block;" />`
                : `<h1 style="font-size: 22px; font-weight: 700; margin-bottom: 2px;">${user?.merchantName || "Merchant"}</h1>
              ${user?.merchantAddress ? `<p style="font-size: 11px; color: #444; margin-bottom: 2px;">${user.merchantAddress}</p>` : ""}
              ${user?.merchantContact ? `<p style="font-size: 11px; color: #666; margin-bottom: 4px;">Ph: ${user.merchantContact}</p>` : ""}`}
              <p style="font-size: 13px; font-weight: 600; color: #333;">Purchase Receipt / खरीद रसीद</p>
            </div>

            <!-- Bill & Farmer Details -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <div style="flex: 1;">
                <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.05em;">Bill Details / बिल विवरण</h3>
                <p style="margin: 0 0 4px 0;"><span style="color: #666;">Bill No / बिल नंबर:</span> <span style="font-family: monospace; font-weight: 600;">#${entry.serialNumber}</span><span style="color: #666; margin-left: 32px;">Total Bags / कुल बोरी:</span> <span style="font-family: monospace; font-weight: 600;">${totalOriginalBags}</span></p>
                <p style="margin: 0 0 4px 0;"><span style="color: #666;">Date / दिनांक:</span> <span style="font-weight: 500;">${new Date(entry.purchaseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</span></p>
                <p style="margin: 0;"><span style="color: #666;">Place / स्थान:</span> <span style="font-weight: 500;">${entry.lots[0] ? getPlaceBilingual(entry.lots[0]) : "—"}</span></p>
              </div>
              <div style="flex: 1; text-align: right;">
                <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.05em;">${detailsLabel}</h3>
                <p style="font-weight: 600; margin: 0 0 4px 0;">${detailsName}</p>
                ${detailsContact ? `<p style="color: #666; margin: 0 0 4px 0;">${detailsContact}</p>` : ""}
                <p style="color: #666; margin: 0;">${address}</p>
              </div>
            </div>

            <!-- Separator -->
            <div style="height: 1px; background: #ddd; margin: 8px 0;"></div>

            <!-- Lot Details -->
            <div>
              <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.05em;">${isMandi ? "Details / विवरण" : "Lot Details / लॉट विवरण"}</h3>
              ${isMandi ? mandiUnifiedHtml : lotsHtml}
            </div>

            <!-- Totals Summary -->
            <div style="margin-top: 12px; padding: 10px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 8px; border: 1px solid #0ea5e9;">
              <h3 style="font-size: 10px; text-transform: uppercase; color: #0369a1; margin: 0 0 8px 0; font-weight: 700; letter-spacing: 0.05em;">${summaryLabel}</h3>
              <div style="display: grid; grid-template-columns: repeat(${isMandi ? (overallTotals.totalMandiCharges > 0 ? 4 : 3) : (overallTotals.totalMandiCharges > 0 ? 5 : 4)}, 1fr); gap: 8px; text-align: center;">
                <div>
                  <p style="font-size: 10px; color: #666; margin: 0 0 4px 0;">Total Bags / कुल बोरी</p>
                  <p style="font-family: monospace; font-weight: 600; font-size: 12px; margin: 0;">${totalBagsExcludingWastage}</p>
                </div>
                <div>
                  <p style="font-size: 10px; color: #666; margin: 0 0 4px 0;">Total Payable / कुल देय</p>
                  <p style="font-family: monospace; font-weight: 600; font-size: 12px; margin: 0; color: #15803d;">₹${overallTotals.totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
                </div>
                ${overallTotals.totalMandiCharges > 0 ? `<div>
                  <p style="font-size: 10px; color: #666; margin: 0 0 4px 0;">Mandi Charges / मंडी शुल्क</p>
                  <p style="font-family: monospace; font-weight: 600; font-size: 12px; margin: 0; color: #3b82f6;">₹${overallTotals.totalMandiCharges.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
                </div>` : ""}
                ${!isMandi ? `<div>
                  <p style="font-size: 10px; color: #666; margin: 0 0 4px 0;">Deductions / कटौती</p>
                  <p style="font-family: monospace; font-weight: 600; font-size: 12px; margin: 0; color: #ea580c;">₹${overallTotals.totalDeductions.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
                </div>` : ""}
                <div style="background: #0d9488; padding: 8px; border-radius: 6px; margin: -8px;">
                  <p style="font-size: 10px; color: #fff; margin: 0 0 4px 0; opacity: 0.9;">${netDueLabel}</p>
                  <p style="font-family: monospace; font-weight: 700; font-size: 15px; margin: 0; color: #fff;">₹${Math.round(overallTotals.netPayable).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </div>

            ${entry.remarks ? `
              <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #ddd;">
                <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.05em;">Remarks / टिप्पणी</h3>
                <p style="margin: 0;">${entry.remarks}</p>
              </div>
            ` : ""}

            <!-- Footer -->
            <div style="margin-top: 16px; padding-top: 8px; border-top: 1px solid #ddd; text-align: center;">
              <p style="font-size: 11px; color: #666; margin: 0;">Thank you for the opportunity! / इस अवसर के लिए धन्यवाद!</p>
              <div style="margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                <img src="${window.location.origin}${krashuvedLogo}" alt="KrashuVed" style="width: 32px; height: 32px; object-fit: contain;" />
                <span style="font-size: 24px; line-height: 1; font-weight: 600;"><span style="color: #166534;">कृषु</span><span style="color: #ea580c;">वेद</span></span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    printHtmlDocument(html);
  };

  const renderBillContent = () => (
    <div className="bill-container">
      <div className="text-center mb-3 pb-2 border-b-2 border-black">
        {merchantData?.receiptHeaderImage ? (
          <img src={`/api/merchants/${user?.merchantId}/receipt-header`} alt={user?.merchantName || "Merchant"} className="w-full mx-auto mb-1" />
        ) : (
          <>
            {user?.merchantName && (
              <h1 className="text-2xl font-bold mb-1">{user.merchantName}</h1>
            )}
            {user?.merchantAddress && (
              <p className="text-xs text-gray-500 mb-0.5">{user.merchantAddress}</p>
            )}
            {user?.merchantContact && (
              <p className="text-xs text-gray-500 mb-1">Ph: {user.merchantContact}</p>
            )}
          </>
        )}
        <p className="text-lg font-semibold">Purchase Receipt / खरीद रसीद</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide mb-2">Bill Details / बिल विवरण</h3>
          <div className="space-y-1 text-sm">
            <p><span className="text-gray-600">Bill No / बिल नंबर:</span> <span className="font-mono font-semibold">#{entry.serialNumber}</span><span className="text-gray-600 ml-8">Total Bags / कुल बोरी:</span> <span className="font-mono font-semibold">{totalOriginalBags}</span></p>
            <p><span className="text-gray-600">Date / दिनांक:</span> <span className="font-medium">{new Date(entry.purchaseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</span></p>
            <p><span className="text-gray-600">Place / स्थान:</span> <span className="font-medium">{entry.lots[0] ? getPlaceBilingual(entry.lots[0]) : "—"}</span></p>
          </div>
        </div>
        <div>
          <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide mb-2">{isMandi ? "Aadhat Details / आढ़तिया विवरण" : "Farmer Details / किसान विवरण"}</h3>
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{isMandi && entry.aadhatName ? entry.aadhatName : entry.farmerName}</p>
            {isMandi && aadhatRecord?.contact && <p className="text-gray-600">{aadhatRecord.contact}</p>}
            {!isMandi && entry.farmerContact && <p className="text-gray-600">{entry.farmerContact}</p>}
            <p className="text-gray-600">
              {isMandi ? (aadhatRecord?.address || "") : [entry.village, entry.tehsil, entry.district, entry.state].filter(Boolean).join(", ")}
            </p>
          </div>
        </div>
      </div>

      <Separator className="my-3 bg-gray-300" />

      <div className="space-y-2">
        <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide">{isMandi ? "Details / विवरण" : "Lot Details / लॉट विवरण"}</h3>
        {isMandi ? (
          <div className="border border-gray-300 rounded-lg p-3">
            <table className="w-full text-sm mt-1 border-collapse">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Crop / फसल</th>
                  <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold"># Bags / बोरी</th>
                  <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Gross Wt / कुल वजन</th>
                  <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Net Wt / शुद्ध वजन</th>
                  <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Price/kg / मूल्य</th>
                  <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Amount / राशि</th>
                </tr>
              </thead>
              <tbody>
                {allTableRows.map((r, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="py-1 px-2">{getCropBilingual(r.crop)}</td>
                    <td className="py-1 px-2 text-right font-mono">{r.bags}</td>
                    <td className="py-1 px-2 text-right font-mono">{r.grossWeight > 0 ? r.grossWeight.toFixed(2) : "—"}</td>
                    <td className="py-1 px-2 text-right font-mono">{r.netWeight > 0 ? r.netWeight.toFixed(2) : "—"}</td>
                    <td className="py-1 px-2 text-right font-mono">{r.price > 0 ? `₹${parseFloat((Math.trunc(r.price * 100) / 100).toFixed(2))}` : "—"}</td>
                    <td className="py-1 px-2 text-right font-mono font-medium">{r.amount > 0 ? `₹${parseFloat(r.amount.toFixed(1)).toLocaleString('en-IN')}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(overallTotals.totalMandiCharges > 0 || aggregatedMandiCharges.totalHammali > 0 || Object.keys(aggregatedMandiCharges.chargesByType).length > 0 || aggregatedMandiCharges.totalAdjustedValue !== 0) && (
              <div className="mt-2 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                <p className="text-xs uppercase text-gray-600 font-semibold mb-1">Charges & Deductions / शुल्क एवं कटौती</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {aggregatedMandiCharges.mandiCommission > 0 && (
                    <>
                      <span className="text-gray-600">Mandi Commission{aggregatedMandiCharges.mandiPctLabel} / मंडी कमीशन{aggregatedMandiCharges.mandiPctLabel}:</span>
                      <span className="text-right font-mono">₹{aggregatedMandiCharges.mandiCommission.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                    </>
                  )}
                  {aggregatedMandiCharges.aadhatCommission > 0 && (
                    <>
                      <span className="text-gray-600">Aadhat Commission{aggregatedMandiCharges.aadhatPctLabel} / आढ़त कमीशन{aggregatedMandiCharges.aadhatPctLabel}:</span>
                      <span className="text-right font-mono">₹{aggregatedMandiCharges.aadhatCommission.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                    </>
                  )}
                  {aggregatedMandiCharges.mandiHammali > 0 && (
                    <>
                      <span className="text-gray-600">Hammali / हम्माली:</span>
                      <span className="text-right font-mono">₹{aggregatedMandiCharges.mandiHammali.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                    </>
                  )}
                  {aggregatedMandiCharges.mandiExtra > 0 && (
                    <>
                      <span className="text-gray-600">Extra Charges / अतिरिक्त शुल्क:</span>
                      <span className="text-right font-mono">₹{aggregatedMandiCharges.mandiExtra.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                    </>
                  )}
                  {aggregatedMandiCharges.totalHammali > 0 && (
                    <>
                      <span className="text-gray-600">Hammali/Grading / हम्माली:</span>
                      <span className="text-right font-mono">₹{aggregatedMandiCharges.totalHammali.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                    </>
                  )}
                  {Object.entries(aggregatedMandiCharges.chargesByType).map(([type, amt]) => (
                    amt > 0 ? (
                      <React.Fragment key={type}>
                        <span className="text-gray-600">{type}:</span>
                        <span className="text-right font-mono">₹{amt.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                      </React.Fragment>
                    ) : null
                  ))}
                  {aggregatedMandiCharges.totalEarlyPayAmt > 0 && (
                    <>
                      <span className="text-gray-600">Early Pay/Bataw / जल्दी भुगतान:</span>
                      <span className="text-right font-mono">₹{aggregatedMandiCharges.totalEarlyPayAmt.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                    </>
                  )}
                  {aggregatedMandiCharges.totalAdjustedValue !== 0 && (
                    <>
                      <span className="text-gray-600">Adjustment / समायोजन:</span>
                      <span className={`text-right font-mono ${aggregatedMandiCharges.totalAdjustedValue > 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {aggregatedMandiCharges.totalAdjustedValue > 0 ? '+' : ''}₹{Math.abs(aggregatedMandiCharges.totalAdjustedValue).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          entry.lots.map((lot) => (
            <div key={lot.id} className="border border-gray-300 rounded-lg p-3">
              {lot.bagBreakdowns.length > 0 ? (
                <table className="w-full text-sm mt-1 border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-100">
                      <th className="text-left py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Crop / फसल</th>
                      <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold"># Bags / बोरी</th>
                      <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">{lot.place !== "mandi" ? "Net Wt (kg) / शुद्ध वजन" : "Weight (kg) / वजन"}</th>
                      <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Price/kg / मूल्य</th>
                      <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Amount / राशि</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lot.cutType === "gate_cut" ? (() => {
                      const c = buildGateCutConsolidatedRow(lot);
                      if (c.totalBags <= 0) return null;
                      return (
                        <tr className="border-b border-gray-200">
                          <td className="py-1 px-2">
                            {getCropBilingual(lot.crop)} <span className="text-gray-500">({getSizeBilingual(c.dominantSize)})</span>
                          </td>
                          <td className="py-1 px-2 text-right font-mono">{c.totalBags}</td>
                          <td className="py-1 px-2 text-right font-mono">{c.totalNetWeight > 0 ? c.totalNetWeight.toFixed(2) : "—"}</td>
                          <td className="py-1 px-2 text-right font-mono">{c.dominantPrice > 0 ? `₹${parseFloat((Math.trunc(c.dominantPrice * 100) / 100).toFixed(2))}` : "—"}</td>
                          <td className="py-1 px-2 text-right font-mono font-medium">{c.totalAmount > 0 ? `₹${parseFloat(c.totalAmount.toFixed(1)).toLocaleString('en-IN')}` : "—"}</td>
                        </tr>
                      );
                    })() : lot.bagBreakdowns.filter(bd => isPayableBreakdown(bd, lot.cutType)).map((bd, bdIndex) => {
                      const weight = bd.weight ? parseFloat(bd.weight) : 0;
                      const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
                      const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
                      const amount = netWeight * price;
                      return (
                        <tr key={bd.id || bdIndex} className="border-b border-gray-200">
                          <td className="py-1 px-2">{getCropBilingual(lot.crop)}</td>
                          <td className="py-1 px-2 text-right font-mono">{bd.numberOfBags}</td>
                          <td className="py-1 px-2 text-right font-mono">{netWeight > 0 ? netWeight.toFixed(2) : "—"}</td>
                          <td className="py-1 px-2 text-right font-mono">{price > 0 ? `₹${parseFloat((Math.trunc(price * 100) / 100).toFixed(2))}` : "—"}</td>
                          <td className="py-1 px-2 text-right font-mono font-medium">{amount > 0 ? `₹${parseFloat(amount.toFixed(1)).toLocaleString('en-IN')}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                (() => {
                  const lotWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
                  const lotNetWeight = computeNetWeight(lotWeight, lot.originalBags, lot.place);
                  const lotPrice = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
                  const lotAmount = lotNetWeight * lotPrice;
                  return (
                    <table className="w-full text-sm mt-1 border-collapse">
                      <thead>
                        <tr className="border-b bg-gray-100">
                          <th className="text-left py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Crop / फसल</th>
                          <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold"># Bags / बोरी</th>
                          <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">{lot.place !== "mandi" ? "Net Wt (kg) / शुद्ध वजन" : "Weight (kg) / वजन"}</th>
                          <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Price/kg / मूल्य</th>
                          <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Amount / राशि</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-200">
                          <td className="py-1 px-2">{getCropBilingual(lot.crop)}</td>
                          <td className="py-1 px-2 text-right font-mono">{lot.originalBags}</td>
                          <td className="py-1 px-2 text-right font-mono">{lotNetWeight > 0 ? lotNetWeight.toFixed(2) : "—"}</td>
                          <td className="py-1 px-2 text-right font-mono">{lotPrice > 0 ? `₹${parseFloat((Math.trunc(lotPrice * 100) / 100).toFixed(2))}` : "—"}</td>
                          <td className="py-1 px-2 text-right font-mono font-medium">{lotAmount > 0 ? `₹${parseFloat(lotAmount.toFixed(1)).toLocaleString('en-IN')}` : "—"}</td>
                        </tr>
                      </tbody>
                    </table>
                  );
                })()
              )}

              {(() => {
                const lotTotals = calculateLotTotals(lot);
                const hasDeductions = lotTotals.totalDeductions > 0 || lotTotals.adjustedValue !== 0;
                const hasMandiCharges = lotTotals.totalMandiCharges > 0;
                return (
                  <>
                    {hasMandiCharges && (
                      <div className="mt-2 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                        <p className="text-xs uppercase text-gray-600 font-semibold mb-1">Mandi Charges / मंडी शुल्क</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {lotTotals.mandiCommission > 0 && (
                            <>
                              <span className="text-gray-600">Mandi Commission / मंडी कमीशन:</span>
                              <span className="text-right font-mono">₹{lotTotals.mandiCommission.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            </>
                          )}
                          {lotTotals.aadhatCommission > 0 && (
                            <>
                              <span className="text-gray-600">Aadhat Commission / आढ़त कमीशन:</span>
                              <span className="text-right font-mono">₹{lotTotals.aadhatCommission.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            </>
                          )}
                          {lotTotals.mandiHammali > 0 && (
                            <>
                              <span className="text-gray-600">Hammali / हम्माली:</span>
                              <span className="text-right font-mono">₹{lotTotals.mandiHammali.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            </>
                          )}
                          {lotTotals.mandiExtra > 0 && (
                            <>
                              <span className="text-gray-600">Extra Charges / अतिरिक्त शुल्क:</span>
                              <span className="text-right font-mono">₹{lotTotals.mandiExtra.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {hasDeductions && (
                      <div className="mt-2 p-2 bg-orange-50 rounded border-l-4 border-orange-400">
                        <p className="text-xs uppercase text-gray-600 font-semibold mb-1">Deductions / कटौती</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {lotTotals.hammali > 0 && (
                            <>
                              <span className="text-gray-600">Hammali/Grading / हम्माली:</span>
                              <span className="text-right font-mono">₹{lotTotals.hammali.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            </>
                          )}
                          {lotTotals.charges.filter((c: any) => {
                            if (!isFarmerDeductionCharge(c, lot.place)) return false;
                            const amt = typeof c.amount === 'string' ? parseFloat(c.amount) : (c.amount || 0);
                            return amt > 0;
                          }).map((c: any, i: number) => {
                            const amt = typeof c.amount === 'string' ? parseFloat(c.amount) : (c.amount || 0);
                            return (
                              <React.Fragment key={i}>
                                <span className="text-gray-600">{c.type || "Charge"}:</span>
                                <span className="text-right font-mono">₹{amt.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                              </React.Fragment>
                            );
                          })}
                          {lotTotals.earlyPayAmt > 0 && (
                            <>
                              <span className="text-gray-600">Early Pay/Bataw / जल्दी भुगतान ({lotTotals.earlyPayPct}%):</span>
                              <span className="text-right font-mono">₹{lotTotals.earlyPayAmt.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            </>
                          )}
                          {lotTotals.adjustedValue !== 0 && (
                            <>
                              <span className="text-gray-600">
                                Adjustment / समायोजन
                                {lotTotals.rate > 0 && lotTotals.interestDays > 0 
                                  ? ` (₹${lotTotals.principal.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} + ${lotTotals.rate}% × ${lotTotals.interestDays}d${lot.adjustedAmountRemark ? `, ${lot.adjustedAmountRemark}` : ""})` 
                                  : lot.adjustedAmountRemark ? ` (${lot.adjustedAmountRemark})` : ""}:
                              </span>
                              <span className={`text-right font-mono ${lotTotals.adjustedValue > 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {lotTotals.adjustedValue > 0 ? '+' : ''}₹{Math.abs(lotTotals.adjustedValue).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {lot.remarks && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-600">Remarks / टिप्पणी: <span className="text-black">{lot.remarks}</span></p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-3 p-3 bg-gradient-to-r from-sky-50 to-cyan-50 rounded-lg border border-sky-300">
        <h3 className="text-xs uppercase text-sky-800 font-bold tracking-wide mb-2">{isMandi ? "Aadhat Payment Summary / आढ़तिया भुगतान सारांश" : "Farmer Payment Summary / किसान भुगतान सारांश"}</h3>
        <div className={`grid ${isMandi ? (overallTotals.totalMandiCharges > 0 ? 'grid-cols-4' : 'grid-cols-3') : (overallTotals.totalMandiCharges > 0 ? 'grid-cols-5' : 'grid-cols-4')} gap-2 text-center`}>
          <div>
            <p className="text-xs text-gray-600 mb-1">Total Bags / कुल बोरी</p>
            <p className="font-mono font-semibold text-xs">{totalBagsExcludingWastage}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Total Payable / कुल देय</p>
            <p className="font-mono font-semibold text-xs text-green-700">₹{overallTotals.totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
          </div>
          {overallTotals.totalMandiCharges > 0 && (
            <div>
              <p className="text-xs text-gray-600 mb-1">Mandi Charges / मंडी शुल्क</p>
              <p className="font-mono font-semibold text-xs text-blue-600">₹{overallTotals.totalMandiCharges.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
            </div>
          )}
          {!isMandi && (
            <div>
              <p className="text-xs text-gray-600 mb-1">Deductions / कटौती</p>
              <p className="font-mono font-semibold text-xs text-orange-600">₹{overallTotals.totalDeductions.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
            </div>
          )}
          <div className="bg-teal-600 text-white rounded-md p-2 -m-1">
            <p className="text-xs opacity-90 mb-1">{isMandi ? "Net Due to Aadhat / आढ़तिया को देय" : "Net Due to Farmer / किसान को देय"}</p>
            <p className="font-mono font-bold text-sm">₹{Math.round(overallTotals.netPayable).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      {entry.remarks && (
        <div className="mt-3 pt-2 border-t border-gray-300">
          <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide mb-2">Remarks / टिप्पणी</h3>
          <p className="text-sm">{entry.remarks}</p>
        </div>
      )}

      <div className="mt-4 pt-2 border-t border-gray-300 text-center">
        <p className="text-xs text-gray-600">Thank you for the opportunity! / इस अवसर के लिए धन्यवाद!</p>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <img
            src={krashuvedLogo}
            alt="KrashuVed"
            width={36}
            height={36}
            style={{ width: 36, height: 36, objectFit: "contain" }}
          />
          <span style={{ fontSize: 27, lineHeight: 1, fontWeight: 600 }}>
            <span style={{ color: "#166534" }}>कृषु</span>
            <span style={{ color: "#ea580c" }}>वेद</span>
          </span>
        </div>
      </div>
    </div>
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
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined} style={isAutoShare ? { pointerEvents: "none" } : undefined}>
        {isAutoShare ? (
          <DialogTitle className="sr-only">Generating PDF</DialogTitle>
        ) : (
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>Bill Preview</DialogTitle>
              <div className="flex gap-2">
                <Button onClick={handleShare} size="sm" variant="outline" disabled={sharing} data-testid="button-share-bill">
                  {sharing ? (
                    <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : isMobile ? (
                    <Share2 className="h-4 w-4 mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {sharing ? "..." : isMobile ? "Share" : "PDF"}
                </Button>
                <Button onClick={handlePrint} size="sm" data-testid="button-print-bill">
                  <Printer className="h-4 w-4 mr-2" />
                  Print Bill
                </Button>
              </div>
            </div>
          </DialogHeader>
        )}

        <div className="overflow-x-auto -mx-4 px-4">
          <div ref={billRef} className="bg-white p-4 rounded-lg text-black min-w-[700px]" data-testid="bill-preview">
            {renderBillContent()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
