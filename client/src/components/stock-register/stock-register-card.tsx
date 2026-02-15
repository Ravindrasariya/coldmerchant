import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Filter, Edit, Printer, Package, X, Phone, MapPin, Calendar, Clock, Snowflake, Boxes, Users, Building2, Download, Check, ChevronsUpDown, IndianRupee } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { QUALITY_OPTIONS } from "@shared/schema";
import { StockEntryEditDialog } from "./stock-entry-edit-dialog";
import { BillPrintDialog } from "./bill-print-dialog";
import { useLanguage } from "@/hooks/use-language";

interface StockEntryWithLots {
  id: number;
  uniqueId: string | null;
  serialNumber: number;
  purchaseDate: string;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  paymentStatus: string;
  amountPaid: string | null;
  remarks: string | null;
  crop?: string;
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

function computeLotMetrics(lot: StockEntryWithLots['lots'][0]) {
  const wastageBags = lot.bagBreakdowns
    .filter(bd => bd.size === "Wastage")
    .reduce((sum, bd) => sum + bd.numberOfBags, 0);
  
  const actualSellableBags = lot.originalBags - wastageBags;
  const remainingToSell = Math.min(lot.remainingBags, actualSellableBags);
  const soldBags = actualSellableBags - remainingToSell;
  
  let totalWeight = 0;
  let totalAmount: number | null = null;
  
  // Calculate from bagBreakdowns for all cut types (matches edit dialog formula)
  const sellableBreakdownsForCalc = lot.bagBreakdowns.filter(bd => bd.size !== "Wastage");
  const hasBreakdownData = sellableBreakdownsForCalc.some(bd => {
    const w = bd.weight ? parseFloat(bd.weight) : 0;
    const p = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
    return w > 0 && p > 0;
  });

  if (hasBreakdownData) {
    lot.bagBreakdowns.forEach(bd => {
      if (bd.size !== "Wastage") {
        const weight = bd.weight ? parseFloat(bd.weight) : 0;
        totalWeight += weight;

        const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
        const netWeight = weight > 0 ? weight - bd.numberOfBags : 0;
        if (netWeight > 0 && price > 0) {
          totalAmount = (totalAmount ?? 0) + (netWeight * price);
        }
      }
    });
  } else {
    // Fallback to lot-level data when no breakdown weight/price data exists
    const lotTotalWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
    const price = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
    const netWeight = lotTotalWeight > 0 ? lotTotalWeight - lot.originalBags : 0;
    totalWeight = lotTotalWeight;
    if (netWeight > 0 && price > 0) {
      totalAmount = netWeight * price;
    }
  }
  
  const sellableBreakdowns = lot.bagBreakdowns.filter(bd => bd.size !== "Wastage");
  const wastageBreakdowns = lot.bagBreakdowns.filter(bd => bd.size === "Wastage");
  
  // Calculate cold store charges from Cold Charges/Ware House Charges in charges array only
  const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
  const coldStoreTotalCharges = (lot.charges || [])
    .filter(c => c && coldStoreTypes.includes(c.type))
    .reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);
  
  const coldStorePaid = lot.coldStorageChargesPaid ? parseFloat(lot.coldStorageChargesPaid) : 0;
  const coldStoreRemaining = coldStoreTotalCharges - coldStorePaid;
  
  const rawAdjustedAmount = lot.adjustedAmount !== null ? parseFloat(lot.adjustedAmount) : 0;
  const adjustedAmountType = lot.adjustedAmountType;
  
  // Calculate compound interest if rate and effective date are provided
  // Interest-only: adjustment is 0 if no rate/date provided (principal is already in overall calculation)
  const adjustedAmountRate = (lot as any).adjustedAmountRate ? parseFloat((lot as any).adjustedAmountRate) : 0;
  const adjustedAmountEffectiveDate = (lot as any).adjustedAmountEffectiveDate;
  
  let finalAdjustment = 0; // Default to 0 (interest-only means no rate/date = no adjustment)
  if (rawAdjustedAmount > 0 && adjustedAmountRate > 0 && adjustedAmountEffectiveDate) {
    const effectiveDate = new Date(adjustedAmountEffectiveDate);
    const today = new Date();
    const days = Math.max(0, Math.floor((today.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24)));
    const years = days / 365;
    // Apply only interest portion: P × ((1 + r)^t - 1)
    finalAdjustment = Math.round((rawAdjustedAmount * (Math.pow(1 + adjustedAmountRate / 100, years) - 1)) * 100) / 100;
  }
  
