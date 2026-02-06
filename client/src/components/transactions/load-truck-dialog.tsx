import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Truck, Loader2, Package, IndianRupee, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Buyer } from "@shared/schema";

interface UnsoldInventoryItem {
  breakdownId: number | null;
  lotId: number;
  serialNumber: number;
  place: string;
  coldStoreName: string;
  farmerName: string;
  farmerVillage: string;
  potatoType: string;
  quality: string;
  cutType: string;
  size: string | null;
  pricePerKg: string | null;
  remainingBags: number;
  originalBags: number;
  lotOriginalBags: number;
  totalWeight: string | null;
  breakdownWeight: string | null;
}

interface LotItem {
  inventoryKey: string;
  bagsMoved: number;
  totalWeight: number;
  netWeight: number;
}

interface BuyerSection {
  id: string;
  buyerId: number | null;
  partyName: string;
  partyAddress: string;
  items: LotItem[];
  advancePayment: number;
  transportationCharges: number;
  otherCharges: number;
  revenue: number;
  isExpanded: boolean;
}

interface LoadTruckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const createEmptyBuyerSection = (): BuyerSection => ({
  id: crypto.randomUUID(),
  buyerId: null,
  partyName: "",
  partyAddress: "",
  items: [{ inventoryKey: "", bagsMoved: 0, totalWeight: 0, netWeight: 0 }],
  advancePayment: 0,
  transportationCharges: 0,
  otherCharges: 0,
  revenue: 0,
  isExpanded: true,
});

