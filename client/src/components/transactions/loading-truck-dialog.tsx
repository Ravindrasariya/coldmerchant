import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getTodayIST } from "@/lib/date-utils";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Plus, Trash2, Truck, Loader2, Package, IndianRupee, AlertTriangle, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Buyer } from "@shared/schema";

interface UnsoldInventoryItem {
  breakdownId: number | null;
  lotId: number;
  serialNumber: number;
  crop: string;
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
  netWeight: number;
  breakdownWeight: string | null;
  costPerBag: number;
  mandiCommissionPercent: string | null;
  aadhatCommissionPercent: string | null;
  hammaliPerBag: string | null;
  mandiExtraCharges: string | null;
}

interface LoadingLotItem {
  inventoryKey: string;
  bagsMoved: number;
  totalWeight: number;
  netWeight: number;
  pricePerKg: number;
  amount: number;
}

interface LoadingTruckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCrop?: string;
}

export function LoadingTruckDialog({ open, onOpenChange, selectedCrop = "potato" }: LoadingTruckDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [transporterName, setTransporterName] = useState("");
  const [driverContact, setDriverContact] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [dateOfLoading, setDateOfLoading] = useState(getTodayIST());
  const [showTransporterSuggestions, setShowTransporterSuggestions] = useState(false);
  const [selectedTransporterIndex, setSelectedTransporterIndex] = useState(-1);
  const transporterSuggestionsRef = useRef<HTMLDivElement>(null);

  const [buyerId, setBuyerId] = useState<number | null>(null);
  const [partyName, setPartyName] = useState("");
  const [partyAddress, setPartyAddress] = useState("");
  const [buyerPopoverOpen, setBuyerPopoverOpen] = useState(false);
  const [lotPopoverOpen, setLotPopoverOpen] = useState<Record<string, boolean>>({});

  const [items, setItems] = useState<LoadingLotItem[]>([
    { inventoryKey: "", bagsMoved: 0, totalWeight: 0, netWeight: 0, pricePerKg: 0, amount: 0 },
  ]);

  const [salesCommissionPct, setSalesCommissionPct] = useState(0);
  const [driverAdvance, setDriverAdvance] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);

  const ADDITIONAL_CHARGE_OPTIONS = [
    { key: "tulai", label: "Tulai", labelHi: "तुलाई" },
    { key: "majduri", label: "Majduri", labelHi: "मजदूरी" },
    { key: "thelaBhada", label: "Thela Bhada", labelHi: "ठेला भाड़ा" },
    { key: "palaKarai", label: "Pala Karai", labelHi: "पाला कराई" },
    { key: "bardan", label: "Bardan (Bags)", labelHi: "बरदान (बोरी)" },
  ] as const;

  type ChargeKey = typeof ADDITIONAL_CHARGE_OPTIONS[number]["key"];
  const [additionalCharges, setAdditionalCharges] = useState<Record<ChargeKey, number>>({
    tulai: 0, majduri: 0, thelaBhada: 0, palaKarai: 0, bardan: 0,
  });
  const [visibleCharges, setVisibleCharges] = useState<ChargeKey[]>([]);

  const [mandiCommissionPct, setMandiCommissionPct] = useState(0);
  const [aadhatCommissionPct, setAadhatCommissionPct] = useState(0);
  const [hammaliPerBagRate, setHammaliPerBagRate] = useState(0);
  const [editExtraCharges, setEditExtraCharges] = useState(0);

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

  const getAllocatedBags = useCallback(() => {
    const allocatedMap = new Map<string, number>();
    items.forEach((item) => {
      if (item.inventoryKey) {
        const current = allocatedMap.get(item.inventoryKey) || 0;
        allocatedMap.set(item.inventoryKey, current + (Number(item.bagsMoved) || 0));
      }
    });
    return allocatedMap;
  }, [items]);

  const getAvailableBags = useCallback(
    (inventoryKey: string, excludeIndex: number): number => {
      const inv = findInventoryByKey(inventoryKey);
      if (!inv) return 0;
      let totalAllocated = 0;
      items.forEach((item, idx) => {
        if (idx === excludeIndex) return;
        if (item.inventoryKey === inventoryKey) {
          totalAllocated += Number(item.bagsMoved) || 0;
        }
      });
      return Math.max(0, inv.remainingBags - totalAllocated);
    },
    [items, findInventoryByKey]
  );

  const calculateNetWeight = useCallback(
    (inv: UnsoldInventoryItem, bagsMoved: number): number => {
      const totalBags = inv.originalBags || inv.lotOriginalBags || 1;
      if (totalBags <= 0) return 0;
      return (bagsMoved / totalBags) * inv.netWeight;
    },
    []
  );

  const mandiChargesAggregated = useMemo(() => {
    let totalMandiCommission = 0;
    let totalAadhatCommission = 0;
    let totalHammali = 0;
    let totalMandiExtraCharges = 0;

    items.forEach((item) => {
      if (!item.inventoryKey || !item.amount) return;
      const inv = findInventoryByKey(item.inventoryKey);
      if (!inv) return;

      const amount = Number(item.amount) || 0;
      const bags = Number(item.bagsMoved) || 0;

      if (inv.mandiCommissionPercent) {
        totalMandiCommission += (amount * parseFloat(inv.mandiCommissionPercent)) / 100;
      }
      if (inv.aadhatCommissionPercent) {
        totalAadhatCommission += (amount * parseFloat(inv.aadhatCommissionPercent)) / 100;
      }
      if (inv.hammaliPerBag) {
        totalHammali += bags * parseFloat(inv.hammaliPerBag);
      }
      if (inv.mandiExtraCharges) {
        const lotExtraCharge = parseFloat(inv.mandiExtraCharges);
        const proportion = inv.lotOriginalBags > 0 ? bags / inv.lotOriginalBags : 0;
        totalMandiExtraCharges += lotExtraCharge * proportion;
      }
    });

    return {
      totalMandiCommission: Math.round(totalMandiCommission * 100) / 100,
      totalAadhatCommission: Math.round(totalAadhatCommission * 100) / 100,
      totalHammali: Math.round(totalHammali * 100) / 100,
      totalMandiExtraCharges: Math.round(totalMandiExtraCharges * 100) / 100,
    };
  }, [items, findInventoryByKey]);

  const totalItemAmount = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [items]);

  const totalItemBags = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.bagsMoved) || 0), 0);
  }, [items]);

  useEffect(() => {
    const amtBase = totalItemAmount > 0 ? totalItemAmount : 1;
    const bagBase = totalItemBags > 0 ? totalItemBags : 1;
    setMandiCommissionPct(Math.round((mandiChargesAggregated.totalMandiCommission / amtBase) * 10000) / 100);
    setAadhatCommissionPct(Math.round((mandiChargesAggregated.totalAadhatCommission / amtBase) * 10000) / 100);
    setHammaliPerBagRate(Math.round((mandiChargesAggregated.totalHammali / bagBase) * 100) / 100);
    setEditExtraCharges(mandiChargesAggregated.totalMandiExtraCharges);
  }, [mandiChargesAggregated, totalItemAmount, totalItemBags]);

  const computedMandiComm = useMemo(() => Math.round(totalItemAmount * mandiCommissionPct / 100 * 100) / 100, [totalItemAmount, mandiCommissionPct]);
  const computedAadhatComm = useMemo(() => Math.round(totalItemAmount * aadhatCommissionPct / 100 * 100) / 100, [totalItemAmount, aadhatCommissionPct]);
  const computedHammali = useMemo(() => Math.round(totalItemBags * hammaliPerBagRate * 100) / 100, [totalItemBags, hammaliPerBagRate]);
  const totalMandiCharges = useMemo(() => {
    return computedMandiComm + computedAadhatComm + computedHammali + editExtraCharges;
  }, [computedMandiComm, computedAadhatComm, computedHammali, editExtraCharges]);

  const totalAdditionalCharges = useMemo(() => {
    return Object.values(additionalCharges).reduce((sum, v) => sum + v, 0);
  }, [additionalCharges]);

  const computedSalesComm = useMemo(() => {
    const base = totalItemAmount + totalMandiCharges + totalAdditionalCharges;
    return Math.round(base * salesCommissionPct / 100 * 100) / 100;
  }, [totalItemAmount, totalMandiCharges, totalAdditionalCharges, salesCommissionPct]);

  const totals = useMemo(() => {
    let totalBags = 0;
    let totalNetWeight = 0;
    let totalAmount = 0;
    let totalCostOfGoods = 0;

    items.forEach((item) => {
      const inv = findInventoryByKey(item.inventoryKey);
      const bags = Number(item.bagsMoved) || 0;
      totalBags += bags;
      totalNetWeight += Number(item.netWeight) || 0;
      totalAmount += Number(item.amount) || 0;
      const breakdownPricePerKg = inv?.pricePerKg ? parseFloat(inv.pricePerKg) : 0;
      totalCostOfGoods += breakdownPricePerKg * (Number(item.netWeight) || 0);
    });

    const grandTotal = totalAmount + totalMandiCharges + computedSalesComm + totalAdditionalCharges + driverAdvance - advanceAmount;
    const totalPL = (totalAmount - totalCostOfGoods) + computedSalesComm;

    return {
      totalBags,
      totalNetWeight,
      totalAmount,
      totalCostOfGoods,
      grandTotal,
      totalPL,
    };
  }, [items, findInventoryByKey, totalMandiCharges, computedSalesComm, totalAdditionalCharges, driverAdvance, advanceAmount]);

  const updateItem = (index: number, updates: Partial<LoadingLotItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { inventoryKey: "", bagsMoved: 0, totalWeight: 0, netWeight: 0, pricePerKg: 0, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBuyerSelect = (selectedBuyerId: string) => {
    const buyer = buyers.find((b) => b.id.toString() === selectedBuyerId);
    if (buyer) {
      setBuyerId(buyer.id);
      setPartyName(buyer.name);
      setPartyAddress(buyer.address || "");
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const validItems = items
        .filter((item) => item.inventoryKey && item.bagsMoved > 0)
        .map((item) => ({
          inventoryKey: item.inventoryKey,
          bagsMoved: item.bagsMoved,
          totalWeight: item.totalWeight,
          netWeight: item.netWeight,
          pricePerKg: item.pricePerKg,
          amount: item.amount,
        }));

      return apiRequest("POST", "/api/transactions", {
        transactionType: "loading",
        transporterName,
        driverContact,
        dateOfLoading,
        vehicleNumber,
        buyerId,
        partyName,
        partyAddress,
        advancePayment: driverAdvance,
        items: validItems,
        revenue: totals.totalAmount,
        salesCommission: computedSalesComm,
        totalMandiCommission: computedMandiComm,
        totalAadhatCommission: computedAadhatComm,
        totalHammali: computedHammali,
        totalMandiExtraCharges: editExtraCharges,
        transportationCharges: 0,
        otherCharges: advanceAmount,
        tulai: additionalCharges.tulai,
        majduri: additionalCharges.majduri,
        thelaBhada: additionalCharges.thelaBhada,
        palaKarai: additionalCharges.palaKarai,
        bardan: additionalCharges.bardan,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/unsold"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/transporters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      toast({
        title: t("Loading Created", "लोडिंग बनाई गई"),
        description: t("Loading transaction saved successfully", "लोडिंग लेनदेन सफलतापूर्वक सहेजा गया"),
        variant: "success",
      });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message || t("Failed to create loading transaction", "लोडिंग लेनदेन बनाने में विफल"),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setTransporterName("");
    setDriverContact("");
    setVehicleNumber("");
    setDateOfLoading(getTodayIST());
    setBuyerId(null);
    setPartyName("");
    setPartyAddress("");
    setItems([{ inventoryKey: "", bagsMoved: 0, totalWeight: 0, netWeight: 0, pricePerKg: 0, amount: 0 }]);
    setSalesCommissionPct(0);
    setDriverAdvance(0);
    setAdvanceAmount(0);
    setAdditionalCharges({ tulai: 0, majduri: 0, thelaBhada: 0, palaKarai: 0, bardan: 0 });
    setVisibleCharges([]);
    setMandiCommissionPct(0);
    setAadhatCommissionPct(0);
    setHammaliPerBagRate(0);
    setEditExtraCharges(0);
  };

  const handleSubmit = () => {
    const validItems = items.filter((item) => item.inventoryKey && item.bagsMoved > 0);
    if (validItems.length === 0) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("At least one lot must be selected", "कम से कम एक लॉट चुनना होगा"),
        variant: "destructive",
      });
      return;
    }
    if (!buyerId) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Please select a buyer", "कृपया खरीदार चुनें"),
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const filteredTransporterSuggestions = transporterSuggestions.filter(
    (name) => name.toLowerCase().includes(transporterName.toLowerCase())
  );

  useEffect(() => {
    setSelectedTransporterIndex(-1);
  }, [filteredTransporterSuggestions.length, transporterName]);

  useEffect(() => {
    if (selectedTransporterIndex >= 0 && transporterSuggestionsRef.current) {
      const elems = transporterSuggestionsRef.current.querySelectorAll('[data-suggestion-item]');
      elems[selectedTransporterIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedTransporterIndex]);

  const handleTransporterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showTransporterSuggestions || filteredTransporterSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedTransporterIndex(prev => (prev + 1) % filteredTransporterSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedTransporterIndex(prev => (prev <= 0 ? filteredTransporterSuggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && selectedTransporterIndex >= 0) {
      e.preventDefault();
      const name = filteredTransporterSuggestions[selectedTransporterIndex];
      if (name) {
        setTransporterName(name);
        setShowTransporterSuggestions(false);
        setSelectedTransporterIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowTransporterSuggestions(false);
      setSelectedTransporterIndex(-1);
    }
  };

  const selectedBuyer = buyers.find((b) => b.id === buyerId);

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) onOpenChange(false);
      else onOpenChange(true);
    }}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border-t-4 border-t-blue-500 dark:border-t-blue-400">
        <DialogHeader className="shrink-0 bg-blue-50/50 dark:bg-blue-950/30 -mx-6 -mt-6 px-6 pt-6 pb-4 rounded-t-lg">
          <DialogTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Truck className="h-5 w-5" />
            {t("Loading", "लोडिंग")}
          </DialogTitle>
          <DialogDescription>
            {t("Create a loading transaction with mandi charges", "मंडी शुल्क के साथ लोडिंग लेनदेन बनाएं")}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0">
        <div className="space-y-6">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Label className="text-xs">{t("Transporter Name", "ट्रांसपोर्टर का नाम")}</Label>
                  <Input
                    value={transporterName}
                    onChange={(e) => { setTransporterName(e.target.value); setShowTransporterSuggestions(true); }}
                    onFocus={() => setShowTransporterSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowTransporterSuggestions(false), 200)}
                    onKeyDown={handleTransporterKeyDown}
                    placeholder={t("Enter transporter name", "ट्रांसपोर्टर का नाम दर्ज करें")}
                    data-testid="input-loading-transporter-name"
                    autoComplete="off"
                  />
                  {showTransporterSuggestions && filteredTransporterSuggestions.length > 0 && (
                    <div ref={transporterSuggestionsRef} className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {filteredTransporterSuggestions.map((name, idx) => (
                        <div
                          key={name}
                          data-suggestion-item
                          className={`px-3 py-2 hover:bg-muted cursor-pointer text-sm ${idx === selectedTransporterIndex ? 'bg-accent' : ''}`}
                          onClick={() => {
                            setTransporterName(name);
                            setShowTransporterSuggestions(false);
                            setSelectedTransporterIndex(-1);
                          }}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">{t("Driver Contact", "ड्राइवर संपर्क")}</Label>
                  <Input
                    value={driverContact}
                    onChange={(e) => setDriverContact(e.target.value)}
                    placeholder={t("Enter driver contact", "ड्राइवर संपर्क दर्ज करें")}
                    data-testid="input-loading-driver-contact"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("Vehicle #", "वाहन नं")}</Label>
                  <Input
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder={t("Enter vehicle number", "वाहन नंबर दर्ज करें")}
                    data-testid="input-loading-vehicle-number"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("Date of Loading", "लोडिंग की तारीख")}</Label>
                  <Input
                    type="date"
                    value={dateOfLoading}
                    onChange={(e) => setDateOfLoading(e.target.value)}
                    data-testid="input-loading-date"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">{t("Select Buyer", "खरीदार चुनें")}</Label>
                  <Popover open={buyerPopoverOpen} onOpenChange={setBuyerPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={buyerPopoverOpen}
                        className="w-full justify-between font-normal"
                        data-testid="select-loading-buyer"
                      >
                        {selectedBuyer ? (
                          <span className="flex items-center gap-2 truncate">
                            {selectedBuyer.name} {selectedBuyer.address && `(${selectedBuyer.address})`}
                            {selectedBuyer.redFlag && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                Red Flag
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t("Select a buyer...", "एक खरीदार चुनें...")}</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t("Search buyer...", "खरीदार खोजें...")} />
                        <CommandList>
                          <CommandEmpty>{t("No buyer found.", "कोई खरीदार नहीं मिला।")}</CommandEmpty>
                          <CommandGroup>
                            {buyers
                              .filter((b) => b.isActive)
                              .map((buyer) => (
                                <CommandItem
                                  key={buyer.id}
                                  value={`${buyer.name} ${buyer.address || ''}`}
                                  onSelect={() => {
                                    handleBuyerSelect(buyer.id.toString());
                                    setBuyerPopoverOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", buyerId === buyer.id ? "opacity-100" : "opacity-0")} />
                                  <span className="flex items-center gap-2">
                                    {buyer.name} {buyer.address && `(${buyer.address})`}
                                    {buyer.redFlag && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                        Red Flag
                                      </span>
                                    )}
                                  </span>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {selectedBuyer?.redFlag && (
                <div className="flex items-center gap-2 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-3 py-2 text-sm text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{selectedBuyer.name} {t("is marked as Red Flag", "रेड फ्लैग के रूप में चिह्नित है")}</span>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t("Select Inventory Lots", "इन्वेंटरी लॉट चुनें")}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem} data-testid="button-loading-add-lot">
                    <Plus className="h-4 w-4 mr-1" />
                    {t("Add Lot", "लॉट जोड़ें")}
                  </Button>
                </div>

                <div className="hidden md:grid md:grid-cols-12 gap-1 px-2 py-1 bg-muted/50 rounded text-xs font-medium items-center">
                  <div className="col-span-3">{t("Lot", "लॉट")}</div>
                  <div className="col-span-1 text-center">{t("Bags", "बोरी")}</div>
                  <div className="col-span-2 text-center">{t("Net Wt", "शुद्ध वजन")}</div>
                  <div className="col-span-1 text-center">{t("₹/Kg", "₹/किग्रा")}</div>
                  <div className="col-span-2 text-center">{t("Amount", "राशि")}</div>
                  <div className="col-span-2 text-center">{t("P&L", "लाभ/हानि")}</div>
                  <div className="col-span-1"></div>
                </div>

                {items.map((item, itemIndex) => {
                  const selectedInv = findInventoryByKey(item.inventoryKey);
                  const breakdownPpk = selectedInv?.pricePerKg ? parseFloat(selectedInv.pricePerKg) : 0;
                  const itemCost = breakdownPpk * (Number(item.netWeight) || 0);
                  const itemPL = (Number(item.amount) || 0) - itemCost;

                  return (
                    <div key={itemIndex} className="grid grid-cols-12 gap-1 items-center">
                      <div className="col-span-12 md:col-span-3 min-w-0 overflow-hidden">
                        <Popover
                          open={lotPopoverOpen[`${itemIndex}`] || false}
                          onOpenChange={(isOpen) => setLotPopoverOpen(prev => ({ ...prev, [`${itemIndex}`]: isOpen }))}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              data-testid={`select-loading-lot-${itemIndex}`}
                              className={cn("w-full justify-between h-auto min-h-9 text-left", !item.inventoryKey && "text-muted-foreground")}
                            >
                              {item.inventoryKey ? (() => {
                                const inv = findInventoryByKey(item.inventoryKey);
                                if (!inv) return item.inventoryKey;
                                return (
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center justify-between gap-1.5">
                                      <span className="text-sm font-medium break-words min-w-0">
                                        S#{inv.serialNumber} - {inv.place === "farm_gate" ? t("Farm Gate", "खेत गेट") : inv.place === "mandi" ? t("Mandi", "मंडी") : inv.coldStoreName}{inv.potatoType ? ` - ${inv.potatoType}` : ""}{inv.size ? ` - ${inv.size}` : ""}
                                      </span>
                                      {(() => {
                                        const c = inv.crop || "potato";
                                        const cls = c === "onion" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" : c === "garlic" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
                                        const label = c === "onion" ? t("Onion", "प्याज") : c === "garlic" ? t("Garlic", "लहसुन") : t("Potato", "आलू");
                                        return <Badge className={`text-[10px] px-1.5 py-0 font-medium border-0 shrink-0 ${cls}`}>{label}</Badge>;
                                      })()}
                                    </div>
                                    <span className="text-xs text-muted-foreground break-words">
                                      {inv.farmerName}{inv.farmerVillage ? ` (${inv.farmerVillage})` : ""} | {inv.remainingBags} {t("bags available", "बोरी उपलब्ध")}
                                      {inv.pricePerKg ? ` | ₹${inv.pricePerKg}/kg` : ""}
                                    </span>
                                  </div>
                                );
                              })() : t("Select lot...", "लॉट चुनें...")}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder={t("Search lot...", "लॉट खोजें...")} />
                              <CommandList>
                                <CommandEmpty>{t("No lot found.", "कोई लॉट नहीं मिला।")}</CommandEmpty>
                                <CommandGroup>
                                  {inventory
                                    .filter((inv) => {
                                      if (selectedCrop && inv.crop !== selectedCrop) return false;
                                      const key = getInventoryKey(inv);
                                      const available = getAvailableBags(key, itemIndex);
                                      return key === item.inventoryKey || available > 0;
                                    })
                                    .map((inv) => {
                                      const key = getInventoryKey(inv);
                                      const displayBags = key === item.inventoryKey
                                        ? inv.remainingBags
                                        : getAvailableBags(key, itemIndex);
                                      const placeLabel = inv.place === "farm_gate" ? t("Farm Gate", "खेत गेट") : inv.place === "mandi" ? t("Mandi", "मंडी") : inv.coldStoreName;
                                      return (
                                        <CommandItem
                                          key={key}
                                          value={`S#${inv.serialNumber} ${placeLabel} ${inv.potatoType || ""} ${inv.size || ""} ${inv.farmerName} ${inv.farmerVillage || ""} ${displayBags} bags available ${inv.pricePerKg ? `₹${inv.pricePerKg}/kg` : ""}`}
                                          onSelect={() => {
                                            const selectedInvItem = findInventoryByKey(key);
                                            if (selectedInvItem) {
                                              const availableBags = getAvailableBags(key, itemIndex);
                                              const bags = availableBags || 0;
                                              const netWeight = calculateNetWeight(selectedInvItem, bags);
                                              const pricePerKg = selectedInvItem.pricePerKg ? parseFloat(selectedInvItem.pricePerKg) : 0;
                                              const amount = Math.round(pricePerKg * netWeight * 100) / 100;
                                              updateItem(itemIndex, {
                                                inventoryKey: key,
                                                bagsMoved: bags,
                                                totalWeight: Math.round(netWeight * 10) / 10,
                                                netWeight: Math.round(netWeight * 10) / 10,
                                                pricePerKg,
                                                amount,
                                              });
                                            } else {
                                              updateItem(itemIndex, {
                                                inventoryKey: key,
                                                bagsMoved: 0,
                                                totalWeight: 0,
                                                netWeight: 0,
                                                pricePerKg: 0,
                                                amount: 0,
                                              });
                                            }
                                            setLotPopoverOpen(prev => ({ ...prev, [`${itemIndex}`]: false }));
                                          }}
                                        >
                                          <Check className={cn("mr-2 h-4 w-4", item.inventoryKey === key ? "opacity-100" : "opacity-0")} />
                                          <div className="flex flex-col flex-1">
                                            <div className="flex items-center justify-between gap-1.5">
                                              <span className="text-sm font-medium">
                                                S#{inv.serialNumber} - {placeLabel}{inv.potatoType ? ` - ${inv.potatoType}` : ""}{inv.size ? ` - ${inv.size}` : ""}
                                              </span>
                                              {(() => {
                                                const c = inv.crop || "potato";
                                                const cls = c === "onion" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" : c === "garlic" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
                                                const label = c === "onion" ? t("Onion", "प्याज") : c === "garlic" ? t("Garlic", "लहसुन") : t("Potato", "आलू");
                                                return <Badge className={`text-[10px] px-1.5 py-0 font-medium border-0 shrink-0 ${cls}`}>{label}</Badge>;
                                              })()}
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                              {inv.farmerName}{inv.farmerVillage ? ` (${inv.farmerVillage})` : ""} | {displayBags} {t("bags available", "बोरी उपलब्ध")}
                                              {inv.pricePerKg ? ` | ₹${inv.pricePerKg}/kg` : ""}
                                            </span>
                                          </div>
                                        </CommandItem>
                                      );
                                    })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="col-span-3 md:col-span-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={item.bagsMoved || ""}
                          onChange={(e) => {
                            const bags = Number(e.target.value) || 0;
                            if (selectedInv) {
                              const netWeight = calculateNetWeight(selectedInv, bags);
                              const amount = Math.round(item.pricePerKg * netWeight * 100) / 100;
                              updateItem(itemIndex, {
                                bagsMoved: bags,
                                totalWeight: Math.round(netWeight * 10) / 10,
                                netWeight: Math.round(netWeight * 10) / 10,
                                amount,
                              });
                            } else {
                              updateItem(itemIndex, { bagsMoved: bags });
                            }
                          }}
                          className="text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          data-testid={`input-loading-bags-${itemIndex}`}
                        />
                      </div>

                      <div className="col-span-3 md:col-span-2">
                        <div className="h-9 px-2 flex items-center justify-center bg-muted/50 rounded-md text-sm font-medium">
                          {(Number(item.netWeight) || 0).toFixed(1)}
                        </div>
                      </div>

                      <div className="col-span-2 md:col-span-1">
                        <Input
                          type="number"
                          step="any"
                          value={item.pricePerKg || ""}
                          onChange={(e) => {
                            const ppk = Number(e.target.value) || 0;
                            const amount = Math.round(ppk * (Number(item.netWeight) || 0) * 100) / 100;
                            updateItem(itemIndex, { pricePerKg: ppk, amount });
                          }}
                          className="text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          data-testid={`input-loading-price-${itemIndex}`}
                        />
                      </div>

                      <div className="col-span-3 md:col-span-2">
                        <div className="h-9 px-2 flex items-center justify-center bg-muted/50 rounded-md text-sm font-medium">
                          ₹{parseFloat((Number(item.amount) || 0).toFixed(1)).toLocaleString('en-IN')}
                        </div>
                      </div>

                      <div className="col-span-3 md:col-span-2">
                        <div className={cn(
                          "h-9 px-2 flex items-center justify-center rounded-md text-sm font-medium",
                          itemPL >= 0 ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                        )}>
                          {itemPL >= 0 ? "+" : ""}₹{parseFloat(Math.abs(itemPL).toFixed(1)).toLocaleString('en-IN')}
                        </div>
                      </div>

                      <div className="col-span-1">
                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(itemIndex)}
                            data-testid={`button-loading-remove-lot-${itemIndex}`}
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

              <div className="space-y-3">
                <Label className="text-xs font-semibold">{t("Mandi Charges", "मंडी शुल्क")}</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("Mandi Comm. %", "मंडी कमीशन %")}</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="any"
                        className="h-9 pr-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={mandiCommissionPct || ""}
                        placeholder="0"
                        onChange={(e) => setMandiCommissionPct(Number(e.target.value) || 0)}
                        data-testid="input-loading-mandi-commission"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-orange-500 font-mono mt-0.5">₹{computedMandiComm.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("Aadhat Comm. %", "आढ़त कमीशन %")}</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="any"
                        className="h-9 pr-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={aadhatCommissionPct || ""}
                        placeholder="0"
                        onChange={(e) => setAadhatCommissionPct(Number(e.target.value) || 0)}
                        data-testid="input-loading-aadhat-commission"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-orange-500 font-mono mt-0.5">₹{computedAadhatComm.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("Hammali ₹/bag", "हम्माली ₹/बोरी")}</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="any"
                        className="h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={hammaliPerBagRate || ""}
                        placeholder="0"
                        onChange={(e) => setHammaliPerBagRate(Number(e.target.value) || 0)}
                        data-testid="input-loading-hammali"
                      />
                    </div>
                    <p className="text-xs text-orange-500 font-mono mt-0.5">₹{computedHammali.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("Extra Charges", "अतिरिक्त शुल्क")}</Label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        step="any"
                        className="h-9 pl-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={editExtraCharges || ""}
                        placeholder="0"
                        onChange={(e) => setEditExtraCharges(Number(e.target.value) || 0)}
                        data-testid="input-loading-extra-charges"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {visibleCharges.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {visibleCharges.map((key) => {
                    const opt = ADDITIONAL_CHARGE_OPTIONS.find((o) => o.key === key)!;
                    return (
                      <div key={key}>
                        <Label className="text-[10px]">{t(opt.label, opt.labelHi)}</Label>
                        <div className="flex gap-0.5">
                          <Input
                            type="number"
                            step="any"
                            value={additionalCharges[key] || ""}
                            onChange={(e) => setAdditionalCharges((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                            placeholder="0"
                            className="h-8 text-sm px-2"
                            data-testid={`input-loading-${key}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
                            onClick={() => {
                              setVisibleCharges((prev) => prev.filter((k) => k !== key));
                              setAdditionalCharges((prev) => ({ ...prev, [key]: 0 }));
                            }}
                            data-testid={`button-remove-charge-${key}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {visibleCharges.length < ADDITIONAL_CHARGE_OPTIONS.length && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" data-testid="button-add-charges">
                      <Plus className="h-3.5 w-3.5" />
                      {t("Add Charges", "शुल्क जोड़ें")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="start">
                    {ADDITIONAL_CHARGE_OPTIONS.filter((o) => !visibleCharges.includes(o.key)).map((opt) => (
                      <Button
                        key={opt.key}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs"
                        onClick={() => setVisibleCharges((prev) => [...prev, opt.key])}
                        data-testid={`button-charge-option-${opt.key}`}
                      >
                        {t(opt.label, opt.labelHi)}
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">{t("Sales Comm. %", "बिक्री कमीशन %")}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="any"
                      className="pr-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={salesCommissionPct || ""}
                      onChange={(e) => setSalesCommissionPct(Number(e.target.value) || 0)}
                      placeholder="0"
                      data-testid="input-loading-sales-commission"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-orange-500 font-mono mt-0.5">₹{computedSalesComm.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <Label className="text-xs">{t("Driver Advance", "ड्राइवर अग्रिम")}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={driverAdvance || ""}
                    onChange={(e) => setDriverAdvance(Number(e.target.value) || 0)}
                    placeholder="0"
                    data-testid="input-loading-driver-advance"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("Advance Amount", "अग्रिम राशि")}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={advanceAmount || ""}
                    onChange={(e) => setAdvanceAmount(Number(e.target.value) || 0)}
                    placeholder="0"
                    data-testid="input-loading-advance-amount"
                  />
                </div>
              </div>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
                    <div>
                      <p className="text-base font-bold">{totals.totalBags}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        <Package className="h-3 w-3" />
                        {t("Bags", "बोरी")}
                      </p>
                    </div>
                    <div>
                      <p className="text-base font-bold">{totals.totalNetWeight.toFixed(1)}</p>
                      <p className="text-[10px] text-muted-foreground">{t("Net Wt (Kg)", "शुद्ध वजन (किग्रा)")}</p>
                    </div>
                    <div>
                      <p className="text-base font-bold">₹{parseFloat(totals.totalAmount.toFixed(1)).toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-muted-foreground">{t("Total Amount", "कुल राशि")}</p>
                    </div>
                    <div>
                      <p className="text-base font-bold">₹{parseFloat(totalMandiCharges.toFixed(1)).toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-muted-foreground">{t("Mandi Charges", "मंडी शुल्क")}</p>
                    </div>
                    <div>
                      <p className={`text-base font-bold ${totals.totalPL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {totals.totalPL >= 0 ? "+" : ""}₹{parseFloat(Math.abs(totals.totalPL).toFixed(1)).toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{t("Total P&L", "कुल लाभ/हानि")}</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-primary">₹{parseFloat(totals.grandTotal.toFixed(1)).toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        <IndianRupee className="h-3 w-3" />
                        {t("Grand Total", "कुल योग")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleCancel}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              data-testid="button-save-loading"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("Save Loading", "लोडिंग सेव करें")}
            </Button>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
