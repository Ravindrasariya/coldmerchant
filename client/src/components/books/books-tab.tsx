import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { BookOpen, Building2, FileText, TrendingUp } from "lucide-react";
import { AssetRegister } from "./asset-register";
import { LiabilityRegister } from "./liability-register";
import { BalanceSheet } from "./balance-sheet";
import { ProfitLoss } from "./profit-loss";

function getCurrentFY(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${(year + 1).toString().slice(-2)}`;
}

function getFYOptions(): string[] {
  const currentFY = getCurrentFY();
  const [startYear] = currentFY.split("-").map(Number);
  const options: string[] = [];
  for (let y = startYear; y >= startYear - 4; y--) {
    options.push(`${y}-${(y + 1).toString().slice(-2)}`);
  }
  return options;
}

export function BooksTab() {
  const { t } = useLanguage();
  const [activeSubTab, setActiveSubTabState] = useState(() => localStorage.getItem("vyapar_booksActiveTab") || "assets");
  const [financialYear, setFinancialYear] = useState(getCurrentFY);

  const setActiveSubTab = (tab: string) => {
    setActiveSubTabState(tab);
    localStorage.setItem("vyapar_booksActiveTab", tab);
  };

  const fyOptions = getFYOptions();

  return (
    <div className="space-y-6" data-testid="books-tab">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-books-title">
            {t("Books", "बुक्स")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Financial statements & accounting", "वित्तीय विवरण और लेखा")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">{t("FY", "वि.व.")}</span>
          <Select value={financialYear} onValueChange={setFinancialYear}>
            <SelectTrigger className="w-[120px]" data-testid="select-financial-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fyOptions.map(fy => (
                <SelectItem key={fy} value={fy} data-testid={`option-fy-${fy}`}>{fy}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="assets" className="flex items-center gap-1.5 text-xs sm:text-sm py-2" data-testid="tab-assets">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t("Asset Register", "संपत्ति रजिस्टर")}</span>
            <span className="sm:hidden">{t("Assets", "संपत्ति")}</span>
          </TabsTrigger>
          <TabsTrigger value="liabilities" className="flex items-center gap-1.5 text-xs sm:text-sm py-2" data-testid="tab-liabilities">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t("Liability Register", "देयता रजिस्टर")}</span>
            <span className="sm:hidden">{t("Liabilities", "देयता")}</span>
          </TabsTrigger>
          <TabsTrigger value="balance-sheet" className="flex items-center gap-1.5 text-xs sm:text-sm py-2" data-testid="tab-balance-sheet">
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t("Balance Sheet", "बैलेंस शीट")}</span>
            <span className="sm:hidden">{t("B/S", "बै.शी.")}</span>
          </TabsTrigger>
          <TabsTrigger value="profit-loss" className="flex items-center gap-1.5 text-xs sm:text-sm py-2" data-testid="tab-profit-loss">
            <TrendingUp className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t("Profit & Loss", "लाभ और हानि")}</span>
            <span className="sm:hidden">{t("P&L", "ला.हा.")}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className={activeSubTab === "assets" ? "block" : "hidden"}>
        <AssetRegister financialYear={financialYear} />
      </div>
      <div className={activeSubTab === "liabilities" ? "block" : "hidden"}>
        <LiabilityRegister />
      </div>
      <div className={activeSubTab === "balance-sheet" ? "block" : "hidden"}>
        <BalanceSheet financialYear={financialYear} />
      </div>
      <div className={activeSubTab === "profit-loss" ? "block" : "hidden"}>
        <ProfitLoss financialYear={financialYear} />
      </div>
    </div>
  );
}
