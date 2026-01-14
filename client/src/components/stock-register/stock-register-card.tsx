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
import { Search, Filter, Edit, Printer, Package, X, Phone, MapPin, Calendar } from "lucide-react";
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
    remarks: string | null;
    bagBreakdowns: Array<{
      id: number;
      size: string;
      numberOfBags: number;
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
  
  return {
    originalBags: lot.originalBags,
    wastageBags,
    actualSellableBags,
    remainingToSell,
    soldBags,
    totalWeight,
    totalAmount,
    pricePerKg: lot.pricePerKg ? parseFloat(lot.pricePerKg) : null,
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
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterQuality, setFilterQuality] = useState<string>("");
  const [filterUnsold, setFilterUnsold] = useState<boolean>(false);
  const [filterColdStore, setFilterColdStore] = useState<string>("");
  const [editEntry, setEditEntry] = useState<StockEntryWithLots | null>(null);
  const [printEntry, setPrintEntry] = useState<StockEntryWithLots | null>(null);

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
            
            lotsWithMetrics.forEach(({ metrics }) => {
              totalOriginal += metrics.originalBags;
              totalWastage += metrics.wastageBags;
              totalActual += metrics.actualSellableBags;
              totalRemaining += metrics.remainingToSell;
            });

            return (
              <Card key={entry.id} className="border-border hover-elevate" data-testid={`card-entry-${entry.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-bold text-primary" data-testid={`text-serial-${entry.id}`}>
                        #{entry.serialNumber}
                      </span>
                      <span className="font-semibold text-lg" data-testid={`text-farmer-${entry.id}`}>
                        {entry.farmerName}
                      </span>
                      
                      {potatoTypes.map((type, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {type}
                        </Badge>
                      ))}
                      
                      <Badge 
                        variant={entry.paymentStatus === "paid" ? "default" : "outline"}
                        className={entry.paymentStatus === "paid" ? "bg-green-600" : "border-orange-500 text-orange-600"}
                      >
                        {entry.paymentStatus === "paid" ? t("Paid", "भुगतान हो गया") : t("Due", "बाकी")}
                      </Badge>
                      
                      <Badge 
                        variant="outline"
                        className={
                          entryStatus === 'sold' ? "border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20" :
                          entryStatus === 'partial' ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20" :
                          "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-900/20"
                        }
                      >
                        {entryStatus === 'sold' ? t("Sold", "बिक गया") :
                         entryStatus === 'partial' ? t("Partial Sold", "आंशिक बिका") :
                         t("Unsold", "बिना बिका")}
                      </Badge>
                    </div>
                    
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditEntry(entry)}
                        data-testid={`button-edit-${entry.id}`}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        {t("Edit", "संपादित करें")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPrintEntry(entry)}
                        data-testid={`button-print-${entry.id}`}
                      >
                        <Printer className="h-4 w-4 mr-1" />
                        {t("Print", "प्रिंट")}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {new Date(entry.purchaseDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
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
                  
                  <div className="mt-2 text-sm">
                    <span className="text-muted-foreground">{t("Total:", "कुल:")}</span>{" "}
                    {totalWastage > 0 && (
                      <>
                        <span className="font-medium">{totalActual}/{totalOriginal}</span>
                        <span className="text-muted-foreground ml-1">
                          ({totalWastage} {t("Wastage", "कचरा")})
                        </span>
                        <span className="text-muted-foreground">, </span>
                      </>
                    )}
                    <span className="text-primary font-bold">{totalRemaining}</span>
                    <span className="text-muted-foreground">/{totalActual}</span>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {lotsWithMetrics.map(({ lot, metrics }, lotIndex) => {
                      return (
                        <div 
                          key={lot.id} 
                          className="p-3 bg-muted/30 rounded-lg border border-border/50"
                          data-testid={`lot-card-${entry.id}-${lotIndex}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                {t("Lot", "लॉट")} {lotIndex + 1}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{lot.coldStoreName}</span>
                              <Badge variant="secondary" className="text-xs">
                                {lot.potatoType}
                              </Badge>
                              <Badge 
                                variant="secondary"
                                className={
                                  lot.quality === "Good" ? "text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                                  lot.quality === "Medium" ? "text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" :
                                  "text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                }
                              >
                                {lot.quality}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {lot.bagType}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {lot.cutType === "gate_cut" ? t("Gate Cut", "गेट कट") : t("Bilty Cut", "बिल्टी कट")}
                              </Badge>
                              {lot.size && lot.cutType === "gate_cut" && (
                                <Badge variant="secondary" className="text-xs">
                                  {lot.size}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="text-sm">
                              {metrics.wastageBags > 0 && (
                                <>
                                  <span className="text-muted-foreground">{t("Original", "मूल")} #</span>
                                  <span className="font-medium">{metrics.originalBags}</span>
                                  <span className="text-muted-foreground">, {t("Actual", "वास्तविक")} </span>
                                </>
                              )}
                              <span className="font-mono font-bold text-primary">{metrics.remainingToSell}</span>
                              <span className="text-muted-foreground">/{metrics.actualSellableBags}</span>
                              {metrics.wastageBags > 0 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({metrics.wastageBags} {t("Wastage", "कचरा")})
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {lot.cutType === "bilty_cut" && (metrics.sellableBreakdowns.length > 0 || metrics.wastageBreakdowns.length > 0) && (
                            <div className="mt-2 pt-2 border-t border-border/30">
                              <div className="flex flex-wrap items-center gap-2">
                                {metrics.sellableBreakdowns.map((bd, bdIndex) => {
                                  const bdPrice = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
                                  const bdWeight = bd.weight ? parseFloat(bd.weight) : 0;
                                  const bdTotal = bd.totalAmount 
                                    ? parseFloat(bd.totalAmount) 
                                    : (bdPrice > 0 && bdWeight > 0 ? bdPrice * bdWeight : null);
                                  
                                  return (
                                    <div 
                                      key={bd.id || bdIndex}
                                      className="text-xs px-2 py-1 rounded border bg-background border-border"
                                    >
                                      <span className="font-medium">{bd.size}</span>
                                      <span className="text-muted-foreground mx-1">×</span>
                                      <span>{bd.numberOfBags}</span>
                                      {bdWeight > 0 && (
                                        <>
                                          <span className="text-muted-foreground mx-1">|</span>
                                          <span>{bdWeight}kg</span>
                                        </>
                                      )}
                                      {bdPrice > 0 && (
                                        <>
                                          <span className="text-muted-foreground mx-1">@</span>
                                          <span>₹{bdPrice}/kg</span>
                                        </>
                                      )}
                                      {bdTotal !== null && (
                                        <>
                                          <span className="text-muted-foreground mx-1">=</span>
                                          <span className="font-medium text-green-600 dark:text-green-400">₹{bdTotal.toFixed(0)}</span>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                                {metrics.wastageBreakdowns.map((bd, bdIndex) => (
                                  <div 
                                    key={bd.id || `wastage-${bdIndex}`}
                                    className="text-xs px-2 py-1 rounded border bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
                                  >
                                    <span className="font-medium">{t("Wastage", "कचरा")}</span>
                                    <span className="mx-1">×</span>
                                    <span>{bd.numberOfBags}</span>
                                  </div>
                                ))}
                                {metrics.totalAmount !== null && (
                                  <div className="text-xs px-2 py-1 rounded border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                                    <span className="text-muted-foreground">{t("Total:", "कुल:")}</span>{" "}
                                    <span className="font-medium text-green-600 dark:text-green-400">₹{metrics.totalAmount.toFixed(0)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {lot.cutType === "gate_cut" && metrics.pricePerKg && (
                            <div className="mt-2 text-sm text-muted-foreground">
                              <span>{t("Price:", "मूल्य:")}</span>{" "}
                              <span className="font-medium text-foreground">₹{metrics.pricePerKg}/kg</span>
                            </div>
                          )}
                          
                          {lot.remarks && (
                            <div className="mt-2 text-xs text-muted-foreground italic">
                              {t("Remarks:", "टिप्पणी:")} {lot.remarks}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {entry.remarks && (
                    <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                      <span className="font-medium">{t("Remarks:", "टिप्पणी:")}</span> {entry.remarks}
                    </div>
                  )}
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
