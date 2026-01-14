import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, Package, IndianRupee, TrendingUp, TrendingDown, Edit, Printer } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { LoadTruckDialog } from "./load-truck-dialog";
import { EditTransactionDialog } from "./edit-transaction-dialog";
import { SalesReceiptDialog } from "./sales-receipt";

interface TransactionItem {
  id: number;
  serialNumber: number;
  coldStoreName: string;
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
  vehicleNumber: string | null;
  advancePayment: string | null;
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

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

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
      ) : (
        <div className="space-y-4">
          {transactions?.slice().sort((a, b) => b.transactionNumber - a.transactionNumber).map((txn) => (
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
  const advancePayment = parseFloat(transaction.advancePayment || "0");
  const revenue = parseFloat(transaction.revenue || "0");
  const profitLoss = parseFloat(transaction.profitLoss || "0");
  
  const duePayment = Math.max(0, revenue - advancePayment);

  return (
    <Card className="hover-elevate" data-testid={`card-transaction-${transaction.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
            <Badge variant="outline">#{transaction.transactionNumber}</Badge>
            {transaction.partyName && (
              <span className="text-base font-medium">{transaction.partyName}</span>
            )}
            {transaction.vehicleNumber && (
              <Badge variant="secondary" className="text-xs">
                <Truck className="h-3 w-3 mr-1" />
                {transaction.vehicleNumber}
              </Badge>
            )}
          </CardTitle>
          {profitLoss !== 0 && (
            <Badge variant={profitLoss >= 0 ? "default" : "destructive"} className="flex items-center gap-1">
              {profitLoss >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              ₹{Math.abs(profitLoss).toFixed(2)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(transaction.createdAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2 text-sm">
          <div className="text-center p-2 bg-muted/50 rounded-md">
            <Package className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="font-semibold">{transaction.totalBags}</p>
            <p className="text-xs text-muted-foreground">{t("Bags", "बोरी")}</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-md">
            <p className="font-semibold">{parseFloat(transaction.totalNetWeight || "0").toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">{t("Kg", "किग्रा")}</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-md">
            <IndianRupee className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="font-semibold">₹{totalCost.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">{t("Cost", "लागत")}</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-md">
            <p className="font-semibold">₹{revenue.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">{t("Revenue", "राजस्व")}</p>
          </div>
        </div>

        <div className="space-y-1 text-sm border-t pt-2">
          {transaction.items.slice(0, 3).map((item) => (
            <div key={item.id} className="flex justify-between text-muted-foreground">
              <span>S#{item.serialNumber} - {item.coldStoreName}</span>
              <span>{item.bagsMoved} {t("bags", "बोरी")}</span>
            </div>
          ))}
          {transaction.items.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{transaction.items.length - 3} {t("more lots", "और लॉट")}
            </p>
          )}
        </div>

        {duePayment > 0 && (
          <div className="border-t pt-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t("Due Payment:", "बकाया भुगतान:")}</span>
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                ₹{duePayment.toFixed(2)}
              </span>
            </div>
            {advancePayment > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                ({t("Revenue", "राजस्व")} ₹{revenue.toFixed(0)} - {t("Advance", "अग्रिम")} ₹{advancePayment.toFixed(0)})
              </p>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2 border-t gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1"
          onClick={onEdit}
          data-testid={`button-edit-transaction-${transaction.id}`}
        >
          <Edit className="h-4 w-4 mr-1" />
          {t("Edit", "संपादित करें")}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1"
          onClick={onPrint}
          data-testid={`button-print-receipt-${transaction.id}`}
        >
          <Printer className="h-4 w-4 mr-1" />
          {t("Receipt", "रसीद")}
        </Button>
      </CardFooter>
    </Card>
  );
}
