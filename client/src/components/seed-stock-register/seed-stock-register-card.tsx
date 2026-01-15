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
import { Search, X, Phone, MapPin, Calendar, Snowflake, Boxes, Users, Building2, Download, Leaf } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { SeedStockEntryWithLots, SEED_POTATO_TYPES } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

function computeSeedLotMetrics(lot: SeedStockEntryWithLots['seedLots'][0]) {
  const pricePerBag = lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0;
  const coldStoreChargesPerBag = lot.coldStoreChargesPerBag ? parseFloat(lot.coldStoreChargesPerBag) : 0;
  
  const totalAmount = lot.originalBags * pricePerBag;
  const coldStoreTotal = lot.originalBags * coldStoreChargesPerBag;
  const soldBags = lot.originalBags - lot.remainingBags;
  
  return {
    originalBags: lot.originalBags,
    remainingBags: lot.remainingBags,
    soldBags,
    pricePerBag,
    totalAmount,
    coldStoreChargesPerBag,
    coldStoreTotal,
  };
}

export function SeedStockRegisterCard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPotatoType, setFilterPotatoType] = useState<string>("");
  const [filterColdStore, setFilterColdStore] = useState<string>("");
  const [filterUnsold, setFilterUnsold] = useState<boolean>(false);
  
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState("");
  const [downloadEndDate, setDownloadEndDate] = useState("");

  const { data: entries, isLoading, error } = useQuery<SeedStockEntryWithLots[]>({
    queryKey: ["/api/seed-stock-entries"],
  });

  const coldStores = useMemo(() => {
    if (!entries) return [];
    const stores = new Set<string>();
    entries.forEach(entry => {
      entry.seedLots.forEach(lot => {
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
          entry.supplierName.toLowerCase().includes(search) ||
          entry.serialNumber.toString().includes(search) ||
          entry.seedLots.some(lot => lot.coldStoreName.toLowerCase().includes(search));
        if (!matchesSearch) return false;
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
  }, [entries, searchTerm, filterPotatoType, filterUnsold, filterColdStore]);

  const clearFilters = () => {
    setSearchTerm("");
    setFilterPotatoType("");
    setFilterUnsold(false);
    setFilterColdStore("");
  };

  const hasActiveFilters = searchTerm || filterPotatoType || filterUnsold || filterColdStore;

  const summaryTotals = useMemo(() => {
    let bagsTotal = 0;
    let bagsRemaining = 0;
    let totalValue = 0;
    let coldStoreTotal = 0;

    filteredEntries.forEach(entry => {
      entry.seedLots.forEach(lot => {
        const metrics = computeSeedLotMetrics(lot);
        bagsTotal += metrics.originalBags;
        bagsRemaining += metrics.remainingBags;
        totalValue += metrics.totalAmount;
        coldStoreTotal += metrics.coldStoreTotal;
      });
    });

    return { bagsTotal, bagsRemaining, totalValue, coldStoreTotal };
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
          metrics.pricePerBag.toFixed(2),
          metrics.totalAmount.toFixed(0),
          metrics.coldStoreChargesPerBag.toFixed(2),
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
    link.download = `seed_stock_entries_${downloadStartDate}_to_${downloadEndDate}.csv`;
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
          <p className="text-destructive">{t("Error loading seed stock entries", "बीज स्टॉक एंट्री लोड करने में त्रुटि")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Download Seed Stock Entries", "बीज स्टॉक प्रविष्टियाँ डाउनलोड करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="seed-start-date">{t("Start Date", "आरंभ तिथि")}</Label>
              <Input
                id="seed-start-date"
                type="date"
                value={downloadStartDate}
                onChange={(e) => setDownloadStartDate(e.target.value)}
                data-testid="input-seed-download-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seed-end-date">{t("End Date", "समाप्ति तिथि")}</Label>
              <Input
                id="seed-end-date"
                type="date"
                value={downloadEndDate}
                onChange={(e) => setDownloadEndDate(e.target.value)}
                data-testid="input-seed-download-end-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleDownloadCSV} data-testid="button-confirm-seed-download">
              <Download className="h-4 w-4 mr-2" />
              {t("Download", "डाउनलोड")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-green-500/10">
                <Leaf className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">{t("Seed Stock Register", "बीज स्टॉक रजिस्टर")}</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredEntries.length} {t("entries", "प्रविष्टियाँ")}
                </p>
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDownloadDialogOpen(true)}
              data-testid="button-download-seed-csv"
            >
              <Download className="h-4 w-4 mr-2" />
              {t("Download CSV", "CSV डाउनलोड")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Boxes className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("Total Bags", "कुल बोरी")}</span>
              </div>
              <p className="text-lg font-semibold">{summaryTotals.bagsTotal.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Boxes className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("Remaining", "बाकी")}</span>
              </div>
              <p className="text-lg font-semibold">{summaryTotals.bagsRemaining.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("Total Value", "कुल मूल्य")}</span>
              </div>
              <p className="text-lg font-semibold">₹{summaryTotals.totalValue.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("Cold Store Total", "कोल्ड स्टोर कुल")}</span>
              </div>
              <p className="text-lg font-semibold">₹{summaryTotals.coldStoreTotal.toLocaleString()}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("Search by supplier, serial #, cold store...", "आपूर्तिकर्ता, क्रमांक, कोल्ड स्टोर से खोजें...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-seed-search"
              />
            </div>
            
            <Select value={filterPotatoType} onValueChange={setFilterPotatoType}>
              <SelectTrigger className="w-[140px]" data-testid="select-seed-potato-type-filter">
                <SelectValue placeholder={t("Potato Type", "आलू प्रकार")} />
              </SelectTrigger>
              <SelectContent>
                {SEED_POTATO_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterColdStore} onValueChange={setFilterColdStore}>
              <SelectTrigger className="w-[160px]" data-testid="select-seed-cold-store-filter">
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
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
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
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <Card key={entry.id} className="overflow-hidden" data-testid={`seed-entry-card-${entry.id}`}>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        #{entry.serialNumber}
                      </Badge>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(entry.purchaseDate), "dd MMM yyyy")}
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-medium text-lg">{entry.supplierName}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                        {entry.supplierContact && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {entry.supplierContact}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {entry.district}, {entry.state}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {entry.seedLots.map((lot, lotIndex) => {
                        const metrics = computeSeedLotMetrics(lot);
                        return (
                          <div
                            key={lot.id}
                            className="p-3 rounded-lg bg-muted/30 border border-border/50"
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <Badge variant="secondary" className="text-xs">
                                {t("Lot", "लॉट")} {lotIndex + 1}
                              </Badge>
                              <span className="flex items-center gap-1 text-sm">
                                <Snowflake className="h-3.5 w-3.5 text-blue-500" />
                                {lot.coldStoreName}
                              </span>
                              <Badge variant="outline">{lot.potatoType}</Badge>
                              <Badge variant="outline">{lot.size}</Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">{t("Original", "मूल")}:</span>
                                <span className="ml-1 font-medium">{metrics.originalBags} {t("bags", "बोरी")}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t("Remaining", "बाकी")}:</span>
                                <span className="ml-1 font-medium">{metrics.remainingBags} {t("bags", "बोरी")}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t("Price/Bag", "मूल्य/बोरी")}:</span>
                                <span className="ml-1 font-medium">₹{metrics.pricePerBag}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t("Total", "कुल")}:</span>
                                <span className="ml-1 font-medium">₹{metrics.totalAmount.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
