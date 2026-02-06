import { useState, useMemo, useRef, useEffect } from "react";
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

interface Farmer {
  id: number;
  name: string;
  contact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string | null;
  state: string | null;
}

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
  
  // Farmer adjustment fields
  const [adjustmentType, setAdjustmentType] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentRate, setAdjustmentRate] = useState("");
  const [adjustmentEffectiveDate, setAdjustmentEffectiveDate] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  
  const [selectedLots, setSelectedLots] = useState<SeedLotSelection[]>([{ seedLotId: 0, bagsMoved: 0, pricePerBag: 0 }]);
  
  const [showFarmerSuggestions, setShowFarmerSuggestions] = useState(false);
  const [activeField, setActiveField] = useState<'name' | 'contact' | 'village' | null>(null);
  const farmerInputRef = useRef<HTMLInputElement>(null);
  const contactInputRef = useRef<HTMLInputElement>(null);
  const villageInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { data: unsoldInventory } = useQuery<SeedLotOption[]>({
    queryKey: ["/api/seed-transactions/unsold-inventory"],
    enabled: open,
  });

  const { data: farmers } = useQuery<Farmer[]>({
    queryKey: ["/api/farmers"],
    enabled: open,
  });

  const filteredFarmers = useMemo(() => {
    if (!farmers) return [];
    
    if (activeField === 'name' && farmerName.trim()) {
      const searchTerm = farmerName.toLowerCase().trim();
      return farmers.filter(f => 
        f.name.toLowerCase().includes(searchTerm)
      ).slice(0, 8);
    }
    
    if (activeField === 'contact' && farmerContact.trim()) {
      const searchTerm = farmerContact.toLowerCase().trim();
      return farmers.filter(f => 
        f.contact?.toLowerCase().includes(searchTerm)
      ).slice(0, 8);
    }
    
    if (activeField === 'village' && village.trim()) {
      const searchTerm = village.toLowerCase().trim();
      return farmers.filter(f => 
        f.village?.toLowerCase().includes(searchTerm)
      ).slice(0, 8);
    }
    
    return [];
  }, [farmers, farmerName, farmerContact, village, activeField]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        farmerInputRef.current &&
        !farmerInputRef.current.contains(event.target as Node) &&
        contactInputRef.current &&
        !contactInputRef.current.contains(event.target as Node) &&
        villageInputRef.current &&
        !villageInputRef.current.contains(event.target as Node)
      ) {
        setShowFarmerSuggestions(false);
        setActiveField(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFarmerSelect = (farmer: Farmer) => {
    setFarmerName(farmer.name);
    setFarmerContact(farmer.contact || "");
    setVillage(farmer.village || "");
    setTehsil(farmer.tehsil || "");
    setDistrict(farmer.district || "");
    setState(farmer.state || "");
    setShowFarmerSuggestions(false);
  };

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
      queryClient.invalidateQueries({ queryKey: ["/api/cash/cross-settlement-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      toast({
        title: t("Success", "सफल"),
        description: t("Seed transaction created successfully", "बीज लेनदेन सफलतापूर्वक बनाया गया"),
        variant: "success",
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
    setAdjustmentType("");
    setAdjustmentAmount("");
    setAdjustmentRate("");
    setAdjustmentEffectiveDate("");
    setAdjustmentReason("");
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

  // Calculate adjustment with compound interest
  const calculatedAdjustment = useMemo(() => {
    const principal = parseFloat(adjustmentAmount) || 0;
    const rate = parseFloat(adjustmentRate) || 0;
    
    if (principal <= 0) return { finalAmount: 0, interest: 0, days: 0 };
    
    if (rate > 0 && adjustmentEffectiveDate) {
      const effectiveDate = new Date(adjustmentEffectiveDate);
      const today = new Date();
      const days = Math.max(0, Math.floor((today.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24)));
      const years = days / 365;
      // Apply only interest portion (not principal+interest) since principal is already in overall calculation
      const interest = Math.round((principal * (Math.pow(1 + rate / 100, years) - 1)) * 100) / 100;
      return { finalAmount: interest, interest, days };
    }
    
    return { finalAmount: 0, interest: 0, days: 0 };
  }, [adjustmentAmount, adjustmentRate, adjustmentEffectiveDate]);

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
    
    // Apply adjustment to total due
    let adjustmentValue = 0;
    if (calculatedAdjustment.finalAmount > 0 && adjustmentType) {
      adjustmentValue = adjustmentType === "credit" ? calculatedAdjustment.finalAmount : -calculatedAdjustment.finalAmount;
    }
    
    const totalDue = totalRevenue + transport + other + adjustmentValue;

    return { totalBags, totalCost, totalRevenue, totalProfitLoss, totalDue, adjustmentValue };
  }, [selectedLots, transportCharges, otherCharges, unsoldInventory, calculatedAdjustment, adjustmentType]);

  const handleSave = () => {
    if (!farmerName.trim()) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Farmer name is required", "किसान का नाम आवश्यक है"),
        variant: "destructive",
      });
      return;
    }

    if (!farmerContact.trim()) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Contact number is required", "संपर्क नंबर आवश्यक है"),
        variant: "destructive",
      });
      return;
    }

    if (!village.trim()) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Village is required", "गाँव आवश्यक है"),
        variant: "destructive",
      });
      return;
    }

    if (!tehsil.trim()) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Tehsil is required", "तहसील आवश्यक है"),
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
              <div className="space-y-2 relative">
                <Label>{t("Farmer Name", "किसान का नाम")} *</Label>
                <Input
                  ref={farmerInputRef}
                  value={farmerName}
                  onChange={(e) => {
                    setFarmerName(e.target.value);
                    setActiveField('name');
                    setShowFarmerSuggestions(true);
                  }}
                  onFocus={() => {
                    setActiveField('name');
                    setShowFarmerSuggestions(true);
                  }}
                  placeholder={t("Enter name", "नाम दर्ज करें")}
                  data-testid="input-seed-farmer-name"
                  autoComplete="off"
                />
                {showFarmerSuggestions && activeField === 'name' && filteredFarmers.length > 0 && (
                  <div 
                    ref={suggestionsRef}
                    className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto"
                  >
                    {filteredFarmers.map((farmer) => (
                      <button
                        key={farmer.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover-elevate flex flex-col"
                        onClick={() => handleFarmerSelect(farmer)}
                      >
                        <span className="font-medium">{farmer.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {farmer.contact && `${farmer.contact} `}
                          {farmer.village && `| ${farmer.village}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2 relative">
                <Label>{t("Contact Number", "संपर्क नंबर")} *</Label>
                <Input
                  ref={contactInputRef}
                  value={farmerContact}
                  onChange={(e) => {
                    setFarmerContact(e.target.value);
                    setActiveField('contact');
                    setShowFarmerSuggestions(true);
                  }}
                  onFocus={() => {
                    setActiveField('contact');
                    setShowFarmerSuggestions(true);
                  }}
                  placeholder={t("Enter number", "नंबर दर्ज करें")}
                  autoComplete="off"
                  data-testid="input-seed-farmer-contact"
                />
                {showFarmerSuggestions && activeField === 'contact' && filteredFarmers.length > 0 && (
                  <div 
                    ref={suggestionsRef}
                    className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto"
                  >
                    {filteredFarmers.map((farmer) => (
                      <button
                        key={farmer.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover-elevate flex flex-col"
                        onClick={() => handleFarmerSelect(farmer)}
                      >
                        <span className="font-medium">{farmer.contact}</span>
                        <span className="text-xs text-muted-foreground">
                          {farmer.name}
                          {farmer.village && ` | ${farmer.village}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2 relative">
                <Label>{t("Village", "गाँव")} *</Label>
                <Input
                  ref={villageInputRef}
                  value={village}
                  onChange={(e) => {
                    setVillage(e.target.value);
                    setActiveField('village');
                    setShowFarmerSuggestions(true);
                  }}
                  onFocus={() => {
                    setActiveField('village');
                    setShowFarmerSuggestions(true);
                  }}
                  placeholder={t("Enter village", "गाँव दर्ज करें")}
                  autoComplete="off"
                  data-testid="input-seed-village"
                />
                {showFarmerSuggestions && activeField === 'village' && filteredFarmers.length > 0 && (
                  <div 
                    ref={suggestionsRef}
                    className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto"
                  >
                    {filteredFarmers.map((farmer) => (
                      <button
                        key={farmer.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover-elevate flex flex-col"
                        onClick={() => handleFarmerSelect(farmer)}
                      >
                        <span className="font-medium">{farmer.village}</span>
                        <span className="text-xs text-muted-foreground">
                          {farmer.name}
                          {farmer.contact && ` | ${farmer.contact}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("Tehsil", "तहसील")} *</Label>
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
                        step="any"
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

          {/* Additional Charges Section */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">{t("Additional Charges", "अतिरिक्त शुल्क")}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("Transport Charges", "परिवहन शुल्क")}</Label>
                <Input
                  type="number"
                  step="any"
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
                  step="any"
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

          {/* Farmer Due Adjustment Section */}
          <div className="p-4 bg-purple-50/50 dark:bg-purple-900/10 rounded-md border" data-testid="section-seed-farmer-adjustment">
            <p className="text-sm font-medium text-muted-foreground mb-3">{t("Farmer Due Adjustment", "किसान बकाया समायोजन")}</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">{t("Type", "प्रकार")}</Label>
                <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                  <SelectTrigger data-testid="select-seed-adjustment-type">
                    <SelectValue placeholder={t("Select", "चुनें")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit" data-testid="option-seed-adjustment-debit">{t("Debit (−)", "डेबिट (−)")}</SelectItem>
                    <SelectItem value="credit" data-testid="option-seed-adjustment-credit">{t("Credit (+)", "क्रेडिट (+)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Amount (₹)", "राशि (₹)")}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  data-testid="input-seed-adjustment-amount"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Rate %", "दर %")}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0%"
                  value={adjustmentRate}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    setAdjustmentRate(val);
                    if (val && parseFloat(val) > 0 && !adjustmentEffectiveDate) {
                      setAdjustmentEffectiveDate(new Date().toISOString().split('T')[0]);
                    }
                  }}
                  data-testid="input-seed-adjustment-rate"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Effective Date", "प्रभावी तिथि")}</Label>
                <Input
                  type="date"
                  value={adjustmentEffectiveDate}
                  onChange={(e) => setAdjustmentEffectiveDate(e.target.value)}
                  data-testid="input-seed-adjustment-date"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Reason", "कारण")}</Label>
                <Input
                  type="text"
                  placeholder={t("Enter reason", "कारण दर्ज करें")}
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  data-testid="input-seed-adjustment-reason"
                />
              </div>
            </div>
            {/* Show calculated interest */}
            {calculatedAdjustment.finalAmount > 0 && calculatedAdjustment.interest > 0 && (
              <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800" data-testid="text-seed-adjustment-interest">
                <div className="text-xs text-amber-800 dark:text-amber-200">
                  {t("Principal", "मूलधन")}: ₹{parseFloat(adjustmentAmount).toLocaleString("en-IN")} | 
                  {t("Interest", "ब्याज")} ({calculatedAdjustment.days} {t("days", "दिन")}): ₹{calculatedAdjustment.interest.toLocaleString("en-IN")} | 
                  <span className="font-semibold" data-testid="text-seed-adjustment-final"> {t("Final", "अंतिम")}: ₹{calculatedAdjustment.finalAmount.toLocaleString("en-IN")}</span>
                </div>
              </div>
            )}
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
