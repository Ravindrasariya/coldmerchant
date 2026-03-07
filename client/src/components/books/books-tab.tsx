import { useState, useRef } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { BookOpen, Building2, FileText, TrendingUp, Printer } from "lucide-react";
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
  const { user } = useAuth();
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeSubTab, setActiveSubTabState] = useState(() => localStorage.getItem("vyapar_booksActiveTab") || "assets");
  const [financialYear, setFinancialYear] = useState(getCurrentFY);

  const setActiveSubTab = (tab: string) => {
    setActiveSubTabState(tab);
    localStorage.setItem("vyapar_booksActiveTab", tab);
  };

  const fyOptions = getFYOptions();

  const TAB_TITLES: Record<string, [string, string]> = {
    assets: ["Asset Register", "संपत्ति रजिस्टर"],
    liabilities: ["Liability Register", "देयता रजिस्टर"],
    "balance-sheet": ["Balance Sheet", "बैलेंस शीट"],
    "profit-loss": ["Profit & Loss Statement", "लाभ और हानि विवरण"],
  };

  const handlePrint = () => {
    if (!contentRef.current) return;
    const activePanel = contentRef.current.querySelector(`[data-tab="${activeSubTab}"]`);
    if (!activePanel) return;

    const merchantName = user?.merchantName || "Merchant";
    const tabTitle = TAB_TITLES[activeSubTab] || ["Report", "रिपोर्ट"];
    const title = t(tabTitle[0], tabTitle[1]);

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title} - ${financialYear}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #1a1a1a; }
          .print-header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 16px; }
          .print-header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
          .print-header h2 { font-size: 16px; font-weight: 600; color: #444; margin-bottom: 2px; }
          .print-header p { font-size: 12px; color: #666; }
          .print-content { font-size: 14px; }
          .print-content [class*="grid"] { display: block !important; }
          .print-content [class*="Card"], .print-content [class*="card"] { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid; }
          .print-content table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          .print-content th, .print-content td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
          .print-content th { font-weight: 600; background: #f5f5f5; }
          .print-content button, .print-content [data-testid*="button"] { display: none !important; }
          .print-content svg { display: none !important; }
          .print-content [class*="Badge"], .print-content [class*="badge"] { display: inline-block; padding: 2px 8px; border: 1px solid #ccc; border-radius: 12px; font-size: 11px; }
          @media print { body { padding: 0; } .print-header { margin-bottom: 16px; } }
          @page { margin: 15mm; }
        </style>
      </head>
      <body>
        <div class="print-header">
          <h1>${merchantName}</h1>
          <h2>${title}</h2>
          <p>${t("Financial Year", "वित्तीय वर्ष")}: ${financialYear}</p>
        </div>
        <div class="print-content">
          ${activePanel.innerHTML}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

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
          <Button
            onClick={handlePrint}
            variant="ghost"
            size="icon"
            title={t("Print", "प्रिंट")}
            data-testid="button-print-books"
          >
            <Printer className="h-4 w-4" />
          </Button>
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

      <div ref={contentRef}>
        <div className={activeSubTab === "assets" ? "block" : "hidden"} data-tab="assets">
          <AssetRegister financialYear={financialYear} />
        </div>
        <div className={activeSubTab === "liabilities" ? "block" : "hidden"} data-tab="liabilities">
          <LiabilityRegister />
        </div>
        <div className={activeSubTab === "balance-sheet" ? "block" : "hidden"} data-tab="balance-sheet">
          <BalanceSheet financialYear={financialYear} />
        </div>
        <div className={activeSubTab === "profit-loss" ? "block" : "hidden"} data-tab="profit-loss">
          <ProfitLoss financialYear={financialYear} />
        </div>
      </div>
    </div>
  );
}
