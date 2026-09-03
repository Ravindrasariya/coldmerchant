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

  const SIZE_TIE_ORDER = ["Large", "Medium", "Small", "Chhatan", "Wastage"];

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
    let totalNetWeight: number;

    if (lot.bagBreakdowns.length > 0) {
      const payableBreakdowns = lot.bagBreakdowns.filter(bd => isPayableBreakdown(bd, lot.cutType));
      totalPayable = payableBreakdowns.reduce((sum, bd) => {
          const weight = bd.weight ? parseFloat(bd.weight) : 0;
          const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
          const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
          return sum + (netWeight * price);
        }, 0);
      totalBagsForMandi = payableBreakdowns.reduce((sum, bd) => sum + (bd.numberOfBags || 0), 0);
      totalNetWeight = payableBreakdowns.reduce((sum, bd) => {
        const weight = bd.weight ? parseFloat(bd.weight) : 0;
        return sum + computeNetWeight(weight, bd.numberOfBags, lot.place);
      }, 0);
    } else {
      const weight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
      const netWeight = computeNetWeight(weight, lot.originalBags, lot.place);
      const price = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
      totalPayable = netWeight * price;
      totalBagsForMandi = lot.originalBags;
      totalNetWeight = netWeight;
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
    
    return { totalPayable, totalNetWeight, hammali, charges, dynamicCharges, earlyPayPct, earlyPayAmt, mandiCommission, aadhatCommission, mandiHammali, mandiExtra, totalMandiCharges, totalDeductions, principal, rate, interestDays, interest, adjustedValue, netPayable };
  };

  const overallTotals = entry.lots.reduce((acc, lot) => {
    const lotTotals = calculateLotTotals(lot);
    return {
      totalPayable: acc.totalPayable + lotTotals.totalPayable,
      totalNetWeight: acc.totalNetWeight + lotTotals.totalNetWeight,
      totalDeductions: acc.totalDeductions + lotTotals.totalDeductions,
      totalMandiCharges: acc.totalMandiCharges + lotTotals.totalMandiCharges,
      adjustedValue: acc.adjustedValue + lotTotals.adjustedValue,
      netPayable: acc.netPayable + lotTotals.netPayable,
    };
  }, { totalPayable: 0, totalNetWeight: 0, totalDeductions: 0, totalMandiCharges: 0, adjustedValue: 0, netPayable: 0 });

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
      "Chhatan": "Chhatan / छटन",
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

  const getPlaceBilingual = (lot: StockEntryWithLots["lots"][0]) => {
    if (lot.place === "farm_gate") return "Farm Gate / फार्म गेट";
    if (lot.place === "mandi") return "Mandi / मंडी";
    return lot.coldStoreName || "Cold Store";
  };

  // ---------------------------------------------------------------------------
  // Shared bill "party" + "summary" model.
  // Both the React preview (renderBillContent) and the printed HTML (handlePrint)
  // read labels, ordering, visibility and formatted values from here, so the two
  // outputs cannot drift apart.
  // ---------------------------------------------------------------------------
  const formatMoney = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;

  const billParty = (() => {
    const farmerAddress = [entry.village, entry.tehsil, entry.district, entry.state].filter(Boolean).join(", ");
    return {
      detailsLabel: isMandi ? "Aadhat Details / आढ़तिया विवरण" : "Farmer Details / किसान विवरण",
      name: isMandi && entry.aadhatName ? entry.aadhatName : entry.farmerName,
      contact: isMandi ? (aadhatRecord?.contact || null) : entry.farmerContact,
      address: isMandi ? (aadhatRecord?.address || "") : farmerAddress,
    };
  })();

  type SummaryCell = {
    key: string;
    labelEn: string;
    labelHi: string;
    value: string;
    tone: "default" | "green" | "blue" | "orange" | "highlight";
  };

  const billSummary = (() => {
    const cells: SummaryCell[] = [];
    cells.push({
      key: "bags",
      labelEn: "Total Bags",
      labelHi: "कुल बोरी",
      value: String(totalBagsExcludingWastage),
      tone: "default",
    });
    if (isMandi) {
      cells.push({
        key: "netWeight",
        labelEn: "Total Net Weight",
        labelHi: "कुल शुद्ध वजन",
        value: overallTotals.totalNetWeight.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        tone: "default",
      });
    }
    cells.push({
      key: "payable",
      labelEn: "Total Payable",
      labelHi: "कुल देय",
      value: formatMoney(overallTotals.totalPayable),
      tone: "green",
    });
    if (isMandi || overallTotals.totalMandiCharges > 0) {
      cells.push({
        key: "mandiCharges",
        labelEn: "Mandi Charges",
        labelHi: "मंडी शुल्क",
        value: formatMoney(overallTotals.totalMandiCharges),
        tone: "blue",
      });
    }
    if (!isMandi) {
      cells.push({
        key: "deductions",
        labelEn: "Deductions",
        labelHi: "कटौती",
        value: formatMoney(overallTotals.totalDeductions),
        tone: "orange",
      });
    }
    cells.push({
      key: "netDue",
      labelEn: isMandi ? "Net Due to Aadhat" : "Net Due to Farmer",
      labelHi: isMandi ? "आढ़तिया को देय" : "किसान को देय",
      value: `₹${Math.round(overallTotals.netPayable).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      tone: "highlight",
    });
    return {
      title: isMandi ? "Aadhat Payment Summary / आढ़तिया भुगतान सारांश" : "Farmer Payment Summary / किसान भुगतान सारांश",
      cells,
    };
  })();

  const SUMMARY_TONE_PRINT: Record<SummaryCell["tone"], string> = {
    default: "",
    green: "color: #15803d;",
    blue: "color: #3b82f6;",
    orange: "color: #ea580c;",
    highlight: "color: #fff;",
  };

  const SUMMARY_TONE_CLASS: Record<SummaryCell["tone"], string> = {
    default: "",
    green: "text-green-700",
    blue: "text-blue-600",
    orange: "text-orange-600",
    highlight: "",
  };

  // ---------------------------------------------------------------------------
  // Shared bill "lot section" model: crop table rows + charge/deduction lines.
  // Both the React preview (renderBillContent) and the printed HTML (handlePrint)
  // render from these structures, so labels and visibility rules exist once.
  // ---------------------------------------------------------------------------
  type BillCell = { text: string; muted?: string[]; align: "left" | "right"; mono?: boolean; bold?: boolean };
  type BillColumn = { label: string; align: "left" | "right" };
  type ChargeLine = { key: string; label: string; value: string; tone: "default" | "green" | "red" };
  type ChargeBlock = { key: string; title: string; variant: "charges" | "deductions"; lines: ChargeLine[] };
  type BillSection = {
    key: string;
    columns: BillColumn[];
    rows: Array<{ key: string; cells: BillCell[] }>;
    blocks: ChargeBlock[];
    remarks: string | null;
  };

  const formatQty = (n: number) => (n > 0 ? n.toFixed(2) : "—");
  const formatPrice = (p: number) => (p > 0 ? `₹${parseFloat((Math.trunc(p * 100) / 100).toFixed(2))}` : "—");
  const formatAmount = (a: number) => (a > 0 ? `₹${parseFloat(a.toFixed(1)).toLocaleString("en-IN")}` : "—");
  const formatCharge = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;

  const buildCropCell = (crop: string | undefined, size: string | null | undefined, marka: string | null | undefined): BillCell => {
    const muted: string[] = [];
    if (size) muted.push(`(${getSizeBilingual(size)})`);
    const m = (marka || "").trim();
    if (m) muted.push(`(Marka -${m})`);
    return { text: getCropBilingual(crop), muted, align: "left" };
  };

  const buildRowCells = (crop: BillCell, bags: number, weights: number[], price: number, amount: number): BillCell[] => [
    crop,
    { text: String(bags), align: "right", mono: true },
    ...weights.map((w) => ({ text: formatQty(w), align: "right" as const, mono: true })),
    { text: formatPrice(price), align: "right", mono: true },
    { text: formatAmount(amount), align: "right", mono: true, bold: true },
  ];

  const buildAdjustmentLine = (
    key: string,
    value: number,
    suffix: string,
  ): ChargeLine => ({
    key,
    label: `Adjustment / समायोजन${suffix}`,
    value: `${value > 0 ? "+" : ""}₹${Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`,
    tone: value > 0 ? "green" : "red",
  });

  const buildLotSection = (lot: StockEntryWithLots["lots"][0]): BillSection => {
    const weightHeader = lot.place !== "mandi" ? "Net Wt (kg) / शुद्ध वजन" : "Weight (kg) / वजन";
    const columns: BillColumn[] = [
      { label: "Crop / फसल", align: "left" },
      { label: "# Bags / बोरी", align: "right" },
      { label: weightHeader, align: "right" },
      { label: "Price/kg / मूल्य", align: "right" },
      { label: "Amount / राशि", align: "right" },
    ];

    const rows: BillSection["rows"] = [];
    if (lot.bagBreakdowns.length > 0) {
      if (lot.cutType === "gate_cut") {
        const c = buildGateCutConsolidatedRow(lot);
        if (c.totalBags > 0) {
          rows.push({
            key: `lot-${lot.id}-gate`,
            cells: buildRowCells(
              buildCropCell(lot.crop, c.dominantSize, getLotMarkaValue(lot)),
              c.totalBags,
              [c.totalNetWeight],
              c.dominantPrice,
              c.totalAmount,
            ),
          });
        }
      } else {
        lot.bagBreakdowns
          .filter((bd) => isPayableBreakdown(bd, lot.cutType))
          .forEach((bd, idx) => {
            const weight = bd.weight ? parseFloat(bd.weight) : 0;
            const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
            const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
            rows.push({
              key: `lot-${lot.id}-bd-${bd.id || idx}`,
              cells: buildRowCells(
                buildCropCell(lot.crop, null, (bd.marka || "").trim() || getLotMarkaValue(lot)),
                bd.numberOfBags,
                [netWeight],
                price,
                netWeight * price,
              ),
            });
          });
      }
    } else {
      const lotWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
      const lotNetWeight = computeNetWeight(lotWeight, lot.originalBags, lot.place);
      const lotPrice = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
      rows.push({
        key: `lot-${lot.id}-single`,
        cells: buildRowCells(
          buildCropCell(lot.crop, null, getLotMarkaValue(lot)),
          lot.originalBags,
          [lotNetWeight],
          lotPrice,
          lotNetWeight * lotPrice,
        ),
      });
    }

    const lotTotals = calculateLotTotals(lot);
    const blocks: ChargeBlock[] = [];

    if (lotTotals.totalMandiCharges > 0) {
      const lines: ChargeLine[] = [];
      if (lotTotals.mandiCommission > 0) lines.push({ key: "mandiCommission", label: "Mandi Commission / मंडी कमीशन", value: formatCharge(lotTotals.mandiCommission), tone: "default" });
      if (lotTotals.aadhatCommission > 0) lines.push({ key: "aadhatCommission", label: "Aadhat Commission / आढ़त कमीशन", value: formatCharge(lotTotals.aadhatCommission), tone: "default" });
      if (lotTotals.mandiHammali > 0) lines.push({ key: "mandiHammali", label: "Hammali / हम्माली", value: formatCharge(lotTotals.mandiHammali), tone: "default" });
      if (lotTotals.mandiExtra > 0) lines.push({ key: "mandiExtra", label: "Extra Charges / अतिरिक्त शुल्क", value: formatCharge(lotTotals.mandiExtra), tone: "default" });
      blocks.push({ key: `lot-${lot.id}-mandi`, title: "Mandi Charges / मंडी शुल्क", variant: "charges", lines });
    }

    if (lotTotals.totalDeductions > 0 || lotTotals.adjustedValue !== 0) {
      const lines: ChargeLine[] = [];
      if (lotTotals.hammali > 0) lines.push({ key: "hammali", label: "Hammali/Grading / हम्माली", value: formatCharge(lotTotals.hammali), tone: "default" });
      lotTotals.charges
        .filter((c) => {
          if (!isFarmerDeductionCharge(c, lot.place)) return false;
          const amt = typeof c.amount === "string" ? parseFloat(c.amount) : (c.amount || 0);
          return amt > 0;
        })
        .forEach((c, i) => {
          const amt = typeof c.amount === "string" ? parseFloat(c.amount) : (c.amount || 0);
          lines.push({ key: `charge-${i}`, label: c.type || "Charge", value: formatCharge(amt), tone: "default" });
        });
      if (lotTotals.earlyPayAmt > 0) lines.push({ key: "earlyPay", label: `Early Pay/Bataw / जल्दी भुगतान (${lotTotals.earlyPayPct}%)`, value: formatCharge(lotTotals.earlyPayAmt), tone: "default" });
      if (lotTotals.adjustedValue !== 0) {
        const suffix = lotTotals.rate > 0 && lotTotals.interestDays > 0
          ? ` (₹${lotTotals.principal.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} + ${lotTotals.rate}% × ${lotTotals.interestDays}d${lot.adjustedAmountRemark ? `, ${lot.adjustedAmountRemark}` : ""})`
          : lot.adjustedAmountRemark ? ` (${lot.adjustedAmountRemark})` : "";
        lines.push(buildAdjustmentLine("adjustment", lotTotals.adjustedValue, suffix));
      }
      blocks.push({ key: `lot-${lot.id}-deductions`, title: "Deductions / कटौती", variant: "deductions", lines });
    }

    return { key: `lot-${lot.id}`, columns, rows, blocks, remarks: lot.remarks };
  };

  const buildMandiSection = (): BillSection => {
    const columns: BillColumn[] = [
      { label: "Crop / फसल", align: "left" },
      { label: "# Bags / बोरी", align: "right" },
      { label: "Gross Wt / कुल वजन", align: "right" },
      { label: "Net Wt / शुद्ध वजन", align: "right" },
      { label: "Price/kg / मूल्य", align: "right" },
      { label: "Amount / राशि", align: "right" },
    ];
    const rows = allTableRows.map((r, idx) => ({
      key: `mandi-row-${idx}`,
      cells: buildRowCells(
        buildCropCell(r.crop, r.size, r.marka),
        r.bags,
        [r.grossWeight, r.netWeight],
        r.price,
        r.amount,
      ),
    }));

    const a = aggregatedMandiCharges;
    const lines: ChargeLine[] = [];
    if (a.mandiCommission > 0) lines.push({ key: "mandiCommission", label: `Mandi Commission${a.mandiPctLabel} / मंडी कमीशन${a.mandiPctLabel}`, value: formatCharge(a.mandiCommission), tone: "default" });
    if (a.aadhatCommission > 0) lines.push({ key: "aadhatCommission", label: `Aadhat Commission${a.aadhatPctLabel} / आढ़त कमीशन${a.aadhatPctLabel}`, value: formatCharge(a.aadhatCommission), tone: "default" });
    if (a.mandiHammali > 0) lines.push({ key: "mandiHammali", label: "Hammali / हम्माली", value: formatCharge(a.mandiHammali), tone: "default" });
    if (a.mandiExtra > 0) lines.push({ key: "mandiExtra", label: "Extra Charges / अतिरिक्त शुल्क", value: formatCharge(a.mandiExtra), tone: "default" });
    if (a.totalHammali > 0) lines.push({ key: "hammali", label: "Hammali/Grading / हम्माली", value: formatCharge(a.totalHammali), tone: "default" });
    Object.entries(a.chargesByType).forEach(([type, amt]) => {
      if (amt > 0) lines.push({ key: `charge-${type}`, label: type, value: formatCharge(amt), tone: "default" });
    });
    if (a.totalEarlyPayAmt > 0) lines.push({ key: "earlyPay", label: "Early Pay/Bataw / जल्दी भुगतान", value: formatCharge(a.totalEarlyPayAmt), tone: "default" });
    if (a.totalAdjustedValue !== 0) lines.push(buildAdjustmentLine("adjustment", a.totalAdjustedValue, ""));

    const blocks: ChargeBlock[] = lines.length
      ? [{ key: "mandi-charges", title: "Charges & Deductions / शुल्क एवं कटौती", variant: "charges", lines }]
      : [];

    return { key: "mandi", columns, rows, blocks, remarks: null };
  };

  const billSections: BillSection[] = isMandi ? [buildMandiSection()] : entry.lots.map(buildLotSection);

  const CHARGE_TONE_PRINT: Record<ChargeLine["tone"], string> = {
    default: "",
    green: " color: #15803d;",
    red: " color: #dc2626;",
  };

  const CHARGE_TONE_CLASS: Record<ChargeLine["tone"], string> = {
    default: "",
    green: "text-green-700",
    red: "text-red-600",
  };

  const BLOCK_STYLE_PRINT: Record<ChargeBlock["variant"], string> = {
    charges: "background: #eff6ff; border-left: 3px solid #3b82f6;",
    deductions: "background: #fff7ed; border-left: 3px solid #f97316;",
  };

  const BLOCK_CLASS: Record<ChargeBlock["variant"], string> = {
    charges: "bg-blue-50 border-blue-400",
    deductions: "bg-orange-50 border-orange-400",
  };

  const renderSectionHtml = (section: BillSection) => {
    const headHtml = section.columns
      .map((col) => `<th style="padding: 3px 8px; text-align: ${col.align}; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">${escapeHtml(col.label)}</th>`)
      .join("");
    const rowsHtml = section.rows
      .map((row) => `<tr>${row.cells
        .map((cell) => {
          const muted = (cell.muted || []).map((m) => ` <span style="color:#666; white-space:nowrap;">${escapeHtml(m)}</span>`).join("");
          return `<td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: ${cell.align};${cell.mono ? " font-family: monospace;" : ""}${cell.bold ? " font-weight: 600;" : ""}">${escapeHtml(cell.text)}${muted}</td>`;
        })
        .join("")}</tr>`)
      .join("");
    const blocksHtml = section.blocks
      .map((block) => `
        <div style="margin-top: 6px; padding: 8px; border-radius: 4px; ${BLOCK_STYLE_PRINT[block.variant]}">
          <p style="font-size: 10px; text-transform: uppercase; color: #666; margin: 0 0 4px 0; font-weight: 600;">${escapeHtml(block.title)}</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
            ${block.lines
              .map((line) => `<div><span style="color: #666;">${escapeHtml(line.label)}:</span></div><div style="text-align: right; font-family: monospace;${CHARGE_TONE_PRINT[line.tone]}">${escapeHtml(line.value)}</div>`)
              .join("")}
          </div>
        </div>
      `)
      .join("");
    const remarksHtml = section.remarks
      ? `
        <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #666; margin: 0;">Remarks / टिप्पणी: <span style="color: #000;">${escapeHtml(section.remarks)}</span></p>
        </div>
      `
      : "";
    return `
      <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 8px; page-break-inside: avoid;">
        <table style="width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px;">
          <thead><tr style="background: #f5f5f5;">${headHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        ${blocksHtml}
        ${remarksHtml}
      </div>
    `;
  };

  const renderSection = (section: BillSection) => (
    <div key={section.key} className="border border-gray-300 rounded-lg p-3">
      <table className="w-full text-sm mt-1 border-collapse">
        <thead>
          <tr className="border-b bg-gray-100">
            {section.columns.map((col) => (
              <th key={col.label} className={`${col.align === "left" ? "text-left" : "text-right"} py-1 px-2 text-xs uppercase text-gray-600 font-semibold`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => (
            <tr key={row.key} className="border-b border-gray-200">
              {row.cells.map((cell, i) => (
                <td key={i} className={`py-1 px-2 ${cell.align === "left" ? "text-left" : "text-right"} ${cell.mono ? "font-mono" : ""} ${cell.bold ? "font-medium" : ""}`}>
                  {cell.text}
                  {(cell.muted || []).map((m) => (
                    <span key={m} className="text-gray-500 whitespace-nowrap"> {m}</span>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {section.blocks.map((block) => (
        <div key={block.key} className={`mt-2 p-2 rounded border-l-4 ${BLOCK_CLASS[block.variant]}`}>
          <p className="text-xs uppercase text-gray-600 font-semibold mb-1">{block.title}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {block.lines.map((line) => (
              <React.Fragment key={line.key}>
                <span className="text-gray-600">{line.label}:</span>
                <span className={`text-right font-mono ${CHARGE_TONE_CLASS[line.tone]}`}>{line.value}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
      {section.remarks && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-600">Remarks / टिप्पणी: <span className="text-black">{section.remarks}</span></p>
        </div>
      )}
    </div>
  );

  const handlePrint = () => {
    if (isMandi && entry.aadhatDbId && aadhatLoading) return;
    if (merchantLoading || (merchantData?.receiptHeaderImage && !headerImageDataUri)) return;

    const sectionsHtml = billSections.map(renderSectionHtml).join("");

    const { address, detailsLabel, name: detailsName, contact: detailsContact } = billParty;

    const summaryCellsHtml = billSummary.cells.map(cell => {
      const isHighlight = cell.tone === "highlight";
      const wrapperStyle = isHighlight
        ? "min-width: 0; background: #0d9488; padding: 6px 4px; border-radius: 6px;"
        : "min-width: 0;";
      const labelStyle = isHighlight
        ? "font-size: 10px; line-height: 1.3; color: #fff; margin: 0 0 4px 0; overflow-wrap: anywhere;"
        : "font-size: 10px; line-height: 1.3; color: #666; margin: 0 0 4px 0;";
      const valueStyle = isHighlight
        ? "font-family: monospace; font-weight: 700; font-size: 15px; margin: 0; color: #fff;"
        : `font-family: monospace; font-weight: 600; font-size: 12px; margin: 0; ${SUMMARY_TONE_PRINT[cell.tone]}`;
      return `
                <div style="${wrapperStyle}">
                  <p style="${labelStyle}">${cell.labelEn} /<br />${cell.labelHi}</p>
                  <p style="${valueStyle}">${cell.value}</p>
                </div>`;
    }).join("");


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
              ${sectionsHtml}
            </div>

            <!-- Totals Summary -->
            <div style="margin-top: 12px; padding: 10px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 8px; border: 1px solid #0ea5e9;">
              <h3 style="font-size: 10px; text-transform: uppercase; color: #0369a1; margin: 0 0 8px 0; font-weight: 700; letter-spacing: 0.05em;">${billSummary.title}</h3>
              <div style="display: grid; grid-template-columns: repeat(${billSummary.cells.length}, minmax(0, 1fr)); gap: 8px; text-align: center; align-items: stretch;">${summaryCellsHtml}
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
            <p><span className="text-gray-600">Bill No / बिल नंबर:</span> <span className="font-mono font-semibold">#{entry.serialNumber}</span><span className="text-gray-600" style={{ marginLeft: "32px" }}>Total Bags / कुल बोरी:</span> <span className="font-mono font-semibold">{totalOriginalBags}</span></p>
            <p><span className="text-gray-600">Date / दिनांक:</span> <span className="font-medium">{new Date(entry.purchaseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</span></p>
            <p><span className="text-gray-600">Place / स्थान:</span> <span className="font-medium">{entry.lots[0] ? getPlaceBilingual(entry.lots[0]) : "—"}</span></p>
          </div>
        </div>
        <div>
          <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide mb-2">{billParty.detailsLabel}</h3>
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{billParty.name}</p>
            {billParty.contact && <p className="text-gray-600">{billParty.contact}</p>}
            <p className="text-gray-600">{billParty.address}</p>
          </div>
        </div>
      </div>

      <Separator className="my-3 bg-gray-300" />

      <div className="space-y-2">
        <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide">{isMandi ? "Details / विवरण" : "Lot Details / लॉट विवरण"}</h3>
        {billSections.map(renderSection)}
      </div>

      <div className="mt-3 p-3 bg-gradient-to-r from-sky-50 to-cyan-50 rounded-lg border border-sky-300">
        <h3 className="text-xs uppercase text-sky-800 font-bold tracking-wide mb-2">{billSummary.title}</h3>
        <div className="grid gap-2 text-center items-stretch" style={{ gridTemplateColumns: `repeat(${billSummary.cells.length}, minmax(0, 1fr))` }}>
          {billSummary.cells.map((cell) => (
            cell.tone === "highlight" ? (
              <div key={cell.key} className="min-w-0 bg-teal-600 text-white rounded-md px-1 py-1.5">
                <p className="text-xs leading-tight mb-1 break-words">{cell.labelEn} /<br />{cell.labelHi}</p>
                <p className="font-mono font-bold text-sm">{cell.value}</p>
              </div>
            ) : (
              <div key={cell.key} className="min-w-0">
                <p className="text-xs leading-tight text-gray-600 mb-1">{cell.labelEn} /<br />{cell.labelHi}</p>
                <p className={`font-mono font-semibold text-xs ${SUMMARY_TONE_CLASS[cell.tone]}`}>{cell.value}</p>
              </div>
            )
          ))}
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
