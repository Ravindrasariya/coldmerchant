import { useState, useEffect, useMemo, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronUp, History, Save, Plus, Trash2, X, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Buyer } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EditableTnxNumber } from "./editable-tnx-number";
import { InlineEditableDate } from "@/components/ui/inline-editable-date";

interface TransactionItem {
  id: number;
  lotId: number;
  breakdownId: number | null;
  serialNumber: number;
  crop?: string;
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
  costPerBag: number;
  lotPricePerKg?: number;
}

interface UnsoldInventoryItem {
  breakdownId: number | null;
  lotId: number;
  serialNumber: number;
  crop?: string;
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
  crop?: string;
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
  originalCostOfGoods: number;
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
  costPerBag: number;
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
  totalFreight: string | null;
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
  tulai: string | null;
  majduri: string | null;
  thelaBhada: string | null;
  palaKarai: string | null;
  bardan: string | null;
  debit: string | null;
  purchaseOrder: string | null;
  freightPaidSeparately: boolean;
  tnxGroupId: string | null;
  createdAt: string;
  dateOfLoading: string | null;
  items: TransactionItem[];
  editHistory: EditHistoryEntry[];
}

const editTransactionSchema = z.object({
  partyName: z.string().optional(),
  vehicleNumber: z.string().optional(),
  driverContact: z.string().optional(),
  totalFreight: z.number().int().positive().nullable().optional(),
  advancePayment: z.coerce.number().optional(),
  amountReceived: z.coerce.number().optional(),
  transportationCharges: z.coerce.number().optional(),
  otherCharges: z.coerce.number().optional(),
  revenue: z.coerce.number().optional(),
  remarks: z.string().optional(),
  salesCommission: z.coerce.number().optional(),
  totalMandiCommission: z.coerce.number().optional(),
  totalAadhatCommission: z.coerce.number().optional(),
  totalHammali: z.coerce.number().optional(),
  totalMandiExtraCharges: z.coerce.number().optional(),
  tulai: z.coerce.number().optional(),
  majduri: z.coerce.number().optional(),
  thelaBhada: z.coerce.number().optional(),
  palaKarai: z.coerce.number().optional(),
  bardan: z.coerce.number().optional(),
  debit: z.coerce.number().optional(),
  purchaseOrder: z.string().optional(),
  freightPaidSeparately: z.boolean().optional(),
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
    const safeMC = Number(mandiCharges) || 0;
    chargesAmount = safeTrans + safeOther + safeMC;
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
  // Mirrors editableItems synchronously. Item handlers must compute their next
  // array from this rather than from the editableItems state value: state updates
  // are async, so two edits landing in the same tick would both build on the same
  // pre-edit snapshot and the first would be lost. Always mutate via applyItems.
  const editableItemsRef = useRef<EditableItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<string>("");
  const [lotPopoverOpen, setLotPopoverOpen] = useState(false);
  const [newItemBags, setNewItemBags] = useState<number>(0);
  const [newItemWeight, setNewItemWeight] = useState<number>(0);
  const [newItemRevenue, setNewItemRevenue] = useState<number>(0);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [buyerPopoverOpen, setBuyerPopoverOpen] = useState(false);
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);

  const cropOptions: { value: string; label: [string, string] }[] = [
    { value: "potato", label: ["Potato", "आलू"] },
    { value: "onion", label: ["Onion", "प्याज"] },
    { value: "garlic", label: ["Garlic", "लहसुन"] },
  ];
  const [selectedCrops, setSelectedCrops] = useState<Set<string>>(new Set(["potato"]));
  const toggleCrop = (crop: string) => {
    setSelectedCrops(prev => {
      const next = new Set(prev);
      if (next.has(crop)) {
        if (next.size > 1) next.delete(crop);
      } else {
        next.add(crop);
      }
      return next;
    });
  };

  const EDIT_CHARGE_OPTIONS = [
    { key: "tulai" as const, label: "Tulai", labelHi: "तुलाई" },
    { key: "majduri" as const, label: "Majduri", labelHi: "मजदूरी" },
    { key: "thelaBhada" as const, label: "Thela Bhada", labelHi: "ठेला भाड़ा" },
    { key: "palaKarai" as const, label: "Pala Karai", labelHi: "पाला कराई" },
    { key: "bardan" as const, label: "Bardan (Bags)", labelHi: "बरदान (बोरी)" },
  ] as const;
  type EditChargeKey = typeof EDIT_CHARGE_OPTIONS[number]["key"];
  const [visibleEditCharges, setVisibleEditCharges] = useState<EditChargeKey[]>([]);

  const [mandiPct, setMandiPct] = useState(0);
  const [aadhatPct, setAadhatPct] = useState(0);
  const [hammaliRate, setHammaliRate] = useState(0);
  const [salesCommPct, setSalesCommPct] = useState(0);
  // False until the user actually edits lots/bags/weight/price or a % / rate box.
  // While false, the mandi charge amounts saved on the transaction are left exactly
  // as loaded, so simply opening (or opening and saving) the dialog never rewrites
  // a hand-entered charge.
  const chargesTouchedRef = useRef(false);
  // Set by recomputeMandiFromLots so the rate x base effect skips the render it
  // triggers. That effect would otherwise recompute from the 2dp-rounded rate and
  // overwrite the exact lot-derived totals the helper just wrote.
  const skipRateEffectRef = useRef(false);
  const [revenueOverridden, setRevenueOverridden] = useState(false);
  const [prevItemRevenueFingerprint, setPrevItemRevenueFingerprint] = useState("");
  // Tracks the previous freightPaidSeparately value so the checkbox-toggle
  // useEffect can skip the initial mount and only fire on real changes.
  const prevFreightPaidSeparatelyRef = useRef<boolean | undefined>(undefined);

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
      totalFreight: undefined,
      advancePayment: undefined,
      amountReceived: undefined,
      transportationCharges: undefined,
      otherCharges: undefined,
      revenue: undefined,
      remarks: "",
      salesCommission: undefined,
      totalMandiCommission: undefined,
      totalAadhatCommission: undefined,
      totalHammali: undefined,
      totalMandiExtraCharges: undefined,
      tulai: undefined,
      majduri: undefined,
      thelaBhada: undefined,
      palaKarai: undefined,
      bardan: undefined,
      debit: undefined,
      purchaseOrder: "",
    },
  });

  useEffect(() => {
    if (transaction) {
      // Reset the freightPaidSeparately prev-ref so the checkbox-toggle
      // useEffect treats the first value after dialog open as the baseline.
      prevFreightPaidSeparatelyRef.current = undefined;
      form.reset({
        partyName: transaction.partyName || "",
        vehicleNumber: transaction.vehicleNumber || "",
        driverContact: transaction.driverContact || "",
        totalFreight: transaction.totalFreight ? parseFloat(transaction.totalFreight) : null,
        advancePayment: transaction.advancePayment ? parseFloat(transaction.advancePayment) : undefined,
        amountReceived: transaction.amountReceived ? parseFloat(transaction.amountReceived) : undefined,
        transportationCharges: transaction.transportationCharges && parseFloat(transaction.transportationCharges) !== 0 ? parseFloat(transaction.transportationCharges) : undefined,
        otherCharges: transaction.otherCharges && parseFloat(transaction.otherCharges) !== 0 ? parseFloat(transaction.otherCharges) : undefined,
        revenue: transaction.revenue ? parseFloat(transaction.revenue) : undefined,
        remarks: transaction.remarks || "",
        salesCommission: transaction.salesCommission ? parseFloat(transaction.salesCommission) : undefined,
        totalMandiCommission: transaction.totalMandiCommission ? parseFloat(transaction.totalMandiCommission) : undefined,
        totalAadhatCommission: transaction.totalAadhatCommission ? parseFloat(transaction.totalAadhatCommission) : undefined,
        totalHammali: transaction.totalHammali ? parseFloat(transaction.totalHammali) : undefined,
        totalMandiExtraCharges: transaction.totalMandiExtraCharges ? parseFloat(transaction.totalMandiExtraCharges) : undefined,
        tulai: transaction.tulai ? parseFloat(transaction.tulai) : undefined,
        majduri: transaction.majduri ? parseFloat(transaction.majduri) : undefined,
        debit: transaction.debit ? parseFloat(transaction.debit) : undefined,
        thelaBhada: transaction.thelaBhada ? parseFloat(transaction.thelaBhada) : undefined,
        palaKarai: transaction.palaKarai ? parseFloat(transaction.palaKarai) : undefined,
        bardan: transaction.bardan ? parseFloat(transaction.bardan) : undefined,
        purchaseOrder: transaction.purchaseOrder || "",
        freightPaidSeparately: transaction.freightPaidSeparately === true,
      });
      // For loading transactions with freightPaidSeparately=true, immediately
      // recompute revenue so the form value (and therefore PATCH body) is correct
      // even if the user opens and saves without toggling the checkbox.
      if (transaction.transactionType === "loading" && transaction.freightPaidSeparately === true) {
        const lotAmounts = transaction.items.reduce((sum, i) => {
          const amt = parseFloat(i.amount || "0");
          const rev = parseFloat(i.revenue || "0");
          return sum + (amt > 0 ? amt : rev);
        }, 0);
        const mTotal =
          (parseFloat(transaction.totalMandiCommission || "0")) +
          (parseFloat(transaction.totalAadhatCommission || "0")) +
          (parseFloat(transaction.totalHammali || "0")) +
          (parseFloat(transaction.totalMandiExtraCharges || "0"));
        const sc = parseFloat(transaction.salesCommission || "0");
        const addl =
          (parseFloat(transaction.tulai || "0")) +
          (parseFloat(transaction.majduri || "0")) +
          (parseFloat(transaction.thelaBhada || "0")) +
          (parseFloat(transaction.palaKarai || "0")) +
          (parseFloat(transaction.bardan || "0"));
        const dbt = parseFloat(transaction.debit || "0");
        // Revenue excludes Driver Advance when paid separately.
        form.setValue("revenue", parseFloat((lotAmounts + mTotal + sc + addl - dbt).toFixed(1)));
      }
      const chargeKeys: EditChargeKey[] = ["tulai", "majduri", "thelaBhada", "palaKarai", "bardan"];
      const activeCharges = chargeKeys.filter(k => transaction[k] && parseFloat(transaction[k] as string) !== 0);
      setVisibleEditCharges(activeCharges);
      setSelectedBuyerId(transaction.buyerId || null);
      setPrevItemRevenueFingerprint("");
      chargesTouchedRef.current = false;

      const txnCrops = new Set(transaction.items.map(i => i.crop || "potato"));
      setSelectedCrops(txnCrops.size > 0 ? txnCrops : new Set(["potato"]));

      const lotRevenueSum = transaction.items.reduce((sum, i) => sum + parseFloat(i.revenue || "0"), 0);
      const storedRevenue = parseFloat(transaction.revenue || "0");
      const isOverride = transaction.transactionType !== "loading" && Math.abs(storedRevenue - lotRevenueSum) >= 0.5;
      setRevenueOverridden(isOverride);

      const storedSC = parseFloat(transaction.salesCommission || "0");

      // Refresh each lot's cost from the CURRENT stock register. getTransactionById
      // enriches every item with the live per-bag cost (costPerBag) and current lot
      // mandi rates, so a lot priced AFTER the transaction was created now shows its
      // real cost/COGS instead of the frozen 0 captured at creation time. We keep the
      // frozen value only as a fallback when the register still has no cost at all.
      const isLoadingTxn = transaction.transactionType === "loading";
      const mappedItems = transaction.items.map(item => {
        const bags = item.bagsMoved;
        const frozenCogs = parseFloat(item.costOfGoods || "0");
        const liveCpb = Number(item.costPerBag) || 0;
        const liveCogs = (liveCpb > 0 && bags > 0)
          ? parseFloat((liveCpb * bags).toFixed(2))
          : frozenCogs;
        const liveCostPerBag = liveCpb > 0 ? liveCpb : (parseFloat(item.pricePerKgSnapshot || "0") || 0);

        // One-time backfill (loading only): when Net Weight / ₹/Kg were never set
        // (stored 0/empty), fill them from the live stock register. A non-zero
        // stored value is the user's deliberate entry and is NEVER overwritten —
        // this is a backfill, not an ongoing sync (unlike the COGS refresh above).
        const storedNetWeight = parseFloat(item.netWeight || "0");
        const storedLoadingPpk = parseFloat(item.pricePerKg || "0");
        const storedLoadingAmount = parseFloat(item.amount || "0");
        const liveLotPpk = Number(item.lotPricePerKg) || 0;
        const lotSrcWeight = item.lotSourceWeight || 0;
        const lotSrcBags = item.lotSourceBags || 0;

        let effNetWeight = storedNetWeight;
        let effLoadingPpk = storedLoadingPpk;
        if (isLoadingTxn) {
          if (effNetWeight <= 0 && lotSrcBags > 0) {
            // Match the server's computeNetWeight: mandi lots use the full weight
            // (no per-bag deduction); other places deduct 1kg/bag.
            const lotNetWeight = item.place === "mandi" ? lotSrcWeight : Math.max(0, lotSrcWeight - lotSrcBags);
            effNetWeight = parseFloat(((bags / lotSrcBags) * lotNetWeight).toFixed(1));
          }
          if (effLoadingPpk <= 0 && liveLotPpk > 0) {
            effLoadingPpk = liveLotPpk;
          }
        }
        // Amount is also a one-time backfill: recompute ONLY when it was never set
        // (stored 0/empty). A deliberate non-zero amount is never overwritten, even
        // if netWeight/₹kg were just backfilled.
        let effLoadingAmount = storedLoadingAmount;
        if (isLoadingTxn && storedLoadingAmount <= 0) {
          effLoadingAmount = parseFloat((effLoadingPpk * effNetWeight).toFixed(2));
        }
        const itemNetWeight = effNetWeight;
        const effRevenue = isLoadingTxn ? effLoadingAmount : parseFloat(item.revenue || "0");
        return {
          id: item.id,
          lotId: item.lotId,
          breakdownId: item.breakdownId,
          serialNumber: item.serialNumber,
          crop: item.crop || "potato",
          place: item.place,
          coldStoreName: item.coldStoreName,
          potatoType: item.potatoType,
          size: item.size,
          bagsMoved: bags,
          originalBags: bags,
          netWeight: itemNetWeight,
          originalNetWeight: itemNetWeight,
          pricePerKg: liveCostPerBag,
          costOfGoods: liveCogs,
          originalCostOfGoods: liveCogs,
          revenue: effRevenue,
          originalRevenue: effRevenue,
          loadingPricePerKg: effLoadingPpk,
          loadingAmount: effLoadingAmount,
          lotSourceWeight: item.lotSourceWeight || 0,
          lotSourceBags: item.lotSourceBags || 0,
          mandiCommissionPercent: item.mandiCommissionPercent || null,
          aadhatCommissionPercent: item.aadhatCommissionPercent || null,
          hammaliPerBag: item.hammaliPerBag || null,
          mandiExtraCharges: item.mandiExtraCharges || null,
          lotOriginalBags: item.lotOriginalBags || 0,
          costPerBag: liveCpb,
          action: 'keep' as const
        };
      });
      applyItems(mappedItems);

      if (transaction.transactionType === "loading") {
        // Seed the % / rate boxes by BACK-DERIVING them from the amounts already
        // saved on the transaction, so each box reproduces its saved total instead
        // of the lot's current rate. A charge the user overrode by hand (at
        // creation or in a previous edit) therefore survives reopening the dialog,
        // and the dialog agrees with the bill that was printed from those saved
        // values. Extra Charges is deliberately NOT written here at all — the value
        // form.reset() loaded above stands.
        //
        // Derivation is STRICT: a charge the transaction never stored derives a rate
        // of 0 rather than falling back to the lot's rate. The amount shown under
        // each box is rate x base, so a lot-derived rate on a transaction with no
        // stored amount would display a charge that isn't actually saved. The lot
        // only becomes the source of truth again when the user edits
        // lots/bags/weight/price — see recomputeMandiFromLots.
        let amtBaseL = 0, bagBaseL = 0;
        for (const it of mappedItems) {
          amtBaseL += it.loadingAmount || 0;
          bagBaseL += it.bagsMoved || 0;
        }
        const aBase = amtBaseL > 0 ? amtBaseL : 1;
        const bBase = bagBaseL > 0 ? bagBaseL : 1;
        const savedAmt = (saved: string | null | undefined) => parseFloat(saved || "0") || 0;
        setMandiPct(Math.round((savedAmt(transaction.totalMandiCommission) / aBase) * 10000) / 100);
        setAadhatPct(Math.round((savedAmt(transaction.totalAadhatCommission) / aBase) * 10000) / 100);
        setHammaliRate(Math.round((savedAmt(transaction.totalHammali) / bBase) * 100) / 100);
        setSalesCommPct(amtBaseL > 0 ? Math.round((storedSC / amtBaseL) * 10000) / 100 : 0);
      } else {
        setMandiPct(0);
        setAadhatPct(0);
        setHammaliRate(0);
        setSalesCommPct(0);
      }
    }
  }, [transaction, form]);

  const computedLotRevenue = editableItems
    .filter(i => i.action !== 'remove')
    .reduce((sum, i) => sum + (i.revenue || 0), 0);
  // Watched at component level so the freightPaidSeparately toggle useEffect
  // has a reactive dependency that triggers when the checkbox changes.
  const watchedFreightPaidSeparately = form.watch("freightPaidSeparately");
  const itemRevenueFingerprint = editableItems
    .filter(i => i.action !== 'remove')
    .map(i => `${i.id}:${i.bagsMoved}:${i.netWeight}:${i.revenue}`)
    .join("|");

  useEffect(() => {
    if (!transaction || transaction.transactionType === "loading") return;
    if (prevItemRevenueFingerprint === "") {
      setPrevItemRevenueFingerprint(itemRevenueFingerprint);
      return;
    }
    if (itemRevenueFingerprint !== prevItemRevenueFingerprint) {
      setPrevItemRevenueFingerprint(itemRevenueFingerprint);
      setRevenueOverridden(false);
      form.setValue("revenue", parseFloat(computedLotRevenue.toFixed(1)));
    }
  }, [itemRevenueFingerprint, prevItemRevenueFingerprint, transaction, form, computedLotRevenue]);

  // For loading transactions: immediately recompute and persist the revenue
  // form field whenever the "Freight Paid Separately" checkbox is toggled.
  // Mirrors the inline P&L card formula (same branch logic) so the form value
  // stays consistent with what the server will recompute on save.
  useEffect(() => {
    if (!transaction || transaction.transactionType !== "loading") return;
    const current = watchedFreightPaidSeparately === true;
    // Skip initial mount — treat first value as the baseline.
    if (prevFreightPaidSeparatelyRef.current === undefined) {
      prevFreightPaidSeparatelyRef.current = current;
      return;
    }
    if (prevFreightPaidSeparatelyRef.current === current) return;
    prevFreightPaidSeparatelyRef.current = current;

    const activeItems = editableItems.filter(i => i.action !== "remove");
    const lotAmounts = activeItems.reduce((sum, i) => sum + (i.loadingAmount || 0), 0);
    const mandiTotal =
      (Number(form.getValues("totalMandiCommission")) || 0) +
      (Number(form.getValues("totalAadhatCommission")) || 0) +
      (Number(form.getValues("totalHammali")) || 0) +
      (Number(form.getValues("totalMandiExtraCharges")) || 0);
    const sc = Number(form.getValues("salesCommission")) || 0;
    const addlCharges =
      (Number(form.getValues("tulai")) || 0) +
      (Number(form.getValues("majduri")) || 0) +
      (Number(form.getValues("thelaBhada")) || 0) +
      (Number(form.getValues("palaKarai")) || 0) +
      (Number(form.getValues("bardan")) || 0);
    const dbt = Number(form.getValues("debit")) || 0;
    const drvAdv = Number(form.getValues("advancePayment")) || 0;

    // When paid separately: Revenue excludes Driver Advance.
    // When not paid separately: Driver Advance is a buyer-reimbursed pass-through.
    const newRevenue = current
      ? parseFloat((lotAmounts + mandiTotal + sc + addlCharges - dbt).toFixed(1))
      : parseFloat((lotAmounts + mandiTotal + sc + addlCharges + drvAdv - dbt).toFixed(1));

    form.setValue("revenue", newRevenue);
  }, [watchedFreightPaidSeparately, transaction, editableItems, form]);

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
    // Loading mandi is charged on the sale amount (mirrors the Create-Loading
    // dialog); sale mandi is charged on COGS.
    const costBasis = isLoadingType ? (item.loadingAmount || 0) : (item.costOfGoods || 0);
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

  const totalLotAmount = useMemo(() => {
    return editableItems.filter(i => i.action !== 'remove').reduce((sum, i) => sum + (i.loadingAmount || 0), 0);
  }, [editableItems]);

  const totalEditBags = useMemo(() => {
    return editableItems.filter(i => i.action !== 'remove').reduce((sum, i) => sum + (i.bagsMoved || 0), 0);
  }, [editableItems]);

  const totalMandiSaleCOGS = useMemo(() => {
    if (isLoadingType) return 0;
    return editableItems.filter(i => i.action !== 'remove' && i.place === "mandi")
      .reduce((sum, i) => sum + (i.costOfGoods || 0), 0);
  }, [editableItems, isLoadingType]);

  // Writes rate x base back into the charge amounts. GATED on chargesTouchedRef:
  // on open it must NOT fire, or it would overwrite the saved (possibly
  // hand-edited) amounts that form.reset() just loaded with lot-derived figures.
  // Once the user has edited something it drives the totals as before.
  useEffect(() => {
    if (!chargesTouchedRef.current) return;
    if (skipRateEffectRef.current) {
      skipRateEffectRef.current = false;
      return;
    }
    if (isLoadingType) {
      form.setValue("totalMandiCommission", Math.round(totalLotAmount * mandiPct / 100 * 100) / 100 || undefined);
      form.setValue("totalAadhatCommission", Math.round(totalLotAmount * aadhatPct / 100 * 100) / 100 || undefined);
      form.setValue("totalHammali", Math.round(totalEditBags * hammaliRate * 100) / 100 || undefined);
      const scBase = totalLotAmount;
      form.setValue("salesCommission", Math.round(scBase * salesCommPct / 100 * 100) / 100 || undefined);
    } else {
      form.setValue("totalMandiCommission", Math.round(totalMandiSaleCOGS * mandiPct / 100 * 100) / 100 || 0);
      form.setValue("totalHammali", Math.round(totalEditBags * hammaliRate * 100) / 100 || 0);
    }
  }, [mandiPct, aadhatPct, hammaliRate, salesCommPct, totalLotAmount, totalEditBags, isLoadingType, form, totalMandiSaleCOGS]);

  // Single entry point for changing the item list: keeps the synchronous ref and
  // the React state in lockstep.
  const applyItems = (next: EditableItem[]) => {
    editableItemsRef.current = next;
    setEditableItems(next);
  };

  // Reset ALL FOUR mandi charges from the lot tables, proportionately to the bags
  // now selected. Called whenever the user changes the lots themselves — add or
  // remove a lot, or change bags / net weight / price per kg. Any hand-entered
  // override is deliberately discarded at that point: once the lot composition
  // changes, the lot table becomes the source of truth again.
  //
  // Takes the NEXT items array explicitly because React state updates are async —
  // reading editableItems here would use the pre-change values.
  const recomputeMandiFromLots = (nextItems: EditableItem[]) => {
    if (!isLoadingType) return;
    chargesTouchedRef.current = true;
    skipRateEffectRef.current = true;
    let mc = 0, ac = 0, hm = 0, ec = 0, amtBase = 0, bagBase = 0;
    for (const it of nextItems.filter(i => i.action !== 'remove')) {
      const c = computeItemMandiCharges(it);
      mc += c.mc; ac += c.ac; hm += c.hm; ec += c.ec;
      amtBase += it.loadingAmount || 0;
      bagBase += it.bagsMoved || 0;
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    form.setValue("totalMandiCommission", r2(mc) || undefined);
    form.setValue("totalAadhatCommission", r2(ac) || undefined);
    form.setValue("totalHammali", r2(hm) || undefined);
    form.setValue("totalMandiExtraCharges", r2(ec) || undefined);

    // Sales Commission is NOT lot-derived — it is a rate the user sets — but it is
    // charged on the lot amount, so it must be restated against the new base here.
    // The rate x base effect normally does this, but it is suppressed for the
    // render this helper triggers, so skipping it would leave a stale commission.
    form.setValue("salesCommission", r2(amtBase * salesCommPct / 100) || undefined);

    const aBase = amtBase > 0 ? amtBase : 1;
    const bBase = bagBase > 0 ? bagBase : 1;
    setMandiPct(Math.round((mc / aBase) * 10000) / 100);
    setAadhatPct(Math.round((ac / aBase) * 10000) / 100);
    setHammaliRate(Math.round((hm / bBase) * 100) / 100);
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
      const payload: Record<string, unknown> = { items: itemsToSend };
      if (!isLoadingType) {
        payload.overallRevenue = form.getValues("revenue");
      }
      return apiRequest("PUT", `/api/transactions/${transactionId}/items`, payload);
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
    const nextItems = editableItemsRef.current.map((item, i) => {
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
      const cogsDenom = item.originalBags > 0 ? item.originalBags : item.bagsMoved;
      const newCostOfGoods = cogsDenom > 0
        ? parseFloat(((newBags / cogsDenom) * (item.originalBags > 0 ? item.originalCostOfGoods : item.costOfGoods)).toFixed(2))
        : item.costOfGoods;
      const hasChanges = newBags !== item.originalBags || newWeight !== item.originalNetWeight || item.revenue !== item.originalRevenue;
      return {
        ...item,
        bagsMoved: newBags,
        netWeight: newWeight,
        costOfGoods: newCostOfGoods,
        loadingAmount: newLoadingAmount,
        revenue: isLoadingType ? newLoadingAmount : item.revenue,
        action: item.id ? (hasChanges ? 'update' as const : 'keep' as const) : 'add' as const
      };
    });
    applyItems(nextItems);
    recomputeMandiFromLots(nextItems);
  };

  const handleNetWeightChange = (index: number, newWeight: number) => {
    const nextItems = editableItemsRef.current.map((item, i) => {
      if (i !== index) return item;
      const newLoadingAmount = isLoadingType ? parseFloat((item.loadingPricePerKg * newWeight).toFixed(2)) : item.loadingAmount;
      const cogsDenom = item.originalNetWeight > 0 ? item.originalNetWeight : item.netWeight;
      const newCostOfGoods = cogsDenom > 0
        ? parseFloat(((newWeight / cogsDenom) * (item.originalNetWeight > 0 ? item.originalCostOfGoods : item.costOfGoods)).toFixed(2))
        : item.costOfGoods;
      const hasChanges = item.bagsMoved !== item.originalBags || newWeight !== item.originalNetWeight;
      return {
        ...item,
        netWeight: newWeight,
        costOfGoods: newCostOfGoods,
        loadingAmount: newLoadingAmount,
        revenue: isLoadingType ? newLoadingAmount : item.revenue,
        action: item.id ? (hasChanges ? 'update' as const : 'keep' as const) : 'add' as const
      };
    });
    applyItems(nextItems);
    recomputeMandiFromLots(nextItems);
  };

  const handleLoadingPricePerKgChange = (index: number, newPpk: number) => {
    const nextItems = editableItemsRef.current.map((item, i) => {
      if (i !== index) return item;
      const newAmount = parseFloat((newPpk * item.netWeight).toFixed(2));
      return {
        ...item,
        loadingPricePerKg: newPpk,
        loadingAmount: newAmount,
        revenue: newAmount,
        action: item.id ? 'update' as const : 'add' as const
      };
    });
    applyItems(nextItems);
    recomputeMandiFromLots(nextItems);
  };

  const handleRevenueChange = (index: number, newRevenue: number) => {
    const nextItems = editableItemsRef.current.map((item, i) => {
      if (i !== index) return item;
      const hasChanges = item.bagsMoved !== item.originalBags || 
                        item.netWeight !== item.originalNetWeight ||
                        newRevenue !== item.originalRevenue;
      return {
        ...item,
        revenue: newRevenue,
        action: item.id ? (hasChanges ? 'update' as const : 'keep' as const) : 'add' as const
      };
    });
    applyItems(nextItems);
  };

  const handleRemoveItem = (index: number) => {
    setDeleteConfirmIndex(index);
  };

  const confirmRemoveItem = () => {
    if (deleteConfirmIndex === null) return;
    const index = deleteConfirmIndex;
    const removedItem = editableItems[index];
    if (!removedItem) {
      setDeleteConfirmIndex(null);
      return;
    }

    const nextItems = removedItem.id
      ? editableItemsRef.current.map((it, i) => i === index ? { ...it, action: 'remove' as const } : it)
      : editableItemsRef.current.filter((_, i) => i !== index);

    applyItems(nextItems);
    recomputeMandiFromLots(nextItems);

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
    
    const newItem: EditableItem = {
      lotId: inv.lotId,
      breakdownId: inv.breakdownId,
      serialNumber: inv.serialNumber,
      crop: inv.crop || "potato",
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
      originalCostOfGoods: costOfGoods,
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
      costPerBag: costPerBag,
      action: 'add' as const
    };

    const nextItems = [...editableItemsRef.current, newItem];
    applyItems(nextItems);
    recomputeMandiFromLots(nextItems);

    setSelectedInventory("");
    setNewItemBags(0);
    setNewItemWeight(0);
    setNewItemRevenue(0);
    setShowAddItem(false);
  };

  const onSubmit = async (data: EditTransactionFormData) => {
    try {
      await updateMutation.mutateAsync({ ...data, buyerId: selectedBuyerId });
      // Sequence: items recompute reads stored debit/charges, so PATCH must finish first.
      // Always run the items update so refreshed stock-register costs (COGS/cost-per-bag)
      // are recomputed and persisted even when the user made no manual item change.
      await updateItemsMutation.mutateAsync();
    } catch {
      // Errors surfaced via individual mutation onError toasts
    }
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      partyName: t("Buyer Name", "खरीदार का नाम"),
      vehicleNumber: t("Vehicle #", "वाहन नं"),
      driverContact: t("Driver Contact", "ड्राइवर संपर्क"),
      totalFreight: t("Total Freight", "कुल भाड़ा"),
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
      debit: t("Debit", "डेबिट"),
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
          <DialogTitle className={`flex items-center gap-2 flex-wrap ${isLoadingType ? "text-blue-700 dark:text-blue-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            <span>{t("Edit Transaction", "लेनदेन संपादित करें")}</span>
            {transaction && (
              <EditableTnxNumber
                transactionId={transaction.id}
                transactionNumber={transaction.transactionNumber}
                prefix="#"
                testIdSuffix="dialog"
              />
            )}
            {transaction?.dateOfLoading && (
              <InlineEditableDate
                currentDate={transaction.dateOfLoading}
                endpoint={`/api/transactions/${transaction.id}/date`}
                invalidateKeys={[
                  ["/api/transactions"],
                  ["/api/transactions", transaction.id],
                  ["/api/dashboard/timeseries"],
                ]}
                testIdSuffix="harvest-tnx"
              />
            )}
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
                  <FormItem className="flex flex-col min-w-0">
                    <FormLabel>{t("Buyer Name", "खरीदार का नाम")}</FormLabel>
                    <Popover open={buyerPopoverOpen} onOpenChange={setBuyerPopoverOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={buyerPopoverOpen}
                            className={cn(
                              "justify-between font-normal truncate overflow-hidden",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="select-buyer-name"
                          >
                            <span className="truncate">{field.value || t("Select buyer...", "खरीदार चुनें...")}</span>
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
                name="totalFreight"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("Total Freight", "कुल भाड़ा")} (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="0"
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          const n = Number(v);
                          field.onChange(v === "" || !Number.isInteger(n) || n < 1 ? null : n);
                        }}
                        data-testid="input-total-freight"
                      />
                    </FormControl>
                    <FormMessage />
                    <FormField
                      control={form.control}
                      name="freightPaidSeparately"
                      render={({ field: psField }) => (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Checkbox
                            id="edit-freight-paid-separately"
                            checked={psField.value === true}
                            onCheckedChange={(v) => psField.onChange(v === true)}
                          />
                          <label htmlFor="edit-freight-paid-separately" className="text-xs text-muted-foreground cursor-pointer select-none">
                            {t("Paid Separately", "अलग से भुगतान")}
                          </label>
                        </div>
                      )}
                    />
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
              <FormField
                control={form.control}
                name="purchaseOrder"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("Purchase Order", "क्रय आदेश")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("PO / reference number", "पीओ / संदर्भ संख्या")} {...field} data-testid="input-purchase-order" />
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
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("Crops in this truck", "इस ट्रक की फसलें")}</Label>
                    <div className="flex flex-wrap gap-3">
                      {cropOptions.map((co) => (
                        <label key={co.value} className="flex items-center gap-1.5 cursor-pointer text-sm" data-testid={`checkbox-edit-crop-${co.value}`}>
                          <Checkbox checked={selectedCrops.has(co.value)} onCheckedChange={() => toggleCrop(co.value)} />
                          {t(co.label[0], co.label[1])}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Popover open={lotPopoverOpen} onOpenChange={setLotPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        data-testid="select-inventory"
                        className={cn("w-full justify-between h-auto min-h-9 text-left", !selectedInventory && "text-muted-foreground")}
                      >
                        {selectedInventory ? (() => {
                          const inv = unsoldInventory?.find(i => `${i.lotId}-${i.breakdownId || 'lot'}` === selectedInventory);
                          if (!inv) return selectedInventory;
                          return (
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm font-medium break-words">
                                  S#{inv.serialNumber} - {lotPlaceLabel(inv.place, inv.coldStoreName)}{inv.potatoType ? ` - ${inv.potatoType}` : ""}{inv.size ? ` - ${inv.size}` : ""}
                                </span>
                                {(() => {
                                  const c = inv.crop || "potato";
                                  const cls = c === "onion" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" : c === "garlic" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
                                  const label = c === "onion" ? t("Onion", "प्याज") : c === "garlic" ? t("Garlic", "लहसुन") : t("Potato", "आलू");
                                  return <Badge className={`text-[10px] px-1.5 py-0 font-medium border-0 shrink-0 ${cls}`}>{label}</Badge>;
                                })()}
                              </div>
                              <span className="text-xs text-muted-foreground break-words">
                                {inv.farmerName}{inv.farmerVillage ? ` (${inv.farmerVillage})` : ""} | {inv.remainingBags} {t("available", "उपलब्ध")}
                              </span>
                            </div>
                          );
                        })() : t("Choose lot", "लॉट चुनें")}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t("Search lot...", "लॉट खोजें...")} />
                        <CommandList>
                          <CommandEmpty>{t("No lot found.", "कोई लॉट नहीं मिला।")}</CommandEmpty>
                          <CommandGroup>
                            {unsoldInventory?.filter((inv) => selectedCrops.has(inv.crop || "potato")).map((inv) => {
                              const key = `${inv.lotId}-${inv.breakdownId || 'lot'}`;
                              const placeLabel = lotPlaceLabel(inv.place, inv.coldStoreName);
                              const c = inv.crop || "potato";
                              const cropCls = c === "onion" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" : c === "garlic" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
                              const cropLabel = c === "onion" ? t("Onion", "प्याज") : c === "garlic" ? t("Garlic", "लहसुन") : t("Potato", "आलू");
                              return (
                                <CommandItem
                                  key={key}
                                  value={`S#${inv.serialNumber} ${placeLabel} ${inv.potatoType || ""} ${inv.size || ""} ${inv.farmerName} ${inv.farmerVillage || ""} ${inv.remainingBags} available`}
                                  onSelect={() => {
                                    handleInventorySelect(key);
                                    setLotPopoverOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", selectedInventory === key ? "opacity-100" : "opacity-0")} />
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium">
                                        S#{inv.serialNumber} - {placeLabel}{inv.potatoType ? ` - ${inv.potatoType}` : ""}{inv.size ? ` - ${inv.size}` : ""}
                                      </span>
                                      <Badge className={`text-[10px] px-1.5 py-0 font-medium border-0 shrink-0 ${cropCls}`}>{cropLabel}</Badge>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {inv.farmerName}{inv.farmerVillage ? ` (${inv.farmerVillage})` : ""} | {inv.remainingBags} {t("available", "उपलब्ध")}
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
                // Loading P&L mirrors the Create-Loading dialog: use the stock
                // register's per-bag cost (which already includes Extra Charges
                // to Buyer and farm-gate cold/warehouse share) when available,
                // and fall back to the legacy stored COGS otherwise.
                const itemCost = (isLoadingType && item.costPerBag > 0 && item.bagsMoved > 0)
                  ? item.costPerBag * item.bagsMoved
                  : item.costOfGoods;
                const itemPL = isLoadingType 
                  ? item.loadingAmount - itemCost
                  : item.revenue - itemCost;
                return (
                  <div key={item.id || `new-${index}`}>
                    {/* Desktop row */}
                    <div className="hidden md:grid grid-cols-[1fr,70px,80px,70px,90px,90px,32px] gap-2 items-center text-sm py-1">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        {(() => {
                          const c = item.crop || "potato";
                          const cls = c === "onion" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" : c === "garlic" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
                          const label = c === "onion" ? t("Onion", "प्याज") : c === "garlic" ? t("Garlic", "लहसुन") : t("Potato", "आलू");
                          return <Badge className={`text-[10px] px-1.5 py-0 font-medium border-0 w-fit ${cls}`}>{label}</Badge>;
                        })()}
                        <span className="truncate text-xs" title={`S#${item.serialNumber} - ${lotPlaceLabel(item.place, item.coldStoreName)}${item.potatoType ? ` - ${item.potatoType}` : ""}${item.size ? ` - ${item.size}` : ""}`}>
                          S#{item.serialNumber} - {lotPlaceLabel(item.place, item.coldStoreName)}{item.potatoType ? ` - ${item.potatoType}` : ""}{item.size ? ` - ${item.size}` : ""}
                        </span>
                      </div>
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
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          {(() => {
                            const c = item.crop || "potato";
                            const cls = c === "onion" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" : c === "garlic" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
                            const label = c === "onion" ? t("Onion", "प्याज") : c === "garlic" ? t("Garlic", "लहसुन") : t("Potato", "आलू");
                            return <Badge className={`text-[10px] px-1.5 py-0 font-medium border-0 w-fit ${cls}`}>{label}</Badge>;
                          })()}
                          <span className="text-xs font-medium truncate" title={`S#${item.serialNumber} - ${lotPlaceLabel(item.place, item.coldStoreName)}${item.potatoType ? ` - ${item.potatoType}` : ""}${item.size ? ` - ${item.size}` : ""}`}>
                            S#{item.serialNumber} - {lotPlaceLabel(item.place, item.coldStoreName)}{item.potatoType ? ` - ${item.potatoType}` : ""}{item.size ? ` - ${item.size}` : ""}
                          </span>
                        </div>
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
                  const cogs = (isLoadingType && i.costPerBag > 0 && i.bagsMoved > 0)
                    ? i.costPerBag * i.bagsMoved
                    : i.costOfGoods;
                  return sum + ((isLoadingType ? i.loadingAmount : i.revenue) - cogs);
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
                      <div>
                        <Label className="text-xs">{t("Mandi Comm. %", "मंडी कमीशन %")}</Label>
                        <div className="relative mt-1.5">
                          <Input
                            type="number"
                            step="any"
                            placeholder="0"
                            className="pr-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={mandiPct || ""}
                            onChange={(e) => {
                              const pct = Number(e.target.value) || 0;
                              chargesTouchedRef.current = true;
                              setMandiPct(pct);
                              form.setValue("totalMandiCommission", Math.round(totalLotAmount * pct / 100 * 100) / 100 || undefined);
                            }}
                            data-testid="input-edit-mandi-commission"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                        {/* Show the actual charge amount, not rate x base: the rate is
                            rounded to 2dp when back-derived from a saved total, so
                            recomputing here could disagree with what is stored. */}
                        <p className="text-xs text-orange-500 font-mono mt-0.5">₹{(Number(form.watch("totalMandiCommission")) || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <Label className="text-xs">{t("Aadhat Comm. %", "आढ़त कमीशन %")}</Label>
                        <div className="relative mt-1.5">
                          <Input
                            type="number"
                            step="any"
                            placeholder="0"
                            className="pr-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={aadhatPct || ""}
                            onChange={(e) => {
                              const pct = Number(e.target.value) || 0;
                              chargesTouchedRef.current = true;
                              setAadhatPct(pct);
                              form.setValue("totalAadhatCommission", Math.round(totalLotAmount * pct / 100 * 100) / 100 || undefined);
                            }}
                            data-testid="input-edit-aadhat-commission"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-orange-500 font-mono mt-0.5">₹{(Number(form.watch("totalAadhatCommission")) || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <Label className="text-xs">{t("Hammali ₹/bag", "हम्माली ₹/बोरी")}</Label>
                        <div className="relative mt-1.5">
                          <Input
                            type="number"
                            step="any"
                            placeholder="0"
                            className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={hammaliRate || ""}
                            onChange={(e) => {
                              const rate = Number(e.target.value) || 0;
                              chargesTouchedRef.current = true;
                              setHammaliRate(rate);
                              form.setValue("totalHammali", Math.round(totalEditBags * rate * 100) / 100 || undefined);
                            }}
                            data-testid="input-edit-hammali"
                          />
                        </div>
                        <p className="text-xs text-orange-500 font-mono mt-0.5">₹{(Number(form.watch("totalHammali")) || 0).toLocaleString('en-IN')}</p>
                      </div>
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

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-sm font-medium">{t("Sales Comm. %", "बिक्री कमीशन %")}</Label>
                        <div className="relative mt-1.5">
                          <Input
                            type="number"
                            step="any"
                            placeholder="0"
                            className="pr-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={salesCommPct || ""}
                            onChange={(e) => {
                              const pct = Number(e.target.value) || 0;
                              chargesTouchedRef.current = true;
                              setSalesCommPct(pct);
                              const scBase = totalLotAmount;
                              form.setValue("salesCommission", Math.round(scBase * pct / 100 * 100) / 100 || undefined);
                            }}
                            data-testid="input-edit-sales-commission"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-orange-500 font-mono mt-0.5">₹{(Number(form.watch("salesCommission")) || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">{t("Revenue", "राजस्व")} (₹)</Label>
                        <div className="mt-2 h-9 px-3 py-2 rounded-md border bg-muted text-sm flex items-center" data-testid="display-revenue">
                          ₹{(() => {
                            const lotAmounts = editableItems.filter(i => i.action !== 'remove').reduce((sum, i) => sum + (i.loadingAmount || 0), 0);
                            const mandiTotal = (Number(form.watch("totalMandiCommission")) || 0) + (Number(form.watch("totalAadhatCommission")) || 0) + (Number(form.watch("totalHammali")) || 0) + (Number(form.watch("totalMandiExtraCharges")) || 0);
                            const sc = Number(form.watch("salesCommission")) || 0;
                            const addlCharges = (Number(form.watch("tulai")) || 0) + (Number(form.watch("majduri")) || 0) + (Number(form.watch("thelaBhada")) || 0) + (Number(form.watch("palaKarai")) || 0) + (Number(form.watch("bardan")) || 0);
                            // Exclude Driver Advance from Revenue when freight is paid separately.
                            const drvAdv = watchedFreightPaidSeparately ? 0 : (Number(form.watch("advancePayment")) || 0);
                            const dbt = Number(form.watch("debit")) || 0;
                            return parseFloat((lotAmounts + mandiTotal + sc + addlCharges + drvAdv - dbt).toFixed(1)).toLocaleString('en-IN');
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
                      <FormField
                        control={form.control}
                        name="debit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("Debit", "डेबिट")} (₹)</FormLabel>
                            <FormControl>
                              <Input type="number" step="any" min="0" placeholder="0" {...field} value={field.value ?? ""} onChange={(e) => { const v = Number(e.target.value); field.onChange(e.target.value === "" ? "" : Math.max(0, v)); }} data-testid="input-edit-debit" />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">{t("Buyer deduction; reduces revenue & P&L", "खरीदार कटौती; राजस्व व लाभ/हानि घटाता है")}</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {visibleEditCharges.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {visibleEditCharges.map((key) => {
                          const opt = EDIT_CHARGE_OPTIONS.find((o) => o.key === key)!;
                          return (
                            <FormField
                              key={key}
                              control={form.control}
                              name={key}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-[10px]">{t(opt.label, opt.labelHi)} (₹)</FormLabel>
                                  <div className="flex gap-0.5">
                                    <FormControl>
                                      <Input type="number" step="any" placeholder="0" className="h-8 text-sm px-2" {...field} data-testid={`input-edit-${key}`} />
                                    </FormControl>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
                                      onClick={() => {
                                        setVisibleEditCharges((prev) => prev.filter((k) => k !== key));
                                        form.setValue(key, 0);
                                      }}
                                      data-testid={`button-remove-edit-charge-${key}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </FormItem>
                              )}
                            />
                          );
                        })}
                      </div>
                    )}

                    {visibleEditCharges.length < EDIT_CHARGE_OPTIONS.length && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" data-testid="button-edit-add-charges">
                            <Plus className="h-3.5 w-3.5" />
                            {t("Add Charges", "शुल्क जोड़ें")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-1" align="start">
                          {EDIT_CHARGE_OPTIONS.filter((o) => !visibleEditCharges.includes(o.key)).map((opt) => (
                            <Button
                              key={opt.key}
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start text-xs"
                              onClick={() => setVisibleEditCharges((prev) => [...prev, opt.key])}
                              data-testid={`button-edit-charge-option-${opt.key}`}
                            >
                              {t(opt.label, opt.labelHi)}
                            </Button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    )}

                    {(() => {
                      const activeItems = editableItems.filter(i => i.action !== 'remove');
                      const lotAmounts = activeItems.reduce((sum, i) => sum + (i.loadingAmount || 0), 0);
                      const mandiTotal = (Number(form.watch("totalMandiCommission")) || 0) + (Number(form.watch("totalAadhatCommission")) || 0) + (Number(form.watch("totalHammali")) || 0) + (Number(form.watch("totalMandiExtraCharges")) || 0);
                      const sc = Number(form.watch("salesCommission")) || 0;
                      const addlCharges = (Number(form.watch("tulai")) || 0) + (Number(form.watch("majduri")) || 0) + (Number(form.watch("thelaBhada")) || 0) + (Number(form.watch("palaKarai")) || 0) + (Number(form.watch("bardan")) || 0);
                      const drvAdv = Number(form.watch("advancePayment")) || 0;
                      const dbt = Number(form.watch("debit")) || 0;
                      const freight = Number(form.watch("totalFreight")) || 0;
                      const isPaidSeparately = form.watch("freightPaidSeparately") === true;
                      const totalCogs = activeItems.reduce((sum, i) => sum + (i.costOfGoods || 0), 0);
                      // Paid Separately: Driver Advance removed from Revenue; Total Freight deducted from P&L.
                      // Default: Driver Advance is a buyer-reimbursed pass-through (cancels in Revenue − Cost).
                      const displayedRevenue = isPaidSeparately
                        ? lotAmounts + mandiTotal + sc + addlCharges - dbt
                        : lotAmounts + mandiTotal + sc + addlCharges + drvAdv - dbt;
                      const totalPL = isPaidSeparately
                        ? displayedRevenue - totalCogs - addlCharges - freight
                        : displayedRevenue - totalCogs - addlCharges - drvAdv;
                      return (
                        <Card className={`border ${totalPL >= 0 ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"}`}>
                          <CardContent className="py-3 px-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium">{t("Total P&L", "कुल लाभ/हानि")}</p>
                                <p className="text-xs text-muted-foreground">
                                  {t("Revenue − Cost", "राजस्व − लागत")}
                                  {isPaidSeparately && ` − ${t("Freight", "माल भाड़ा")}`}
                                </p>
                              </div>
                              <p className={`text-xl font-bold ${totalPL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                {totalPL >= 0 ? "+" : ""}₹{parseFloat(Math.abs(totalPL).toFixed(1)).toLocaleString('en-IN')}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground border-t pt-1">
                              {t("Revenue", "राजस्व")}: ₹{parseFloat(displayedRevenue.toFixed(1)).toLocaleString('en-IN')}
                              {isPaidSeparately
                                ? ` (${t("excl. advance", "अग्रिम छोड़कर")})`
                                : ` (${t("incl. advance", "अग्रिम सहित")})`}
                              {" · "}{t("Cost", "लागत")}: ₹{parseFloat(totalCogs.toFixed(1)).toLocaleString('en-IN')}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="revenue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("Revenue", "राजस्व")} (₹)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="any"
                                placeholder="0"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  setRevenueOverridden(true);
                                }}
                                data-testid="input-revenue"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground mt-1">
                              {revenueOverridden
                                ? t("manually entered", "मैन्युअल रूप से दर्ज")
                                : `(${t("sum of lot revenues", "लॉट राजस्व का योग")})`}
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                      revenue={form.watch("revenue") || 0}
                      transportationCharges={form.watch("transportationCharges") || 0}
                      otherCharges={form.watch("otherCharges") || 0}
                      isLoadingType={false}
                      salesCommission={0}
                      mandiCharges={(Number(form.watch("totalMandiCommission")) || 0) + (Number(form.watch("totalHammali")) || 0)}
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
                  <strong>S#{editableItems[deleteConfirmIndex].serialNumber} - {lotPlaceLabel(editableItems[deleteConfirmIndex].place, editableItems[deleteConfirmIndex].coldStoreName)}{editableItems[deleteConfirmIndex].size ? ` - ${editableItems[deleteConfirmIndex].size}` : ""}</strong>
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
