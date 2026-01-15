import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter, Edit, Printer, Package, X, Phone, MapPin, Calendar, Clock, Snowflake, Boxes, Users, Building2, Download } from "lucide-react";
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
    coldStoreChargesPerBag: string | null;
    hammaliGradingCharges: string | null;
    coldStorageChargesPaid: string | null;
    adjustedAmount: string | null;
    adjustedAmountType: string | null;
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
  
  lot.bagBreakdowns.forEach(bd => {
    if (bd.size !== "Wastage") {
      const weight = bd.weight ? parseFloat(bd.weight) : 0;
      totalWeight += weight;
      
      if (bd.totalAmount) {
        totalAmount = (totalAmount ?? 0) + parseFloat(bd.totalAmount);
      } else {
        const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
        if (weight > 0 && price > 0) {
          totalAmount = (totalAmount ?? 0) + (weight * price);
        }
      }
    }
  });
  
  if (lot.cutType === "gate_cut" && lot.pricePerKg) {
    const price = parseFloat(lot.pricePerKg);
    if (totalWeight > 0 && price > 0) {
      totalAmount = totalWeight * price;
    }
  }
  
  const sellableBreakdowns = lot.bagBreakdowns.filter(bd => bd.size !== "Wastage");
  const wastageBreakdowns = lot.bagBreakdowns.filter(bd => bd.size === "Wastage");
  
  const coldStoreChargesPerBag = lot.coldStoreChargesPerBag !== null ? parseFloat(lot.coldStoreChargesPerBag) : null;
  const hammaliGradingCharges = lot.hammaliGradingCharges !== null ? parseFloat(lot.hammaliGradingCharges) : 0;
  const perBagTotal = coldStoreChargesPerBag !== null ? lot.originalBags * coldStoreChargesPerBag : 0;
  const coldStoreTotalCharges = perBagTotal + hammaliGradingCharges;
  const coldStorePaid = lot.coldStorageChargesPaid ? parseFloat(lot.coldStorageChargesPaid) : 0;
  const coldStoreRemaining = coldStoreTotalCharges - coldStorePaid;
  
  const adjustedAmount = lot.adjustedAmount !== null ? parseFloat(lot.adjustedAmount) : 0;
  const adjustedAmountType = lot.adjustedAmountType;
  
  return {
    originalBags: lot.originalBags,
    wastageBags,
    actualSellableBags,
    remainingToSell,
    soldBags,
    totalWeight,
    totalAmount,
    pricePerKg: lot.pricePerKg ? parseFloat(lot.pricePerKg) : null,
    coldStoreChargesPerBag,
    hammaliGradingCharges,
    coldStoreTotalCharges,
    coldStorePaid,
    coldStoreRemaining,
    adjustedAmount,
    adjustedAmountType,
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

export function StockRegisterCard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterQuality, setFilterQuality] = useState<string>("");
  const [filterUnsold, setFilterUnsold] = useState<boolean>(false);
  const [filterColdStore, setFilterColdStore] = useState<string>("");
  const [editEntry, setEditEntry] = useState<StockEntryWithLots | null>(null);
  const [printEntry, setPrintEntry] = useState<StockEntryWithLots | null>(null);
  
  // Download dialog state
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState("");
  const [downloadEndDate, setDownloadEndDate] = useState("");

  const { data: entries, isLoading, error } = useQuery<StockEntryWithLots[]>({
    queryKey: ["/api/stock-entries"],
  });

  const coldStores = useMemo(() => {
    if (!entries) return [];
    const stores = new Set<string>();
    entries.forEach(entry => {
      entry.lots.forEach(lot => {
        stores.add(lot.coldStoreName);
      });
    });
    return Array.from(stores);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    
    return entries.filter((entry) => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          entry.farmerName.toLowerCase().includes(search) ||
          entry.serialNumber.toString().includes(search) ||
          entry.lots.some(lot => lot.coldStoreName.toLowerCase().includes(search));
        if (!matchesSearch) return false;
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
  }, [entries, searchTerm, filterPaymentStatus, filterQuality, filterUnsold, filterColdStore]);

  const clearFilters = () => {
    setSearchTerm("");
    setFilterPaymentStatus("");
    setFilterQuality("");
    setFilterUnsold(false);
    setFilterColdStore("");
  };

  const hasActiveFilters = searchTerm || filterPaymentStatus || filterQuality || filterUnsold || filterColdStore;

  // Compute summary totals from filtered entries
  const summaryTotals = useMemo(() => {
    let bagsTotal = 0;
    let bagsRemaining = 0;
    let farmerTotal = 0;
    let farmerDue = 0;
    let coldStoreTotal = 0;
    let coldStoreDue = 0;

    filteredEntries.forEach(entry => {
      let entryTotalAmount = 0;
      let entryAdjustment = 0;
      let entryColdStoreTotalCharges = 0;
      let entryColdStorePaid = 0;

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
        entryColdStoreTotalCharges += metrics.coldStoreTotalCharges;
        entryColdStorePaid += metrics.coldStorePaid;
      });

      farmerTotal += entryTotalAmount;
      const amountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
      const adjustedEntryTotal = entryTotalAmount + entryAdjustment;
      farmerDue += Math.max(adjustedEntryTotal - amountPaid, 0);
      
      coldStoreTotal += entryColdStoreTotalCharges;
      coldStoreDue += Math.max(entryColdStoreTotalCharges - entryColdStorePaid, 0);
    });

    return { bagsTotal, bagsRemaining, farmerTotal, farmerDue, coldStoreTotal, coldStoreDue };
  }, [filteredEntries]);

  const handleDownloadCSV = () => {
    if (!downloadStartDate || !downloadEndDate) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Please select both start and end dates", "कृपया आरंभ और समाप्ति दोनों तिथियाँ चुनें"),
        variant: "destructive",
      });
      return;
    }

    const startDate = new Date(downloadStartDate);
    const endDate = new Date(downloadEndDate);
    
    if (startDate > endDate) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Start date cannot be after end date", "आरंभ तिथि समाप्ति तिथि के बाद नहीं हो सकती"),
        variant: "destructive",
      });
      return;
    }

    const filteredForDownload = (entries || []).filter(entry => {
      const entryDate = new Date(entry.purchaseDate);
      return entryDate >= startDate && entryDate <= endDate;
    });

    if (filteredForDownload.length === 0) {
      toast({
        title: t("No Data", "कोई डेटा नहीं"),
        description: t("No entries found in the selected date range", "चयनित तिथि सीमा में कोई प्रविष्टि नहीं मिली"),
        variant: "destructive",
      });
      return;
    }

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
        
        // Lot adjustment
        let lotAdjustment = 0;
        if (metrics.adjustedAmount > 0 && metrics.adjustedAmountType) {
          lotAdjustment = metrics.adjustedAmountType === "debit" ? -metrics.adjustedAmount : metrics.adjustedAmount;
        }
        
        // Farmer due per lot (prorated by totalAmount, then apply adjustment)
        const lotFarmerTotal = metrics.totalAmount ?? 0;
        const lotPaidRatio = entryFarmerTotal > 0 ? lotFarmerTotal / entryFarmerTotal : 0;
        const lotFarmerPaid = entryAmountPaid * lotPaidRatio;
        const lotFarmerDue = Math.max(lotFarmerTotal + lotAdjustment - lotFarmerPaid, 0);
        
        // Cold store charges (already includes hammali/grading)
        const coldTotal = metrics.coldStoreTotalCharges;
        const coldDue = metrics.coldStoreRemaining;
        
        // Cut type display
        const cutTypeDisplay = lot.cutType === "gate_cut" ? t("Gate Cut", "गेट कट") : t("Pile Cut", "ढेर कट");
        
        rows.push([
          entry.serialNumber.toString(),
          (lotIndex + 1).toString(),
          format(new Date(entry.purchaseDate), "dd/MM/yyyy"),
          entry.farmerName,
          entry.village || "-",
          lot.coldStoreName,
          lot.potatoType,
          lot.quality,
          cutTypeDisplay,
          metrics.originalBags.toString(),
          metrics.actualSellableBags.toString(),
          largeBags.toString(),
          mediumBags.toString(),
          smallBags.toString(),
          metrics.remainingToSell.toString(),
          lotFarmerTotal.toFixed(0),
          lotFarmerDue.toFixed(0),
          coldTotal.toFixed(0),
          coldDue.toFixed(0),
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
    link.download = `stock_entries_${downloadStartDate}_to_${downloadEndDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    setDownloadDialogOpen(false);
    setDownloadStartDate("");
    setDownloadEndDate("");
    
    toast({
      title: t("Success", "सफल"),
      description: t("CSV downloaded successfully", "CSV सफलतापूर्वक डाउनलोड हुई"),
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
      {/* Download Dialog */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Download Stock Entries", "स्टॉक प्रविष्टियाँ डाउनलोड करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stock-start-date">{t("Start Date", "आरंभ तिथि")}</Label>
              <Input
                id="stock-start-date"
                type="date"
                value={downloadStartDate}
                onChange={(e) => setDownloadStartDate(e.target.value)}
                data-testid="input-stock-download-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock-end-date">{t("End Date", "समाप्ति तिथि")}</Label>
              <Input
                id="stock-end-date"
                type="date"
                value={downloadEndDate}
                onChange={(e) => setDownloadEndDate(e.target.value)}
                data-testid="input-stock-download-end-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} data-testid="button-stock-download-cancel">
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleDownloadCSV} data-testid="button-stock-download-csv">
              <Download className="h-4 w-4 mr-2" />
              {t("Download CSV", "CSV डाउनलोड करें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header with Download Button */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("Stock Register", "स्टॉक रजिस्टर")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("View and manage all stock entries", "सभी स्टॉक एंट्री देखें और प्रबंधित करें")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDownloadDialogOpen(true)}
          title={t("Download", "डाउनलोड")}
          data-testid="button-stock-download"
        >
          <Download className="h-5 w-5" />
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("Search by farmer name, serial # or cold store...", "किसान का नाम, क्रमांक या कोल्ड स्टोर द्वारा खोजें...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t("Filters:", "फ़िल्टर:")}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            <Select value={filterPaymentStatus} onValueChange={setFilterPaymentStatus}>
              <SelectTrigger className="w-[140px]" data-testid="filter-payment-status">
                <SelectValue placeholder={t("Payment", "भुगतान")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">{t("Due", "बाकी")}</SelectItem>
                <SelectItem value="paid">{t("Paid", "भुगतान हो गया")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterQuality} onValueChange={setFilterQuality}>
              <SelectTrigger className="w-[130px]" data-testid="filter-quality">
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
              <SelectTrigger className="w-[160px]" data-testid="filter-cold-store">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card data-testid="card-bags-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Boxes className="h-5 w-5 text-blue-600" />
              <span className="font-medium">{t("Bags", "बैग")}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
                <p className="text-lg font-bold" data-testid="text-bags-total">{summaryTotals.bagsTotal.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Remaining (Unsold)", "बचे (अनबिके)")}</span>
                <p className="text-lg font-bold text-amber-600" data-testid="text-bags-remaining">{summaryTotals.bagsRemaining.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-farmer-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-green-600" />
              <span className="font-medium">{t("Farmer", "किसान")}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
                <p className="text-lg font-bold" data-testid="text-farmer-total">₹{summaryTotals.farmerTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Due", "बाकी")}</span>
                <p className="text-lg font-bold text-red-600" data-testid="text-farmer-due">₹{summaryTotals.farmerDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-cold-store-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-purple-600" />
              <span className="font-medium">{t("Cold Store", "कोल्ड स्टोर")}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
                <p className="text-lg font-bold" data-testid="text-cold-total">₹{summaryTotals.coldStoreTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Due", "बाकी")}</span>
                <p className="text-lg font-bold text-red-600" data-testid="text-cold-due">₹{summaryTotals.coldStoreDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
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
              entryColdStoreTotalCharges += metrics.coldStoreTotalCharges;
              entryColdStorePaid += metrics.coldStorePaid;
            });
            
            const farmerAmountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
            const adjustedEntryTotal = entryTotalAmount + entryAdjustment;
            const farmerRemainingDue = Math.max(adjustedEntryTotal - farmerAmountPaid, 0);
            const coldStoreRemainingDue = entryColdStoreTotalCharges - entryColdStorePaid;
            
            const isFarmerPaid = farmerRemainingDue <= 0 && entryTotalAmount > 0;
            const isColdStorePaid = coldStoreRemainingDue <= 0 && entryColdStoreTotalCharges > 0;

            return (
              <Card key={entry.id} className="border-border/60 shadow-sm hover-elevate" data-testid={`card-entry-${entry.id}`}>
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
                        {entryTotalAmount > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">{t("Farmer Total", "किसान कुल")}</span>{" "}
                            <span className="font-medium">₹ {entryTotalAmount.toFixed(0)}</span>
                            <span className="text-muted-foreground mx-1">|</span>
                            <span className="text-muted-foreground">{t("Due", "बाकी")}</span>{" "}
                            <span className={`font-medium ${farmerRemainingDue > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
                              ₹ {farmerRemainingDue > 0 ? farmerRemainingDue.toFixed(0) : "0"}
                            </span>
                          </div>
                        )}
                        {entryColdStoreTotalCharges > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">{t("Cold Total", "कोल्ड कुल")}</span>{" "}
                            <span className="font-medium">₹ {entryColdStoreTotalCharges.toFixed(0)}</span>
                            <span className="text-muted-foreground mx-1">|</span>
                            <span className="text-muted-foreground">{t("Due", "बाकी")}</span>{" "}
                            <span className={`font-medium ${coldStoreRemainingDue > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
                              ₹ {coldStoreRemainingDue > 0 ? coldStoreRemainingDue.toFixed(0) : "0"}
                            </span>
                          </div>
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
                                  return sellableBreakdowns.map((bd: any, idx: number) => (
                                    <span key={idx}>
                                      {idx > 0 && ", "}
                                      <span className="font-medium">{bd.size}</span>
                                      <span className="text-muted-foreground"> - </span>
                                      <span className="font-semibold text-green-600 dark:text-green-400">{bd.remainingBags ?? bd.numberOfBags}</span>
                                      <span className="text-muted-foreground">/{bd.numberOfBags}</span>
                                    </span>
                                  ));
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
                            <div className="flex flex-wrap items-center gap-x-1 text-[13px] mt-1">
                              <span className="text-muted-foreground">{t("Cold Total", "कोल्ड कुल")}</span>{" "}
                              <span className="font-medium">₹ {lotColdTotal.toFixed(0)}</span>
                              <span className="text-muted-foreground mx-1">|</span>
                              <span className="text-muted-foreground">{t("Due", "बाकी")}</span>{" "}
                              <span className={`font-medium ${lotColdDue > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
                                ₹ {lotColdDue > 0 ? lotColdDue.toFixed(0) : "0"}
                              </span>
                            </div>
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
