import { useState, useMemo, useEffect } from "react";
import { calculateInterestOnly } from "@/lib/interest-utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Package, IndianRupee, History, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";

interface SeedLotOption {
  id: number;
  seedEntryId: number;
  serialNumber: number;
  supplierName: string;
  coldStoreName: string;
  potatoType: string;
  size: string;
  bagType: string;
  remainingBags: number;
  pricePerBag: string;
  avgCostPerBag: string;
}

interface SeedLotSelection {
  seedLotId: number;
  bagsMoved: number;
  pricePerBag: number;
}

interface SeedTransactionItem {
  id: number;
  seedLotId: number;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string;
  size: string;
  bagType: string;
  bagsMoved: number;
  pricePerBag: string;
  costPerBag: string;
  revenue: string;
  cost: string;
  profitLoss: string;
}

interface SeedTransaction {
  id: number;
  merchantId: number;
  transactionNumber: number;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  vehicleNumber: string | null;
  transportCharges: string | null;
  otherCharges: string | null;
  otherChargesRemarks: string | null;
  adjustmentType: string | null;
  adjustmentAmount: string | null;
  adjustmentRate: string | null;
  adjustmentEffectiveDate: string | null;
  adjustmentReason: string | null;
  totalBags: number;
  totalCost: string | null;
  totalRevenue: string | null;
  totalProfitLoss: string | null;
  totalDueToFarmer: string | null;
  createdAt: string;
  items: SeedTransactionItem[];
}

interface EditHistoryEntry {
  id: number;
  seedTransactionId: number;
  merchantId: number;
  userId: number | null;
  changedAt: string;
  changeSet: Array<{ field: string; oldValue: any; newValue: any }>;
  userName?: string;
}

