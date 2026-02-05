import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PackagePlus, ClipboardList, Truck, Download } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { SeedStockEntryForm } from "@/components/seed-stock-entry/seed-stock-entry-form";
import { SeedStockRegisterCard } from "@/components/seed-stock-register/seed-stock-register-card";
import { SeedTransactionsContent } from "@/components/transactions/seed-transactions-content";

interface SeedSectionProps {
  seedDownloadDialogOpen: boolean;
  setSeedDownloadDialogOpen: (open: boolean) => void;
}

export function SeedSection({ seedDownloadDialogOpen, setSeedDownloadDialogOpen }: SeedSectionProps) {
  const { t } = useLanguage();
  const [activeSeedTab, setActiveSeedTab] = useState("seed-stock-entry");
  const [seedTxnDownloadDialogOpen, setSeedTxnDownloadDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-green-700 dark:text-green-500">
            {t("Seed Management", "बीज प्रबंधन")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Manage your seed stock entries, register, and transactions", "अपने बीज स्टॉक एंट्री, रजिस्टर और लेनदेन प्रबंधित करें")}
          </p>
        </div>
      </div>

      <Tabs value={activeSeedTab} onValueChange={setActiveSeedTab} className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <TabsList className="bg-green-50 dark:bg-green-900/20">
            <TabsTrigger 
              value="seed-stock-entry" 
              className="text-xs md:text-sm px-2 md:px-3 data-[state=active]:bg-green-600 data-[state=active]:text-white"
              data-testid="tab-seed-stock-entry"
            >
              <PackagePlus className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1 md:mr-1.5" />
              {t("Stock Entry", "स्टॉक एंट्री")}
            </TabsTrigger>
            <TabsTrigger 
              value="seed-stock-register" 
              className="text-xs md:text-sm px-2 md:px-3 data-[state=active]:bg-green-600 data-[state=active]:text-white"
              data-testid="tab-seed-stock-register"
            >
              <ClipboardList className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1 md:mr-1.5" />
              {t("Stock Register", "स्टॉक रजिस्टर")}
            </TabsTrigger>
            <TabsTrigger 
              value="seed-transactions" 
              className="text-xs md:text-sm px-2 md:px-3 data-[state=active]:bg-green-600 data-[state=active]:text-white"
              data-testid="tab-seed-transactions"
            >
              <Truck className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1 md:mr-1.5" />
              {t("Transactions", "लेनदेन")}
            </TabsTrigger>
          </TabsList>

          {/* Mobile only: Download button in tab header - Stock Register has its own in filter row on desktop */}
          {activeSeedTab === "seed-stock-register" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSeedDownloadDialogOpen(true)}
              title={t("Download CSV", "CSV डाउनलोड")}
              data-testid="button-seed-download-header"
              className="md:hidden"
            >
              <Download className="h-5 w-5" />
            </Button>
          )}
          {/* Transactions: Download button shows on all screen sizes here, but will be moved to filter row on desktop */}
          {activeSeedTab === "seed-transactions" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSeedTxnDownloadDialogOpen(true)}
              title={t("Download CSV", "CSV डाउनलोड")}
              data-testid="button-seed-txn-download-header"
              className="md:hidden"
            >
              <Download className="h-5 w-5" />
            </Button>
          )}
        </div>

        <TabsContent value="seed-stock-entry" className="mt-0">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">{t("Seed Stock Entry", "बीज स्टॉक एंट्री")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("Record new seed purchases from suppliers", "आपूर्तिकर्ताओं से नई बीज खरीद दर्ज करें")}
              </p>
            </div>
            <SeedStockEntryForm onSuccess={() => setActiveSeedTab("seed-stock-register")} />
          </div>
        </TabsContent>

        <TabsContent value="seed-stock-register" className="mt-0">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">{t("Seed Stock Register", "बीज स्टॉक रजिस्टर")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("View and manage your seed stock", "अपने बीज स्टॉक को देखें और प्रबंधित करें")}
              </p>
            </div>
            <SeedStockRegisterCard 
              downloadDialogOpen={seedDownloadDialogOpen}
              onDownloadDialogClose={() => setSeedDownloadDialogOpen(false)}
            />
          </div>
        </TabsContent>

        <TabsContent value="seed-transactions" className="mt-0">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">{t("Seed Transactions", "बीज लेनदेन")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("View and manage seed sales transactions", "बीज बिक्री लेनदेन देखें और प्रबंधित करें")}
              </p>
            </div>
            <SeedTransactionsContent 
              downloadDialogOpen={seedTxnDownloadDialogOpen}
              onDownloadDialogClose={() => setSeedTxnDownloadDialogOpen(false)}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
