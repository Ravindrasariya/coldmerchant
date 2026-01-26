import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft,
  Plus, 
  Save,
  Loader2,
  Users
} from "lucide-react";
import { type Buyer } from "@shared/schema";

interface BuyerRow {
  id?: number;
  buyerCode?: string;
  dateAdded: string;
  name: string;
  address: string;
  mandiCode: string;
  contact: string;
  negativeFlag: boolean;
  isActive: boolean;
  overallDue: number;
  isNew?: boolean;
  isEdited?: boolean;
}

function createEmptyRow(): BuyerRow {
  return {
    dateAdded: new Date().toISOString().split('T')[0],
    name: "",
    address: "",
    mandiCode: "",
    contact: "",
    negativeFlag: false,
    isActive: true,
    overallDue: 0,
    isNew: true,
    isEdited: false,
  };
}

function buyerToRow(b: Buyer): BuyerRow {
  return {
    id: b.id,
    buyerCode: b.buyerCode || undefined,
    dateAdded: b.dateAdded,
    name: b.name,
    address: b.address,
    mandiCode: b.mandiCode || "",
    contact: b.contact || "",
    negativeFlag: b.negativeFlag ?? false,
    isActive: b.isActive ?? true,
    overallDue: 0,
    isNew: false,
    isEdited: false,
  };
}

