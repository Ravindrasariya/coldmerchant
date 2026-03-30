import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";

interface ProfitLossProps {
  financialYear: string;
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const REVENUE_LABELS: Record<string, [string, string]> = {
  raw_potato: ["Raw Potato Sales", "कच्चे आलू की बिक्री"],
  seed_sale: ["Seed Sales", "बीज की बिक्री"],
  commission: ["Commission Income", "कमीशन आय"],
  other: ["Other Income", "अन्य आय"],
};

const EXPENSE_LABELS: Record<string, [string, string]> = {
  cost_of_goods_sold: ["Cost of Goods Sold", "बिकी वस्तुओं की लागत"],
  wastage_loss: ["Wastage Loss", "नुकसान (बर्बादी)"],
  bag_charges: ["Bag Charges", "बोरी खर्च"],
  cold_store_charge: ["Cold Store Charges", "शीतगृह खर्च"],
  farmer: ["Farmer Payments", "किसान भुगतान"],
  farmer_advance: ["Farmer Advance", "किसान अग्रिम"],
  farmer_freight: ["Farmer Freight", "किसान भाड़ा"],
  farmer_others: ["Farmer Others", "किसान अन्य"],
  general_expense: ["General Expense", "सामान्य खर्च"],
  grading: ["Grading Charges", "ग्रेडिंग खर्च"],
  hammali: ["Hammali Charges", "हम्माली खर्च"],
  kata_charges: ["Kata Charges", "काटा खर्च"],
  pesticide_charges: ["Pesticide Charges", "कीटनाशक खर्च"],
  salary: ["Salary", "वेतन"],
  transport_freight: ["Transport/Freight Charges", "परिवहन/भाड़ा खर्च"],
  warehouse_charges: ["Warehouse Charges", "गोदाम खर्च"],
  depreciation: ["Depreciation", "मूल्यह्रास"],
  interest_on_loans: ["Interest on Loans", "ऋण पर ब्याज"],
};

export function ProfitLoss({ financialYear }: ProfitLossProps) {
  const { t } = useLanguage();

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/books/profit-loss", financialYear],
    queryFn: async () => {
      const res = await fetch(`/api/books/profit-loss?fy=${financialYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}</div>;
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>{t("Failed to load Profit & Loss", "लाभ और हानि लोड करने में विफल")}</p>
        </CardContent>
      </Card>
    );
  }

  const { revenue, expenses, netProfitLoss } = data;
  const isProfit = netProfitLoss >= 0;
  const revenueEntries = Object.entries(revenue.byType as Record<string, number>).sort((a, b) => b[1] - a[1]);
  const expenseEntries = Object.entries(expenses.byType as Record<string, number>).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4" data-testid="profit-loss">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-600" />
            <p className="text-xs text-muted-foreground">{t("Total Revenue", "कुल आय")}</p>
            <p className="text-xl font-bold text-green-600" data-testid="text-total-revenue">₹{fmt(revenue.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <TrendingDown className="h-5 w-5 mx-auto mb-1 text-red-600" />
            <p className="text-xs text-muted-foreground">{t("Total Expenses", "कुल खर्च")}</p>
            <p className="text-xl font-bold text-red-600" data-testid="text-total-expenses">₹{fmt(expenses.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <DollarSign className={`h-5 w-5 mx-auto mb-1 ${isProfit ? "text-green-600" : "text-red-600"}`} />
            <p className="text-xs text-muted-foreground">{isProfit ? t("Net Profit", "शुद्ध लाभ") : t("Net Loss", "शुद्ध हानि")}</p>
            <p className={`text-xl font-bold ${isProfit ? "text-green-600" : "text-red-600"}`} data-testid="text-net-profit-loss">
              {isProfit ? "" : "-"}₹{fmt(Math.abs(netProfitLoss))}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-revenue">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              {t("Revenue", "आय")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("No revenue recorded for this FY", "इस वि.व. के लिए कोई आय दर्ज नहीं")}</p>
            ) : (
              <div className="space-y-1">
                {revenueEntries.map(([type, amount]) => {
                  const lbl = REVENUE_LABELS[type] || [type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), type];
                  const pct = revenue.total > 0 ? ((amount / revenue.total) * 100).toFixed(1) : "0";
                  return (
                    <div key={type} className="flex justify-between items-center py-1.5" data-testid={`row-revenue-${type}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{t(lbl[0], lbl[1])}</span>
                        <span className="text-xs text-muted-foreground">({pct}%)</span>
                      </div>
                      <span className="text-sm tabular-nums font-medium text-green-600">₹{fmt(amount)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between items-center py-2 border-t font-semibold">
                  <span className="text-sm">{t("Total Revenue", "कुल आय")}</span>
                  <span className="text-sm tabular-nums text-green-600">₹{fmt(revenue.total)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-expenses">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              {t("Expenses", "खर्च")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenseEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("No expenses recorded for this FY", "इस वि.व. के लिए कोई खर्च दर्ज नहीं")}</p>
            ) : (
              <div className="space-y-1">
                {expenseEntries.map(([type, amount]) => {
                  const lbl = EXPENSE_LABELS[type] || [type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), type];
                  const pct = expenses.total > 0 ? ((amount / expenses.total) * 100).toFixed(1) : "0";
                  return (
                    <div key={type} className="flex justify-between items-center py-1.5" data-testid={`row-expense-${type}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{t(lbl[0], lbl[1])}</span>
                        <span className="text-xs text-muted-foreground">({pct}%)</span>
                      </div>
                      <span className="text-sm tabular-nums font-medium text-red-600">₹{fmt(amount)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between items-center py-2 border-t font-semibold">
                  <span className="text-sm">{t("Total Expenses", "कुल खर्च")}</span>
                  <span className="text-sm tabular-nums text-red-600">₹{fmt(expenses.total)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={`border-2 ${isProfit ? "border-green-200 dark:border-green-900" : "border-red-200 dark:border-red-900"}`} data-testid="card-net-result">
        <CardContent className="py-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold">{isProfit ? t("Net Profit", "शुद्ध लाभ") : t("Net Loss", "शुद्ध हानि")}</span>
            <span className={`text-2xl font-bold ${isProfit ? "text-green-600" : "text-red-600"}`}>
              {isProfit ? "" : "-"}₹{fmt(Math.abs(netProfitLoss))}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
