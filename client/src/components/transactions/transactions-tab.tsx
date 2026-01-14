import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Package, TrendingUp, TrendingDown, Edit, Printer, IndianRupee, Wallet, Receipt, CreditCard, Filter, X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { LoadTruckDialog } from "./load-truck-dialog";
import { EditTransactionDialog } from "./edit-transaction-dialog";
import { SalesReceiptDialog } from "./sales-receipt";

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
  const { user } = useAuth();
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [editTransactionId, setEditTransactionId] = useState<number | null>(null);
  const [printTransactionId, setPrintTransactionId] = useState<number | null>(null);
  
  // Filter states
  const [filterTxnNumber, setFilterTxnNumber] = useState("");
  const [filterSerialNumber, setFilterSerialNumber] = useState("");
  const [filterParty, setFilterParty] = useState("all");
  const [filterPaymentDue, setFilterPaymentDue] = useState("all");

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
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
        const revenue = parseFloat(txn.revenue || "0");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("Transactions", "लेनदेन")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Manage truck loading and sales transactions", "ट्रक लोडिंग और बिक्री लेनदेन प्रबंधित करें")}
          </p>
        </div>
        <Button onClick={() => setShowLoadDialog(true)} data-testid="button-load-truck">
          <Truck className="h-4 w-4 mr-2" />
          {t("Load A Truck", "ट्रक लोड करें")}
        </Button>
      </div>

      {/* Filters */}
      {transactions && transactions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t("Filters", "फ़िल्टर")}</span>
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {filteredTransactions && filteredTransactions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <IndianRupee className="h-4 w-4" />
                {t("Total Revenue", "कुल राजस्व")}
              </div>
              <p className="text-xl font-bold">
                ₹{filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.revenue || "0")), 0).toLocaleString("en-IN")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Receipt className="h-4 w-4" />
                {t("Total Cost", "कुल लागत")}
              </div>
              <p className="text-xl font-bold">
                ₹{filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.totalCostOfGoods || "0")), 0).toLocaleString("en-IN")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                {filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.profitLoss || "0")), 0) >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                {t("Total P&L", "कुल लाभ/हानि")}
              </div>
              <p className={`text-xl font-bold ${filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.profitLoss || "0")), 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                {filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.profitLoss || "0")), 0) >= 0 ? "+" : ""}
                ₹{Math.abs(filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.profitLoss || "0")), 0)).toLocaleString("en-IN")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Wallet className="h-4 w-4" />
                {t("Total Paid", "कुल भुगतान")}
              </div>
              <p className="text-xl font-bold text-green-600">
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
              <p className="text-xl font-bold text-orange-600">
                ₹{Math.max(0, filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.revenue || "0") - parseFloat(t.amountReceived || "0")), 0)).toLocaleString("en-IN")}
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
  const revenue = parseFloat(transaction.revenue || "0");
  const profitLoss = parseFloat(transaction.profitLoss || "0");
  
  // Get unique bag sizes from transaction items
  const bagTypes = Array.from(new Set(transaction.items.map(item => item.size).filter(Boolean))) as string[];

  return (
    <Card className="hover-elevate" data-testid={`card-transaction-${transaction.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">#{transaction.transactionNumber}</Badge>
              {bagTypes.map((size) => (
                <Badge key={size} variant="secondary" className="text-xs">
                  {size}
                </Badge>
              ))}
              {transaction.partyName && (
                <span className="font-semibold">{transaction.partyName}</span>
              )}
              {transaction.vehicleNumber && (
                <Badge variant="secondary" className="text-xs">
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

            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{transaction.totalBags}</span>
                <span className="text-muted-foreground">{t("Bags", "बोरी")}</span>
              </span>
              <span className="text-muted-foreground">|</span>
              <span>
                <span className="font-medium">{parseFloat(transaction.totalNetWeight || "0").toFixed(1)}</span>
                <span className="text-muted-foreground ml-1">{t("Kg", "किग्रा")}</span>
              </span>
              <span className="text-muted-foreground">|</span>
              <span>
                <span className="text-muted-foreground">{t("Cost", "लागत")}:</span>
                <span className="font-medium ml-1">₹{totalCost.toFixed(0)}</span>
              </span>
              <span className="text-muted-foreground">|</span>
              <span>
                <span className="text-muted-foreground">{t("Revenue", "राजस्व")}:</span>
                <span className="font-medium ml-1">₹{revenue.toFixed(0)}</span>
              </span>
              {revenue > 0 && (
                <Badge variant="outline" className="text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-600">
                  {t("Due", "बकाया")}: ₹{revenue.toFixed(0)}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span>
                {new Date(transaction.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span>|</span>
              {transaction.items.slice(0, 2).map((item, idx) => (
                <span key={item.id}>
                  {idx > 0 && ", "}
                  S#{item.serialNumber} ({item.bagsMoved} - {item.size || "Mixed"}, {item.potatoType || "-"})
                </span>
              ))}
              {transaction.items.length > 2 && (
                <span>+{transaction.items.length - 2} {t("more", "और")}</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 flex-shrink-0">
            <Button 
              variant="outline" 
              size="sm"
              onClick={onEdit}
              data-testid={`button-edit-transaction-${transaction.id}`}
            >
              <Edit className="h-4 w-4 mr-1" />
              {t("Edit", "संपादित")}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={onPrint}
              data-testid={`button-print-receipt-${transaction.id}`}
            >
              <Printer className="h-4 w-4 mr-1" />
              {t("Receipt", "रसीद")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
