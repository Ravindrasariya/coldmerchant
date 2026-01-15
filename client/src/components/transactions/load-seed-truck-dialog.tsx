import { useState, useMemo } from "react";
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

interface LoadSeedTruckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoadSeedTruckDialog({ open, onOpenChange }: LoadSeedTruckDialogProps) {
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
  
  const [selectedLots, setSelectedLots] = useState<SeedLotSelection[]>([{ seedLotId: 0, bagsMoved: 0, pricePerBag: 0 }]);

  const { data: unsoldInventory } = useQuery<SeedLotOption[]>({
    queryKey: ["/api/seed-transactions/unsold-inventory"],
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/seed-transactions", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions/unsold-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-farmers"] });
      toast({
        title: t("Success", "सफल"),
        description: t("Seed transaction created successfully", "बीज लेनदेन सफलतापूर्वक बनाया गया"),
      });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message || t("Failed to create transaction", "लेनदेन बनाने में विफल"),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFarmerName("");
    setFarmerContact("");
    setVillage("");
    setTehsil("");
    setDistrict("");
    setState("");
    setVehicleNumber("");
    setTransportCharges("");
    setOtherCharges("");
    setOtherChargesRemarks("");
    setSelectedLots([{ seedLotId: 0, bagsMoved: 0, pricePerBag: 0 }]);
  };

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

  const getLotInfo = (lotId: number): SeedLotOption | undefined => {
    return unsoldInventory?.find(lot => lot.id === lotId);
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
  }, [selectedLots, transportCharges, otherCharges, unsoldInventory]);

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

    createMutation.mutate({
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Load Seed Truck", "बीज ट्रक लोड करें")}</DialogTitle>
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
                  data-testid="input-seed-farmer-name"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Contact Number", "संपर्क नंबर")}</Label>
                <Input
                  value={farmerContact}
                  onChange={(e) => setFarmerContact(e.target.value)}
                  placeholder={t("Enter number", "नंबर दर्ज करें")}
                  data-testid="input-seed-farmer-contact"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Village", "गाँव")}</Label>
                <Input
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  placeholder={t("Enter village", "गाँव दर्ज करें")}
                  data-testid="input-seed-village"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Tehsil", "तहसील")}</Label>
                <Input
                  value={tehsil}
                  onChange={(e) => setTehsil(e.target.value)}
                  placeholder={t("Enter tehsil", "तहसील दर्ज करें")}
                  data-testid="input-seed-tehsil"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("District", "जिला")} *</Label>
                <Select value={district} onValueChange={setDistrict}>
                  <SelectTrigger data-testid="select-seed-district">
                    <SelectValue placeholder={t("Select district", "जिला चुनें")} />
                  </SelectTrigger>
                  <SelectContent>
                    {SEED_DISTRICTS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("State", "राज्य")} *</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger data-testid="select-seed-state">
                    <SelectValue placeholder={t("Select state", "राज्य चुनें")} />
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Vehicle Number", "वाहन नंबर")} ({t("Optional", "वैकल्पिक")})</Label>
              <Input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder={t("Enter vehicle number", "वाहन नंबर दर्ज करें")}
                className="w-48"
                data-testid="input-seed-vehicle"
              />
            </div>
          </div>

          {/* Seed Lot Selection Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm text-muted-foreground">{t("Select Seed Lots", "बीज लॉट चुनें")}</h3>
              <Button variant="outline" size="sm" onClick={addLotSelection} data-testid="button-add-seed-lot">
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Lot", "लॉट जोड़ें")}
              </Button>
            </div>

            {selectedLots.map((selection, index) => {
              const lotInfo = getLotInfo(selection.seedLotId);
              const costPerBag = lotInfo ? parseFloat(lotInfo.pricePerBag) : 0;
              const revenue = selection.bagsMoved * selection.pricePerBag;
              const cost = selection.bagsMoved * costPerBag;
              const profitLoss = revenue - cost;

              return (
                <Card key={index} className="p-4">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px] space-y-2">
                      <Label>{t("Seed Lot", "बीज लॉट")}</Label>
                      <Select
                        value={selection.seedLotId ? selection.seedLotId.toString() : ""}
                        onValueChange={(val) => updateLotSelection(index, "seedLotId", parseInt(val))}
                      >
                        <SelectTrigger data-testid={`select-seed-lot-${index}`}>
                          <SelectValue placeholder={t("Select lot", "लॉट चुनें")} />
                        </SelectTrigger>
                        <SelectContent>
                          {unsoldInventory?.map((lot) => (
                            <SelectItem key={lot.id} value={lot.id.toString()}>
                              S#{lot.serialNumber} - {lot.coldStoreName} - {lot.potatoType} - {lot.size} ({lot.remainingBags} bags)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="w-24 space-y-2">
                      <Label>{t("Bags", "बैग")}</Label>
                      <Input
                        type="number"
                        min="0"
                        max={lotInfo?.remainingBags || 0}
                        value={selection.bagsMoved || ""}
                        onChange={(e) => updateLotSelection(index, "bagsMoved", parseInt(e.target.value) || 0)}
                        data-testid={`input-seed-bags-${index}`}
                      />
                    </div>

                    <div className="w-28 space-y-2">
                      <Label>{t("Price/Bag", "मूल्य/बैग")}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={selection.pricePerBag || ""}
                        onChange={(e) => updateLotSelection(index, "pricePerBag", parseFloat(e.target.value) || 0)}
                        data-testid={`input-seed-price-${index}`}
                      />
                    </div>

                    <div className="w-28 space-y-2">
                      <Label className="text-muted-foreground">{t("Cost/Bag", "लागत/बैग")}</Label>
                      <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm">
                        ₹{costPerBag.toFixed(0)}
                      </div>
                    </div>

                    <div className="w-28 space-y-2">
                      <Label className="text-muted-foreground">{t("P&L", "लाभ/हानि")}</Label>
                      <div className={`h-9 flex items-center px-3 rounded-md text-sm font-medium ${profitLoss >= 0 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                        ₹{profitLoss.toFixed(0)}
                      </div>
                    </div>

                    {selectedLots.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLotSelection(index)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-remove-lot-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Totals Section */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("Total Bags", "कुल बैग")}</span>
                  <div className="font-semibold text-lg">{totals.totalBags}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Total Cost", "कुल लागत")}</span>
                  <div className="font-semibold text-lg">₹{totals.totalCost.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Total Revenue", "कुल राजस्व")}</span>
                  <div className="font-semibold text-lg text-green-600">₹{totals.totalRevenue.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("P&L", "लाभ/हानि")}</span>
                  <div className={`font-semibold text-lg ${totals.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                    ₹{totals.totalProfitLoss.toLocaleString("en-IN")}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Due to Farmer", "किसान को देय")}</span>
                  <div className="font-semibold text-lg text-orange-600">₹{totals.totalDue.toLocaleString("en-IN")}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Extra Charges Section */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">{t("Additional Charges", "अतिरिक्त शुल्क")}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("Transport Charges", "परिवहन शुल्क")}</Label>
                <Input
                  type="number"
                  value={transportCharges}
                  onChange={(e) => setTransportCharges(e.target.value)}
                  placeholder="0"
                  data-testid="input-seed-transport-charges"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Other Charges", "अन्य शुल्क")}</Label>
                <Input
                  type="number"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(e.target.value)}
                  placeholder="0"
                  data-testid="input-seed-other-charges"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Remarks", "टिप्पणी")}</Label>
                <Input
                  value={otherChargesRemarks}
                  onChange={(e) => setOtherChargesRemarks(e.target.value)}
                  placeholder={t("Enter remarks", "टिप्पणी दर्ज करें")}
                  data-testid="input-seed-remarks"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-seed-truck">
            {t("Cancel", "रद्द करें")}
          </Button>
          <Button onClick={handleSave} disabled={createMutation.isPending} data-testid="button-save-seed-truck">
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("Save", "सहेजें")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
