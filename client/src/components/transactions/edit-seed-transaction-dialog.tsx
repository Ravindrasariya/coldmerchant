import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Package, IndianRupee } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SEED_DISTRICTS, STATES } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

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
  totalBags: number;
  totalCost: string | null;
  totalRevenue: string | null;
  totalProfitLoss: string | null;
  totalDueToFarmer: string | null;
  createdAt: string;
  items: SeedTransactionItem[];
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
  
  const [selectedLots, setSelectedLots] = useState<SeedLotSelection[]>([]);

  const { data: transaction, isLoading: isLoadingTransaction } = useQuery<SeedTransaction>({
    queryKey: ["/api/seed-transactions", transactionId],
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
      toast({
        title: t("Success", "सफल"),
        description: t("Seed transaction updated successfully", "बीज लेनदेन सफलतापूर्वक अपडेट किया गया"),
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
      }));
    
    return [...lotsWithCurrentBags, ...lotsFromTxn];
  }, [unsoldInventory, transaction]);

  const getLotInfo = (lotId: number): SeedLotOption | undefined => {
    return availableLots?.find(lot => lot.id === lotId);
  };

  const totals = useMemo(() => {
    let totalBags = 0;
    let totalCost = 0;
    let totalRevenue = 0;

    selectedLots.forEach(selection => {
      if (selection.seedLotId && selection.bagsMoved > 0) {
        const lotInfo = getLotInfo(selection.seedLotId);
        const costPerBag = lotInfo ? parseFloat(lotInfo.pricePerBag) : 0;
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
    const totalDue = totalRevenue + transport + other;

    return { totalBags, totalCost, totalRevenue, totalProfitLoss, totalDue };
  }, [selectedLots, transportCharges, otherCharges, availableLots]);

  const handleSave = () => {
    if (!farmerName.trim()) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Farmer name is required", "किसान का नाम आवश्यक है"),
        variant: "destructive",
      });
      return;
    }

    if (!district) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("District is required", "जिला आवश्यक है"),
        variant: "destructive",
      });
      return;
    }

    if (!state) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("State is required", "राज्य आवश्यक है"),
        variant: "destructive",
      });
      return;
    }

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

    updateMutation.mutate({
      farmerName,
      farmerContact: farmerContact || undefined,
      village: village || undefined,
      tehsil: tehsil || undefined,
      district,
      state,
      vehicleNumber: vehicleNumber || undefined,
      transportCharges: transportCharges || undefined,
      otherCharges: otherCharges || undefined,
      otherChargesRemarks: otherChargesRemarks || undefined,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("Edit Seed Transaction", "बीज लेनदेन संपादित करें")} #{transaction?.transactionNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Farmer Info Section */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">{t("Farmer Details", "किसान विवरण")}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("Farmer Name", "किसान का नाम")} *</Label>
                <Input
                  value={farmerName}
                  onChange={(e) => setFarmerName(e.target.value)}
                  placeholder={t("Enter name", "नाम दर्ज करें")}
                  data-testid="input-edit-seed-farmer-name"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Contact Number", "संपर्क नंबर")}</Label>
                <Input
                  value={farmerContact}
                  onChange={(e) => setFarmerContact(e.target.value)}
                  placeholder={t("Enter number", "नंबर दर्ज करें")}
                  data-testid="input-edit-seed-farmer-contact"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Village", "गाँव")}</Label>
                <Input
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  placeholder={t("Enter village", "गाँव दर्ज करें")}
                  data-testid="input-edit-seed-village"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Tehsil", "तहसील")}</Label>
                <Input
                  value={tehsil}
                  onChange={(e) => setTehsil(e.target.value)}
                  placeholder={t("Enter tehsil", "तहसील दर्ज करें")}
                  data-testid="input-edit-seed-tehsil"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("District", "जिला")} *</Label>
                <Select value={district} onValueChange={setDistrict}>
                  <SelectTrigger data-testid="select-edit-seed-district">
                    <SelectValue placeholder={t("Select district", "जिला चुनें")} />
                  </SelectTrigger>
                  <SelectContent>
                    {SEED_DISTRICTS.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("State", "राज्य")} *</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger data-testid="select-edit-seed-state">
                    <SelectValue placeholder={t("Select state", "राज्य चुनें")} />
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Vehicle Number", "वाहन नंबर")}</Label>
              <Input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
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
                const lineCost = selection.bagsMoved * (lotInfo ? parseFloat(lotInfo.pricePerBag) : 0);
                const linePL = lineRevenue - lineCost;

                return (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={selection.pricePerBag || ""}
                              onChange={(e) => updateLotSelection(index, "pricePerBag", parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              data-testid={`input-edit-seed-price-${index}`}
                            />
                            {selectedLots.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLotSelection(index)}
                                data-testid={`button-edit-remove-seed-lot-${index}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      {selection.seedLotId > 0 && selection.bagsMoved > 0 && (
                        <div className="flex gap-4 mt-3 text-sm">
                          <span className="text-muted-foreground">
                            {t("Cost", "लागत")}: <span className="font-medium">₹{lineCost.toLocaleString("en-IN")}</span>
                          </span>
                          <span className="text-muted-foreground">
                            {t("Revenue", "राजस्व")}: <span className="font-medium text-green-600">₹{lineRevenue.toLocaleString("en-IN")}</span>
                          </span>
                          <span className={linePL >= 0 ? "text-green-600" : "text-red-600"}>
                            {t("P&L", "लाभ/हानि")}: ₹{linePL.toLocaleString("en-IN")}
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
                  <div className="text-lg font-semibold">₹{totals.totalCost.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("Total Revenue", "कुल राजस्व")}</div>
                  <div className="text-lg font-semibold text-green-600">₹{totals.totalRevenue.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("P&L", "लाभ/हानि")}</div>
                  <div className={`text-lg font-semibold ${totals.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                    ₹{totals.totalProfitLoss.toLocaleString("en-IN")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("Total Due", "कुल देय")}</div>
                  <div className="text-lg font-semibold text-orange-600 flex items-center justify-center gap-1">
                    <IndianRupee className="h-4 w-4" />
                    {totals.totalDue.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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
