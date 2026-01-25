import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Plus, Trash2, Package, History, ChevronDown, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SIZE_OPTIONS, CHARGE_TYPES } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

interface StockEntryWithLots {
  id: number;
  serialNumber: number;
  purchaseDate: string;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  paymentStatus: string;
  remarks: string | null;
  lots: Array<{
    id: number;
    place: string | null;
    coldStoreName: string | null;
    coldStoreLotNumber: string | null;
    crop: string | null;
    originalBags: number;
    remainingBags: number;
    potatoType: string | null;
    harvestPotatoType: string | null;
    bagType: string;
    quality: string;
    cutType: string;
    size: string | null;
    pricePerKg: string | null;
    charges: Array<{ type: string; amount: number }> | null;
    coldStoreChargesPerBag: string | null;
    expectedColdCharges: string | null;
    hammaliGradingCharges: string | null;
    adjustedAmount: string | null;
    adjustedAmountType: string | null;
    adjustedAmountRate: string | null;
    adjustedAmountEffectiveDate: string | null;
    adjustedAmountRemark: string | null;
    remarks: string | null;
    bagBreakdowns: Array<{
      id: number;
      size: string;
      numberOfBags: number;
      remainingBags: number | null;
      weight: string | null;
      pricePerKg: string | null;
      totalAmount: string | null;
    }>;
  }>;
}

