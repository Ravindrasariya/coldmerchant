import React, { useRef, useState } from "react";
import { calculateInterestOnly } from "@/lib/interest-utils";
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
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { useToast } from "@/hooks/use-toast";

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

  const handleShare = async () => {
    if (!billRef.current) return;
    setSharing(true);
    try {
      await shareReceiptAsPdf(billRef.current, `Purchase-Receipt-${entry.serialNumber}`);
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
  
  const totalBagsExcludingWastage = entry.lots.reduce((sum, lot) => {
    if (lot.bagBreakdowns.length > 0) {
      return sum + lot.bagBreakdowns
        .filter(bd => bd.size !== "Wastage")
        .reduce((bdSum, bd) => bdSum + (bd.numberOfBags || 0), 0);
    }
    return sum + lot.originalBags;
  }, 0);

  const calculateGrandTotal = () => {
    let total = 0;
    entry.lots.forEach(lot => {
      if (lot.bagBreakdowns.length > 0) {
        lot.bagBreakdowns.forEach(bd => {
          if (bd.size === "Wastage") return;
          if (bd.weight && bd.pricePerKg) {
            const weight = parseFloat(bd.weight);
            const netWeight = weight > 0 ? weight - bd.numberOfBags : 0;
            total += netWeight * parseFloat(bd.pricePerKg);
          }
        });
      } else if (lot.totalWeight && lot.pricePerKg) {
        const weight = parseFloat(lot.totalWeight);
        const netWeight = weight > 0 ? weight - lot.originalBags : 0;
        total += netWeight * parseFloat(lot.pricePerKg);
      }
    });
    return total;
  };

  const grandTotal = calculateGrandTotal();

  const calculateLotTotals = (lot: StockEntryWithLots["lots"][0]) => {
    let totalPayable: number;
    let totalBagsForMandi: number;

    if (lot.bagBreakdowns.length > 0) {
      totalPayable = lot.bagBreakdowns
        .filter(bd => bd.size !== "Wastage")
        .reduce((sum, bd) => {
          const weight = bd.weight ? parseFloat(bd.weight) : 0;
          const netWeight = weight > 0 ? weight - bd.numberOfBags : 0;
          const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
          return sum + (netWeight * price);
        }, 0);
      totalBagsForMandi = lot.bagBreakdowns
        .filter(bd => bd.size !== "Wastage")
        .reduce((sum, bd) => sum + (bd.numberOfBags || 0), 0);
    } else {
      const weight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
      const netWeight = weight > 0 ? weight - lot.originalBags : 0;
      const price = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
      totalPayable = netWeight * price;
      totalBagsForMandi = lot.originalBags;
    }
    
    const hammali = lot.hammaliGradingCharges ? parseFloat(lot.hammaliGradingCharges) : 0;
    const charges = lot.charges || [];
    const isFarmGate = lot.place === "farm_gate";
    const coldStoreChargeTypes = ["Cold Charges", "Ware House Charges"];
    const dynamicCharges = charges
      .filter(c => !(isFarmGate && coldStoreChargeTypes.includes(c.type)))
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

    const totalDeductions = hammali + dynamicCharges;
    
    const principal = lot.adjustedAmount ? parseFloat(lot.adjustedAmount) : 0;
    const rate = lot.adjustedAmountRate ? parseFloat(lot.adjustedAmountRate) : 0;
    const { interest, days: interestDays } = calculateInterestOnly(principal, rate, lot.adjustedAmountEffectiveDate || null);
    
    let adjustedValue = 0;
    if (interest > 0 && lot.adjustedAmountType) {
      adjustedValue = lot.adjustedAmountType === "credit" ? interest : -interest;
    }
    
    const netPayable = totalPayable - totalDeductions + totalMandiCharges + adjustedValue;
    
    return { totalPayable, hammali, charges, dynamicCharges, mandiCommission, aadhatCommission, mandiHammali, mandiExtra, totalMandiCharges, totalDeductions, principal, rate, interestDays, interest, adjustedValue, netPayable };
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

  const isMandi = !!(entry.aadhatDbId || entry.lots.some(l => l.place === "mandi"));

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

  const getPlaceBilingual = (lot: StockEntryWithLots["lots"][0]) => {
    if (lot.place === "farm_gate") return "Farm Gate / फार्म गेट";
    if (lot.place === "mandi") return "Mandi / मंडी";
    return lot.coldStoreName || "Cold Store";
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const lotsHtml = entry.lots.map((lot) => {
      let breakdownHtml = "";
      
      if (lot.bagBreakdowns.length > 0) {
        const rows = lot.bagBreakdowns.map((bd) => {
          const weight = bd.weight ? parseFloat(bd.weight) : 0;
          const netWeight = weight > 0 ? weight - bd.numberOfBags : 0;
          const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
          // Always use netWeight * price
          const amount = netWeight * price;
          return `
            <tr>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd;">${getCropBilingual(lot.crop)}</td>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${bd.numberOfBags}</td>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${weight > 0 ? weight.toFixed(2) : "—"}</td>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${price > 0 ? `₹${parseFloat((Math.trunc(price * 100) / 100).toFixed(2))}` : "—"}</td>
              <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: 600;">${amount > 0 ? `₹${parseFloat(amount.toFixed(1)).toLocaleString('en-IN')}` : "—"}</td>
            </tr>
          `;
        }).join("");
        
        breakdownHtml = `
          <table style="width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 3px 8px; text-align: left; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Crop / फसल</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;"># Bags / बोरी</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Weight (kg) / वजन</th>
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
        const lotNetWeight = lotWeight > 0 ? lotWeight - lot.originalBags : 0;
        const lotPrice = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
        const lotAmount = lotNetWeight * lotPrice;
        breakdownHtml = `
          <table style="width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 3px 8px; text-align: left; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Crop / फसल</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;"># Bags / बोरी</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Weight (kg) / वजन</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Price/kg / मूल्य</th>
                <th style="padding: 3px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ddd;">Amount / राशि</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 3px 8px; border-bottom: 1px solid #ddd;">${getCropBilingual(lot.crop)}</td>
                <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${lot.originalBags}</td>
                <td style="padding: 3px 8px; border-bottom: 1px solid #ddd; text-align: right; font-family: monospace;">${lotWeight > 0 ? lotWeight.toFixed(2) : "—"}</td>
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

    const address = [entry.village, entry.tehsil, entry.district, entry.state].filter(Boolean).join(", ");
    const detailsLabel = isMandi ? "Aadhat Details / आढ़तिया विवरण" : "Farmer Details / किसान विवरण";
    const detailsName = isMandi && entry.aadhatName ? entry.aadhatName : entry.farmerName;
    const detailsContact = isMandi ? null : entry.farmerContact;
    const summaryLabel = isMandi ? "Aadhat Payment Summary / आढ़तिया भुगतान सारांश" : "Farmer Payment Summary / किसान भुगतान सारांश";
    const netDueLabel = isMandi ? "Net Due to Aadhat / आढ़तिया को देय" : "Net Due to Farmer / किसान को देय";

    printWindow.document.write(`
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
              <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 2px;">${user?.merchantName || "Merchant"}</h1>
              ${user?.merchantAddress ? `<p style="font-size: 11px; color: #444; margin-bottom: 2px;">${user.merchantAddress}</p>` : ""}
              ${user?.merchantContact ? `<p style="font-size: 11px; color: #666; margin-bottom: 4px;">Ph: ${user.merchantContact}</p>` : ""}
              <p style="font-size: 13px; font-weight: 600; color: #333;">Purchase Receipt / खरीद रसीद</p>
            </div>

            <!-- Bill & Farmer Details -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <div style="flex: 1;">
                <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.05em;">Bill Details / बिल विवरण</h3>
                <p style="margin: 0 0 4px 0;"><span style="color: #666;">Bill No / बिल नंबर:</span> <span style="font-family: monospace; font-weight: 600;">#${entry.serialNumber}</span></p>
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
              <h3 style="font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.05em;">Lot Details / लॉट विवरण</h3>
              ${lotsHtml}
            </div>

            <!-- Totals Summary -->
            <div style="margin-top: 12px; padding: 10px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 8px; border: 1px solid #0ea5e9;">
              <h3 style="font-size: 10px; text-transform: uppercase; color: #0369a1; margin: 0 0 8px 0; font-weight: 700; letter-spacing: 0.05em;">${summaryLabel}</h3>
              <div style="display: grid; grid-template-columns: repeat(${overallTotals.totalMandiCharges > 0 ? 5 : 4}, 1fr); gap: 8px; text-align: center;">
                <div>
                  <p style="font-size: 10px; color: #666; margin: 0 0 4px 0;">Total Bags / कुल बोरी</p>
                  <p style="font-family: monospace; font-weight: 600; font-size: 16px; margin: 0;">${totalBagsExcludingWastage}</p>
                </div>
                <div>
                  <p style="font-size: 10px; color: #666; margin: 0 0 4px 0;">Total Payable / कुल देय</p>
                  <p style="font-family: monospace; font-weight: 600; font-size: 16px; margin: 0; color: #15803d;">₹${overallTotals.totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
                </div>
                ${overallTotals.totalMandiCharges > 0 ? `<div>
                  <p style="font-size: 10px; color: #666; margin: 0 0 4px 0;">Mandi Charges / मंडी शुल्क</p>
                  <p style="font-family: monospace; font-weight: 600; font-size: 16px; margin: 0; color: #3b82f6;">₹${overallTotals.totalMandiCharges.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
                </div>` : ""}
                <div>
                  <p style="font-size: 10px; color: #666; margin: 0 0 4px 0;">Deductions / कटौती</p>
                  <p style="font-family: monospace; font-weight: 600; font-size: 16px; margin: 0; color: #ea580c;">₹${overallTotals.totalDeductions.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
                </div>
                <div style="background: #0d9488; padding: 8px; border-radius: 6px; margin: -8px;">
                  <p style="font-size: 10px; color: #fff; margin: 0 0 4px 0; opacity: 0.9;">${netDueLabel}</p>
                  <p style="font-family: monospace; font-weight: 700; font-size: 20px; margin: 0; color: #fff;">₹${overallTotals.netPayable.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
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
              <p style="font-size: 11px; color: #666; margin: 0;">Thank you for your business! / व्यापार के लिए धन्यवाद!</p>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const renderBillContent = () => (
    <div className="bill-container">
      <div className="text-center mb-3 pb-2 border-b-2 border-black">
        {user?.merchantName && (
          <h1 className="text-2xl font-bold mb-1">{user.merchantName}</h1>
        )}
        {user?.merchantAddress && (
          <p className="text-xs text-gray-500 mb-0.5">{user.merchantAddress}</p>
        )}
        {user?.merchantContact && (
          <p className="text-xs text-gray-500 mb-1">Ph: {user.merchantContact}</p>
        )}
        <p className="text-lg font-semibold">Purchase Receipt / खरीद रसीद</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide mb-2">Bill Details / बिल विवरण</h3>
          <div className="space-y-1 text-sm">
            <p><span className="text-gray-600">Bill No / बिल नंबर:</span> <span className="font-mono font-semibold">#{entry.serialNumber}</span></p>
            <p><span className="text-gray-600">Date / दिनांक:</span> <span className="font-medium">{new Date(entry.purchaseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</span></p>
            <p><span className="text-gray-600">Place / स्थान:</span> <span className="font-medium">{entry.lots[0] ? getPlaceBilingual(entry.lots[0]) : "—"}</span></p>
          </div>
        </div>
        <div>
          <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide mb-2">{isMandi ? "Aadhat Details / आढ़तिया विवरण" : "Farmer Details / किसान विवरण"}</h3>
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{isMandi && entry.aadhatName ? entry.aadhatName : entry.farmerName}</p>
            {!isMandi && entry.farmerContact && <p className="text-gray-600">{entry.farmerContact}</p>}
            <p className="text-gray-600">
              {[entry.village, entry.tehsil, entry.district, entry.state].filter(Boolean).join(", ")}
            </p>
          </div>
        </div>
      </div>

      <Separator className="my-3 bg-gray-300" />

      <div className="space-y-2">
        <h3 className="text-xs uppercase text-gray-600 font-semibold tracking-wide">Lot Details / लॉट विवरण</h3>
        {entry.lots.map((lot) => (
          <div key={lot.id} className="border border-gray-300 rounded-lg p-3">
            {lot.bagBreakdowns.length > 0 ? (
              <table className="w-full text-sm mt-1 border-collapse">
                <thead>
                  <tr className="border-b bg-gray-100">
                    <th className="text-left py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Crop / फसल</th>
                    <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold"># Bags / बोरी</th>
                    <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Weight (kg) / वजन</th>
                    <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Price/kg / मूल्य</th>
                    <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Amount / राशि</th>
                  </tr>
                </thead>
                <tbody>
                  {lot.bagBreakdowns.map((bd, bdIndex) => {
                    const weight = bd.weight ? parseFloat(bd.weight) : 0;
                    const netWeight = weight > 0 ? weight - bd.numberOfBags : 0;
                    const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
                    const amount = netWeight * price;
                    return (
                      <tr key={bd.id || bdIndex} className="border-b border-gray-200">
                        <td className="py-1 px-2">{getCropBilingual(lot.crop)}</td>
                        <td className="py-1 px-2 text-right font-mono">{bd.numberOfBags}</td>
                        <td className="py-1 px-2 text-right font-mono">{weight > 0 ? weight.toFixed(2) : "—"}</td>
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
                const lotNetWeight = lotWeight > 0 ? lotWeight - lot.originalBags : 0;
                const lotPrice = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
                const lotAmount = lotNetWeight * lotPrice;
                return (
                  <table className="w-full text-sm mt-1 border-collapse">
                    <thead>
                      <tr className="border-b bg-gray-100">
                        <th className="text-left py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Crop / फसल</th>
                        <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold"># Bags / बोरी</th>
                        <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Weight (kg) / वजन</th>
                        <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Price/kg / मूल्य</th>
                        <th className="text-right py-1 px-2 text-xs uppercase text-gray-600 font-semibold">Amount / राशि</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-200">
                        <td className="py-1 px-2">{getCropBilingual(lot.crop)}</td>
                        <td className="py-1 px-2 text-right font-mono">{lot.originalBags}</td>
                        <td className="py-1 px-2 text-right font-mono">{lotWeight > 0 ? lotWeight.toFixed(2) : "—"}</td>
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
        ))}
      </div>

      <div className="mt-3 p-3 bg-gradient-to-r from-sky-50 to-cyan-50 rounded-lg border border-sky-300">
        <h3 className="text-xs uppercase text-sky-800 font-bold tracking-wide mb-2">{isMandi ? "Aadhat Payment Summary / आढ़तिया भुगतान सारांश" : "Farmer Payment Summary / किसान भुगतान सारांश"}</h3>
        <div className={`grid ${overallTotals.totalMandiCharges > 0 ? 'grid-cols-5' : 'grid-cols-4'} gap-2 text-center`}>
          <div>
            <p className="text-xs text-gray-600 mb-1">Total Bags / कुल बोरी</p>
            <p className="font-mono font-semibold text-base">{totalBagsExcludingWastage}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Total Payable / कुल देय</p>
            <p className="font-mono font-semibold text-base text-green-700">₹{overallTotals.totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
          </div>
          {overallTotals.totalMandiCharges > 0 && (
            <div>
              <p className="text-xs text-gray-600 mb-1">Mandi Charges / मंडी शुल्क</p>
              <p className="font-mono font-semibold text-base text-blue-600">₹{overallTotals.totalMandiCharges.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-600 mb-1">Deductions / कटौती</p>
            <p className="font-mono font-semibold text-base text-orange-600">₹{overallTotals.totalDeductions.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
          </div>
          <div className="bg-teal-600 text-white rounded-md p-2 -m-1">
            <p className="text-xs opacity-90 mb-1">{isMandi ? "Net Due to Aadhat / आढ़तिया को देय" : "Net Due to Farmer / किसान को देय"}</p>
            <p className="font-mono font-bold text-xl">₹{overallTotals.netPayable.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
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
        <p className="text-xs text-gray-600">Thank you for your business! / व्यापार के लिए धन्यवाद!</p>
      </div>
    </div>
  );

  React.useEffect(() => {
    if (!open || !autoAction || autoActionDone.current) return;
    autoActionDone.current = true;
    if (autoAction === "print") {
      handlePrint();
      onOpenChange(false);
    } else if (autoAction === "share") {
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
  }, [open, autoAction]);

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
