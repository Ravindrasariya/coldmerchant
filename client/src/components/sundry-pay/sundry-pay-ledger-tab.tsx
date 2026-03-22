import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, 
  Loader2,
  HandCoins,
  Pencil,
  History,
  ChevronDown,
  ChevronUp,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type SundryPayStakeholder, type SundryPayEditHistory } from "@shared/schema";

interface SundryPayWithDues extends SundryPayStakeholder {
  pyReceivableAmount: number;
  totalGiven: number;
  totalReceived: number;
  totalDue: number;
}

export default function SundryPayLedgerTab() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStakeholder, setEditingStakeholder] = useState<SundryPayWithDues | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "", contact: "", pyReceivable: "", redFlag: false });
  const [showHistory, setShowHistory] = useState(false);
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", contact: "", pyReceivable: "", redFlag: false });

  const [nameFilter, setNameFilter] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  
  const [sortColumn, setSortColumn] = useState<'sundryPayId' | 'totalDue' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: stakeholderList = [], isLoading } = useQuery<SundryPayWithDues[]>({
    queryKey: ["/api/sundry-pay", yearFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (yearFilter !== "all") params.set("year", yearFilter);
      const res = await fetch(`/api/sundry-pay?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: editHistory = [], isLoading: historyLoading } = useQuery<SundryPayEditHistory[]>({
    queryKey: ["/api/sundry-pay", editingStakeholder?.id, "history"],
    queryFn: async () => {
      if (!editingStakeholder?.id) return [];
      const res = await fetch(`/api/sundry-pay/${editingStakeholder.id}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!editingStakeholder?.id && showHistory,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof addForm) => {
      const response = await apiRequest("POST", "/api/sundry-pay", {
        name: data.name,
        address: data.address,
        contact: data.contact || null,
        pyReceivable: data.pyReceivable || "0",
        redFlag: data.redFlag,
        isActive: true,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sundry-pay"] });
      setAddDialogOpen(false);
      setAddForm({ name: "", address: "", contact: "", pyReceivable: "", redFlag: false });
      toast({ title: t("Stakeholder added successfully", "हितधारक सफलतापूर्वक जोड़ा गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to add stakeholder", "हितधारक जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & typeof editForm) => {
      const response = await fetch(`/api/sundry-pay/${id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          address: data.address,
          contact: data.contact || null,
          pyReceivable: data.pyReceivable || "0",
          redFlag: data.redFlag,
        }),
        credentials: "include",
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw { status: response.status, data: responseData };
      }
      return responseData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sundry-pay"] });
      setEditDialogOpen(false);
      setEditingStakeholder(null);
      setShowHistory(false);
      toast({ title: t("Stakeholder updated successfully", "हितधारक सफलतापूर्वक अपडेट किया गया"), description: data.message, variant: "success" });
    },
    onError: (error: any) => {
      const errorData = error.data || error;
      toast({ title: t("Failed to update stakeholder", "हितधारक अपडेट करने में विफल"), description: errorData.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/sundry-pay/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sundry-pay"] });
    },
  });

  const handleEditClick = (stakeholder: SundryPayWithDues) => {
    setEditingStakeholder(stakeholder);
    setEditForm({
      name: stakeholder.name,
      address: stakeholder.address || "",
      contact: stakeholder.contact || "",
      pyReceivable: stakeholder.pyReceivable || "0",
      redFlag: stakeholder.redFlag ?? false,
    });
    setShowHistory(false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingStakeholder) return;
    if (!editForm.name.trim() || !editForm.address.trim()) {
      toast({ title: t("Name and Address are required", "नाम और पता आवश्यक हैं"), variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editingStakeholder.id, ...editForm });
  };

  const handleAddStakeholder = () => {
    if (!addForm.name.trim() || !addForm.address.trim()) {
      toast({ title: t("Name and Address are required", "नाम और पता आवश्यक हैं"), variant: "destructive" });
      return;
    }
    createMutation.mutate(addForm);
  };

  const formatFieldName = (field: string) => {
    const fieldMap: Record<string, string> = {
      name: t("Name", "नाम"),
      address: t("Address", "पता"),
      contact: t("Contact", "संपर्क"),
      pyReceivable: t("PY Receivable", "पीवाय प्राप्य"),
      redFlag: t("Red Flag", "रेड फ्लैग"),
    };
    return fieldMap[field] || field;
  };

  const handleSort = (column: 'sundryPayId' | 'totalDue') => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const yearOptions = Array.from(new Set(
    stakeholderList
      .map(s => s.sundryPayId?.substring(2, 6))
      .filter(Boolean)
  )).sort().reverse();

  const filteredStakeholders = stakeholderList
    .filter(s => {
      if (yearFilter !== "all") {
        if (!s.sundryPayId) return false;
        const stakeholderYear = s.sundryPayId.substring(2, 6);
        if (stakeholderYear !== yearFilter) return false;
      }
      if (nameFilter.trim()) {
        const searchLower = nameFilter.toLowerCase().trim();
        if (!s.name.toLowerCase().includes(searchLower)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortColumn) return 0;
      if (sortColumn === 'sundryPayId') {
        const aCode = a.sundryPayId || '';
        const bCode = b.sundryPayId || '';
        return sortDirection === 'asc' 
          ? aCode.localeCompare(bCode)
          : bCode.localeCompare(aCode);
      }
      if (sortColumn === 'totalDue') {
        return sortDirection === 'asc'
          ? a.totalDue - b.totalDue
          : b.totalDue - a.totalDue;
      }
      return 0;
    });

  const summary = useMemo(() => {
    return {
      totalDue: filteredStakeholders.reduce((sum, s) => sum + s.totalDue, 0),
      totalGiven: filteredStakeholders.reduce((sum, s) => sum + s.totalGiven, 0),
      totalReceived: filteredStakeholders.reduce((sum, s) => sum + s.totalReceived, 0),
      pyReceivableTotal: filteredStakeholders.reduce((sum, s) => sum + s.pyReceivableAmount, 0),
      redFlagCount: filteredStakeholders.filter(s => s.redFlag).length,
    };
  }, [filteredStakeholders]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="border-blue-300 dark:border-blue-700 p-4">
          <div className="text-xs text-muted-foreground">{t("Total Due", "कुल बकाया")}</div>
          <div className="text-sm font-bold mt-1" data-testid="sundry-summary-total-due">{formatCurrency(summary.totalDue)}</div>
        </Card>
        <Card className="border-purple-300 dark:border-purple-700 p-4">
          <div className="text-xs text-muted-foreground">{t("PY Receivable", "पीवाय प्राप्य")}</div>
          <div className="text-sm font-bold mt-1 text-purple-600 dark:text-purple-400" data-testid="sundry-summary-py-receivable">{formatCurrency(summary.pyReceivableTotal)}</div>
        </Card>
        <Card className="border-orange-300 dark:border-orange-700 p-4">
          <div className="text-xs text-muted-foreground">{t("Total Given", "कुल दिया")}</div>
          <div className="text-sm font-bold mt-1 text-orange-600 dark:text-orange-400" data-testid="sundry-summary-total-given">{formatCurrency(summary.totalGiven)}</div>
        </Card>
        <Card className="border-green-300 dark:border-green-700 p-4">
          <div className="text-xs text-muted-foreground">{t("Total Received", "कुल प्राप्त")}</div>
          <div className="text-sm font-bold mt-1 text-green-600 dark:text-green-400" data-testid="sundry-summary-total-received">{formatCurrency(summary.totalReceived)}</div>
        </Card>
        <Card className="border-red-300 dark:border-red-700 p-4">
          <div className="text-xs text-muted-foreground">{t("Red Flags", "रेड फ्लैग")}</div>
          <div className="text-sm font-bold mt-1 text-red-600 dark:text-red-400" data-testid="sundry-summary-red-flags">{summary.redFlagCount}</div>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5" />
              {t("Sundry Pay Ledger", "सन्ड्री पे खाता")}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[90px]" data-testid="select-sundry-year-filter">
                  <SelectValue placeholder={t("Year", "वर्ष")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All Years", "सभी वर्ष")}</SelectItem>
                  {yearOptions.map(year => (
                    <SelectItem key={year} value={year!}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("Search name...", "नाम खोजें...")}
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="pl-8 w-[160px]"
                  data-testid="input-sundry-name-filter"
                />
              </div>
              <Button
                onClick={() => setAddDialogOpen(true)}
                variant="outline"
                size="sm"
                data-testid="button-add-sundry-pay"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Stakeholder", "हितधारक जोड़ें")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
                <div className="grid items-center gap-2 px-3 py-2 bg-muted/50 text-xs font-medium border-b min-w-[900px]" style={{ gridTemplateColumns: '36px minmax(90px, 0.9fr) minmax(100px, 1.2fr) minmax(90px, 1fr) minmax(80px, 0.8fr) 55px 48px minmax(80px, 0.8fr) minmax(80px, 0.8fr) minmax(80px, 0.8fr) minmax(80px, 0.8fr)' }}>
                  <div></div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('sundryPayId')}
                    data-testid="sort-sundry-id"
                  >
                    {t("ID", "आईडी")}
                    {sortColumn === 'sundryPayId' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div>{t("Name", "नाम")}</div>
                  <div>{t("Address", "पता")}</div>
                  <div>{t("Contact", "संपर्क")}</div>
                  <div>{t("Flag", "फ्लैग")}</div>
                  <div>{t("Active", "सक्रिय")}</div>
                  <div>{t("PY Recv.", "पीवाय प्रा.")}</div>
                  <div>{t("Given", "दिया")}</div>
                  <div>{t("Received", "प्राप्त")}</div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('totalDue')}
                    data-testid="sort-sundry-total-due"
                  >
                    {t("Due", "बकाया")}
                    {sortColumn === 'totalDue' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
                
                {filteredStakeholders.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {t("No sundry pay stakeholders found", "कोई सन्ड्री पे हितधारक नहीं मिला")}
                  </div>
                ) : (
                  filteredStakeholders.map((stakeholder, index) => (
                    <div 
                      key={stakeholder.id} 
                      className={`grid items-center gap-2 px-3 py-2 border-b last:border-b-0 min-w-[900px] ${stakeholder.redFlag ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}
                      style={{ gridTemplateColumns: '36px minmax(90px, 0.9fr) minmax(100px, 1.2fr) minmax(90px, 1fr) minmax(80px, 0.8fr) 55px 48px minmax(80px, 0.8fr) minmax(80px, 0.8fr) minmax(80px, 0.8fr) minmax(80px, 0.8fr)' }}
                      data-testid={`sundry-row-${index}`}
                    >
                      <div className="flex items-center justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(stakeholder)}
                          data-testid={`button-edit-sundry-${index}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground truncate" data-testid={`text-sundry-code-${index}`}>
                        {stakeholder.sundryPayId || '-'}
                      </div>
                      <div className="text-xs truncate flex items-center gap-1" data-testid={`text-sundry-name-${index}`}>
                        {stakeholder.redFlag && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                        {stakeholder.name}
                      </div>
                      <div className="text-xs truncate" data-testid={`text-sundry-address-${index}`}>
                        {stakeholder.address || '-'}
                      </div>
                      <div className="text-xs truncate" data-testid={`text-sundry-contact-${index}`}>
                        {stakeholder.contact || '-'}
                      </div>
                      <div className="flex items-center">
                        {stakeholder.redFlag ? (
                          <Badge variant="destructive" className="text-xs">{t("Yes", "हाँ")}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">{t("No", "नहीं")}</Badge>
                        )}
                      </div>
                      <div className="flex items-center">
                        <Switch
                          checked={stakeholder.isActive ?? true}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: stakeholder.id, isActive: checked })}
                          data-testid={`switch-sundry-active-${index}`}
                        />
                      </div>
                      <div className="text-xs font-mono">
                        ₹{stakeholder.pyReceivableAmount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </div>
                      <div className="text-xs font-mono text-orange-600 dark:text-orange-400">
                        ₹{stakeholder.totalGiven.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </div>
                      <div className="text-xs font-mono text-green-600 dark:text-green-400">
                        ₹{stakeholder.totalReceived.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </div>
                      <div className="text-xs font-mono font-semibold" data-testid={`text-sundry-due-${index}`}>
                        ₹{stakeholder.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {filteredStakeholders.map((stakeholder, index) => (
                <div 
                  key={`mobile-${stakeholder.id}`} 
                  className={`md:hidden p-4 border rounded-lg bg-card space-y-3 ${stakeholder.redFlag ? 'border-red-300 dark:border-red-700' : ''}`}
                  data-testid={`sundry-card-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">{stakeholder.sundryPayId || '-'}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(stakeholder)}
                      data-testid={`button-edit-sundry-mobile-${index}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="font-medium flex items-center gap-1">
                    {stakeholder.redFlag && <AlertTriangle className="h-4 w-4 text-red-500" />}
                    {stakeholder.name}
                  </div>
                  <div className="text-sm text-muted-foreground">{stakeholder.address || '-'}</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {stakeholder.contact && <span>{t("Contact", "संपर्क")}: {stakeholder.contact}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                    <div>
                      <span className="text-muted-foreground">{t("PY Receivable", "पीवाय प्राप्य")}: </span>
                      <span className="font-mono">₹{stakeholder.pyReceivableAmount.toLocaleString("en-IN")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("Given", "दिया")}: </span>
                      <span className="font-mono text-orange-600 dark:text-orange-400">₹{stakeholder.totalGiven.toLocaleString("en-IN")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("Received", "प्राप्त")}: </span>
                      <span className="font-mono text-green-600 dark:text-green-400">₹{stakeholder.totalReceived.toLocaleString("en-IN")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("Due", "बकाया")}: </span>
                      <span className="font-mono font-semibold">₹{stakeholder.totalDue.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      {stakeholder.redFlag && <Badge variant="destructive">{t("Red Flag", "रेड फ्लैग")}</Badge>}
                      <Switch
                        checked={stakeholder.isActive ?? true}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: stakeholder.id, isActive: checked })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              {t("Edit Stakeholder", "हितधारक संपादित करें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder={t("Stakeholder name", "हितधारक का नाम")}
                data-testid="input-edit-sundry-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-edit-sundry-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Contact", "संपर्क")}</Label>
                <Input
                  type="tel"
                  maxLength={10}
                  value={editForm.contact}
                  onChange={(e) => setEditForm({ ...editForm, contact: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  placeholder={t("Phone", "फ़ोन")}
                  data-testid="input-edit-sundry-contact"
                />
                {editForm.contact && editForm.contact.length > 0 && editForm.contact.length < 10 && (
                  <p className="text-xs text-destructive mt-1">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("Opening Balance (PY Receivable)", "शुरुआती बैलेंस (पीवाय प्राप्य)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.pyReceivable}
                  onChange={(e) => setEditForm({ ...editForm, pyReceivable: e.target.value })}
                  placeholder="0"
                  data-testid="input-edit-sundry-py-receivable"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={editForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setEditForm({ ...editForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-edit-sundry-red-flag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">{t("No", "नहीं")}</SelectItem>
                  <SelectItem value="yes">{t("Yes", "हाँ")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="w-full justify-between"
                data-testid="button-toggle-sundry-history"
              >
                <span className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {t("Edit History", "संपादन इतिहास")}
                </span>
                {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              
              {showHistory && (
                <div className="mt-2 max-h-48 overflow-y-auto">
                  {historyLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : editHistory.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      {t("No edit history", "कोई संपादन इतिहास नहीं")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {editHistory.map((entry) => (
                        <div key={entry.id} className="p-2 rounded text-xs bg-muted/50">
                          <div className="flex justify-between text-muted-foreground">
                            <span>#{entry.serialNumber}</span>
                            <span>{new Date(entry.changedAt!).toLocaleString()}</span>
                          </div>
                          <div className="mt-1">
                            <span className="font-medium">{formatFieldName(entry.fieldName)}</span>: 
                            <span className="line-through text-muted-foreground ml-1">{entry.oldValue || '-'}</span>
                            <span className="ml-1">→</span>
                            <span className="ml-1 text-primary">{entry.newValue || '-'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("Save", "सहेजें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t("Add Stakeholder", "हितधारक जोड़ें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder={t("Stakeholder name", "हितधारक का नाम")}
                data-testid="input-add-sundry-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={addForm.address}
                onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-add-sundry-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Contact", "संपर्क")}</Label>
                <Input
                  type="tel"
                  maxLength={10}
                  value={addForm.contact}
                  onChange={(e) => setAddForm({ ...addForm, contact: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  placeholder={t("Phone", "फ़ोन")}
                  data-testid="input-add-sundry-contact"
                />
                {addForm.contact && addForm.contact.length > 0 && addForm.contact.length < 10 && (
                  <p className="text-xs text-destructive mt-1">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("Opening Balance (PY Receivable)", "शुरुआती बैलेंस (पीवाय प्राप्य)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={addForm.pyReceivable}
                  onChange={(e) => setAddForm({ ...addForm, pyReceivable: e.target.value })}
                  placeholder="0"
                  data-testid="input-add-sundry-py-receivable"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={addForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setAddForm({ ...addForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-add-sundry-red-flag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">{t("No", "नहीं")}</SelectItem>
                  <SelectItem value="yes">{t("Yes", "हाँ")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleAddStakeholder} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("Add", "जोड़ें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}