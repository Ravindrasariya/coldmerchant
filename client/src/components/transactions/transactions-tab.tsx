import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Package, TrendingUp, TrendingDown, Edit, Printer, IndianRupee, Wallet, Receipt, CreditCard, Filter, X, Download, FileDown, ChevronDown, ChevronRight, MapPin, Phone, Trash2 } from "lucide-react";
import { type Buyer } from "@shared/schema";
import { CropToggle } from "@/components/crop-toggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LoadTruckDialog } from "./load-truck-dialog";
import { LoadingTruckDialog } from "./loading-truck-dialog";
import { EditTransactionDialog } from "./edit-transaction-dialog";
import { SalesReceiptDialog } from "./sales-receipt";
import { LoadingReceiptDialog } from "./loading-receipt";
import { TransactionNakalDialog } from "./transaction-nakal";
import { MonthFilter } from "@/components/ui/month-filter";
import { DateFilter } from "@/components/ui/date-filter";

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
  pricePerKg: string | null;
  amount: string | null;
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
  debit: string | null;
  revenue: string | null;
  tnxGroupId: string | null;
  totalBags: number;
  totalNetWeight: string | null;
  totalCostOfGoods: string | null;
  profitLoss: string | null;
  createdAt: string;
  crop?: string;
  items: TransactionItem[];
}

type CropValue = "potato" | "onion" | "garlic";

interface TransactionsTabProps {
  selectedCrop?: CropValue;
  onCropChange?: (crop: CropValue) => void;
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
  
  const [txnCropFilter, setTxnCropFilterState] = useState<CropValue | "all">(() => {
    const saved = localStorage.getItem("vyapar_txn_crop_filter");
    if (saved === "all" || saved === "potato" || saved === "onion" || saved === "garlic") return saved;
    return selectedCrop;
  });
  const setTxnCropFilter = (crop: CropValue | "all") => {
    setTxnCropFilterState(crop);
    localStorage.setItem("vyapar_txn_crop_filter", crop);
  };

  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [showNakal, setShowNakal] = useState(false);
  
