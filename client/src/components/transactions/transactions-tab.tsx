import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Package, TrendingUp, TrendingDown, Edit, Printer, IndianRupee, Wallet, Receipt, CreditCard, Filter, X, Download } from "lucide-react";
import { CropToggle } from "@/components/crop-toggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { LoadTruckDialog } from "./load-truck-dialog";
import { LoadingTruckDialog } from "./loading-truck-dialog";
import { EditTransactionDialog } from "./edit-transaction-dialog";
import { SalesReceiptDialog } from "./sales-receipt";
import { LoadingReceiptDialog } from "./loading-receipt";

interface TransactionItem {
  id: number;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  netWeight: string | null;
  pricePerKgSnapshot: string | null;
  costOfGoods: string | null;
  revenue: string | null;
  crop?: string;
  farmerName?: string;
  farmerVillage?: string;
}

interface Transaction {
  id: number;
  uniqueId: string | null;
  merchantId: number;
  transactionNumber: number;
  transactionType: string | null;
  partyName: string | null;
  partyAddress: string | null;
  vehicleNumber: string | null;
  advancePayment: string | null;
  amountReceived: string | null;
  transportationCharges: string | null;
  otherCharges: string | null;
  totalMandiCommission: string | null;
  totalAadhatCommission: string | null;
  totalHammali: string | null;
  totalMandiExtraCharges: string | null;
  tulai: string | null;
  majduri: string | null;
  thelaBhada: string | null;
  palaKarai: string | null;
  bardan: string | null;
  revenue: string | null;
  totalBags: number;
  totalNetWeight: string | null;
  totalCostOfGoods: string | null;
  profitLoss: string | null;
  createdAt: string;
  crop?: string;
  items: TransactionItem[];
}

interface TransactionsTabProps {
  selectedCrop?: "potato" | "onion" | "garlic";
  onCropChange?: (crop: "potato" | "onion" | "garlic") => void;
}

