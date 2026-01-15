import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Package, TrendingUp, TrendingDown, Filter, X, Download, Leaf, MapPin, Phone, IndianRupee } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { LoadSeedTruckDialog } from "./load-seed-truck-dialog";

interface SeedTransactionItem {
  id: number;
  seedLotId: number;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string;
  size: string;
  bagType: string;
  bagsMoved: number;
  pricePerBag: string;
  costPerBag: string;
  revenue: string;
  cost: string;
  profitLoss: string;
}

interface SeedTransaction {
  id: number;
  merchantId: number;
  transactionNumber: number;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  vehicleNumber: string | null;
  transportCharges: string | null;
  otherCharges: string | null;
  otherChargesRemarks: string | null;
  totalBags: number;
  totalCost: string | null;
  totalRevenue: string | null;
  totalProfitLoss: string | null;
  totalDueToFarmer: string | null;
  createdAt: string;
  items: SeedTransactionItem[];
}

interface SeedTransactionsContentProps {
  transactionMode: "raw" | "seed";
  setTransactionMode: (mode: "raw" | "seed") => void;
}

export function SeedTransactionsContent({ transactionMode, setTransactionMode }: SeedTransactionsContentProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState("");
  const [downloadEndDate, setDownloadEndDate] = useState("");
  
  const [filterTxnNumber, setFilterTxnNumber] = useState("");
  const [filterFarmer, setFilterFarmer] = useState("all");

  const { data: transactions, isLoading } = useQuery<SeedTransaction[]>({
    queryKey: ["/api/seed-transactions"],
  });

  const farmerNames = useMemo(() => {
    if (!transactions) return [];
    const names = transactions.map(t => t.farmerName).filter(Boolean);
    return Array.from(new Set(names));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    
    return transactions.filter(txn => {
      if (filterTxnNumber && !txn.transactionNumber.toString().includes(filterTxnNumber)) {
        return false;
      }
      if (filterFarmer !== "all" && txn.farmerName !== filterFarmer) {
        return false;
      }
      return true;
    });
  }, [transactions, filterTxnNumber, filterFarmer]);

  const hasActiveFilters = filterTxnNumber || filterFarmer !== "all";

  const clearFilters = () => {
    setFilterTxnNumber("");
    setFilterFarmer("all");
  };

  const summary = useMemo(() => {
    let totalBags = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfitLoss = 0;
    let totalDue = 0;

    filteredTransactions.forEach(txn => {
      totalBags += txn.totalBags;
      totalRevenue += parseFloat(txn.totalRevenue || "0");
      totalCost += parseFloat(txn.totalCost || "0");
      totalProfitLoss += parseFloat(txn.totalProfitLoss || "0");
      totalDue += parseFloat(txn.totalDueToFarmer || "0");
    });

    return { totalBags, totalRevenue, totalCost, totalProfitLoss, totalDue, count: filteredTransactions.length };
  }, [filteredTransactions]);

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

    const filteredForDownload = (transactions || []).filter(txn => {
      const txnDate = new Date(txn.createdAt);
      return txnDate >= startDate && txnDate <= endDate;
    });

    if (filteredForDownload.length === 0) {
      toast({
        title: t("No Data", "कोई डेटा नहीं"),
        description: t("No transactions found in the selected date range", "चयनित तिथि सीमा में कोई लेनदेन नहीं मिला"),
        variant: "destructive",
      });
      return;
    }

    const headers = [
      t("Txn #", "लेनदेन #"),
      t("Date", "तिथि"),
      t("Farmer Name", "किसान का नाम"),
      t("Village", "गाँव"),
      t("District", "जिला"),
      t("Vehicle #", "वाहन #"),
      t("Items (S# - Type - Size - Bags)", "आइटम (क्रमांक - प्रकार - साइज - बैग)"),
      t("Total Bags", "कुल बैग"),
      t("Total Cost ₹", "कुल लागत ₹"),
      t("Total Revenue ₹", "कुल राजस्व ₹"),
      t("Profit/Loss ₹", "लाभ/हानि ₹"),
      t("Transport ₹", "परिवहन ₹"),
      t("Other Charges ₹", "अन्य शुल्क ₹"),
      t("Total Due ₹", "कुल देय ₹"),
    ];

    const rows = filteredForDownload.map(txn => {
      const itemsDetail = txn.items.map(item => 
        `S#${item.serialNumber} (${item.potatoType} - ${item.size} - ${item.bagsMoved})`
      ).join(", ");
      
      return [
        txn.transactionNumber.toString(),
        format(new Date(txn.createdAt), "dd/MM/yyyy"),
        txn.farmerName,
        txn.village || "-",
        txn.district,
        txn.vehicleNumber || "-",
        itemsDetail || "-",
        txn.totalBags.toString(),
        txn.totalCost || "0",
        txn.totalRevenue || "0",
        txn.totalProfitLoss || "0",
        txn.transportCharges || "0",
        txn.otherCharges || "0",
        txn.totalDueToFarmer || "0",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `seed_transactions_${downloadStartDate}_to_${downloadEndDate}.csv`;
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Download Dialog */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Download Seed Transactions", "बीज लेनदेन डाउनलोड करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="seed-txn-start-date">{t("Start Date", "आरंभ तिथि")}</Label>
              <Input
                id="seed-txn-start-date"
                type="date"
                value={downloadStartDate}
                onChange={(e) => setDownloadStartDate(e.target.value)}
                data-testid="input-seed-txn-download-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seed-txn-end-date">{t("End Date", "समाप्ति तिथि")}</Label>
              <Input
                id="seed-txn-end-date"
                type="date"
                value={downloadEndDate}
                onChange={(e) => setDownloadEndDate(e.target.value)}
                data-testid="input-seed-txn-download-end-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} data-testid="button-seed-txn-download-cancel">
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleDownloadCSV} data-testid="button-seed-txn-download-csv">
              <Download className="h-4 w-4 mr-2" />
              {t("Download CSV", "CSV डाउनलोड करें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Seed Truck Dialog */}
      <LoadSeedTruckDialog
        open={showLoadDialog}
        onOpenChange={setShowLoadDialog}
      />

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("Seed Transactions", "बीज लेनदेन")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Manage seed sales transactions", "बीज बिक्री लेनदेन प्रबंधित करें")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Raw Potato / Seed Toggle */}
          <div className="flex items-center border rounded-md p-0.5 bg-muted/30">
            <Button
              variant={transactionMode === "raw" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTransactionMode("raw")}
              className="h-8 text-xs gap-1"
              data-testid="button-seed-txn-raw-mode"
            >
              <Package className="h-3.5 w-3.5" />
              {t("Raw Potato", "कच्चा आलू")}
            </Button>
            <Button
              variant={transactionMode === "seed" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTransactionMode("seed")}
              className="h-8 text-xs gap-1"
              data-testid="button-seed-txn-seed-mode"
            >
              <Leaf className="h-3.5 w-3.5" />
              {t("Seed", "बीज")}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDownloadDialogOpen(true)}
            title={t("Download", "डाउनलोड")}
            data-testid="button-seed-txn-download"
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button onClick={() => setShowLoadDialog(true)} data-testid="button-load-seed-truck">
            <Truck className="h-4 w-4 mr-2" />
            {t("Load Seed Truck", "बीज ट्रक लोड करें")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      {transactions && transactions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
              </div>
              
              <Input
                placeholder={t("Transaction #", "लेनदेन #")}
                value={filterTxnNumber}
                onChange={(e) => setFilterTxnNumber(e.target.value)}
                className="w-32 h-9"
                data-testid="filter-seed-txn-number"
              />
              
              <Select value={filterFarmer} onValueChange={setFilterFarmer}>
                <SelectTrigger className="w-40 h-9" data-testid="filter-seed-farmer">
                  <SelectValue placeholder={t("Farmer", "किसान")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All Farmers", "सभी किसान")}</SelectItem>
                  {farmerNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={() => setShowLoadDialog(true)} size="sm" data-testid="button-load-seed-truck-filter">
                <Truck className="h-4 w-4 mr-2" />
                {t("Load Seed Truck", "बीज ट्रक")}
              </Button>
              
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-seed-filters">
                  <X className="h-4 w-4 mr-1" />
                  {t("Clear", "साफ़ करें")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">{t("Transactions", "लेनदेन")}</div>
          <div className="text-lg font-semibold">{summary.count}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">{t("Total Bags", "कुल बैग")}</div>
          <div className="text-lg font-semibold">{summary.totalBags}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">{t("Revenue", "राजस्व")}</div>
          <div className="text-lg font-semibold text-green-600">₹{summary.totalRevenue.toLocaleString("en-IN")}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">{t("Cost", "लागत")}</div>
          <div className="text-lg font-semibold">₹{summary.totalCost.toLocaleString("en-IN")}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">{t("P&L", "लाभ/हानि")}</div>
          <div className={`text-lg font-semibold ${summary.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
            {summary.totalProfitLoss >= 0 ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
            ₹{Math.abs(summary.totalProfitLoss).toLocaleString("en-IN")}
          </div>
        </Card>
      </div>

      {/* Transaction List */}
      {filteredTransactions.length === 0 ? (
        <Card className="p-8 text-center">
          <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("No Seed Transactions", "कोई बीज लेनदेन नहीं")}</h3>
          <p className="text-muted-foreground mt-1">
            {t("Create your first seed transaction to get started", "शुरू करने के लिए अपना पहला बीज लेनदेन बनाएं")}
          </p>
          <Button className="mt-4" onClick={() => setShowLoadDialog(true)}>
            <Truck className="h-4 w-4 mr-2" />
            {t("Load Seed Truck", "बीज ट्रक लोड करें")}
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTransactions.map((txn) => {
            const profitLoss = parseFloat(txn.totalProfitLoss || "0");
            const isProfit = profitLoss >= 0;
            
            return (
              <Card key={txn.id} className="overflow-hidden" data-testid={`seed-txn-card-${txn.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono">
                        #{txn.transactionNumber}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(txn.createdAt), "dd MMM yyyy")}
                      </span>
                    </div>
                    <Badge className={`${isProfit ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"} border-0`}>
                      {isProfit ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                      ₹{Math.abs(profitLoss).toLocaleString("en-IN")}
                    </Badge>
                  </div>
                  
                  <div className="mb-3">
                    <div className="font-semibold text-base">{txn.farmerName}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
                      {txn.village && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {txn.village}, {txn.district}
                        </span>
                      )}
                      {txn.farmerContact && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {txn.farmerContact}
                        </span>
                      )}
                      {txn.vehicleNumber && (
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          {txn.vehicleNumber}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {txn.items.map((item, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        S#{item.serialNumber} · {item.potatoType} · {item.size} · {item.bagsMoved} bags
                      </Badge>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t text-sm">
                    <div>
                      <span className="text-muted-foreground">{t("Bags", "बैग")}:</span>
                      <span className="ml-1 font-medium">{txn.totalBags}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("Revenue", "राजस्व")}:</span>
                      <span className="ml-1 font-medium text-green-600">₹{parseFloat(txn.totalRevenue || "0").toLocaleString("en-IN")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("Cost", "लागत")}:</span>
                      <span className="ml-1 font-medium">₹{parseFloat(txn.totalCost || "0").toLocaleString("en-IN")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("Due", "देय")}:</span>
                      <span className="ml-1 font-medium text-orange-600">₹{parseFloat(txn.totalDueToFarmer || "0").toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