export default function BuyersPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [localRows, setLocalRows] = useState<BuyerRow[] | null>(null);

  const { data: buyers = [], isLoading, dataUpdatedAt } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (buyer: Partial<BuyerRow>) => {
      const response = await apiRequest("POST", "/api/buyers", {
        dateAdded: buyer.dateAdded,
        name: buyer.name,
        address: buyer.address,
        mandiCode: buyer.mandiCode || null,
        contact: buyer.contact || null,
        negativeFlag: buyer.negativeFlag,
        isActive: buyer.isActive,
      });
      return response.json();
    },
    onSuccess: () => {
      setLocalRows(null);
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<BuyerRow>) => {
      const response = await apiRequest("PATCH", `/api/buyers/${id}`, {
        dateAdded: data.dateAdded,
        name: data.name,
        address: data.address,
        mandiCode: data.mandiCode || null,
        contact: data.contact || null,
        negativeFlag: data.negativeFlag,
        isActive: data.isActive,
      });
      return response.json();
    },
    onSuccess: () => {
      setLocalRows(null);
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
    },
  });

  // Delete functionality removed - buyers cannot be deleted once added

  const displayRows = useMemo(() => {
    if (localRows !== null) {
      return localRows;
    }
    if (buyers.length > 0) {
      return buyers.map(buyerToRow);
    }
    return [createEmptyRow()];
  }, [localRows, buyers, dataUpdatedAt]);

  const hasChanges = localRows !== null;

  const handleRowChange = (index: number, field: keyof BuyerRow, value: any) => {
    const currentRows = localRows !== null ? [...localRows] : displayRows.map(r => ({ ...r }));
    currentRows[index] = { ...currentRows[index], [field]: value, isEdited: true };
    setLocalRows(currentRows);
  };

  const handleAddRow = () => {
    const currentRows = localRows !== null ? [...localRows] : displayRows.map(r => ({ ...r }));
    setLocalRows([...currentRows, createEmptyRow()]);
  };

  // Delete functionality removed - buyers cannot be deleted once added

  const handleSaveAll = async () => {
    const rowsToSave = displayRows;
    for (const row of rowsToSave) {
      if (!row.name || !row.address) continue;
      
      if (row.isNew) {
        await createMutation.mutateAsync(row);
      } else if (row.isEdited && row.id) {
        await updateMutation.mutateAsync({ id: row.id, ...row });
      }
    }
  };

  const handleCancelChanges = () => {
    setLocalRows(null);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

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
            <h1 className="text-lg font-semibold">{t("Buyers", "खरीदार")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("Buyer Management", "खरीदार प्रबंधन")}
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  onClick={handleCancelChanges}
                  variant="ghost"
                  size="sm"
                  data-testid="button-cancel-changes"
                >
                  {t("Cancel", "रद्द करें")}
                </Button>
              )}
              <Button
                onClick={handleAddRow}
                variant="outline"
                size="sm"
                data-testid="button-add-buyer"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Buyer", "खरीदार जोड़ें")}
              </Button>
              <Button
                onClick={handleSaveAll}
                disabled={!hasChanges || isSaving}
                size="sm"
                data-testid="button-save-all-buyers"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                {t("Save All", "सभी सहेजें")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="hidden md:grid md:grid-cols-9 gap-2 px-2 py-2 bg-muted/50 rounded-md font-medium text-sm">
                  <div>{t("Buyer ID", "खरीदार आईडी")}</div>
                  <div>{t("Date Added", "जोड़ने की तारीख")}</div>
                  <div>{t("Name", "नाम")} *</div>
                  <div>{t("Address", "पता")} *</div>
                  <div>{t("Mandi Code", "मंडी कोड")}</div>
                  <div>{t("Contact", "संपर्क")}</div>
                  <div>{t("Negative", "नकारात्मक")}</div>
                  <div>{t("Active", "सक्रिय")}</div>
                  <div>{t("Overall Due", "कुल बकाया")}</div>
                </div>
                
                {displayRows.map((row, index) => (
                  <div 
                    key={row.id || `new-${index}`} 
                    className="grid grid-cols-2 md:grid-cols-9 gap-2 p-3 border rounded-lg bg-card"
                    data-testid={`buyer-row-${index}`}
                  >
                    <div className="space-y-1">
                      <Label className="md:hidden text-xs text-muted-foreground">{t("Buyer ID", "खरीदार आईडी")}</Label>
                      <div className="h-9 flex items-center px-3 bg-muted/50 rounded-md text-xs font-mono text-muted-foreground" data-testid={`text-buyer-code-${index}`}>
                        {row.buyerCode || (row.isNew ? t("Auto", "स्वतः") : '-')}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="md:hidden text-xs text-muted-foreground">{t("Date Added", "जोड़ने की तारीख")}</Label>
                      <Input
                        type="date"
                        value={row.dateAdded}
                        onChange={(e) => handleRowChange(index, "dateAdded", e.target.value)}
                        className="h-9"
                        data-testid={`input-date-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="md:hidden text-xs text-muted-foreground">{t("Name", "नाम")} *</Label>
                      <Input
                        value={row.name}
                        onChange={(e) => handleRowChange(index, "name", e.target.value)}
                        placeholder={t("Name", "नाम")}
                        className={`h-9 ${!row.name && row.isEdited ? "border-destructive" : ""}`}
                        data-testid={`input-name-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="md:hidden text-xs text-muted-foreground">{t("Address", "पता")} *</Label>
                      <Input
                        value={row.address}
                        onChange={(e) => handleRowChange(index, "address", e.target.value)}
                        placeholder={t("Address", "पता")}
                        className={`h-9 ${!row.address && row.isEdited ? "border-destructive" : ""}`}
                        data-testid={`input-address-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="md:hidden text-xs text-muted-foreground">{t("Mandi Code", "मंडी कोड")}</Label>
                      <Input
                        value={row.mandiCode}
                        onChange={(e) => handleRowChange(index, "mandiCode", e.target.value)}
                        placeholder={t("Code", "कोड")}
                        className="h-9"
                        data-testid={`input-mandi-code-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="md:hidden text-xs text-muted-foreground">{t("Contact", "संपर्क")}</Label>
                      <Input
                        value={row.contact}
                        onChange={(e) => handleRowChange(index, "contact", e.target.value)}
                        placeholder={t("Phone", "फ़ोन")}
                        className="h-9"
                        data-testid={`input-contact-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="md:hidden text-xs text-muted-foreground">{t("Negative", "नकारात्मक")}</Label>
                      <Select
                        value={row.negativeFlag ? "yes" : "no"}
                        onValueChange={(v) => handleRowChange(index, "negativeFlag", v === "yes")}
                      >
                        <SelectTrigger className="h-9" data-testid={`select-negative-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">{t("No", "नहीं")}</SelectItem>
                          <SelectItem value="yes">{t("Yes", "हाँ")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 flex items-center">
                      <Label className="md:hidden text-xs text-muted-foreground mr-2">{t("Active", "सक्रिय")}</Label>
                      <Switch
                        checked={row.isActive}
                        onCheckedChange={(checked) => handleRowChange(index, "isActive", checked)}
                        data-testid={`switch-active-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="md:hidden text-xs text-muted-foreground">{t("Overall Due", "कुल बकाया")}</Label>
                      <div className="h-9 flex items-center px-3 bg-muted/50 rounded-md text-sm font-mono">
                        ₹{row.overallDue.toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
