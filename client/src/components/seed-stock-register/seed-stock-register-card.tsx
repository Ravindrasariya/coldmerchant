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
import { X, Phone, MapPin, Calendar, Snowflake, Boxes, Users, Building2, Download, Leaf, Package, Clock, Edit, Printer, Filter, Share2, ChevronDown, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { SeedStockEntryWithLots, SEED_POTATO_TYPES } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";
import { SeedStockEntryEditDialog } from "./seed-stock-entry-edit-dialog";
import { SeedBillPrintDialog } from "./seed-bill-print-dialog";

function computeSeedLotMetrics(lot: SeedStockEntryWithLots['seedLots'][0]) {
  const pricePerBag = lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0;
  const coldStoreChargesPerBag = lot.coldStoreChargesPerBag ? parseFloat(lot.coldStoreChargesPerBag) : 0;
  const coldStoreChargesPaid = lot.coldStoreChargesPaid ? parseFloat(lot.coldStoreChargesPaid) : 0;
  const hammaliCharges = lot.hammaliCharges ? parseFloat(lot.hammaliCharges) : 0;
  const gradingCharges = lot.gradingCharges ? parseFloat(lot.gradingCharges) : 0;
  const transportCharges = lot.transportCharges ? parseFloat(lot.transportCharges) : 0;
  
  const totalAmount = lot.originalBags * pricePerBag;
  const coldStoreTotal = lot.originalBags * coldStoreChargesPerBag;
  const coldStoreDue = Math.max(coldStoreTotal - coldStoreChargesPaid, 0);
  const totalExtraCost = hammaliCharges + gradingCharges + transportCharges;
  // Derive sold/remaining from persistent soldBags column (single source of
  // truth after backfill) instead of stored remainingBags which can drift on
  // legacy data.
  const soldBags = Math.min(lot.originalBags || 0, (lot as any).soldBags ?? 0);
  const derivedRemaining = Math.max(0, (lot.originalBags || 0) - soldBags);
  
  // Calculate avgCostPerBag
  const avgCostPerBag = lot.originalBags > 0
    ? pricePerBag + coldStoreChargesPerBag + (totalExtraCost / lot.originalBags)
    : pricePerBag;
  
  return {
    originalBags: lot.originalBags,
    remainingBags: derivedRemaining,
    soldBags,
    pricePerBag,
    totalAmount,
    coldStoreChargesPerBag,
    coldStoreTotal,
    coldStoreChargesPaid,
    coldStoreDue,
    hammaliCharges,
    gradingCharges,
    transportCharges,
    totalExtraCost,
    avgCostPerBag,
  };
}

interface SeedStockRegisterCardProps {
  downloadDialogOpen?: boolean;
  onDownloadDialogClose?: () => void;
}

export function SeedStockRegisterCard({ downloadDialogOpen: externalDownloadOpen, onDownloadDialogClose }: SeedStockRegisterCardProps = {}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [filterSerial, setFilterSerial] = useState<string>("");
  const [serialPopoverOpenDesktop, setSerialPopoverOpenDesktop] = useState(false);
  const [serialPopoverOpenMobile, setSerialPopoverOpenMobile] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState<string>("");
  const [filterPotatoType, setFilterPotatoType] = useState<string>("");
  const [filterColdStore, setFilterColdStore] = useState<string>("");
  const [filterUnsold, setFilterUnsold] = useState<boolean>(false);
  
  const [internalDownloadOpen, setInternalDownloadOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<SeedStockEntryWithLots | null>(null);
  const [printEntry, setPrintEntry] = useState<SeedStockEntryWithLots | null>(null);
  const [billAction, setBillAction] = useState<"print" | "share" | undefined>(undefined);
  
  const downloadDialogOpen = externalDownloadOpen || internalDownloadOpen;
  const setDownloadDialogOpen = (open: boolean) => {
    if (!open && onDownloadDialogClose) {
      onDownloadDialogClose();
    }
    setInternalDownloadOpen(open);
  };

  const { data: entries, isLoading, error } = useQuery<SeedStockEntryWithLots[]>({
    queryKey: ["/api/seed-stock-entries"],
  });

  const serialNumbers = useMemo(() => {
    if (!entries) return [];
    return entries.map(e => e.serialNumber).sort((a, b) => a - b);
  }, [entries]);

  const supplierNames = useMemo(() => {
    if (!entries) return [];
    const suppliers = new Set<string>();
    entries.forEach(entry => suppliers.add(entry.supplierName));
    return Array.from(suppliers).sort();
  }, [entries]);

  const coldStores = useMemo(() => {
    if (!entries) return [];
    const stores = new Set<string>();
    entries.forEach(entry => {
      entry.seedLots.forEach(lot => {
        stores.add(lot.coldStoreName);
      });
    });
    return Array.from(stores).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    
    return entries.filter((entry) => {
      if (filterSerial && entry.serialNumber.toString() !== filterSerial) {
        return false;
      }

      if (filterSupplier && entry.supplierName !== filterSupplier) {
        return false;
      }

      if (filterPotatoType) {
        const hasType = entry.seedLots.some(lot => lot.potatoType === filterPotatoType);
        if (!hasType) return false;
      }

      if (filterUnsold) {
        const hasUnsold = entry.seedLots.some(lot => lot.remainingBags > 0);
        if (!hasUnsold) return false;
      }

      if (filterColdStore) {
        const hasColdStore = entry.seedLots.some(lot => lot.coldStoreName === filterColdStore);
        if (!hasColdStore) return false;
      }

      return true;
    });
  }, [entries, filterSerial, filterSupplier, filterPotatoType, filterUnsold, filterColdStore]);

  const clearFilters = () => {
    setFilterSerial("");
    setFilterSupplier("");
    setFilterPotatoType("");
    setFilterColdStore("");
    setFilterUnsold(false);
  };

  const hasActiveFilters = filterSerial || filterSupplier || filterPotatoType || filterColdStore || filterUnsold;

  const summaryTotals = useMemo(() => {
    let bagsTotal = 0;
    let bagsRemaining = 0;
    let totalValue = 0;
    let coldStoreTotal = 0;
    let totalExtraCost = 0;
    let totalColdStoreDue = 0;
    let totalSupplierDue = 0;

    filteredEntries.forEach(entry => {
      let entryTotalValue = 0;
      entry.seedLots.forEach(lot => {
        const metrics = computeSeedLotMetrics(lot);
        bagsTotal += metrics.originalBags;
        bagsRemaining += metrics.remainingBags;
        entryTotalValue += metrics.totalAmount;
        coldStoreTotal += metrics.coldStoreTotal;
        totalExtraCost += metrics.totalExtraCost;
        totalColdStoreDue += metrics.coldStoreDue;
      });
      const roundedEntryTotalValue = Math.round(entryTotalValue);
      totalValue += roundedEntryTotalValue;
      const amountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
      totalSupplierDue += Math.max(roundedEntryTotalValue - amountPaid, 0);
    });

    return { bagsTotal, bagsRemaining, totalValue, coldStoreTotal, totalExtraCost, totalColdStoreDue, totalSupplierDue };
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
      t("Supplier Name", "आपूर्तिकर्ता का नाम"),
      t("Address", "पता"),
      t("District", "जिला"),
      t("State", "राज्य"),
      t("Cold Store", "कोल्ड स्टोर"),
      t("Potato Type", "आलू का प्रकार"),
      t("Bag Type", "बोरी प्रकार"),
      t("Size", "आकार"),
      t("Original Bags", "मूल बैग"),
      t("Remaining Bags", "बचे बैग"),
      t("Price/Bag", "मूल्य/बोरी"),
      t("Total Value ₹", "कुल मूल्य ₹"),
      t("Cold Store Charges/Bag", "कोल्ड स्टोर शुल्क/बोरी"),
      t("Hammali ₹", "हम्माली ₹"),
      t("Grading ₹", "ग्रेडिंग ₹"),
      t("Transport ₹", "परिवहन ₹"),
      t("Avg Cost/Bag ₹", "औसत लागत/बोरी ₹"),
    ];

    const rows: string[][] = [];
    filteredForDownload.forEach(entry => {
      entry.seedLots.forEach((lot, lotIndex) => {
        const metrics = computeSeedLotMetrics(lot);
        
        rows.push([
          entry.serialNumber.toString(),
          (lotIndex + 1).toString(),
          format(new Date(entry.purchaseDate), "dd/MM/yyyy"),
          entry.supplierName,
          entry.address || "-",
          entry.district,
          entry.state,
          lot.coldStoreName,
          lot.potatoType,
          lot.bagType,
          lot.size,
          metrics.originalBags.toString(),
          metrics.remainingBags.toString(),
          parseFloat(metrics.pricePerBag.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(metrics.totalAmount.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(metrics.coldStoreChargesPerBag.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(metrics.hammaliCharges.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(metrics.gradingCharges.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(metrics.transportCharges.toFixed(1)).toLocaleString('en-IN'),
          parseFloat(metrics.avgCostPerBag.toFixed(1)).toLocaleString('en-IN'),
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
    const parts = ["seed_stock_entries"];
    if (filterSerial) parts.push(`sr${filterSerial}`);
    if (filterSupplier) parts.push(filterSupplier.replace(/\s+/g, "_"));
    if (filterPotatoType) parts.push(filterPotatoType.replace(/\s+/g, "_"));
    if (filterColdStore) parts.push(filterColdStore.replace(/\s+/g, "_"));
    if (filterUnsold) parts.push("unsold");
    parts.push(format(new Date(), "yyyyMMdd"));
    link.download = `${parts.join("_")}.csv`;
    
    link.click();
    URL.revokeObjectURL(link.href);

    setDownloadDialogOpen(false);
    
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
          <p className="text-destructive">{t("Error loading seed stock entries", "बीज स्टॉक एंट्री लोड करने में त्रुटि")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Download Dialog - Shows confirmation based on current filters */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Download Seed Stock Entries", "बीज स्टॉक प्रविष्टियाँ डाउनलोड करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              {t("Download will include entries based on current filters:", "डाउनलोड में वर्तमान फ़िल्टर के आधार पर प्रविष्टियाँ शामिल होंगी:")}
            </p>
            <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
              {filterSerial && <p><strong>{t("Serial #:", "क्रमांक:")}</strong> {filterSerial}</p>}
              {filterSupplier && <p><strong>{t("Supplier:", "आपूर्तिकर्ता:")}</strong> {filterSupplier}</p>}
              {filterPotatoType && <p><strong>{t("Potato Type:", "आलू का प्रकार:")}</strong> {filterPotatoType}</p>}
              {filterColdStore && <p><strong>{t("Cold Store:", "कोल्ड स्टोर:")}</strong> {filterColdStore}</p>}
              {filterUnsold && <p><strong>{t("Filter:", "फ़िल्टर:")}</strong> {t("Unsold Only", "केवल बिकाउ")}</p>}
              {!filterSerial && !filterSupplier && !filterPotatoType && !filterColdStore && !filterUnsold && (
                <p>{t("No filters applied - All entries", "कोई फ़िल्टर नहीं - सभी प्रविष्टियाँ")}</p>
              )}
              <p className="pt-2 font-medium">{t("Total entries:", "कुल प्रविष्टियाँ:")} {filteredEntries.length}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleDownloadCSV} disabled={filteredEntries.length === 0} data-testid="button-confirm-seed-download">
              <Download className="h-4 w-4 mr-2" />
              {t("Download", "डाउनलोड")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-green-300 dark:border-green-700">
        <CardContent className="py-3">
          {/* Desktop/Tablet: Single row layout */}
          <div className="hidden md:flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />

            <Popover open={serialPopoverOpenDesktop} onOpenChange={setSerialPopoverOpenDesktop}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={serialPopoverOpenDesktop}
                  className={cn(
                    "w-[100px] justify-between font-normal text-sm",
                    !filterSerial && "text-muted-foreground"
                  )}
                  data-testid="select-seed-serial-filter"
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
                            setSerialPopoverOpenDesktop(false);
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
                            setSerialPopoverOpenDesktop(false);
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

            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger className="w-[160px]" data-testid="select-seed-supplier-filter">
                <SelectValue placeholder={t("Supplier", "आपूर्तिकर्ता")} />
              </SelectTrigger>
              <SelectContent>
                {supplierNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterPotatoType} onValueChange={setFilterPotatoType}>
              <SelectTrigger className="w-[120px]" data-testid="select-seed-potato-type-filter">
                <SelectValue placeholder={t("Potato Type", "आलू प्रकार")} />
              </SelectTrigger>
              <SelectContent>
                {SEED_POTATO_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterColdStore} onValueChange={setFilterColdStore}>
              <SelectTrigger className="w-[130px]" data-testid="select-seed-cold-store-filter">
                <SelectValue placeholder={t("Cold Store", "कोल्ड स्टोर")} />
              </SelectTrigger>
              <SelectContent>
                {coldStores.map((store) => (
                  <SelectItem key={store} value={store}>{store}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={filterUnsold ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterUnsold(!filterUnsold)}
              data-testid="button-seed-unsold-filter"
            >
              {t("Unsold Only", "केवल अनबिके")}
            </Button>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-seed-filters">
                <X className="h-4 w-4 mr-1" />
                {t("Clear", "साफ करें")}
              </Button>
            )}

            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDownloadDialogOpen(true)}
              title={t("Download CSV", "CSV डाउनलोड")}
              data-testid="button-seed-download-filter-row"
            >
              <Download className="h-5 w-5" />
            </Button>
          </div>

          {/* Mobile: Multi-row layout */}
          <div className="flex flex-col gap-2 md:hidden">
            {/* Row 1: Filter icon, Serial #, Supplier */}
            <div className="flex flex-wrap items-center gap-3">
              <Filter className="h-4 w-4 text-muted-foreground" />

              <Popover open={serialPopoverOpenMobile} onOpenChange={setSerialPopoverOpenMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={serialPopoverOpenMobile}
                    className={cn(
                      "w-[100px] justify-between font-normal text-sm",
                      !filterSerial && "text-muted-foreground"
                    )}
                    data-testid="select-seed-serial-filter-mobile"
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
                              setSerialPopoverOpenMobile(false);
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
                              setSerialPopoverOpenMobile(false);
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

              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="w-[140px]" data-testid="select-seed-supplier-filter-mobile">
                  <SelectValue placeholder={t("Supplier", "आपूर्तिकर्ता")} />
                </SelectTrigger>
                <SelectContent>
                  {supplierNames.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 2: Potato Type, Cold Store */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={filterPotatoType} onValueChange={setFilterPotatoType}>
                <SelectTrigger className="w-[120px]" data-testid="select-seed-potato-type-filter-mobile">
                  <SelectValue placeholder={t("Potato Type", "आलू प्रकार")} />
                </SelectTrigger>
                <SelectContent>
                  {SEED_POTATO_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterColdStore} onValueChange={setFilterColdStore}>
                <SelectTrigger className="w-[130px]" data-testid="select-seed-cold-store-filter-mobile">
                  <SelectValue placeholder={t("Cold Store", "कोल्ड स्टोर")} />
                </SelectTrigger>
                <SelectContent>
                  {coldStores.map((store) => (
                    <SelectItem key={store} value={store}>{store}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 3: Unsold Only, Clear (when filters active) */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={filterUnsold ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterUnsold(!filterUnsold)}
                data-testid="button-seed-unsold-filter-mobile"
              >
                {t("Unsold Only", "केवल अनबिके")}
              </Button>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-seed-filters-mobile">
                  <X className="h-4 w-4 mr-1" />
                  {t("Clear", "साफ करें")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="border-blue-300 dark:border-blue-700" data-testid="card-seed-bags-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Boxes className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">{t("Bags", "बोरी")}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
                <p className="text-sm font-bold" data-testid="text-seed-bags-total">{summaryTotals.bagsTotal.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Remaining", "बचे")}</span>
                <p className="text-sm font-bold text-amber-600" data-testid="text-seed-bags-remaining">{summaryTotals.bagsRemaining.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-300 dark:border-orange-700" data-testid="card-seed-supplier-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">{t("Supplier", "आपूर्तिकर्ता")}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
                <p className="text-sm font-bold" data-testid="text-seed-supplier-total">₹{summaryTotals.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Due", "बकाया")}</span>
                <p className="text-sm font-bold text-red-600" data-testid="text-seed-supplier-due">₹{summaryTotals.totalSupplierDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-300 dark:border-purple-700" data-testid="card-seed-cold-store-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">{t("Cold Store", "कोल्ड स्टोर")}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div>
                <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
                <p className="text-sm font-bold" data-testid="text-seed-cold-total">₹{summaryTotals.coldStoreTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">{t("Due", "बकाया")}</span>
                <p className="text-sm font-bold text-red-600" data-testid="text-seed-cold-due">₹{summaryTotals.totalColdStoreDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="card-seed-extra-cost-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium">{t("Extra Cost", "अतिरिक्त लागत")}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">{t("Total", "कुल")}</span>
              <p className="text-sm font-bold" data-testid="text-seed-extra-cost-total">₹{summaryTotals.totalExtraCost.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Leaf className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {entries?.length === 0 
                ? t("No seed stock entries yet. Create your first entry!", "अभी तक कोई बीज स्टॉक एंट्री नहीं। अपनी पहली एंट्री बनाएं!")
                : t("No entries match your filters", "कोई एंट्री आपके फ़िल्टर से मेल नहीं खाती")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => {
            const potatoTypes = Array.from(new Set(entry.seedLots.map(lot => lot.potatoType)));
            let entryTotalAmount = 0;
            let entryColdStoreTotal = 0;
            
            entry.seedLots.forEach(lot => {
              const metrics = computeSeedLotMetrics(lot);
              entryTotalAmount += metrics.totalAmount;
              entryColdStoreTotal += metrics.coldStoreTotal;
            });
            entryTotalAmount = Math.round(entryTotalAmount);
            
            return (
              <Card key={entry.id} className="border border-green-300 dark:border-green-700 shadow-sm hover-elevate" data-testid={`seed-entry-card-${entry.id}`}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <div className="flex items-center gap-1" data-testid={`text-seed-serial-${entry.id}`}>
                          <Package className="h-4 w-4" style={{ color: '#52a7ff' }} />
                          <span className="font-semibold text-base">{t("Sr No:", "क्र.:")} {entry.serialNumber} -</span>
                        </div>
                        <span className="font-semibold text-base" data-testid={`text-supplier-${entry.id}`}>
                          {entry.supplierName}
                        </span>
                        
                        {potatoTypes.map((type, i) => (
                          <Badge 
                            key={i} 
                            className="text-[11px] px-2 py-0.5 font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0"
                          >
                            {type}
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{format(new Date(entry.purchaseDate), "dd MMM yyyy")}</span>
                        </div>
                        {entry.supplierContact && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{entry.supplierContact}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{entry.address ? `${entry.address}, ` : ""}{entry.district}, {entry.state}</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] mt-2">
                        {entryTotalAmount > 0 && (() => {
                          const amountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
                          const supplierDue = Math.max(entryTotalAmount - amountPaid, 0);
                          return (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{t("Supplier:", "आपूर्तिकर्ता:")}</span>{" "}
                              <span className="font-medium">{t("Total", "कुल")} ₹{entryTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                              <span className="text-muted-foreground">|</span>
                              <span className={`font-medium ${supplierDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                {t("Due", "बकाया")} ₹{supplierDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                              </span>
                            </div>
                          );
                        })()}
                        {entryColdStoreTotal > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">{t("Cold Total", "कोल्ड कुल")}</span>{" "}
                            <span className="font-medium">₹ {parseFloat(entryColdStoreTotal.toFixed(1)).toLocaleString('en-IN')}</span>
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
                        data-testid={`button-seed-edit-${entry.id}`}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        {t("Edit", "संपादित")}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8 gap-1.5 justify-start"
                            data-testid={`button-seed-print-${entry.id}`}
                          >
                            <Printer className="h-3.5 w-3.5" />
                            {t("Print", "प्रिंट")}
                            <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setBillAction("print"); setPrintEntry(entry); }} data-testid={`button-seed-print-bill-${entry.id}`}>
                            <Printer className="h-4 w-4 mr-2" />
                            {t("Print Bill", "बिल प्रिंट")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setBillAction("share"); setPrintEntry(entry); }} data-testid={`button-seed-share-bill-${entry.id}`}>
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
                    {entry.seedLots.map((lot, lotIndex) => {
                      const metrics = computeSeedLotMetrics(lot);
                      
                      return (
                        <div 
                          key={lot.id} 
                          className="py-2 px-3 bg-muted/20 rounded-md border border-border/30"
                          data-testid={`seed-lot-card-${entry.id}-${lotIndex}`}
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
                            <Badge className="text-[11px] px-2 py-0.5 font-medium bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-0">
                              {lot.size}
                            </Badge>
                            <Badge className="text-[11px] px-2 py-0.5 font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0">
                              {lot.bagType}
                            </Badge>
                            {lot.brandName && (
                              <Badge className="text-[11px] px-2 py-0.5 font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border-0">
                                {lot.brandName}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] mt-2">
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{t("Bags", "बोरी")}:</span>
                              <span className="font-medium">{metrics.originalBags}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{t("Remaining", "बाकी")}:</span>
                              <span className={`font-medium ${metrics.remainingBags < metrics.originalBags ? "text-amber-600 dark:text-amber-400" : ""}`}>
                                {metrics.remainingBags}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{t("Price/Bag", "मूल्य/बोरी")}:</span>
                              <span className="font-medium">₹{metrics.pricePerBag}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{t("Total", "कुल")}:</span>
                              <span className="font-medium">₹{metrics.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{t("Avg Cost/Bag", "औसत लागत/बोरी")}:</span>
                              <span className="font-medium text-blue-600 dark:text-blue-400">₹{metrics.avgCostPerBag.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                            </div>
                            {metrics.coldStoreTotal > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">{t("Cold", "कोल्ड")}:</span>
                                <span className="font-medium">₹{metrics.coldStoreTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                                <span className="text-muted-foreground">|</span>
                                <span className="text-muted-foreground">{t("Due", "बाकी")}:</span>
                                <span className={`font-medium ${metrics.coldStoreDue > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
                                  ₹{metrics.coldStoreDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                                </span>
                              </div>
                            )}
                            {metrics.totalExtraCost > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">{t("Extra Cost", "अतिरिक्त लागत")}:</span>
                                <span className="font-medium text-purple-600 dark:text-purple-400">₹{metrics.totalExtraCost.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                              </div>
                            )}
                          </div>
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
        <SeedStockEntryEditDialog
          entry={editEntry}
          open={!!editEntry}
          onOpenChange={(open) => !open && setEditEntry(null)}
        />
      )}
      
      {printEntry && (
        <SeedBillPrintDialog
          entry={printEntry}
          open={!!printEntry}
          onOpenChange={(open) => { if (!open) { setPrintEntry(null); setBillAction(undefined); } }}
          autoAction={billAction}
        />
      )}
    </div>
  );
}
