import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Truck, Loader2, Package, IndianRupee } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UnsoldInventoryItem {
  breakdownId: number | null;
  lotId: number;
  serialNumber: number;
  coldStoreName: string;
  farmerName: string;
  potatoType: string;
  quality: string;
  cutType: string;
  size: string | null;
  pricePerKg: string | null;
  remainingBags: number;
  originalBags: number;
}

const transactionItemSchema = z.object({
  inventoryKey: z.string().min(1, "Selection is required"),
  bagsMoved: z.coerce.number().min(1, "Must move at least 1 bag"),
  netWeight: z.coerce.number().optional(),
});

const transactionFormSchema = z.object({
  partyName: z.string().optional(),
  vehicleNumber: z.string().optional(),
  advancePayment: z.coerce.number().optional(),
  transportationCharges: z.coerce.number().optional(),
  otherCharges: z.coerce.number().optional(),
  revenue: z.coerce.number().optional(),
  items: z.array(transactionItemSchema).min(1, "At least one lot is required"),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

interface LoadTruckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoadTruckDialog({ open, onOpenChange }: LoadTruckDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: inventory = [], isLoading: loadingInventory } = useQuery<UnsoldInventoryItem[]>({
    queryKey: ["/api/inventory/unsold"],
    enabled: open,
  });

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      partyName: "",
      vehicleNumber: "",
      advancePayment: undefined,
      transportationCharges: undefined,
      otherCharges: undefined,
      revenue: undefined,
      items: [{ inventoryKey: "", bagsMoved: 0, netWeight: undefined }],
    },
  });

  // Helper to generate unique key for inventory item
  const getInventoryKey = (item: UnsoldInventoryItem) => {
    return `${item.lotId}-${item.breakdownId || 'lot'}`;
  };

  // Helper to find inventory item by key
  const findInventoryByKey = (key: string) => {
    return inventory.find(inv => getInventoryKey(inv) === key);
  };

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = form.watch("items");
  const watchedAdvance = form.watch("advancePayment") || 0;
  const watchedTransport = form.watch("transportationCharges") || 0;
  const watchedOther = form.watch("otherCharges") || 0;
  const watchedRevenue = form.watch("revenue") || 0;

  const calculations = useMemo(() => {
    let totalBags = 0;
    let totalNetWeight = 0;
    let totalCostOfGoods = 0;

    watchedItems.forEach((item) => {
      const invItem = findInventoryByKey(item.inventoryKey);
      const pricePerKg = invItem?.pricePerKg ? parseFloat(invItem.pricePerKg) : 0;
      const netWeight = Number(item.netWeight) || 0;
      const costOfGoods = netWeight * pricePerKg;

      totalBags += Number(item.bagsMoved) || 0;
      totalNetWeight += netWeight;
      totalCostOfGoods += costOfGoods;
    });

    const revenue = Number(watchedRevenue) || 0;
    const transport = Number(watchedTransport) || 0;
    const other = Number(watchedOther) || 0;
    const profitLoss = revenue - totalCostOfGoods - transport - other;

    return {
      totalBags: isNaN(totalBags) ? 0 : totalBags,
      totalNetWeight: isNaN(totalNetWeight) ? 0 : totalNetWeight,
      totalCostOfGoods: isNaN(totalCostOfGoods) ? 0 : totalCostOfGoods,
      profitLoss: isNaN(profitLoss) ? 0 : profitLoss,
    };
  }, [watchedItems, inventory, watchedRevenue, watchedTransport, watchedOther]);

  const createMutation = useMutation({
    mutationFn: async (data: TransactionFormData) => {
      return apiRequest("POST", "/api/transactions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/unsold"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      toast({
        title: t("Transaction Created", "लेनदेन बनाया गया"),
        description: t("Truck loaded successfully", "ट्रक सफलतापूर्वक लोड किया गया"),
      });
      form.reset();
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

  const onSubmit = (data: TransactionFormData) => {
    createMutation.mutate(data);
  };

  const getSelectedKeys = () => {
    return watchedItems.map((item) => item.inventoryKey).filter((key) => key && key.length > 0);
  };

  const getItemCost = (item: typeof watchedItems[0]) => {
    const invItem = findInventoryByKey(item.inventoryKey);
    const pricePerKg = invItem?.pricePerKg ? parseFloat(invItem.pricePerKg) : 0;
    const netWeight = Number(item.netWeight) || 0;
    const cost = netWeight * pricePerKg;
    return isNaN(cost) ? 0 : cost;
  };

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {t("Load A Truck", "ट्रक लोड करें")}
          </DialogTitle>
          <DialogDescription>
            {t("Select inventory lots to load onto a truck for delivery", "डिलीवरी के लिए ट्रक पर लोड करने के लिए इन्वेंटरी लॉट चुनें")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="partyName">{t("Party Name (Optional)", "पार्टी का नाम (वैकल्पिक)")}</Label>
              <Input
                id="partyName"
                {...form.register("partyName")}
                placeholder={t("Enter buyer/party name", "खरीदार/पार्टी का नाम दर्ज करें")}
                data-testid="input-party-name"
              />
            </div>
            <div>
              <Label htmlFor="vehicleNumber">{t("Vehicle # (Optional)", "वाहन नं (वैकल्पिक)")}</Label>
              <Input
                id="vehicleNumber"
                {...form.register("vehicleNumber")}
                placeholder={t("Enter vehicle number", "वाहन नंबर दर्ज करें")}
                data-testid="input-vehicle-number"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t("Select Inventory Lots", "इन्वेंटरी लॉट चुनें")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ inventoryKey: "", bagsMoved: 0, netWeight: undefined })}
                data-testid="button-add-lot"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Lot", "लॉट जोड़ें")}
              </Button>
            </div>

            {fields.map((field, index) => {
              const selectedItem = watchedItems[index];
              const selectedInv = findInventoryByKey(selectedItem?.inventoryKey || "");
              const itemCost = getItemCost(selectedItem);
              const selectedKeys = getSelectedKeys();

              return (
                <Card key={field.id}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-5">
                        <Label className="text-xs">{t("Lot", "लॉट")}</Label>
                        <Select
                          value={selectedItem?.inventoryKey || ""}
                          onValueChange={(value) => {
                            form.setValue(`items.${index}.inventoryKey`, value);
                            const inv = findInventoryByKey(value);
                            if (inv) {
                              form.setValue(`items.${index}.bagsMoved`, inv.remainingBags);
                            }
                          }}
                        >
                          <SelectTrigger data-testid={`select-lot-${index}`}>
                            <SelectValue placeholder={t("Select lot...", "लॉट चुनें...")} />
                          </SelectTrigger>
                          <SelectContent>
                            {inventory
                              .filter((inv) => {
                                const key = getInventoryKey(inv);
                                return !selectedKeys.includes(key) || key === selectedItem?.inventoryKey;
                              })
                              .map((inv) => {
                                const key = getInventoryKey(inv);
                                return (
                                  <SelectItem key={key} value={key}>
                                    S#{inv.serialNumber} - {inv.coldStoreName} - {inv.potatoType} - {inv.size || "Mixed"} ({inv.remainingBags} {t("bags", "बोरी")})
                                  </SelectItem>
                                );
                              })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label className="text-xs">{t("Bags", "बोरी")}</Label>
                        <Input
                          type="number"
                          {...form.register(`items.${index}.bagsMoved`)}
                          max={selectedInv?.remainingBags || 999}
                          data-testid={`input-bags-${index}`}
                        />
                      </div>

                      <div className="col-span-2">
                        <Label className="text-xs">{t("Weight (Kg)", "वजन (किग्रा)")}</Label>
                        <Input
                          type="number"
                          step="0.1"
                          {...form.register(`items.${index}.netWeight`)}
                          data-testid={`input-weight-${index}`}
                        />
                      </div>

                      <div className="col-span-2">
                        <Label className="text-xs">{t("Cost", "लागत")}</Label>
                        <div className="h-9 px-3 flex items-center bg-muted/50 rounded-md text-sm font-medium">
                          ₹{itemCost.toFixed(2)}
                        </div>
                      </div>

                      <div className="col-span-1">
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            data-testid={`button-remove-lot-${index}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {selectedInv && (
                      <div className="text-xs text-muted-foreground grid grid-cols-4 gap-2">
                        <span>{selectedInv.potatoType}</span>
                        <span>{selectedInv.quality} - {selectedInv.size || "Mixed"}</span>
                        <span>{selectedInv.pricePerKg ? `₹${selectedInv.pricePerKg}/kg` : "—"}</span>
                        <span>{t("Available:", "उपलब्ध:")} {selectedInv.remainingBags}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {form.formState.errors.items && (
              <p className="text-sm text-destructive">{form.formState.errors.items.message}</p>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">{t("Advance to Driver", "ड्राइवर को अग्रिम")}</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("advancePayment")}
                placeholder="0"
                data-testid="input-advance"
              />
            </div>
            <div>
              <Label className="text-xs">{t("Transport Charges", "परिवहन शुल्क")}</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("transportationCharges")}
                placeholder="0"
                data-testid="input-transport"
              />
            </div>
            <div>
              <Label className="text-xs">{t("Other Charges", "अन्य शुल्क")}</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("otherCharges")}
                placeholder="0"
                data-testid="input-other"
              />
            </div>
            <div>
              <Label className="text-xs">{t("Revenue", "राजस्व")}</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("revenue")}
                placeholder="0"
                data-testid="input-revenue"
              />
            </div>
          </div>

          <Separator />

          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{calculations.totalBags}</p>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Package className="h-3 w-3" />
                    {t("Total Bags", "कुल बोरी")}
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{calculations.totalNetWeight.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">{t("Total Weight (Kg)", "कुल वजन (किग्रा)")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">₹{calculations.totalCostOfGoods.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <IndianRupee className="h-3 w-3" />
                    {t("Total Cost", "कुल लागत")}
                  </p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${calculations.profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {calculations.profitLoss >= 0 ? "+" : ""}₹{calculations.profitLoss.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Profit/Loss", "लाभ/हानि")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-transaction">
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("Save Transaction", "लेनदेन सेव करें")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
