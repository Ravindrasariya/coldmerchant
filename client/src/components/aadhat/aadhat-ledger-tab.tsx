import { useState } from "react";
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
  Users,
  Pencil,
  History,
  ChevronDown,
  ChevronUp,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Aadhat, type AadhatEditHistory } from "@shared/schema";

interface AadhatWithDues extends Aadhat {
  totalDue: number;
}

export default function AadhatLedgerTab() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAadhat, setEditingAadhat] = useState<AadhatWithDues | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "", contact: "", pyPayable: "", redFlag: false });
  const [showHistory, setShowHistory] = useState(false);
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", contact: "", pyPayable: "", redFlag: false });

  const [yearFilter, setYearFilter] = useState<string>("all");
  const [nameFilter, setNameFilter] = useState("");
  
  const [sortColumn, setSortColumn] = useState<'aadhatId' | 'totalDue' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: aadhatList = [], isLoading } = useQuery<AadhatWithDues[]>({
    queryKey: ["/api/aadhats"],
    enabled: !!user,
  });

  const { data: editHistory = [], isLoading: historyLoading } = useQuery<AadhatEditHistory[]>({
    queryKey: ["/api/aadhats", editingAadhat?.id, "history"],
    queryFn: async () => {
      if (!editingAadhat?.id) return [];
      const res = await fetch(`/api/aadhats/${editingAadhat.id}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!editingAadhat?.id && showHistory,
  });

  const createMutation = useMutation({
    mutationFn: async (aadhat: typeof addForm) => {
      const response = await apiRequest("POST", "/api/aadhats", {
        name: aadhat.name,
        address: aadhat.address,
        contact: aadhat.contact || null,
        pyPayable: aadhat.pyPayable || "0",
        redFlag: aadhat.redFlag,
        isActive: true,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aadhats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
      setAddDialogOpen(false);
      setAddForm({ name: "", address: "", contact: "", pyPayable: "", redFlag: false });
      toast({ title: t("Aadhat added successfully", "आढ़त सफलतापूर्वक जोड़ा गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to add aadhat", "आढ़त जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & typeof editForm) => {
      const response = await apiRequest("PATCH", `/api/aadhats/${id}/details`, {
        name: data.name,
        address: data.address,
        contact: data.contact || null,
        pyPayable: data.pyPayable || "0",
        redFlag: data.redFlag,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aadhats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
      setEditDialogOpen(false);
      setEditingAadhat(null);
      setShowHistory(false);
      toast({ title: t("Aadhat updated successfully", "आढ़त सफलतापूर्वक अपडेट किया गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to update aadhat", "आढ़त अपडेट करने में विफल"), variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/aadhats/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aadhats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
    },
  });

  const handleEditClick = (aadhat: AadhatWithDues) => {
    setEditingAadhat(aadhat);
    setEditForm({
      name: aadhat.name,
      address: aadhat.address,
      contact: aadhat.contact || "",
      pyPayable: aadhat.pyPayable || "0",
      redFlag: aadhat.redFlag ?? false,
    });
    setShowHistory(false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingAadhat) return;
    if (!editForm.name.trim() || !editForm.address.trim()) {
      toast({ title: t("Name and Address are required", "नाम और पता आवश्यक हैं"), variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editingAadhat.id, ...editForm });
  };

  const handleAddAadhat = () => {
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
      pyPayable: t("PY Payable", "पीवाय देय"),
      redFlag: t("Red Flag", "रेड फ्लैग"),
    };
    return fieldMap[field] || field;
  };

  const yearOptions = Array.from(new Set(
    aadhatList
      .map(a => a.aadhatId?.substring(2, 6))
      .filter(Boolean)
  )).sort().reverse();

  const handleSort = (column: 'aadhatId' | 'totalDue') => {
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

  const filteredAadhats = aadhatList
    .filter(aadhat => {
      if (yearFilter !== "all") {
        if (!aadhat.aadhatId) return false;
        const aadhatYear = aadhat.aadhatId.substring(2, 6);
        if (aadhatYear !== yearFilter) return false;
      }
      if (nameFilter.trim()) {
        const searchLower = nameFilter.toLowerCase().trim();
        if (!aadhat.name.toLowerCase().includes(searchLower)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortColumn) return 0;
      
      if (sortColumn === 'aadhatId') {
        const aCode = a.aadhatId || '';
        const bCode = b.aadhatId || '';
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("Aadhat Ledger", "आढ़त खाता")}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[90px]" data-testid="select-aadhat-year-filter">
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
                  data-testid="input-aadhat-name-filter"
                />
              </div>
              <Button
                onClick={() => setAddDialogOpen(true)}
                variant="outline"
                size="sm"
                data-testid="button-add-aadhat"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Aadhat", "आढ़त जोड़ें")}
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
                <div className="grid items-center gap-2 px-3 py-2 bg-muted/50 text-xs font-medium border-b min-w-[700px]" style={{ gridTemplateColumns: '36px minmax(100px, 1fr) minmax(100px, 1.2fr) minmax(100px, 1.2fr) minmax(80px, 0.8fr) 55px 48px minmax(80px, 0.8fr) minmax(80px, 0.8fr)' }}>
                  <div></div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('aadhatId')}
                    data-testid="sort-aadhat-id"
                  >
                    {t("Aadhat ID", "आढ़त आईडी")}
                    {sortColumn === 'aadhatId' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div>{t("Name", "नाम")}</div>
                  <div>{t("Address", "पता")}</div>
                  <div>{t("Contact", "संपर्क")}</div>
                  <div>{t("Red Flag", "रेड फ्लैग")}</div>
                  <div>{t("Active", "सक्रिय")}</div>
                  <div>{t("PY Payable", "पीवाय देय")}</div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('totalDue')}
                    data-testid="sort-aadhat-total-due"
                  >
                    {t("Total Due", "कुल बकाया")}
                    {sortColumn === 'totalDue' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
                
                {filteredAadhats.map((aadhat, index) => (
                  <div 
                    key={aadhat.id} 
                    className="grid items-center gap-2 px-3 py-2 border-b last:border-b-0 min-w-[700px]"
                    style={{ gridTemplateColumns: '36px minmax(100px, 1fr) minmax(100px, 1.2fr) minmax(100px, 1.2fr) minmax(80px, 0.8fr) 55px 48px minmax(80px, 0.8fr) minmax(80px, 0.8fr)' }}
                    data-testid={`aadhat-row-${index}`}
                  >
                    <div className="flex items-center justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(aadhat)}
                        data-testid={`button-edit-aadhat-${index}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate" data-testid={`text-aadhat-code-${index}`}>
                      {aadhat.aadhatId || '-'}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-aadhat-name-${index}`}>
                      {aadhat.name}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-aadhat-address-${index}`}>
                      {aadhat.address}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-aadhat-contact-${index}`}>
                      {aadhat.contact || '-'}
                    </div>
                    <div className="flex items-center">
                      {aadhat.redFlag ? (
                        <Badge variant="destructive" className="text-xs">{t("Yes", "हाँ")}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{t("No", "नहीं")}</Badge>
                      )}
                    </div>
                    <div className="flex items-center">
                      <Switch
                        checked={aadhat.isActive ?? true}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: aadhat.id, isActive: checked })}
                        data-testid={`switch-aadhat-active-${index}`}
                      />
                    </div>
                    <div className="text-xs font-mono">
                      ₹{parseFloat(aadhat.pyPayable || "0").toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </div>
                    <div className="text-xs font-mono">
                      ₹{aadhat.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </div>
                  </div>
                ))}
              </div>
              
              {filteredAadhats.map((aadhat, index) => (
                <div 
                  key={`mobile-${aadhat.id}`} 
                  className="md:hidden p-4 border rounded-lg bg-card space-y-3"
                  data-testid={`aadhat-card-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">{aadhat.aadhatId || '-'}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(aadhat)}
                      data-testid={`button-edit-aadhat-mobile-${index}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="font-medium">{aadhat.name}</div>
                  <div className="text-sm text-muted-foreground">{aadhat.address}</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {aadhat.contact && <span>{t("Contact", "संपर्क")}: {aadhat.contact}</span>}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      {aadhat.redFlag ? (
                        <Badge variant="destructive">{t("Red Flag", "रेड फ्लैग")}</Badge>
                      ) : null}
                      <Switch
                        checked={aadhat.isActive ?? true}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: aadhat.id, isActive: checked })}
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">{t("PY Payable", "पीवाय देय")}: ₹{parseFloat(aadhat.pyPayable || "0").toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                      <div className="text-sm font-mono">{t("Total Due", "कुल बकाया")}: ₹{aadhat.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
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
              {t("Edit Aadhat", "आढ़त संपादित करें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder={t("Aadhat name", "आढ़त का नाम")}
                data-testid="input-edit-aadhat-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-edit-aadhat-address"
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
                  data-testid="input-edit-aadhat-contact"
                />
                {editForm.contact && editForm.contact.length > 0 && editForm.contact.length < 10 && (
                  <p className="text-xs text-destructive mt-1">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("Opening Balance (PY Payable)", "शुरुआती बैलेंस (पीवाय देय)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.pyPayable}
                  onChange={(e) => setEditForm({ ...editForm, pyPayable: e.target.value })}
                  placeholder="0"
                  data-testid="input-edit-aadhat-py-payable"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={editForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setEditForm({ ...editForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-edit-aadhat-red-flag">
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
                data-testid="button-toggle-aadhat-history"
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
                        <div key={entry.id} className="p-2 bg-muted/50 rounded text-xs">
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
              {t("Add Aadhat", "आढ़त जोड़ें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder={t("Aadhat name", "आढ़त का नाम")}
                data-testid="input-add-aadhat-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={addForm.address}
                onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-add-aadhat-address"
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
                  data-testid="input-add-aadhat-contact"
                />
                {addForm.contact && addForm.contact.length > 0 && addForm.contact.length < 10 && (
                  <p className="text-xs text-destructive mt-1">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("Opening Balance (PY Payable)", "शुरुआती बैलेंस (पीवाय देय)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={addForm.pyPayable}
                  onChange={(e) => setAddForm({ ...addForm, pyPayable: e.target.value })}
                  placeholder="0"
                  data-testid="input-add-aadhat-py-payable"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={addForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setAddForm({ ...addForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-add-aadhat-red-flag">
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
            <Button onClick={handleAddAadhat} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("Add", "जोड़ें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