interface EditSeedTransactionDialogProps {
  transactionId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSeedTransactionDialog({ transactionId, open, onOpenChange }: EditSeedTransactionDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  
  const [farmerName, setFarmerName] = useState("");
  const [farmerContact, setFarmerContact] = useState("");
  const [village, setVillage] = useState("");
  const [tehsil, setTehsil] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [transportCharges, setTransportCharges] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [otherChargesRemarks, setOtherChargesRemarks] = useState("");
  
  // Farmer adjustment fields
  const [adjustmentType, setAdjustmentType] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentRate, setAdjustmentRate] = useState("");
  const [adjustmentEffectiveDate, setAdjustmentEffectiveDate] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  
  const [selectedLots, setSelectedLots] = useState<SeedLotSelection[]>([]);

  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: transaction, isLoading: isLoadingTransaction } = useQuery<SeedTransaction>({
    queryKey: ["/api/seed-transactions", transactionId],
    enabled: open && transactionId !== null,
  });

  const { data: editHistory } = useQuery<EditHistoryEntry[]>({
    queryKey: ["/api/seed-transactions", transactionId, "edit-history"],
    enabled: open && transactionId !== null,
  });

  const { data: unsoldInventory } = useQuery<SeedLotOption[]>({
    queryKey: ["/api/seed-transactions/unsold-inventory"],
    enabled: open,
  });

  // Initialize form when transaction data loads
  useEffect(() => {
    if (transaction) {
      setFarmerName(transaction.farmerName);
      setFarmerContact(transaction.farmerContact || "");
      setVillage(transaction.village || "");
      setTehsil(transaction.tehsil || "");
      setDistrict(transaction.district);
      setState(transaction.state);
      setVehicleNumber(transaction.vehicleNumber || "");
      setTransportCharges(transaction.transportCharges || "");
      setOtherCharges(transaction.otherCharges || "");
      setOtherChargesRemarks(transaction.otherChargesRemarks || "");
      setAdjustmentType(transaction.adjustmentType || "");
      setAdjustmentAmount(transaction.adjustmentAmount || "");
      setAdjustmentRate(transaction.adjustmentRate || "");
      setAdjustmentEffectiveDate(transaction.adjustmentEffectiveDate || "");
      setAdjustmentReason(transaction.adjustmentReason || "");
      
      // Convert transaction items to lot selections
      const lots = transaction.items.map(item => ({
        seedLotId: item.seedLotId,
        bagsMoved: item.bagsMoved,
        pricePerBag: parseFloat(item.pricePerBag) || 0,
      }));
      setSelectedLots(lots.length > 0 ? lots : [{ seedLotId: 0, bagsMoved: 0, pricePerBag: 0 }]);
    }
  }, [transaction]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/seed-transactions/${transactionId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions/unsold-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      toast({
        title: t("Success", "सफल"),
        description: t("Seed transaction updated successfully", "बीज लेनदेन सफलतापूर्वक अपडेट किया गया"),
        variant: "success",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message || t("Failed to update transaction", "लेनदेन अपडेट करने में विफल"),
        variant: "destructive",
      });
    },
  });

  const addLotSelection = () => {
    setSelectedLots([...selectedLots, { seedLotId: 0, bagsMoved: 0, pricePerBag: 0 }]);
  };

  const removeLotSelection = (index: number) => {
    if (selectedLots.length > 1) {
      setSelectedLots(selectedLots.filter((_, i) => i !== index));
    }
  };

  const updateLotSelection = (index: number, field: keyof SeedLotSelection, value: number) => {
    const updated = [...selectedLots];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedLots(updated);
  };

  // Combine unsold inventory with currently selected lots (to show lots that are in this transaction)
  const availableLots = useMemo(() => {
    if (!unsoldInventory) return [];
    if (!transaction) return unsoldInventory;
    
    // Add back the bags from current transaction items to show correct availability
    const lotsWithCurrentBags = unsoldInventory.map(lot => {
      const txnItem = transaction.items.find(item => item.seedLotId === lot.id);
      if (txnItem) {
        return { ...lot, remainingBags: lot.remainingBags + txnItem.bagsMoved };
      }
      return lot;
    });
    
    // Also include lots from transaction that might have 0 remaining bags now
    const currentLotIds = new Set(transaction.items.map(item => item.seedLotId));
    const lotsFromTxn = transaction.items
      .filter(item => !lotsWithCurrentBags.find(lot => lot.id === item.seedLotId))
      .map(item => ({
        id: item.seedLotId,
        seedEntryId: 0,
        serialNumber: item.serialNumber,
        supplierName: "",
        coldStoreName: item.coldStoreName,
        potatoType: item.potatoType,
        size: item.size,
        bagType: item.bagType,
        remainingBags: item.bagsMoved,
        pricePerBag: item.costPerBag,
        avgCostPerBag: item.costPerBag,
      }));
    
    return [...lotsWithCurrentBags, ...lotsFromTxn];
  }, [unsoldInventory, transaction]);

  const getLotInfo = (lotId: number): SeedLotOption | undefined => {
    return availableLots?.find(lot => lot.id === lotId);
  };

  const calculatedAdjustment = useMemo(() => {
    const principal = parseFloat(adjustmentAmount) || 0;
    const rate = parseFloat(adjustmentRate) || 0;
    
    if (principal <= 0) return { finalAmount: 0, interest: 0, days: 0 };
    
    const { interest, days } = calculateInterestOnly(principal, rate, adjustmentEffectiveDate || null);
    return { finalAmount: interest, interest, days };
  }, [adjustmentAmount, adjustmentRate, adjustmentEffectiveDate]);

  const totals = useMemo(() => {
    let totalBags = 0;
    let totalCost = 0;
    let totalRevenue = 0;

    selectedLots.forEach(selection => {
      if (selection.seedLotId && selection.bagsMoved > 0) {
        const lotInfo = getLotInfo(selection.seedLotId);
        const costPerBag = lotInfo ? parseFloat(lotInfo.avgCostPerBag || lotInfo.pricePerBag) : 0;
        const bags = selection.bagsMoved;
        const revenue = bags * selection.pricePerBag;
        const cost = bags * costPerBag;

        totalBags += bags;
        totalCost += cost;
        totalRevenue += revenue;
      }
    });

    const totalProfitLoss = totalRevenue - totalCost;
    const transport = parseFloat(transportCharges) || 0;
    const other = parseFloat(otherCharges) || 0;
    
    // Apply adjustment to total due
    let adjustmentValue = 0;
    if (calculatedAdjustment.finalAmount > 0 && adjustmentType) {
      adjustmentValue = adjustmentType === "credit" ? calculatedAdjustment.finalAmount : -calculatedAdjustment.finalAmount;
    }
    
    const totalDue = totalRevenue + transport + other + adjustmentValue;

    return { totalBags, totalCost, totalRevenue, totalProfitLoss, totalDue, adjustmentValue };
  }, [selectedLots, transportCharges, otherCharges, availableLots, calculatedAdjustment, adjustmentType]);

  const handleSave = () => {
    const validLots = selectedLots.filter(lot => lot.seedLotId > 0 && lot.bagsMoved > 0);
    if (validLots.length === 0) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Please select at least one seed lot with bags", "कृपया बैग के साथ कम से कम एक बीज लॉट चुनें"),
        variant: "destructive",
      });
      return;
    }

    for (const lot of validLots) {
      const lotInfo = getLotInfo(lot.seedLotId);
      if (lotInfo && lot.bagsMoved > lotInfo.remainingBags) {
        toast({
          title: t("Error", "त्रुटि"),
          description: t(`Not enough bags available in lot. Max: ${lotInfo.remainingBags}`, `लॉट में पर्याप्त बैग उपलब्ध नहीं। अधिकतम: ${lotInfo.remainingBags}`),
          variant: "destructive",
        });
        return;
      }
    }

    // Farmer details are read-only - they are managed via Farmer Ledger
    updateMutation.mutate({
      vehicleNumber: vehicleNumber || undefined,
      transportCharges: transportCharges || undefined,
      otherCharges: otherCharges || undefined,
      otherChargesRemarks: otherChargesRemarks || undefined,
      adjustmentType: adjustmentType || undefined,
      adjustmentAmount: adjustmentAmount || undefined,
      adjustmentRate: adjustmentRate || undefined,
      adjustmentEffectiveDate: adjustmentEffectiveDate || undefined,
      adjustmentReason: adjustmentReason || undefined,
      items: validLots.map(lot => ({
        seedLotId: lot.seedLotId,
        bagsMoved: lot.bagsMoved,
        pricePerBag: lot.pricePerBag,
      })),
    });
  };

  if (isLoadingTransaction) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("Edit Seed Transaction", "बीज लेनदेन संपादित करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("Edit Seed Transaction", "बीज लेनदेन संपादित करें")} #{transaction?.transactionNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Farmer Info Section - Read Only (edit via Farmer Ledger) */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">
              {t("Farmer Details", "किसान विवरण")}
              <span className="ml-2 text-xs text-muted-foreground/60">({t("Edit via Farmer Ledger", "किसान खाता बही द्वारा संपादित करें")})</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("Farmer Name", "किसान का नाम")}</Label>
                <Input
                  value={farmerName}
                  disabled
                  className="bg-muted"
                  data-testid="input-edit-seed-farmer-name"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Contact Number", "संपर्क नंबर")}</Label>
                <Input
                  value={farmerContact}
                  disabled
                  className="bg-muted"
                  data-testid="input-edit-seed-farmer-contact"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Village", "गाँव")}</Label>
                <Input
                  value={village}
                  disabled
                  className="bg-muted"
                  data-testid="input-edit-seed-village"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Tehsil", "तहसील")}</Label>
                <Input
                  value={tehsil}
                  disabled
                  className="bg-muted"
                  data-testid="input-edit-seed-tehsil"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("District", "जिला")}</Label>
                <Input
                  value={district}
                  disabled
                  className="bg-muted"
                  data-testid="input-edit-seed-district"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("State", "राज्य")}</Label>
                <Input
                  value={state}
                  disabled
                  className="bg-muted"
                  data-testid="input-edit-seed-state"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Vehicle Number", "वाहन नंबर")}</Label>
              <Input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder={t("Enter vehicle number", "वाहन नंबर दर्ज करें")}
                className="max-w-xs"
                data-testid="input-edit-seed-vehicle"
              />
            </div>
          </div>

          {/* Seed Lot Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm text-muted-foreground">{t("Seed Lots", "बीज लॉट")}</h3>
              <Button variant="outline" size="sm" onClick={addLotSelection} data-testid="button-edit-add-seed-lot">
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Lot", "लॉट जोड़ें")}
              </Button>
            </div>

            <div className="space-y-3">
              {selectedLots.map((selection, index) => {
                const lotInfo = getLotInfo(selection.seedLotId);
                const lineRevenue = selection.bagsMoved * selection.pricePerBag;
                const lineCost = selection.bagsMoved * (lotInfo ? parseFloat(lotInfo.avgCostPerBag || lotInfo.pricePerBag) : 0);
                const linePL = lineRevenue - lineCost;

                return (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="md:col-span-2 space-y-2">
                          <Label>{t("Select Seed Lot", "बीज लॉट चुनें")}</Label>
                          <Select
                            value={selection.seedLotId ? selection.seedLotId.toString() : ""}
                            onValueChange={(val) => updateLotSelection(index, "seedLotId", parseInt(val))}
                          >
                            <SelectTrigger data-testid={`select-edit-seed-lot-${index}`}>
                              <SelectValue placeholder={t("Choose a lot", "एक लॉट चुनें")} />
                            </SelectTrigger>
                            <SelectContent>
                              {availableLots?.filter(lot => 
                                lot.remainingBags > 0 || 
                                selectedLots.some(s => s.seedLotId === lot.id)
                              ).map(lot => (
                                <SelectItem key={lot.id} value={lot.id.toString()}>
                                  S#{lot.serialNumber} - {lot.coldStoreName} - {lot.potatoType} ({lot.size}) - {lot.remainingBags} bags @ ₹{lot.pricePerBag}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t("Bags", "बैग")}</Label>
                          <Input
                            type="number"
                            value={selection.bagsMoved || ""}
                            onChange={(e) => updateLotSelection(index, "bagsMoved", parseInt(e.target.value) || 0)}
                            placeholder="0"
                            min={0}
                            max={lotInfo?.remainingBags || 9999}
                            data-testid={`input-edit-seed-bags-${index}`}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("Price/Bag", "मूल्य/बैग")}</Label>
                          <Input
                            type="number"
                            step="any"
                            value={selection.pricePerBag || ""}
                            onChange={(e) => updateLotSelection(index, "pricePerBag", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            data-testid={`input-edit-seed-price-${index}`}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">{t("Cost/Bag", "लागत/बैग")}</Label>
                          <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm">
                            ₹{(lotInfo ? parseFloat(lotInfo.avgCostPerBag || lotInfo.pricePerBag) : 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                          </div>
                        </div>
                        {selectedLots.length > 1 && (
                          <div className="flex items-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLotSelection(index)}
                              data-testid={`button-edit-remove-seed-lot-${index}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {selection.seedLotId > 0 && selection.bagsMoved > 0 && (
                        <div className="flex gap-4 mt-3 text-sm">
                          <span className="text-muted-foreground">
                            {t("Cost", "लागत")}: <span className="font-medium">₹{lineCost.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                          </span>
                          <span className="text-muted-foreground">
                            {t("Revenue", "राजस्व")}: <span className="font-medium text-green-600">₹{lineRevenue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                          </span>
                          <span className={linePL >= 0 ? "text-green-600" : "text-red-600"}>
                            {t("P&L", "लाभ/हानि")}: ₹{linePL.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Charges Section */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">{t("Additional Charges", "अतिरिक्त शुल्क")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("Transport Charges", "परिवहन शुल्क")}</Label>
                <Input
                  type="number"
                  step="any"
                  value={transportCharges}
                  onChange={(e) => setTransportCharges(e.target.value)}
                  placeholder="0"
                  data-testid="input-edit-seed-transport"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Other Charges", "अन्य शुल्क")}</Label>
                <Input
                  type="number"
                  step="any"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(e.target.value)}
                  placeholder="0"
                  data-testid="input-edit-seed-other-charges"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Other Charges Remarks", "अन्य शुल्क विवरण")}</Label>
                <Input
                  value={otherChargesRemarks}
                  onChange={(e) => setOtherChargesRemarks(e.target.value)}
                  placeholder={t("Enter remarks", "विवरण दर्ज करें")}
                  data-testid="input-edit-seed-other-remarks"
                />
              </div>
            </div>
          </div>

          {/* Farmer Due Adjustment Section */}
          <div className="p-4 bg-purple-50/50 dark:bg-purple-900/10 rounded-md border" data-testid="section-edit-seed-farmer-adjustment">
            <p className="text-sm font-medium text-muted-foreground mb-3">{t("Farmer Due Adjustment", "किसान बकाया समायोजन")}</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">{t("Type", "प्रकार")}</Label>
                <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                  <SelectTrigger data-testid="select-edit-seed-adjustment-type">
                    <SelectValue placeholder={t("Select", "चुनें")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit" data-testid="option-edit-seed-adjustment-debit">{t("Debit (−)", "डेबिट (−)")}</SelectItem>
                    <SelectItem value="credit" data-testid="option-edit-seed-adjustment-credit">{t("Credit (+)", "क्रेडिट (+)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Amount (₹)", "राशि (₹)")}</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  data-testid="input-edit-seed-adjustment-amount"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Rate %", "दर %")}</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0%"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={adjustmentRate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAdjustmentRate(val);
                    if (val && parseFloat(val) > 0 && !adjustmentEffectiveDate) {
                      setAdjustmentEffectiveDate(new Date().toISOString().split('T')[0]);
                    }
                  }}
                  data-testid="input-edit-seed-adjustment-rate"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Effective Date", "प्रभावी तिथि")}</Label>
                <Input
                  type="date"
                  value={adjustmentEffectiveDate}
                  onChange={(e) => setAdjustmentEffectiveDate(e.target.value)}
                  data-testid="input-edit-seed-adjustment-date"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Reason", "कारण")}</Label>
                <Input
                  type="text"
                  placeholder={t("Enter reason", "कारण दर्ज करें")}
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  data-testid="input-edit-seed-adjustment-reason"
                />
              </div>
            </div>
            {/* Show calculated interest */}
            {calculatedAdjustment.finalAmount > 0 && calculatedAdjustment.interest > 0 && (
              <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800" data-testid="text-edit-seed-adjustment-interest">
                <div className="text-xs text-amber-800 dark:text-amber-200">
                  {t("Principal", "मूलधन")}: ₹{parseFloat(adjustmentAmount).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} | 
                  {t("Interest", "ब्याज")} ({calculatedAdjustment.days} {t("days", "दिन")}): ₹{calculatedAdjustment.interest.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} | 
                  <span className="font-semibold" data-testid="text-edit-seed-adjustment-final"> {t("Final", "अंतिम")}: ₹{calculatedAdjustment.finalAmount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                </div>
              </div>
            )}
          </div>

          {/* Totals Summary */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">{t("Total Bags", "कुल बैग")}</div>
                  <div className="text-lg font-semibold flex items-center justify-center gap-1">
                    <Package className="h-4 w-4" />
                    {totals.totalBags}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("Total Cost", "कुल लागत")}</div>
                  <div className="text-lg font-semibold">₹{totals.totalCost.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("Total Revenue", "कुल राजस्व")}</div>
                  <div className="text-lg font-semibold text-green-600">₹{totals.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("P&L", "लाभ/हानि")}</div>
                  <div className={`text-lg font-semibold ${totals.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                    ₹{totals.totalProfitLoss.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("Total Due", "कुल देय")}</div>
                  <div className="text-lg font-semibold text-orange-600 flex items-center justify-center gap-1">
                    <IndianRupee className="h-4 w-4" />
                    {totals.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edit History Section */}
          {editHistory && editHistory.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between" data-testid="button-toggle-seed-history">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    <span>{t("Edit History", "संपादन इतिहास")} ({editHistory.length})</span>
                  </div>
                  {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 mt-3 max-h-60 overflow-y-auto">
                  {editHistory.map((entry) => (
                    <Card key={entry.id} className="bg-muted/30">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(entry.changedAt), "dd MMM yyyy, hh:mm a")}
                          </span>
                          {entry.userName && (
                            <Badge variant="secondary" className="text-xs">
                              {entry.userName}
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          {(entry.changeSet as Array<{ field: string; oldValue: any; newValue: any }>).map((change, idx) => (
                            <div key={idx} className="text-sm flex flex-wrap gap-1 items-center">
                              <span className="font-medium">{change.field}:</span>
                              <span className="text-red-600 line-through">
                                {change.oldValue !== null ? String(change.oldValue) : '-'}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-green-600">
                                {change.newValue !== null ? String(change.newValue) : '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-edit-seed-cancel">
            {t("Cancel", "रद्द करें")}
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-edit-seed-save">
            {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("Save Changes", "परिवर्तन सहेजें")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
