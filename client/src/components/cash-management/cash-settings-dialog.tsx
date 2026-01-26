import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/hooks/use-language";
import { Plus, Trash2, Edit2, Save, X, Wallet, Users, Tractor, Building2, RefreshCw, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Party, CashFarmer, CashSettings, BankAccount } from "@shared/schema";

interface CashSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CashSettingsDialog({ open, onOpenChange }: CashSettingsDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("opening");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const currentYear = new Date().getFullYear();
  const financialYear = `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;

  const { data: settings, isLoading: settingsLoading } = useQuery<CashSettings>({
    queryKey: ["/api/cash/settings", financialYear],
    queryFn: async () => {
      const res = await fetch(`/api/cash/settings/${financialYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    enabled: open,
  });

  const { data: parties = [], isLoading: partiesLoading } = useQuery<Party[]>({
    queryKey: ["/api/cash/managed-parties"],
    enabled: open,
  });

  const { data: farmers = [], isLoading: farmersLoading } = useQuery<CashFarmer[]>({
    queryKey: ["/api/cash/managed-farmers"],
    enabled: open,
  });

  const { data: bankAccounts = [], isLoading: bankAccountsLoading } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank-accounts"],
    enabled: open,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/season/reset");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-farmers"] });
      toast({ 
        title: t("Season Reset Complete", "सीज़न रीसेट पूरा हुआ"),
        description: t("Stock register has been cleared for the new season.", "नई सीज़न के लिए स्टॉक रजिस्टर साफ़ कर दिया गया है।")
      });
      setShowResetConfirm(false);
    },
    onError: (error: Error) => {
      toast({ 
        title: t("Reset Failed", "रीसेट विफल"),
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Cash Management Settings", "नकद प्रबंधन सेटिंग्स")}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="opening" className="flex items-center gap-2" data-testid="tab-opening-balance">
                <Wallet className="h-4 w-4" />
                {t("Opening", "प्रारंभिक")}
              </TabsTrigger>
              <TabsTrigger value="accounts" className="flex items-center gap-2" data-testid="tab-bank-accounts">
                <Building2 className="h-4 w-4" />
                {t("Accounts", "खाते")}
              </TabsTrigger>
              <TabsTrigger value="parties" className="flex items-center gap-2" data-testid="tab-parties">
                <Users className="h-4 w-4" />
                {t("Parties", "पार्टी")}
              </TabsTrigger>
              <TabsTrigger value="farmers" className="flex items-center gap-2" data-testid="tab-farmers">
                <Tractor className="h-4 w-4" />
                {t("Farmers", "किसान")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="opening" className="mt-4">
              <OpeningBalanceSection 
                settings={settings} 
                financialYear={financialYear} 
                isLoading={settingsLoading} 
              />
            </TabsContent>

            <TabsContent value="accounts" className="mt-4">
              <BankAccountsSection bankAccounts={bankAccounts} isLoading={bankAccountsLoading} />
            </TabsContent>

            <TabsContent value="parties" className="mt-4">
              <PartiesSection parties={parties} isLoading={partiesLoading} />
            </TabsContent>

            <TabsContent value="farmers" className="mt-4">
              <FarmersSection farmers={farmers} isLoading={farmersLoading} />
            </TabsContent>
          </Tabs>

          <div className="mt-6 pt-6 border-t border-destructive/30">
            <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-md mb-4">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                {t(
                  "Warning: Use this option only when starting a new season. This will clear all stock entries but keep transaction history.",
                  "चेतावनी: इस विकल्प का उपयोग केवल नई सीज़न शुरू करते समय करें। यह सभी स्टॉक एंट्री साफ़ कर देगा लेकिन लेनदेन इतिहास रखेगा।"
                )}
              </p>
            </div>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setShowResetConfirm(true)}
              data-testid="button-reset-season"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {t("Reset for Next Season", "अगली सीज़न के लिए रीसेट करें")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("Confirm Season Reset", "सीज़न रीसेट की पुष्टि करें")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <p>
                {t(
                  "Warning: This action should only be used when starting a new potato season.",
                  "चेतावनी: इस क्रिया का उपयोग केवल नई आलू सीज़न शुरू करते समय करें।"
                )}
              </p>
              <p>
                {t(
                  "This will permanently delete all stock entries (Raw Potato and Seed) from the stock register. Transaction history will NOT be affected.",
                  "यह स्टॉक रजिस्टर से सभी स्टॉक एंट्री (कच्चा आलू और बीज) स्थायी रूप से हटा देगा। लेनदेन इतिहास प्रभावित नहीं होगा।"
                )}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-reset-cancel">
              {t("Close", "बंद करें")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              data-testid="button-reset-confirm"
            >
              {resetMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t("Yes, Reset Season", "हाँ, सीज़न रीसेट करें")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface OpeningBalanceSectionProps {
  settings?: CashSettings;
  financialYear: string;
  isLoading: boolean;
}

function OpeningBalanceSection({ settings, financialYear, isLoading }: OpeningBalanceSectionProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [cashInHand, setCashInHand] = useState("");
  const [cashInAccount, setCashInAccount] = useState("");

  useEffect(() => {
    if (settings) {
      setCashInHand(settings.openingCashInHand || "0");
      setCashInAccount(settings.openingCashInAccount || "0");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: { financialYear: string; openingCashInHand: string; openingCashInAccount: string }) => {
      return apiRequest("POST", "/api/cash/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/settings", financialYear] });
      toast({ title: t("Settings saved", "सेटिंग्स सहेजी गईं") });
    },
    onError: () => {
      toast({ title: t("Failed to save settings", "सेटिंग्स सहेजने में विफल"), variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      financialYear,
      openingCashInHand: cashInHand,
      openingCashInAccount: cashInAccount,
    });
  };

  if (isLoading) {
    return <div className="text-center py-8">{t("Loading...", "लोड हो रहा है...")}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("Financial Year", "वित्तीय वर्ष")}: {financialYear}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cash-in-hand">{t("Opening Cash in Hand", "प्रारंभिक नकद")}</Label>
          <Input
            id="cash-in-hand"
            type="number"
            value={cashInHand}
            onChange={(e) => setCashInHand(e.target.value)}
            placeholder="0"
            data-testid="input-opening-cash-in-hand"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cash-in-account">{t("Opening Cash in Account", "प्रारंभिक खाता शेष")}</Label>
          <Input
            id="cash-in-account"
            type="number"
            value={cashInAccount}
            onChange={(e) => setCashInAccount(e.target.value)}
            placeholder="0"
            data-testid="input-opening-cash-in-account"
          />
        </div>
        <Button 
          onClick={handleSave} 
          disabled={saveMutation.isPending}
          className="w-full"
          data-testid="button-save-opening-balance"
        >
          {saveMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {t("Save Opening Balance", "प्रारंभिक शेष सहेजें")}
        </Button>
      </CardContent>
    </Card>
  );
}

interface PartiesSectionProps {
  parties: Party[];
  isLoading: boolean;
}

function PartiesSection({ parties, isLoading }: PartiesSectionProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", contactNumber: "", address: "", pendingDues: "" });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/cash/managed-parties", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-parties"] });
      setShowAddForm(false);
      setFormData({ name: "", contactNumber: "", address: "", pendingDues: "" });
      toast({ title: t("Party added", "पार्टी जोड़ी गई") });
    },
    onError: () => {
      toast({ title: t("Failed to add party", "पार्टी जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return apiRequest("PATCH", `/api/cash/managed-parties/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-parties"] });
      setEditingId(null);
      toast({ title: t("Party updated", "पार्टी अपडेट की गई") });
    },
    onError: () => {
      toast({ title: t("Failed to update party", "पार्टी अपडेट करने में विफल"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/cash/managed-parties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-parties"] });
      toast({ title: t("Party deleted", "पार्टी हटाई गई") });
    },
    onError: () => {
      toast({ title: t("Failed to delete party", "पार्टी हटाने में विफल"), variant: "destructive" });
    },
  });

  const startEdit = (party: Party) => {
    setEditingId(party.id);
    setFormData({
      name: party.name,
      contactNumber: party.contactNumber || "",
      address: party.address || "",
      pendingDues: party.pendingDues || "0",
    });
  };

  const handleSaveEdit = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">{t("Loading...", "लोड हो रहा है...")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">{t("Manage Parties", "पार्टी प्रबंधित करें")}</h3>
        <Button 
          size="sm" 
          onClick={() => setShowAddForm(true)} 
          disabled={showAddForm}
          data-testid="button-add-party"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("Add Party", "पार्टी जोड़ें")}
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("Name", "नाम")} *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("Party name", "पार्टी का नाम")}
                  data-testid="input-party-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Contact", "संपर्क")}</Label>
                <Input
                  value={formData.contactNumber}
                  onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                  placeholder={t("Contact number", "संपर्क नंबर")}
                  data-testid="input-party-contact"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("Address", "पता")}</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder={t("Address", "पता")}
                  data-testid="input-party-address"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Pending Dues", "बकाया राशि")}</Label>
                <Input
                  type="number"
                  value={formData.pendingDues}
                  onChange={(e) => setFormData({ ...formData, pendingDues: e.target.value })}
                  placeholder="0"
                  data-testid="input-party-pending-dues"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ name: "", contactNumber: "", address: "", pendingDues: "" });
                }}
              >
                <X className="h-4 w-4 mr-1" />
                {t("Cancel", "रद्द करें")}
              </Button>
              <Button 
                size="sm" 
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || createMutation.isPending}
                data-testid="button-save-party"
              >
                {createMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {t("Save", "सहेजें")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {parties.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("No parties added yet", "अभी तक कोई पार्टी नहीं जोड़ी गई")}
          </div>
        ) : (
          parties.map((party) => (
            <Card key={party.id} data-testid={`card-party-${party.id}`}>
              <CardContent className="p-3">
                {editingId === party.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={t("Name", "नाम")}
                      />
                      <Input
                        value={formData.contactNumber}
                        onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                        placeholder={t("Contact", "संपर्क")}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder={t("Address", "पता")}
                      />
                      <Input
                        type="number"
                        value={formData.pendingDues}
                        onChange={(e) => setFormData({ ...formData, pendingDues: e.target.value })}
                        placeholder={t("Pending Dues", "बकाया राशि")}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{party.name}</p>
                      {party.contactNumber && <p className="text-sm text-muted-foreground">{party.contactNumber}</p>}
                      {party.address && <p className="text-sm text-muted-foreground">{party.address}</p>}
                      {parseFloat(party.pendingDues || "0") > 0 && (
                        <p className="text-sm text-amber-600">{t("Pending", "बकाया")}: ₹{parseFloat(party.pendingDues || "0").toLocaleString()}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(party)} data-testid={`button-edit-party-${party.id}`}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => deleteMutation.mutate(party.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-party-${party.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

interface FarmersSectionProps {
  farmers: CashFarmer[];
  isLoading: boolean;
}

function FarmersSection({ farmers, isLoading }: FarmersSectionProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", contactNumber: "", address: "", pendingDueToBePaid: "" });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/cash/managed-farmers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-farmers"] });
      setShowAddForm(false);
      setFormData({ name: "", contactNumber: "", address: "", pendingDueToBePaid: "" });
      toast({ title: t("Farmer added", "किसान जोड़ा गया") });
    },
    onError: () => {
      toast({ title: t("Failed to add farmer", "किसान जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return apiRequest("PATCH", `/api/cash/managed-farmers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-farmers"] });
      setEditingId(null);
      toast({ title: t("Farmer updated", "किसान अपडेट किया गया") });
    },
    onError: () => {
      toast({ title: t("Failed to update farmer", "किसान अपडेट करने में विफल"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/cash/managed-farmers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-farmers"] });
      toast({ title: t("Farmer deleted", "किसान हटाया गया") });
    },
    onError: () => {
      toast({ title: t("Failed to delete farmer", "किसान हटाने में विफल"), variant: "destructive" });
    },
  });

  const startEdit = (farmer: CashFarmer) => {
    setEditingId(farmer.id);
    setFormData({
      name: farmer.name,
      contactNumber: farmer.contactNumber || "",
      address: farmer.address || "",
      pendingDueToBePaid: farmer.pendingDueToBePaid || "0",
    });
  };

  const handleSaveEdit = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">{t("Loading...", "लोड हो रहा है...")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">{t("Manage Farmers", "किसान प्रबंधित करें")}</h3>
        <Button 
          size="sm" 
          onClick={() => setShowAddForm(true)} 
          disabled={showAddForm}
          data-testid="button-add-farmer"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("Add Farmer", "किसान जोड़ें")}
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("Name", "नाम")} *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("Farmer name", "किसान का नाम")}
                  data-testid="input-farmer-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Contact", "संपर्क")}</Label>
                <Input
                  value={formData.contactNumber}
                  onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                  placeholder={t("Contact number", "संपर्क नंबर")}
                  data-testid="input-farmer-contact"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("Address", "पता")}</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder={t("Address", "पता")}
                  data-testid="input-farmer-address"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Due to be Paid", "भुगतान करना है")}</Label>
                <Input
                  type="number"
                  value={formData.pendingDueToBePaid}
                  onChange={(e) => setFormData({ ...formData, pendingDueToBePaid: e.target.value })}
                  placeholder="0"
                  data-testid="input-farmer-pending-due"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ name: "", contactNumber: "", address: "", pendingDueToBePaid: "" });
                }}
              >
                <X className="h-4 w-4 mr-1" />
                {t("Cancel", "रद्द करें")}
              </Button>
              <Button 
                size="sm" 
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || createMutation.isPending}
                data-testid="button-save-farmer"
              >
                {createMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {t("Save", "सहेजें")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {farmers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("No farmers added yet", "अभी तक कोई किसान नहीं जोड़ा गया")}
          </div>
        ) : (
          farmers.map((farmer) => (
            <Card key={farmer.id} data-testid={`card-farmer-${farmer.id}`}>
              <CardContent className="p-3">
                {editingId === farmer.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={t("Name", "नाम")}
                      />
                      <Input
                        value={formData.contactNumber}
                        onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                        placeholder={t("Contact", "संपर्क")}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder={t("Address", "पता")}
                      />
                      <Input
                        type="number"
                        value={formData.pendingDueToBePaid}
                        onChange={(e) => setFormData({ ...formData, pendingDueToBePaid: e.target.value })}
                        placeholder={t("Due to be Paid", "भुगतान करना है")}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{farmer.name}</p>
                      {farmer.contactNumber && <p className="text-sm text-muted-foreground">{farmer.contactNumber}</p>}
                      {farmer.address && <p className="text-sm text-muted-foreground">{farmer.address}</p>}
                      {parseFloat(farmer.pendingDueToBePaid || "0") > 0 && (
                        <p className="text-sm text-red-600">{t("Due to Pay", "भुगतान करना है")}: ₹{parseFloat(farmer.pendingDueToBePaid || "0").toLocaleString()}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(farmer)} data-testid={`button-edit-farmer-${farmer.id}`}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => deleteMutation.mutate(farmer.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-farmer-${farmer.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

interface BankAccountsSectionProps {
  bankAccounts: BankAccount[];
  isLoading: boolean;
}

function BankAccountsSection({ bankAccounts, isLoading }: BankAccountsSectionProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", accountType: "current" as string, openingBalance: "" });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/bank-accounts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      setShowAddForm(false);
      setFormData({ name: "", accountType: "current", openingBalance: "" });
      toast({ title: t("Bank account added", "बैंक खाता जोड़ा गया") });
    },
    onError: () => {
      toast({ title: t("Failed to add bank account", "बैंक खाता जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return apiRequest("PATCH", `/api/bank-accounts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      setEditingId(null);
      toast({ title: t("Bank account updated", "बैंक खाता अपडेट किया गया") });
    },
    onError: () => {
      toast({ title: t("Failed to update bank account", "बैंक खाता अपडेट करने में विफल"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/bank-accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      toast({ title: t("Bank account deleted", "बैंक खाता हटाया गया") });
    },
    onError: () => {
      toast({ title: t("Failed to delete bank account", "बैंक खाता हटाने में विफल"), variant: "destructive" });
    },
  });

  const startEdit = (account: BankAccount) => {
    setEditingId(account.id);
    setFormData({
      name: account.name,
      accountType: account.accountType,
      openingBalance: account.openingBalance || "0",
    });
  };

  const handleSaveEdit = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    }
  };

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case "current": return t("Current", "चालू");
      case "savings": return t("Savings", "बचत");
      case "limit": return t("Limit", "लिमिट");
      default: return type;
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">{t("Loading...", "लोड हो रहा है...")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">{t("Bank Accounts", "बैंक खाते")}</h3>
        <Button 
          size="sm" 
          onClick={() => setShowAddForm(true)} 
          disabled={showAddForm}
          data-testid="button-add-bank-account"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("Add Account", "खाता जोड़ें")}
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("Account Name", "खाते का नाम")} *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("e.g., SBI Main Account", "जैसे, एसबीआई मुख्य खाता")}
                  data-testid="input-bank-account-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Account Type", "खाता प्रकार")} *</Label>
                <Select
                  value={formData.accountType}
                  onValueChange={(value) => setFormData({ ...formData, accountType: value })}
                >
                  <SelectTrigger data-testid="select-account-type">
                    <SelectValue placeholder={t("Select type", "प्रकार चुनें")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">{t("Current", "चालू")}</SelectItem>
                    <SelectItem value="savings">{t("Savings", "बचत")}</SelectItem>
                    <SelectItem value="limit">{t("Limit", "लिमिट")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("Opening Balance", "प्रारंभिक शेष")}</Label>
              <Input
                type="number"
                value={formData.openingBalance}
                onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                placeholder="0"
                data-testid="input-bank-opening-balance"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ name: "", accountType: "current", openingBalance: "" });
                }}
              >
                <X className="h-4 w-4 mr-1" />
                {t("Cancel", "रद्द करें")}
              </Button>
              <Button 
                size="sm" 
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || !formData.accountType || createMutation.isPending}
                data-testid="button-save-bank-account"
              >
                {createMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {t("Save", "सहेजें")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {bankAccounts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("No bank accounts added yet", "अभी तक कोई बैंक खाता नहीं जोड़ा गया")}
          </div>
        ) : (
          bankAccounts.map((account) => (
            <Card key={account.id} data-testid={`card-bank-account-${account.id}`}>
              <CardContent className="p-3">
                {editingId === account.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={t("Account Name", "खाते का नाम")}
                      />
                      <Select
                        value={formData.accountType}
                        onValueChange={(value) => setFormData({ ...formData, accountType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">{t("Current", "चालू")}</SelectItem>
                          <SelectItem value="savings">{t("Savings", "बचत")}</SelectItem>
                          <SelectItem value="limit">{t("Limit", "लिमिट")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      type="number"
                      value={formData.openingBalance}
                      onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                      placeholder={t("Opening Balance", "प्रारंभिक शेष")}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{account.name}</p>
                        <span className="text-xs px-2 py-0.5 bg-muted rounded-full">
                          {getAccountTypeLabel(account.accountType)}
                        </span>
                      </div>
                      {parseFloat(account.openingBalance || "0") !== 0 && (
                        <p className="text-sm text-muted-foreground">
                          {t("Opening", "प्रारंभिक")}: ₹{parseFloat(account.openingBalance || "0").toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(account)} data-testid={`button-edit-bank-account-${account.id}`}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => deleteMutation.mutate(account.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-bank-account-${account.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
