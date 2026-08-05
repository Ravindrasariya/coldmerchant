import { useState, useMemo } from "react";
import { calculateInterestOnly } from "@/lib/interest-utils";
import { computeNetWeight } from "@shared/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Filter, Edit, Printer, Package, X, Phone, MapPin, Calendar, Clock, Snowflake, Download, FileDown, Check, ChevronsUpDown, Share2, ChevronDown, Paperclip, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { QUALITY_OPTIONS } from "@shared/schema";
import { MonthFilter } from "@/components/ui/month-filter";
import { DateFilter } from "@/components/ui/date-filter";
import { StockEntryEditDialog } from "./stock-entry-edit-dialog";
import { BillPrintDialog } from "./bill-print-dialog";
import { LoadingNakalDialog } from "./loading-nakal";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";

interface StockEntryWithLots {
  id: number;
  uniqueId: string | null;
  serialNumber: number;
  farmerId: number | null;
  purchaseDate: string;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  place: string | null;
  aadhatDbId: number | null;
  aadhatName: string | null;
  paymentStatus: string;
  amountPaid: string | null;
  remarks: string | null;
  attachmentImage: string | null;
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
    marka: string | null;
    pricePerKg: string | null;
    totalWeight: string | null;
    coldStoreChargesPerBag: string | null;
    hammaliGradingCharges: string | null;
    coldStoreDbId: number | null;
    charges: Array<{ type: string; amount: number | string; coldStoreName?: string; coldStoreDbId?: number | null }> | null;
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
    earlyPayPercent: string | null;
    earlyPayAmount: string | null;
    totalCogs: string | null;
    totalCharges: string | null;
    netPayable: string | null;
    remarks: string | null;
    bagBreakdowns: Array<{
      id: number;
      size: string;
      marka: string | null;
      numberOfBags: number;
      remainingBags: number | null;
      weight: string | null;
      pricePerKg: string | null;
      totalAmount: string | null;
    }>;
  }>;
}

function getColdStoreNameFromCharges(charges: StockEntryWithLots['lots'][0]['charges']): string | null {
  const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
  const csCharge = (charges || []).find(c => c && coldStoreTypes.includes(c.type) && c.coldStoreName);
  return csCharge?.coldStoreName || null;
}

function computeLotMetrics(lot: StockEntryWithLots['lots'][0]) {
  const wastageBags = lot.bagBreakdowns
    .filter(bd => bd.size === "Wastage")
    .reduce((sum, bd) => sum + bd.numberOfBags, 0);
  
  const actualSellableBags = lot.originalBags - wastageBags;
  // Derive remaining/sold from the persistent soldBags column (single source of
  // truth after backfill) instead of the stored remainingBags, which can drift
  // on legacy data.
  const sellableBreakdownsAll = lot.bagBreakdowns.filter(bd => bd.size !== "Wastage");
  const lotSoldFromBreakdowns = sellableBreakdownsAll.length > 0
    ? sellableBreakdownsAll.reduce((s, bd) => s + ((bd as any).soldBags ?? 0), 0)
    : ((lot as any).soldBags ?? 0);
  const soldBags = Math.min(actualSellableBags, lotSoldFromBreakdowns);
  const remainingToSell = Math.max(0, actualSellableBags - soldBags);
  
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
        const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
        if (netWeight > 0 && price > 0) {
          totalAmount = (totalAmount ?? 0) + (netWeight * price);
        }
      }
    });
  } else {
    // Fallback to lot-level data when no breakdown weight/price data exists
    const lotTotalWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
    const price = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
    const netWeight = computeNetWeight(lotTotalWeight, lot.originalBags, lot.place);
    totalWeight = lotTotalWeight;
    if (netWeight > 0 && price > 0) {
      totalAmount = netWeight * price;
    }
  }
  
  const sellableBreakdowns = lot.bagBreakdowns.filter(bd => bd.size !== "Wastage");
  const wastageBreakdowns = lot.bagBreakdowns.filter(bd => bd.size === "Wastage");

  // Lot net weight exactly as shown in the stock table: per-breakdown
  // computeNetWeight over sellable breakdowns; fallback to lot-level totals
  // when breakdowns carry no weight data.
  let netWeight = sellableBreakdowns.reduce((sum, bd) => {
    const w = bd.weight ? parseFloat(bd.weight) : 0;
    return sum + computeNetWeight(w, bd.numberOfBags, lot.place);
  }, 0);
  if (netWeight <= 0) {
    const lotTotalWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
    netWeight = computeNetWeight(lotTotalWeight, lot.originalBags, lot.place);
  }
  // Remaining weight is proportional to remaining sellable bags (sold weight
  // is not tracked per sale).
  const netWeightRemaining = actualSellableBags > 0
    ? netWeight * (remainingToSell / actualSellableBags)
    : 0;
  
  // Calculate cold store charges from Cold Charges/Ware House Charges in charges array only
  const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
  const coldStoreTotalCharges = (lot.charges || [])
    .filter(c => c && coldStoreTypes.includes(c.type))
    .reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);

  // Extra Charges to Buyer: buyer-side cost only, never deducted from farmer
  const extraBuyerCharges = (lot.charges || [])
    .filter(c => c && c.type === "Extra Charges to Buyer")
    .reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);

  const coldStorePaid = lot.coldStorageChargesPaid ? parseFloat(lot.coldStorageChargesPaid) : 0;
  const coldStoreRemaining = coldStoreTotalCharges - coldStorePaid;
  
  const rawAdjustedAmount = lot.adjustedAmount !== null ? parseFloat(lot.adjustedAmount) : 0;
  const adjustedAmountType = lot.adjustedAmountType;
  
  const adjustedAmountRate = (lot as any).adjustedAmountRate ? parseFloat((lot as any).adjustedAmountRate) : 0;
  const adjustedAmountEffectiveDate = (lot as any).adjustedAmountEffectiveDate;
  
  const { interest: finalAdjustment } = calculateInterestOnly(rawAdjustedAmount, adjustedAmountRate, adjustedAmountEffectiveDate || null);
  
  // Calculate total deductions: hammali/grading + dynamic charges
  // For Farm Gate lots, exclude Cold Charges and Ware House Charges from farmer deductions
  // (merchant pays cold store separately, not deducted from farmer)
  // "Extra Charges to Buyer" is buyer-side only — never deducted from farmer (any place type)
  const isFarmGate = lot.place === "farm_gate";
  const farmerDeductionTypes = ["Cold Charges", "Ware House Charges"];
  const hammaliGradingCharges = lot.hammaliGradingCharges ? parseFloat(lot.hammaliGradingCharges) : 0;
  const dynamicCharges = (lot.charges || [])
    .filter(c => c.type !== "Extra Charges to Buyer" && !(isFarmGate && farmerDeductionTypes.includes(c.type)))
    .reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);
  const totalDeductions = hammaliGradingCharges + dynamicCharges;
  
  return {
    originalBags: lot.originalBags,
    wastageBags,
    actualSellableBags,
    remainingToSell,
    soldBags,
    totalWeight,
    netWeight,
    netWeightRemaining,
    totalAmount,
    pricePerKg: lot.pricePerKg ? parseFloat(lot.pricePerKg) : null,
    coldStoreTotalCharges,
    coldStorePaid,
    coldStoreRemaining,
    extraBuyerCharges,
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
  selectedCrop?: "all" | "potato" | "onion" | "garlic";
}

