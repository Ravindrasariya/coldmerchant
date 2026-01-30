import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft,
  RefreshCw,
  Loader2,
  Users,
  Archive,
  Flag
} from "lucide-react";
import { type Farmer } from "@shared/schema";

interface FarmerWithDues extends Farmer {
  harvestDue: number;
  seedDue: number;
  netDue: number;
}

interface PyEditState {
  [farmerId: number]: {
    pyPayable?: string;
    pyReceivable?: string;
  };
}

export default function FarmersPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [pyEdits, setPyEdits] = useState<PyEditState>({});

  const { data: farmers = [], isLoading } = useQuery<FarmerWithDues[]>({
    queryKey: ["/api/farmers"],
    enabled: !!user,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/farmers/sync", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Farmer> }) => {
      const response = await apiRequest("PATCH", `/api/farmers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
    },
  });

  const handleToggleNegativeFlag = (id: number, currentValue: boolean) => {
    updateMutation.mutate({ id, data: { negativeFlag: !currentValue } });
  };

  const handleToggleArchive = (id: number, currentValue: boolean) => {
    updateMutation.mutate({ id, data: { isArchived: !currentValue } });
  };

  const handlePyFieldChange = (farmerId: number, field: 'pyPayable' | 'pyReceivable', value: string) => {
    setPyEdits(prev => ({
      ...prev,
      [farmerId]: {
        ...prev[farmerId],
        [field]: value,
      }
    }));
  };

  const handlePyFieldBlur = (farmerId: number, field: 'pyPayable' | 'pyReceivable', originalValue: string) => {
    const editedValue = pyEdits[farmerId]?.[field];
    if (editedValue !== undefined && editedValue !== originalValue) {
      const numericValue = parseFloat(editedValue) || 0;
      updateMutation.mutate({ id: farmerId, data: { [field]: numericValue.toString() } });
    }
    setPyEdits(prev => {
      const newState = { ...prev };
      if (newState[farmerId]) {
        delete newState[farmerId][field];
        if (Object.keys(newState[farmerId]).length === 0) {
          delete newState[farmerId];
        }
      }
      return newState;
    });
  };

  const getPyValue = (farmerId: number, field: 'pyPayable' | 'pyReceivable', originalValue: string | null) => {
    return pyEdits[farmerId]?.[field] ?? (originalValue || "0");
  };

  const filteredFarmers = useMemo(() => {
    let result = farmers;
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(f => 
        f.name.toLowerCase().includes(term) ||
        f.farmerCode?.toLowerCase().includes(term) ||
        f.contact?.toLowerCase().includes(term) ||
        f.village?.toLowerCase().includes(term)
      );
    }

    if (!showArchived) {
      result = result.filter(f => !f.isArchived);
    }

    return result;
  }, [farmers, searchTerm, showArchived]);

  const activeFarmers = filteredFarmers.filter(f => !f.isArchived);
  const archivedFarmers = filteredFarmers.filter(f => f.isArchived);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const renderFarmerRow = (farmer: FarmerWithDues, isArchived: boolean) => {
    return (
      <tr key={farmer.id} className={`border-b hover-elevate ${isArchived ? 'opacity-60' : ''}`} data-testid={`row-farmer-${farmer.id}`}>
        <td className="p-3 font-mono text-sm" data-testid={`text-farmer-code-${farmer.id}`}>{farmer.farmerCode}</td>
        <td className="p-3" data-testid={`text-farmer-name-${farmer.id}`}>
          <div className="flex items-center gap-2">
            <span className="font-medium">{farmer.name}</span>
            {farmer.negativeFlag && (
              <Badge variant="destructive" className="text-xs">
                <Flag className="h-3 w-3 mr-1" />
                {t("Flagged", "चिह्नित")}
              </Badge>
            )}
          </div>
        </td>
        <td className="p-3 text-muted-foreground" data-testid={`text-farmer-village-${farmer.id}`}>{farmer.village || "-"}</td>
        <td className="p-3 text-muted-foreground" data-testid={`text-farmer-contact-${farmer.id}`}>{farmer.contact || "-"}</td>
        <td className="p-3 text-right">
          <Input
            type="number"
            value={getPyValue(farmer.id, 'pyReceivable', farmer.pyReceivable)}
            onChange={(e) => handlePyFieldChange(farmer.id, 'pyReceivable', e.target.value)}
            onBlur={() => handlePyFieldBlur(farmer.id, 'pyReceivable', farmer.pyReceivable || "0")}
            className="w-28 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="0"
            disabled={isArchived}
            data-testid={`input-py-receivable-${farmer.id}`}
          />
        </td>
        <td className="p-3 text-right font-medium text-green-600 dark:text-green-400" data-testid={`text-harvest-due-${farmer.id}`}>
          {formatCurrency(farmer.harvestDue)}
        </td>
        <td className="p-3 text-right">
          <Input
            type="number"
            value={getPyValue(farmer.id, 'pyPayable', farmer.pyPayable)}
            onChange={(e) => handlePyFieldChange(farmer.id, 'pyPayable', e.target.value)}
            onBlur={() => handlePyFieldBlur(farmer.id, 'pyPayable', farmer.pyPayable || "0")}
            className="w-28 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="0"
            disabled={isArchived}
            data-testid={`input-py-payable-${farmer.id}`}
          />
        </td>
        <td className="p-3 text-right font-medium text-red-600 dark:text-red-400" data-testid={`text-seed-due-${farmer.id}`}>
          {formatCurrency(farmer.seedDue)}
        </td>
        <td className="p-3 text-right" data-testid={`text-net-due-${farmer.id}`}>
          <span className={`font-bold ${farmer.netDue >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(farmer.netDue)}
          </span>
        </td>
        <td className="p-3">
          <div className="flex items-center gap-2 justify-end">
            <Switch
              checked={farmer.negativeFlag ?? false}
              onCheckedChange={() => handleToggleNegativeFlag(farmer.id, farmer.negativeFlag ?? false)}
              disabled={isArchived}
              data-testid={`switch-negative-${farmer.id}`}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleToggleArchive(farmer.id, farmer.isArchived ?? false)}
              title={isArchived ? t("Unarchive", "पुनर्स्थापित करें") : t("Archive", "संग्रहित करें")}
              data-testid={`button-archive-${farmer.id}`}
            >
              <Archive className={`h-4 w-4 ${isArchived ? 'text-muted-foreground' : 'text-destructive'}`} />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setLocation("/")}
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">{t("Farmer Ledger", "किसान खाता")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("Farmer Ledger", "किसान खाता")}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder={t("Search farmers...", "किसान खोजें...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
                data-testid="input-search-farmers"
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                  data-testid="switch-show-archived"
                />
                <span className="text-sm text-muted-foreground">
                  {t("Show Archived", "संग्रहित दिखाएं")}
                </span>
              </div>
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                variant="outline"
                data-testid="button-sync-farmers"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t("Sync Farmers", "किसान सिंक करें")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : farmers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("No farmers found", "कोई किसान नहीं मिला")}</p>
                <p className="text-sm mt-2">
                  {t(
                    "Click 'Sync Farmers' to import farmers from stock entries and seed transactions",
                    "स्टॉक एंट्री और बीज लेनदेन से किसानों को आयात करने के लिए 'किसान सिंक करें' पर क्लिक करें"
                  )}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left text-sm font-medium">{t("Farmer ID", "किसान आईडी")}</th>
                      <th className="p-3 text-left text-sm font-medium">{t("Name", "नाम")}</th>
                      <th className="p-3 text-left text-sm font-medium">{t("Village", "गांव")}</th>
                      <th className="p-3 text-left text-sm font-medium">{t("Contact", "संपर्क")}</th>
                      <th className="p-3 text-right text-sm font-medium">{t("PY Receivable", "पिछले वर्ष प्राप्य")}</th>
                      <th className="p-3 text-right text-sm font-medium text-green-600 dark:text-green-400">{t("Harvest Due", "फसल बकाया")}</th>
                      <th className="p-3 text-right text-sm font-medium">{t("PY Payable", "पिछले वर्ष देय")}</th>
                      <th className="p-3 text-right text-sm font-medium text-red-600 dark:text-red-400">{t("Seed Due", "बीज बकाया")}</th>
                      <th className="p-3 text-right text-sm font-medium">{t("Net Due", "शुद्ध बकाया")}</th>
                      <th className="p-3 text-right text-sm font-medium">{t("Actions", "कार्य")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeFarmers.map(farmer => renderFarmerRow(farmer, false))}
                  </tbody>
                </table>

                {showArchived && archivedFarmers.length > 0 && (
                  <>
                    <div className="my-6 border-t pt-4">
                      <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                        <Archive className="h-4 w-4" />
                        {t("Archived Farmers", "संग्रहित किसान")} ({archivedFarmers.length})
                      </h3>
                    </div>
                    <table className="w-full">
                      <tbody>
                        {archivedFarmers.map(farmer => renderFarmerRow(farmer, true))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
