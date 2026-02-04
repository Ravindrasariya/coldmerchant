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
  Printer,
  Pencil,
  History,
  ChevronDown,
  ChevronUp,
  X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { type Farmer, type FarmerEditHistory } from "@shared/schema";

interface FarmerWithDues extends Farmer {
  harvestDue: number;
  seedDue: number;
  netDue: number;
  coldDue: number;
  receivables: number;
}

type SortOption = 'farmerId' | 'harvestDue' | 'seedDue' | 'coldDue' | 'pyReceivable' | 'netDue';
type SortDirection = 'asc' | 'desc';

export function FarmerLedgerTab() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [farmerNameSearch, setFarmerNameSearch] = useState("");
  const [villageSearch, setVillageSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('farmerId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedYear, setSelectedYear] = useState<string>("all");
  
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [showVillageSuggestions, setShowVillageSuggestions] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const villageInputRef = useRef<HTMLInputElement>(null);
  const nameSuggestionsRef = useRef<HTMLDivElement>(null);
  const villageSuggestionsRef = useRef<HTMLDivElement>(null);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFarmer, setEditingFarmer] = useState<FarmerWithDues | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    contact: "",
    village: "",
    tehsil: "",
    district: "",
    state: "",
  });
  
  // Edit history in dialog state
  const [showDialogEditHistory, setShowDialogEditHistory] = useState(false);
  
  // Merge state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergingFarmer, setMergingFarmer] = useState<{ id: number; farmerCode: string; name: string } | null>(null);
  
  const { toast } = useToast();

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

  // Edit history query for individual farmer (in dialog)
  interface EditHistoryItem {
    id: number;
    serialNumber: number;
    merchantId: number;
    farmerId: number;
    changedAt: string | null;
    changedBy: number | null;
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
    userName?: string;
  }
  const { data: farmerEditHistory = [] } = useQuery<EditHistoryItem[]>({
    queryKey: ["/api/farmers", editingFarmer?.id, "edit-history"],
    enabled: !!user && !!editingFarmer?.id,
  });

  // Update farmer details with propagation mutation
  // Using raw fetch instead of apiRequest to handle 409 merge conflicts before throwIfResNotOk intercepts them
  const updateDetailsMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; contact: string; village: string; tehsil: string; district: string; state: string } }) => {
      const response = await fetch(`/api/farmers/${id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const responseData = await response.json();
      if (!response.ok) {
        // Return full response data with status for proper error handling
        throw { status: response.status, data: responseData };
      }
      return responseData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-farmers"] });
      setEditDialogOpen(false);
      setEditingFarmer(null);
      toast({
        title: t("Farmer Updated", "किसान अपडेट किया गया"),
        description: data.message,
        variant: "success",
      });
    },
    onError: (error: any) => {
      // Check for merge conflict (409 status with requiresMerge flag)
      const errorData = error.data || error;
      if (error.status === 409 && errorData.requiresMerge && errorData.existingFarmer) {
        // Close edit dialog and show merge confirmation
        setEditDialogOpen(false);
        setMergingFarmer({
          id: errorData.existingFarmer.id,
          farmerCode: errorData.existingFarmer.farmerCode,
          name: errorData.existingFarmer.name,
        });
        setMergeDialogOpen(true);
      } else {
        toast({
          title: t("Error", "त्रुटि"),
          description: errorData.message || t("Failed to update farmer", "किसान अपडेट करने में विफल"),
          variant: "destructive",
        });
      }
    },
  });

  // Merge farmers mutation
  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: number; targetId: number }) => {
      const response = await apiRequest("POST", "/api/farmers/merge", { sourceId, targetId });
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-farmers"] });
      setMergeDialogOpen(false);
      setMergingFarmer(null);
      setEditingFarmer(null);
      toast({
        title: t("Farmers Merged", "किसान मर्ज किए गए"),
        description: data.message,
        variant: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message || t("Failed to merge farmers", "किसानों को मर्ज करने में विफल"),
        variant: "destructive",
      });
    },
  });

  const handleConfirmMerge = () => {
    if (!editingFarmer || !mergingFarmer) return;
    mergeMutation.mutate({
      sourceId: editingFarmer.id,
      targetId: mergingFarmer.id,
    });
  };

  const handleEditFarmer = (farmer: FarmerWithDues) => {
    setEditingFarmer(farmer);
    setEditForm({
      name: farmer.name || "",
      contact: farmer.contact || "",
      village: farmer.village || "",
      tehsil: farmer.tehsil || "",
      district: farmer.district || "",
      state: farmer.state || "",
    });
    setShowDialogEditHistory(false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingFarmer) return;
    
    // Validate all required fields
    const missingFields: string[] = [];
    if (!editForm.name.trim()) missingFields.push(t("Name", "नाम"));
    if (!editForm.contact.trim()) missingFields.push(t("Contact", "संपर्क"));
    if (!editForm.village.trim()) missingFields.push(t("Village", "गांव"));
    if (!editForm.tehsil.trim()) missingFields.push(t("Tehsil", "तहसील"));
    if (!editForm.district.trim()) missingFields.push(t("District", "जिला"));
    if (!editForm.state.trim()) missingFields.push(t("State", "राज्य"));
    
    if (missingFields.length > 0) {
      toast({
        title: t("Required Fields Missing", "आवश्यक फ़ील्ड गायब हैं"),
        description: `${t("Please fill:", "कृपया भरें:")} ${missingFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    updateDetailsMutation.mutate({ id: editingFarmer.id, data: editForm });
  };

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

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: string[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push(y.toString());
    }
    return years;
  }, []);

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
    
    if (selectedYear !== "all") {
      result = result.filter(f => {
        if (!f.farmerCode) return false;
        const yearMatch = f.farmerCode.match(/FM(\d{4})/);
        return yearMatch && yearMatch[1] === selectedYear;
      });
    }
    
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
  }, [farmers, farmerNameSearch, villageSearch, showArchived, selectedYear]);

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
        case 'pyReceivable':
          const aPyReceivable = parseFloat(a.pyReceivable || "0") + (a.receivables || 0);
          const bPyReceivable = parseFloat(b.pyReceivable || "0") + (b.receivables || 0);
          comparison = aPyReceivable - bPyReceivable;
          break;
        case 'netDue':
          comparison = a.netDue - b.netDue;
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
      totalPyReceivable: displayedFarmers.reduce((sum, f) => sum + parseFloat(f.pyReceivable || "0") + (f.receivables || 0), 0),
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
          .text-orange { color: #ea580c; }
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
            <div class="summary-label">Total PY Receivable</div>
            <div class="summary-value">${formatCurrency(summary.totalPyReceivable)}</div>
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
                <td class="text-right">${formatCurrency(parseFloat(f.pyReceivable || "0") + (f.receivables || 0))}</td>
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
        <td className="p-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleEditFarmer(farmer)}
            title={t("Edit Farmer", "किसान संपादित करें")}
            data-testid={`button-edit-farmer-${farmer.id}`}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </td>
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
          {formatCurrency(parseFloat(farmer.pyReceivable || "0") + (farmer.receivables || 0))}
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

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("Farmers", "किसान")}</div>
          <div className="text-xl font-bold mt-1" data-testid="summary-farmer-count">{summary.count}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("PY Receivable", "पिछले वर्ष प्राप्य")}</div>
          <div className="text-xl font-bold mt-1" data-testid="summary-py-receivable">{formatCurrency(summary.totalPyReceivable)}</div>
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
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="h-5 w-5 text-muted-foreground" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              data-testid="select-year-filter"
            >
              <option value="all">{t("All Years", "सभी वर्ष")}</option>
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
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
            {(farmerNameSearch.trim() || villageSearch.trim() || selectedYear !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFarmerNameSearch("");
                  setVillageSearch("");
                  setSelectedYear("all");
                }}
                className="text-muted-foreground"
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4 mr-1" />
                {t("Clear Filters", "फ़िल्टर हटाएं")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
                    <th className="p-1.5 text-left text-xs font-medium w-8"></th>
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
                    <th className="p-2 text-right text-xs font-medium">
                      <button
                        type="button"
                        className="flex items-center justify-end w-full hover-elevate px-1 py-0.5 rounded"
                        onClick={() => handleSort('pyReceivable')}
                        data-testid="sort-py-receivable"
                      >
                        {t("PY Receivable", "पिछले वर्ष प्राप्य")}
                        {getSortIcon('pyReceivable')}
                      </button>
                    </th>
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
                    <th className="p-2 text-right text-xs font-medium">
                      <button
                        type="button"
                        className="flex items-center justify-end w-full hover-elevate px-1 py-0.5 rounded"
                        onClick={() => handleSort('netDue')}
                        data-testid="sort-net-due"
                      >
                        {t("Net Due", "शुद्ध बकाया")}
                        {getSortIcon('netDue')}
                      </button>
                    </th>
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

      {/* Edit Farmer Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("Edit Farmer Details", "किसान विवरण संपादित करें")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="text-xs text-muted-foreground mb-2">
              {t("Farmer ID", "किसान आईडी")}: <span className="font-mono font-medium">{editingFarmer?.farmerCode}</span>
              <span className="ml-2 text-[10px]">({t("Cannot be changed", "बदला नहीं जा सकता")})</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t("Name", "नाम")} <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t("Farmer name", "किसान का नाम")}
                  data-testid="input-edit-farmer-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-contact">{t("Contact", "संपर्क")} <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-contact"
                  value={editForm.contact}
                  onChange={(e) => setEditForm(f => ({ ...f, contact: e.target.value }))}
                  placeholder={t("Phone number", "फोन नंबर")}
                  data-testid="input-edit-farmer-contact"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-village">{t("Village", "गांव")} <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-village"
                  value={editForm.village}
                  onChange={(e) => setEditForm(f => ({ ...f, village: e.target.value }))}
                  placeholder={t("Village name", "गांव का नाम")}
                  data-testid="input-edit-farmer-village"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tehsil">{t("Tehsil", "तहसील")} <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-tehsil"
                  value={editForm.tehsil}
                  onChange={(e) => setEditForm(f => ({ ...f, tehsil: e.target.value }))}
                  placeholder={t("Tehsil name", "तहसील का नाम")}
                  data-testid="input-edit-farmer-tehsil"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-district">{t("District", "जिला")} <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-district"
                  value={editForm.district}
                  onChange={(e) => setEditForm(f => ({ ...f, district: e.target.value }))}
                  placeholder={t("District name", "जिले का नाम")}
                  data-testid="input-edit-farmer-district"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-state">{t("State", "राज्य")} <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-state"
                  value={editForm.state}
                  onChange={(e) => setEditForm(f => ({ ...f, state: e.target.value }))}
                  placeholder={t("State name", "राज्य का नाम")}
                  data-testid="input-edit-farmer-state"
                />
              </div>
            </div>

            {/* Edit History Section */}
            {farmerEditHistory.length > 0 && (
              <div className="border rounded-md">
                <button
                  type="button"
                  className="flex items-center justify-between w-full p-2 hover-elevate rounded-t-md"
                  onClick={() => setShowDialogEditHistory(!showDialogEditHistory)}
                  data-testid="button-toggle-dialog-edit-history"
                >
                  <div className="flex items-center gap-2">
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{t("Edit History", "संपादन इतिहास")}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5">{farmerEditHistory.length}</Badge>
                  </div>
                  {showDialogEditHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showDialogEditHistory && (
                  <div className="border-t max-h-40 overflow-y-auto">
                    {farmerEditHistory.map((entry) => (
                      <div 
                        key={entry.id} 
                        className={`p-2 border-b last:border-b-0 text-xs ${entry.fieldName === 'merge' ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                        data-testid={`row-farmer-edit-history-${entry.id}`}
                      >
                        {entry.fieldName === 'merge' ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
                              <Badge variant="outline" className="text-[10px] px-1 border-blue-400 text-blue-600 dark:text-blue-400">
                                {t("Merge", "मर्ज")}
                              </Badge>
                              <span>{entry.oldValue}</span>
                            </div>
                            <div className="text-muted-foreground">{entry.newValue}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {entry.changedAt ? new Date(entry.changedAt).toLocaleString('en-IN', { 
                                day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
                              }) : '-'}
                              {entry.userName && <span className="ml-2">{t("by", "द्वारा")} {entry.userName}</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium capitalize">{entry.fieldName}:</span>
                              <span className="text-muted-foreground line-through">{entry.oldValue || '-'}</span>
                              <span className="mx-1">→</span>
                              <span className="font-medium">{entry.newValue || '-'}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {entry.changedAt ? new Date(entry.changedAt).toLocaleString('en-IN', { 
                                day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
                              }) : '-'}
                              {entry.userName && <span className="ml-2">{t("by", "द्वारा")} {entry.userName}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              {t("Note: Changes will be propagated to all linked stock entries, seed transactions, and receivables.", 
                 "नोट: परिवर्तन सभी संबंधित स्टॉक एंट्री, बीज लेनदेन और प्राप्य में प्रचारित किए जाएंगे।")}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button 
              onClick={handleSaveEdit} 
              disabled={updateDetailsMutation.isPending}
              data-testid="button-save-farmer-edit"
            >
              {updateDetailsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("Save Changes", "परिवर्तन सहेजें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Confirmation Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{t("Merge Farmers", "किसान मर्ज करें")}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm mb-4">
              {t("A farmer with these details already exists:", "इन विवरणों के साथ एक किसान पहले से मौजूद है:")}
            </p>
            <div className="bg-muted/50 p-3 rounded mb-4">
              <div className="text-sm font-medium">{mergingFarmer?.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{mergingFarmer?.farmerCode}</div>
            </div>
            <p className="text-sm mb-2">
              {t("If you merge:", "यदि आप मर्ज करते हैं:")}
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
              <li>{t("The farmer with the lower ID will be kept", "कम आईडी वाला किसान रखा जाएगा")}</li>
              <li>{t("All linked stock entries and seed transactions will be transferred", "सभी संबंधित स्टॉक एंट्री और बीज लेनदेन स्थानांतरित किए जाएंगे")}</li>
              <li>{t("PY balances will be combined", "पिछले वर्ष की शेष राशि संयोजित की जाएगी")}</li>
              <li>{t("The other farmer record will be deleted", "दूसरा किसान रिकॉर्ड हटा दिया जाएगा")}</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMergeDialogOpen(false); setMergingFarmer(null); }}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button 
              onClick={handleConfirmMerge} 
              disabled={mergeMutation.isPending}
              data-testid="button-confirm-merge"
            >
              {mergeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("Confirm Merge", "मर्ज की पुष्टि करें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