interface StockEntryEditDialogProps {
  entry: StockEntryWithLots;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockEntryEditDialog({ entry, open, onOpenChange }: StockEntryEditDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [remarks, setRemarks] = useState(entry.remarks || "");
  const [lots, setLots] = useState(entry.lots.map(lot => ({
    ...lot,
    place: lot.place || "cold_store",
    coldStoreName: lot.coldStoreName || "",
    coldStoreLotNumber: lot.coldStoreLotNumber || "",
    crop: lot.crop || "potato",
    potatoType: lot.potatoType || "",
    harvestPotatoType: lot.harvestPotatoType || "",
    charges: lot.charges || [],
    coldStoreChargesPerBag: lot.coldStoreChargesPerBag !== null ? parseFloat(lot.coldStoreChargesPerBag) : null,
    expectedColdCharges: lot.expectedColdCharges !== null ? parseFloat(lot.expectedColdCharges) : null,
    hammaliGradingCharges: lot.hammaliGradingCharges !== null ? parseFloat(lot.hammaliGradingCharges) : null,
    adjustedAmount: lot.adjustedAmount !== null ? parseFloat(lot.adjustedAmount) : null,
    adjustedAmountType: lot.adjustedAmountType || null,
    adjustedAmountRate: lot.adjustedAmountRate !== null ? parseFloat(lot.adjustedAmountRate) : null,
    adjustedAmountEffectiveDate: lot.adjustedAmountEffectiveDate || null,
    adjustedAmountRemark: lot.adjustedAmountRemark || "",
    bagBreakdowns: lot.bagBreakdowns.map(bd => ({
      ...bd,
      remainingBags: bd.remainingBags ?? bd.numberOfBags,
      weight: bd.weight ? parseFloat(bd.weight) : 0,
      pricePerKg: bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0,
    }))
  })));
  const [deleteConfirm, setDeleteConfirm] = useState<{ lotIndex: number; bdIndex: number } | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Fetch edit history
  const { data: editHistory = [], isLoading: historyLoading } = useQuery<Array<{
    id: number;
    changedAt: string;
    userName?: string;
    changeSet: Array<{
      scope: string;
      entityId?: number;
      label: string;
      changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>;
    }>;
  }>>({
    queryKey: ['/api/stock-entries', entry.id, 'history'],
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { paymentStatus: string; remarks: string; lots: typeof lots }) => {
      const res = await apiRequest("PATCH", `/api/stock-entries/${entry.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t("Entry Updated", "एंट्री अपडेट हो गई"),
        description: t("The stock entry has been updated successfully.", "स्टॉक एंट्री सफलतापूर्वक अपडेट हो गई।"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-entries', entry.id, 'history'] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/cross-settlement-check"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const confirmDelete = () => {
    if (deleteConfirm) {
      handleRemoveBreakdown(deleteConfirm.lotIndex, deleteConfirm.bdIndex);
      setDeleteConfirm(null);
    }
  };

  const handleAddBreakdown = (lotIndex: number) => {
    const newLots = [...lots];
    newLots[lotIndex].bagBreakdowns.push({
      id: 0,
      size: "",
      numberOfBags: 0,
      remainingBags: 0,
      weight: 0,
      pricePerKg: 0,
      totalAmount: null,
    });
    setLots(newLots);
  };

  const handleRemoveBreakdown = (lotIndex: number, breakdownIndex: number) => {
    const newLots = [...lots];
    newLots[lotIndex].bagBreakdowns.splice(breakdownIndex, 1);
    setLots(newLots);
  };

  const handleBreakdownChange = (
    lotIndex: number,
    breakdownIndex: number,
    field: string,
    value: string | number | undefined
  ) => {
    const newLots = [...lots];
    (newLots[lotIndex].bagBreakdowns[breakdownIndex] as any)[field] = value;
    setLots(newLots);
  };

  const handleLotFieldChange = (
    lotIndex: number,
    field: string,
    value: number | string | null
  ) => {
    const newLots = [...lots];
    (newLots[lotIndex] as any)[field] = value;
    setLots(newLots);
  };

  const handleChargeAdd = (lotIndex: number) => {
    const newLots = [...lots];
    const currentCharges = newLots[lotIndex].charges || [];
    newLots[lotIndex].charges = [...currentCharges, { type: "", amount: 0 }];
    setLots(newLots);
  };

  const handleChargeChange = (
    lotIndex: number,
    chargeIndex: number,
    field: "type" | "amount",
    value: string | number
  ) => {
    const newLots = [...lots];
    const currentCharges = [...(newLots[lotIndex].charges || [])];
    currentCharges[chargeIndex] = {
      ...currentCharges[chargeIndex],
      [field]: value
    };
    newLots[lotIndex].charges = currentCharges;
    setLots(newLots);
  };

  const handleChargeRemove = (lotIndex: number, chargeIndex: number) => {
    const newLots = [...lots];
    const currentCharges = [...(newLots[lotIndex].charges || [])];
    currentCharges.splice(chargeIndex, 1);
    newLots[lotIndex].charges = currentCharges;
    setLots(newLots);
  };

  const handleSave = () => {
    // Validate bag breakdown totals equal original bags
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      if (lot.bagBreakdowns.length > 0) {
        const breakdownTotal = lot.bagBreakdowns.reduce((sum, bd) => sum + (bd.numberOfBags || 0), 0);
        if (breakdownTotal !== lot.originalBags) {
          toast({
            title: t("Validation Error", "सत्यापन त्रुटि"),
            description: t(
              `Lot ${i + 1}: Breakdown total (${breakdownTotal}) must equal Original Bags (${lot.originalBags})`,
              `लॉट ${i + 1}: विवरण योग (${breakdownTotal}) मूल बोरी (${lot.originalBags}) के बराबर होना चाहिए`
            ),
            variant: "destructive"
          });
          return;
        }
      }
    }

    // Validate adjustment: Amount and Effective Date required if Rate % is provided
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      if (lot.adjustedAmountRate && lot.adjustedAmountRate > 0) {
        if (!lot.adjustedAmount || lot.adjustedAmount <= 0) {
          toast({
            title: t("Validation Error", "सत्यापन त्रुटि"),
            description: t(
              `Lot ${i + 1}: Amount is required when Rate % is provided`,
              `लॉट ${i + 1}: जब दर % दिया जाए तो राशि आवश्यक है`
            ),
            variant: "destructive"
          });
          return;
        }
        if (!lot.adjustedAmountEffectiveDate) {
          toast({
            title: t("Validation Error", "सत्यापन त्रुटि"),
            description: t(
              `Lot ${i + 1}: Effective Date is required when Rate % is provided`,
              `लॉट ${i + 1}: जब दर % दिया जाए तो प्रभावी तिथि आवश्यक है`
            ),
            variant: "destructive"
          });
          return;
        }
      }
    }

    // Validate charges before saving
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      const charges = lot.charges || [];
      for (let j = 0; j < charges.length; j++) {
        const charge = charges[j];
        // Check if charge has type but no valid amount
        if (charge.type && charge.type.length > 0 && (!charge.amount || charge.amount <= 0)) {
          toast({
            title: t("Validation Error", "सत्यापन त्रुटि"),
            description: t(
              `Lot ${i + 1}: ${charge.type} must have an amount greater than 0`,
              `लॉट ${i + 1}: ${charge.type} की राशि 0 से अधिक होनी चाहिए`
            ),
            variant: "destructive"
          });
          return;
        }
        // Check if amount is provided but type is missing
        if (charge.amount && charge.amount > 0 && (!charge.type || charge.type.length === 0)) {
          toast({
            title: t("Validation Error", "सत्यापन त्रुटि"),
            description: t(
              `Lot ${i + 1}: Please select a charge type for amount ₹${charge.amount}`,
              `लॉट ${i + 1}: कृपया ₹${charge.amount} के लिए शुल्क प्रकार चुनें`
            ),
            variant: "destructive"
          });
          return;
        }
      }
    }
    
    // Clean up charges before saving - remove empty entries
    const cleanedLots = lots.map(lot => ({
      ...lot,
      charges: (lot.charges || []).filter(c => c.type && c.type.length > 0 && c.amount > 0)
    }));
    updateMutation.mutate({ paymentStatus: entry.paymentStatus, remarks, lots: cleanedLots });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-primary">#{entry.serialNumber}</span>
            <span>{t("Edit Stock Entry", "स्टॉक एंट्री संपादित करें")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("Farmer Details", "किसान विवरण")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">{t("Name", "नाम")}</p>
                  <p className="font-medium">{entry.farmerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("Contact", "संपर्क")}</p>
                  <p className="font-medium">{entry.farmerContact || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("Date", "तिथि")}</p>
                  <p className="font-medium">
                    {new Date(entry.purchaseDate).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("Village", "गाँव")}</p>
                  <p className="font-medium">{entry.village || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("District", "जिला")}</p>
                  <p className="font-medium">{entry.district}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("State", "राज्य")}</p>
                  <p className="font-medium">{entry.state}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h4 className="font-medium">{t("Lots", "लॉट")}</h4>
            {lots.map((lot, lotIndex) => (
              <Card key={lot.id || lotIndex} className="border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
                        <Package className="h-3 w-3 text-primary" />
                      </div>
                      <CardTitle className="text-base font-medium">{lot.coldStoreName}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {lot.potatoType} • {lot.quality}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-mono font-medium">{lot.remainingBags}</span>
                      <span>/{lot.originalBags} {t("bags", "बोरी")}</span>
                    </div>
                  </div>
                </CardHeader>

                {/* Bag Breakdown - available for all lots */}
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">{t("Bag Breakdown", "बोरी विवरण")}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddBreakdown(lotIndex)}
                        data-testid={`edit-add-breakdown-${lotIndex}`}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {t("Add Row", "पंक्ति जोड़ें")}
                      </Button>
                    </div>

                    {lot.bagBreakdowns.length > 0 && (
                      <div className="space-y-2">
                        <div className="hidden md:grid md:grid-cols-8 gap-2 px-2 text-xs font-semibold text-muted-foreground uppercase">
                          <div>{t("Size", "आकार")}</div>
                          <div>{t("# Bags", "बोरी")}</div>
                          <div>{t("Remaining", "शेष")}</div>
                          <div>{t("Total Wt", "कुल वजन")}</div>
                          <div>{t("Net Wt", "शुद्ध वजन")}</div>
                          <div>{t("Price/kg", "मूल्य/किलो")}</div>
                          <div>{t("Total", "कुल")}</div>
                          <div></div>
                        </div>
                        {lot.bagBreakdowns.map((bd, bdIndex) => {
                          const total = (bd.weight || 0) * (bd.pricePerKg || 0);
                          const remaining = bd.remainingBags ?? bd.numberOfBags;
                          const netWeight = (bd.weight || 0) - (bd.numberOfBags || 0);
                          return (
                            <div key={bd.id || bdIndex} className="grid grid-cols-2 md:grid-cols-8 gap-2 p-2 bg-muted/30 rounded-md items-center">
                              <Select
                                value={bd.size}
                                onValueChange={(v) => handleBreakdownChange(lotIndex, bdIndex, "size", v)}
                              >
                                <SelectTrigger className="h-8" data-testid={`edit-breakdown-size-${lotIndex}-${bdIndex}`}>
                                  <SelectValue placeholder={t("Size", "आकार")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {SIZE_OPTIONS.map((size) => (
                                    <SelectItem key={size} value={size}>{size}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="text"
                                inputMode="numeric"
                                className="h-8"
                                placeholder=""
                                value={bd.numberOfBags ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  handleBreakdownChange(lotIndex, bdIndex, "numberOfBags", val === "" ? undefined : parseInt(val));
                                }}
                                data-testid={`edit-breakdown-bags-${lotIndex}-${bdIndex}`}
                              />
                              <div className="font-mono text-sm font-medium">
                                <span className="text-primary">{remaining}</span>
                                <span className="text-muted-foreground">/{bd.numberOfBags}</span>
                              </div>
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="h-8"
                                placeholder=""
                                value={bd.weight ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9.]/g, '');
                                  handleBreakdownChange(lotIndex, bdIndex, "weight", val === "" ? undefined : parseFloat(val));
                                }}
                                data-testid={`edit-breakdown-weight-${lotIndex}-${bdIndex}`}
                              />
                              <div className="font-mono text-sm text-muted-foreground">
                                {bd.weight && bd.numberOfBags ? netWeight.toFixed(2) : "—"}
                              </div>
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="h-8"
                                placeholder=""
                                value={bd.pricePerKg ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9.]/g, '');
                                  handleBreakdownChange(lotIndex, bdIndex, "pricePerKg", val === "" ? undefined : parseFloat(val));
                                }}
                                data-testid={`edit-breakdown-price-${lotIndex}-${bdIndex}`}
                              />
                              <div className="font-mono text-sm">
                                {total > 0 ? `₹${total.toFixed(2)}` : "—"}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => setDeleteConfirm({ lotIndex, bdIndex })}
                                data-testid={`edit-remove-breakdown-${lotIndex}-${bdIndex}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {lot.bagBreakdowns.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t("No breakdown rows. Click \"Add Row\" to add breakdown details.", "कोई विवरण पंक्ति नहीं। विवरण जोड़ने के लिए \"पंक्ति जोड़ें\" पर क्लिक करें।")}
                      </p>
                    )}
                  </div>
                </CardContent>
                
                {/* Adjusted Amount Section - applies to all cut types */}
                <CardContent className="pt-0 border-t">
                  <div className="p-3 bg-purple-50/50 dark:bg-purple-900/10 rounded-md">
                    <p className="text-sm font-medium text-muted-foreground mb-3">{t("Farmer Due Adjustment", "किसान बकाया समायोजन")}</p>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("Type", "प्रकार")}</Label>
                        <Select
                          value={lot.adjustedAmountType || ""}
                          onValueChange={(v) => handleLotFieldChange(lotIndex, "adjustedAmountType", v)}
                        >
                          <SelectTrigger className="h-8" data-testid={`edit-adjustment-type-${lotIndex}`}>
                            <SelectValue placeholder={t("Select", "चुनें")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="debit">{t("Debit (−)", "डेबिट")}</SelectItem>
                            <SelectItem value="credit">{t("Credit (+)", "क्रेडिट")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("Amount (₹)", "राशि")}</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8"
                          placeholder="₹0"
                          value={lot.adjustedAmount ?? ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            handleLotFieldChange(lotIndex, "adjustedAmount", val === "" ? null : parseFloat(val));
                          }}
                          data-testid={`edit-adjustment-amount-${lotIndex}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("Rate %", "दर %")}</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8"
                          placeholder="0%"
                          value={lot.adjustedAmountRate ?? ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            const newRate = val === "" ? null : parseFloat(val);
                            handleLotFieldChange(lotIndex, "adjustedAmountRate", newRate);
                            if (newRate && newRate > 0 && !lot.adjustedAmountEffectiveDate) {
                              handleLotFieldChange(lotIndex, "adjustedAmountEffectiveDate", new Date().toISOString().split('T')[0]);
                            }
                          }}
                          data-testid={`edit-adjustment-rate-${lotIndex}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("Effective Date", "प्रभावी तिथि")}</Label>
                        <Input
                          type="date"
                          className="h-8"
                          value={lot.adjustedAmountEffectiveDate || ""}
                          placeholder={t("Select date", "तिथि चुनें")}
                          onChange={(e) => handleLotFieldChange(lotIndex, "adjustedAmountEffectiveDate", e.target.value || null)}
                          data-testid={`edit-adjustment-date-${lotIndex}`}
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs">{t("Reason", "कारण")}</Label>
                        <Input
                          type="text"
                          className="h-8"
                          placeholder={t("Enter reason...", "कारण दर्ज करें...")}
                          value={lot.adjustedAmountRemark || ""}
                          onChange={(e) => handleLotFieldChange(lotIndex, "adjustedAmountRemark", e.target.value)}
                          data-testid={`edit-adjustment-remark-${lotIndex}`}
                        />
                      </div>
                    </div>
                    {/* Show calculated final amount when rate and effective date are provided */}
                    {lot.adjustedAmount && lot.adjustedAmount > 0 && lot.adjustedAmountRate && lot.adjustedAmountRate > 0 && lot.adjustedAmountEffectiveDate && (
                      (() => {
                        const principal = lot.adjustedAmount;
                        const rate = lot.adjustedAmountRate;
                        const effectiveDate = new Date(lot.adjustedAmountEffectiveDate);
                        const today = new Date();
                        const days = Math.max(0, Math.floor((today.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24)));
                        const years = days / 365;
                        const finalAmount = Math.round((principal * Math.pow(1 + rate / 100, years)) * 100) / 100;
                        const interest = Math.round((finalAmount - principal) * 100) / 100;
                        return (
                          <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">{t("Principal", "मूलधन")}:</span>
                                <span className="font-mono font-medium ml-1">₹{principal.toLocaleString("en-IN")}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t("Days", "दिन")}:</span>
                                <span className="font-mono font-medium ml-1">{days}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t("Interest", "ब्याज")}:</span>
                                <span className="font-mono font-medium ml-1 text-amber-700 dark:text-amber-400">₹{interest.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t("Final Amount", "अंतिम राशि")}:</span>
                                <span className="font-mono font-bold ml-1 text-primary">₹{finalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </CardContent>
                
                {/* Dynamic Charges Section */}
                <CardContent className="pt-0 border-t">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">{t("Additional Charges", "अतिरिक्त शुल्क")}</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleChargeAdd(lotIndex)}
                        data-testid={`edit-add-charge-${lotIndex}`}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {t("Add Charge", "शुल्क जोड़ें")}
                      </Button>
                    </div>
                    
                    {(lot.charges || []).map((charge, chargeIndex) => (
                      <div key={chargeIndex} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                        <Select
                          value={charge.type || ""}
                          onValueChange={(v) => handleChargeChange(lotIndex, chargeIndex, "type", v)}
                        >
                          <SelectTrigger className="h-8 flex-1" data-testid={`edit-charge-type-${lotIndex}-${chargeIndex}`}>
                            <SelectValue placeholder={t("Select charge type", "शुल्क प्रकार चुनें")} />
                          </SelectTrigger>
                          <SelectContent>
                            {CHARGE_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-28"
                          placeholder="₹0"
                          value={charge.amount || ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            handleChargeChange(lotIndex, chargeIndex, "amount", val === "" ? 0 : parseFloat(val));
                          }}
                          data-testid={`edit-charge-amount-${lotIndex}-${chargeIndex}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleChargeRemove(lotIndex, chargeIndex)}
                          data-testid={`edit-charge-remove-${lotIndex}-${chargeIndex}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    
                    {(!lot.charges || lot.charges.length === 0) && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        {t("No additional charges added", "कोई अतिरिक्त शुल्क नहीं जोड़ा गया")}
                      </p>
                    )}
                  </div>
                </CardContent>
                
                {/* Summary Row */}
                <CardContent className="pt-0 border-t">
                  {(() => {
                    // Calculate summary values
                    const actualBags = lot.bagBreakdowns
                      .filter(bd => bd.size && bd.size !== "Wastage")
                      .reduce((sum, bd) => sum + (bd.numberOfBags || 0), 0);
                    
                    // Use totalAmount if available, otherwise calculate from weight * price
                    const totalPayable = lot.bagBreakdowns
                      .filter(bd => bd.size && bd.size !== "Wastage")
                      .reduce((sum, bd) => {
                        // First try to use existing totalAmount from the breakdown
                        const existingTotal = typeof (bd as any).totalAmount === 'string' 
                          ? parseFloat((bd as any).totalAmount) || 0 
                          : 0;
                        if (existingTotal > 0) return sum + existingTotal;
                        // Otherwise calculate from weight * price
                        const weight = bd.weight || 0;
                        const price = bd.pricePerKg || 0;
                        return sum + (weight * price);
                      }, 0);
                    
                    const coldStoreDue = lot.expectedColdCharges || 0;
                    const hammali = lot.hammaliGradingCharges || 0;
                    const dynamicCharges = (lot.charges || []).reduce((sum, c) => sum + (c.amount || 0), 0);
                    const totalDeductions = coldStoreDue + hammali + dynamicCharges;
                    
                    // Handle adjustment - calculate compound interest if rate-based
                    const principal = lot.adjustedAmount || 0;
                    let finalAdjustment = principal;
                    
                    // Calculate compound interest if rate and effective date are provided
                    if (principal > 0 && lot.adjustedAmountRate && lot.adjustedAmountRate > 0 && lot.adjustedAmountEffectiveDate) {
                      const effectiveDate = new Date(lot.adjustedAmountEffectiveDate);
                      const today = new Date();
                      const days = Math.max(0, Math.floor((today.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24)));
                      const years = days / 365;
                      finalAdjustment = Math.round((principal * Math.pow(1 + lot.adjustedAmountRate / 100, years)) * 100) / 100;
                    }
                    
                    let adjustedValue = 0;
                    if (finalAdjustment > 0 && lot.adjustedAmountType) {
                      adjustedValue = lot.adjustedAmountType === "credit" ? finalAdjustment : -finalAdjustment;
                    }
                    
                    const netPayable = totalPayable - totalDeductions + adjustedValue;
                    
                    const isPaid = entry.paymentStatus === "paid";
                    
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-md">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">{t("Actual Bags", "वास्तविक बोरी")}</p>
                          <p className="font-mono font-semibold text-sm">{actualBags}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">{t("Total Payable", "कुल देय")}</p>
                          <p className="font-mono font-semibold text-sm text-green-600 dark:text-green-400">
                            ₹{totalPayable.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">{t("Deductions", "कटौती")}</p>
                          <p className="font-mono font-semibold text-sm text-orange-600 dark:text-orange-400">
                            ₹{totalDeductions.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">{t("Adjustment", "समायोजन")}</p>
                          <p className={`font-mono font-semibold text-sm ${
                            adjustedValue === 0 
                              ? "text-muted-foreground" 
                              : adjustedValue > 0 
                                ? "text-green-600 dark:text-green-400" 
                                : "text-red-600 dark:text-red-400"
                          }`}>
                            {adjustedValue > 0 ? "+" : adjustedValue < 0 ? "-" : ""}₹{Math.abs(adjustedValue).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">{t("Net Payable", "शुद्ध देय")}</p>
                          <p className="font-mono font-bold text-sm text-primary">
                            ₹{netPayable.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-center flex items-center justify-center">
                          {isPaid ? (
                            <Badge className="bg-green-500 text-white">
                              {t("Paid", "भुगतान")}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              {t("Dues", "बकाया")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("Delete Breakdown Row?", "विवरण पंक्ति हटाएं?")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("Are you sure you want to delete this breakdown row? This action cannot be undone.", "क्या आप वाकई इस विवरण पंक्ति को हटाना चाहते हैं? यह क्रिया पूर्ववत नहीं की जा सकती।")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Cancel", "रद्द करें")}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t("Delete", "हटाएं")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit History Section */}
        {editHistory.length > 0 && (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start p-2 h-auto"
              onClick={() => setHistoryExpanded(!historyExpanded)}
              data-testid="edit-history-toggle"
            >
              {historyExpanded ? (
                <ChevronDown className="h-4 w-4 mr-2" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2" />
              )}
              <History className="h-4 w-4 mr-2" />
              <span className="font-medium">{t("Edit History", "संपादन इतिहास")}</span>
              <Badge variant="secondary" className="ml-2">{editHistory.length}</Badge>
            </Button>
            
            {historyExpanded && (
              <div className="mt-3 space-y-3 max-h-64 overflow-y-auto" data-testid="edit-history-list">
                {editHistory.map((historyItem, idx) => (
                  <div 
                    key={historyItem.id} 
                    className="bg-muted/30 rounded-md p-3 text-sm"
                    data-testid={`history-item-${historyItem.id}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-muted-foreground text-xs">
                        {new Date(historyItem.changedAt).toLocaleString()}
                      </span>
                      {historyItem.userName && (
                        <Badge variant="outline" className="text-xs">{historyItem.userName}</Badge>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {historyItem.changeSet.map((change, cIdx) => (
                        <li key={cIdx} className="text-xs">
                          <span className="font-medium">{change.label}:</span>
                          {change.changes.length > 0 ? (
                            <ul className="ml-4 mt-1 space-y-0.5">
                              {change.changes.map((fc, fIdx) => (
                                <li key={fIdx} className="text-muted-foreground">
                                  {t(fc.field, fc.field)}: 
                                  <span className="line-through text-destructive/70 mx-1">{fc.oldValue || '—'}</span>
                                  →
                                  <span className="text-primary ml-1">{fc.newValue || '—'}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-muted-foreground ml-1">({t("structural change", "संरचनात्मक परिवर्तन")})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <Label>{t("Remarks", "टिप्पणी")}</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={t("Enter remarks...", "टिप्पणी दर्ज करें...")}
              className="resize-none"
              rows={2}
              data-testid="edit-remarks"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="edit-cancel">
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="edit-save">
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t("Save Changes", "बदलाव सहेजें")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
