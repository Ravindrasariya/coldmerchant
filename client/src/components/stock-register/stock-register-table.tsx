import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter, Edit, Printer, Package, X } from "lucide-react";
import { QUALITY_OPTIONS, PAYMENT_STATUS } from "@shared/schema";
import { StockEntryEditDialog } from "./stock-entry-edit-dialog";
import { BillPrintDialog } from "./bill-print-dialog";

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

export function StockRegisterTable() {
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
          <p className="text-destructive">Error loading stock entries</p>
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
                placeholder="Search by farmer name, serial # or cold store..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filters:</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            <Select value={filterPaymentStatus} onValueChange={setFilterPaymentStatus}>
              <SelectTrigger className="w-[140px]" data-testid="filter-payment-status">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterQuality} onValueChange={setFilterQuality}>
              <SelectTrigger className="w-[130px]" data-testid="filter-quality">
                <SelectValue placeholder="Quality" />
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
                <SelectValue placeholder="Cold Store" />
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
              Unsold Only
            </Button>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">No stock entries found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {hasActiveFilters ? "Try adjusting your filters" : "Create your first stock entry to get started"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[80px] text-xs uppercase font-semibold tracking-wide">Serial #</TableHead>
                    <TableHead className="text-xs uppercase font-semibold tracking-wide">Date</TableHead>
                    <TableHead className="text-xs uppercase font-semibold tracking-wide">Farmer</TableHead>
                    <TableHead className="text-xs uppercase font-semibold tracking-wide">Cold Store</TableHead>
                    <TableHead className="text-xs uppercase font-semibold tracking-wide text-right">Bags</TableHead>
                    <TableHead className="text-xs uppercase font-semibold tracking-wide">Quality</TableHead>
                    <TableHead className="text-xs uppercase font-semibold tracking-wide">Payment</TableHead>
                    <TableHead className="w-[100px] text-xs uppercase font-semibold tracking-wide text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => {
                    const totalOriginalBags = entry.lots.reduce((sum, lot) => sum + lot.originalBags, 0);
                    const totalRemainingBags = entry.lots.reduce((sum, lot) => sum + lot.remainingBags, 0);
                    const qualities = Array.from(new Set(entry.lots.map(lot => lot.quality)));
                    const coldStores = Array.from(new Set(entry.lots.map(lot => lot.coldStoreName)));

                    return (
                      <TableRow key={entry.id} className="hover-elevate" data-testid={`row-entry-${entry.id}`}>
                        <TableCell className="font-mono font-medium" data-testid={`text-serial-${entry.id}`}>
                          #{entry.serialNumber}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(entry.purchaseDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium" data-testid={`text-farmer-${entry.id}`}>{entry.farmerName}</p>
                            {entry.village && (
                              <p className="text-xs text-muted-foreground">{entry.village}, {entry.district}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {coldStores.map((store, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {store}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <span className="font-medium">{totalRemainingBags}</span>
                          <span className="text-muted-foreground">/{totalOriginalBags}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {qualities.map((q, i) => (
                              <Badge 
                                key={i} 
                                variant="secondary"
                                className={
                                  q === "Good" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                                  q === "Medium" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" :
                                  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                }
                              >
                                {q}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={entry.paymentStatus === "paid" ? "default" : "outline"}
                            className={entry.paymentStatus === "paid" ? "bg-green-600" : "border-orange-500 text-orange-600"}
                          >
                            {entry.paymentStatus === "paid" ? "Paid" : "Due"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditEntry(entry)}
                              data-testid={`button-edit-${entry.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPrintEntry(entry)}
                              data-testid={`button-print-${entry.id}`}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