  // Filter states
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterMonths, setFilterMonths] = useState<number[]>([new Date().getMonth()]);
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [filterTxnNumber, setFilterTxnNumber] = useState("");
  const [filterSerialNumber, setFilterSerialNumber] = useState("");
  const [filterTxnType, setFilterTxnType] = useState("all");
  const [filterParty, setFilterParty] = useState("all");
  const [filterPaymentDue, setFilterPaymentDue] = useState("all");

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: buyers = [] } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers"],
  });

  const buyerByName = useMemo(() => {
    const map = new Map<string, Buyer>();
    for (const b of buyers) {
      if (b.name) map.set(b.name.toLowerCase().trim(), b);
    }
    return map;
  }, [buyers]);

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
      if (txnCropFilter !== "all") {
        const txnCrop = txn.crop || (txn.items.length > 0 ? (txn.items[0].crop || "potato") : "potato");
        if (txnCrop !== txnCropFilter) return false;
      }

      // Filter by year
      const txnDate = new Date(txn.createdAt);
      if (filterYear && txnDate.getFullYear().toString() !== filterYear) {
        return false;
      }

      // Filter by month (multi-select)
      if (filterMonths.length > 0 && filterMonths.length < 12) {
        if (!filterMonths.includes(txnDate.getMonth())) return false;
      }

      // Filter by day
      if (filterDay !== null) {
        if (txnDate.getDate() !== filterDay) return false;
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
      
      // Filter by transaction type
      if (filterTxnType !== "all") {
        const txnType = txn.transactionType || "sale";
        if (filterTxnType === "loading" && txnType !== "loading") return false;
        if (filterTxnType === "bikri" && txnType === "loading") return false;
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
  }, [transactions, txnCropFilter, filterYear, filterMonths, filterDay, filterTxnNumber, filterSerialNumber, filterTxnType, filterParty, filterPaymentDue]);

  // Group filtered transactions by party (trimmed name; em-dash fallback)
  const partyGroups = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const txn of filteredTransactions) {
      const key = (txn.partyName || "").trim() || "—";
      const arr = groups.get(key);
      if (arr) arr.push(txn);
      else groups.set(key, [txn]);
    }

    return Array.from(groups.entries())
      .map(([partyName, txns]) => {
        const sortedTxns = [...txns].sort((a, b) => b.transactionNumber - a.transactionNumber);
        const buyer = buyerByName.get(partyName.toLowerCase());
        const partyAddress = buyer?.address || sortedTxns.find(t => t.partyAddress)?.partyAddress || "";
        const partyContact = buyer?.contact || "";

        let totalBags = 0;
        let totalCost = 0;
        let totalRevenue = 0;
        let totalPL = 0;
        let totalDue = 0;

        for (const txn of txns) {
          const cost = txn.transactionType === "loading"
            ? parseFloat(txn.totalCostOfGoods || "0") + parseFloat(txn.totalMandiCommission || "0") + parseFloat(txn.totalAadhatCommission || "0") + parseFloat(txn.totalHammali || "0") + parseFloat(txn.totalMandiExtraCharges || "0") + parseFloat(txn.tulai || "0") + parseFloat(txn.majduri || "0") + parseFloat(txn.thelaBhada || "0") + parseFloat(txn.palaKarai || "0") + parseFloat(txn.bardan || "0") + parseFloat(txn.advancePayment || "0")
            : parseFloat(txn.totalCostOfGoods || "0") + parseFloat(txn.totalMandiCommission || "0") + parseFloat(txn.totalHammali || "0") + parseFloat(txn.transportationCharges || "0") + parseFloat(txn.otherCharges || "0");
          const rev = txn.revenue
            ? parseFloat(txn.revenue)
            : txn.items.reduce((s, i) => s + parseFloat(i.revenue || "0"), 0);
          const recv = parseFloat(txn.amountReceived || "0");
          const pl = txn.revenue ? parseFloat(txn.profitLoss || "0") : (rev - cost);

          totalBags += txn.totalBags;
          totalCost += cost;
          totalRevenue += rev;
          totalPL += pl;
          totalDue += Math.max(0, rev - recv);
        }

        const maxTnxNumber = sortedTxns[0]?.transactionNumber ?? 0;
        const displayName = buyer?.name?.trim() || partyName;

        return {
          partyName: displayName,
          partyKey: (buyer?.id ? `b${buyer.id}` : displayName.replace(/[^a-zA-Z0-9\u0900-\u097F]+/g, "_").toLowerCase()) || "unknown",
          partyAddress,
          partyContact,
          txns: sortedTxns,
          totalBags,
          totalCost,
          totalRevenue,
          totalPL,
          totalDue,
          maxTnxNumber,
        };
      })
      .sort((a, b) => b.maxTnxNumber - a.maxTnxNumber);
  }, [filteredTransactions, buyerByName]);

  const currentYear = new Date().getFullYear().toString();
  const currentMonth = new Date().getMonth();
  const isDefaultMonths = filterMonths.length === 1 && filterMonths[0] === currentMonth;
  const hasActiveFilters = filterYear !== currentYear || !isDefaultMonths || filterDay !== null || filterTxnNumber || filterSerialNumber || filterTxnType !== "all" || filterParty !== "all" || filterPaymentDue !== "all";

  const clearFilters = () => {
    setFilterYear(new Date().getFullYear().toString());
    setFilterMonths([new Date().getMonth()]);
    setFilterDay(null);
    setFilterTxnNumber("");
    setFilterSerialNumber("");
    setFilterTxnType("all");
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
      t("Type", "प्रकार"),
      t("Date", "तिथि"),
      t("Buyer Name", "खरीदार का नाम"),
      t("Vehicle #", "वाहन #"),
      t("Items (S# - Bags - Size)", "आइटम (क्रमांक - बैग - साइज)"),
      t("Total Bags", "कुल बैग"),
      t("Net Weight", "शुद्ध वज़न"),
      t("Total Cost", "कुल लागत"),
      t("Revenue", "राजस्व"),
      t("Mandi Comm", "मंडी कमीशन"),
      t("Aadhat Comm", "आढ़त कमीशन"),
      t("Hammali", "हम्माली"),
      t("Extra Charges", "अतिरिक्त शुल्क"),
      t("Tulai", "तुलाई"),
      t("Majduri", "मजदूरी"),
      t("Thela Bhada", "ठेला भाड़ा"),
      t("Pala Karai", "पाला कराई"),
      t("Bardan", "बरदान"),
      t("Debit", "डेबिट"),
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
      
      const itemsDetail = txn.items.map(item => 
        `S#${item.serialNumber} (${item.bagsMoved}${item.size ? ` - ${item.size}` : ""})${item.farmerName ? ` - ${item.farmerName}${item.farmerVillage ? ` (${item.farmerVillage})` : ""}` : ""}`
      ).join(", ");

      const mandiComm = parseFloat(txn.totalMandiCommission || "0");
      const aadhatComm = parseFloat(txn.totalAadhatCommission || "0");
      const hammali = parseFloat(txn.totalHammali || "0");
      const extraCharges = parseFloat(txn.totalMandiExtraCharges || "0");
      const tulai = parseFloat(txn.tulai || "0");
      const majduri = parseFloat(txn.majduri || "0");
      const thelaBhada = parseFloat(txn.thelaBhada || "0");
      const palaKarai = parseFloat(txn.palaKarai || "0");
      const bardan = parseFloat(txn.bardan || "0");
      const debit = parseFloat(txn.debit || "0");

      const totalCost = txn.transactionType === "loading"
        ? parseFloat(txn.totalCostOfGoods || "0") + mandiComm + aadhatComm + hammali + extraCharges + tulai + majduri + thelaBhada + palaKarai + bardan + parseFloat(txn.advancePayment || "0")
        : parseFloat(txn.totalCostOfGoods || "0") + mandiComm + hammali + parseFloat(txn.transportationCharges || "0") + parseFloat(txn.otherCharges || "0");

      const fmt = (n: number) => n > 0 ? parseFloat(n.toFixed(1)).toLocaleString('en-IN') : "-";

      return [
        txn.transactionNumber.toString(),
        txn.transactionType === "loading" ? t("Loading", "लोडिंग") : t("Bikri", "बिक्री"),
        format(new Date(txn.createdAt), "dd/MM/yyyy"),
        txn.partyName || "-",
        txn.vehicleNumber || "-",
        itemsDetail || "-",
        txn.totalBags.toString(),
        txn.totalNetWeight || "-",
        parseFloat(totalCost.toFixed(1)).toLocaleString('en-IN'),
        parseFloat(revenue.toFixed(1)).toLocaleString('en-IN'),
        fmt(mandiComm),
        fmt(aadhatComm),
        fmt(hammali),
        fmt(extraCharges),
        fmt(tulai),
        fmt(majduri),
        fmt(thelaBhada),
        fmt(palaKarai),
        fmt(bardan),
        fmt(debit),
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
    const parts = [txnCropFilter, "transactions"];
    if (filterYear) parts.push(filterYear);
    if (filterTxnNumber) parts.push(`txn${filterTxnNumber}`);
    if (filterSerialNumber) parts.push(`sr${filterSerialNumber}`);
    if (filterTxnType !== "all") parts.push(filterTxnType);
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
              <p><strong>{t("Crop:", "फसल:")}</strong> {txnCropFilter === "all" ? t("All", "सभी") : txnCropFilter === "potato" ? t("Potato", "आलू") : txnCropFilter === "onion" ? t("Onion", "प्याज") : t("Garlic", "लहसुन")}</p>
              <p><strong>{t("Year:", "वर्ष:")}</strong> {filterYear || t("All Years", "सभी वर्ष")}</p>
              {filterTxnNumber && <p><strong>{t("Txn #:", "लेनदेन #:")}</strong> {filterTxnNumber}</p>}
              {filterSerialNumber && <p><strong>{t("Serial #:", "क्रमांक:")}</strong> {filterSerialNumber}</p>}
              {filterTxnType !== "all" && <p><strong>{t("Type:", "प्रकार:")}</strong> {filterTxnType === "loading" ? t("Loading", "लोडिंग") : t("Bikri", "बिक्री")}</p>}
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
            {txnCropFilter === "all"
              ? t("Manage all crop transactions", "सभी फसल लेनदेन प्रबंधित करें")
              : txnCropFilter === "potato"
              ? t("Manage truck loading and sales transactions", "ट्रक लोडिंग और बिक्री लेनदेन प्रबंधित करें")
              : txnCropFilter === "onion"
              ? t("Manage onion truck loading and sales transactions", "प्याज ट्रक लोडिंग और बिक्री लेनदेन प्रबंधित करें")
              : t("Manage garlic truck loading and sales transactions", "लहसुन ट्रक लोडिंग और बिक्री लेनदेन प्रबंधित करें")
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CropToggle value={txnCropFilter} onChange={setTxnCropFilter} showAll />
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
        <Button onClick={() => setShowChooser(true)} className="w-full md:hidden" data-testid="button-load-truck-mobile" disabled={txnCropFilter === "all"}>
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

                <MonthFilter selectedMonths={filterMonths} onSelectedMonthsChange={setFilterMonths} />
                <DateFilter selectedDay={filterDay} onSelectedDayChange={setFilterDay} />
                
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

                <Select value={filterTxnType} onValueChange={setFilterTxnType}>
                  <SelectTrigger className="text-sm sm:w-[110px]" data-testid="filter-txn-type">
                    <SelectValue placeholder={t("All Types", "सभी प्रकार")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("All Types", "सभी प्रकार")}</SelectItem>
                    <SelectItem value="loading">{t("Loading", "लोडिंग")}</SelectItem>
                    <SelectItem value="bikri">{t("Bikri", "बिक्री")}</SelectItem>
                  </SelectContent>
                </Select>
                
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

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNakal(true)}
                  data-testid="button-txn-nakal"
                  title={t("Transaction Nakal", "लेनदेन नकल")}
                >
                  <FileDown className="h-4 w-4" />
                </Button>
                
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
        <Button onClick={() => setShowChooser(true)} className="hidden md:flex" data-testid="button-load-truck" disabled={txnCropFilter === "all"}>
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
                    return sum + parseFloat(t.totalCostOfGoods || "0") + parseFloat(t.totalMandiCommission || "0") + parseFloat(t.totalAadhatCommission || "0") + parseFloat(t.totalHammali || "0") + parseFloat(t.totalMandiExtraCharges || "0") + parseFloat(t.tulai || "0") + parseFloat(t.majduri || "0") + parseFloat(t.thelaBhada || "0") + parseFloat(t.palaKarai || "0") + parseFloat(t.bardan || "0") + parseFloat(t.advancePayment || "0");
                  }
                  return sum + parseFloat(t.totalCostOfGoods || "0") + parseFloat(t.totalMandiCommission || "0") + parseFloat(t.totalHammali || "0") + parseFloat(t.transportationCharges || "0") + parseFloat(t.otherCharges || "0");
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
          {partyGroups.map((group) => (
            <PartyCard
              key={group.partyKey + "-" + group.maxTnxNumber}
              group={group}
              onEdit={(id) => setEditTransactionId(id)}
              onPrint={(txn) => {
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
        selectedCrop={txnCropFilter === "all" ? selectedCrop : txnCropFilter}
      />

      <LoadingTruckDialog
        open={showLoadingDialog}
        onOpenChange={setShowLoadingDialog}
        selectedCrop={txnCropFilter === "all" ? selectedCrop : txnCropFilter}
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

      <TransactionNakalDialog
        transactions={filteredTransactions}
        open={showNakal}
        onOpenChange={setShowNakal}
        merchantName={user?.merchantName || ""}
        dateLabel={(() => {
          const now = new Date();
          const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const d = now.getDate();
          const m = now.getMonth();
          const y = now.getFullYear();
          return `${dayNames[now.getDay()]}, ${d} ${monthNames[m]}, ${y} (${d}-${m + 1}-${y})`;
        })()}
      />

    </div>
  );
}

interface PartyGroup {
  partyName: string;
  partyKey: string;
  partyAddress: string;
  partyContact: string;
  txns: Transaction[];
  totalBags: number;
  totalCost: number;
  totalRevenue: number;
  totalPL: number;
  totalDue: number;
  maxTnxNumber: number;
}

interface PartyCardProps {
  group: PartyGroup;
  onEdit: (id: number) => void;
  onPrint: (txn: Transaction) => void;
}

function PartyCard({ group, onEdit, onPrint }: PartyCardProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [expandedTxnId, setExpandedTxnId] = useState<number | null>(null);
  const [confirmDeleteTxn, setConfirmDeleteTxn] = useState<Transaction | null>(null);

  const fmtMoney = (n: number) => parseFloat(n.toFixed(1)).toLocaleString("en-IN");

  const deleteMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const res = await apiRequest("DELETE", `/api/transactions/${transactionId}`);
      return res.json() as Promise<{ message: string; transactionNumber: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/unsold"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
      setConfirmDeleteTxn(null);
      toast({
        title: t("Transaction deleted", "लेनदेन हटा दिया गया"),
        description: t(
          `Tnx #${data.transactionNumber} has been permanently removed.`,
          `लेनदेन #${data.transactionNumber} स्थायी रूप से हटा दिया गया है।`,
        ),
      });
    },
    onError: (err: Error) => {
      toast({
        title: t("Could not delete transaction", "लेनदेन नहीं हटा सका"),
        description: err.message || t("Something went wrong.", "कुछ गलत हो गया।"),
        variant: "destructive",
      });
    },
  });

  // Pre-disable delete when money is already recorded directly on the row.
  // Allocation-based blocks still come from the 409 response so we don't
  // need to query each row separately.
  const getDeleteBlockReason = (txn: Transaction): string | null => {
    const advance = parseFloat(txn.advancePayment || "0");
    if (advance !== 0) {
      return t(
        `An advance of ₹${advance.toLocaleString("en-IN")} is recorded. Reverse it first.`,
        `₹${advance.toLocaleString("en-IN")} का अग्रिम दर्ज है। पहले उसे वापस लें।`,
      );
    }
    const received = parseFloat(txn.amountReceived || "0");
    if (received !== 0) {
      return t(
        `A payment of ₹${received.toLocaleString("en-IN")} is recorded. Reverse it first.`,
        `₹${received.toLocaleString("en-IN")} का भुगतान दर्ज है। पहले उसे वापस लें।`,
      );
    }
    return null;
  };

  const computeRow = (txn: Transaction) => {
    const cost = txn.transactionType === "loading"
      ? parseFloat(txn.totalCostOfGoods || "0") + parseFloat(txn.totalMandiCommission || "0") + parseFloat(txn.totalAadhatCommission || "0") + parseFloat(txn.totalHammali || "0") + parseFloat(txn.totalMandiExtraCharges || "0") + parseFloat(txn.tulai || "0") + parseFloat(txn.majduri || "0") + parseFloat(txn.thelaBhada || "0") + parseFloat(txn.palaKarai || "0") + parseFloat(txn.bardan || "0") + parseFloat(txn.advancePayment || "0")
      : parseFloat(txn.totalCostOfGoods || "0") + parseFloat(txn.totalMandiCommission || "0") + parseFloat(txn.totalHammali || "0") + parseFloat(txn.transportationCharges || "0") + parseFloat(txn.otherCharges || "0");
    const revenue = txn.revenue
      ? parseFloat(txn.revenue)
      : txn.items.reduce((sum, item) => sum + parseFloat(item.revenue || "0"), 0);
    const amountReceived = parseFloat(txn.amountReceived || "0");
    const due = Math.max(0, revenue - amountReceived);
    const profitLoss = txn.revenue ? parseFloat(txn.profitLoss || "0") : (revenue - cost);
    return { cost, revenue, due, profitLoss };
  };

  const cropBadgeClasses = (c: string) => c === "onion"
    ? "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-600"
    : c === "garlic"
      ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-600"
      : "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600";

  const cropLabel = (c: string) => c === "onion" ? t("Onion", "प्याज") : c === "garlic" ? t("Garlic", "लहसुन") : t("Potato", "आलू");

  return (
    <Card className="border border-orange-300 dark:border-orange-700 overflow-hidden" data-testid={`card-party-${group.partyKey}`}>
      <CardContent className="p-0">
        {/* Party Header */}
        <div className="bg-blue-700 dark:bg-blue-800 border-b border-blue-600 dark:border-blue-700">
          {/* Row 1: Name + Address + Contact + Badge — all on one line */}
          <div className="flex items-center justify-between gap-3 flex-wrap md:flex-nowrap px-4 py-2.5">
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap md:flex-nowrap min-w-0 flex-1">
              <span className="font-bold text-base leading-tight whitespace-nowrap text-white" data-testid={`text-party-name-${group.partyKey}`}>
                {group.partyName}
              </span>
              {group.partyAddress && (
                <span className="flex items-center gap-1 text-xs text-white/80 min-w-0" data-testid={`text-party-address-${group.partyKey}`}>
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{group.partyAddress}</span>
                </span>
              )}
              {group.partyContact && (
                <span className="flex items-center gap-1 text-xs text-white/80 whitespace-nowrap" data-testid={`text-party-contact-${group.partyKey}`}>
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  {group.partyContact}
                </span>
              )}
            </div>
            <Badge variant="outline" className="text-[10px] text-white border-white/40 bg-white/20 flex-shrink-0">
              {t("Transactions", "लेनदेन")}: {group.txns.length}
            </Badge>
          </div>

          {/* Divider between buyer info and aggregate row */}
          <div className="border-t border-blue-600 dark:border-blue-700" />

          {/* Row 2: Aggregate metrics — inline label: value pairs in equal-width columns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-1.5 min-w-0" data-testid={`text-aggregate-bags-${group.partyKey}`}>
              <span className="text-muted-foreground whitespace-nowrap">{t("Total Bags", "कुल बोरी")}:</span>
              <span className="font-semibold flex items-center gap-1">
                <Package className="h-3.5 w-3.5" />{group.totalBags}
              </span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0" data-testid={`text-aggregate-cost-${group.partyKey}`}>
              <span className="text-muted-foreground whitespace-nowrap">{t("Total Cost", "कुल लागत")}:</span>
              <span className="font-semibold">₹{fmtMoney(group.totalCost)}</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0" data-testid={`text-aggregate-revenue-${group.partyKey}`}>
              <span className="text-muted-foreground whitespace-nowrap">{t("Total Revenue", "कुल राजस्व")}:</span>
              <span className="font-semibold">₹{fmtMoney(group.totalRevenue)}</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0" data-testid={`text-aggregate-pl-${group.partyKey}`}>
              <span className="text-muted-foreground whitespace-nowrap">{t("P&L", "लाभ/हानि")}:</span>
              <span className={`font-semibold flex items-center gap-1 ${group.totalPL >= 0 ? "text-green-600" : "text-red-600"}`}>
                {group.totalPL >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {group.totalPL >= 0 ? "+" : "-"}₹{fmtMoney(Math.abs(group.totalPL))}
              </span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0" data-testid={`text-aggregate-due-${group.partyKey}`}>
              <span className="text-muted-foreground whitespace-nowrap">{t("Total Due", "कुल बकाया")}:</span>
              <span className={`font-semibold ${group.totalDue > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                ₹{fmtMoney(group.totalDue)}
              </span>
            </div>
          </div>
        </div>

        {/* Transactions table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm border-collapse">
            <thead className="bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 text-[11px] sm:text-xs">
              <tr>
                <th className="w-7 px-1 py-2"></th>
                <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t("Tnx#", "लेनदेन#")}</th>
                <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t("Date", "तिथि")}</th>
                <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t("Type", "प्रकार")}</th>
                <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t("Crop", "फसल")}</th>
                <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">{t("Bags", "बोरी")}</th>
                <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">{t("Net Wt", "वजन")}</th>
                <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">{t("Cost", "लागत")}</th>
                <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">{t("Revenue", "राजस्व")}</th>
                <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">{t("Due", "बकाया")}</th>
                <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">{t("P&L", "लाभ/हानि")}</th>
                <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("Edit", "संपादित")}</th>
                <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("Print", "प्रिंट")}</th>
              </tr>
            </thead>
            <tbody>
              {group.txns.map((txn) => {
                const { cost, revenue, due, profitLoss } = computeRow(txn);
                const c = txn.crop || (txn.items.length > 0 ? (txn.items[0].crop || "potato") : "potato");
                const isExpanded = expandedTxnId === txn.id;
                return (
                  <Fragment key={txn.id}>
                    <tr
                      className="border-b border-border hover:bg-muted/50 cursor-pointer"
                      onClick={() => setExpandedTxnId(prev => prev === txn.id ? null : txn.id)}
                      data-testid={`row-tnx-${txn.id}`}
                    >
                      <td className="px-1 py-2 text-center">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTxnId(prev => prev === txn.id ? null : txn.id);
                          }}
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                          data-testid={`button-expand-tnx-${txn.id}`}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-2 py-2 font-mono font-semibold whitespace-nowrap" data-testid={`text-tnx-number-${txn.id}`}>
                        {txn.transactionNumber}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {txn.transactionType === "loading" ? (
                          <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600 h-5">
                            {t("Loading", "लोडिंग")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-600 h-5" data-testid={`badge-bikri-${txn.id}`}>
                            {t("Bikri", "बिक्री")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <Badge variant="outline" className={`text-[10px] h-5 ${cropBadgeClasses(c)}`} data-testid={`badge-crop-${txn.id}`}>
                          {cropLabel(c)}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{txn.totalBags}</td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{parseFloat(txn.totalNetWeight || "0").toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap">₹{fmtMoney(cost)}</td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap">₹{fmtMoney(revenue)}</td>
                      <td className={`px-2 py-2 text-right font-mono whitespace-nowrap ${due > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                        ₹{fmtMoney(due)}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono whitespace-nowrap ${profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                        <span className="inline-flex items-center gap-0.5 justify-end">
                          {profitLoss >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          ₹{fmtMoney(Math.abs(profitLoss))}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); onEdit(txn.id); }}
                          data-testid={`button-edit-tnx-${txn.id}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); onPrint(txn); }}
                          data-testid={`button-print-tnx-${txn.id}`}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (() => {
                      const blockReason = getDeleteBlockReason(txn);
                      const isBlocked = blockReason !== null;
                      const deleteButton = (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isBlocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isBlocked) setConfirmDeleteTxn(txn);
                          }}
                          className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 disabled:opacity-50"
                          data-testid={`button-delete-tnx-${txn.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          <span className="text-xs">{t("Delete transaction", "लेनदेन हटाएं")}</span>
                        </Button>
                      );
                      return (
                        <tr className="bg-muted/30">
                          <td colSpan={13} className="px-4 py-3" data-testid={`region-tnx-items-${txn.id}`}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold text-muted-foreground mr-1">{t("Items", "आइटम")}:</span>
                              {txn.items.length === 0 ? (
                                <span className="text-xs text-muted-foreground">{t("No items", "कोई आइटम नहीं")}</span>
                              ) : txn.items.map((item) => {
                                const parts = [item.bagsMoved.toString(), item.potatoType, item.size].filter(Boolean);
                                const farmerInfo = item.farmerName ? ` ${item.farmerName}${item.farmerVillage ? ` (${item.farmerVillage})` : ""}` : "";
                                return (
                                  <Badge
                                    key={item.id}
                                    variant="outline"
                                    className="text-[10px] sm:text-xs bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-600 h-5"
                                    data-testid={`badge-lot-${txn.id}-${item.id}`}
                                  >
                                    S#{item.serialNumber} ({parts.join("- ")}){farmerInfo}
                                  </Badge>
                                );
                              })}
                            </div>
                            <div className="mt-3 flex justify-end">
                              {isBlocked ? (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span tabIndex={0}>{deleteButton}</span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs">
                                      {blockReason}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                deleteButton
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>

      <AlertDialog
        open={confirmDeleteTxn !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setConfirmDeleteTxn(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-delete-tnx">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                `Delete transaction #${confirmDeleteTxn?.transactionNumber ?? ""}?`,
                `लेनदेन #${confirmDeleteTxn?.transactionNumber ?? ""} हटाएं?`,
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-destructive">
                  {t("This action cannot be undone.", "यह क्रिया पूर्ववत नहीं की जा सकती।")}
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    {t(
                      "All numbers tied to this transaction — bags, cost, revenue, due amount, P&L, and edit history — will be permanently lost.",
                      "इस लेनदेन से जुड़े सभी आंकड़े — बोरी, लागत, राजस्व, बकाया राशि, लाभ/हानि और संपादन इतिहास — स्थायी रूप से हट जाएंगे।",
                    )}
                  </li>
                  <li>
                    {t(
                      "The bags will be returned to inventory so the source lots become available again.",
                      "बोरियाँ इन्वेंटरी में वापस जोड़ दी जाएँगी ताकि उनके स्रोत लॉट फिर से उपलब्ध हो जाएँ।",
                    )}
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteMutation.isPending}
              data-testid="button-cancel-delete-tnx"
            >
              {t("Cancel", "रद्द करें")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmDeleteTxn) deleteMutation.mutate(confirmDeleteTxn.id);
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-tnx"
            >
              {deleteMutation.isPending
                ? t("Deleting…", "हटा रहे हैं…")
                : t("Delete permanently", "स्थायी रूप से हटाएं")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

