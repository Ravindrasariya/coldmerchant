import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Package, TrendingUp, TrendingDown, Edit, Printer, IndianRupee, Wallet, Receipt, CreditCard, Filter, X, Download, Leaf } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { LoadTruckDialog } from "./load-truck-dialog";
import { EditTransactionDialog } from "./edit-transaction-dialog";
import { SalesReceiptDialog } from "./sales-receipt";
import { SeedTransactionsContent } from "./seed-transactions-content";

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
}

interface Transaction {
  id: number;
  merchantId: number;
  transactionNumber: number;
  partyName: string | null;
  partyAddress: string | null;
  vehicleNumber: string | null;
  advancePayment: string | null;
  amountReceived: string | null;
  transportationCharges: string | null;
  otherCharges: string | null;
  revenue: string | null;
  totalBags: number;
  totalNetWeight: string | null;
  totalCostOfGoods: string | null;
  profitLoss: string | null;
  createdAt: string;
  items: TransactionItem[];
}

export function TransactionsTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [transactionMode, setTransactionMode] = useState<"raw" | "seed">("raw");
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [editTransactionId, setEditTransactionId] = useState<number | null>(null);
  const [printTransactionId, setPrintTransactionId] = useState<number | null>(null);
  
  // Download dialog state
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState("");
  const [downloadEndDate, setDownloadEndDate] = useState("");
  
  // Filter states
  const [filterTxnNumber, setFilterTxnNumber] = useState("");
  const [filterSerialNumber, setFilterSerialNumber] = useState("");
  const [filterParty, setFilterParty] = useState("all");
  const [filterPaymentDue, setFilterPaymentDue] = useState("all");

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
    enabled: transactionMode === "raw",
  });

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
  }, [transactions, filterTxnNumber, filterSerialNumber, filterParty, filterPaymentDue]);

  const hasActiveFilters = filterTxnNumber || filterSerialNumber || filterParty !== "all" || filterPaymentDue !== "all";

  const clearFilters = () => {
    setFilterTxnNumber("");
    setFilterSerialNumber("");
    setFilterParty("all");
    setFilterPaymentDue("all");
  };

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
      t("Party Name", "पार्टी का नाम"),
      t("Vehicle #", "वाहन #"),
      t("Items (S# - Bags - Size)", "आइटम (क्रमांक - बैग - साइज)"),
      t("Total Bags", "कुल बैग"),
      t("Net Weight", "शुद्ध वज़न"),
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
      
      // Format items as "S#2 (48 - Large), S#3 (180 - Large)"
      const itemsDetail = txn.items.map(item => 
        `S#${item.serialNumber} (${item.bagsMoved} - ${item.size || "-"})`
      ).join(", ");
      
      return [
        txn.transactionNumber.toString(),
        format(new Date(txn.createdAt), "dd/MM/yyyy"),
        txn.partyName || "-",
        txn.vehicleNumber || "-",
        itemsDetail || "-",
        txn.totalBags.toString(),
        txn.totalNetWeight || "-",
        revenue.toFixed(0),
        amountReceived.toFixed(0),
        dueAmount.toFixed(0),
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
    link.download = `transactions_${downloadStartDate}_to_${downloadEndDate}.csv`;
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

  // If in seed mode, render seed transactions component
  if (transactionMode === "seed") {
    return (
      <SeedTransactionsContent
        transactionMode={transactionMode}
        setTransactionMode={setTransactionMode}
      />
    );
  }

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
            <DialogTitle>{t("Download Transactions", "लेनदेन डाउनलोड करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="txn-start-date">{t("Start Date", "आरंभ तिथि")}</Label>
              <Input
                id="txn-start-date"
                type="date"
                value={downloadStartDate}
                onChange={(e) => setDownloadStartDate(e.target.value)}
                data-testid="input-txn-download-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="txn-end-date">{t("End Date", "समाप्ति तिथि")}</Label>
              <Input
                id="txn-end-date"
                type="date"
                value={downloadEndDate}
                onChange={(e) => setDownloadEndDate(e.target.value)}
                data-testid="input-txn-download-end-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} data-testid="button-txn-download-cancel">
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleDownloadCSV} data-testid="button-txn-download-csv">
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
            {t("Manage truck loading and sales transactions", "ट्रक लोडिंग और बिक्री लेनदेन प्रबंधित करें")}
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
              data-testid="button-txn-raw-mode"
            >
              <Package className="h-3.5 w-3.5" />
              {t("Raw Potato", "कच्चा आलू")}
            </Button>
            <Button
              variant={transactionMode === "seed" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTransactionMode("seed")}
              className="h-8 text-xs gap-1"
              data-testid="button-txn-seed-mode"
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
            data-testid="button-txn-download"
          >
            <Download className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Filters */}
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
              data-testid="filter-txn-number"
            />
            
            <Input
              placeholder={t("Serial #", "सीरियल #")}
              value={filterSerialNumber}
              onChange={(e) => setFilterSerialNumber(e.target.value)}
              className="w-28 h-9"
              data-testid="filter-serial-number"
            />
            
            <Select value={filterParty} onValueChange={setFilterParty}>
              <SelectTrigger className="w-40 h-9" data-testid="filter-party">
                <SelectValue placeholder={t("Party", "पार्टी")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Parties", "सभी पार्टी")}</SelectItem>
                {partyNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterPaymentDue} onValueChange={setFilterPaymentDue}>
              <SelectTrigger className="w-36 h-9" data-testid="filter-payment-due">
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

            <Button onClick={() => setShowLoadDialog(true)} data-testid="button-load-truck">
              <Truck className="h-4 w-4 mr-2" />
              {t("Load A Truck", "ट्रक लोड करें")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {filteredTransactions && filteredTransactions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <IndianRupee className="h-4 w-4" />
                {t("Total Revenue", "कुल राजस्व")}
              </div>
              <p className="text-lg font-bold">
                ₹{filteredTransactions.reduce((sum, txn) => {
                  const rev = txn.revenue 
                    ? parseFloat(txn.revenue) 
                    : txn.items.reduce((s, item) => s + parseFloat(item.revenue || "0"), 0);
                  return sum + rev;
                }, 0).toLocaleString("en-IN")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Receipt className="h-4 w-4" />
                {t("Total Cost", "कुल लागत")}
              </div>
              <p className="text-lg font-bold">
                ₹{filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.totalCostOfGoods || "0")), 0).toLocaleString("en-IN")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              {(() => {
                const totalPL = filteredTransactions.reduce((sum, txn) => {
                  const rev = txn.revenue 
                    ? parseFloat(txn.revenue) 
                    : txn.items.reduce((s, item) => s + parseFloat(item.revenue || "0"), 0);
                  const cost = parseFloat(txn.totalCostOfGoods || "0");
                  const transport = parseFloat(txn.transportationCharges || "0");
                  const other = parseFloat(txn.otherCharges || "0");
                  return sum + (rev - cost - transport - other);
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
                    <p className={`text-lg font-bold ${totalPL >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {totalPL >= 0 ? "+" : ""}₹{Math.abs(totalPL).toLocaleString("en-IN")}
                    </p>
                  </>
                );
              })()}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Wallet className="h-4 w-4" />
                {t("Total Paid", "कुल भुगतान")}
              </div>
              <p className="text-lg font-bold text-green-600">
                ₹{filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.amountReceived || "0")), 0).toLocaleString("en-IN")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <CreditCard className="h-4 w-4" />
                {t("Total Due", "कुल बकाया")}
              </div>
              <p className="text-lg font-bold text-orange-600">
                ₹{Math.max(0, filteredTransactions.reduce((sum, txn) => {
                  const rev = txn.revenue 
                    ? parseFloat(txn.revenue) 
                    : txn.items.reduce((s, item) => s + parseFloat(item.revenue || "0"), 0);
                  const received = parseFloat(txn.amountReceived || "0");
                  return sum + (rev - received);
                }, 0)).toLocaleString("en-IN")}
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
              onPrint={() => setPrintTransactionId(txn.id)}
            />
          ))}
        </div>
      )}

      <LoadTruckDialog 
        open={showLoadDialog} 
        onOpenChange={setShowLoadDialog} 
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

  const totalCost = parseFloat(transaction.totalCostOfGoods || "0");
  // Use transaction revenue if set, otherwise aggregate from items
  const revenue = transaction.revenue 
    ? parseFloat(transaction.revenue) 
    : transaction.items.reduce((sum, item) => sum + parseFloat(item.revenue || "0"), 0);
  const amountReceived = parseFloat(transaction.amountReceived || "0");
  const dueAmount = Math.max(0, revenue - amountReceived);
  // Recalculate P&L if transaction revenue is null but items have revenue
  const profitLoss = transaction.revenue 
    ? parseFloat(transaction.profitLoss || "0")
    : revenue - totalCost - parseFloat(transaction.transportationCharges || "0") - parseFloat(transaction.otherCharges || "0");
  
  // Get unique potato types from transaction items (Wafer, Ration, Seed)
  const bagTypes = Array.from(new Set(transaction.items.map(item => item.potatoType).filter(Boolean))) as string[];

  return (
    <Card className="hover-elevate" data-testid={`card-transaction-${transaction.id}`}>
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
              </div>
              {transaction.partyName && (
                <span className="font-semibold text-sm leading-tight">
                  - {transaction.partyName}
                </span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {bagTypes.map((type) => (
                  <Badge key={type} variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-600">
                    {type}
                  </Badge>
                ))}
                {transaction.vehicleNumber && (
                  <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-600">
                    <Truck className="h-3 w-3 mr-1" />
                    {transaction.vehicleNumber}
                  </Badge>
                )}
                {profitLoss !== 0 && (
                  <Badge variant={profitLoss >= 0 ? "default" : "destructive"} className="flex items-center gap-1">
                    {profitLoss >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    ₹{Math.abs(profitLoss).toFixed(0)}
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
                <span className="font-medium ml-1">₹{totalCost.toFixed(0)}</span>
              </span>
              <span className="col-span-1">
                <span className="text-muted-foreground">{t("Revenue", "राजस्व")}:</span>
                <span className="font-medium ml-1">₹{revenue.toFixed(0)}</span>
              </span>
              {dueAmount > 0 ? (
                <div className="col-span-2 sm:col-span-1">
                  <Badge variant="outline" className="text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-600">
                    {t("Due", "बकाया")}: ₹{dueAmount.toFixed(0)}
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

            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground pt-1 border-t sm:border-0 mt-2 sm:mt-0">
              <span className="font-medium text-muted-foreground/80">
                {new Date(transaction.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="hidden sm:inline">|</span>
              <div className="flex flex-wrap gap-1.5 mt-1 sm:mt-0">
                {transaction.items.slice(0, 3).map((item) => (
                  <Badge 
                    key={item.id} 
                    variant="outline" 
                    className="text-[10px] sm:text-xs bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-600 h-5"
                  >
                    S#{item.serialNumber} ({item.bagsMoved} - {item.size || "Mixed"})
                  </Badge>
                ))}
                {transaction.items.length > 3 && (
                  <span className="text-[10px]">{t("and more", "और अधिक")}</span>
                )}
              </div>
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
