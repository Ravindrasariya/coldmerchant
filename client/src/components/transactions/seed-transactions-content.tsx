import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Truck, Package, TrendingUp, TrendingDown, Filter, X, Download, MapPin, Phone, IndianRupee, Printer, Edit, FileText, ChevronsUpDown, Check, Receipt, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { LoadSeedTruckDialog } from "./load-seed-truck-dialog";
import { EditSeedTransactionDialog } from "./edit-seed-transaction-dialog";
import { SeedSalesReceiptDialog } from "./seed-sales-receipt";

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
  uniqueId: string | null;
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
  adjustmentType: string | null;
  adjustmentAmount: string | null;
  adjustmentRate: string | null;
  adjustmentEffectiveDate: string | null;
  adjustmentReason: string | null;
  createdAt: string;
  items: SeedTransactionItem[];
}

export function SeedTransactionsContent() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [editTransactionId, setEditTransactionId] = useState<number | null>(null);
  const [receiptTransactionId, setReceiptTransactionId] = useState<number | null>(null);
  
  // Download dialog state (uses filtered transactions directly)
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterTxnNumber, setFilterTxnNumber] = useState("");
  const [filterSerialNumber, setFilterSerialNumber] = useState("");
  const [filterFarmer, setFilterFarmer] = useState("");
  const [filterPaymentDue, setFilterPaymentDue] = useState("all");
  const [farmerDropdownOpen, setFarmerDropdownOpen] = useState(false);

  const { data: transactions, isLoading } = useQuery<SeedTransaction[]>({
    queryKey: ["/api/seed-transactions"],
  });

  // Get unique years for dropdown
  const availableYears = useMemo(() => {
    if (!transactions) return [new Date().getFullYear().toString()];
    const years = transactions.map(t => new Date(t.createdAt).getFullYear().toString());
    const uniqueYears = Array.from(new Set(years)).sort((a, b) => parseInt(b) - parseInt(a));
    return uniqueYears.length > 0 ? uniqueYears : [new Date().getFullYear().toString()];
  }, [transactions]);

  const farmerOptions = useMemo(() => {
    if (!transactions) return [];
    const farmerMap = new Map<string, { name: string; village: string | null; contact: string | null }>();
    transactions.forEach(t => {
      if (t.farmerName) {
        const key = t.farmerName.toLowerCase();
        if (!farmerMap.has(key)) {
          farmerMap.set(key, {
            name: t.farmerName,
            village: t.village,
            contact: t.farmerContact,
          });
        }
      }
    });
    return Array.from(farmerMap.values());
  }, [transactions]);

  const farmerNames = useMemo(() => {
    return farmerOptions.map(f => f.name);
  }, [farmerOptions]);

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    
    return transactions.filter(txn => {
      // Filter by year
      if (filterYear && new Date(txn.createdAt).getFullYear().toString() !== filterYear) {
        return false;
      }
      if (filterTxnNumber && !txn.transactionNumber.toString().includes(filterTxnNumber)) {
        return false;
      }
      if (filterSerialNumber) {
        const hasMatchingSerial = txn.items.some(item => 
          item.serialNumber.toString().includes(filterSerialNumber)
        );
        if (!hasMatchingSerial) return false;
      }
      if (filterFarmer && !txn.farmerName.toLowerCase().includes(filterFarmer.toLowerCase())) {
        return false;
      }
      if (filterPaymentDue !== "all") {
        const dueAmount = getTotalDueWithAdjustment(txn);
        if (filterPaymentDue === "due" && dueAmount <= 0) return false;
        if (filterPaymentDue === "paid" && dueAmount > 0) return false;
      }
      return true;
    });
  }, [transactions, filterYear, filterTxnNumber, filterSerialNumber, filterFarmer, filterPaymentDue]);

  const currentYear = new Date().getFullYear().toString();
  const hasActiveFilters = filterYear !== currentYear || filterTxnNumber || filterSerialNumber || filterFarmer || filterPaymentDue !== "all";

  const clearFilters = () => {
    setFilterYear(new Date().getFullYear().toString());
    setFilterTxnNumber("");
    setFilterSerialNumber("");
    setFilterFarmer("");
    setFilterPaymentDue("all");
  };

  // Helper function to calculate dynamic interest adjustment for a transaction
  // Interest-only: returns 0 if no rate/date, otherwise calculates P × ((1 + r)^t - 1)
  const calculateDynamicAdjustment = (txn: SeedTransaction): number => {
    const principal = parseFloat(txn.adjustmentAmount || "0");
    const rate = parseFloat(txn.adjustmentRate || "0");
    const effectiveDate = txn.adjustmentEffectiveDate;
    
    if (principal <= 0 || rate <= 0 || !effectiveDate) return 0;
    
    const startDate = new Date(effectiveDate);
    const today = new Date();
    const days = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const years = days / 365;
    // Interest-only formula
    const interest = Math.round((principal * (Math.pow(1 + rate / 100, years) - 1)) * 100) / 100;
    return txn.adjustmentType === "credit" ? interest : -interest;
  };

  // Helper function to get total due with dynamic adjustment
  const getTotalDueWithAdjustment = (txn: SeedTransaction): number => {
    const baseDue = parseFloat(txn.totalDueToFarmer || "0");
    const dynamicAdjustment = calculateDynamicAdjustment(txn);
    return baseDue + dynamicAdjustment;
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
      totalDue += getTotalDueWithAdjustment(txn);
    });

    return { totalBags, totalRevenue, totalCost, totalProfitLoss, totalDue, count: filteredTransactions.length };
  }, [filteredTransactions]);

  const handleDownloadCSV = () => {
    // Use already-filtered transactions based on applied filters
    if (filteredTransactions.length === 0) {
      toast({
        title: t("No Data", "कोई डेटा नहीं"),
        description: t("No transactions match the current filters", "वर्तमान फ़िल्टर से कोई लेनदेन नहीं मिला"),
        variant: "destructive",
      });
      return;
    }

    const filteredForDownload = filteredTransactions;

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
    
    // Generate descriptive filename based on applied filters
    const parts = ["seed_transactions"];
    if (filterYear) parts.push(filterYear);
    if (filterTxnNumber) parts.push(`txn${filterTxnNumber}`);
    if (filterSerialNumber) parts.push(`sr${filterSerialNumber}`);
    if (filterFarmer) parts.push(filterFarmer.replace(/\s+/g, "_"));
    if (filterPaymentDue !== "all") parts.push(filterPaymentDue);
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
      {/* Download Dialog - Shows confirmation based on current filters */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Download Seed Transactions", "बीज लेनदेन डाउनलोड करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              {t("Download will include transactions based on current filters:", "डाउनलोड में वर्तमान फ़िल्टर के आधार पर लेनदेन शामिल होंगे:")}
            </p>
            <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
              <p><strong>{t("Year:", "वर्ष:")}</strong> {filterYear || t("All Years", "सभी वर्ष")}</p>
              {filterTxnNumber && <p><strong>{t("Txn #:", "लेनदेन #:")}</strong> {filterTxnNumber}</p>}
              {filterSerialNumber && <p><strong>{t("Serial #:", "क्रमांक:")}</strong> {filterSerialNumber}</p>}
              {filterFarmer && <p><strong>{t("Farmer:", "किसान:")}</strong> {filterFarmer}</p>}
              {filterPaymentDue !== "all" && <p><strong>{t("Status:", "स्थिति:")}</strong> {filterPaymentDue === "due" ? t("Due", "बकाया") : t("Paid", "भुगतान किया")}</p>}
              {!filterYear && !filterTxnNumber && !filterSerialNumber && !filterFarmer && filterPaymentDue === "all" && (
                <p>{t("No filters applied - All transactions", "कोई फ़िल्टर नहीं - सभी लेनदेन")}</p>
              )}
              <p className="pt-2 font-medium">{t("Total transactions:", "कुल लेनदेन:")} {filteredTransactions.length}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} data-testid="button-seed-txn-download-cancel">
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleDownloadCSV} disabled={filteredTransactions.length === 0} data-testid="button-seed-txn-download-csv">
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

      <EditSeedTransactionDialog
        transactionId={editTransactionId}
        open={editTransactionId !== null}
        onOpenChange={(open) => !open && setEditTransactionId(null)}
      />

      <SeedSalesReceiptDialog
        transactionId={receiptTransactionId}
        merchantId={transactions?.[0]?.merchantId || 0}
        open={receiptTransactionId !== null}
        onOpenChange={(open) => !open && setReceiptTransactionId(null)}
      />

      {/* Filters Row */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Mobile: Buttons at top, full width */}
        <div className="flex gap-2 md:hidden">
          <Button onClick={() => setShowLoadDialog(true)} className="flex-1" data-testid="button-load-seed-truck-mobile">
            <Truck className="h-4 w-4 mr-2" />
            {t("Load Seed Truck", "बीज ट्रक लोड करें")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDownloadDialogOpen(true)}
            title={t("Download", "डाउनलोड")}
            data-testid="button-seed-txn-download-mobile"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>

        <Card className="flex-1">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
              </div>
              
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-24 h-9" data-testid="filter-seed-year">
                  <SelectValue placeholder={t("Year", "वर्ष")} />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Input
                placeholder={t("Transaction #", "लेनदेन #")}
                value={filterTxnNumber}
                onChange={(e) => setFilterTxnNumber(e.target.value)}
                className="w-28 h-9"
                data-testid="filter-seed-txn-number"
              />

              <Input
                placeholder={t("Serial #", "सीरियल #")}
                value={filterSerialNumber}
                onChange={(e) => setFilterSerialNumber(e.target.value)}
                className="w-24 h-9"
                data-testid="filter-seed-serial-number"
              />
                
              <Popover open={farmerDropdownOpen} onOpenChange={setFarmerDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={farmerDropdownOpen}
                    className="w-44 h-9 justify-between font-normal"
                    data-testid="filter-seed-farmer"
                  >
                    {filterFarmer || t("Farmer", "किसान")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-0">
                  <Command>
                    <CommandInput 
                      placeholder={t("Search farmer...", "किसान खोजें...")} 
                      value={filterFarmer}
                      onValueChange={setFilterFarmer}
                    />
                    <CommandList>
                      <CommandEmpty>{t("No farmer found", "कोई किसान नहीं मिला")}</CommandEmpty>
                      <CommandGroup>
                        {farmerOptions
                          .filter(f => f.name.toLowerCase().includes(filterFarmer.toLowerCase()))
                          .map(farmer => (
                            <CommandItem
                              key={farmer.name}
                              value={farmer.name}
                              onSelect={(value) => {
                                setFilterFarmer(value === filterFarmer ? "" : value);
                                setFarmerDropdownOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", filterFarmer === farmer.name ? "opacity-100" : "opacity-0")} />
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

              <Select value={filterPaymentDue} onValueChange={setFilterPaymentDue}>
                <SelectTrigger className="w-32 h-9" data-testid="filter-seed-payment-due">
                  <SelectValue placeholder={t("Payment", "भुगतान")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All", "सभी")}</SelectItem>
                  <SelectItem value="due">{t("Due", "बकाया")}</SelectItem>
                  <SelectItem value="paid">{t("Paid", "भुगतान")}</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-seed-filters">
                  <X className="h-4 w-4 mr-1" />
                  {t("Clear", "साफ़ करें")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Desktop: Buttons on right */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDownloadDialogOpen(true)}
          title={t("Download", "डाउनलोड")}
          className="hidden md:flex"
          data-testid="button-seed-txn-download"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button onClick={() => setShowLoadDialog(true)} className="hidden md:flex" data-testid="button-load-seed-truck">
          <Truck className="h-4 w-4 mr-2" />
          {t("Load Seed Truck", "बीज ट्रक लोड करें")}
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <FileText className="h-3.5 w-3.5" />
              {t("Transactions & Bags", "लेनदेन और बैग")}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold">{summary.count}</span>
              <span className="text-muted-foreground">|</span>
              <span className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-lg font-semibold">{summary.totalBags}</span>
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <IndianRupee className="h-3.5 w-3.5" />
              {t("Total Revenue", "कुल राजस्व")}
            </div>
            <div className="text-lg font-semibold text-green-600">₹{summary.totalRevenue.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Receipt className="h-3.5 w-3.5" />
              {t("Total Cost", "कुल लागत")}
            </div>
            <div className="text-lg font-semibold">₹{summary.totalCost.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              {summary.totalProfitLoss >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {t("Total P&L", "कुल लाभ/हानि")}
            </div>
            <div className={`text-lg font-semibold ${summary.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
              ₹{Math.abs(summary.totalProfitLoss).toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3.5 w-3.5" />
              {t("Total Due", "कुल बकाया")}
            </div>
            <div className="text-lg font-semibold text-orange-600">₹{summary.totalDue.toLocaleString("en-IN")}</div>
          </CardContent>
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
        <div className="space-y-4">
          {filteredTransactions.map((txn) => {
            const profitLoss = parseFloat(txn.totalProfitLoss || "0");
            const revenue = parseFloat(txn.totalRevenue || "0");
            const cost = parseFloat(txn.totalCost || "0");
            const dueAmount = getTotalDueWithAdjustment(txn);
            const dynamicAdjustment = calculateDynamicAdjustment(txn);
            const transportCharges = parseFloat(txn.transportCharges || "0");
            const otherCharges = parseFloat(txn.otherCharges || "0");
            const extraCharges = transportCharges + otherCharges;
            
            // Get unique potato types from transaction items
            const potatoTypes = Array.from(new Set(txn.items.map(item => item.potatoType).filter(Boolean))) as string[];
            
            return (
              <Card key={txn.id} className="hover-elevate" data-testid={`seed-txn-card-${txn.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      {/* Row 1: Transaction number, farmer name, badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 mr-1">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#52a7ff]/10">
                            <FileText className="h-3.5 w-3.5 text-[#52a7ff]" />
                          </div>
                          <span className="font-bold text-sm leading-tight whitespace-nowrap">
                            Tr No: {txn.transactionNumber}
                          </span>
                        </div>
                        <span className="font-semibold text-sm leading-tight">
                          - {txn.farmerName}{txn.village ? `, ${txn.village}` : ""}
                        </span>
                        <div className="flex items-center gap-2 ml-auto">
                          {/* Potato type badges */}
                          {potatoTypes.map((type) => (
                            <Badge key={type} variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-600">
                              {type}
                            </Badge>
                          ))}
                          {txn.vehicleNumber && (
                            <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-600">
                              <Truck className="h-3 w-3 mr-1" />
                              {txn.vehicleNumber}
                            </Badge>
                          )}
                          {/* Due badge */}
                          {dueAmount > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {t("Due", "बकाया")}
                            </Badge>
                          )}
                          {/* P&L badge - green/up for profit, red/down for loss */}
                          {profitLoss !== 0 && (
                            <Badge variant={profitLoss >= 0 ? "default" : "destructive"} className="flex items-center gap-1">
                              {profitLoss >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              ₹{Math.abs(profitLoss).toLocaleString("en-IN")}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Bags, Cost, Revenue, Extra Charges, Due */}
                      <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-4 gap-y-2 sm:gap-3 text-sm">
                        <span className="flex items-center gap-1">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{txn.totalBags}</span>
                          <span className="text-muted-foreground">{t("Bags", "बोरी")}</span>
                        </span>
                        <span className="col-span-1">
                          <span className="text-muted-foreground">{t("Cost", "लागत")}:</span>
                          <span className="font-medium ml-1">₹{cost.toLocaleString("en-IN")}</span>
                        </span>
                        <span className="col-span-1">
                          <span className="text-muted-foreground">{t("Revenue", "राजस्व")}:</span>
                          <span className="font-medium ml-1">₹{revenue.toLocaleString("en-IN")}</span>
                        </span>
                        {extraCharges > 0 && (
                          <span className="col-span-1">
                            <span className="text-muted-foreground">{t("Charges", "शुल्क")}:</span>
                            <span className="font-medium ml-1">₹{extraCharges.toLocaleString("en-IN")}</span>
                          </span>
                        )}
                        {dueAmount > 0 ? (
                          <div className="col-span-2 sm:col-span-1">
                            <Badge variant="outline" className="text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-600">
                              {t("Due", "बकाया")}: ₹{dueAmount.toLocaleString("en-IN")}
                            </Badge>
                          </div>
                        ) : revenue > 0 && (
                          <div className="col-span-2 sm:col-span-1">
                            <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-600">
                              {t("Paid", "भुगतान")}
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Row 3: Date and serial badges */}
                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground pt-1 border-t sm:border-0 mt-2 sm:mt-0">
                        <span className="font-medium text-muted-foreground/80">
                          {format(new Date(txn.createdAt), "dd MMM yyyy")}
                        </span>
                        <span className="hidden sm:inline">|</span>
                        <div className="flex flex-wrap gap-1.5 mt-1 sm:mt-0">
                          {txn.items.slice(0, 3).map((item, idx) => (
                            <Badge 
                              key={idx} 
                              variant="outline" 
                              className="text-[10px] sm:text-xs bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-600 h-5"
                            >
                              S#{item.serialNumber} ({item.bagsMoved} - {item.size || item.potatoType})
                            </Badge>
                          ))}
                          {txn.items.length > 3 && (
                            <span className="text-[10px]">{t("and more", "और अधिक")}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex sm:flex-col gap-2 flex-shrink-0 border-t sm:border-0 pt-3 sm:pt-0 mt-2 sm:mt-0 justify-end">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setEditTransactionId(txn.id)}
                        className="flex-1 sm:flex-none h-8 sm:h-9"
                        data-testid={`button-edit-seed-txn-${txn.id}`}
                      >
                        <Edit className="h-3.5 w-3.5 mr-1.5" />
                        {t("Edit", "संपादित")}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="flex-1 sm:flex-none h-8 sm:h-9"
                        onClick={() => setReceiptTransactionId(txn.id)}
                        data-testid={`button-receipt-seed-txn-${txn.id}`}
                      >
                        <Printer className="h-3.5 w-3.5 mr-1.5" />
                        {t("Print", "प्रिंट")}
                      </Button>
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