interface MerchantInfo {
  id: number;
  name: string;
  address: string | null;
  contactNumber: string | null;
}

export function StockRegisterCard({ downloadDialogOpen = false, onDownloadDialogClose, selectedCrop = "potato" }: StockRegisterCardProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: merchantInfo } = useQuery<MerchantInfo>({
    queryKey: ["/api/merchants", user?.merchantId],
    enabled: !!user?.merchantId,
  });
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState<string>(currentYear.toString());
  const [filterMonths, setFilterMonths] = useState<number[]>([new Date().getMonth()]);
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [filterSerial, setFilterSerial] = useState<string>("");
  const [serialPopoverOpen, setSerialPopoverOpen] = useState(false);
  const [filterFarmer, setFilterFarmer] = useState<string>("");
  const [filterFarmerId, setFilterFarmerId] = useState<number | null>(null);
  const [filterAadhat, setFilterAadhat] = useState<string>("");
  const [filterAadhatId, setFilterAadhatId] = useState<number | null>(null);
  const [aadhatPopoverOpen, setAadhatPopoverOpen] = useState(false);
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterQuality, setFilterQuality] = useState<string>("");
  const [filterUnsold, setFilterUnsold] = useState<boolean>(false);
  const [filterColdStore, setFilterColdStore] = useState<string>("");
  const [farmerPopoverOpen, setFarmerPopoverOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<StockEntryWithLots | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<StockEntryWithLots | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/stock-entries/${id}`);
      return res.json();
    },
    onSuccess: () => {
      // Mirror invalidations from stock-entry-edit-dialog so every dependent
      // view refreshes when an entry disappears.
      // Refetch all transaction queries (list + individual IDs) so challan/receipt
      // dialogs that are currently closed also get fresh data on next open.
      queryClient.refetchQueries({ queryKey: ["/api/transactions"], type: "all" });
      const keys = [
        ["/api/stock-entries"],
        ["/api/stock-entries/next-serial"],
        ["/api/inventory/unsold"],
        ["/api/buyers"],
        ["/api/cash/farmers"],
        ["/api/farmers"],
        ["/api/dashboard/timeseries"],
        ["/api/books/balance-sheet"],
        ["/api/books/profit-loss"],
        ["/api/cold-store-ledger"],
        ["/api/cold-stores/search"],
        ["/api/cash/cold-stores"],
        ["/api/cash/entries"],
        ["/api/cash/aadhats-with-dues"],
        ["/api/cash/aadhat-pending-entries"],
        ["/api/cash/parties"],
        ["/api/cash/seed-farmers"],
        ["/api/cash/seed-suppliers"],
        ["/api/aadhats"],
      ];
      keys.forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      toast({ title: t("Entry deleted", "एंट्री हटा दी गई") });
      setDeleteEntry(null);
    },
    onError: (err: Error) => {
      toast({ title: t("Could not delete", "हटाया नहीं जा सका"), description: err.message, variant: "destructive" });
    },
  });
  const [printEntry, setPrintEntry] = useState<StockEntryWithLots | null>(null);
  const [billAction, setBillAction] = useState<"print" | "share" | undefined>(undefined);
  const [imageViewEntryId, setImageViewEntryId] = useState<number | null>(null);
  const [imageViewEntryLabel, setImageViewEntryLabel] = useState<string>("");
  const [showNakal, setShowNakal] = useState(false);

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

  const { data: coldStoreLedger } = useQuery<Array<{ id: number; coldStoreId: string | null; name: string }>>({
    queryKey: ["/api/cold-store-ledger"],
  });

  const coldStoreIdMap = useMemo(() => {
    const map = new Map<number, string>();
    if (coldStoreLedger) {
      for (const cs of coldStoreLedger) {
        if (cs.coldStoreId) map.set(cs.id, cs.coldStoreId);
      }
    }
    return map;
  }, [coldStoreLedger]);

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
        if (lot.place === "farm_gate") {
          stores.add("Farm Gate");
          const csName = getColdStoreNameFromCharges(lot.charges);
          if (csName) stores.add(csName);
        } else if (lot.place === "mandi") {
          stores.add("Mandi");
        } else if (lot.coldStoreName) {
          stores.add(lot.coldStoreName);
        }
      });
    });
    return Array.from(stores);
  }, [entries]);

  const serialNumbers = useMemo(() => {
    if (!entries) return [];
    return Array.from(new Set(entries.map(e => e.serialNumber))).sort((a, b) => a - b);
  }, [entries]);

  const farmerOptions = useMemo(() => {
    if (!entries) return [];
    const farmerMap = new Map<number, { id: number; name: string; village: string | null; contact: string | null }>();
    entries.forEach(entry => {
      if (entry.farmerId && !farmerMap.has(entry.farmerId)) {
        farmerMap.set(entry.farmerId, {
          id: entry.farmerId,
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

  const aadhatOptions = useMemo(() => {
    if (!entries) return [];
    const aadhatMap = new Map<number, { id: number; name: string }>();
    entries.forEach(entry => {
      if (entry.aadhatDbId && entry.aadhatName && !aadhatMap.has(entry.aadhatDbId)) {
        aadhatMap.set(entry.aadhatDbId, { id: entry.aadhatDbId, name: entry.aadhatName });
      }
    });
    return Array.from(aadhatMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    
    return entries.filter((entry) => {
      const entryDate = new Date(entry.purchaseDate);

      // Filter by year
      if (filterYear) {
        if (entryDate.getFullYear().toString() !== filterYear) return false;
      }

      // Filter by month
      if (filterMonths.length > 0 && filterMonths.length < 12) {
        if (!filterMonths.includes(entryDate.getMonth())) return false;
      }

      // Filter by day
      if (filterDay !== null) {
        if (entryDate.getDate() !== filterDay) return false;
      }

      // Filter by crop - entry must have at least one lot with matching crop
      if (selectedCrop !== "all") {
        const hasCropMatch = entry.lots.some(lot => (lot.crop || "potato") === selectedCrop);
        if (!hasCropMatch) return false;
      }

      if (filterSerial && entry.serialNumber.toString() !== filterSerial) {
        return false;
      }

      if (filterFarmerId != null && entry.farmerId !== filterFarmerId) {
        return false;
      }

      if (filterAadhatId != null && entry.aadhatDbId !== filterAadhatId) {
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
        const hasColdStore = entry.lots.some(lot => {
          if (filterColdStore === "Farm Gate") return lot.place === "farm_gate";
          if (filterColdStore === "Mandi") return lot.place === "mandi";
          if (lot.coldStoreName === filterColdStore) return true;
          if (lot.place === "farm_gate") {
            const csName = getColdStoreNameFromCharges(lot.charges);
            if (csName === filterColdStore) return true;
          }
          return false;
        });
        if (!hasColdStore) return false;
      }

      return true;
    });
  }, [entries, selectedCrop, filterYear, filterMonths, filterDay, filterSerial, filterFarmerId, filterAadhatId, filterPaymentStatus, filterQuality, filterUnsold, filterColdStore]);

  const currentMonth = new Date().getMonth();
  const isDefaultMonths = filterMonths.length === 1 && filterMonths[0] === currentMonth;

  const clearFilters = () => {
    setFilterYear(currentYear.toString());
    setFilterMonths([new Date().getMonth()]);
    setFilterDay(null);
    setFilterSerial("");
    setFilterFarmer("");
    setFilterFarmerId(null);
    setFilterAadhat("");
    setFilterAadhatId(null);
    setFilterPaymentStatus("");
    setFilterQuality("");
    setFilterUnsold(false);
    setFilterColdStore("");
  };

  const hasActiveFilters = filterSerial || filterFarmer || filterAadhat || filterPaymentStatus || filterQuality || filterUnsold || filterColdStore || (filterYear && filterYear !== currentYear.toString()) || !isDefaultMonths || filterDay !== null;

  const lotMetricsMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof computeLotMetrics>>();
    if (!entries) return map;
    entries.forEach(entry => {
      entry.lots.forEach(lot => {
        if (!map.has(lot.id)) {
          map.set(lot.id, computeLotMetrics(lot));
        }
      });
    });
    return map;
  }, [entries]);

  const getLotMetrics = (lot: StockEntryWithLots['lots'][0]) => {
    return lotMetricsMap.get(lot.id) || computeLotMetrics(lot);
  };

  // Compute summary totals from filtered entries
  const summaryTotals = useMemo(() => {
    let bagsTotal = 0;
    let bagsRemaining = 0;
    let netWeightTotal = 0;
    let netWeightRemaining = 0;
    let farmerTotal = 0;
    let farmerDue = 0;
    let coldStoreTotal = 0;
    let coldStoreDue = 0;
    let totalPayable = 0;
    let totalDeductions = 0;
    let mandiTotal = 0;
    let mandiDue = 0;
    let buyerExtraTotal = 0;

    filteredEntries.forEach(entry => {
      let entryNetPayable = 0;
      let entryPayable = 0;
      let entryColdStoreTotalCharges = 0;
      let entryColdStorePaid = 0;
      let entryDeductions = 0;
      const isMandi = (entry.place || entry.lots[0]?.place) === "mandi";
      let entryMandiNetPayable = 0;

      entry.lots.forEach(lot => {
        const metrics = getLotMetrics(lot);
        bagsTotal += metrics.actualSellableBags;
        bagsRemaining += metrics.remainingToSell;
        netWeightTotal += metrics.netWeight;
        netWeightRemaining += metrics.netWeightRemaining;
        buyerExtraTotal += metrics.extraBuyerCharges;

        const storedNetPayable = lot.netPayable ? parseFloat(lot.netPayable) : 0;
        const storedTotalCharges = lot.totalCharges ? parseFloat(lot.totalCharges) : 0;
        entryNetPayable += storedNetPayable;

        const cog = metrics.totalAmount ?? 0;

        // Effective place: fall back to entry.place for any legacy rows that
        // may have a missing lot.place, so totals always bucket correctly.
        const effectivePlace = lot.place ?? entry.place;

        // Per-place Payable / Deductions for the Total Cost summary card.
        // Buyer Extra is added to Payable for ALL place types (and never to Deductions).
        if (effectivePlace === "mandi") {
          // Mandi: COG + mandi charges (mandi commission + aadhat + hammali + Mandi Extra)
          // are real outflows to the aadhtiya — flow into Payable, not Deductions.
          // Use storedNetPayable when present (= COG + mandi charges); fall back to COG.
          const mandiPayable = storedNetPayable > 0 ? storedNetPayable : cog;
          entryPayable += mandiPayable + metrics.coldStoreTotalCharges + metrics.extraBuyerCharges;
        } else if (effectivePlace === "farm_gate") {
          // Farm Gate: cold/WH are merchant-paid storage costs added on top of COG.
          // Deductions (lot.totalCharges) already excludes cold/WH and Buyer Extra.
          entryPayable += cog + metrics.coldStoreTotalCharges + metrics.extraBuyerCharges;
          entryDeductions += storedTotalCharges;
        } else {
          // Cold Store: cold/WH are farmer deductions and stay in Deductions only —
          // do not add cold/WH to Payable (would double count with Deductions).
          entryPayable += cog + metrics.extraBuyerCharges;
          entryDeductions += storedTotalCharges;
        }

        entryColdStoreTotalCharges += metrics.coldStoreTotalCharges;
        entryColdStorePaid += metrics.coldStorePaid;
        if (effectivePlace === "mandi") {
          entryMandiNetPayable += storedNetPayable;
        }
      });

      const amountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
      if (!isMandi) {
        farmerTotal += entryNetPayable;
        farmerDue += Math.max(entryNetPayable - amountPaid, 0);
      }

      totalPayable += entryPayable;
      totalDeductions += entryDeductions;
      coldStoreTotal += entryColdStoreTotalCharges;
      coldStoreDue += Math.max(entryColdStoreTotalCharges - entryColdStorePaid, 0);

      if (isMandi) {
        mandiTotal += entryMandiNetPayable;
        mandiDue += Math.max(entryMandiNetPayable - amountPaid, 0);
      }
    });

    return { bagsTotal, bagsRemaining, netWeightTotal, netWeightRemaining, farmerTotal, farmerDue, coldStoreTotal, coldStoreDue, totalPayable, totalDeductions, mandiTotal, mandiDue, buyerExtraTotal };
  }, [filteredEntries, lotMetricsMap]);

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
      t("Place", "स्थान"),
      t("Farmer Name", "किसान का नाम"),
      t("Village", "गाँव"),
      t("Cold Store", "कोल्ड स्टोर"),
      t("Cold Store ID", "कोल्ड स्टोर आईडी"),
      t("Potato Type", "आलू का प्रकार"),
      t("Quality", "गुणवत्ता"),
      t("Cut Type", "कट प्रकार"),
      t("Original Bags", "मूल बैग"),
      t("Marka", "मार्का"),
      t("Actual Bags", "वास्तविक बैग"),
      t("Large", "बड़ा"),
      t("Medium", "मध्यम"),
      t("Small", "छोटा"),
      t("Remaining Bags", "बचे बैग"),
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
      t("Total COGS ₹", "कुल लागत ₹"),
    ];

    const rows: string[][] = [];
    filteredForDownload.forEach(entry => {
      // Calculate entry-level totals for proration
      const entryLotMetrics = entry.lots.map(lot => getLotMetrics(lot));
      const entryFarmerTotal = entryLotMetrics.reduce((sum, m) => sum + (m.totalAmount ?? 0), 0);
      const entryAdjustment = entryLotMetrics.reduce((sum, m) => {
        if (m.adjustedAmount > 0 && m.adjustedAmountType) {
          return sum + (m.adjustedAmountType === "debit" ? -m.adjustedAmount : m.adjustedAmount);
        }
        return sum;
      }, 0);
      const entryAmountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
      
      entry.lots.forEach((lot, lotIndex) => {
        const metrics = getLotMetrics(lot);
        
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
        
        const principal = parseFloat(lot.adjustedAmount || "0");
        const rate = parseFloat(lot.adjustedAmountRate || "0");
        const { interest: lotInterest } = calculateInterestOnly(principal, rate, lot.adjustedAmountEffectiveDate || null);
        
        // Apply interest based on adjustment type
        const adjustmentType = lot.adjustedAmountType;
        const signedInterest = adjustmentType === "credit" ? lotInterest : -lotInterest;
        
        // Farmer total and net payable - use stored netPayable from database
        const lotFarmerTotal = metrics.totalAmount ?? 0;
        const lotNetPayable = lot.netPayable ? parseFloat(lot.netPayable) : (lotFarmerTotal - totalDeductions + signedInterest);
        
        // Farmer due per lot (prorated payment, based on net payable)
        const lotPaidRatio = entryFarmerTotal > 0 ? lotFarmerTotal / entryFarmerTotal : 0;
        const lotFarmerPaid = entryAmountPaid * lotPaidRatio;
        const lotFarmerDue = Math.max(lotNetPayable - lotFarmerPaid, 0);
        
        // Cold store charges (already includes hammali/grading)
        const coldTotal = metrics.coldStoreTotalCharges;
        const coldDue = metrics.coldStoreRemaining;
        
        // Cut type display - Bilty Cut for non-gate_cut
        const cutTypeDisplay = lot.cutType === "gate_cut" ? t("Gate Cut", "गेट कट") : t("Bilty Cut", "बिल्टी कट");
        
        const placeLabel = (entry.place || lot.place || "cold_store") === "farm_gate" ? "Farm Gate" : (entry.place || lot.place || "cold_store") === "mandi" ? "Mandi" : "Cold Store";
        rows.push([
          entry.serialNumber.toString(),
          (lotIndex + 1).toString(),
          format(new Date(`${entry.purchaseDate}T00:00:00`), "dd/MM/yyyy"),
          placeLabel,
          entry.farmerName,
          entry.village || "-",
          (() => {
            if (lot.place === "farm_gate") {
              const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
              const names = new Set<string>();
              for (const c of (lot.charges || [])) {
                if (coldStoreTypes.includes(c.type) && c.coldStoreName) names.add(c.coldStoreName);
              }
              return names.size > 0 ? Array.from(names).join(", ") : "Farm Gate";
            }
            return lot.coldStoreName || "-";
          })(),
          (() => {
            if (lot.place === "farm_gate") {
              const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
              const codes = new Set<string>();
              for (const c of (lot.charges || [])) {
                if (coldStoreTypes.includes(c.type) && c.coldStoreDbId) {
                  const code = coldStoreIdMap.get(c.coldStoreDbId);
                  if (code) codes.add(code);
                }
              }
              return codes.size > 0 ? Array.from(codes).join(", ") : "-";
            }
            return lot.coldStoreDbId ? (coldStoreIdMap.get(lot.coldStoreDbId) || "-") : "-";
          })(),
          lot.potatoType || "",
          lot.quality,
          cutTypeDisplay,
          metrics.originalBags.toString(),
          (() => {
            // Combine lot-level and per-breakdown Marka values. Export the
            // single value when they agree, or join distinct values when they
            // differ (realistic after edits to individual breakdown rows).
            const distinct = Array.from(new Set(
              [lot.marka, ...(lot.bagBreakdowns || []).map(bd => bd.marka)]
                .map(m => (m || "").trim())
                .filter(m => m.length > 0)
            ));
            return distinct.join(" | ");
          })(),
          metrics.actualSellableBags.toString(),
          largeBags.toString(),
          mediumBags.toString(),
          smallBags.toString(),
          metrics.remainingToSell.toString(),
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
          parseFloat(parseFloat(lot.totalCogs || "0").toFixed(1)).toLocaleString('en-IN'),
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
    const parts = [selectedCrop, "stock_entries"];
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

  const nakalDateLabel = (() => {
    let date: Date;
    if (filterDay !== null) {
      const monthIdx = filterMonths.length > 0 ? filterMonths[0] : new Date().getMonth();
      date = new Date(parseInt(filterYear), monthIdx, filterDay);
    } else {
      date = new Date();
    }
    const dayName = format(date, "EEEE");
    const dd = format(date, "d");
    const monthName = format(date, "MMMM");
    const yyyy = format(date, "yyyy");
    const compact = `${format(date, "d")}-${format(date, "M")}-${format(date, "yyyy")}`;
    return `${dayName}, ${dd} ${monthName}, ${yyyy} (${compact})`;
  })();

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
              <p><strong>{t("Crop:", "फसल:")}</strong> {selectedCrop === "all" ? t("All", "सभी") : selectedCrop === "potato" ? t("Potato", "आलू") : selectedCrop === "onion" ? t("Onion", "प्याज") : t("Garlic", "लहसुन")}</p>
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

      <LoadingNakalDialog
        entries={filteredEntries}
        open={showNakal}
        onOpenChange={setShowNakal}
        merchantName={merchantInfo?.name || user?.merchantName || ""}
        dateLabel={nakalDateLabel}
      />

      <Card className="border-green-300 dark:border-green-700">
        <CardContent className="py-3 px-3 sm:px-4 space-y-3">
          <div className="flex items-start gap-2">
            <Filter className="h-4 w-4 text-muted-foreground mt-2.5" />
            <div className="grid grid-cols-2 gap-2 flex-1 sm:flex sm:flex-wrap sm:items-center">
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="text-sm sm:w-[100px]" data-testid="filter-year">
                <SelectValue placeholder={t("Year", "वर्ष")} />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <MonthFilter selectedMonths={filterMonths} onSelectedMonthsChange={setFilterMonths} />
            <DateFilter selectedDay={filterDay} onSelectedDayChange={setFilterDay} />

            <Popover open={serialPopoverOpen} onOpenChange={setSerialPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={serialPopoverOpen}
                  className={cn(
                    "justify-between font-normal text-sm sm:w-[100px]",
                    !filterSerial && "text-muted-foreground"
                  )}
                  data-testid="filter-serial"
                >
                  <span className="truncate">
                    {filterSerial || t("Serial #", "क्रमांक")}
                  </span>
                  <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[120px] p-0">
                <Command>
                  <CommandInput placeholder={t("Search...", "खोजें...")} />
                  <CommandList>
                    <CommandEmpty>{t("No match.", "कोई मिलान नहीं।")}</CommandEmpty>
                    <CommandGroup>
                      {filterSerial && (
                        <CommandItem
                          value="__clear__"
                          onSelect={() => {
                            setFilterSerial("");
                            setSerialPopoverOpen(false);
                          }}
                          className="text-muted-foreground"
                        >
                          <X className="mr-2 h-4 w-4" />
                          {t("Clear", "हटाएं")}
                        </CommandItem>
                      )}
                      {serialNumbers.map((num) => (
                        <CommandItem
                          key={num}
                          value={num.toString()}
                          onSelect={(currentValue) => {
                            setFilterSerial(currentValue === filterSerial ? "" : currentValue);
                            setSerialPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${filterSerial === num.toString() ? "opacity-100" : "opacity-0"}`}
                          />
                          {num}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Popover open={farmerPopoverOpen} onOpenChange={setFarmerPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={farmerPopoverOpen}
                  className={cn(
                    "justify-between font-normal text-sm sm:w-[130px]",
                    !filterFarmer && "text-muted-foreground"
                  )}
                  data-testid="filter-farmer"
                >
                  <span className="truncate">
                    {filterFarmer || t("Farmer", "किसान")}
                  </span>
                  <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0">
                <Command>
                  <CommandInput placeholder={t("Search farmer...", "किसान खोजें...")} />
                  <CommandList>
                    <CommandEmpty>{t("No farmer found.", "कोई किसान नहीं मिला।")}</CommandEmpty>
                    <CommandGroup>
                      {farmerOptions.map((farmer) => (
                        <CommandItem
                          key={farmer.id}
                          value={farmer.name}
                          onSelect={() => {
                            if (filterFarmerId === farmer.id) {
                              setFilterFarmer("");
                              setFilterFarmerId(null);
                            } else {
                              setFilterFarmer(farmer.name);
                              setFilterFarmerId(farmer.id);
                            }
                            setFarmerPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${filterFarmerId === farmer.id ? "opacity-100" : "opacity-0"}`}
                          />
                          <div className="flex flex-col flex-1">
                            <span className="font-medium">{farmer.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {farmer.contact || ""}
                              {farmer.contact && farmer.village && " • "}
                              {farmer.village || ""}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {aadhatOptions.length > 0 && (
            <Popover open={aadhatPopoverOpen} onOpenChange={setAadhatPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={aadhatPopoverOpen}
                  className={cn(
                    "justify-between font-normal text-sm sm:w-[140px]",
                    !filterAadhat && "text-muted-foreground"
                  )}
                  data-testid="filter-aadhat"
                >
                  <span className="truncate">
                    {filterAadhat || t("Aadhat", "आढ़त")}
                  </span>
                  <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0">
                <Command>
                  <CommandInput placeholder={t("Search aadhat...", "आढ़त खोजें...")} />
                  <CommandList>
                    <CommandEmpty>{t("No aadhat found.", "कोई आढ़त नहीं मिली।")}</CommandEmpty>
                    <CommandGroup>
                      {filterAadhat && (
                        <CommandItem
                          value="__clear__"
                          onSelect={() => {
                            setFilterAadhat("");
                            setFilterAadhatId(null);
                            setAadhatPopoverOpen(false);
                          }}
                          className="text-muted-foreground"
                        >
                          <X className="mr-2 h-4 w-4" />
                          {t("Clear", "हटाएं")}
                        </CommandItem>
                      )}
                      {aadhatOptions.map((aadhat) => (
                        <CommandItem
                          key={aadhat.id}
                          value={aadhat.name}
                          onSelect={() => {
                            if (filterAadhatId === aadhat.id) {
                              setFilterAadhat("");
                              setFilterAadhatId(null);
                            } else {
                              setFilterAadhat(aadhat.name);
                              setFilterAadhatId(aadhat.id);
                            }
                            setAadhatPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${filterAadhatId === aadhat.id ? "opacity-100" : "opacity-0"}`}
                          />
                          <span className="font-medium">{aadhat.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            )}

            <Select value={filterPaymentStatus} onValueChange={setFilterPaymentStatus}>
              <SelectTrigger className="text-sm sm:w-[110px]" data-testid="filter-payment-status">
                <SelectValue placeholder={t("Payment", "भुगतान")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">{t("Due", "बाकी")}</SelectItem>
                <SelectItem value="paid">{t("Paid", "भुगतान हो गया")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterQuality} onValueChange={setFilterQuality}>
              <SelectTrigger className="text-sm sm:w-[100px]" data-testid="filter-quality">
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
              <SelectTrigger className="text-sm sm:w-[120px]" data-testid="filter-cold-store">
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

            <div className="flex items-center gap-1">
              <Button
                variant={filterUnsold ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterUnsold(!filterUnsold)}
                data-testid="filter-unsold"
              >
                {t("Unsold", "बिना बिके")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNakal(true)}
                data-testid="button-loading-nakal"
                title={t("Loading Nakal", "लोडिंग नकल")}
              >
                <FileDown className="h-4 w-4" />
              </Button>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                {t("Clear", "साफ़ करें")}
              </Button>
            )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-1.5">
        <Card className="border-blue-300 dark:border-blue-700" data-testid="card-bags-summary">
          <CardContent className="p-2.5">
            <div className="text-xs text-muted-foreground font-medium">{t("Bags", "बैग")}</div>
            <div className="text-sm font-bold mt-1" data-testid="text-bags-total">
              {summaryTotals.bagsTotal.toLocaleString()} {t("bags", "बैग")}
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Remaining", "बचे")}: </span>
              <span className="font-bold text-amber-600 dark:text-amber-400" data-testid="text-bags-remaining">{summaryTotals.bagsRemaining.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-300 dark:border-blue-700" data-testid="card-netweight-summary">
          <CardContent className="p-2.5">
            <div className="text-xs text-muted-foreground font-medium">{t("Net Wt", "शुद्ध वजन")}</div>
            <div className="text-sm font-bold mt-1" data-testid="text-netweight-total">
              {Math.round(summaryTotals.netWeightTotal).toLocaleString()} {t("kg", "किग्रा")}
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Remaining", "बचे")}: </span>
              <span className="font-bold text-amber-600 dark:text-amber-400" data-testid="text-netweight-remaining">{Math.round(summaryTotals.netWeightRemaining).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-300 dark:border-orange-700" data-testid="card-cost-summary">
          <CardContent className="p-2.5">
            <div className="text-xs text-muted-foreground font-medium">{t("Total Cost", "कुल लागत")}</div>
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">{t("Payable", "देय")}: </span>
              <span className="font-medium" data-testid="text-cost-payable">₹{summaryTotals.totalPayable.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Deductions", "कटौती")}: </span>
              <span className="font-bold text-red-600 dark:text-red-400" data-testid="text-cost-deductions">₹{summaryTotals.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-300 dark:border-amber-700" data-testid="card-mandi-summary">
          <CardContent className="p-2.5">
            <div className="text-xs text-muted-foreground font-medium">{t("Mandi", "मंडी")}</div>
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">{t("Total", "कुल")}: </span>
              <span className="font-medium" data-testid="text-mandi-total">₹{summaryTotals.mandiTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Due", "बाकी")}: </span>
              <span className="font-bold text-red-600 dark:text-red-400" data-testid="text-mandi-due">₹{summaryTotals.mandiDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="card-farmer-summary">
          <CardContent className="p-2.5">
            <div className="text-xs text-muted-foreground font-medium">{t("Farmer", "किसान")}</div>
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">{t("Total", "कुल")}: </span>
              <span className="font-medium" data-testid="text-farmer-total">₹{summaryTotals.farmerTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Due", "बाकी")}: </span>
              <span className="font-bold text-red-600 dark:text-red-400" data-testid="text-farmer-due">₹{summaryTotals.farmerDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-300 dark:border-purple-700" data-testid="card-cold-store-summary">
          <CardContent className="p-2.5">
            <div className="text-xs text-muted-foreground font-medium">{t("Cold Store", "कोल्ड स्टोर")}</div>
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">{t("Total", "कुल")}: </span>
              <span className="font-medium" data-testid="text-cold-total">₹{summaryTotals.coldStoreTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Due", "बाकी")}: </span>
              <span className="font-bold text-red-600 dark:text-red-400" data-testid="text-cold-due">₹{summaryTotals.coldStoreDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-pink-300 dark:border-pink-700" data-testid="card-buyer-extra-summary">
          <CardContent className="p-2.5">
            <div className="text-xs text-muted-foreground font-medium">{t("Buyer Extra", "खरीदार अतिरिक्त")}</div>
            <div className="text-sm font-bold mt-1 text-pink-600 dark:text-pink-400" data-testid="text-buyer-extra-total">
              ₹{summaryTotals.buyerExtraTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
            </div>
            <div className="text-xs text-muted-foreground">{t("Across filtered entries", "फ़िल्टर की गई एंट्रियों में")}</div>
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
              metrics: getLotMetrics(lot),
            }));
            
            const entryStatus = computeEntryStatusFromMetrics(lotsWithMetrics);
            const potatoTypes = Array.from(new Set(entry.lots.map(lot => lot.potatoType).filter(Boolean)));
            
            let totalOriginal = 0;
            let totalWastage = 0;
            let totalActual = 0;
            let totalRemaining = 0;
            let entryTotalAmount = 0;
            let entryAdjustment = 0;
            let entryDeductions = 0;
            let entryColdStoreTotalCharges = 0;
            let entryExtraBuyerCharges = 0;
            let entryColdStorePaid = 0;
            
            const entryIsMandi = (entry.place || entry.lots[0]?.place) === "mandi";
            let entryMandiChargesTotal = 0;

            lotsWithMetrics.forEach(({ lot, metrics }) => {
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
              entryExtraBuyerCharges += metrics.extraBuyerCharges ?? 0;
              entryColdStorePaid += metrics.coldStorePaid;
            });
            
            const farmerAmountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
            const adjustedEntryTotal = Math.round(entry.lots.reduce((sum, lot) => sum + (lot.netPayable ? parseFloat(lot.netPayable) : 0), 0));
            const farmerRemainingDue = Math.max(adjustedEntryTotal - farmerAmountPaid, 0);
            const coldStoreRemainingDue = entryColdStoreTotalCharges - entryColdStorePaid;
            
            const isFarmerPaid = farmerRemainingDue <= 0 && entryTotalAmount > 0;
            const isColdStorePaid = coldStoreRemainingDue <= 0 && entryColdStoreTotalCharges > 0;

            return (
              <Card key={entry.id} className="border border-green-300 dark:border-green-700 shadow-sm hover-elevate" data-testid={`card-entry-${entry.id}`}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <div className="flex items-center gap-1" data-testid={`text-serial-${entry.id}`}>
                          <Package className="h-4 w-4" style={{ color: '#52a7ff' }} />
                          <span className="font-semibold text-base">{t("Sr No:", "क्र.:")} {entry.serialNumber}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {new Date(`${entry.purchaseDate}T00:00:00`).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span className="font-semibold text-base" data-testid={`text-farmer-${entry.id}`}>
                          - {entry.farmerName}
                        </span>
                        
                        {(() => {
                          const p = entry.place || entry.lots[0]?.place || "cold_store";
                          const label = p === "farm_gate" ? t("Farm Gate", "फार्म गेट") : p === "mandi" ? t("Mandi", "मंडी") : t("Cold Store", "कोल्ड स्टोर");
                          const cls = p === "farm_gate"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                            : p === "mandi"
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
                          return (
                            <Badge className={`text-[11px] px-2 py-0.5 font-medium border-0 ${cls}`} data-testid={`badge-place-${entry.id}`}>
                              {label}
                            </Badge>
                          );
                        })()}

                        {(() => {
                          const c = (entry.crop || entry.lots[0]?.crop || "potato") as string;
                          const cls = c === "onion"
                            ? "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300"
                            : c === "garlic"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
                          const label = c === "onion" ? t("Onion", "प्याज") : c === "garlic" ? t("Garlic", "लहसुन") : t("Potato", "आलू");
                          return (
                            <Badge className={`text-[11px] px-2 py-0.5 font-medium border-0 ${cls}`} data-testid={`badge-crop-${entry.id}`}>
                              {label}
                            </Badge>
                          );
                        })()}
                        
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
                            <span className="text-muted-foreground whitespace-nowrap">{(entry.place || entry.lots[0]?.place) === "mandi" ? t("Aadhat Total", "आढ़त कुल") : t("Farmer Total", "किसान कुल")}</span>
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
                        {entryExtraBuyerCharges > 0 && (
                          <span className="inline-flex items-center gap-1" data-testid={`text-entry-extra-buyer-${entry.id}`}>
                            <span className="text-muted-foreground whitespace-nowrap">{t("Buyer Extra", "खरीदार अतिरिक्त")}</span>
                            <span className="font-medium whitespace-nowrap">₹ {entryExtraBuyerCharges.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 gap-1.5 justify-start flex-1"
                          onClick={() => setEditEntry(entry)}
                          data-testid={`button-edit-${entry.id}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          {t("Edit", "संपादित")}
                        </Button>
                        {user?.canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteEntry(entry)}
                            data-testid={`button-delete-${entry.id}`}
                            aria-label={t("Delete entry", "एंट्री हटाएं")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8 gap-1.5 justify-start"
                            data-testid={`button-print-${entry.id}`}
                          >
                            <Printer className="h-3.5 w-3.5" />
                            {t("Print", "प्रिंट")}
                            <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setBillAction("print"); setPrintEntry(entry); }} data-testid={`button-print-bill-${entry.id}`}>
                            <Printer className="h-4 w-4 mr-2" />
                            {t("Print Bill", "बिल प्रिंट")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setBillAction("share"); setPrintEntry(entry); }} data-testid={`button-share-bill-${entry.id}`}>
                            <Share2 className="h-4 w-4 mr-2" />
                            {t("Share (WhatsApp)", "शेयर (व्हाट्सएप)")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0 pb-3 px-4">
                  <div className="space-y-2">
                    {lotsWithMetrics.map(({ lot, metrics }, lotIndex) => {
                      const lotColdTotal = metrics.coldStoreTotalCharges ?? 0;
                      const lotColdDue = metrics.coldStoreRemaining ?? 0;
                      const lotExtraBuyer = metrics.extraBuyerCharges ?? 0;
                      
                      return (
                        <div 
                          key={lot.id} 
                          className="py-2 px-3 bg-muted/20 rounded-md border border-border/30"
                          data-testid={`lot-card-${entry.id}-${lotIndex}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]">
                              <span className="font-semibold text-foreground">{t("Lot", "लॉट")} #{lotIndex + 1}</span>
                              <div className="flex items-center gap-1.5">
                                <Snowflake className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">
                                  {lot.place === "farm_gate" ? (() => {
                                    const csName = getColdStoreNameFromCharges(lot.charges);
                                    return csName ? `${t("Farm Gate", "फार्म गेट")} · ${csName}` : t("Farm Gate", "फार्म गेट");
                                  })() : lot.coldStoreName}
                                </span>
                              </div>
                              {lot.potatoType && (
                                <Badge className="text-[11px] px-2 py-0.5 font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0">
                                  {lot.potatoType}
                                </Badge>
                              )}
                              {lot.quality && (
                                <Badge className={`text-[11px] px-2 py-0.5 font-medium border-0 ${
                                  lot.quality === "Good"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                    : lot.quality === "Medium"
                                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                                      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                }`}>
                                  {lot.quality}
                                </Badge>
                              )}
                              {lot.size && (
                                <Badge className="text-[11px] px-2 py-0.5 font-medium bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-0">
                                  {lot.size}
                                </Badge>
                              )}
                              {(() => {
                                const distinctMarka = Array.from(new Set(
                                  [lot.marka, ...(lot.bagBreakdowns || []).map((bd: any) => bd.marka)]
                                    .map((m: any) => (m || "").trim())
                                    .filter((m: string) => m.length > 0)
                                )).join(", ");
                                if (!distinctMarka) return null;
                                return (
                                  <Badge
                                    className="text-[11px] px-2 py-0.5 font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0"
                                    data-testid={`badge-marka-${lot.id}`}
                                  >
                                    {t("Marka -", "मार्का -")}{distinctMarka}
                                  </Badge>
                                );
                              })()}
                              <Badge className={`text-[11px] px-2 py-0.5 font-medium border-0 ${
                                lot.cutType === "bilty_cut"
                                  ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
                                  : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                              }`}>
                                {lot.cutType === "bilty_cut" ? t("Bilty Cut", "बिल्टी कट") : t("Gate Cut", "गेट कट")}
                              </Badge>
                            </div>
                            {lotIndex === 0 && entry.attachmentImage && (
                              <button
                                type="button"
                                onClick={() => { setImageViewEntryId(entry.id); setImageViewEntryLabel(entry.uniqueId || `#${entry.serialNumber}`); }}
                                className="shrink-0 inline-flex items-center"
                                data-testid={`button-view-image-${entry.id}`}
                              >
                                <Paperclip className="h-4 w-4 text-blue-500" />
                              </button>
                            )}
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
                                    const netWeight = computeNetWeight(weight, bd.numberOfBags, lot.place);
                                    const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
                                    return (
                                      <span key={idx}>
                                        {idx > 0 && ", "}
                                        <span className="font-medium">{bd.size}</span>
                                        <span className="text-muted-foreground"> - </span>
                                        <span className="font-semibold text-green-600 dark:text-green-400">{Math.max(0, (bd.numberOfBags || 0) - ((bd as any).soldBags ?? 0))}</span>
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
                          {lotExtraBuyer > 0 && (
                            <span className="inline-flex items-center gap-1 text-[13px] mt-1 ml-3" data-testid={`text-lot-extra-buyer-${lot.id}`}>
                              <span className="text-muted-foreground whitespace-nowrap">{t("Buyer Extra", "खरीदार अतिरिक्त")}</span>
                              <span className="font-medium whitespace-nowrap">₹ {lotExtraBuyer.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
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

      <AlertDialog
        open={!!deleteEntry}
        onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setDeleteEntry(null); }}
      >
        <AlertDialogContent data-testid="dialog-delete-stock-entry">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Delete this stock entry?", "क्या यह स्टॉक एंट्री हटाएं?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const sr = deleteEntry?.serialNumber ?? "";
                const name = deleteEntry?.farmerName ?? "";
                const totalBags = (deleteEntry?.lots ?? []).reduce(
                  (sum: number, l: any) =>
                    sum + (l.bagBreakdowns ?? []).reduce(
                      (s: number, bd: any) => s + (Number(bd.numberOfBags) || 0),
                      0,
                    ),
                  0,
                );
                return t(
                  `Sr# ${sr} (${name}) — ${totalBags} bags will be permanently removed along with all its lots, bag breakdowns and edit history. This cannot be undone.`,
                  `सीरियल# ${sr} (${name}) — ${totalBags} बोरी इसके सभी लॉट, बोरी विवरण और एडिट इतिहास के साथ स्थायी रूप से हटा दी जाएगी। यह क्रिया वापस नहीं ली जा सकती।`,
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} data-testid="button-cancel-delete">
              {t("Cancel", "रद्द")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => { e.preventDefault(); if (deleteEntry) deleteMutation.mutate(deleteEntry.id); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("Delete", "हटाएं")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {printEntry && (
        <BillPrintDialog
          entry={printEntry}
          open={!!printEntry}
          onOpenChange={(open: boolean) => { if (!open) { setPrintEntry(null); setBillAction(undefined); } }}
          autoAction={billAction}
        />
      )}

      <Dialog open={imageViewEntryId !== null} onOpenChange={(open) => { if (!open) setImageViewEntryId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Attachment", "अटैचमेंट")} - {imageViewEntryLabel}</DialogTitle>
          </DialogHeader>
          {imageViewEntryId && (
            <div className="flex items-center justify-center">
              <img
                src={`/api/stock-entries/${imageViewEntryId}/image`}
                alt="Stock entry attachment"
                className="max-w-full max-h-[70vh] rounded-md object-contain"
                data-testid="img-attachment-view"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
