import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, History, Save, Plus, Trash2, X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TransactionItem {
  id: number;
  lotId: number;
  breakdownId: number | null;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  netWeight: string | null;
}

interface UnsoldInventoryItem {
  breakdownId: number | null;
  lotId: number;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string;
  size: string | null;
  remainingBags: number;
}

interface EditableItem {
  id?: number;
  lotId: number;
  breakdownId: number | null;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  originalBags: number;
  inventoryKey?: string;
  action: 'keep' | 'update' | 'add' | 'remove';
}

interface EditHistoryChange {
  field: string;
  oldValue: string | number | null;
  newValue: string | number | null;
}

interface EditHistoryEntry {
  id: number;
  changedAt: string;
  userName?: string;
  changeSet: EditHistoryChange[];
}

interface TransactionWithHistory {
  id: number;
  transactionNumber: number;
  partyName: string | null;
  vehicleNumber: string | null;
  advancePayment: string | null;
  transportationCharges: string | null;
  otherCharges: string | null;
  revenue: string | null;
  totalBags: number;
  totalNetWeight: string | null;
  totalCostOfGoods: string | null;
  profitLoss: string | null;
  createdAt: string;
  items: TransactionItem[];
  editHistory: EditHistoryEntry[];
}

const editTransactionSchema = z.object({
  partyName: z.string().optional(),
  vehicleNumber: z.string().optional(),
  advancePayment: z.coerce.number().optional(),
  transportationCharges: z.coerce.number().optional(),
  otherCharges: z.coerce.number().optional(),
  revenue: z.coerce.number().optional(),
});

type EditTransactionFormData = z.infer<typeof editTransactionSchema>;