export function LoadTruckDialog({ open, onOpenChange }: LoadTruckDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();

  // Header state
  const [transporterName, setTransporterName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [dateOfLoading, setDateOfLoading] = useState(new Date().toISOString().split("T")[0]);
  const [showTransporterSuggestions, setShowTransporterSuggestions] = useState(false);

  // Buyer sections
  const [buyerSections, setBuyerSections] = useState<BuyerSection[]>([createEmptyBuyerSection()]);

  const { data: inventory = [], isLoading: loadingInventory } = useQuery<UnsoldInventoryItem[]>({
    queryKey: ["/api/inventory/unsold"],
    enabled: open,
  });

  const { data: buyers = [] } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers"],
    enabled: open,
  });

  const { data: transporterSuggestions = [] } = useQuery<string[]>({
    queryKey: ["/api/transactions/transporters"],
    enabled: open,
  });

  const getInventoryKey = (item: UnsoldInventoryItem) => {
    return `${item.lotId}-${item.breakdownId || "lot"}`;
  };

  const findInventoryByKey = useCallback(
    (key: string) => inventory.find((inv) => getInventoryKey(inv) === key),
    [inventory]
  );

  // Calculate total bags allocated per inventory key across all buyers
  const getAllocatedBagsPerLot = useCallback(() => {
    const allocatedMap = new Map<string, number>();
    buyerSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.inventoryKey && item.inventoryKey.length > 0) {
          const currentAllocated = allocatedMap.get(item.inventoryKey) || 0;
          allocatedMap.set(item.inventoryKey, currentAllocated + (Number(item.bagsMoved) || 0));
        }
      });
    });
    return allocatedMap;
  }, [buyerSections]);

  // Get available bags for a specific lot (considering other allocations)
  const getAvailableBagsForLot = useCallback(
    (inventoryKey: string, excludeSectionId: string, excludeItemIndex: number): number => {
      const inv = findInventoryByKey(inventoryKey);
      if (!inv) return 0;
      
      let totalAllocated = 0;
      buyerSections.forEach((section) => {
        section.items.forEach((item, idx) => {
          // Skip the current item being edited
          if (section.id === excludeSectionId && idx === excludeItemIndex) return;
          if (item.inventoryKey === inventoryKey) {
            totalAllocated += Number(item.bagsMoved) || 0;
          }
        });
      });
      
      return Math.max(0, inv.remainingBags - totalAllocated);
    },
    [buyerSections, findInventoryByKey]
  );

  const calculateBuyerSummary = useCallback(
    (section: BuyerSection) => {
      let totalBags = 0;
      let totalNetWeight = 0;
      let totalCostOfGoods = 0;

      section.items.forEach((item) => {
        const invItem = findInventoryByKey(item.inventoryKey);
        const pricePerKg = invItem?.pricePerKg ? parseFloat(invItem.pricePerKg) : 0;
        const netWeight = Number(item.netWeight) || 0;
        // Cost = Net Weight × Price per Kg
        const costOfGoods = netWeight * pricePerKg;

        totalBags += Number(item.bagsMoved) || 0;
        totalNetWeight += netWeight;
        totalCostOfGoods += costOfGoods;
      });

      const revenue = Number(section.revenue) || 0;
      const transport = Number(section.transportationCharges) || 0;
      const other = Number(section.otherCharges) || 0;
      const profitLoss = revenue - totalCostOfGoods - transport - other;

      return {
        totalBags: isNaN(totalBags) ? 0 : totalBags,
        totalNetWeight: isNaN(totalNetWeight) ? 0 : totalNetWeight,
        totalCostOfGoods: isNaN(totalCostOfGoods) ? 0 : totalCostOfGoods,
        profitLoss: isNaN(profitLoss) ? 0 : profitLoss,
      };
    },
    [findInventoryByKey]
  );

  // Calculate proportionate total weight when lot is selected
  const calculateProportionateTotalWeight = useCallback(
    (inv: UnsoldInventoryItem, bagsMoved: number): number => {
      // For breakdown items: use breakdown weight and original breakdown bags
      // For gate_cut items: use lot's total weight and lot's original bags
      if (inv.breakdownWeight && inv.originalBags > 0) {
        // Use breakdown weight for proportional calculation
        const breakdownWeightNum = parseFloat(inv.breakdownWeight);
        return (bagsMoved / inv.originalBags) * breakdownWeightNum;
      } else if (inv.totalWeight && inv.lotOriginalBags > 0) {
        // Fallback to lot's total weight
        const totalWeightNum = parseFloat(inv.totalWeight);
        return (bagsMoved / inv.lotOriginalBags) * totalWeightNum;
      }
      return 0;
    },
    []
  );

  // Calculate net weight from total weight and bags
  const calculateNetWeight = useCallback(
    (totalWeight: number, bags: number): number => {
      // Net Weight = Total Weight - # of bags (1kg deduction per bag for packing)
      return Math.max(0, totalWeight - bags);
    },
    []
  );

  const grandTotals = useMemo(() => {
    let totalBags = 0;
    let totalNetWeight = 0;
    let totalCostOfGoods = 0;
    let totalProfitLoss = 0;

    buyerSections.forEach((section) => {
      const summary = calculateBuyerSummary(section);
      totalBags += summary.totalBags;
      totalNetWeight += summary.totalNetWeight;
      totalCostOfGoods += summary.totalCostOfGoods;
      totalProfitLoss += summary.profitLoss;
    });

    return {
      totalBags,
      totalNetWeight,
      totalCostOfGoods,
      totalProfitLoss,
    };
  }, [buyerSections, calculateBuyerSummary]);

  const updateBuyerSection = (sectionId: string, updates: Partial<BuyerSection>) => {
    setBuyerSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, ...updates } : s))
    );
  };

  const updateLotItem = (sectionId: string, itemIndex: number, updates: Partial<LotItem>) => {
    setBuyerSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((item, i) => (i === itemIndex ? { ...item, ...updates } : item)),
            }
          : s
      )
    );
  };

  const addLotToSection = (sectionId: string) => {
    setBuyerSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, items: [...s.items, { inventoryKey: "", bagsMoved: 0, totalWeight: 0, netWeight: 0 }] }
          : s
      )
    );
  };

  const removeLotFromSection = (sectionId: string, itemIndex: number) => {
    setBuyerSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, items: s.items.filter((_, i) => i !== itemIndex) }
          : s
      )
    );
  };

  const addBuyerSection = () => {
    setBuyerSections((prev) => [...prev, createEmptyBuyerSection()]);
  };

  const removeBuyerSection = (sectionId: string) => {
    if (buyerSections.length > 1) {
      setBuyerSections((prev) => prev.filter((s) => s.id !== sectionId));
    }
  };

  const handleBuyerSelect = (sectionId: string, buyerId: string) => {
    const buyer = buyers.find((b) => b.id.toString() === buyerId);
    if (buyer) {
      updateBuyerSection(sectionId, {
        buyerId: buyer.id,
        partyName: buyer.name,
        partyAddress: buyer.address,
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: async (sections: BuyerSection[]) => {
      // Create a transaction for each buyer section
      const transactionPromises = sections.map(async (section) => {
        const items = section.items
          .filter((item) => item.inventoryKey && item.bagsMoved > 0)
          .map((item) => ({
            inventoryKey: item.inventoryKey,
            bagsMoved: item.bagsMoved,
            totalWeight: item.totalWeight,
            netWeight: item.netWeight,
          }));

        if (items.length === 0) return null;

        return apiRequest("POST", "/api/transactions", {
          transporterName,
          dateOfLoading,
          vehicleNumber,
          buyerId: section.buyerId,
          partyName: section.partyName,
          partyAddress: section.partyAddress,
          advancePayment: section.advancePayment,
          transportationCharges: section.transportationCharges,
          otherCharges: section.otherCharges,
          revenue: section.revenue,
          items,
        });
      });

      const results = await Promise.all(transactionPromises);
      return results.filter(Boolean);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/unsold"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/transporters"] });
      toast({
        title: t("Transaction Created", "लेनदेन बनाया गया"),
        description: t("Truck loaded successfully", "ट्रक सफलतापूर्वक लोड किया गया"),
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
    setTransporterName("");
    setVehicleNumber("");
    setDateOfLoading(new Date().toISOString().split("T")[0]);
    setBuyerSections([createEmptyBuyerSection()]);
  };

  const handleSubmit = () => {
    // Validate at least one buyer has items
    const validSections = buyerSections.filter(
      (s) => s.items.some((item) => item.inventoryKey && item.bagsMoved > 0)
    );

    if (validSections.length === 0) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("At least one lot must be selected", "कम से कम एक लॉट चुनना होगा"),
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate(validSections);
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const filteredTransporterSuggestions = transporterSuggestions.filter(
    (name) => name.toLowerCase().includes(transporterName.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      // Only close dialog, don't reset form data - data persists until Save/Cancel
      if (!newOpen) {
        onOpenChange(false);
      } else {
        onOpenChange(true);
      }
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {t("Load A Truck", "ट्रक लोड करें")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Load inventory onto a truck for delivery to one or more buyers",
              "एक या अधिक खरीदारों को डिलीवरी के लिए ट्रक पर इन्वेंटरी लोड करें"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Section - Transport Details */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Label className="text-xs">{t("Transporter Name", "ट्रांसपोर्टर का नाम")}</Label>
                  <Input
                    value={transporterName}
                    onChange={(e) => setTransporterName(e.target.value)}
                    onFocus={() => setShowTransporterSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowTransporterSuggestions(false), 200)}
                    placeholder={t("Enter transporter name", "ट्रांसपोर्टर का नाम दर्ज करें")}
                    data-testid="input-transporter-name"
                  />
                  {showTransporterSuggestions && filteredTransporterSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {filteredTransporterSuggestions.map((name) => (
                        <div
                          key={name}
                          className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                          onClick={() => {
                            setTransporterName(name);
                            setShowTransporterSuggestions(false);
                          }}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">{t("Vehicle #", "वाहन नं")}</Label>
                  <Input
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder={t("Enter vehicle number", "वाहन नंबर दर्ज करें")}
                    data-testid="input-vehicle-number"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("Date of Loading", "लोडिंग की तारीख")}</Label>
                  <Input
                    type="date"
                    value={dateOfLoading}
                    onChange={(e) => setDateOfLoading(e.target.value)}
                    data-testid="input-date-loading"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Buyer Sections */}
          <div className="space-y-4">
            {buyerSections.map((section, sectionIndex) => {
              const summary = calculateBuyerSummary(section);
              const selectedBuyer = buyers.find((b) => b.id === section.buyerId);

              return (
                <Card key={section.id}>
                  <Collapsible
                    open={section.isExpanded}
                    onOpenChange={(isExpanded) => updateBuyerSection(section.id, { isExpanded })}
                  >
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              {section.isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CardTitle className="text-base">
                            {t("Buyer", "खरीदार")} {sectionIndex + 1}
                            {selectedBuyer && (
                              <span className="ml-2 font-normal text-muted-foreground">
                                - {selectedBuyer.name}
                              </span>
                            )}
                          </CardTitle>
                        </div>
                        {buyerSections.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeBuyerSection(section.id)}
                            className="h-8 w-8 text-destructive"
                            data-testid={`button-remove-buyer-${sectionIndex}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>

                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-4">
                        {/* Buyer Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs">{t("Select Buyer", "खरीदार चुनें")}</Label>
                            <Select
                              value={section.buyerId?.toString() || ""}
                              onValueChange={(val) => handleBuyerSelect(section.id, val)}
                            >
                              <SelectTrigger data-testid={`select-buyer-${sectionIndex}`}>
                                <SelectValue placeholder={t("Select a buyer...", "एक खरीदार चुनें...")} />
                              </SelectTrigger>
                              <SelectContent>
                                {buyers
                                  .filter((b) => b.isActive)
                                  .map((buyer) => (
                                    <SelectItem key={buyer.id} value={buyer.id.toString()}>
                                      {buyer.name} {buyer.address && `(${buyer.address})`}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">{t("Party Name (Custom)", "पार्टी का नाम (कस्टम)")}</Label>
                            <Input
                              value={section.partyName}
                              onChange={(e) =>
                                updateBuyerSection(section.id, { partyName: e.target.value })
                              }
                              placeholder={t("Or enter custom name", "या कस्टम नाम दर्ज करें")}
                              data-testid={`input-party-name-${sectionIndex}`}
                            />
                          </div>
                        </div>

                        {/* Lot Selection */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">
                              {t("Select Inventory Lots", "इन्वेंटरी लॉट चुनें")}
                            </Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addLotToSection(section.id)}
                              data-testid={`button-add-lot-${sectionIndex}`}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              {t("Add Lot", "लॉट जोड़ें")}
                            </Button>
                          </div>

                          {/* Lot Header */}
                          <div className="hidden md:grid md:grid-cols-12 gap-1 px-2 py-1 bg-muted/50 rounded text-xs font-medium items-center">
                            <div className="col-span-4">{t("Lot", "लॉट")}</div>
                            <div className="col-span-1 text-center">{t("Bags", "बोरी")}</div>
                            <div className="col-span-2 text-center">{t("Total Weight", "कुल वजन")}</div>
                            <div className="col-span-2 text-center">{t("Net Weight", "शुद्ध वजन")}</div>
                            <div className="col-span-2 text-center">{t("Cost of Goods", "माल की लागत")}</div>
                            <div className="col-span-1"></div>
                          </div>

                          {section.items.map((item, itemIndex) => {
                            const selectedInv = findInventoryByKey(item.inventoryKey);
                            const pricePerKg = selectedInv?.pricePerKg
                              ? parseFloat(selectedInv.pricePerKg)
                              : 0;
                            // Cost = Net Weight × Price per Kg
                            const itemCost = (Number(item.netWeight) || 0) * pricePerKg;

                            return (
                              <div
                                key={itemIndex}
                                className="grid grid-cols-12 gap-1 items-center"
                              >
                                <div className="col-span-12 md:col-span-4">
                                  <Select
                                    value={item.inventoryKey}
                                    onValueChange={(value) => {
                                      const inv = findInventoryByKey(value);
                                      if (inv) {
                                        // Use available bags (considering other allocations)
                                        const availableBags = getAvailableBagsForLot(value, section.id, itemIndex);
                                        const bags = availableBags || 0;
                                        const proportionateTotalWeight = calculateProportionateTotalWeight(inv, bags);
                                        const netWeight = calculateNetWeight(proportionateTotalWeight, bags);
                                        updateLotItem(section.id, itemIndex, {
                                          inventoryKey: value,
                                          bagsMoved: bags,
                                          totalWeight: Math.round(proportionateTotalWeight * 10) / 10,
                                          netWeight: Math.round(netWeight * 10) / 10,
                                        });
                                      } else {
                                        updateLotItem(section.id, itemIndex, {
                                          inventoryKey: value,
                                          bagsMoved: 0,
                                          totalWeight: 0,
                                          netWeight: 0,
                                        });
                                      }
                                    }}
                                  >
                                    <SelectTrigger
                                      data-testid={`select-lot-${sectionIndex}-${itemIndex}`}
                                      className="h-auto min-h-9"
                                    >
                                      <SelectValue
                                        placeholder={t("Select lot...", "लॉट चुनें...")}
                                      />
                                    </SelectTrigger>
                                    <SelectContent className="max-w-[400px]">
                                      {inventory
                                        .filter((inv) => {
                                          const key = getInventoryKey(inv);
                                          // Calculate available bags for this lot (excluding current item)
                                          const availableBags = getAvailableBagsForLot(key, section.id, itemIndex);
                                          // Show lot if: it's the currently selected one, OR there are available bags
                                          return key === item.inventoryKey || availableBags > 0;
                                        })
                                        .map((inv) => {
                                          const key = getInventoryKey(inv);
                                          // For selected lot: show original remaining bags (total available for this selection)
                                          // For other lots: show remaining after other allocations
                                          const displayBags = key === item.inventoryKey 
                                            ? inv.remainingBags
                                            : getAvailableBagsForLot(key, section.id, itemIndex);
                                          return (
                                            <SelectItem key={key} value={key} className="py-2">
                                              <div className="flex flex-col">
                                                <span className="text-sm font-medium">
                                                  S#{inv.serialNumber} - {inv.place === "farm_gate" ? t("Farm Gate", "खेत गेट") : inv.coldStoreName} - {inv.potatoType} - {inv.size || "Mixed"}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                  {inv.farmerName}{inv.farmerVillage ? ` (${inv.farmerVillage})` : ""} | {displayBags} {t("bags available", "बोरी उपलब्ध")}
                                                </span>
                                              </div>
                                            </SelectItem>
                                          );
                                        })}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="col-span-3 md:col-span-1">
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    value={item.bagsMoved || ""}
                                    onChange={(e) => {
                                      const bags = Number(e.target.value) || 0;
                                      if (selectedInv) {
                                        const proportionateTotalWeight = calculateProportionateTotalWeight(selectedInv, bags);
                                        const netWeight = calculateNetWeight(proportionateTotalWeight, bags);
                                        updateLotItem(section.id, itemIndex, {
                                          bagsMoved: bags,
                                          totalWeight: Math.round(proportionateTotalWeight * 10) / 10,
                                          netWeight: Math.round(netWeight * 10) / 10,
                                        });
                                      } else {
                                        updateLotItem(section.id, itemIndex, { bagsMoved: bags });
                                      }
                                    }}
                                    className="text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    data-testid={`input-bags-${sectionIndex}-${itemIndex}`}
                                  />
                                </div>

                                <div className="col-span-3 md:col-span-2">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={item.totalWeight || ""}
                                    onChange={(e) => {
                                      const totalWt = Number(e.target.value) || 0;
                                      const bags = Number(item.bagsMoved) || 0;
                                      const netWeight = calculateNetWeight(totalWt, bags);
                                      updateLotItem(section.id, itemIndex, {
                                        totalWeight: totalWt,
                                        netWeight: Math.round(netWeight * 10) / 10,
                                      });
                                    }}
                                    className="text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    data-testid={`input-total-weight-${sectionIndex}-${itemIndex}`}
                                  />
                                </div>

                                <div className="col-span-3 md:col-span-2">
                                  <div className="h-9 px-2 flex items-center justify-center bg-muted/50 rounded-md text-sm font-medium">
                                    {(Number(item.netWeight) || 0).toFixed(1)}
                                  </div>
                                </div>

                                <div className="col-span-3 md:col-span-2">
                                  <div className="h-9 px-2 flex items-center justify-center bg-muted/50 rounded-md text-sm font-medium">
                                    ₹{parseFloat(itemCost.toFixed(1)).toLocaleString('en-IN')}
                                  </div>
                                </div>

                                <div className="col-span-1">
                                  {section.items.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeLotFromSection(section.id, itemIndex)}
                                      data-testid={`button-remove-lot-${sectionIndex}-${itemIndex}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <Separator />

                        {/* Charges */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <Label className="text-xs">
                              {t("Advance to Driver", "ड्राइवर को अग्रिम")}
                            </Label>
                            <Input
                              type="number"
                              step="any"
                              value={section.advancePayment || ""}
                              onChange={(e) =>
                                updateBuyerSection(section.id, {
                                  advancePayment: Number(e.target.value) || 0,
                                })
                              }
                              placeholder="0"
                              data-testid={`input-advance-${sectionIndex}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              {t("Transport Charges", "परिवहन शुल्क")}
                            </Label>
                            <Input
                              type="number"
                              step="any"
                              value={section.transportationCharges || ""}
                              onChange={(e) =>
                                updateBuyerSection(section.id, {
                                  transportationCharges: Number(e.target.value) || 0,
                                })
                              }
                              placeholder="0"
                              data-testid={`input-transport-${sectionIndex}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t("Other Charges", "अन्य शुल्क")}</Label>
                            <Input
                              type="number"
                              step="any"
                              value={section.otherCharges || ""}
                              onChange={(e) =>
                                updateBuyerSection(section.id, {
                                  otherCharges: Number(e.target.value) || 0,
                                })
                              }
                              placeholder="0"
                              data-testid={`input-other-${sectionIndex}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t("Revenue", "राजस्व")}</Label>
                            <Input
                              type="number"
                              step="any"
                              value={section.revenue || ""}
                              onChange={(e) =>
                                updateBuyerSection(section.id, {
                                  revenue: Number(e.target.value) || 0,
                                })
                              }
                              placeholder="0"
                              data-testid={`input-revenue-${sectionIndex}`}
                            />
                          </div>
                        </div>

                        {/* Buyer Summary (smaller font) */}
                        <div className="bg-muted/30 rounded-lg p-3">
                          <div className="grid grid-cols-4 gap-3 text-center text-xs">
                            <div>
                              <p className="text-lg font-bold">{summary.totalBags}</p>
                              <p className="text-muted-foreground flex items-center justify-center gap-1">
                                <Package className="h-3 w-3" />
                                {t("Bags", "बोरी")}
                              </p>
                            </div>
                            <div>
                              <p className="text-lg font-bold">{summary.totalNetWeight.toFixed(1)}</p>
                              <p className="text-muted-foreground">{t("Net Weight (Kg)", "शुद्ध वजन (किग्रा)")}</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold">₹{parseFloat((summary.totalCostOfGoods + (Number(section.transportationCharges) || 0) + (Number(section.otherCharges) || 0)).toFixed(1)).toLocaleString('en-IN')}</p>
                              <p className="text-muted-foreground flex items-center justify-center gap-1">
                                <IndianRupee className="h-3 w-3" />
                                {t("Total Cost", "कुल लागत")}
                              </p>
                            </div>
                            <div>
                              <p
                                className={`text-lg font-bold ${
                                  summary.profitLoss >= 0 ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {summary.profitLoss >= 0 ? "+" : ""}₹{parseFloat(summary.profitLoss.toFixed(1)).toLocaleString('en-IN')}
                              </p>
                              <p className="text-muted-foreground">{t("P/L", "लाभ/हानि")}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>

          {/* Add Buyer Button */}
          <Button
            type="button"
            variant="outline"
            onClick={addBuyerSection}
            className="w-full"
            data-testid="button-add-buyer"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            {t("Add Buyer", "खरीदार जोड़ें")}
          </Button>

          {/* Grand Total Summary (only if multiple buyers) */}
          {buyerSections.length > 1 && (
            <>
              <Separator />
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">{grandTotals.totalBags}</p>
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Package className="h-3 w-3" />
                        {t("Total Bags", "कुल बोरी")}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{grandTotals.totalNetWeight.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">{t("Total Weight (Kg)", "कुल वजन (किग्रा)")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">₹{parseFloat(grandTotals.totalCostOfGoods.toFixed(1)).toLocaleString('en-IN')}</p>
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <IndianRupee className="h-3 w-3" />
                        {t("Total Cost", "कुल लागत")}
                      </p>
                    </div>
                    <div>
                      <p
                        className={`text-2xl font-bold ${
                          grandTotals.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {grandTotals.totalProfitLoss >= 0 ? "+" : ""}₹{parseFloat(grandTotals.totalProfitLoss.toFixed(1)).toLocaleString('en-IN')}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("Total Profit/Loss", "कुल लाभ/हानि")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleCancel}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              data-testid="button-save-transaction"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("Save Transaction", "लेनदेन सेव करें")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
