import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Calculator, ChevronDown, ChevronUp, Building2 } from "lucide-react";
import { ASSET_CATEGORIES, ASSET_DEPRECIATION_RATES } from "@shared/schema";

interface AssetRegisterProps {
  financialYear: string;
}

const CATEGORY_LABELS: Record<string, [string, string]> = {
  vehicle: ["Vehicle", "वाहन"],
  building: ["Building", "भवन"],
  equipment: ["Equipment", "उपकरण"],
  furniture: ["Furniture", "फर्नीचर"],
  computer: ["Computer", "कंप्यूटर"],
  other: ["Other", "अन्य"],
};

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AssetRegister({ financialYear }: AssetRegisterProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", category: "other", purchaseDate: "", purchaseCost: "", salvageValue: "0", usefulLifeYears: "", remarks: "" });

  const { data: assets = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/assets"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/assets", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); setDialogOpen(false); toast({ title: t("Asset added", "संपत्ति जोड़ी गई") }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/assets/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); setDialogOpen(false); setEditingAsset(null); toast({ title: t("Asset updated", "संपत्ति अपडेट हुई") }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/assets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); setDeleteId(null); toast({ title: t("Asset deleted", "संपत्ति हटाई गई") }); },
  });

  const depreciateMutation = useMutation({
    mutationFn: ({ id, fy }: { id: number; fy: string }) => apiRequest("POST", `/api/assets/${id}/depreciate`, { financialYear: fy }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); toast({ title: t("Depreciation calculated", "मूल्यह्रास गणना पूरी") }); },
    onError: (err: any) => { toast({ title: t("Error", "त्रुटि"), description: err.message || t("Failed to calculate depreciation", "मूल्यह्रास गणना विफल"), variant: "destructive" }); },
  });

  const openAdd = () => {
    setEditingAsset(null);
    setForm({ name: "", category: "other", purchaseDate: "", purchaseCost: "", salvageValue: "0", usefulLifeYears: "", remarks: "" });
    setDialogOpen(true);
  };

  const openEdit = (asset: any) => {
    setEditingAsset(asset);
    setForm({
      name: asset.name,
      category: asset.category,
      purchaseDate: asset.purchaseDate,
      purchaseCost: asset.purchaseCost,
      salvageValue: asset.salvageValue || "0",
      usefulLifeYears: asset.usefulLifeYears?.toString() || "",
      remarks: asset.remarks || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.purchaseDate || !form.purchaseCost) {
      toast({ title: t("Please fill required fields", "कृपया आवश्यक फ़ील्ड भरें"), variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name,
      category: form.category,
      purchaseDate: form.purchaseDate,
      purchaseCost: form.purchaseCost,
      salvageValue: form.salvageValue || "0",
      usefulLifeYears: form.usefulLifeYears ? parseInt(form.usefulLifeYears) : null,
      remarks: form.remarks || null,
    };
    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="asset-register">
      <div className="flex justify-end">
        <Button onClick={openAdd} data-testid="button-add-asset">
          <Plus className="h-4 w-4 mr-1" />
          {t("Add Asset", "संपत्ति जोड़ें")}
        </Button>
      </div>

      {assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>{t("No assets recorded yet", "अभी तक कोई संपत्ति दर्ज नहीं है")}</p>
            <p className="text-sm mt-1">{t("Add vehicles, buildings, equipment etc.", "वाहन, भवन, उपकरण आदि जोड़ें")}</p>
          </CardContent>
        </Card>
      ) : (
        assets.map((asset: any) => {
          const catLabel = CATEGORY_LABELS[asset.category] || ["Other", "अन्य"];
          const isExpanded = expandedId === asset.id;
          const depRate = ASSET_DEPRECIATION_RATES[asset.category] || 10;
          return (
            <Card key={asset.id} data-testid={`card-asset-${asset.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg" data-testid={`text-asset-name-${asset.id}`}>{asset.name}</CardTitle>
                    <Badge variant="secondary" data-testid={`badge-category-${asset.id}`}>{t(catLabel[0], catLabel[1])}</Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(asset)} data-testid={`button-edit-asset-${asset.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(asset.id)} data-testid={`button-delete-asset-${asset.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t("Purchase Date", "खरीद तिथि")}</span>
                    <p className="font-medium" data-testid={`text-purchase-date-${asset.id}`}>{asset.purchaseDate}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("Purchase Cost", "खरीद मूल्य")}</span>
                    <p className="font-medium" data-testid={`text-purchase-cost-${asset.id}`}>₹{fmt(parseFloat(asset.purchaseCost))}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("Total Depreciation", "कुल मूल्यह्रास")}</span>
                    <p className="font-medium text-orange-600" data-testid={`text-depreciation-${asset.id}`}>₹{fmt(asset.totalDepreciation)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("Book Value", "पुस्तक मूल्य")}</span>
                    <p className="font-semibold text-primary" data-testid={`text-book-value-${asset.id}`}>₹{fmt(asset.currentBookValue)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => depreciateMutation.mutate({ id: asset.id, fy: financialYear })}
                    disabled={depreciateMutation.isPending}
                    data-testid={`button-depreciate-${asset.id}`}
                  >
                    <Calculator className="h-3.5 w-3.5 mr-1" />
                    {t(`Depreciate FY ${financialYear} (${depRate}%)`, `मूल्यह्रास वि.व. ${financialYear} (${depRate}%)`)}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                    data-testid={`button-toggle-history-${asset.id}`}
                  >
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                    {t("Depreciation History", "मूल्यह्रास इतिहास")}
                  </Button>
                </div>

                {isExpanded && asset.depreciationLogs && asset.depreciationLogs.length > 0 && (
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left">{t("FY", "वि.व.")}</th>
                          <th className="px-3 py-2 text-right">{t("Opening", "प्रारम्भिक")}</th>
                          <th className="px-3 py-2 text-right">{t("Rate", "दर")}</th>
                          <th className="px-3 py-2 text-right">{t("Depreciation", "मूल्यह्रास")}</th>
                          <th className="px-3 py-2 text-right">{t("Closing", "समापन")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asset.depreciationLogs.map((log: any) => (
                          <tr key={log.id} className="border-t" data-testid={`row-depreciation-${log.id}`}>
                            <td className="px-3 py-2">{log.financialYear}</td>
                            <td className="px-3 py-2 text-right">₹{fmt(parseFloat(log.openingValue))}</td>
                            <td className="px-3 py-2 text-right">{log.depreciationRate}%</td>
                            <td className="px-3 py-2 text-right text-orange-600">₹{fmt(parseFloat(log.depreciationAmount))}</td>
                            <td className="px-3 py-2 text-right font-medium">₹{fmt(parseFloat(log.closingValue))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {isExpanded && (!asset.depreciationLogs || asset.depreciationLogs.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-3">{t("No depreciation recorded yet", "अभी तक कोई मूल्यह्रास दर्ज नहीं है")}</p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAsset ? t("Edit Asset", "संपत्ति संपादित करें") : t("Add Asset", "संपत्ति जोड़ें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Name", "नाम")} *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-asset-name" />
            </div>
            <div>
              <Label>{t("Category", "श्रेणी")} *</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger data-testid="select-asset-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CATEGORIES.map(cat => {
                    const lbl = CATEGORY_LABELS[cat] || ["Other", "अन्य"];
                    return <SelectItem key={cat} value={cat}>{t(lbl[0], lbl[1])}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("Purchase Date", "खरीद तिथि")} *</Label>
              <Input type="date" value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} data-testid="input-purchase-date" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Purchase Cost (₹)", "खरीद मूल्य (₹)")} *</Label>
                <Input type="number" value={form.purchaseCost} onChange={e => setForm(f => ({ ...f, purchaseCost: e.target.value }))} data-testid="input-purchase-cost" />
              </div>
              <div>
                <Label>{t("Salvage Value (₹)", "अवशिष्ट मूल्य (₹)")}</Label>
                <Input type="number" value={form.salvageValue} onChange={e => setForm(f => ({ ...f, salvageValue: e.target.value }))} data-testid="input-salvage-value" />
              </div>
            </div>
            <div>
              <Label>{t("Useful Life (years)", "उपयोगी जीवन (वर्ष)")}</Label>
              <Input type="number" value={form.usefulLifeYears} onChange={e => setForm(f => ({ ...f, usefulLifeYears: e.target.value }))} data-testid="input-useful-life" />
            </div>
            <div>
              <Label>{t("Remarks", "टिप्पणी")}</Label>
              <Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} data-testid="input-asset-remarks" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-asset">{t("Cancel", "रद्द करें")}</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-asset">
              {editingAsset ? t("Update", "अपडेट करें") : t("Save", "सहेजें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Delete Asset?", "संपत्ति हटाएं?")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("This will permanently delete this asset and all its depreciation records.", "यह इस संपत्ति और उसके सभी मूल्यह्रास रिकॉर्ड को स्थायी रूप से हटा देगा।")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} data-testid="button-cancel-delete-asset">{t("Cancel", "रद्द करें")}</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending} data-testid="button-confirm-delete-asset">
              {t("Delete", "हटाएं")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
