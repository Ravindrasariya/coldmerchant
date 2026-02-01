import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  RefreshCw,
  Loader2,
  Users,
  Archive,
  Flag,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Printer
} from "lucide-react";
import { type Farmer } from "@shared/schema";

interface FarmerWithDues extends Farmer {
  harvestDue: number;
  seedDue: number;
  netDue: number;
  coldDue: number;
}

type SortOption = 'farmerId' | 'harvestDue' | 'seedDue' | 'coldDue';
type SortDirection = 'asc' | 'desc';

export function FarmerLedgerTab() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [farmerNameSearch, setFarmerNameSearch] = useState("");
  const [villageSearch, setVillageSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('farmerId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [showVillageSuggestions, setShowVillageSuggestions] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const villageInputRef = useRef<HTMLInputElement>(null);
  const nameSuggestionsRef = useRef<HTMLDivElement>(null);
  const villageSuggestionsRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (nameSuggestionsRef.current && !nameSuggestionsRef.current.contains(event.target as Node) &&
          nameInputRef.current && !nameInputRef.current.contains(event.target as Node)) {
        setShowNameSuggestions(false);
      }
      if (villageSuggestionsRef.current && !villageSuggestionsRef.current.contains(event.target as Node) &&
          villageInputRef.current && !villageInputRef.current.contains(event.target as Node)) {
        setShowVillageSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleNegativeFlag = (id: number, currentValue: boolean) => {
    updateMutation.mutate({ id, data: { negativeFlag: !currentValue } });
  };

  const handleToggleArchive = (id: number, currentValue: boolean) => {
    updateMutation.mutate({ id, data: { isArchived: !currentValue } });
  };

  const handleSort = (column: SortOption) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection(column === 'farmerId' ? 'asc' : 'desc');
    }
  };

  const getSortIcon = (column: SortOption) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" /> 
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const uniqueFarmersByName = useMemo(() => {
    const seen = new Map<string, FarmerWithDues>();
    farmers.forEach(f => {
      if (f.name && !seen.has(f.name.toLowerCase())) {
        seen.set(f.name.toLowerCase(), f);
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [farmers]);

  const uniqueVillages = useMemo(() => {
    const villages = new Set<string>();
    farmers.forEach(f => {
      if (f.village) villages.add(f.village);
    });
    return Array.from(villages).sort();
  }, [farmers]);

  const filteredNameSuggestions = useMemo(() => {
    if (!farmerNameSearch.trim()) return uniqueFarmersByName.slice(0, 10);
    const term = farmerNameSearch.toLowerCase();
    return uniqueFarmersByName.filter(f => f.name.toLowerCase().includes(term)).slice(0, 10);
  }, [farmerNameSearch, uniqueFarmersByName]);

  const filteredVillageSuggestions = useMemo(() => {
    if (!villageSearch.trim()) return uniqueVillages.slice(0, 10);
    const term = villageSearch.toLowerCase();
    return uniqueVillages.filter(v => v.toLowerCase().includes(term)).slice(0, 10);
  }, [villageSearch, uniqueVillages]);

  const filteredFarmers = useMemo(() => {
    let result = farmers;
    
    if (farmerNameSearch.trim()) {
      const term = farmerNameSearch.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(term));
    }

    if (villageSearch.trim()) {
      const term = villageSearch.toLowerCase();
      result = result.filter(f => f.village?.toLowerCase().includes(term));
    }

    if (!showArchived) {
      result = result.filter(f => !f.isArchived);
    }

    return result;
  }, [farmers, farmerNameSearch, villageSearch, showArchived]);

  const sortedFarmers = useMemo(() => {
    const active = filteredFarmers.filter(f => !f.isArchived);
    const archived = filteredFarmers.filter(f => f.isArchived);

    const sortFn = (a: FarmerWithDues, b: FarmerWithDues) => {
      let comparison = 0;
      switch (sortBy) {
        case 'harvestDue':
          comparison = a.harvestDue - b.harvestDue;
          break;
        case 'seedDue':
          comparison = a.seedDue - b.seedDue;
          break;
        case 'coldDue':
          comparison = a.coldDue - b.coldDue;
          break;
        case 'farmerId':
        default:
          comparison = (a.farmerCode || '').localeCompare(b.farmerCode || '');
          break;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    };

    active.sort(sortFn);
    archived.sort(sortFn);

    return { active, archived };
  }, [filteredFarmers, sortBy, sortDirection]);

  const activeFarmers = sortedFarmers.active;
  const archivedFarmers = sortedFarmers.archived;

  const summary = useMemo(() => {
    const displayedFarmers = [...activeFarmers, ...(showArchived ? archivedFarmers : [])];
    return {
      totalHarvestDue: displayedFarmers.reduce((sum, f) => sum + f.harvestDue, 0),
      totalSeedDue: displayedFarmers.reduce((sum, f) => sum + f.seedDue, 0),
      totalColdDue: displayedFarmers.reduce((sum, f) => sum + f.coldDue, 0),
      totalNetDue: displayedFarmers.reduce((sum, f) => sum + f.netDue, 0),
      count: displayedFarmers.length,
    };
  }, [activeFarmers, archivedFarmers, showArchived]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handlePrint = () => {
    const displayedFarmers = [...activeFarmers, ...(showArchived ? archivedFarmers : [])];
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Farmer Ledger Report</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
          h1 { text-align: center; margin-bottom: 20px; }
          .summary { display: flex; justify-content: space-around; margin-bottom: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
          .summary-item { text-align: center; }
          .summary-label { font-size: 10px; color: #666; }
          .summary-value { font-size: 14px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
          th { background: #f0f0f0; font-weight: bold; }
          .text-right { text-align: right; }
          .text-green { color: #16a34a; }
          .text-red { color: #dc2626; }
          .text-blue { color: #2563eb; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <h1>Farmer Ledger Report</h1>
        <div class="summary">
          <div class="summary-item">
            <div class="summary-label">Total Farmers</div>
            <div class="summary-value">${summary.count}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Harvest Due</div>
            <div class="summary-value text-green">${formatCurrency(summary.totalHarvestDue)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Seed Due</div>
            <div class="summary-value text-red">${formatCurrency(summary.totalSeedDue)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Cold Due</div>
            <div class="summary-value text-blue">${formatCurrency(summary.totalColdDue)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Net Due</div>
            <div class="summary-value">${formatCurrency(summary.totalNetDue)}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Farmer ID</th>
              <th>Name</th>
              <th>Village</th>
              <th>Contact</th>
              <th class="text-right">PY Receivable</th>
              <th class="text-right">Harvest Due</th>
              <th class="text-right">Seed Due</th>
              <th class="text-right">Net Due</th>
              <th class="text-right">Cold Due</th>
            </tr>
          </thead>
          <tbody>
            ${displayedFarmers.map(f => `
              <tr>
                <td>${f.farmerCode || '-'}</td>
                <td>${f.name}${f.negativeFlag ? ' (Flagged)' : ''}</td>
                <td>${f.village || '-'}</td>
                <td>${f.contact || '-'}</td>
                <td class="text-right">${formatCurrency(parseFloat(f.pyReceivable || "0"))}</td>
                <td class="text-right text-green">${formatCurrency(f.harvestDue)}</td>
                <td class="text-right text-red">${formatCurrency(f.seedDue)}</td>
                <td class="text-right ${f.netDue >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(f.netDue)}</td>
                <td class="text-right text-blue">${formatCurrency(f.coldDue)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top: 20px; text-align: center; font-size: 10px; color: #666;">
          Generated on ${new Date().toLocaleString('en-IN')}
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const renderFarmerRow = (farmer: FarmerWithDues, isArchived: boolean) => {
    return (
      <tr key={farmer.id} className={`border-b hover-elevate ${isArchived ? 'opacity-60' : ''}`} data-testid={`row-farmer-${farmer.id}`}>
        <td className="p-2 font-mono text-xs" data-testid={`text-farmer-code-${farmer.id}`}>{farmer.farmerCode}</td>
        <td className="p-2 text-xs" data-testid={`text-farmer-name-${farmer.id}`}>
          <div className="flex items-center gap-1">
            <span className="font-medium">{farmer.name}</span>
            {farmer.negativeFlag && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0">
                <Flag className="h-2.5 w-2.5 mr-0.5" />
                {t("Flagged", "चिह्नित")}
              </Badge>
            )}
          </div>
        </td>
        <td className="p-2 text-xs text-muted-foreground" data-testid={`text-farmer-village-${farmer.id}`}>{farmer.village || "-"}</td>
        <td className="p-2 text-xs text-muted-foreground" data-testid={`text-farmer-contact-${farmer.id}`}>{farmer.contact || "-"}</td>
        <td className="p-2 text-right text-xs font-medium" data-testid={`text-py-receivable-${farmer.id}`}>
          {formatCurrency(parseFloat(farmer.pyReceivable || "0"))}
        </td>
        <td className="p-2 text-right text-xs font-medium text-green-600 dark:text-green-400" data-testid={`text-harvest-due-${farmer.id}`}>
          {formatCurrency(farmer.harvestDue)}
        </td>
        <td className="p-2 text-right text-xs font-medium text-red-600 dark:text-red-400" data-testid={`text-seed-due-${farmer.id}`}>
          {formatCurrency(farmer.seedDue)}
        </td>
        <td className="p-2 text-right text-xs" data-testid={`text-net-due-${farmer.id}`}>
          <span className={`font-bold ${farmer.netDue >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(farmer.netDue)}
          </span>
        </td>
        <td className="p-2 text-right text-xs font-medium text-blue-600 dark:text-blue-400" data-testid={`text-cold-due-${farmer.id}`}>
          {formatCurrency(farmer.coldDue)}
        </td>
        <td className="p-2">
          <div className="flex items-center gap-1 justify-end">
            <Switch
              checked={farmer.negativeFlag ?? false}
              onCheckedChange={() => handleToggleNegativeFlag(farmer.id, farmer.negativeFlag ?? false)}
              disabled={isArchived}
              data-testid={`switch-negative-${farmer.id}`}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleToggleArchive(farmer.id, farmer.isArchived ?? false)}
              title={isArchived ? t("Unarchive", "पुनर्स्थापित करें") : t("Archive", "संग्रहित करें")}
              data-testid={`button-archive-${farmer.id}`}
            >
              <Archive className={`h-3.5 w-3.5 ${isArchived ? 'text-muted-foreground' : 'text-destructive'}`} />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("Farmer Ledger", "किसान खाता")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Track farmer dues and payments", "किसान बकाया और भुगतान ट्रैक करें")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("Farmers", "किसान")}</div>
          <div className="text-xl font-bold mt-1" data-testid="summary-farmer-count">{summary.count}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("Harvest Due", "फसल बकाया")}</div>
          <div className="text-xl font-bold mt-1 text-green-600 dark:text-green-400" data-testid="summary-harvest-due">{formatCurrency(summary.totalHarvestDue)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("Seed Due", "बीज बकाया")}</div>
          <div className="text-xl font-bold mt-1 text-red-600 dark:text-red-400" data-testid="summary-seed-due">{formatCurrency(summary.totalSeedDue)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("Cold Due", "कोल्ड बकाया")}</div>
          <div className="text-xl font-bold mt-1 text-blue-600 dark:text-blue-400" data-testid="summary-cold-due">{formatCurrency(summary.totalColdDue)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("Net Due", "शुद्ध बकाया")}</div>
          <div className={`text-xl font-bold mt-1 ${summary.totalNetDue >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="summary-net-due">
            {formatCurrency(summary.totalNetDue)}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("Farmer Ledger", "किसान खाता")}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Input
                ref={nameInputRef}
                placeholder={t("Search by name...", "नाम से खोजें...")}
                value={farmerNameSearch}
                onChange={(e) => {
                  setFarmerNameSearch(e.target.value);
                  setShowNameSuggestions(true);
                }}
                onFocus={() => setShowNameSuggestions(true)}
                className="w-40"
                autoComplete="off"
                data-testid="input-search-farmer-name"
              />
              {showNameSuggestions && filteredNameSuggestions.length > 0 && (
                <div 
                  ref={nameSuggestionsRef}
                  className="absolute z-50 w-64 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto"
                >
                  {filteredNameSuggestions.map((farmer, idx) => (
                    <button
                      key={farmer.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover-elevate"
                      onClick={() => {
                        setFarmerNameSearch(farmer.name);
                        setShowNameSuggestions(false);
                      }}
                      data-testid={`suggestion-name-${idx}`}
                    >
                      <div className="font-medium">{farmer.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {farmer.contact || '-'} | {farmer.village || '-'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <Input
                ref={villageInputRef}
                placeholder={t("Search by village...", "गांव से खोजें...")}
                value={villageSearch}
                onChange={(e) => {
                  setVillageSearch(e.target.value);
                  setShowVillageSuggestions(true);
                }}
                onFocus={() => setShowVillageSuggestions(true)}
                className="w-40"
                autoComplete="off"
                data-testid="input-search-village"
              />
              {showVillageSuggestions && filteredVillageSuggestions.length > 0 && (
                <div 
                  ref={villageSuggestionsRef}
                  className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto"
                >
                  {filteredVillageSuggestions.map((village, idx) => (
                    <button
                      key={village}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover-elevate"
                      onClick={() => {
                        setVillageSearch(village);
                        setShowVillageSuggestions(false);
                      }}
                      data-testid={`suggestion-village-${idx}`}
                    >
                      {village}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              {t("Sync", "सिंक")}
            </Button>
            <Button
              onClick={handlePrint}
              variant="ghost"
              size="icon"
              title={t("Print", "प्रिंट")}
              data-testid="button-print-ledger"
            >
              <Printer className="h-4 w-4" />
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
                  "Click 'Sync' to import farmers from stock entries and seed transactions",
                  "स्टॉक एंट्री और बीज लेनदेन से किसानों को आयात करने के लिए 'सिंक' पर क्लिक करें"
                )}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left text-xs font-medium">
                      <button
                        type="button"
                        className="flex items-center hover-elevate px-1 py-0.5 rounded"
                        onClick={() => handleSort('farmerId')}
                        data-testid="sort-farmer-id"
                      >
                        {t("Farmer ID", "किसान आईडी")}
                        {getSortIcon('farmerId')}
                      </button>
                    </th>
                    <th className="p-2 text-left text-xs font-medium">{t("Name", "नाम")}</th>
                    <th className="p-2 text-left text-xs font-medium">{t("Village", "गांव")}</th>
                    <th className="p-2 text-left text-xs font-medium">{t("Contact", "संपर्क")}</th>
                    <th className="p-2 text-right text-xs font-medium">{t("PY Receivable", "पिछले वर्ष प्राप्य")}</th>
                    <th className="p-2 text-right text-xs font-medium">
                      <button
                        type="button"
                        className="flex items-center justify-end w-full hover-elevate px-1 py-0.5 rounded text-green-600 dark:text-green-400"
                        onClick={() => handleSort('harvestDue')}
                        data-testid="sort-harvest-due"
                      >
                        {t("Harvest Due", "फसल बकाया")}
                        {getSortIcon('harvestDue')}
                      </button>
                    </th>
                    <th className="p-2 text-right text-xs font-medium">
                      <button
                        type="button"
                        className="flex items-center justify-end w-full hover-elevate px-1 py-0.5 rounded text-red-600 dark:text-red-400"
                        onClick={() => handleSort('seedDue')}
                        data-testid="sort-seed-due"
                      >
                        {t("Seed Due", "बीज बकाया")}
                        {getSortIcon('seedDue')}
                      </button>
                    </th>
                    <th className="p-2 text-right text-xs font-medium">{t("Net Due", "शुद्ध बकाया")}</th>
                    <th className="p-2 text-right text-xs font-medium">
                      <button
                        type="button"
                        className="flex items-center justify-end w-full hover-elevate px-1 py-0.5 rounded text-blue-600 dark:text-blue-400"
                        onClick={() => handleSort('coldDue')}
                        data-testid="sort-cold-due"
                      >
                        {t("Cold Due", "कोल्ड बकाया")}
                        {getSortIcon('coldDue')}
                      </button>
                    </th>
                    <th className="p-2 text-right text-xs font-medium">{t("Actions", "कार्य")}</th>
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
    </div>
  );
}
