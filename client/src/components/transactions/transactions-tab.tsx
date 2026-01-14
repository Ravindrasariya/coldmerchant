import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, Plus, Package, IndianRupee, TrendingUp, TrendingDown } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { LoadTruckDialog } from "./load-truck-dialog";

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
  transactionNumber: number;
  partyName: string | null;
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
  const [showLoadDialog, setShowLoadDialog] = useState(false);

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {transactions?.map((txn) => (
            <TransactionCard key={txn.id} transaction={txn} />
          ))}
        </div>
      )}

      <LoadTruckDialog 
        open={showLoadDialog} 
        onOpenChange={setShowLoadDialog} 
      />
    </div>
  );
}

function TransactionCard({ transaction }: { transaction: Transaction }) {
  const { t } = useLanguage();

  const totalCost = parseFloat(transaction.totalCostOfGoods || "0");
  const advancePayment = parseFloat(transaction.advancePayment || "0");
  const transportCharges = parseFloat(transaction.transportationCharges || "0");
  const otherCharges = parseFloat(transaction.otherCharges || "0");
  const profitLoss = parseFloat(transaction.profitLoss || "0");
  
  const dueFromMerchant = totalCost - advancePayment;

  return (
    <Card className="hover-elevate" data-testid={`card-transaction-${transaction.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Badge variant="outline">#{transaction.transactionNumber}</Badge>
            {transaction.partyName && (
              <span className="text-base font-medium">{transaction.partyName}</span>
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
        <div className="grid grid-cols-3 gap-2 text-sm">
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
        </div>

        <div className="space-y-1 text-sm border-t pt-2">
          {transaction.items.slice(0, 3).map((item, idx) => (
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

        {dueFromMerchant > 0 && (
          <div className="border-t pt-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t("Due Payment:", "बकाया भुगतान:")}</span>
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                ₹{dueFromMerchant.toFixed(2)}
              </span>
            </div>
            {advancePayment > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                ({t("After advance of", "अग्रिम के बाद")} ₹{advancePayment.toFixed(0)})
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
