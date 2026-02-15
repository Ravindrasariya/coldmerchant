import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/hooks/use-language";
import { Plus, Trash2, Edit2, Save, X, Wallet, Users, Tractor, Building2, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Party, CashFarmer, CashSettings, BankAccount } from "@shared/schema";
import { DISTRICTS, STATES } from "@shared/schema";

interface CashSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CashSettingsDialog({ open, onOpenChange }: CashSettingsDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("opening");
  
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Cash Management Settings", "नकद प्रबंधन सेटिंग्स")}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="opening" className="flex items-center gap-2" data-testid="tab-opening-balance">
                <Wallet className="h-4 w-4" />
                {t("Opening Balances", "प्रारंभिक शेष")}
              </TabsTrigger>
              <TabsTrigger value="parties" className="flex items-center gap-2" data-testid="tab-parties">
                <Users className="h-4 w-4" />
                {t("Buyers", "खरीदार")}
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
                isLoading={settingsLoading || bankAccountsLoading}
                bankAccounts={bankAccounts}
              />
            </TabsContent>

            <TabsContent value="parties" className="mt-4">
              <PartiesSection parties={parties} isLoading={partiesLoading} />
            </TabsContent>

            <TabsContent value="farmers" className="mt-4">
              <FarmersSection farmers={farmers} isLoading={farmersLoading} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface OpeningBalanceSectionProps {
  settings?: CashSettings;
  financialYear: string;
  isLoading: boolean;
  bankAccounts: BankAccount[];
}

function OpeningBalanceSection({ settings, financialYear, isLoading, bankAccounts }: OpeningBalanceSectionProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [cashInHand, setCashInHand] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [accountForm, setAccountForm] = useState({ name: "", accountType: "current" as string, openingBalance: "" });

  useEffect(() => {
    if (settings) {
      setCashInHand(settings.openingCashInHand || "0");
    }
  }, [settings]);

  const saveCashMutation = useMutation({
    mutationFn: async (data: { financialYear: string; openingCashInHand: string; openingCashInAccount: string }) => {
      return apiRequest("POST", "/api/cash/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/settings", financialYear] });
      toast({ title: t("Cash in hand saved", "हाथ में नकद सहेजा गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to save", "सहेजने में विफल"), variant: "destructive" });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async (data: typeof accountForm) => {
      return apiRequest("POST", "/api/bank-accounts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      setShowAddAccount(false);
      setAccountForm({ name: "", accountType: "current", openingBalance: "" });
      toast({ title: t("Bank account added", "बैंक खाता जोड़ा गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to add bank account", "बैंक खाता जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof accountForm }) => {
      return apiRequest("PATCH", `/api/bank-accounts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      setEditingId(null);
      toast({ title: t("Bank account updated", "बैंक खाता अपडेट किया गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to update bank account", "बैंक खाता अपडेट करने में विफल"), variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/bank-accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      toast({ title: t("Bank account deleted", "बैंक खाता हटाया गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to delete bank account", "बैंक खाता हटाने में विफल"), variant: "destructive" });
    },
  });

  const handleSaveCash = () => {
    saveCashMutation.mutate({
      financialYear,
      openingCashInHand: cashInHand,
      openingCashInAccount: settings?.openingCashInAccount || "0",
    });
  };

  const startEditAccount = (account: BankAccount) => {
    setEditingId(account.id);
    setAccountForm({
      name: account.name,
      accountType: account.accountType,
      openingBalance: account.openingBalance || "0",
    });
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("Financial Year", "वित्तीय वर्ष")}: {financialYear}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="cash-in-hand" className="text-sm">{t("Opening Cash in Hand", "प्रारंभिक नकद")}</Label>
              <Input
                id="cash-in-hand"
                type="number"
                step="any"
                value={cashInHand}
                onChange={(e) => setCashInHand(e.target.value)}
                placeholder="0"
                data-testid="input-opening-cash-in-hand"
              />
            </div>
            <Button 
              onClick={handleSaveCash} 
              disabled={saveCashMutation.isPending}
              size="sm"
              className="mt-6"
              data-testid="button-save-opening-balance"
            >
              {saveCashMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t("Bank Accounts", "बैंक खाते")}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {bankAccounts.length > 0 && (
            <div className="space-y-2">
              {bankAccounts.map((account) => (
                <div key={account.id} className="p-2 border rounded-md" data-testid={`row-bank-account-${account.id}`}>
                  {editingId === account.id ? (
                    <div className="space-y-2">
                      <Input
                        value={accountForm.name}
                        onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                        placeholder={t("Account Name", "खाते का नाम")}
                        data-testid={`input-edit-account-name-${account.id}`}
                      />
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Select
                          value={accountForm.accountType}
                          onValueChange={(value) => setAccountForm({ ...accountForm, accountType: value })}
                        >
                          <SelectTrigger className="w-full sm:w-32" data-testid={`select-edit-account-type-${account.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="current">{t("Current", "चालू")}</SelectItem>
                            <SelectItem value="savings">{t("Savings", "बचत")}</SelectItem>
                            <SelectItem value="limit">{t("Limit", "लिमिट")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="any"
                          value={accountForm.openingBalance}
                          onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })}
                          placeholder={t("Opening Balance", "प्रारंभिक शेष")}
                          className="w-full sm:flex-1"
                          data-testid={`input-edit-account-balance-${account.id}`}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          data-testid={`button-cancel-edit-${account.id}`}
                        >
                          <X className="h-4 w-4 mr-1" />
                          {t("Cancel", "रद्द करें")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => updateAccountMutation.mutate({ id: account.id, data: accountForm })}
                          disabled={updateAccountMutation.isPending}
                          data-testid={`button-save-account-${account.id}`}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          {t("Save", "सहेजें")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex-1 min-w-0 font-medium text-sm truncate" data-testid={`text-account-name-${account.id}`}>{account.name}</span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-account-type-${account.id}`}>{getAccountTypeLabel(account.accountType)}</span>
                      <span className="text-sm font-medium" data-testid={`text-account-balance-${account.id}`}>₹{parseFloat(account.openingBalance || "0").toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEditAccount(account)}
                        data-testid={`button-edit-account-${account.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => deleteAccountMutation.mutate(account.id)}
                        disabled={deleteAccountMutation.isPending}
                        data-testid={`button-delete-account-${account.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAddAccount ? (
            <div className="p-2 border border-dashed rounded-md bg-muted/50 space-y-2">
              <Input
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder={t("Account Name", "खाते का नाम")}
                data-testid="input-new-account-name"
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={accountForm.accountType}
                  onValueChange={(value) => setAccountForm({ ...accountForm, accountType: value })}
                >
                  <SelectTrigger className="w-full sm:w-32" data-testid="select-new-account-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">{t("Current", "चालू")}</SelectItem>
                    <SelectItem value="savings">{t("Savings", "बचत")}</SelectItem>
                    <SelectItem value="limit">{t("Limit", "लिमिट")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="any"
                  value={accountForm.openingBalance}
                  onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })}
                  placeholder={t("Opening Balance", "प्रारंभिक शेष")}
                  className="w-full sm:flex-1"
                  data-testid="input-new-account-balance"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddAccount(false);
                    setAccountForm({ name: "", accountType: "current", openingBalance: "" });
                  }}
                  data-testid="button-cancel-new-account"
                >
                  <X className="h-4 w-4 mr-1" />
                  {t("Cancel", "रद्द करें")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => createAccountMutation.mutate(accountForm)}
                  disabled={!accountForm.name || createAccountMutation.isPending}
                  data-testid="button-save-new-account"
                >
                  {createAccountMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  {t("Save", "सहेजें")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowAddAccount(true)}
              data-testid="button-add-bank-account"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("Add Account", "खाता जोड़ें")}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface PartiesSectionProps {
  parties: Party[];
  isLoading: boolean;
}

interface LedgerBuyer {
  id: number;
  name: string;
  address: string | null;
  contact: string | null;
}

function PartiesSection({ parties, isLoading }: PartiesSectionProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", contactNumber: "", address: "", pendingDues: "" });
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch buyers from Buyer Ledger for autocomplete suggestions
  const { data: ledgerBuyers = [] } = useQuery<LedgerBuyer[]>({
    queryKey: ["/api/buyers"],
  });

  // Filter suggestions based on input (case-insensitive)
  const filteredSuggestions = ledgerBuyers.filter(buyer => {
    if (!formData.name.trim()) return false;
    const searchTerm = formData.name.trim().toLowerCase();
    return buyer.name.toLowerCase().includes(searchTerm);
  }).slice(0, 8); // Limit to 8 suggestions

  // Check if buyer name already exists in managed parties
  const existingPartyNames = parties.map(p => p.name.toLowerCase());

  const handleSelectSuggestion = (buyer: LedgerBuyer) => {
    setFormData({
      ...formData,
      name: buyer.name,
      contactNumber: buyer.contact || "",
      address: buyer.address || "",
    });
    setShowSuggestions(false);
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/cash/managed-parties", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-parties"] });
      setShowAddForm(false);
      setFormData({ name: "", contactNumber: "", address: "", pendingDues: "" });
      toast({ title: t("Buyer added", "खरीदार जोड़ा गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to add buyer", "खरीदार जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return apiRequest("PATCH", `/api/cash/managed-parties/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-parties"] });
      setEditingId(null);
      toast({ title: t("Buyer updated", "खरीदार अपडेट किया गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to update buyer", "खरीदार अपडेट करने में विफल"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/cash/managed-parties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-parties"] });
      toast({ title: t("Buyer deleted", "खरीदार हटाया गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to delete buyer", "खरीदार हटाने में विफल"), variant: "destructive" });
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
        <h3 className="font-medium">{t("Manage Buyers", "खरीदार प्रबंधित करें")}</h3>
        <Button 
          size="sm" 
          onClick={() => setShowAddForm(true)} 
          disabled={showAddForm}
          data-testid="button-add-party"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("Add Buyer", "खरीदार जोड़ें")}
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 relative">
                <Label className="text-xs">{t("Name", "नाम")} *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder={t("Buyer name", "खरीदार का नाम")}
                  data-testid="input-party-name"
                  autoComplete="off"
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredSuggestions.map((buyer) => {
                      const isAlreadyAdded = existingPartyNames.includes(buyer.name.toLowerCase());
                      return (
                        <div
                          key={buyer.id}
                          data-testid={`suggestion-buyer-${buyer.id}`}
                          className={`px-3 py-2 cursor-pointer hover-elevate text-sm ${isAlreadyAdded ? 'opacity-50' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (!isAlreadyAdded) {
                              handleSelectSuggestion(buyer);
                            }
                          }}
                        >
                          <div className="font-medium">{buyer.name}</div>
                          {buyer.address && (
                            <div className="text-xs text-muted-foreground">{buyer.address}</div>
                          )}
                          {isAlreadyAdded && (
                            <div className="text-xs text-muted-foreground italic">{t("Already added", "पहले से जोड़ा गया")}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Contact", "संपर्क")}</Label>
                <Input
                  type="tel"
                  maxLength={10}
                  value={formData.contactNumber}
                  onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  placeholder={t("Contact number", "संपर्क नंबर")}
                  data-testid="input-party-contact"
                />
                {formData.contactNumber && formData.contactNumber.length > 0 && formData.contactNumber.length < 10 && (
                  <p className="text-xs text-destructive mt-1" data-testid="warning-party-contact-invalid">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
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
                  step="any"
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
            {t("No buyers added yet", "अभी तक कोई खरीदार नहीं जोड़ा गया")}
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
                        step="any"
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
                        <p className="text-sm text-amber-600">{t("Pending", "बकाया")}: ₹{parseFloat(party.pendingDues || "0").toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
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

interface FarmerSuggestion {
  id: number;
  name: string;
  contact: string;
  village: string;
  tehsil: string;
  district: string;
  state: string;
}

function FarmersSection({ farmers, isLoading }: FarmersSectionProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const emptyFormData = { name: "", contactNumber: "", village: "", tehsil: "", district: "", state: "", pendingDueToBePaid: "", rateOfInterest: "", effectiveDate: new Date().toISOString().split('T')[0] };
  const [formData, setFormData] = useState(emptyFormData);
  const [activeField, setActiveField] = useState<'name' | 'contact' | 'village' | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data: farmerSuggestions = [] } = useQuery<FarmerSuggestion[]>({
    queryKey: ["/api/farmers/suggestions"],
  });

  const getFilteredSuggestions = (field: 'name' | 'contact' | 'village', value: string) => {
    if (!value || value.length < 1) return [];
    const searchTerm = value.toLowerCase();
    const fieldMap = { name: 'name', contact: 'contact', village: 'village' } as const;
    return farmerSuggestions.filter(farmer => {
      const fieldValue = farmer[fieldMap[field]];
      return fieldValue?.toLowerCase().includes(searchTerm);
    }).slice(0, 8);
  };

  const handleSelectFarmer = (farmer: FarmerSuggestion) => {
    setFormData({
      ...formData,
      name: farmer.name,
      contactNumber: farmer.contact,
      village: farmer.village,
      tehsil: farmer.tehsil,
      district: farmer.district,
      state: farmer.state,
    });
    setShowSuggestions(false);
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/cash/managed-farmers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/managed-farmers"] });
      setShowAddForm(false);
      setFormData(emptyFormData);
      toast({ title: t("Farmer added", "किसान जोड़ा गया"), variant: "success" });
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
      toast({ title: t("Farmer updated", "किसान अपडेट किया गया"), variant: "success" });
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
      toast({ title: t("Farmer deleted", "किसान हटाया गया"), variant: "success" });
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
      village: farmer.village || "",
      tehsil: farmer.tehsil || "",
      district: farmer.district || "",
      state: farmer.state || "",
      pendingDueToBePaid: farmer.pendingDueToBePaid || "0",
      rateOfInterest: farmer.rateOfInterest || "0",
      effectiveDate: farmer.effectiveDate || new Date().toISOString().split('T')[0],
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
              <div className="space-y-1 relative">
                <Label className="text-xs">{t("Name", "नाम")} *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    setActiveField('name');
                    setShowSuggestions(true);
                  }}
                  onFocus={() => {
                    setActiveField('name');
                    setShowSuggestions(true);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder={t("Farmer name", "किसान का नाम")}
                  autoComplete="off"
                  data-testid="input-farmer-name"
                />
                {showSuggestions && activeField === 'name' && getFilteredSuggestions('name', formData.name).length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {getFilteredSuggestions('name', formData.name).map((farmer, index) => (
                      <div
                        key={farmer.id}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFarmer(farmer);
                        }}
                        data-testid={`suggestion-farmer-name-${index}`}
                      >
                        <div className="font-medium text-sm">{farmer.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {farmer.contact && <span>{farmer.contact}</span>}
                          {farmer.contact && farmer.village && <span> | </span>}
                          {farmer.village && <span>{farmer.village}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1 relative">
                <Label className="text-xs">{t("Contact", "संपर्क")} *</Label>
                <Input
                  type="tel"
                  maxLength={10}
                  value={formData.contactNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setFormData({ ...formData, contactNumber: val });
                    setActiveField('contact');
                    setShowSuggestions(true);
                  }}
                  onFocus={() => {
                    setActiveField('contact');
                    setShowSuggestions(true);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder={t("Contact number", "संपर्क नंबर")}
                  autoComplete="off"
                  data-testid="input-farmer-contact"
                />
                {showSuggestions && activeField === 'contact' && getFilteredSuggestions('contact', formData.contactNumber).length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {getFilteredSuggestions('contact', formData.contactNumber).map((farmer, index) => (
                      <div
                        key={farmer.id}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFarmer(farmer);
                        }}
                        data-testid={`suggestion-farmer-contact-${index}`}
                      >
                        <div className="font-medium text-sm">{farmer.contact}</div>
                        <div className="text-xs text-muted-foreground">
                          {farmer.name}
                          {farmer.village && <span> | {farmer.village}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {formData.contactNumber && formData.contactNumber.length > 0 && formData.contactNumber.length < 10 && (
                  <p className="text-xs text-destructive mt-1" data-testid="warning-farmer-party-contact-invalid">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 relative">
                <Label className="text-xs">{t("Village", "गाँव")} *</Label>
                <Input
                  value={formData.village}
                  onChange={(e) => {
                    setFormData({ ...formData, village: e.target.value });
                    setActiveField('village');
                    setShowSuggestions(true);
                  }}
                  onFocus={() => {
                    setActiveField('village');
                    setShowSuggestions(true);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder={t("Village", "गाँव")}
                  autoComplete="off"
                  data-testid="input-farmer-village"
                />
                {showSuggestions && activeField === 'village' && getFilteredSuggestions('village', formData.village).length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {getFilteredSuggestions('village', formData.village).map((farmer, index) => (
                      <div
                        key={farmer.id}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFarmer(farmer);
                        }}
                        data-testid={`suggestion-farmer-village-${index}`}
                      >
                        <div className="font-medium text-sm">{farmer.village}</div>
                        <div className="text-xs text-muted-foreground">
                          {farmer.name}
                          {farmer.contact && <span> | {farmer.contact}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Tehsil", "तहसील")} *</Label>
                <Input
                  value={formData.tehsil}
                  onChange={(e) => setFormData({ ...formData, tehsil: e.target.value })}
                  placeholder={t("Tehsil", "तहसील")}
                  data-testid="input-farmer-tehsil"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("District", "ज़िला")} *</Label>
                <Select
                  value={formData.district}
                  onValueChange={(value) => setFormData({ ...formData, district: value })}
                >
                  <SelectTrigger data-testid="select-farmer-district">
                    <SelectValue placeholder={t("Select district", "ज़िला चुनें")} />
                  </SelectTrigger>
                  <SelectContent>
                    {DISTRICTS.map((district) => (
                      <SelectItem key={district} value={district}>{district}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("State", "राज्य")} *</Label>
                <Select
                  value={formData.state}
                  onValueChange={(value) => setFormData({ ...formData, state: value })}
                >
                  <SelectTrigger data-testid="select-farmer-state">
                    <SelectValue placeholder={t("Select state", "राज्य चुनें")} />
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.map((state) => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator className="my-2" />
            <p className="text-xs font-medium text-muted-foreground">{t("Receivable Details", "प्राप्य विवरण")}</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("Due Amount (₹)", "देय राशि (₹)")}</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.pendingDueToBePaid}
                  onChange={(e) => setFormData({ ...formData, pendingDueToBePaid: e.target.value })}
                  placeholder="0"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  data-testid="input-farmer-pending-due"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Rate of Interest (%)", "ब्याज दर (%)")}</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.rateOfInterest}
                  onChange={(e) => setFormData({ ...formData, rateOfInterest: e.target.value })}
                  placeholder="0"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  data-testid="input-farmer-roi"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Effective Date", "प्रभावी तिथि")}</Label>
                <Input
                  type="date"
                  value={formData.effectiveDate}
                  onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
                  data-testid="input-farmer-effective-date"
                />
              </div>
            </div>
            {parseFloat(formData.pendingDueToBePaid || "0") > 0 && parseFloat(formData.rateOfInterest || "0") > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Compound interest will be calculated annually from the effective date", "प्रभावी तिथि से वार्षिक चक्रवृद्धि ब्याज की गणना की जाएगी")}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setShowAddForm(false);
                  setFormData(emptyFormData);
                }}
              >
                <X className="h-4 w-4 mr-1" />
                {t("Cancel", "रद्द करें")}
              </Button>
              <Button 
                size="sm" 
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || !formData.contactNumber || !/^\d{10}$/.test(formData.contactNumber) || !formData.village || !formData.tehsil || !formData.district || !formData.state || createMutation.isPending}
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
                        value={formData.village}
                        onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                        placeholder={t("Village", "गाँव")}
                      />
                      <Input
                        value={formData.tehsil}
                        onChange={(e) => setFormData({ ...formData, tehsil: e.target.value })}
                        placeholder={t("Tehsil", "तहसील")}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Select
                        value={formData.district}
                        onValueChange={(value) => setFormData({ ...formData, district: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("Select district", "ज़िला चुनें")} />
                        </SelectTrigger>
                        <SelectContent>
                          {DISTRICTS.map((district) => (
                            <SelectItem key={district} value={district}>{district}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={formData.state}
                        onValueChange={(value) => setFormData({ ...formData, state: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("Select state", "राज्य चुनें")} />
                        </SelectTrigger>
                        <SelectContent>
                          {STATES.map((state) => (
                            <SelectItem key={state} value={state}>{state}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Separator className="my-1" />
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("Due Amount", "देय राशि")}</Label>
                        <Input
                          type="number"
                          step="any"
                          value={formData.pendingDueToBePaid}
                          onChange={(e) => setFormData({ ...formData, pendingDueToBePaid: e.target.value })}
                          placeholder="0"
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("ROI %", "ब्याज %")}</Label>
                        <Input
                          type="number"
                          step="any"
                          value={formData.rateOfInterest}
                          onChange={(e) => setFormData({ ...formData, rateOfInterest: e.target.value })}
                          placeholder="0"
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("Eff. Date", "प्रभावी तिथि")}</Label>
                        <Input
                          type="date"
                          value={formData.effectiveDate}
                          onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
                        />
                      </div>
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
                      {(farmer.village || farmer.tehsil || farmer.district || farmer.state) && (
                        <p className="text-sm text-muted-foreground">
                          {[farmer.village, farmer.tehsil, farmer.district, farmer.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                      {parseFloat(farmer.pendingDueToBePaid || "0") > 0 && (
                        <div className="text-sm">
                          <span className="text-red-600">
                            {t("Due", "देय")}: ₹{parseFloat(farmer.pendingDueToBePaid || "0").toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                          </span>
                          {parseFloat(farmer.rateOfInterest || "0") > 0 && (
                            <span className="text-muted-foreground ml-2">
                              @ {farmer.rateOfInterest}% {t("from", "से")} {farmer.effectiveDate || "-"}
                            </span>
                          )}
                        </div>
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

