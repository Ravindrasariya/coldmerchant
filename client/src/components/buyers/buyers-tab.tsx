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
  RefreshCw,
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
import { type Buyer, type BuyerEditHistory } from "@shared/schema";

interface BuyerWithDues extends Buyer {
  overallDue: number;
  receivables: number;
}

export default function BuyersTab() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState<BuyerWithDues | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "", mandiCode: "", contact: "", redFlag: false });
  const [showHistory, setShowHistory] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergingBuyer, setMergingBuyer] = useState<{ id: number; buyerCode: string; name: string } | null>(null);
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", mandiCode: "", contact: "", redFlag: false });

  const [yearFilter, setYearFilter] = useState<string>("all");
  const [nameFilter, setNameFilter] = useState("");
  
  const [sortColumn, setSortColumn] = useState<'buyerCode' | 'overallDue' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: buyers = [], isLoading } = useQuery<BuyerWithDues[]>({
    queryKey: ["/api/buyers"],
    enabled: !!user,
  });

  const { data: editHistory = [], isLoading: historyLoading } = useQuery<BuyerEditHistory[]>({
    queryKey: ["/api/buyers", editingBuyer?.id, "history"],
    queryFn: async () => {
      if (!editingBuyer?.id) return [];
      const res = await fetch(`/api/buyers/${editingBuyer.id}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!editingBuyer?.id && showHistory,
  });

  const createMutation = useMutation({
    mutationFn: async (buyer: typeof addForm) => {
      const response = await apiRequest("POST", "/api/buyers", {
        dateAdded: new Date().toISOString().split('T')[0],
        name: buyer.name,
        address: buyer.address,
        mandiCode: buyer.mandiCode || null,
        contact: buyer.contact || null,
        redFlag: buyer.redFlag,
        isActive: true,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      setAddDialogOpen(false);
      setAddForm({ name: "", address: "", mandiCode: "", contact: "", redFlag: false });
      toast({ title: t("Buyer added successfully", "खरीदार सफलतापूर्वक जोड़ा गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to add buyer", "खरीदार जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & typeof editForm) => {
      const response = await fetch(`/api/buyers/${id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          address: data.address,
          mandiCode: data.mandiCode || null,
          contact: data.contact || null,
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
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      setEditDialogOpen(false);
      setEditingBuyer(null);
      setShowHistory(false);
      toast({ title: t("Buyer updated successfully", "खरीदार सफलतापूर्वक अपडेट किया गया"), description: data.message, variant: "success" });
    },
    onError: (error: any) => {
      const errorData = error.data || error;
      if (error.status === 409 && errorData.requiresMerge && errorData.existingBuyer) {
        setEditDialogOpen(false);
        setMergingBuyer({
          id: errorData.existingBuyer.id,
          buyerCode: errorData.existingBuyer.buyerCode,
          name: errorData.existingBuyer.name,
        });
        setMergeDialogOpen(true);
      } else {
        toast({ title: t("Failed to update buyer", "खरीदार अपडेट करने में विफल"), description: errorData.message, variant: "destructive" });
      }
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: number; targetId: number }) => {
      const response = await apiRequest("POST", "/api/buyers/merge", { sourceId, targetId });
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      setMergeDialogOpen(false);
      setMergingBuyer(null);
      setEditingBuyer(null);
      toast({
        title: t("Buyers Merged", "खरीदार मर्ज किए गए"),
        description: data.message,
        variant: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message || t("Failed to merge buyers", "खरीदारों को मर्ज करने में विफल"),
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/cash/managed-parties/sync", {});
      return response.json();
    },
    onSuccess: (data: { partiesLinked: number; buyersCreated: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      toast({
        title: t("Sync Complete", "सिंक पूर्ण"),
        description: t(`${data.partiesLinked} parties linked, ${data.buyersCreated} new buyers created`, `${data.partiesLinked} पार्टियां लिंक, ${data.buyersCreated} नए खरीदार बनाए गए`),
        variant: "success",
      });
    },
    onError: () => {
      toast({
        title: t("Sync Failed", "सिंक विफल"),
        variant: "destructive"
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/buyers/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
    },
  });

  const handleEditClick = (buyer: BuyerWithDues) => {
    setEditingBuyer(buyer);
    setEditForm({
      name: buyer.name,
      address: buyer.address,
      mandiCode: buyer.mandiCode || "",
      contact: buyer.contact || "",
      redFlag: buyer.redFlag ?? false,
    });
    setShowHistory(false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingBuyer) return;
    if (!editForm.name.trim() || !editForm.address.trim()) {
      toast({ title: t("Name and Address are required", "नाम और पता आवश्यक हैं"), variant: "destructive" });
      return;
    }
    if (editForm.contact && !/^\d{10}$/.test(editForm.contact)) {
      toast({ title: t("Enter valid 10-digit contact number", "मान्य 10 अंकों का संपर्क नंबर दर्ज करें"), variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editingBuyer.id, ...editForm });
  };

  const handleConfirmMerge = () => {
    if (!editingBuyer || !mergingBuyer) return;
    mergeMutation.mutate({
      sourceId: editingBuyer.id,
      targetId: mergingBuyer.id,
    });
  };

  const handleAddBuyer = () => {
    if (!addForm.name.trim() || !addForm.address.trim()) {
      toast({ title: t("Name and Address are required", "नाम और पता आवश्यक हैं"), variant: "destructive" });
      return;
    }
    if (addForm.contact && !/^\d{10}$/.test(addForm.contact)) {
      toast({ title: t("Enter valid 10-digit contact number", "मान्य 10 अंकों का संपर्क नंबर दर्ज करें"), variant: "destructive" });
      return;
    }
    createMutation.mutate(addForm);
  };

  const formatFieldName = (field: string) => {
    const fieldMap: Record<string, string> = {
      name: t("Name", "नाम"),
      address: t("Address", "पता"),
      mandiCode: t("Mandi Code", "मंडी कोड"),
      contact: t("Contact", "संपर्क"),
      redFlag: t("Red Flag", "रेड फ्लैग"),
    };
    return fieldMap[field] || field;
  };

  const yearOptions = Array.from(new Set(
    buyers
      .map(b => b.buyerCode?.substring(2, 6))
      .filter(Boolean)
  )).sort().reverse();

  const handleSort = (column: 'buyerCode' | 'overallDue') => {
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

  const filteredBuyers = buyers
    .filter(buyer => {
      if (yearFilter !== "all") {
        if (!buyer.buyerCode) return false;
        const buyerYear = buyer.buyerCode.substring(2, 6);
        if (buyerYear !== yearFilter) return false;
      }
      if (nameFilter.trim()) {
        const searchLower = nameFilter.toLowerCase().trim();
        if (!buyer.name.toLowerCase().includes(searchLower)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortColumn) return 0;
      
      if (sortColumn === 'buyerCode') {
        const aCode = a.buyerCode || '';
        const bCode = b.buyerCode || '';
        return sortDirection === 'asc' 
          ? aCode.localeCompare(bCode)
          : bCode.localeCompare(aCode);
      }
      
      if (sortColumn === 'overallDue') {
        return sortDirection === 'asc'
          ? a.overallDue - b.overallDue
          : b.overallDue - a.overallDue;
      }
      
      return 0;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("Buyer Ledger", "खरीदार खाता")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Manage buyers and track dues", "खरीदारों का प्रबंधन करें और बकाया ट्रैक करें")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("Buyer Management", "खरीदार प्रबंधन")}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[90px]" data-testid="select-year-filter">
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
                  data-testid="input-name-filter"
                />
              </div>
              <Button
                onClick={() => syncMutation.mutate()}
                variant="outline"
                size="sm"
                disabled={syncMutation.isPending}
                data-testid="button-sync-parties"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                {t("Sync Parties", "पार्टी सिंक करें")}
              </Button>
              <Button
                onClick={() => setAddDialogOpen(true)}
                variant="outline"
                size="sm"
                data-testid="button-add-buyer"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Buyer", "खरीदार जोड़ें")}
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
                <div className="grid items-center gap-2 px-3 py-2 bg-muted/50 text-xs font-medium border-b min-w-[900px]" style={{ gridTemplateColumns: '36px minmax(100px, 1fr) minmax(80px, 1fr) minmax(120px, 1.5fr) minmax(50px, 0.5fr) minmax(90px, 0.9fr) 55px 48px minmax(80px, 0.8fr) minmax(70px, 0.7fr)' }}>
                  <div></div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('buyerCode')}
                    data-testid="sort-buyer-id"
                  >
                    {t("Buyer ID", "खरीदार आईडी")}
                    {sortColumn === 'buyerCode' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div>{t("Name", "नाम")}</div>
                  <div>{t("Address", "पता")}</div>
                  <div>{t("Mandi Code", "मंडी कोड")}</div>
                  <div>{t("Contact", "संपर्क")}</div>
                  <div>{t("Red Flag", "रेड फ्लैग")}</div>
                  <div>{t("Active", "सक्रिय")}</div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('overallDue')}
                    data-testid="sort-overall-due"
                  >
                    {t("Overall Due", "कुल बकाया")}
                    {sortColumn === 'overallDue' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div>{t("Receivables", "प्राप्य")}</div>
                </div>
                
                {filteredBuyers.map((buyer, index) => (
                  <div 
                    key={buyer.id} 
                    className="grid items-center gap-2 px-3 py-2 border-b last:border-b-0 min-w-[900px]"
                    style={{ gridTemplateColumns: '36px minmax(100px, 1fr) minmax(80px, 1fr) minmax(120px, 1.5fr) minmax(50px, 0.5fr) minmax(90px, 0.9fr) 55px 48px minmax(80px, 0.8fr) minmax(70px, 0.7fr)' }}
                    data-testid={`buyer-row-${index}`}
                  >
                    <div className="flex items-center justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(buyer)}
                        data-testid={`button-edit-buyer-${index}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate" data-testid={`text-buyer-code-${index}`}>
                      {buyer.buyerCode || '-'}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-name-${index}`}>
                      {buyer.name}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-address-${index}`}>
                      {buyer.address}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-mandi-code-${index}`}>
                      {buyer.mandiCode || '-'}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-contact-${index}`}>
                      {buyer.contact || '-'}
                    </div>
                    <div className="flex items-center">
                      {buyer.redFlag ? (
                        <Badge variant="destructive" className="text-xs">{t("Yes", "हाँ")}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{t("No", "नहीं")}</Badge>
                      )}
                    </div>
                    <div className="flex items-center">
                      <Switch
                        checked={buyer.isActive ?? true}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: buyer.id, isActive: checked })}
                        data-testid={`switch-active-${index}`}
                      />
                    </div>
                    <div className="text-xs font-mono">
                      ₹{buyer.overallDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </div>
                    <div className="text-xs font-mono text-orange-600 dark:text-orange-400">
                      ₹{buyer.receivables.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </div>
                  </div>
                ))}
              </div>
              
              {filteredBuyers.map((buyer, index) => (
                <div 
                  key={`mobile-${buyer.id}`} 
                  className="md:hidden p-4 border rounded-lg bg-card space-y-3"
                  data-testid={`buyer-card-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">{buyer.buyerCode || '-'}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(buyer)}
                      data-testid={`button-edit-buyer-mobile-${index}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="font-medium">{buyer.name}</div>
                  <div className="text-sm text-muted-foreground">{buyer.address}</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {buyer.mandiCode && <span>{t("Mandi", "मंडी")}: {buyer.mandiCode}</span>}
                    {buyer.contact && <span>{t("Contact", "संपर्क")}: {buyer.contact}</span>}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      {buyer.redFlag ? (
                        <Badge variant="destructive">{t("Red Flag", "रेड फ्लैग")}</Badge>
                      ) : null}
                      <Switch
                        checked={buyer.isActive ?? true}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: buyer.id, isActive: checked })}
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono">₹{buyer.overallDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                      <div className="text-sm font-mono text-orange-600 dark:text-orange-400">₹{buyer.receivables.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
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
              {t("Edit Buyer", "खरीदार संपादित करें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder={t("Buyer name", "खरीदार का नाम")}
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-edit-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Mandi Code", "मंडी कोड")}</Label>
                <Input
                  value={editForm.mandiCode}
                  onChange={(e) => setEditForm({ ...editForm, mandiCode: e.target.value })}
                  placeholder={t("Code", "कोड")}
                  data-testid="input-edit-mandi-code"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Contact", "संपर्क")}</Label>
                <Input
                  type="tel"
                  maxLength={10}
                  value={editForm.contact}
                  onChange={(e) => setEditForm({ ...editForm, contact: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  placeholder={t("Phone", "फ़ोन")}
                  data-testid="input-edit-contact"
                />
                {editForm.contact && editForm.contact.length > 0 && editForm.contact.length < 10 && (
                  <p className="text-xs text-destructive mt-1" data-testid="warning-edit-contact-invalid">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={editForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setEditForm({ ...editForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-edit-negative">
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
                data-testid="button-toggle-history"
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
                        <div key={entry.id} className={`p-2 rounded text-xs ${entry.fieldName === 'merge' ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800' : 'bg-muted/50'}`}>
                          <div className="flex justify-between text-muted-foreground">
                            <span className="flex items-center gap-1">
                              #{entry.serialNumber}
                              {entry.fieldName === 'merge' && <Badge variant="outline" className="text-blue-600 border-blue-300 text-[10px] px-1 py-0">{t("Merge", "मर्ज")}</Badge>}
                            </span>
                            <span>{new Date(entry.changedAt!).toLocaleString()}</span>
                          </div>
                          {entry.fieldName === 'merge' ? (
                            <div className="mt-1">
                              <span className="text-blue-700 dark:text-blue-400">{entry.oldValue}</span>
                              <div className="text-muted-foreground mt-0.5">{entry.newValue}</div>
                            </div>
                          ) : (
                            <div className="mt-1">
                              <span className="font-medium">{formatFieldName(entry.fieldName)}</span>: 
                              <span className="line-through text-muted-foreground ml-1">{entry.oldValue || '-'}</span>
                              <span className="ml-1">→</span>
                              <span className="ml-1 text-primary">{entry.newValue || '-'}</span>
                            </div>
                          )}
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
              {t("Add Buyer", "खरीदार जोड़ें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder={t("Buyer name", "खरीदार का नाम")}
                data-testid="input-add-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={addForm.address}
                onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-add-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Mandi Code", "मंडी कोड")}</Label>
                <Input
                  value={addForm.mandiCode}
                  onChange={(e) => setAddForm({ ...addForm, mandiCode: e.target.value })}
                  placeholder={t("Code", "कोड")}
                  data-testid="input-add-mandi-code"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Contact", "संपर्क")}</Label>
                <Input
                  type="tel"
                  maxLength={10}
                  value={addForm.contact}
                  onChange={(e) => setAddForm({ ...addForm, contact: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  placeholder={t("Phone", "फ़ोन")}
                  data-testid="input-add-contact"
                />
                {addForm.contact && addForm.contact.length > 0 && addForm.contact.length < 10 && (
                  <p className="text-xs text-destructive mt-1" data-testid="warning-add-contact-invalid">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={addForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setAddForm({ ...addForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-add-negative">
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
            <Button onClick={handleAddBuyer} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("Add", "जोड़ें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{t("Merge Buyers", "खरीदार मर्ज करें")}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm mb-4">
              {t("A buyer with these details already exists:", "इन विवरणों के साथ एक खरीदार पहले से मौजूद है:")}
            </p>
            <div className="bg-muted/50 p-3 rounded mb-4">
              <div className="text-sm font-medium" data-testid="text-merge-buyer-name">{mergingBuyer?.name}</div>
              <div className="text-xs text-muted-foreground font-mono" data-testid="text-merge-buyer-code">{mergingBuyer?.buyerCode}</div>
            </div>
            <p className="text-sm mb-2">
              {t("If you merge:", "यदि आप मर्ज करते हैं:")}
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
              <li>{t("The buyer with the lower ID will be kept", "कम आईडी वाला खरीदार रखा जाएगा")}</li>
              <li>{t("All linked transactions and cash entries will be transferred", "सभी संबंधित लेनदेन और नकद प्रविष्टियाँ स्थानांतरित की जाएंगी")}</li>
              <li>{t("Receivable balances will be combined", "प्राप्य शेष राशि संयोजित की जाएगी")}</li>
              <li>{t("The other buyer record will be deleted", "दूसरा खरीदार रिकॉर्ड हटा दिया जाएगा")}</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMergeDialogOpen(false); setMergingBuyer(null); }}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button 
              onClick={handleConfirmMerge} 
              disabled={mergeMutation.isPending}
              data-testid="button-confirm-buyer-merge"
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