  // Calculate total deductions: hammali/grading + dynamic charges
  // For Farm Gate lots, exclude Cold Charges and Ware House Charges from farmer deductions
  // (merchant pays cold store separately, not deducted from farmer)
  const isFarmGate = lot.place === "farm_gate";
  const farmerDeductionTypes = ["Cold Charges", "Ware House Charges"];
  const hammaliGradingCharges = lot.hammaliGradingCharges ? parseFloat(lot.hammaliGradingCharges) : 0;
  const dynamicCharges = (lot.charges || [])
    .filter(c => !(isFarmGate && farmerDeductionTypes.includes(c.type)))
    .reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);
  const totalDeductions = hammaliGradingCharges + dynamicCharges;
  
  return {
    originalBags: lot.originalBags,
    wastageBags,
    actualSellableBags,
    remainingToSell,
    soldBags,
    totalWeight,
    totalAmount,
    pricePerKg: lot.pricePerKg ? parseFloat(lot.pricePerKg) : null,
    coldStoreTotalCharges,
    coldStorePaid,
    coldStoreRemaining,
    adjustedAmount: finalAdjustment,
    adjustedAmountType,
    totalDeductions,
    sellableBreakdowns,
    wastageBreakdowns,
  };
}

function computeEntryStatusFromMetrics(lotsWithMetrics: Array<{ metrics: ReturnType<typeof computeLotMetrics> }>): 'unsold' | 'partial' | 'sold' {
  const allSold = lotsWithMetrics.every(({ metrics }) => metrics.remainingToSell === 0);
  const allUnsold = lotsWithMetrics.every(({ metrics }) => metrics.remainingToSell > 0);
  
  if (allSold) return 'sold';
  if (allUnsold) return 'unsold';
  return 'partial';
}

interface StockRegisterCardProps {
  downloadDialogOpen?: boolean;
  onDownloadDialogClose?: () => void;
  selectedCrop?: "potato" | "onion";
}