interface EditTransactionDialogProps {
  transactionId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ProfitLossDisplay({ 
  totalCostOfGoods, 
  revenue, 
  transportationCharges, 
  otherCharges 
}: { 
  totalCostOfGoods: number; 
  revenue: number | undefined; 
  transportationCharges: number | undefined; 
  otherCharges: number | undefined;
}) {
  const { t } = useLanguage();
  const safeRevenue = Number(revenue) || 0;
  const safeTrans = Number(transportationCharges) || 0;
  const safeOther = Number(otherCharges) || 0;
  const safeCost = Number(totalCostOfGoods) || 0;
  const profitLoss = safeRevenue - safeCost - safeTrans - safeOther;
  
  return (
    <div className="bg-muted/50 p-4 rounded-md">
      <div className="flex justify-between items-center">
        <span className="font-medium">{t("Profit/Loss", "लाभ/हानि")}</span>
        <span className={`text-xl font-bold ${profitLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {profitLoss >= 0 ? "+" : ""}₹{profitLoss.toFixed(2)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {t("Revenue", "राजस्व")} (₹{safeRevenue.toFixed(0)}) - {t("Cost", "लागत")} (₹{safeCost.toFixed(0)}) - {t("Charges", "शुल्क")} (₹{(safeTrans + safeOther).toFixed(0)})
      </p>
    </div>
  );
}

export function EditTransactionDialog({ transactionId, open, onOpenChange }: EditTransactionDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<string>("");
  const [newItemBags, setNewItemBags] = useState<number>(0);

  const { data: transaction, isLoading } = useQuery<TransactionWithHistory>({
    queryKey: ["/api/transactions", transactionId],
    enabled: !!transactionId && open,
  });

  const { data: unsoldInventory } = useQuery<UnsoldInventoryItem[]>({
    queryKey: ["/api/inventory/unsold"],
    enabled: open && showAddItem,
  });

  const form = useForm<EditTransactionFormData>({
    resolver: zodResolver(editTransactionSchema),
    defaultValues: {
      partyName: "",
      vehicleNumber: "",
      advancePayment: undefined,
      transportationCharges: undefined,
      otherCharges: undefined,
      revenue: undefined,
    },
  });

  useEffect(() => {
    if (transaction) {
      form.reset({
        partyName: transaction.partyName || "",
        vehicleNumber: transaction.vehicleNumber || "",
        advancePayment: transaction.advancePayment ? parseFloat(transaction.advancePayment) : undefined,
        transportationCharges: transaction.transportationCharges ? parseFloat(transaction.transportationCharges) : undefined,
        otherCharges: transaction.otherCharges ? parseFloat(transaction.otherCharges) : undefined,
        revenue: transaction.revenue ? parseFloat(transaction.revenue) : undefined,
      });
      setEditableItems(transaction.items.map(item => ({
        id: item.id,
        lotId: item.lotId,
        breakdownId: item.breakdownId,
        serialNumber: item.serialNumber,
        coldStoreName: item.coldStoreName,
        potatoType: item.potatoType,
        size: item.size,
        bagsMoved: item.bagsMoved,
        originalBags: item.bagsMoved,
        action: 'keep' as const
      })));
    }
  }, [transaction, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditTransactionFormData) => {
      return apiRequest("PATCH", `/api/transactions/${transactionId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/unsold"] });
      setShowAddItem(false);
      setSelectedInventory("");
      setNewItemBags(0);
      toast({
        title: t("Transaction Updated", "लेनदेन अपडेट किया गया"),
        description: t("Changes saved successfully", "परिवर्तन सफलतापूर्वक सहेजे गए"),
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

  const updateItemsMutation = useMutation({
    mutationFn: async () => {
      const itemsToSend = editableItems.map(item => ({
        id: item.id,
        inventoryKey: item.inventoryKey,
        bagsMoved: item.bagsMoved,
        action: item.action
      }));
      return apiRequest("PUT", `/api/transactions/${transactionId}/items`, { items: itemsToSend });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/unsold"] });
      setShowAddItem(false);
      setSelectedInventory("");
      setNewItemBags(0);
      toast({
        title: t("Items Updated", "आइटम अपडेट किए गए"),
        description: t("Transaction items saved successfully", "लेनदेन आइटम सफलतापूर्वक सहेजे गए"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message || t("Failed to update items", "आइटम अपडेट करने में विफल"),
        variant: "destructive",
      });
    },
  });

  const handleBagCountChange = (index: number, newBags: number) => {
    setEditableItems(items => items.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        bagsMoved: newBags,
        action: item.id ? (newBags !== item.originalBags ? 'update' : 'keep') : 'add'
      };
    }));
  };

  const handleRemoveItem = (index: number) => {
    setEditableItems(items => {
      const item = items[index];
      if (!item) return items;
      
      // If it's a newly added item (no id), just filter it out
      if (!item.id) {
        return items.filter((_, i) => i !== index);
      }
      
      // If it's an existing item, mark for removal (will be hidden but sent to server)
      return items.map((it, i) => 
        i === index ? { ...it, action: 'remove' as const } : it
      );
    });
  };

  const handleAddItem = () => {
    if (!selectedInventory || newItemBags <= 0) return;
    
    const inv = unsoldInventory?.find(i => 
      `${i.lotId}-${i.breakdownId || 'lot'}` === selectedInventory
    );
    if (!inv) return;
    
    setEditableItems(items => [...items, {
      lotId: inv.lotId,
      breakdownId: inv.breakdownId,
      serialNumber: inv.serialNumber,
      coldStoreName: inv.coldStoreName,
      potatoType: inv.potatoType,
      size: inv.size,
      bagsMoved: newItemBags,
      originalBags: 0,
      inventoryKey: selectedInventory,
      action: 'add' as const
    }]);
    
    setSelectedInventory("");
    setNewItemBags(0);
    setShowAddItem(false);
  };

  const hasItemChanges = editableItems.some(item => item.action !== 'keep');

  const onSubmit = (data: EditTransactionFormData) => {
    updateMutation.mutate(data);
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      partyName: t("Party Name", "पार्टी का नाम"),
      vehicleNumber: t("Vehicle #", "वाहन नं"),
      advancePayment: t("Advance Payment", "अग्रिम भुगतान"),
      transportationCharges: t("Transportation", "परिवहन"),
      otherCharges: t("Other Charges", "अन्य शुल्क"),
      revenue: t("Revenue", "राजस्व"),
      profitLoss: t("Profit/Loss", "लाभ/हानि"),
    };
    return labels[field] || field;
  };

  const formatValue = (value: string | number | null): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "number") return value.toString();
    return value || "-";
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("Edit Transaction", "लेनदेन संपादित करें")} #{transaction?.transactionNumber}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : transaction ? (
          <div className="space-y-6">
            <div className="bg-muted/50 p-4 rounded-md space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-medium text-sm">{t("Items in Transaction", "लेनदेन में आइटम")}</h4>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowAddItem(!showAddItem)}
                  data-testid="button-add-item"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t("Add Lot", "लॉट जोड़ें")}
                </Button>
              </div>

              {showAddItem && (
                <div className="border rounded-md p-3 space-y-2 bg-background">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">{t("Select from Inventory", "इन्वेंट्री से चुनें")}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setShowAddItem(false);
                        setSelectedInventory("");
                        setNewItemBags(0);
                      }}
                      data-testid="button-close-add-lot"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Select value={selectedInventory} onValueChange={setSelectedInventory}>
                    <SelectTrigger data-testid="select-inventory">
                      <SelectValue placeholder={t("Choose lot", "लॉट चुनें")} />
                    </SelectTrigger>
                    <SelectContent>
                      {unsoldInventory?.map((inv) => (
                        <SelectItem 
                          key={`${inv.lotId}-${inv.breakdownId || 'lot'}`} 
                          value={`${inv.lotId}-${inv.breakdownId || 'lot'}`}
                        >
                          S#{inv.serialNumber} - {inv.coldStoreName} - {inv.potatoType} - {inv.size || "Mixed"} ({inv.remainingBags} {t("available", "उपलब्ध")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      placeholder={t("Bags", "बोरी")}
                      value={newItemBags || ""}
                      onChange={(e) => setNewItemBags(parseInt(e.target.value) || 0)}
                      className="w-24"
                      data-testid="input-new-item-bags"
                    />
                    <Button type="button" size="sm" onClick={handleAddItem} data-testid="button-confirm-add">
                      {t("Add", "जोड़ें")}
                    </Button>
                  </div>
                </div>
              )}

              {editableItems.map((item, index) => 
                item.action === 'remove' ? null : (
                  <div key={item.id || `new-${index}`} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">
                      S#{item.serialNumber} - {item.coldStoreName} - {item.potatoType} - {item.size || "Mixed"}
                    </span>
                    <Input
                      type="number"
                      min="1"
                      value={item.bagsMoved}
                      onChange={(e) => handleBagCountChange(index, parseInt(e.target.value) || 0)}
                      className="w-20 h-8"
                      data-testid={`input-item-bags-${index}`}
                    />
                    <span className="text-muted-foreground text-xs">{t("bags", "बोरी")}</span>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemoveItem(index)}
                      data-testid={`button-remove-item-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              )}

              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>{t("Total", "कुल")}</span>
                <span>
                  {editableItems.filter(i => i.action !== 'remove').reduce((sum, i) => sum + i.bagsMoved, 0)} {t("bags", "बोरी")}
                </span>
              </div>

              {hasItemChanges && (
                <Button 
                  type="button" 
                  className="w-full" 
                  onClick={() => updateItemsMutation.mutate()}
                  disabled={updateItemsMutation.isPending}
                  data-testid="button-save-items"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateItemsMutation.isPending ? t("Saving Items...", "आइटम सहेज रहा है...") : t("Save Item Changes", "आइटम परिवर्तन सहेजें")}
                </Button>
              )}
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="partyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Party Name", "पार्टी का नाम")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("Enter party name", "पार्टी का नाम दर्ज करें")} {...field} data-testid="input-party-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vehicleNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Vehicle #", "वाहन नं")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("Enter vehicle number", "वाहन नंबर दर्ज करें")} {...field} data-testid="input-vehicle-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="advancePayment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Advance Payment", "अग्रिम भुगतान")} (₹)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0" {...field} data-testid="input-advance-payment" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="revenue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Revenue", "राजस्व")} (₹)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0" {...field} data-testid="input-revenue" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="transportationCharges"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Transportation", "परिवहन")} (₹)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0" {...field} data-testid="input-transportation" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="otherCharges"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Other Charges", "अन्य शुल्क")} (₹)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0" {...field} data-testid="input-other-charges" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <ProfitLossDisplay 
                  totalCostOfGoods={parseFloat(transaction.totalCostOfGoods || "0")}
                  revenue={form.watch("revenue") || 0}
                  transportationCharges={form.watch("transportationCharges") || 0}
                  otherCharges={form.watch("otherCharges") || 0}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
                    {t("Cancel", "रद्द करें")}
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save">
                    <Save className="h-4 w-4 mr-2" />
                    {updateMutation.isPending ? t("Saving...", "सहेज रहा है...") : t("Save Changes", "परिवर्तन सहेजें")}
                  </Button>
                </div>
              </form>
            </Form>

            {transaction.editHistory && transaction.editHistory.length > 0 && (
              <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="border-t pt-4">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between" data-testid="button-toggle-history">
                    <span className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      {t("Edit History", "संपादन इतिहास")} ({transaction.editHistory.length})
                    </span>
                    {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3">
                  {transaction.editHistory.map((entry) => (
                    <div key={entry.id} className="bg-muted/30 p-3 rounded-md text-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{entry.userName || t("Unknown User", "अज्ञात उपयोगकर्ता")}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.changedAt).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {entry.changeSet
                          .filter((change) => {
                            const oldVal = formatValue(change.oldValue);
                            const newVal = formatValue(change.newValue);
                            return oldVal !== newVal;
                          })
                          .map((change, idx) => (
                          <li key={idx} className="text-muted-foreground">
                            <span className="font-medium">{getFieldLabel(change.field)}</span>: {formatValue(change.oldValue)} → {formatValue(change.newValue)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            {t("Transaction not found", "लेनदेन नहीं मिला")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
