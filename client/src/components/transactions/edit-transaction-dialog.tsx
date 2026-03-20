import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronUp, History, Save, Plus, Trash2, X, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Buyer } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TransactionItem {
  id: number;
  lotId: number;
  breakdownId: number | null;
  serialNumber: number;
  place?: string;
  coldStoreName: string;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  netWeight: string | null;
  pricePerKgSnapshot: string | null;
  costOfGoods: string | null;
  revenue: string | null;
  pricePerKg: string | null;
  amount: string | null;
  lotSourceWeight: number;
  lotSourceBags: number;
  mandiCommissionPercent: string | null;
  aadhatCommissionPercent: string | null;
  hammaliPerBag: string | null;
  mandiExtraCharges: string | null;
  lotOriginalBags: number;
}

interface UnsoldInventoryItem {
  breakdownId: number | null;
  lotId: number;
  serialNumber: number;
  place?: string;
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

interface EditableItem {
  id?: number;
  lotId: number;
  breakdownId: number | null;
  serialNumber: number;
  place?: string;
  coldStoreName: string;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  originalBags: number;
  netWeight: number;
  originalNetWeight: number;
  pricePerKg: number;
  costOfGoods: number;
  revenue: number;
  originalRevenue: number;
  loadingPricePerKg: number;
  loadingAmount: number;
  inventoryKey?: string;
  lotSourceWeight: number;
  lotSourceBags: number;
  mandiCommissionPercent: string | null;
  aadhatCommissionPercent: string | null;
  hammaliPerBag: string | null;
  mandiExtraCharges: string | null;
  lotOriginalBags: number;
  action: 'keep' | 'update' | 'add' | 'remove';
}

function lotPlaceLabel(place?: string, coldStoreName?: string): string {
  if (place === "farm_gate") return "Farm Gate";
  if (place === "mandi") return "Mandi";
  return coldStoreName || "-";
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
  transactionType: string | null;
  buyerId: number | null;
  partyName: string | null;
  partyAddress: string | null;
  vehicleNumber: string | null;
  driverContact: string | null;
  advancePayment: string | null;
  amountReceived: string | null;
  transportationCharges: string | null;
  otherCharges: string | null;
  revenue: string | null;
  remarks: string | null;
  totalBags: number;
  totalNetWeight: string | null;
  totalCostOfGoods: string | null;
  profitLoss: string | null;
  salesCommission: string | null;
  totalMandiCommission: string | null;
  totalAadhatCommission: string | null;
  totalHammali: string | null;
  totalMandiExtraCharges: string | null;
  createdAt: string;
  items: TransactionItem[];
  editHistory: EditHistoryEntry[];
}

const editTransactionSchema = z.object({
  partyName: z.string().optional(),
  vehicleNumber: z.string().optional(),
  driverContact: z.string().optional(),
  advancePayment: z.coerce.number().optional(),
  amountReceived: z.coerce.number().optional(),
  transportationCharges: z.coerce.number().optional(),
  otherCharges: z.coerce.number().optional(),
  remarks: z.string().optional(),
  salesCommission: z.coerce.number().optional(),
  totalMandiCommission: z.coerce.number().optional(),
  totalAadhatCommission: z.coerce.number().optional(),
  totalHammali: z.coerce.number().optional(),
  totalMandiExtraCharges: z.coerce.number().optional(),
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
  otherCharges,
  isLoadingType,
  salesCommission,
  mandiCharges
}: { 
  totalCostOfGoods: number; 
  revenue: number | undefined; 
  transportationCharges: number | undefined; 
  otherCharges: number | undefined;
  isLoadingType?: boolean;
  salesCommission?: number;
  mandiCharges?: number;
}) {
  const { t } = useLanguage();
  const safeRevenue = Number(revenue) || 0;
  const safeCost = Number(totalCostOfGoods) || 0;
  let profitLoss: number;
  let chargesLabel: string;
  let chargesAmount: number;

  if (isLoadingType) {
    const safeSC = Number(salesCommission) || 0;
    const safeMC = Number(mandiCharges) || 0;
    chargesAmount = safeSC + safeMC;
    profitLoss = safeRevenue - safeCost - chargesAmount;
    chargesLabel = t("Mandi+Commission", "मंडी+कमीशन");
  } else {
    const safeTrans = Number(transportationCharges) || 0;
    const safeOther = Number(otherCharges) || 0;
    chargesAmount = safeTrans + safeOther;
    profitLoss = safeRevenue - safeCost - chargesAmount;
    chargesLabel = t("Charges", "शुल्क");
  }
  
  return (
    <div className="bg-muted/50 p-4 rounded-md">
      <div className="flex justify-between items-center">
        <span className="font-medium">{t("Profit/Loss", "लाभ/हानि")}</span>
        <span className={`text-xl font-bold ${profitLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {profitLoss >= 0 ? "+" : ""}₹{parseFloat(profitLoss.toFixed(1)).toLocaleString('en-IN')}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {isLoadingType ? t("Amount", "राशि") : t("Revenue", "राजस्व")} (₹{parseFloat(safeRevenue.toFixed(1)).toLocaleString('en-IN')}) - {t("Cost", "लागत")} (₹{parseFloat(safeCost.toFixed(1)).toLocaleString('en-IN')}) - {chargesLabel} (₹{parseFloat(chargesAmount.toFixed(1)).toLocaleString('en-IN')})
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
  const [newItemWeight, setNewItemWeight] = useState<number>(0);
  const [newItemRevenue, setNewItemRevenue] = useState<number>(0);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [buyerPopoverOpen, setBuyerPopoverOpen] = useState(false);
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);

  const { data: buyers = [] } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers"],
    enabled: open,
  });

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
      driverContact: "",
      advancePayment: undefined,
      amountReceived: undefined,
      transportationCharges: undefined,
      otherCharges: undefined,
      remarks: "",
      salesCommission: undefined,
      totalMandiCommission: undefined,
      totalAadhatCommission: undefined,
      totalHammali: undefined,
      totalMandiExtraCharges: undefined,
    },
  });

  useEffect(() => {
    if (transaction) {
      form.reset({
        partyName: transaction.partyName || "",
        vehicleNumber: transaction.vehicleNumber || "",
        driverContact: transaction.driverContact || "",
        advancePayment: transaction.advancePayment ? parseFloat(transaction.advancePayment) : undefined,
        amountReceived: transaction.amountReceived ? parseFloat(transaction.amountReceived) : undefined,
        transportationCharges: transaction.transportationCharges && parseFloat(transaction.transportationCharges) !== 0 ? parseFloat(transaction.transportationCharges) : undefined,
        otherCharges: transaction.otherCharges && parseFloat(transaction.otherCharges) !== 0 ? parseFloat(transaction.otherCharges) : undefined,
        remarks: transaction.remarks || "",
        salesCommission: transaction.salesCommission ? parseFloat(transaction.salesCommission) : undefined,
        totalMandiCommission: transaction.totalMandiCommission ? parseFloat(transaction.totalMandiCommission) : undefined,
        totalAadhatCommission: transaction.totalAadhatCommission ? parseFloat(transaction.totalAadhatCommission) : undefined,
        totalHammali: transaction.totalHammali ? parseFloat(transaction.totalHammali) : undefined,
        totalMandiExtraCharges: transaction.totalMandiExtraCharges ? parseFloat(transaction.totalMandiExtraCharges) : undefined,
      });
      setSelectedBuyerId(transaction.buyerId || null);
      setEditableItems(transaction.items.map(item => ({
        id: item.id,
        lotId: item.lotId,
        breakdownId: item.breakdownId,
        serialNumber: item.serialNumber,
        place: item.place,
        coldStoreName: item.coldStoreName,
        potatoType: item.potatoType,
        size: item.size,
        bagsMoved: item.bagsMoved,
        originalBags: item.bagsMoved,
        netWeight: parseFloat(item.netWeight || "0"),
        originalNetWeight: parseFloat(item.netWeight || "0"),
        pricePerKg: parseFloat(item.pricePerKgSnapshot || "0"),
        costOfGoods: parseFloat(item.costOfGoods || "0"),
        revenue: parseFloat(item.revenue || "0"),
        originalRevenue: parseFloat(item.revenue || "0"),
        loadingPricePerKg: parseFloat(item.pricePerKg || "0"),
        loadingAmount: parseFloat(item.amount || "0"),
        lotSourceWeight: item.lotSourceWeight || 0,
        lotSourceBags: item.lotSourceBags || 0,
        mandiCommissionPercent: item.mandiCommissionPercent || null,
        aadhatCommissionPercent: item.aadhatCommissionPercent || null,
        hammaliPerBag: item.hammaliPerBag || null,
        mandiExtraCharges: item.mandiExtraCharges || null,
        lotOriginalBags: item.lotOriginalBags || 0,
        action: 'keep' as const
      })));
    }
  }, [transaction, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditTransactionFormData & { buyerId?: number | null }) => {
      return apiRequest("PATCH", `/api/transactions/${transactionId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/unsold"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
      setShowAddItem(false);
      setSelectedInventory("");
      setNewItemBags(0);
      toast({
        title: t("Transaction Updated", "लेनदेन अपडेट किया गया"),
        description: t("Changes saved successfully", "परिवर्तन सफलतापूर्वक सहेजे गए"),
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

  const isLoadingType = transaction?.transactionType === "loading";

  const computeItemMandiCharges = (item: EditableItem) => {
    const costBasis = item.costOfGoods || 0;
    const bags = item.bagsMoved || 0;
    const mc = item.mandiCommissionPercent ? (costBasis * parseFloat(item.mandiCommissionPercent)) / 100 : 0;
    const ac = item.aadhatCommissionPercent ? (costBasis * parseFloat(item.aadhatCommissionPercent)) / 100 : 0;
    const hm = item.hammaliPerBag ? bags * parseFloat(item.hammaliPerBag) : 0;
    const ec = item.mandiExtraCharges && item.lotOriginalBags > 0
      ? parseFloat(item.mandiExtraCharges) * (bags / item.lotOriginalBags) : 0;
    return {
      mc: Math.round(mc * 100) / 100,
      ac: Math.round(ac * 100) / 100,
      hm: Math.round(hm * 100) / 100,
      ec: Math.round(ec * 100) / 100,
    };
  };

  const adjustMandiCharges = (delta: { mc: number; ac: number; hm: number; ec: number }, sign: 1 | -1) => {
    const cur = {
      mc: Number(form.getValues("totalMandiCommission")) || 0,
      ac: Number(form.getValues("totalAadhatCommission")) || 0,
      hm: Number(form.getValues("totalHammali")) || 0,
      ec: Number(form.getValues("totalMandiExtraCharges")) || 0,
    };
    const updated = {
      mc: Math.round((cur.mc + sign * delta.mc) * 100) / 100,
      ac: Math.round((cur.ac + sign * delta.ac) * 100) / 100,
      hm: Math.round((cur.hm + sign * delta.hm) * 100) / 100,
      ec: Math.round((cur.ec + sign * delta.ec) * 100) / 100,
    };
    form.setValue("totalMandiCommission", updated.mc || undefined);
    form.setValue("totalAadhatCommission", updated.ac || undefined);
    form.setValue("totalHammali", updated.hm || undefined);
    form.setValue("totalMandiExtraCharges", updated.ec || undefined);
  };

  const updateItemsMutation = useMutation({
    mutationFn: async () => {
      const itemsToSend = editableItems.map(item => {
        const base: Record<string, unknown> = {
          id: item.id,
          inventoryKey: item.inventoryKey,
          bagsMoved: item.bagsMoved,
          netWeight: item.netWeight,
          revenue: item.revenue,
          action: item.action
        };
        if (transaction?.transactionType === "loading") {
          base.pricePerKg = item.loadingPricePerKg;
          base.amount = item.loadingAmount;
          base.revenue = item.loadingAmount;
        }
        return base;
      });
      return apiRequest("PUT", `/api/transactions/${transactionId}/items`, { items: itemsToSend });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/unsold"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
      setShowAddItem(false);
      setSelectedInventory("");
      setNewItemBags(0);
      toast({
        title: t("Items Updated", "आइटम अपडेट किए गए"),
        description: t("Transaction items saved successfully", "लेनदेन आइटम सफलतापूर्वक सहेजे गए"),
        variant: "success",
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
      let newWeight: number;
      if (item.lotSourceBags > 0) {
        const lotNetWeight = Math.max(0, item.lotSourceWeight - item.lotSourceBags);
        newWeight = parseFloat(((newBags / item.lotSourceBags) * lotNetWeight).toFixed(1));
      } else {
        const weightPerBag = item.originalBags > 0 ? item.originalNetWeight / item.originalBags : 0;
        newWeight = parseFloat((weightPerBag * newBags).toFixed(1));
      }
      const newLoadingAmount = isLoadingType ? parseFloat((item.loadingPricePerKg * newWeight).toFixed(2)) : item.loadingAmount;
      const newCostOfGoods = item.originalBags > 0
        ? parseFloat(((newBags / item.originalBags) * item.costOfGoods).toFixed(2))
        : item.costOfGoods;
      const hasChanges = newBags !== item.originalBags || newWeight !== item.originalNetWeight || item.revenue !== item.originalRevenue;
      return {
        ...item,
        bagsMoved: newBags,
        netWeight: newWeight,
        costOfGoods: newCostOfGoods,
        loadingAmount: newLoadingAmount,
        revenue: isLoadingType ? newLoadingAmount : item.revenue,
        action: item.id ? (hasChanges ? 'update' : 'keep') : 'add'
      };
    }));
  };

  const handleNetWeightChange = (index: number, newWeight: number) => {
    setEditableItems(items => items.map((item, i) => {
      if (i !== index) return item;
      const newLoadingAmount = isLoadingType ? parseFloat((item.loadingPricePerKg * newWeight).toFixed(2)) : item.loadingAmount;
      const newCostOfGoods = item.originalNetWeight > 0
        ? parseFloat(((newWeight / item.originalNetWeight) * item.costOfGoods).toFixed(2))
        : item.costOfGoods;
      const hasChanges = item.bagsMoved !== item.originalBags || newWeight !== item.originalNetWeight;
      return {
        ...item,
        netWeight: newWeight,
        costOfGoods: newCostOfGoods,
        loadingAmount: newLoadingAmount,
        revenue: isLoadingType ? newLoadingAmount : item.revenue,
        action: item.id ? (hasChanges ? 'update' : 'keep') : 'add'
      };
    }));
  };

  const handleLoadingPricePerKgChange = (index: number, newPpk: number) => {
    setEditableItems(items => items.map((item, i) => {
      if (i !== index) return item;
      const newAmount = parseFloat((newPpk * item.netWeight).toFixed(2));
      return {
        ...item,
        loadingPricePerKg: newPpk,
        loadingAmount: newAmount,
        revenue: newAmount,
        action: item.id ? 'update' : 'add'
      };
    }));
  };

  const handleRevenueChange = (index: number, newRevenue: number) => {
    setEditableItems(items => items.map((item, i) => {
      if (i !== index) return item;
      const hasChanges = item.bagsMoved !== item.originalBags || 
                        item.netWeight !== item.originalNetWeight ||
                        newRevenue !== item.originalRevenue;
      return {
        ...item,
        revenue: newRevenue,
        action: item.id ? (hasChanges ? 'update' : 'keep') : 'add'
      };
    }));
  };

  const handleRemoveItem = (index: number) => {
    setDeleteConfirmIndex(index);
  };

  const confirmRemoveItem = () => {
    if (deleteConfirmIndex === null) return;
    const index = deleteConfirmIndex;
    const removedItem = editableItems[index];
    
    if (removedItem && isLoadingType) {
      adjustMandiCharges(computeItemMandiCharges(removedItem), -1);
    }
    
    setEditableItems(items => {
      const item = items[index];
      if (!item) return items;
      
      if (!item.id) {
        return items.filter((_, i) => i !== index);
      }
      
      return items.map((it, i) => 
        i === index ? { ...it, action: 'remove' as const } : it
      );
    });
    
    setDeleteConfirmIndex(null);
  };

  const getNetWeightPerBag = (inv: UnsoldInventoryItem): number => {
    const bags = inv.originalBags || inv.lotOriginalBags || 1;
    return bags > 0 ? inv.netWeight / bags : 0;
  };

  const handleInventorySelect = (value: string) => {
    setSelectedInventory(value);
    const inv = unsoldInventory?.find(i => 
      `${i.lotId}-${i.breakdownId || 'lot'}` === value
    );
    if (inv) {
      const bags = inv.remainingBags;
      const nwpb = getNetWeightPerBag(inv);
      setNewItemBags(bags);
      setNewItemWeight(parseFloat((nwpb * bags).toFixed(1)));
      setNewItemRevenue(0);
    }
  };

  const handleAddItem = () => {
    if (!selectedInventory || newItemBags <= 0) return;
    
    const inv = unsoldInventory?.find(i => 
      `${i.lotId}-${i.breakdownId || 'lot'}` === selectedInventory
    );
    if (!inv) return;
    
    const costPerBag = inv.costPerBag || 0;
    const breakdownPricePerKg = inv.pricePerKg ? parseFloat(inv.pricePerKg) : 0;
    const costOfGoods = isLoadingType
      ? breakdownPricePerKg * newItemWeight
      : costPerBag * newItemBags;
    
    const loadingPpk = inv.pricePerKg ? parseFloat(inv.pricePerKg) : 0;
    const loadingAmt = isLoadingType ? parseFloat((loadingPpk * newItemWeight).toFixed(2)) : 0;
    
    setEditableItems(items => [...items, {
      lotId: inv.lotId,
      breakdownId: inv.breakdownId,
      serialNumber: inv.serialNumber,
      place: inv.place,
      coldStoreName: inv.coldStoreName,
      potatoType: inv.potatoType,
      size: inv.size,
      bagsMoved: newItemBags,
      originalBags: 0,
      netWeight: newItemWeight,
      originalNetWeight: 0,
      pricePerKg: isLoadingType ? breakdownPricePerKg : costPerBag,
      costOfGoods: costOfGoods,
      revenue: isLoadingType ? loadingAmt : newItemRevenue,
      originalRevenue: 0,
      loadingPricePerKg: loadingPpk,
      loadingAmount: loadingAmt,
      inventoryKey: selectedInventory,
      lotSourceWeight: parseFloat(inv.breakdownWeight || inv.totalWeight || "0"),
      lotSourceBags: inv.originalBags || inv.lotOriginalBags || 0,
      mandiCommissionPercent: inv.mandiCommissionPercent || null,
      aadhatCommissionPercent: inv.aadhatCommissionPercent || null,
      hammaliPerBag: inv.hammaliPerBag || null,
      mandiExtraCharges: inv.mandiExtraCharges || null,
      lotOriginalBags: inv.lotOriginalBags || 0,
      action: 'add' as const
    }]);
    
    if (isLoadingType) {
      const newItem: EditableItem = {
        lotId: inv.lotId, breakdownId: inv.breakdownId, serialNumber: inv.serialNumber,
        place: inv.place, coldStoreName: inv.coldStoreName, potatoType: inv.potatoType, size: inv.size,
        bagsMoved: newItemBags, originalBags: 0, netWeight: newItemWeight, originalNetWeight: 0,
        pricePerKg: isLoadingType ? breakdownPricePerKg : costPerBag, costOfGoods,
        revenue: isLoadingType ? loadingAmt : newItemRevenue, originalRevenue: 0,
        loadingPricePerKg: loadingPpk, loadingAmount: loadingAmt,
        lotSourceWeight: 0, lotSourceBags: 0,
        mandiCommissionPercent: inv.mandiCommissionPercent || null,
        aadhatCommissionPercent: inv.aadhatCommissionPercent || null,
        hammaliPerBag: inv.hammaliPerBag || null,
        mandiExtraCharges: inv.mandiExtraCharges || null,
        lotOriginalBags: inv.lotOriginalBags || 0,
        action: 'add',
      };
      adjustMandiCharges(computeItemMandiCharges(newItem), 1);
    }
    
    setSelectedInventory("");
    setNewItemBags(0);
    setNewItemWeight(0);
    setNewItemRevenue(0);
    setShowAddItem(false);
  };

  const hasItemChanges = editableItems.some(item => item.action !== 'keep');

  const onSubmit = (data: EditTransactionFormData) => {
    updateMutation.mutate({ ...data, buyerId: selectedBuyerId });
    // Also update items (bags, weights, revenue) if there are any changes
    if (hasItemChanges) {
      updateItemsMutation.mutate();
    }
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      partyName: t("Buyer Name", "खरीदार का नाम"),
      vehicleNumber: t("Vehicle #", "वाहन नं"),
      driverContact: t("Driver Contact", "ड्राइवर संपर्क"),
      advancePayment: t("Advance Payment", "अग्रिम भुगतान"),
      transportationCharges: t("Transportation", "परिवहन"),
      otherCharges: t("Other Charges", "अन्य शुल्क"),
      revenue: t("Revenue", "राजस्व"),
      profitLoss: t("Profit/Loss", "लाभ/हानि"),
      salesCommission: t("Sales Commission", "बिक्री कमीशन"),
      totalMandiCommission: t("Mandi Commission", "मंडी कमीशन"),
      totalAadhatCommission: t("Aadhat Commission", "आढ़त कमीशन"),
      totalHammali: t("Hammali", "हम्माली"),
      totalMandiExtraCharges: t("Extra Charges", "अतिरिक्त शुल्क"),
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
      <DialogContent className={`w-[95vw] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border-t-4 ${isLoadingType ? "border-t-blue-500 dark:border-t-blue-400" : "border-t-emerald-500 dark:border-t-emerald-400"}`}>
        <DialogHeader className={`shrink-0 -mx-6 -mt-6 px-6 pt-6 pb-4 rounded-t-lg ${isLoadingType ? "bg-blue-50/50 dark:bg-blue-950/30" : "bg-emerald-50/50 dark:bg-emerald-950/30"}`}>
          <DialogTitle className={isLoadingType ? "text-blue-700 dark:text-blue-300" : "text-emerald-700 dark:text-emerald-300"}>
            {t("Edit Transaction", "लेनदेन संपादित करें")} #{transaction?.transactionNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : transaction ? (
          <>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="partyName"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("Buyer Name", "खरीदार का नाम")}</FormLabel>
                    <Popover open={buyerPopoverOpen} onOpenChange={setBuyerPopoverOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={buyerPopoverOpen}
                            className={cn(
                              "justify-between font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="select-buyer-name"
                          >
                            {field.value || t("Select buyer...", "खरीदार चुनें...")}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t("Search buyer...", "खरीदार खोजें...")} />
                          <CommandList>
                            <CommandEmpty>{t("No buyer found.", "कोई खरीदार नहीं मिला।")}</CommandEmpty>
                            <CommandGroup>
                              {buyers.filter(b => b.isActive !== false).map((buyer) => (
                                <CommandItem
                                  key={buyer.id}
                                  value={buyer.name}
                                  onSelect={() => {
                                    field.onChange(buyer.name);
                                    setSelectedBuyerId(buyer.id);
                                    setBuyerPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === buyer.name ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {buyer.name}
                                  {buyer.address && <span className="ml-1 text-xs text-muted-foreground">({buyer.address})</span>}
                                  {buyer.redFlag && (
                                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                      Red Flag
                                    </span>
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vehicleNumber"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("Vehicle #", "वाहन नं")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("Enter vehicle number", "वाहन नंबर दर्ज करें")} {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} data-testid="input-vehicle-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="driverContact"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("Driver Contact", "ड्राइवर संपर्क")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("Enter driver contact", "ड्राइवर संपर्क दर्ज करें")} {...field} data-testid="input-driver-contact" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="advancePayment"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("Driver Advance", "ड्राइवर अग्रिम")} (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" placeholder="0" {...field} data-testid="input-advance-payment" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                        setNewItemWeight(0);
                        setNewItemRevenue(0);
                      }}
                      data-testid="button-close-add-lot"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Select value={selectedInventory} onValueChange={handleInventorySelect}>
                    <SelectTrigger data-testid="select-inventory">
                      <SelectValue placeholder={t("Choose lot", "लॉट चुनें")} />
                    </SelectTrigger>
                    <SelectContent>
                      {unsoldInventory?.map((inv) => (
                        <SelectItem 
                          key={`${inv.lotId}-${inv.breakdownId || 'lot'}`} 
                          value={`${inv.lotId}-${inv.breakdownId || 'lot'}`}
                        >
                          S#{inv.serialNumber} - {lotPlaceLabel(inv.place, inv.coldStoreName)} - {inv.potatoType} - {inv.size || "Mixed"} ({inv.remainingBags} {t("available", "उपलब्ध")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedInventory && (
                    <div className="text-xs text-muted-foreground">
                      {isLoadingType
                        ? `${t("₹/Kg", "₹/किग्रा")}: ₹${parseFloat((unsoldInventory?.find(i => `${i.lotId}-${i.breakdownId || 'lot'}` === selectedInventory)?.pricePerKg || "0")).toLocaleString('en-IN')}`
                        : `${t("Cost/Bag", "लागत/बोरी")}: ₹${parseFloat((unsoldInventory?.find(i => `${i.lotId}-${i.breakdownId || 'lot'}` === selectedInventory)?.costPerBag || 0).toFixed(1)).toLocaleString('en-IN')}`
                      }
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap items-center">
                    <Input
                      type="number"
                      min="1"
                      placeholder={t("Bags", "बोरी")}
                      value={newItemBags || ""}
                      onChange={(e) => {
                        const bags = parseInt(e.target.value) || 0;
                        setNewItemBags(bags);
                        const inv = unsoldInventory?.find(i => `${i.lotId}-${i.breakdownId || 'lot'}` === selectedInventory);
                        if (inv) {
                          const nwpb = getNetWeightPerBag(inv);
                          setNewItemWeight(parseFloat((nwpb * bags).toFixed(1)));
                        }
                      }}
                      className="w-20 no-spinner"
                      data-testid="input-new-item-bags"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder={t("Weight (Kg)", "वजन (किग्रा)")}
                      value={newItemWeight || ""}
                      onChange={(e) => setNewItemWeight(parseFloat(e.target.value) || 0)}
                      className="w-24 no-spinner"
                      data-testid="input-new-item-weight"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder={t("Revenue (₹)", "राजस्व (₹)")}
                      value={newItemRevenue || ""}
                      onChange={(e) => setNewItemRevenue(parseFloat(e.target.value) || 0)}
                      className="w-24 no-spinner"
                      data-testid="input-new-item-revenue"
                    />
                    <Button type="button" size="sm" onClick={handleAddItem} data-testid="button-confirm-add">
                      {t("Add", "जोड़ें")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Desktop header row - hidden on mobile */}
              <div className="hidden md:grid grid-cols-[1fr,70px,80px,70px,90px,90px,32px] gap-2 text-xs text-muted-foreground font-medium pb-1 border-b">
                <span>{t("Lot Details", "लॉट विवरण")}</span>
                <span className="text-right">{t("Bags", "बोरी")}</span>
                <span className="text-right">{t("Net Weight", "शुद्ध वजन")}</span>
                <span className="text-right">{isLoadingType ? t("₹/Kg", "₹/किग्रा") : t("Cost/Bag", "लागत/बोरी")}</span>
                <span className="text-right">{isLoadingType ? t("Amount", "राशि") : t("Revenue", "राजस्व")}</span>
                <span className="text-right">{t("P&L", "लाभ/हानि")}</span>
                <span></span>
              </div>

              {editableItems.map((item, index) => {
                if (item.action === 'remove') return null;
                const itemCost = item.costOfGoods;
                const itemPL = isLoadingType 
                  ? item.loadingAmount - itemCost
                  : item.revenue - itemCost;
                return (
                  <div key={item.id || `new-${index}`}>
                    {/* Desktop row */}
                    <div className="hidden md:grid grid-cols-[1fr,70px,80px,70px,90px,90px,32px] gap-2 items-center text-sm py-1">
                      <span className="truncate text-xs">
                        S#{item.serialNumber} - {lotPlaceLabel(item.place, item.coldStoreName)} - {item.potatoType} - {item.size || "Mixed"}
                      </span>
                      <Input
                        type="number"
                        min="1"
                        value={item.bagsMoved || ""}
                        onChange={(e) => handleBagCountChange(index, parseInt(e.target.value) || 0)}
                        className="h-8 text-right no-spinner"
                        data-testid={`input-item-bags-${index}`}
                      />
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.netWeight || ""}
                        onChange={(e) => handleNetWeightChange(index, parseFloat(e.target.value) || 0)}
                        className="h-8 text-right no-spinner"
                        placeholder="0"
                        data-testid={`input-item-weight-${index}`}
                      />
                      {isLoadingType ? (
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={item.loadingPricePerKg || ""}
                          onChange={(e) => handleLoadingPricePerKgChange(index, parseFloat(e.target.value) || 0)}
                          className="h-8 text-right no-spinner"
                          placeholder="₹/Kg"
                          data-testid={`input-item-ppk-${index}`}
                        />
                      ) : (
                        <div 
                          className="h-8 flex items-center justify-end px-3 bg-muted/50 rounded-md text-sm text-muted-foreground"
                          data-testid={`text-item-price-${index}`}
                        >
                          {parseFloat((item.pricePerKg || 0).toFixed(1)).toLocaleString('en-IN')}
                        </div>
                      )}
                      {isLoadingType ? (
                        <div 
                          className="h-8 flex items-center justify-end px-3 bg-muted/50 rounded-md text-sm text-muted-foreground"
                          data-testid={`text-item-amount-${index}`}
                        >
                          ₹{parseFloat((item.loadingAmount || 0).toFixed(1)).toLocaleString('en-IN')}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={item.revenue || ""}
                          onChange={(e) => handleRevenueChange(index, parseFloat(e.target.value) || 0)}
                          className="h-8 text-right no-spinner"
                          placeholder="₹0"
                          data-testid={`input-item-revenue-${index}`}
                        />
                      )}
                      <span className={`text-right text-xs font-medium ${itemPL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {itemPL >= 0 ? "+" : ""}₹{parseFloat(itemPL.toFixed(1)).toLocaleString('en-IN')}
                      </span>
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
                    {/* Mobile card */}
                    <div className="md:hidden border rounded-md p-3 space-y-2 mb-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs font-medium flex-1">
                          S#{item.serialNumber} - {lotPlaceLabel(item.place, item.coldStoreName)} - {item.potatoType} - {item.size || "Mixed"}
                        </span>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive shrink-0"
                          onClick={() => handleRemoveItem(index)}
                          data-testid={`button-remove-item-mobile-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">{t("Bags", "बोरी")}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.bagsMoved || ""}
                            onChange={(e) => handleBagCountChange(index, parseInt(e.target.value) || 0)}
                            className="h-8 text-center no-spinner"
                            data-testid={`input-item-bags-m-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">{t("Net Wt", "शुद्ध वजन")}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.netWeight || ""}
                            onChange={(e) => handleNetWeightChange(index, parseFloat(e.target.value) || 0)}
                            className="h-8 text-center no-spinner"
                            placeholder="0"
                            data-testid={`input-item-weight-m-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">{isLoadingType ? t("₹/Kg", "₹/किग्रा") : t("Cost/Bag", "लागत/बोरी")}</Label>
                          {isLoadingType ? (
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={item.loadingPricePerKg || ""}
                              onChange={(e) => handleLoadingPricePerKgChange(index, parseFloat(e.target.value) || 0)}
                              className="h-8 text-center no-spinner"
                              placeholder="₹/Kg"
                              data-testid={`input-item-ppk-m-${index}`}
                            />
                          ) : (
                            <div 
                              className="h-8 flex items-center justify-center px-2 bg-muted/50 rounded-md text-sm text-muted-foreground"
                              data-testid={`text-item-price-m-${index}`}
                            >
                              {parseFloat((item.pricePerKg || 0).toFixed(1)).toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">{isLoadingType ? t("Amount", "राशि") : t("Revenue", "राजस्व")}</Label>
                          {isLoadingType ? (
                            <div 
                              className="h-8 flex items-center justify-center px-2 bg-muted/50 rounded-md text-sm text-muted-foreground"
                              data-testid={`text-item-amount-m-${index}`}
                            >
                              ₹{parseFloat((item.loadingAmount || 0).toFixed(1)).toLocaleString('en-IN')}
                            </div>
                          ) : (
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={item.revenue || ""}
                              onChange={(e) => handleRevenueChange(index, parseFloat(e.target.value) || 0)}
                              className="h-8 text-center no-spinner"
                              placeholder="₹0"
                              data-testid={`input-item-revenue-m-${index}`}
                            />
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">{t("P&L", "लाभ/हानि")}</Label>
                          <div className={`h-8 flex items-center justify-center rounded-md text-sm font-medium ${itemPL >= 0 ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30" : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30"}`}>
                            {itemPL >= 0 ? "+" : ""}₹{parseFloat(itemPL.toFixed(1)).toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {(() => {
                const activeItems = editableItems.filter(i => i.action !== 'remove');
                const totalBags = activeItems.reduce((sum, i) => sum + i.bagsMoved, 0);
                const totalWeight = activeItems.reduce((sum, i) => sum + (i.netWeight || 0), 0);
                const totalRevOrAmt = activeItems.reduce((sum, i) => sum + (isLoadingType ? i.loadingAmount : (i.revenue || 0)), 0);
                const totalPL = activeItems.reduce((sum, i) => {
                  const cost = isLoadingType
                    ? i.pricePerKg * i.netWeight
                    : i.pricePerKg * i.bagsMoved;
                  return sum + ((isLoadingType ? i.loadingAmount : i.revenue) - cost);
                }, 0);
                return (
                  <>
                    {/* Desktop totals row */}
                    <div className="hidden md:grid grid-cols-[1fr,70px,80px,70px,90px,90px,32px] gap-2 items-center text-sm font-medium border-t pt-2 mt-2">
                      <span>{t("Total", "कुल")}</span>
                      <span className="text-right h-8 flex items-center justify-end">{totalBags}</span>
                      <span className="text-right h-8 flex items-center justify-end">{totalWeight.toFixed(1)}</span>
                      <span></span>
                      <span className="text-right h-8 flex items-center justify-end">
                        ₹{parseFloat(totalRevOrAmt.toFixed(1)).toLocaleString('en-IN')}
                      </span>
                      <span className={`text-right h-8 flex items-center justify-end ${totalPL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {totalPL >= 0 ? "+" : ""}₹{parseFloat(totalPL.toFixed(1)).toLocaleString('en-IN')}
                      </span>
                      <span></span>
                    </div>
                    {/* Mobile totals */}
                    <div className="md:hidden border-t pt-2 mt-2">
                      <div className="grid grid-cols-4 gap-2 text-xs font-medium">
                        <div className="text-center">
                          <span className="text-muted-foreground block">{t("Bags", "बोरी")}</span>
                          <span>{totalBags}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-muted-foreground block">{t("Weight", "वजन")}</span>
                          <span>{totalWeight.toFixed(1)}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-muted-foreground block">{isLoadingType ? t("Amount", "राशि") : t("Revenue", "राजस्व")}</span>
                          <span>₹{parseFloat(totalRevOrAmt.toFixed(1)).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-muted-foreground block">{t("P&L", "लाभ/हानि")}</span>
                          <span className={totalPL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                            {totalPL >= 0 ? "+" : ""}₹{parseFloat(totalPL.toFixed(1)).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

            </div>

                {isLoadingType ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <FormField
                        control={form.control}
                        name="totalMandiCommission"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{t("Mandi Comm.", "मंडी कमीशन")} (₹)</FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="0" {...field} data-testid="input-edit-mandi-commission" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="totalAadhatCommission"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{t("Aadhat Comm.", "आढ़त कमीशन")} (₹)</FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="0" {...field} data-testid="input-edit-aadhat-commission" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="totalHammali"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{t("Hammali", "हम्माली")} (₹)</FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="0" {...field} data-testid="input-edit-hammali" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="totalMandiExtraCharges"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{t("Extra Charges", "अतिरिक्त शुल्क")} (₹)</FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="0" {...field} data-testid="input-edit-extra-charges" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="salesCommission"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("Sales Commission", "बिक्री कमीशन")} (₹)</FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="0" {...field} data-testid="input-edit-sales-commission" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div>
                        <Label className="text-sm font-medium">{t("Revenue", "राजस्व")} (₹)</Label>
                        <div className="mt-2 h-9 px-3 py-2 rounded-md border bg-muted text-sm flex items-center" data-testid="display-revenue">
                          ₹{(() => {
                            const lotAmounts = editableItems.filter(i => i.action !== 'remove').reduce((sum, i) => sum + (i.loadingAmount || 0), 0);
                            const mandiTotal = (Number(form.watch("totalMandiCommission")) || 0) + (Number(form.watch("totalAadhatCommission")) || 0) + (Number(form.watch("totalHammali")) || 0) + (Number(form.watch("totalMandiExtraCharges")) || 0);
                            const sc = Number(form.watch("salesCommission")) || 0;
                            return parseFloat((lotAmounts + mandiTotal + sc).toFixed(1)).toLocaleString('en-IN');
                          })()}
                        </div>
                      </div>
                      <FormField
                        control={form.control}
                        name="amountReceived"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("Amount Received", "प्राप्त राशि")} (₹)</FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="0" {...field} readOnly className="bg-muted cursor-not-allowed" data-testid="input-amount-received" />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">{t("Managed via Cash tab", "कैश टैब से प्रबंधित")}</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {(() => {
                      const activeItems = editableItems.filter(i => i.action !== 'remove');
                      const totalItemPL = activeItems.reduce((sum, i) => {
                        const cost = i.pricePerKg * i.netWeight;
                        return sum + (i.loadingAmount - cost);
                      }, 0);
                      const sc = Number(form.watch("salesCommission")) || 0;
                      const totalPL = totalItemPL + sc;
                      return (
                        <Card className={`border ${totalPL >= 0 ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"}`}>
                          <CardContent className="py-3 px-4 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{t("Total P&L", "कुल लाभ/हानि")}</p>
                              <p className="text-xs text-muted-foreground">
                                {t("Sum of lot P&L", "लॉट P&L का योग")} + {t("Sales Commission", "बिक्री कमीशन")}
                              </p>
                            </div>
                            <p className={`text-xl font-bold ${totalPL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                              {totalPL >= 0 ? "+" : ""}₹{parseFloat(Math.abs(totalPL).toFixed(1)).toLocaleString('en-IN')}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">{t("Revenue", "राजस्व")} (₹)</Label>
                        <div className="mt-2 h-9 px-3 py-2 rounded-md border bg-muted text-sm flex items-center" data-testid="display-revenue">
                          ₹{parseFloat(editableItems.filter(i => i.action !== 'remove').reduce((sum, i) => sum + (i.revenue || 0), 0).toFixed(1)).toLocaleString('en-IN')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">({t("sum of lot revenues", "लॉट राजस्व का योग")})</p>
                      </div>
                      <FormField
                        control={form.control}
                        name="amountReceived"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("Amount Received", "प्राप्त राशि")} (₹)</FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="0" {...field} readOnly className="bg-muted cursor-not-allowed" data-testid="input-amount-received" />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">{t("Managed via Cash tab", "कैश टैब से प्रबंधित")}</p>
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
                              <Input type="number" step="any" placeholder="0" {...field} data-testid="input-transportation" />
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
                              <Input type="number" step="any" placeholder="0" {...field} data-testid="input-other-charges" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <ProfitLossDisplay 
                      totalCostOfGoods={editableItems.filter(i => i.action !== 'remove').reduce((sum, i) => sum + (i.costOfGoods || 0), 0)}
                      revenue={editableItems.filter(i => i.action !== 'remove').reduce((sum, i) => sum + (i.revenue || 0), 0)}
                      transportationCharges={form.watch("transportationCharges") || 0}
                      otherCharges={form.watch("otherCharges") || 0}
                      isLoadingType={false}
                      salesCommission={0}
                      mandiCharges={0}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("Remarks", "टिप्पणी")}</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder={t("Add any notes or remarks...", "कोई नोट या टिप्पणी जोड़ें...")} 
                          className="resize-none" 
                          rows={2}
                          {...field} 
                          data-testid="input-remarks" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
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
          </>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            {t("Transaction not found", "लेनदेन नहीं मिला")}
          </div>
        )}
        </div>
      </DialogContent>

      <AlertDialog open={deleteConfirmIndex !== null} onOpenChange={(open) => !open && setDeleteConfirmIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Remove Item?", "आइटम हटाएं?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmIndex !== null && editableItems[deleteConfirmIndex] && (
                <>
                  {t("Are you sure you want to remove", "क्या आप इसे हटाना चाहते हैं")}{" "}
                  <strong>S#{editableItems[deleteConfirmIndex].serialNumber} - {lotPlaceLabel(editableItems[deleteConfirmIndex].place, editableItems[deleteConfirmIndex].coldStoreName)} - {editableItems[deleteConfirmIndex].size || "Mixed"}</strong>
                  {" "}({editableItems[deleteConfirmIndex].bagsMoved} {t("bags", "बोरी")})?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t("Cancel", "रद्द करें")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">
              {t("Remove", "हटाएं")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