export function StockRegisterCard({ downloadDialogOpen = false, onDownloadDialogClose, selectedCrop = "potato" }: StockRegisterCardProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState<string>(currentYear.toString());
  const [filterSerial, setFilterSerial] = useState<string>("");
  const [filterFarmer, setFilterFarmer] = useState<string>("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterQuality, setFilterQuality] = useState<string>("");
  const [filterUnsold, setFilterUnsold] = useState<boolean>(false);
  const [filterColdStore, setFilterColdStore] = useState<string>("");
  const [farmerPopoverOpen, setFarmerPopoverOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<StockEntryWithLots | null>(null);
  const [printEntry, setPrintEntry] = useState<StockEntryWithLots | null>(null);
  
  // Download dialog state (simplified - now uses filtered entries directly)
  const [internalDownloadDialogOpen, setInternalDownloadDialogOpen] = useState(false);
  const isDownloadDialogOpen = downloadDialogOpen || internalDownloadDialogOpen;
  const handleDownloadDialogClose = () => {
    setInternalDownloadDialogOpen(false);
    onDownloadDialogClose?.();
  };

  const { data: entries, isLoading, error } = useQuery<StockEntryWithLots[]>({
    queryKey: ["/api/stock-entries"],
  });

  const availableYears = useMemo(() => {
    if (!entries) return [currentYear];
    const years = new Set<number>();
    entries.forEach(entry => {
      const year = new Date(entry.purchaseDate).getFullYear();
      years.add(year);
    });
    // Always include current year
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a); // Descending order
  }, [entries, currentYear]);

  const coldStores = useMemo(() => {
    if (!entries) return [];
    const stores = new Set<string>();
    entries.forEach(entry => {
      entry.lots.forEach(lot => {
        if (lot.coldStoreName) {
          stores.add(lot.coldStoreName);
        }
      });
    });
    return Array.from(stores);
  }, [entries]);

  const serialNumbers = useMemo(() => {
    if (!entries) return [];
    return entries.map(e => e.serialNumber).sort((a, b) => a - b);
  }, [entries]);

  const farmerOptions = useMemo(() => {
    if (!entries) return [];
    const farmerMap = new Map<string, { name: string; village: string | null; contact: string | null }>();
    entries.forEach(entry => {
      const key = entry.farmerName.toLowerCase();
      if (!farmerMap.has(key)) {
        farmerMap.set(key, {
          name: entry.farmerName,
          village: entry.village,
          contact: entry.farmerContact,
        });
      }
    });
    return Array.from(farmerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const farmerNames = useMemo(() => {
    return farmerOptions.map(f => f.name);
  }, [farmerOptions]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    
    return entries.filter((entry) => {
      // Filter by year
      if (filterYear) {
        const entryYear = new Date(entry.purchaseDate).getFullYear();
        if (entryYear.toString() !== filterYear) return false;
      }

      // Filter by crop - entry must have at least one lot with matching crop
      const hasCropMatch = entry.lots.some(lot => (lot.crop || "potato") === selectedCrop);
      if (!hasCropMatch) return false;

      if (filterSerial && entry.serialNumber.toString() !== filterSerial) {
        return false;
      }

      if (filterFarmer && entry.farmerName !== filterFarmer) {
        return false;
      }

      if (filterPaymentStatus && entry.paymentStatus !== filterPaymentStatus) {
        return false;
      }

      if (filterQuality) {
        const hasQuality = entry.lots.some(lot => lot.quality === filterQuality);
        if (!hasQuality) return false;
      }

      if (filterUnsold) {
        const hasUnsold = entry.lots.some(lot => lot.remainingBags > 0);
        if (!hasUnsold) return false;
      }

      if (filterColdStore) {
        const hasColdStore = entry.lots.some(lot => lot.coldStoreName === filterColdStore);
        if (!hasColdStore) return false;
      }

      return true;
    });
  }, [entries, selectedCrop, filterYear, filterSerial, filterFarmer, filterPaymentStatus, filterQuality, filterUnsold, filterColdStore]);

  const clearFilters = () => {
    setFilterYear(currentYear.toString());
    setFilterSerial("");
    setFilterFarmer("");
    setFilterPaymentStatus("");
    setFilterQuality("");
    setFilterUnsold(false);
    setFilterColdStore("");
  };

  // Year filter is not included in hasActiveFilters since it always has a value (current year by default)
  const hasActiveFilters = filterSerial || filterFarmer || filterPaymentStatus || filterQuality || filterUnsold || filterColdStore || (filterYear && filterYear !== currentYear.toString());

  // Compute summary totals from filtered entries
  const summaryTotals = useMemo(() => {
    let bagsTotal = 0;
    let bagsRemaining = 0;
    let farmerTotal = 0;
    let farmerDue = 0;
    let coldStoreTotal = 0;
    let coldStoreDue = 0;
    let totalPayable = 0;
    let totalDeductions = 0;

    filteredEntries.forEach(entry => {
      let entryTotalAmount = 0;
      let entryAdjustment = 0;
      let entryDeductions = 0;
      let entryColdStoreTotalCharges = 0;
      let entryColdStorePaid = 0;

      let entryFarmGateColdCharges = 0;

      entry.lots.forEach(lot => {
        const metrics = computeLotMetrics(lot);
        bagsTotal += metrics.actualSellableBags;
        bagsRemaining += metrics.remainingToSell;
        if (metrics.totalAmount !== null) {
          entryTotalAmount += metrics.totalAmount;
        }
        if (metrics.adjustedAmount > 0 && metrics.adjustedAmountType) {
          if (metrics.adjustedAmountType === "debit") {
            entryAdjustment -= metrics.adjustedAmount;
          } else if (metrics.adjustedAmountType === "credit") {
            entryAdjustment += metrics.adjustedAmount;
          }
        }
        entryDeductions += metrics.totalDeductions;
        entryColdStoreTotalCharges += metrics.coldStoreTotalCharges;
        entryColdStorePaid += metrics.coldStorePaid;
        if (lot.place === "farm_gate") {
          entryFarmGateColdCharges += metrics.coldStoreTotalCharges;
        }
      });

      // Net Payable = Total Payable - Deductions + Adjustment (matches edit dialog formula)
      const netPayable = entryTotalAmount - entryDeductions + entryAdjustment;
      farmerTotal += netPayable;
      const amountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
      farmerDue += Math.max(netPayable - amountPaid, 0);
      
      // Total Cost: base payable + cold/warehouse charges for Farm Gate lots
      // (Farm Gate cold charges aren't deducted from farmer but are still merchant's cost)
      totalPayable += entryTotalAmount + entryFarmGateColdCharges;
      totalDeductions += entryDeductions;
      coldStoreTotal += entryColdStoreTotalCharges;
      coldStoreDue += Math.max(entryColdStoreTotalCharges - entryColdStorePaid, 0);
    });

    return { bagsTotal, bagsRemaining, farmerTotal, farmerDue, coldStoreTotal, coldStoreDue, totalPayable, totalDeductions };
  }, [filteredEntries]);

  const handleDownloadCSV = () => {
    // Use already-filtered entries based on applied filters
    if (filteredEntries.length === 0) {
      toast({
        title: t("No Data", "कोई डेटा नहीं"),
        description: t("No entries match the current filters", "वर्तमान फ़िल्टर से कोई प्रविष्टि नहीं मिली"),
        variant: "destructive",
      });
      return;
    }

    const filteredForDownload = filteredEntries;

    const headers = [
      t("Serial #", "क्रमांक"),
      t("Lot #", "लॉट #"),
      t("Date", "तिथि"),
      t("Farmer Name", "किसान का नाम"),
      t("Village", "गाँव"),
      t("Cold Store", "कोल्ड स्टोर"),
      t("Potato Type", "आलू का प्रकार"),
      t("Quality", "गुणवत्ता"),
      t("Cut Type", "कट प्रकार"),
      t("Original Bags", "मूल बैग"),
      t("Actual Bags", "वास्तविक बैग"),
      t("Large", "बड़ा"),
      t("Medium", "मध्यम"),
      t("Small", "छोटा"),
      t("Remaining Bags", "बचे बैग"),
      t("Farmer Total ₹", "किसान कुल ₹"),
      t("Cold Charges ₹", "कोल्ड शुल्क ₹"),
      t("Hammali/Grading ₹", "हम्माली/ग्रेडिंग ₹"),
      t("Advance ₹", "अग्रिम ₹"),
      t("Other Charges ₹", "अन्य शुल्क ₹"),
      t("Total Deductions ₹", "कुल कटौती ₹"),
      t("Interest ₹", "ब्याज ₹"),
      t("Net Payable ₹", "शुद्ध देय ₹"),
      t("Paid ₹", "भुगतान ₹"),
      t("Farmer Due ₹", "किसान बकाया ₹"),
      t("Cold Total ₹", "कोल्ड कुल ₹"),
      t("Cold Due ₹", "कोल्ड बकाया ₹"),
    ];

    const rows: string[][] = [];
    filteredForDownload.forEach(entry => {
      // Calculate entry-level totals for proration
      const entryLotMetrics = entry.lots.map(lot => computeLotMetrics(lot));
      const entryFarmerTotal = entryLotMetrics.reduce((sum, m) => sum + (m.totalAmount ?? 0), 0);
      const entryAdjustment = entryLotMetrics.reduce((sum, m) => {
        if (m.adjustedAmount > 0 && m.adjustedAmountType) {
          return sum + (m.adjustedAmountType === "debit" ? -m.adjustedAmount : m.adjustedAmount);
        }
        return sum;
      }, 0);
      const entryAmountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
      
      entry.lots.forEach((lot, lotIndex) => {
        const metrics = computeLotMetrics(lot);
        
        // Get size distribution from sellable breakdowns
        const largeBags = metrics.sellableBreakdowns
          .filter(bd => bd.size === "Large")
          .reduce((sum, bd) => sum + bd.numberOfBags, 0);
        const mediumBags = metrics.sellableBreakdowns
          .filter(bd => bd.size === "Medium")
          .reduce((sum, bd) => sum + bd.numberOfBags, 0);
        const smallBags = metrics.sellableBreakdowns
          .filter(bd => bd.size === "Small")
          .reduce((sum, bd) => sum + bd.numberOfBags, 0);
        
        // Deduction breakdown - categorize charges from charges array
        const charges = lot.charges || [];
        const csvIsFarmGate = lot.place === "farm_gate";
        const getChargeAmount = (c: { type: string; amount: number | string }) => {
          const amt = typeof c.amount === 'string' ? parseFloat(c.amount) : c.amount;
          return isNaN(amt) ? 0 : amt;
        };
        
        // Cold Charges = "Cold Charges" + "Ware House Charges" from charges array
        // For Farm Gate: still shown in CSV column but excluded from totalDeductions (merchant pays, not farmer)
        const coldCharges = charges
          .filter(c => c.type === "Cold Charges" || c.type === "Ware House Charges")
          .reduce((sum, c) => sum + getChargeAmount(c), 0);
        
        // Hammali/Grading = "Hammali Charges" + "Grading Charges" from charges array
        const hammaliGrading = charges
          .filter(c => c.type === "Hammali Charges" || c.type === "Grading Charges")
          .reduce((sum, c) => sum + getChargeAmount(c), 0);
        
        // Advance = "Advance" from charges array
        const advanceCharges = charges
          .filter(c => c.type === "Advance")
          .reduce((sum, c) => sum + getChargeAmount(c), 0);
        
        // Other Charges = remaining types (Bag Charges, Freight Charges, Kata Charges, Other Charges)
        const otherChargeTypes = ["Bag Charges", "Freight Charges", "Kata Charges", "Other Charges"];
        const otherCharges = charges
          .filter(c => otherChargeTypes.includes(c.type))
          .reduce((sum, c) => sum + getChargeAmount(c), 0);
        
        // For Farm Gate lots, cold/warehouse charges are NOT deducted from farmer
        const farmerColdCharges = csvIsFarmGate ? 0 : coldCharges;
        const totalDeductions = farmerColdCharges + hammaliGrading + advanceCharges + otherCharges;
        
        // Calculate dynamic interest (interest-only formula)
        let lotInterest = 0;
        const principal = parseFloat(lot.adjustedAmount || "0");
        const rate = parseFloat(lot.adjustedAmountRate || "0");
        const effectiveDate = lot.adjustedAmountEffectiveDate;
        if (principal > 0 && rate > 0 && effectiveDate) {
          const startDate = new Date(effectiveDate);
          const today = new Date();
          const days = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
          const years = days / 365;
          lotInterest = Math.round((principal * (Math.pow(1 + rate / 100, years) - 1)) * 100) / 100;
        }
        
        // Apply interest based on adjustment type
        const adjustmentType = lot.adjustedAmountType;
        const signedInterest = adjustmentType === "credit" ? lotInterest : -lotInterest;
        
        // Farmer total and net payable (matching edit dialog: Total - Deductions + Adjustment)
        const lotFarmerTotal = metrics.totalAmount ?? 0;
        const lotNetPayable = lotFarmerTotal - totalDeductions + signedInterest;
        
        // Farmer due per lot (prorated payment, based on net payable)
        const lotPaidRatio = entryFarmerTotal > 0 ? lotFarmerTotal / entryFarmerTotal : 0;
        const lotFarmerPaid = entryAmountPaid * lotPaidRatio;
        const lotFarmerDue = Math.max(lotNetPayable - lotFarmerPaid, 0);
        
        // Cold store charges (already includes hammali/grading)
        const coldTotal = metrics.coldStoreTotalCharges;
        const coldDue = metrics.coldStoreRemaining;
        
        // Cut type display - Bilty Cut for non-gate_cut
        const cutTypeDisplay = lot.cutType === "gate_cut" ? t("Gate Cut", "गेट कट") : t("Bilty Cut", "बिल्टी कट");
        
        rows.push([
          entry.serialNumber.toString(),
          (lotIndex + 1).toString(),
          format(new Date(entry.purchaseDate), "dd/MM/yyyy"),
          entry.farmerName,
          entry.village || "-",
          lot.coldStoreName || "-",
          lot.potatoType || "-",
          lot.quality,
          cutTypeDisplay,
          metrics.originalBags.toString(),
          metrics.actualSellableBags.toString(),
          largeBags.toString(),
          mediumBags.toString(),
          smallBags.toString(),
          metrics.remainingToSell.toString(),
          parseFloat(lotFarmerTotal.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(coldCharges.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(hammaliGrading.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(advanceCharges.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(otherCharges.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(totalDeductions.toFixed(1)).toLocaleString('en-IN'),
          lotInterest > 0 ? parseFloat(lotInterest.toFixed(1)).toLocaleString('en-IN') : "0",
          parseFloat(lotNetPayable.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(lotFarmerPaid.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(lotFarmerDue.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(coldTotal.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(coldDue.toFixed(1)).toLocaleString('en-IN'),
        ]);
      });
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    
    // Generate descriptive filename based on applied filters
    const parts = [selectedCrop === "potato" ? "potato" : "onion", "stock_entries"];
    if (filterYear) parts.push(filterYear);
    if (filterSerial) parts.push(`sr${filterSerial}`);
    if (filterFarmer) parts.push(filterFarmer.replace(/\s+/g, "_"));
    if (filterColdStore) parts.push(filterColdStore.replace(/\s+/g, "_"));
    if (filterQuality) parts.push(filterQuality);
    if (filterPaymentStatus) parts.push(filterPaymentStatus);
    if (filterUnsold) parts.push("unsold");
    parts.push(format(new Date(), "yyyyMMdd"));
    link.download = `${parts.join("_")}.csv`;
    
    link.click();
    URL.revokeObjectURL(link.href);

    handleDownloadDialogClose();
    
    toast({
      title: t("Success", "सफल"),
      description: t("CSV downloaded successfully", "CSV सफलतापूर्वक डाउनलोड हुई"),
      variant: "success",
    });
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-destructive">{t("Error loading stock entries", "स्टॉक एंट्री लोड करने में त्रुटि")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Download Dialog - Shows confirmation based on current filters */}
      <Dialog open={isDownloadDialogOpen} onOpenChange={(open) => !open && handleDownloadDialogClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Download Stock Entries", "स्टॉक प्रविष्टियाँ डाउनलोड करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              {t("Download will include entries based on current filters:", "डाउनलोड में वर्तमान फ़िल्टर के आधार पर प्रविष्टियाँ शामिल होंगी:")}
            </p>
            <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
              <p><strong>{t("Crop:", "फसल:")}</strong> {selectedCrop === "potato" ? t("Potato", "आलू") : t("Onion", "प्याज")}</p>
              <p><strong>{t("Year:", "वर्ष:")}</strong> {filterYear || t("All Years", "सभी वर्ष")}</p>
              {filterSerial && <p><strong>{t("Serial #:", "क्रमांक:")}</strong> {filterSerial}</p>}
              {filterFarmer && <p><strong>{t("Farmer:", "किसान:")}</strong> {filterFarmer}</p>}
              {filterColdStore && <p><strong>{t("Cold Store:", "कोल्ड स्टोर:")}</strong> {filterColdStore}</p>}
              {filterQuality && <p><strong>{t("Quality:", "गुणवत्ता:")}</strong> {filterQuality}</p>}
              {filterPaymentStatus && <p><strong>{t("Payment Status:", "भुगतान स्थिति:")}</strong> {filterPaymentStatus}</p>}
              {filterUnsold && <p><strong>{t("Filter:", "फ़िल्टर:")}</strong> {t("Unsold Only", "केवल बिकाउ")}</p>}
              <p className="pt-2 font-medium">{t("Total entries:", "कुल प्रविष्टियाँ:")} {filteredEntries.length}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleDownloadDialogClose} data-testid="button-stock-download-cancel">
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleDownloadCSV} disabled={filteredEntries.length === 0} data-testid="button-stock-download-csv">
              <Download className="h-4 w-4 mr-2" />
              {t("Download CSV", "CSV डाउनलोड करें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />

            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[90px]" data-testid="filter-year">
                <SelectValue placeholder={t("Year", "वर्ष")} />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterSerial} onValueChange={setFilterSerial}>
              <SelectTrigger className="w-[100px]" data-testid="filter-serial">
                <SelectValue placeholder={t("Serial #", "क्रमांक")} />
              </SelectTrigger>
              <SelectContent>
                {serialNumbers.map((num) => (
                  <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover open={farmerPopoverOpen} onOpenChange={setFarmerPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={farmerPopoverOpen}
                  className={cn(
                    "w-[160px] justify-between h-9 font-normal",
                    !filterFarmer && "text-muted-foreground"
                  )}
                  data-testid="filter-farmer"
                >
                  <span className="truncate">
                    {filterFarmer || t("Farmer", "किसान")}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0">
                <Command>
                  <CommandInput placeholder={t("Search farmer...", "किसान खोजें...")} />
                  <CommandList>
                    <CommandEmpty>{t("No farmer found.", "कोई किसान नहीं मिला।")}</CommandEmpty>
                    <CommandGroup>
                      {farmerOptions.map((farmer) => (
                        <CommandItem
                          key={farmer.name}
                          value={farmer.name}
                          onSelect={(currentValue) => {
                            setFilterFarmer(currentValue === filterFarmer ? "" : currentValue);
                            setFarmerPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${filterFarmer === farmer.name ? "opacity-100" : "opacity-0"}`}
                          />
                          <div className="flex flex-col flex-1">
                            <span className="font-medium">{farmer.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {farmer.village || ""}
                              {farmer.village && farmer.contact && " • "}
                              {farmer.contact || ""}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Select value={filterPaymentStatus} onValueChange={setFilterPaymentStatus}>
              <SelectTrigger className="w-[120px]" data-testid="filter-payment-status">
                <SelectValue placeholder={t("Payment", "भुगतान")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">{t("Due", "बाकी")}</SelectItem>
                <SelectItem value="paid">{t("Paid", "भुगतान हो गया")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterQuality} onValueChange={setFilterQuality}>
              <SelectTrigger className="w-[120px]" data-testid="filter-quality">
                <SelectValue placeholder={t("Quality", "गुणवत्ता")} />
              </SelectTrigger>
              <SelectContent>
                {QUALITY_OPTIONS.map((quality) => (
                  <SelectItem key={quality} value={quality}>
                    {quality}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterColdStore} onValueChange={setFilterColdStore}>
              <SelectTrigger className="w-[140px]" data-testid="filter-cold-store">
                <SelectValue placeholder={t("Cold Store", "कोल्ड स्टोर")} />
              </SelectTrigger>
              <SelectContent>
                {coldStores.map((store) => (
                  <SelectItem key={store} value={store}>
                    {store}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={filterUnsold ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterUnsold(!filterUnsold)}
              data-testid="filter-unsold"
            >
              {t("Unsold Only", "केवल बिना बिके")}
            </Button>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4 mr-1" />
                {t("Clear", "साफ़ करें")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="card-bags-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Boxes className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium">{t("Bags", "बैग")}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
                <p className="text-xs font-bold" data-testid="text-bags-total">{summaryTotals.bagsTotal.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Remaining (Unsold)", "बचे (अनबिके)")}</span>
                <p className="text-xs font-bold text-amber-600" data-testid="text-bags-remaining">{summaryTotals.bagsRemaining.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-cost-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <IndianRupee className="h-4 w-4 text-orange-600" />
              <span className="text-xs font-medium">{t("Total Cost", "कुल लागत")}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total Payable", "कुल देय")}</span>
                <p className="text-xs font-bold" data-testid="text-cost-payable">₹{summaryTotals.totalPayable.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Total Deductions", "कुल कटौती")}</span>
                <p className="text-xs font-bold text-red-600" data-testid="text-cost-deductions">₹{summaryTotals.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-farmer-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium">{t("Farmer", "किसान")}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
                <p className="text-xs font-bold" data-testid="text-farmer-total">₹{summaryTotals.farmerTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Due", "बाकी")}</span>
                <p className="text-xs font-bold text-red-600" data-testid="text-farmer-due">₹{summaryTotals.farmerDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-cold-store-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-medium">{t("Cold Store", "कोल्ड स्टोर")}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
                <p className="text-xs font-bold" data-testid="text-cold-total">₹{summaryTotals.coldStoreTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Due", "बाकी")}</span>
                <p className="text-xs font-bold text-red-600" data-testid="text-cold-due">₹{summaryTotals.coldStoreDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium text-muted-foreground">{t("No stock entries found", "कोई स्टॉक एंट्री नहीं मिली")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilters ? t("Try adjusting your filters", "अपने फ़िल्टर समायोजित करने का प्रयास करें") : t("Create your first stock entry to get started", "शुरू करने के लिए अपनी पहली स्टॉक एंट्री बनाएं")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => {
            const lotsWithMetrics = entry.lots.map(lot => ({
              lot,
              metrics: computeLotMetrics(lot),
            }));
            
            const entryStatus = computeEntryStatusFromMetrics(lotsWithMetrics);
            const potatoTypes = Array.from(new Set(entry.lots.map(lot => lot.potatoType)));
            
            let totalOriginal = 0;
            let totalWastage = 0;
            let totalActual = 0;
            let totalRemaining = 0;
            let entryTotalAmount = 0;
            let entryAdjustment = 0;
            let entryDeductions = 0;
            let entryColdStoreTotalCharges = 0;
            let entryColdStorePaid = 0;
            
            lotsWithMetrics.forEach(({ metrics }) => {
              totalOriginal += metrics.originalBags;
              totalWastage += metrics.wastageBags;
              totalActual += metrics.actualSellableBags;
              totalRemaining += metrics.remainingToSell;
              if (metrics.totalAmount !== null) {
                entryTotalAmount += metrics.totalAmount;
              }
              if (metrics.adjustedAmount > 0 && metrics.adjustedAmountType) {
                if (metrics.adjustedAmountType === "debit") {
                  entryAdjustment -= metrics.adjustedAmount;
                } else if (metrics.adjustedAmountType === "credit") {
                  entryAdjustment += metrics.adjustedAmount;
                }
              }
              entryDeductions += metrics.totalDeductions;
              entryColdStoreTotalCharges += metrics.coldStoreTotalCharges;
              entryColdStorePaid += metrics.coldStorePaid;
            });
            
            const farmerAmountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
            // Net Payable = Total Cost - Deductions + Adjustment (matches edit dialog formula)
            const adjustedEntryTotal = entryTotalAmount - entryDeductions + entryAdjustment;
            const farmerRemainingDue = Math.max(adjustedEntryTotal - farmerAmountPaid, 0);
            const coldStoreRemainingDue = entryColdStoreTotalCharges - entryColdStorePaid;
            
            const isFarmerPaid = farmerRemainingDue <= 0 && entryTotalAmount > 0;
            const isColdStorePaid = coldStoreRemainingDue <= 0 && entryColdStoreTotalCharges > 0;

            return (
              <Card key={entry.id} className="border border-gray-300 dark:border-gray-600 shadow-sm hover-elevate" data-testid={`card-entry-${entry.id}`}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <div className="flex items-center gap-1" data-testid={`text-serial-${entry.id}`}>
                          <Package className="h-4 w-4" style={{ color: '#52a7ff' }} />
                          <span className="font-semibold text-base">{t("Sr No:", "क्र.:")} {entry.serialNumber} -</span>
                        </div>
                        <span className="font-semibold text-base" data-testid={`text-farmer-${entry.id}`}>
                          {entry.farmerName}
                        </span>
                        
                        {potatoTypes.map((type, i) => (
                          <Badge 
                            key={i} 
                            className="text-[11px] px-2 py-0.5 font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0"
                          >
                            {type}
                          </Badge>
                        ))}
                        
                        {(farmerRemainingDue > 0 || coldStoreRemainingDue > 0) && (
                          <Badge 
                            variant="outline"
                            className="text-[11px] px-2 py-0.5 font-medium border-orange-400 text-orange-600 dark:border-orange-500 dark:text-orange-400 gap-1"
                          >
                            <Clock className="h-3 w-3" />
                            {t("Due", "बाकी")}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                        {entry.farmerContact && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{entry.farmerContact}</span>
                          </div>
                        )}
                        {entry.village && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{entry.village}, {entry.tehsil ? `${entry.tehsil}, ` : ""}{entry.district}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] mt-2">
                        {(entryTotalAmount > 0 || entryAdjustment !== 0) && (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-muted-foreground whitespace-nowrap">{t("Farmer Total", "किसान कुल")}</span>
                            <span className="font-medium whitespace-nowrap">₹ {adjustedEntryTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            <span className="text-muted-foreground">|</span>
                            <span className="text-muted-foreground whitespace-nowrap">{t("Due", "बाकी")}</span>
                            <span className={`font-medium whitespace-nowrap ${farmerRemainingDue > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
                              ₹ {farmerRemainingDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                            </span>
                          </span>
                        )}
                        {entryColdStoreTotalCharges > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-muted-foreground whitespace-nowrap">{t("Cold Total", "कोल्ड कुल")}</span>
                            <span className="font-medium whitespace-nowrap">₹ {entryColdStoreTotalCharges.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            <span className="text-muted-foreground">|</span>
                            <span className="text-muted-foreground whitespace-nowrap">{t("Due", "बाकी")}</span>
                            <span className={`font-medium whitespace-nowrap ${coldStoreRemainingDue > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
                              ₹ {coldStoreRemainingDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 gap-1.5 justify-start"
                        onClick={() => setEditEntry(entry)}
                        data-testid={`button-edit-${entry.id}`}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        {t("Edit", "संपादित")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 gap-1.5 justify-start"
                        onClick={() => setPrintEntry(entry)}
                        data-testid={`button-print-${entry.id}`}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {t("Print", "प्रिंट")}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0 pb-3 px-4">
                  <div className="space-y-2">
                    {lotsWithMetrics.map(({ lot, metrics }, lotIndex) => {
                      const lotColdTotal = metrics.coldStoreTotalCharges ?? 0;
                      const lotColdDue = metrics.coldStoreRemaining ?? 0;
                      
                      return (
                        <div 
                          key={lot.id} 
                          className="py-2 px-3 bg-muted/20 rounded-md border border-border/30"
                          data-testid={`lot-card-${entry.id}-${lotIndex}`}
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]">
                            <span className="font-semibold text-foreground">{t("Lot", "लॉट")} #{lotIndex + 1}</span>
                            <div className="flex items-center gap-1.5">
                              <Snowflake className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium">{lot.coldStoreName}</span>
                            </div>
                            <Badge className="text-[11px] px-2 py-0.5 font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0">
                              {lot.potatoType}
                            </Badge>
                            <Badge className={`text-[11px] px-2 py-0.5 font-medium border-0 ${
                              lot.quality === "Good" 
                                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                : lot.quality === "Medium"
                                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            }`}>
                              {lot.quality}
                            </Badge>
                            {lot.size && (
                              <Badge className="text-[11px] px-2 py-0.5 font-medium bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-0">
                                {lot.size}
                              </Badge>
                            )}
                            <Badge className={`text-[11px] px-2 py-0.5 font-medium border-0 ${
                              lot.cutType === "bilty_cut"
                                ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
                                : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                            }`}>
                              {lot.cutType === "bilty_cut" ? t("Bilty Cut", "बिल्टी कट") : t("Gate Cut", "गेट कट")}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] mt-1">
                            <div>
                              <span className="text-muted-foreground">{t("Original:", "मूल:")}</span>{" "}
                              <span className="font-medium">{metrics.originalBags} {t("bags", "बोरी")}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t("Actual:", "वास्तविक:")}</span>{" "}
                              {(() => {
                                const sellableBreakdowns = lot.bagBreakdowns?.filter((bd: any) => bd.size !== "Wastage") || [];
                                if (sellableBreakdowns.length > 0) {
                                  return sellableBreakdowns.map((bd: any, idx: number) => {
                                    const weight = bd.weight ? parseFloat(bd.weight) : 0;
                                    const netWeight = weight > 0 ? weight - bd.numberOfBags : 0;
                                    const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
                                    return (
                                      <span key={idx}>
                                        {idx > 0 && ", "}
                                        <span className="font-medium">{bd.size}</span>
                                        <span className="text-muted-foreground"> - </span>
                                        <span className="font-semibold text-green-600 dark:text-green-400">{bd.remainingBags ?? bd.numberOfBags}</span>
                                        <span className="text-muted-foreground">/{bd.numberOfBags}</span>
                                        {weight > 0 && (
                                          <span className="text-muted-foreground">
                                            , {weight.toFixed(0)}kg, {netWeight.toFixed(0)}kg, ₹{parseFloat((Math.trunc(price * 100) / 100).toFixed(2))}/kg
                                          </span>
                                        )}
                                      </span>
                                    );
                                  });
                                } else {
                                  return (
                                    <>
                                      <span className="font-semibold text-green-600 dark:text-green-400">{metrics.remainingToSell}</span>
                                      <span className="text-muted-foreground">/{metrics.actualSellableBags}</span>
                                    </>
                                  );
                                }
                              })()}
                            </div>
                          </div>
                          {lotColdTotal > 0 && (
                            <span className="inline-flex items-center gap-1 text-[13px] mt-1">
                              <span className="text-muted-foreground whitespace-nowrap">{t("Cold Total", "कोल्ड कुल")}</span>
                              <span className="font-medium whitespace-nowrap">₹ {lotColdTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                              <span className="text-muted-foreground">|</span>
                              <span className="text-muted-foreground whitespace-nowrap">{t("Due", "बाकी")}</span>
                              <span className={`font-medium whitespace-nowrap ${lotColdDue > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
                                ₹ {lotColdDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                              </span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editEntry && (
        <StockEntryEditDialog
          entry={editEntry}
          open={!!editEntry}
          onOpenChange={(open: boolean) => !open && setEditEntry(null)}
        />
      )}

      {printEntry && (
        <BillPrintDialog
          entry={printEntry}
          open={!!printEntry}
          onOpenChange={(open: boolean) => !open && setPrintEntry(null)}
        />
      )}
    </div>
  );
}
