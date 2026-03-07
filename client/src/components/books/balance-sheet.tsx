import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Scale, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

const CATEGORY_LABELS: Record<string, [string, string]> = {
  vehicle: ["Vehicle", "वाहन"],
  building: ["Building", "भवन"],
  equipment: ["Equipment", "उपकरण"],
  furniture: ["Furniture", "फर्नीचर"],
  computer: ["Computer", "कंप्यूटर"],
  other: ["Other", "अन्य"],
};

interface BalanceSheetProps {
  financialYear: string;
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function LineItem({ label, value, indent = false, bold = false, color }: { label: string; value: number; indent?: boolean; bold?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${indent ? "pl-4" : ""} ${bold ? "font-semibold border-t pt-2" : ""}`}>
      <span className={`text-sm ${bold ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${color || (bold ? "font-semibold" : "")}`}>₹{fmt(value)}</span>
    </div>
  );
}

export function BalanceSheet({ financialYear }: BalanceSheetProps) {
  const { t } = useLanguage();

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/books/balance-sheet", financialYear],
    queryFn: async () => {
      const res = await fetch(`/api/books/balance-sheet?fy=${financialYear}`, { credentials: "include" });
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
          <p>{t("Failed to load balance sheet", "बैलेंस शीट लोड करने में विफल")}</p>
        </CardContent>
      </Card>
    );
  }

  const { assets: a, liabilities: l, ownersEquity } = data;

  return (
    <div className="space-y-4" data-testid="balance-sheet">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-600" />
            <p className="text-xs text-muted-foreground">{t("Total Assets", "कुल संपत्ति")}</p>
            <p className="text-xl font-bold text-green-600" data-testid="text-total-assets">₹{fmt(a.totalAssets)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <TrendingDown className="h-5 w-5 mx-auto mb-1 text-red-600" />
            <p className="text-xs text-muted-foreground">{t("Total Liabilities", "कुल देयता")}</p>
            <p className="text-xl font-bold text-red-600" data-testid="text-total-liabilities">₹{fmt(l.totalLiabilities)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Scale className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">{t("Owner's Equity", "मालिक की इक्विटी")}</p>
            <p className={`text-xl font-bold ${ownersEquity >= 0 ? "text-primary" : "text-red-600"}`} data-testid="text-owners-equity">₹{fmt(ownersEquity)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-assets-side">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              {t("Assets", "संपत्ति")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-semibold mb-1">{t("Fixed Assets", "स्थायी संपत्ति")}</p>
              {a.fixedAssets.details.length > 0 ? (
                a.fixedAssets.details.map((d: any, i: number) => {
                  const catLbl = CATEGORY_LABELS[d.category] || ["Other", "अन्य"];
                  return <LineItem key={i} label={`${d.name} (${t(catLbl[0], catLbl[1])})`} value={d.bookValue} indent />;
                })
              ) : (
                <p className="text-xs text-muted-foreground pl-4">{t("No fixed assets", "कोई स्थायी संपत्ति नहीं")}</p>
              )}
              <LineItem label={t("Gross Fixed Assets", "सकल स्थायी संपत्ति")} value={a.fixedAssets.gross} indent />
              <LineItem label={t("Less: Depreciation", "घटाव: मूल्यह्रास")} value={-a.fixedAssets.depreciation} indent />
              <LineItem label={t("Net Fixed Assets", "शुद्ध स्थायी संपत्ति")} value={a.fixedAssets.net} bold />
            </div>

            <div>
              <p className="text-sm font-semibold mb-1">{t("Current Assets", "चालू संपत्ति")}</p>
              <LineItem label={t("Cash in Hand", "नकद")} value={a.currentAssets.cashInHand} indent />
              {a.currentAssets.bankBalances.map((b: any, i: number) => (
                <LineItem key={i} label={b.name} value={b.balance} indent />
              ))}
              <LineItem label={t("Receivables from Buyers", "खरीदारों से प्राप्य")} value={a.currentAssets.buyerReceivables} indent />
              <LineItem label={t("Receivables from Farmers", "किसानों से प्राप्य")} value={a.currentAssets.farmerReceivables} indent />
              <LineItem label={t("Total Current Assets", "कुल चालू संपत्ति")} value={a.currentAssets.total} bold />
            </div>

            <div className="border-t-2 border-primary pt-2">
              <LineItem label={t("TOTAL ASSETS", "कुल संपत्ति")} value={a.totalAssets} bold color="text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-liabilities-side">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              {t("Liabilities & Equity", "देयताएं और इक्विटी")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-semibold mb-1">{t("Long-term Liabilities", "दीर्घकालिक देयताएं")}</p>
              {l.longTerm.details.length > 0 ? (
                l.longTerm.details.map((d: any, i: number) => (
                  <LineItem key={i} label={d.name} value={d.remaining} indent />
                ))
              ) : (
                <p className="text-xs text-muted-foreground pl-4">{t("None", "कोई नहीं")}</p>
              )}
              <LineItem label={t("Total Long-term", "कुल दीर्घकालिक")} value={l.longTerm.total} bold />
            </div>

            <div>
              <p className="text-sm font-semibold mb-1">{t("Short-term Liabilities", "अल्पकालिक देयताएं")}</p>
              {l.shortTerm.details.length > 0 ? (
                l.shortTerm.details.map((d: any, i: number) => (
                  <LineItem key={i} label={d.name} value={d.remaining} indent />
                ))
              ) : (
                <p className="text-xs text-muted-foreground pl-4">{t("None", "कोई नहीं")}</p>
              )}
              <LineItem label={t("Total Short-term", "कुल अल्पकालिक")} value={l.shortTerm.total} bold />
            </div>

            <div>
              <p className="text-sm font-semibold mb-1">{t("Current Liabilities", "चालू देयताएं")}</p>
              <LineItem label={t("Payables to Farmers", "किसानों को देय")} value={l.currentLiabilities.farmerPayables} indent />
              {l.currentLiabilities.limitAccountLiabilities > 0 && (
                <>
                  {(l.currentLiabilities.limitAccountDetails || []).map((d: any, i: number) => (
                    <LineItem key={i} label={`${d.name} (${t("Overdraft", "ओवरड्राफ्ट")})`} value={d.balance} indent />
                  ))}
                </>
              )}
            </div>

            <div className="border-t pt-2">
              <LineItem label={t("Total Liabilities", "कुल देयताएं")} value={l.totalLiabilities} bold color="text-red-600" />
            </div>

            <div>
              <LineItem label={t("Owner's Equity", "मालिक की इक्विटी")} value={ownersEquity} bold color={ownersEquity >= 0 ? "text-primary" : "text-red-600"} />
            </div>

            <div className="border-t-2 border-primary pt-2">
              <LineItem label={t("TOTAL LIABILITIES + EQUITY", "कुल देयताएं + इक्विटी")} value={l.totalLiabilities + ownersEquity} bold color="text-green-600" />
            </div>

            {data.balanceCheck && (
              <Badge variant="outline" className="text-green-600 border-green-600" data-testid="badge-balance-check">
                ✓ {t("Balanced", "संतुलित")}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
