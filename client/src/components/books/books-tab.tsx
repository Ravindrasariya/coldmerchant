import { useState } from "react";
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

  const ASSET_CAT: Record<string, [string, string]> = { vehicle: ["Vehicle", "वाहन"], building: ["Building", "भवन"], equipment: ["Equipment", "उपकरण"], furniture: ["Furniture", "फर्नीचर"], computer: ["Computer", "कंप्यूटर"], other: ["Other", "अन्य"] };
  const REV_LABELS: Record<string, [string, string]> = { raw_potato: ["Raw Potato Sales", "कच्चे आलू की बिक्री"], seed_sale: ["Seed Sales", "बीज की बिक्री"], commission: ["Commission Income", "कमीशन आय"], other: ["Other Income", "अन्य आय"] };
  const EXP_LABELS: Record<string, [string, string]> = { aadhtiya: ["Aadhat Payments", "आढ़तिया भुगतान"], bag_charges: ["Bag Charges", "बोरी खर्च"], cold_store_charge: ["Cold Store Charges", "शीतगृह खर्च"], farmer: ["Farmer Payments", "किसान भुगतान"], farmer_advance: ["Farmer Advance", "किसान अग्रिम"], farmer_freight: ["Farmer Freight", "किसान भाड़ा"], farmer_others: ["Farmer Others", "किसान अन्य"], general_expense: ["General Expense", "सामान्य खर्च"], grading: ["Grading Charges", "ग्रेडिंग खर्च"], hammali: ["Hammali Charges", "हम्माली खर्च"], kata_charges: ["Kata Charges", "काटा खर्च"], pesticide_charges: ["Pesticide Charges", "कीटनाशक खर्च"], salary: ["Salary", "वेतन"], supplier: ["Supplier Payments", "आपूर्तिकर्ता भुगतान"], warehouse_charges: ["Warehouse Charges", "गोदाम खर्च"], depreciation: ["Depreciation", "मूल्यह्रास"], interest_on_loans: ["Interest on Loans", "ऋण पर ब्याज"] };

  const fmt = (n: number | null | undefined) => "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const row = (label: string, value: string, opts?: { bold?: boolean; indent?: boolean; section?: boolean }) => {
    if (opts?.section) return `<tr><td colspan="2" style="font-weight:700;font-size:14px;background:#f0f0f0;padding:8px 10px;border-bottom:2px solid #ccc;">${label}</td></tr>`;
    const style = opts?.bold ? "font-weight:700;border-top:1px solid #999;" : "";
    const pl = opts?.indent ? "padding-left:28px;" : "";
    return `<tr style="${style}"><td style="${pl}padding:6px 10px;">${label}</td><td style="padding:6px 10px;text-align:right;white-space:nowrap;">${value}</td></tr>`;
  };

  const handlePrint = async () => {
    const merchantName = user?.merchantName || "Merchant";
    const tabTitle = TAB_TITLES[activeSubTab] || ["Report", "रिपोर्ट"];
    const title = t(tabTitle[0], tabTitle[1]);
    let tableHTML = "";

    try {
      if (activeSubTab === "balance-sheet") {
        const res = await fetch(`/api/books/balance-sheet?fy=${financialYear}`, { credentials: "include" });
        const d = await res.json();
        const a = d.assets || {}; const l = d.liabilities || {};
        const fa = a.fixedAssets || { gross: 0, depreciation: 0, net: 0, details: [] };
        const ca = a.currentAssets || { cashInHand: 0, bankBalances: [], totalBankBalance: 0, buyerReceivables: 0, farmerReceivables: 0, total: 0 };
        const lt = l.longTerm || { total: 0, details: [] };
        const st = l.shortTerm || { total: 0, details: [] };
        const cl = l.currentLiabilities || { farmerPayables: 0, limitAccountLiabilities: 0, limitAccountDetails: [] };
        const rows: string[] = [];
        rows.push(row(t("ASSETS", "संपत्ति"), "", { section: true }));
        rows.push(row(t("Fixed Assets", "स्थायी संपत्ति"), "", { bold: true }));
        if ((fa.details || []).length > 0) {
          for (const item of fa.details) {
            const catLbl = ASSET_CAT[item.category] || ["Other", "अन्य"];
            rows.push(row(`${item.name} (${t(catLbl[0], catLbl[1])})`, fmt(item.bookValue), { indent: true }));
          }
        } else {
          rows.push(row(t("No fixed assets", "कोई स्थायी संपत्ति नहीं"), "-", { indent: true }));
        }
        rows.push(row(t("Gross Fixed Assets", "सकल स्थायी संपत्ति"), fmt(fa.gross), { indent: true }));
        rows.push(row(t("Less: Depreciation", "घटाव: मूल्यह्रास"), fmt(-(fa.depreciation || 0)), { indent: true }));
        rows.push(row(t("Net Fixed Assets", "शुद्ध स्थायी संपत्ति"), fmt(fa.net), { bold: true }));
        rows.push(row(t("Current Assets", "चालू संपत्ति"), "", { bold: true }));
        rows.push(row(t("Cash in Hand", "नकद"), fmt(ca.cashInHand), { indent: true }));
        for (const b of (ca.bankBalances || [])) rows.push(row(b.name, fmt(b.balance), { indent: true }));
        rows.push(row(t("Receivables from Buyers", "खरीदारों से प्राप्य"), fmt(ca.buyerReceivables), { indent: true }));
        rows.push(row(t("Receivables from Farmers", "किसानों से प्राप्य"), fmt(ca.farmerReceivables), { indent: true }));
        rows.push(row(t("Total Current Assets", "कुल चालू संपत्ति"), fmt(ca.total), { bold: true }));
        rows.push(row(t("TOTAL ASSETS", "कुल संपत्ति"), fmt(a.totalAssets), { bold: true }));
        rows.push(row(t("LIABILITIES & EQUITY", "देयताएं और इक्विटी"), "", { section: true }));
        rows.push(row(t("Long-term Liabilities", "दीर्घकालिक देयताएं"), "", { bold: true }));
        if ((lt.details || []).length > 0) for (const d2 of lt.details) rows.push(row(d2.name, fmt(d2.remaining), { indent: true }));
        else rows.push(row(t("None", "कोई नहीं"), "-", { indent: true }));
        rows.push(row(t("Total Long-term", "कुल दीर्घकालिक"), fmt(lt.total), { bold: true }));
        rows.push(row(t("Short-term Liabilities", "अल्पकालिक देयताएं"), "", { bold: true }));
        if ((st.details || []).length > 0) for (const d2 of st.details) rows.push(row(d2.name, fmt(d2.remaining), { indent: true }));
        else rows.push(row(t("None", "कोई नहीं"), "-", { indent: true }));
        rows.push(row(t("Total Short-term", "कुल अल्पकालिक"), fmt(st.total), { bold: true }));
        rows.push(row(t("Current Liabilities", "चालू देयताएं"), "", { bold: true }));
        rows.push(row(t("Payables to Farmers", "किसानों को देय"), fmt(cl.farmerPayables), { indent: true }));
        if ((cl.limitAccountLiabilities || 0) > 0) {
          for (const la of (cl.limitAccountDetails || [])) rows.push(row(`${la.name} (${t("Overdraft", "ओवरड्राफ्ट")})`, fmt(la.balance), { indent: true }));
        }
        rows.push(row(t("Total Liabilities", "कुल देयताएं"), fmt(l.totalLiabilities), { bold: true }));
        rows.push(row(t("Owner's Equity", "मालिक की इक्विटी"), fmt(d.ownersEquity), { bold: true }));
        rows.push(row(t("TOTAL LIABILITIES + EQUITY", "कुल देयताएं + इक्विटी"), fmt((l.totalLiabilities || 0) + (d.ownersEquity || 0)), { bold: true }));
        if (d.balanceCheck) rows.push(`<tr><td colspan="2" style="padding:8px 10px;color:#16a34a;font-size:12px;">✓ ${t("Balanced", "संतुलित")}</td></tr>`);
        tableHTML = `<table>${rows.join("")}</table>`;
      } else if (activeSubTab === "profit-loss") {
        const res = await fetch(`/api/books/profit-loss?fy=${financialYear}`, { credentials: "include" });
        const d = await res.json();
        const rows: string[] = [];
        rows.push(row(t("REVENUE", "राजस्व"), "", { section: true }));
        for (const [key, val] of Object.entries(d.revenue.byType || {})) {
          const lbl = REV_LABELS[key] || [key, key];
          rows.push(row(t(lbl[0], lbl[1]), fmt(val as number), { indent: true }));
        }
        rows.push(row(t("Total Revenue", "कुल राजस्व"), fmt(d.revenue.total), { bold: true }));
        rows.push(row(t("EXPENSES", "व्यय"), "", { section: true }));
        for (const [key, val] of Object.entries(d.expenses.byType || {})) {
          const lbl = EXP_LABELS[key] || [key, key];
          rows.push(row(t(lbl[0], lbl[1]), fmt(val as number), { indent: true }));
        }
        rows.push(row(t("Total Expenses", "कुल व्यय"), fmt(d.expenses.total), { bold: true }));
        const plLabel = d.netProfitLoss >= 0 ? t("NET PROFIT", "शुद्ध लाभ") : t("NET LOSS", "शुद्ध हानि");
        rows.push(row(plLabel, fmt(d.netProfitLoss), { bold: true }));
        tableHTML = `<table>${rows.join("")}</table>`;
      } else if (activeSubTab === "assets") {
        const res = await fetch("/api/assets", { credentials: "include" });
        const assets = await res.json();
        if (assets.length === 0) {
          tableHTML = `<p style="text-align:center;color:#888;padding:20px;">${t("No assets recorded", "कोई संपत्ति दर्ज नहीं")}</p>`;
        } else {
          const hdr = `<tr style="background:#f0f0f0;font-weight:700;"><td style="padding:8px 10px;">${t("Name", "नाम")}</td><td style="padding:8px 10px;">${t("Category", "श्रेणी")}</td><td style="padding:8px 10px;text-align:right;">${t("Purchase Cost", "खरीद लागत")}</td><td style="padding:8px 10px;text-align:right;">${t("Depreciation", "मूल्यह्रास")}</td><td style="padding:8px 10px;text-align:right;">${t("Book Value", "पुस्तक मूल्य")}</td></tr>`;
          const dataRows = assets.map((a: any) => {
            const catLbl = ASSET_CAT[a.category] || ["Other", "अन्य"];
            const cost = parseFloat(a.purchaseCost);
            const dep = a.totalDepreciation || 0;
            const bv = a.currentBookValue ?? (cost - dep);
            return `<tr><td style="padding:6px 10px;">${a.name}</td><td style="padding:6px 10px;">${t(catLbl[0], catLbl[1])}</td><td style="padding:6px 10px;text-align:right;">${fmt(cost)}</td><td style="padding:6px 10px;text-align:right;">${fmt(dep)}</td><td style="padding:6px 10px;text-align:right;">${fmt(bv)}</td></tr>`;
          }).join("");
          tableHTML = `<table>${hdr}${dataRows}</table>`;
        }
      } else if (activeSubTab === "liabilities") {
        const res = await fetch("/api/liabilities", { credentials: "include" });
        const liabilities = await res.json();
        if (liabilities.length === 0) {
          tableHTML = `<p style="text-align:center;color:#888;padding:20px;">${t("No liabilities recorded", "कोई देयता दर्ज नहीं")}</p>`;
        } else {
          const hdr = `<tr style="background:#f0f0f0;font-weight:700;"><td style="padding:8px 10px;">${t("Name", "नाम")}</td><td style="padding:8px 10px;">${t("Lender", "ऋणदाता")}</td><td style="padding:8px 10px;text-align:right;">${t("Principal", "मूलधन")}</td><td style="padding:8px 10px;text-align:right;">${t("Paid", "भुगतान")}</td><td style="padding:8px 10px;text-align:right;">${t("Remaining", "शेष")}</td></tr>`;
          const dataRows = liabilities.map((l: any) => {
            const principal = parseFloat(l.principalAmount);
            const paid = l.totalPaid || 0;
            const remaining = l.remainingBalance ?? (principal - paid);
            return `<tr><td style="padding:6px 10px;">${l.name}</td><td style="padding:6px 10px;">${l.lenderName || "-"}</td><td style="padding:6px 10px;text-align:right;">${fmt(principal)}</td><td style="padding:6px 10px;text-align:right;">${fmt(paid)}</td><td style="padding:6px 10px;text-align:right;">${fmt(remaining)}</td></tr>`;
          }).join("");
          tableHTML = `<table>${hdr}${dataRows}</table>`;
        }
      }
    } catch {
      tableHTML = `<p style="color:red;text-align:center;">${t("Failed to load data for printing", "प्रिंटिंग के लिए डेटा लोड करने में विफल")}</p>`;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title} - ${financialYear}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1a1a1a; }
          .print-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 14px; }
          .print-header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
          .print-header h2 { font-size: 16px; font-weight: 600; color: #444; margin-bottom: 2px; }
          .print-header p { font-size: 12px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          td { padding: 6px 10px; border-bottom: 1px solid #e5e5e5; font-size: 13px; vertical-align: top; }
          @media print { body { padding: 0; } }
          @page { margin: 15mm; }
        </style>
      </head>
      <body>
        <div class="print-header">
          <h1>${merchantName}</h1>
          <h2>${title}</h2>
          <p>${t("Financial Year", "वित्तीय वर्ष")}: ${financialYear}</p>
        </div>
        ${tableHTML}
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

      <div>
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