export function TransactionsTab({ selectedCrop = "potato", onCropChange }: TransactionsTabProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showLoadingDialog, setShowLoadingDialog] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [editTransactionId, setEditTransactionId] = useState<number | null>(null);
  const [printTransactionId, setPrintTransactionId] = useState<number | null>(null);
  const [printLoadingTransactionId, setPrintLoadingTransactionId] = useState<number | null>(null);
  
  // Download dialog state (uses filtered transactions directly)
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  
  // Filter states
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterTxnNumber, setFilterTxnNumber] = useState("");
  const [filterSerialNumber, setFilterSerialNumber] = useState("");
  const [filterParty, setFilterParty] = useState("all");
  const [filterPaymentDue, setFilterPaymentDue] = useState("all");

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  // Get unique years for dropdown
  const availableYears = useMemo(() => {
    if (!transactions) return [new Date().getFullYear().toString()];
    const years = transactions.map(t => new Date(t.createdAt).getFullYear().toString());
    const uniqueYears = Array.from(new Set(years)).sort((a, b) => parseInt(b) - parseInt(a));
    return uniqueYears.length > 0 ? uniqueYears : [new Date().getFullYear().toString()];
  }, [transactions]);

  // Get unique party names for dropdown
  const partyNames = useMemo(() => {
    if (!transactions) return [];
    const names = transactions
      .map(t => t.partyName)
      .filter((name): name is string => !!name);
    return Array.from(new Set(names));
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    
    return transactions.filter(txn => {
      // Filter by crop - check if transaction or any item has matching crop
      const txnCrop = txn.crop || (txn.items.length > 0 ? (txn.items[0].crop || "potato") : "potato");
      if (txnCrop !== selectedCrop) return false;

      // Filter by year
      if (filterYear && new Date(txn.createdAt).getFullYear().toString() !== filterYear) {
        return false;
      }
      
      // Filter by transaction number
      if (filterTxnNumber && !txn.transactionNumber.toString().includes(filterTxnNumber)) {
        return false;
      }
      
      // Filter by serial number (check items)
      if (filterSerialNumber) {
        const hasMatchingSerial = txn.items.some(
          item => item.serialNumber.toString().includes(filterSerialNumber)
        );
        if (!hasMatchingSerial) return false;
      }
      
      // Filter by party
      if (filterParty !== "all" && txn.partyName !== filterParty) {
        return false;
      }
      
      // Filter by payment due
      if (filterPaymentDue !== "all") {
        // Use transaction revenue if set, otherwise aggregate from items
        const revenue = txn.revenue 
          ? parseFloat(txn.revenue) 
          : txn.items.reduce((sum, item) => sum + parseFloat(item.revenue || "0"), 0);
        const amountReceived = parseFloat(txn.amountReceived || "0");
        const dueAmount = revenue - amountReceived;
        const hasDue = dueAmount > 0;
        if (filterPaymentDue === "due" && !hasDue) return false;
        if (filterPaymentDue === "paid" && hasDue) return false;
      }
      
      return true;
    });
  }, [transactions, selectedCrop, filterYear, filterTxnNumber, filterSerialNumber, filterParty, filterPaymentDue]);

  const currentYear = new Date().getFullYear().toString();
  const hasActiveFilters = filterYear !== currentYear || filterTxnNumber || filterSerialNumber || filterParty !== "all" || filterPaymentDue !== "all";

  const clearFilters = () => {
    setFilterYear(new Date().getFullYear().toString());
    setFilterTxnNumber("");
    setFilterSerialNumber("");
    setFilterParty("all");
    setFilterPaymentDue("all");
  };

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
      t("Buyer Name", "खरीदार का नाम"),
      t("Vehicle #", "वाहन #"),
      t("Items (S# - Bags - Size)", "आइटम (क्रमांक - बैग - साइज)"),
      t("Total Bags", "कुल बैग"),
      t("Net Weight", "शुद्ध वज़न"),
      t("Total Cost", "कुल लागत"),
      t("Revenue", "राजस्व"),
      t("Amount Received", "प्राप्त राशि"),
      t("Due Amount", "बकाया राशि"),
      t("Profit/Loss", "लाभ/हानि"),
    ];

    const rows = filteredForDownload.map(txn => {
      const revenue = txn.revenue 
        ? parseFloat(txn.revenue) 
        : txn.items.reduce((sum, item) => sum + parseFloat(item.revenue || "0"), 0);
      const amountReceived = parseFloat(txn.amountReceived || "0");
      const dueAmount = Math.max(revenue - amountReceived, 0);
      
      // Format items as "S#2 (48 - Large) - Ram Vilas (Kachnariya), S#3 (180 - Large) - Arun (Kachnariya)"
      const itemsDetail = txn.items.map(item => 
        `S#${item.serialNumber} (${item.bagsMoved} - ${item.size || "-"})${item.farmerName ? ` - ${item.farmerName}${item.farmerVillage ? ` (${item.farmerVillage})` : ""}` : ""}`
      ).join(", ");
      
      const totalCost = txn.transactionType === "loading"
        ? parseFloat(txn.totalCostOfGoods || "0") + parseFloat(txn.totalMandiCommission || "0") + parseFloat(txn.totalAadhatCommission || "0") + parseFloat(txn.totalHammali || "0") + parseFloat(txn.totalMandiExtraCharges || "0")
        : parseFloat(txn.totalCostOfGoods || "0") + parseFloat(txn.transportationCharges || "0") + parseFloat(txn.otherCharges || "0");
      return [
        txn.transactionNumber.toString(),
        format(new Date(txn.createdAt), "dd/MM/yyyy"),
        txn.partyName || "-",
        txn.vehicleNumber || "-",
        itemsDetail || "-",
        txn.totalBags.toString(),
        txn.totalNetWeight || "-",
        parseFloat(totalCost.toFixed(1)).toLocaleString('en-IN'),
        parseFloat(revenue.toFixed(1)).toLocaleString('en-IN'),
        parseFloat(amountReceived.toFixed(1)).toLocaleString('en-IN'),
        parseFloat(dueAmount.toFixed(1)).toLocaleString('en-IN'),
        txn.profitLoss || "-",
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
    const parts = [selectedCrop, "transactions"];
    if (filterYear) parts.push(filterYear);
    if (filterTxnNumber) parts.push(`txn${filterTxnNumber}`);
    if (filterSerialNumber) parts.push(`sr${filterSerialNumber}`);
    if (filterParty !== "all") parts.push(filterParty.replace(/\s+/g, "_"));
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
            <DialogTitle>{t("Download Transactions", "लेनदेन डाउनलोड करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              {t("Download will include transactions based on current filters:", "डाउनलोड में वर्तमान फ़िल्टर के आधार पर लेनदेन शामिल होंगे:")}
            </p>
            <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
              <p><strong>{t("Crop:", "फसल:")}</strong> {selectedCrop === "potato" ? t("Potato", "आलू") : selectedCrop === "onion" ? t("Onion", "प्याज") : t("Garlic", "लहसुन")}</p>
              <p><strong>{t("Year:", "वर्ष:")}</strong> {filterYear || t("All Years", "सभी वर्ष")}</p>
              {filterTxnNumber && <p><strong>{t("Txn #:", "लेनदेन #:")}</strong> {filterTxnNumber}</p>}
              {filterSerialNumber && <p><strong>{t("Serial #:", "क्रमांक:")}</strong> {filterSerialNumber}</p>}
              {filterParty !== "all" && <p><strong>{t("Party:", "पार्टी:")}</strong> {filterParty}</p>}
              {filterPaymentDue !== "all" && <p><strong>{t("Status:", "स्थिति:")}</strong> {filterPaymentDue === "due" ? t("Due", "बकाया") : t("Paid", "भुगतान किया")}</p>}
              <p className="pt-2 font-medium">{t("Total transactions:", "कुल लेनदेन:")} {filteredTransactions.length}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} data-testid="button-txn-download-cancel">
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleDownloadCSV} disabled={filteredTransactions.length === 0} data-testid="button-txn-download-csv">
              <Download className="h-4 w-4 mr-2" />
              {t("Download CSV", "CSV डाउनलोड करें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("Transactions", "लेनदेन")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedCrop === "potato"
              ? t("Manage truck loading and sales transactions", "ट्रक लोडिंग और बिक्री लेनदेन प्रबंधित करें")
              : selectedCrop === "onion"
              ? t("Manage onion truck loading and sales transactions", "प्याज ट्रक लोडिंग और बिक्री लेनदेन प्रबंधित करें")
              : t("Manage garlic truck loading and sales transactions", "लहसुन ट्रक लोडिंग और बिक्री लेनदेन प्रबंधित करें")
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onCropChange && (
            <CropToggle value={selectedCrop} onChange={onCropChange} />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDownloadDialogOpen(true)}
            title={t("Download", "डाउनलोड")}
            data-testid="button-txn-download"
          >
            <Download className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Mobile: Button at top, full width */}
        <Button onClick={() => setShowChooser(true)} className="w-full md:hidden" data-testid="button-load-truck-mobile">
          <Truck className="h-4 w-4 mr-2" />
          {t("Load A Truck", "ट्रक लोड करें")}
        </Button>

        <Card className="flex-1 border-orange-300 dark:border-orange-700">
          <CardContent className="py-3 px-3 sm:px-4">
            <div className="flex items-start gap-2">
              <Filter className="h-4 w-4 text-muted-foreground mt-2.5" />
              <div className="grid grid-cols-2 gap-2 flex-1 sm:flex sm:flex-wrap sm:items-center">
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger className="text-sm sm:w-[100px]" data-testid="filter-year">
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
                  className="text-sm sm:w-[120px]"
                  data-testid="filter-txn-number"
                />
                
                <Input
                  placeholder={t("Serial #", "सीरियल #")}
                  value={filterSerialNumber}
                  onChange={(e) => setFilterSerialNumber(e.target.value)}
                  className="text-sm sm:w-[100px]"
                  data-testid="filter-serial-number"
                />
                
                <Select value={filterParty} onValueChange={setFilterParty}>
                  <SelectTrigger className="text-sm sm:w-[140px]" data-testid="filter-party">
                    <SelectValue placeholder={t("All Parties", "सभी पार्टी")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("All Parties", "सभी पार्टी")}</SelectItem>
                    {partyNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterPaymentDue} onValueChange={setFilterPaymentDue}>
                  <SelectTrigger className="text-sm sm:w-[110px]" data-testid="filter-payment-due">
                    <SelectValue placeholder={t("Payment", "भुगतान")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("All", "सभी")}</SelectItem>
                    <SelectItem value="due">{t("Due", "बकाया")}</SelectItem>
                    <SelectItem value="paid">{t("Paid", "भुगतान किया")}</SelectItem>
                  </SelectContent>
                </Select>
                
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                    <X className="h-4 w-4 mr-1" />
                    {t("Clear", "साफ़ करें")}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Desktop: Button on right */}
        <Button onClick={() => setShowChooser(true)} className="hidden md:flex" data-testid="button-load-truck">
          <Truck className="h-4 w-4 mr-2" />
          {t("Load A Truck", "ट्रक लोड करें")}
        </Button>
      </div>

      {/* Summary Cards */}
      {filteredTransactions && filteredTransactions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-blue-300 dark:border-blue-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <IndianRupee className="h-4 w-4" />
                {t("Total Revenue", "कुल राजस्व")}
              </div>
              <p className="text-sm sm:text-lg font-bold">
                ₹{filteredTransactions.reduce((sum, txn) => {
                  const rev = txn.revenue 
                    ? parseFloat(txn.revenue) 
                    : txn.items.reduce((s, item) => s + parseFloat(item.revenue || "0"), 0);
                  return sum + rev;
                }, 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
              </p>
            </CardContent>
          </Card>
          <Card className="border-orange-300 dark:border-orange-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Receipt className="h-4 w-4" />
                {t("Total Cost", "कुल लागत")}
              </div>
              <p className="text-sm sm:text-lg font-bold">
                ₹{filteredTransactions.reduce((sum, t) => {
                  if (t.transactionType === "loading") {
                    return sum + parseFloat(t.totalCostOfGoods || "0") + parseFloat(t.totalMandiCommission || "0") + parseFloat(t.totalAadhatCommission || "0") + parseFloat(t.totalHammali || "0") + parseFloat(t.totalMandiExtraCharges || "0");
                  }
                  return sum + parseFloat(t.totalCostOfGoods || "0") + parseFloat(t.transportationCharges || "0") + parseFloat(t.otherCharges || "0");
                }, 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
              </p>
            </CardContent>
          </Card>
          <Card className="border-green-300 dark:border-green-700">
            <CardContent className="p-4">
              {(() => {
                const totalPL = filteredTransactions.reduce((sum, txn) => {
                  return sum + parseFloat(txn.profitLoss || "0");
                }, 0);
                return (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                      {totalPL >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                      {t("Total P&L", "कुल लाभ/हानि")}
                    </div>
                    <p className={`text-sm sm:text-lg font-bold ${totalPL >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {totalPL >= 0 ? "+" : ""}₹{Math.abs(totalPL).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </p>
                  </>
                );
              })()}
            </CardContent>
          </Card>
          <Card className="border-teal-300 dark:border-teal-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Wallet className="h-4 w-4" />
                {t("Total Paid", "कुल भुगतान")}
              </div>
              <p className="text-sm sm:text-lg font-bold text-green-600">
                ₹{filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.amountReceived || "0")), 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
              </p>
            </CardContent>
          </Card>
          <Card className="border-purple-300 dark:border-purple-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <CreditCard className="h-4 w-4" />
                {t("Total Due", "कुल बकाया")}
              </div>
              <p className="text-sm sm:text-lg font-bold text-orange-600">
                ₹{Math.max(0, filteredTransactions.reduce((sum, txn) => {
                  const rev = txn.revenue 
                    ? parseFloat(txn.revenue) 
                    : txn.items.reduce((s, item) => s + parseFloat(item.revenue || "0"), 0);
                  const received = parseFloat(txn.amountReceived || "0");
                  return sum + (rev - received);
                }, 0)).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {transactions && transactions.length === 0 ? (
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t("No transactions yet", "अभी तक कोई लेनदेन नहीं")}</p>
            <p className="text-sm mt-1">
              {t("Click 'Load A Truck' to create your first transaction", "'ट्रक लोड करें' पर क्लिक करके पहला लेनदेन बनाएं")}
            </p>
          </div>
        </Card>
      ) : filteredTransactions.length === 0 ? (
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t("No matching transactions", "कोई मिलता जुलता लेनदेन नहीं")}</p>
            <p className="text-sm mt-1">
              {t("Try adjusting your filters", "फ़िल्टर बदलकर देखें")}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTransactions.slice().sort((a, b) => b.transactionNumber - a.transactionNumber).map((txn) => (
            <TransactionCard 
              key={txn.id} 
              transaction={txn} 
              onEdit={() => setEditTransactionId(txn.id)}
              onPrint={() => {
                if (txn.transactionType === "loading") {
                  setPrintLoadingTransactionId(txn.id);
                } else {
                  setPrintTransactionId(txn.id);
                }
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={showChooser} onOpenChange={setShowChooser}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {t("Choose Transaction Type", "लेनदेन प्रकार चुनें")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <button
              className="group h-28 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 shadow-sm transition-all hover:border-blue-400 hover:shadow-md hover:scale-[1.03] active:scale-[0.98] dark:border-blue-800 dark:from-blue-950 dark:to-blue-900 dark:text-blue-300 dark:hover:border-blue-600"
              onClick={() => {
                setShowChooser(false);
                setShowLoadingDialog(true);
              }}
              data-testid="button-choose-loading"
            >
              <div className="rounded-full bg-blue-200/60 p-2.5 group-hover:bg-blue-200 transition-colors dark:bg-blue-800/60 dark:group-hover:bg-blue-800">
                <Truck className="h-6 w-6" />
              </div>
              <span className="text-base font-semibold">{t("Loading", "लोडिंग")}</span>
            </button>
            <button
              className="group h-28 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 shadow-sm transition-all hover:border-emerald-400 hover:shadow-md hover:scale-[1.03] active:scale-[0.98] dark:border-emerald-800 dark:from-emerald-950 dark:to-emerald-900 dark:text-emerald-300 dark:hover:border-emerald-600"
              onClick={() => {
                setShowChooser(false);
                setShowLoadDialog(true);
              }}
              data-testid="button-choose-sale"
            >
              <div className="rounded-full bg-emerald-200/60 p-2.5 group-hover:bg-emerald-200 transition-colors dark:bg-emerald-800/60 dark:group-hover:bg-emerald-800">
                <IndianRupee className="h-6 w-6" />
              </div>
              <span className="text-base font-semibold">{t("Sale / Bikri", "बिक्री")}</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <LoadTruckDialog 
        open={showLoadDialog} 
        onOpenChange={setShowLoadDialog}
        selectedCrop={selectedCrop}
      />

      <LoadingTruckDialog
        open={showLoadingDialog}
        onOpenChange={setShowLoadingDialog}
        selectedCrop={selectedCrop}
      />

      <EditTransactionDialog
        transactionId={editTransactionId}
        open={editTransactionId !== null}
        onOpenChange={(open) => !open && setEditTransactionId(null)}
      />

      <SalesReceiptDialog
        transactionId={printTransactionId}
        merchantId={user?.merchantId || 0}
        open={printTransactionId !== null}
        onOpenChange={(open) => !open && setPrintTransactionId(null)}
        cropType={selectedCrop}
      />

      <LoadingReceiptDialog
        transactionId={printLoadingTransactionId}
        merchantId={user?.merchantId || 0}
        open={printLoadingTransactionId !== null}
        onOpenChange={(open) => !open && setPrintLoadingTransactionId(null)}
        cropType={selectedCrop}
      />

    </div>
  );
}

interface TransactionCardProps {
  transaction: Transaction;
  onEdit: () => void;
  onPrint: () => void;
}

function TransactionCard({ transaction, onEdit, onPrint }: TransactionCardProps) {
  const { t } = useLanguage();

  const totalCost = transaction.transactionType === "loading"
    ? parseFloat(transaction.totalCostOfGoods || "0") + parseFloat(transaction.totalMandiCommission || "0") + parseFloat(transaction.totalAadhatCommission || "0") + parseFloat(transaction.totalHammali || "0") + parseFloat(transaction.totalMandiExtraCharges || "0")
    : parseFloat(transaction.totalCostOfGoods || "0") + parseFloat(transaction.transportationCharges || "0") + parseFloat(transaction.otherCharges || "0");
  const revenue = transaction.revenue 
    ? parseFloat(transaction.revenue) 
    : transaction.items.reduce((sum, item) => sum + parseFloat(item.revenue || "0"), 0);
  const amountReceived = parseFloat(transaction.amountReceived || "0");
  const dueAmount = Math.max(0, revenue - amountReceived);
  const profitLoss = transaction.revenue 
    ? parseFloat(transaction.profitLoss || "0")
    : revenue - totalCost;
  
  // Get unique potato types from transaction items (Wafer, Ration, Seed)
  const bagTypes = Array.from(new Set(transaction.items.map(item => item.potatoType).filter(Boolean))) as string[];

  return (
    <Card className="border border-orange-300 dark:border-orange-700 hover-elevate" data-testid={`card-transaction-${transaction.id}`}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 mr-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#52a7ff]/10">
                  <Receipt className="h-3.5 w-3.5 text-[#52a7ff]" />
                </div>
                <span className="font-bold text-sm leading-tight whitespace-nowrap">
                  Tr No: {transaction.transactionNumber}
                </span>
                <span className="text-muted-foreground text-xs ml-1">
                  {new Date(transaction.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {transaction.transactionType === "loading" && (
                  <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600 h-5">
                    {t("Loading", "लोडिंग")}
                  </Badge>
                )}
              </div>
              {transaction.partyName && (
                <span className="font-semibold text-sm leading-tight">
                  - {transaction.partyName}
                </span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {transaction.vehicleNumber && (
                  <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-600">
                    <Truck className="h-3 w-3 mr-1" />
                    {transaction.vehicleNumber}
                  </Badge>
                )}
                {profitLoss !== 0 && (
                  <Badge variant={profitLoss >= 0 ? "default" : "destructive"} className="flex items-center gap-1">
                    {profitLoss >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    ₹{parseFloat(Math.abs(profitLoss).toFixed(1)).toLocaleString('en-IN')}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-4 gap-y-2 sm:gap-3 text-sm">
              <span className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{transaction.totalBags}</span>
                <span className="text-muted-foreground">{t("Bags", "बोरी")}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="font-medium">{parseFloat(transaction.totalNetWeight || "0").toFixed(1)}</span>
                <span className="text-muted-foreground ml-1">{t("Kg", "किग्रा")}</span>
              </span>
              <span className="col-span-1">
                <span className="text-muted-foreground">{t("Cost", "लागत")}:</span>
                <span className="font-medium ml-1">₹{parseFloat(totalCost.toFixed(1)).toLocaleString('en-IN')}</span>
              </span>
              <span className="col-span-1">
                <span className="text-muted-foreground">{t("Revenue", "राजस्व")}:</span>
                <span className="font-medium ml-1">₹{parseFloat(revenue.toFixed(1)).toLocaleString('en-IN')}</span>
              </span>
              {dueAmount > 0 ? (
                <div className="col-span-2 sm:col-span-1">
                  <Badge variant="outline" className="text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-600">
                    {t("Due", "बकाया")}: ₹{parseFloat(dueAmount.toFixed(1)).toLocaleString('en-IN')}
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

            {transaction.transactionType === "loading" && (() => {
              const charges = [
                { key: "tulai", label: t("Tulai", "तुलाई"), value: parseFloat(transaction.tulai || "0") },
                { key: "majduri", label: t("Majduri", "मजदूरी"), value: parseFloat(transaction.majduri || "0") },
                { key: "thelaBhada", label: t("Thela Bhada", "ठेला भाड़ा"), value: parseFloat(transaction.thelaBhada || "0") },
                { key: "palaKarai", label: t("Pala Karai", "पाला कराई"), value: parseFloat(transaction.palaKarai || "0") },
                { key: "bardan", label: t("Bardan", "बरदान"), value: parseFloat(transaction.bardan || "0") },
              ].filter(c => c.value > 0);
              if (charges.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {charges.map(c => (
                    <span key={c.key}>
                      {c.label}: <span className="font-medium text-foreground">₹{parseFloat(c.value.toFixed(1)).toLocaleString('en-IN')}</span>
                    </span>
                  ))}
                </div>
              );
            })()}

            <div className="flex flex-wrap gap-1.5 pt-1 border-t sm:border-0 mt-2 sm:mt-0">
              {transaction.items.map((item) => {
                const parts = [item.bagsMoved.toString(), item.potatoType, item.size || "Mixed"].filter(Boolean);
                const farmerInfo = item.farmerName ? ` ${item.farmerName}${item.farmerVillage ? ` (${item.farmerVillage})` : ""}` : "";
                return (
                  <Badge 
                    key={item.id} 
                    variant="outline" 
                    className="text-[10px] sm:text-xs bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-600 h-5"
                  >
                    S#{item.serialNumber} ({parts.join("- ")}){farmerInfo}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 flex-shrink-0 border-t sm:border-0 pt-3 sm:pt-0 mt-2 sm:mt-0 justify-end">
            <Button 
              variant="outline" 
              size="sm"
              onClick={onEdit}
              className="flex-1 sm:flex-none h-8 sm:h-9"
              data-testid={`button-edit-transaction-${transaction.id}`}
            >
              <Edit className="h-3.5 w-3.5 mr-1.5" />
              {t("Edit", "संपादित")}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={onPrint}
              className="flex-1 sm:flex-none h-8 sm:h-9"
              data-testid={`button-print-receipt-${transaction.id}`}
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              {t("Receipt", "रसीद")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
