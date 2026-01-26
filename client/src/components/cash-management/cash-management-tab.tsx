import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Banknote, Building2, Wallet, CreditCard, Filter, X, Settings, Download, Leaf, Package, ChevronsUpDown, Check, Undo2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { CashSettingsDialog } from "./cash-settings-dialog";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RECEIPT_TYPES, EXPENSE_TYPES, PAYMENT_MODES } from "@shared/schema";

interface CashEntry {
  id: number;
  merchantId: number;
  direction: string;
  receiptType: string | null;
  revenueType: string | null;
  expenseType: string | null;
  paymentMode: string | null;
  bankAccountId: number | null;
  fromAccountType: string | null;
  fromBankAccountId: number | null;
  toAccountType: string | null;
  toBankAccountId: number | null;
  partyName: string | null;
  partyVillage: string | null;
  farmerName: string | null;
  farmerVillage: string | null;
  coldStoreName: string | null;
  supplierName: string | null;
  amount: string;
  entryDate: string;
  remarks: string | null;
  isReversed: boolean | null;
  reversedAt: string | null;
  createdAt: string;
  allocations: CashEntryAllocation[];
}

interface CashEntryAllocation {
  id: number;
  cashEntryId: number;
  transactionId: number;
  merchantId: number;
  appliedAmount: string;
}

interface PartyWithDue {
  partyName: string;
  partyAddress: string | null;
  totalDue: number;
  transactionCount: number;
}

interface FarmerWithDue {
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  totalDue: number;
  entryCount: number;
}

interface ColdStoreWithDue {
  coldStoreName: string;
  totalDue: number;
  lotCount: number;
}

interface SeedFarmerWithDue {
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  totalDue: number;
  transactionCount: number;
}

interface SeedSupplierWithDue {
  supplierName: string;
  district: string | null;
  totalDue: number;
  entryCount: number;
}

interface CrossSettlementEligibility {
  hasSeedDues: boolean;
  seedDueAmount: number;
  seedTransactionIds: number[];
  hasRawPotatoDues: boolean;
  rawPotatoDueAmount: number;
  rawPotatoEntryIds: number[];
}

interface ManagedParty {
  id: number;
  name: string;
  contactNumber: string | null;
  address: string | null;
  pendingDues: string;
}

interface ManagedFarmer {
  id: number;
  name: string;
  contactNumber: string | null;
  address: string | null;
  pendingDueToBePaid: string;
}

interface CashSettings {
  id: number;
  financialYear: string;
  openingCashInHand: string;
  openingCashInAccount: string;
}

interface BankAccount {
  id: number;
  merchantId: number;
  name: string;
  accountType: string;
  openingBalance: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const inwardFormSchema = z.object({
  receiptType: z.string().min(1, "Receipt type is required"),
  revenueType: z.string().min(1, "Revenue type is required"),
  partyName: z.string().optional(),
  seedFarmerName: z.string().optional(),
  bankAccountId: z.coerce.number().optional(),
  amount: z.coerce.number().min(0, "Amount cannot be negative"),
  entryDate: z.string().min(1, "Date is required"),
  remarks: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.revenueType === "raw_potato" && (!data.partyName || data.partyName.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Party name is required",
      path: ["partyName"],
    });
  }
  if (data.revenueType === "seed_sale" && (!data.seedFarmerName || data.seedFarmerName.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Farmer name is required",
      path: ["seedFarmerName"],
    });
  }
  if (data.receiptType === "account_received" && !data.bankAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bank account is required for account transfers",
      path: ["bankAccountId"],
    });
  }
});

const outflowFormSchema = z.object({
  expenseType: z.string().min(1, "Expense type is required"),
  paymentMode: z.string().min(1, "Payment mode is required"),
  bankAccountId: z.coerce.number().optional(),
  farmerName: z.string().optional(),
  coldStoreName: z.string().optional(),
  supplierName: z.string().optional(),
  amount: z.coerce.number().min(0, "Amount cannot be negative"),
  entryDate: z.string().min(1, "Date is required"),
  remarks: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.expenseType === "farmer" && (!data.farmerName || data.farmerName.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Farmer name is required",
      path: ["farmerName"],
    });
  }
  if (data.expenseType === "cold_store_charge" && (!data.coldStoreName || data.coldStoreName.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cold store name is required",
      path: ["coldStoreName"],
    });
  }
  if (data.expenseType === "supplier" && (!data.supplierName || data.supplierName.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Supplier name is required",
      path: ["supplierName"],
    });
  }
  if (data.paymentMode === "account_transfer" && !data.bankAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bank account is required for account transfers",
      path: ["bankAccountId"],
    });
  }
});

type InwardFormValues = z.infer<typeof inwardFormSchema>;
type OutflowFormValues = z.infer<typeof outflowFormSchema>;

const transferFormSchema = z.object({
  fromAccountType: z.string().min(1, "From account is required"),
  toAccountType: z.string().min(1, "To account is required"),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  entryDate: z.string().min(1, "Date is required"),
  remarks: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.fromAccountType === data.toAccountType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cannot transfer to the same account",
      path: ["toAccountType"],
    });
  }
});

type TransferFormValues = z.infer<typeof transferFormSchema>;

export function CashManagementTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"inward" | "outflow" | "transfer">("inward");
  
  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Download dialog state
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState("");
  const [downloadEndDate, setDownloadEndDate] = useState("");
  
  // View details dialog state
  const [viewDetailsEntry, setViewDetailsEntry] = useState<CashEntry | null>(null);
  
  // Filter state
  const [filterPartyName, setFilterPartyName] = useState<string>("");
  const [filterExpenseType, setFilterExpenseType] = useState<string>("");
  const [filterFarmerName, setFilterFarmerName] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");

  // Calculate current financial year
  const currentYear = new Date().getFullYear();
  const financialYear = `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;

  const { data: entries = [], isLoading: entriesLoading } = useQuery<CashEntry[]>({
    queryKey: ["/api/cash/entries"],
  });

  const { data: parties = [] } = useQuery<PartyWithDue[]>({
    queryKey: ["/api/cash/parties"],
  });

  const { data: farmers = [] } = useQuery<FarmerWithDue[]>({
    queryKey: ["/api/cash/farmers"],
  });

  const { data: coldStores = [] } = useQuery<ColdStoreWithDue[]>({
    queryKey: ["/api/cash/cold-stores"],
  });

  // Fetch seed farmers with dues from seed transactions
  const { data: seedFarmers = [] } = useQuery<SeedFarmerWithDue[]>({
    queryKey: ["/api/cash/seed-farmers"],
  });

  // Fetch seed suppliers with dues from seed stock entries
  const { data: seedSuppliers = [] } = useQuery<SeedSupplierWithDue[]>({
    queryKey: ["/api/cash/seed-suppliers"],
  });

  // Fetch managed parties for dropdown
  const { data: managedParties = [] } = useQuery<ManagedParty[]>({
    queryKey: ["/api/cash/managed-parties"],
  });

  // Fetch managed farmers for dropdown
  const { data: managedFarmers = [] } = useQuery<ManagedFarmer[]>({
    queryKey: ["/api/cash/managed-farmers"],
  });

  // Fetch bank accounts for account transfers
  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank-accounts"],
  });

  // Fetch cash settings for opening balance
  const { data: cashSettings } = useQuery<CashSettings>({
    queryKey: ["/api/cash/settings", financialYear],
    queryFn: async () => {
      const res = await fetch(`/api/cash/settings/${financialYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const inwardForm = useForm<InwardFormValues>({
    resolver: zodResolver(inwardFormSchema),
    defaultValues: {
      receiptType: "cash_received",
      revenueType: "raw_potato",
      partyName: "",
      seedFarmerName: "",
      bankAccountId: undefined,
      amount: 0,
      entryDate: format(new Date(), "yyyy-MM-dd"),
      remarks: "",
    },
  });

  // State for seed farmer searchable popover
  const [seedFarmerPopoverOpen, setSeedFarmerPopoverOpen] = useState(false);
  
  // State for cross-settlement (separate toggles per form)
  const [outflowCrossSettlementEnabled, setOutflowCrossSettlementEnabled] = useState(true);
  const [inwardCrossSettlementEnabled, setInwardCrossSettlementEnabled] = useState(true);
  const [selectedOutflowFarmerName, setSelectedOutflowFarmerName] = useState("");
  const [selectedInwardSeedFarmerName, setSelectedInwardSeedFarmerName] = useState("");
  
  // Query for cross-settlement eligibility (for farmer payments)
  const { data: farmerCrossSettlement } = useQuery<CrossSettlementEligibility>({
    queryKey: ["/api/cash/cross-settlement-check", selectedOutflowFarmerName],
    queryFn: () => fetch(`/api/cash/cross-settlement-check?farmerName=${encodeURIComponent(selectedOutflowFarmerName)}`, { credentials: "include" }).then(res => res.json()),
    enabled: !!selectedOutflowFarmerName,
  });
  
  // Query for cross-settlement eligibility (for seed sale inward payments)
  const { data: seedFarmerCrossSettlement } = useQuery<CrossSettlementEligibility>({
    queryKey: ["/api/cash/cross-settlement-check", selectedInwardSeedFarmerName],
    queryFn: () => fetch(`/api/cash/cross-settlement-check?farmerName=${encodeURIComponent(selectedInwardSeedFarmerName)}`, { credentials: "include" }).then(res => res.json()),
    enabled: !!selectedInwardSeedFarmerName,
  });
  
  // Reset cross-settlement state when farmer name changes
  useEffect(() => {
    // Reset inward cross-settlement enabled when farmer changes
    setInwardCrossSettlementEnabled(true);
  }, [selectedInwardSeedFarmerName]);
  
  useEffect(() => {
    // Reset outflow cross-settlement enabled when farmer changes
    setOutflowCrossSettlementEnabled(true);
  }, [selectedOutflowFarmerName]);
  
  // Watch revenue type and receipt type for conditional rendering
  const revenueType = inwardForm.watch("revenueType");
  const receiptType = inwardForm.watch("receiptType");

  const outflowForm = useForm<OutflowFormValues>({
    resolver: zodResolver(outflowFormSchema),
    defaultValues: {
      expenseType: "",
      paymentMode: "cash",
      bankAccountId: undefined,
      farmerName: "",
      coldStoreName: "",
      supplierName: "",
      amount: 0,
      entryDate: format(new Date(), "yyyy-MM-dd"),
      remarks: "",
    },
  });

  // Watch payment mode for conditional bank account dropdown
  const paymentMode = outflowForm.watch("paymentMode");

  const transferForm = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      fromAccountType: "cash_in_hand",
      toAccountType: "",
      amount: 0,
      entryDate: format(new Date(), "yyyy-MM-dd"),
      remarks: "",
    },
  });

  // Watch transfer form fields for conditional bank account dropdowns
  const fromAccountType = transferForm.watch("fromAccountType");
  const toAccountType = transferForm.watch("toAccountType");

  // Reset bankAccountId when receiptType changes (inward form)
  useEffect(() => {
    if (receiptType !== "account_received") {
      inwardForm.setValue("bankAccountId", undefined);
    }
  }, [receiptType]);

  // Reset bankAccountId when paymentMode changes (outflow form)
  useEffect(() => {
    if (paymentMode !== "account_transfer") {
      outflowForm.setValue("bankAccountId", undefined);
    }
  }, [paymentMode]);

  const createEntryMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/cash/entries", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/cold-stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      toast({
        title: t("Success", "सफलता"),
        description: t("Entry recorded successfully", "प्रविष्टि सफलतापूर्वक दर्ज की गई"),
      });
      if (activeTab === "inward") {
        inwardForm.reset({
          receiptType: "cash_received",
          revenueType: "raw_potato",
          partyName: "",
          seedFarmerName: "",
          amount: 0,
          entryDate: format(new Date(), "yyyy-MM-dd"),
          remarks: "",
        });
      } else if (activeTab === "outflow") {
        outflowForm.reset({
          expenseType: "",
          paymentMode: "cash",
          farmerName: "",
          coldStoreName: "",
          supplierName: "",
          amount: 0,
          entryDate: format(new Date(), "yyyy-MM-dd"),
          remarks: "",
        });
      } else if (activeTab === "transfer") {
        transferForm.reset({
          fromAccountType: "cash_in_hand",
          toAccountType: "",
          amount: 0,
          entryDate: format(new Date(), "yyyy-MM-dd"),
          remarks: "",
        });
      }
    },
    onError: () => {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Failed to record entry", "प्रविष्टि दर्ज करने में विफल"),
        variant: "destructive",
      });
    },
  });

  const expenseType = outflowForm.watch("expenseType");

  // Merge managed parties with transaction-derived parties (de-duplicate by name)
  const mergedParties = (() => {
    const partyMap = new Map<string, { name: string; address: string | null; pendingDues: number }>();
    
    // Add transaction-derived parties first
    parties.forEach(p => {
      partyMap.set(p.partyName.toLowerCase(), {
        name: p.partyName,
        address: p.partyAddress,
        pendingDues: p.totalDue,
      });
    });
    
    // Add/override with managed parties (they take precedence for address/dues from settings)
    managedParties.forEach(p => {
      const existing = partyMap.get(p.name.toLowerCase());
      partyMap.set(p.name.toLowerCase(), {
        name: p.name,
        address: p.address || existing?.address || null,
        pendingDues: parseFloat(p.pendingDues || "0") + (existing?.pendingDues || 0),
      });
    });
    
    return Array.from(partyMap.values());
  })();

  // Merge managed farmers with stock-entry-derived farmers (de-duplicate by name)
  const mergedFarmers = (() => {
    const farmerMap = new Map<string, { name: string; contact: string | null; address: string | null; pendingDues: number }>();
    
    // Add stock-entry-derived farmers first
    farmers.forEach(f => {
      farmerMap.set(f.farmerName.toLowerCase(), {
        name: f.farmerName,
        contact: f.farmerContact,
        address: f.village,
        pendingDues: f.totalDue,
      });
    });
    
    // Add/override with managed farmers (they take precedence)
    managedFarmers.forEach(f => {
      const existing = farmerMap.get(f.name.toLowerCase());
      farmerMap.set(f.name.toLowerCase(), {
        name: f.name,
        contact: f.contactNumber || existing?.contact || null,
        address: f.address || existing?.address || null,
        pendingDues: parseFloat(f.pendingDueToBePaid || "0") + (existing?.pendingDues || 0),
      });
    });
    
    return Array.from(farmerMap.values());
  })();

  const onInwardSubmit = (values: InwardFormValues) => {
    if (values.revenueType === "raw_potato") {
      // Raw potato inward always requires amount > 0
      if (values.amount <= 0) {
        inwardForm.setError("amount", { 
          type: "manual", 
          message: t("Amount must be greater than 0", "राशि 0 से अधिक होनी चाहिए") 
        });
        return;
      }
      const selectedParty = mergedParties.find(p => p.name.toLowerCase() === values.partyName?.toLowerCase());
      createEntryMutation.mutate({
        direction: "inward",
        receiptType: values.receiptType,
        revenueType: values.revenueType,
        partyName: values.partyName,
        partyVillage: selectedParty?.address || null,
        bankAccountId: values.receiptType === "account_received" ? values.bankAccountId : null,
        amount: values.amount,
        entryDate: values.entryDate,
        remarks: values.remarks || null,
      });
    } else {
      // Seed sale - use seed farmer with cross-settlement
      const selectedSeedFarmer = seedFarmers.find(f => f.farmerName.toLowerCase() === values.seedFarmerName?.toLowerCase());
      
      // Calculate cross-settlement for seed_to_raw direction (receiving seed payment, offset raw potato dues)
      // Settlement amount = min(seedDue, rawPotatoDue) - automatic when enabled
      let crossSettlementData = undefined;
      const isCrossSettlementEligible = inwardCrossSettlementEnabled && 
          seedFarmerCrossSettlement?.hasRawPotatoDues && seedFarmerCrossSettlement?.hasSeedDues;
      
      if (isCrossSettlementEligible) {
        // Auto-calculate: min of seed dues and raw potato dues
        const settlementAmount = Math.min(
          seedFarmerCrossSettlement.seedDueAmount,
          seedFarmerCrossSettlement.rawPotatoDueAmount
        );
        if (settlementAmount > 0) {
          crossSettlementData = {
            settledAmount: settlementAmount,
            direction: 'seed_to_raw' as const,
            seedTransactionIds: seedFarmerCrossSettlement.seedTransactionIds,
            rawPotatoEntryIds: seedFarmerCrossSettlement.rawPotatoEntryIds,
          };
        }
      }
      
      // Validate: amount must be > 0 if no cross-settlement
      if (values.amount === 0 && !crossSettlementData) {
        inwardForm.setError("amount", { 
          type: "manual", 
          message: t("Amount must be greater than 0 (or enable cross-settlement)", "राशि 0 से अधिक होनी चाहिए (या क्रॉस-सेटलमेंट सक्षम करें)") 
        });
        return;
      }
      
      createEntryMutation.mutate({
        direction: "inward",
        receiptType: values.receiptType,
        revenueType: values.revenueType,
        farmerName: values.seedFarmerName,
        farmerVillage: selectedSeedFarmer?.village || null,
        bankAccountId: values.receiptType === "account_received" ? values.bankAccountId : null,
        amount: values.amount,
        entryDate: values.entryDate,
        remarks: values.remarks || null,
        crossSettlement: crossSettlementData,
      });
    }
  };

  const onOutflowSubmit = (values: OutflowFormValues) => {
    const selectedFarmer = values.expenseType === "farmer" 
      ? mergedFarmers.find(f => f.name.toLowerCase() === values.farmerName?.toLowerCase())
      : null;
    
    // Calculate cross-settlement for raw_to_seed direction (paying farmer, offset seed dues)
    // Settlement amount = min(rawPotatoDue, seedDue) - automatic when enabled
    let crossSettlementData = undefined;
    const isCrossSettlementEligible = outflowCrossSettlementEnabled && values.expenseType === "farmer" && 
        farmerCrossSettlement?.hasSeedDues && farmerCrossSettlement?.hasRawPotatoDues;
    
    if (isCrossSettlementEligible) {
      // Auto-calculate: min of seed dues and raw potato dues
      const settlementAmount = Math.min(
        farmerCrossSettlement.seedDueAmount, 
        farmerCrossSettlement.rawPotatoDueAmount
      );
      if (settlementAmount > 0) {
        crossSettlementData = {
          settledAmount: settlementAmount,
          direction: 'raw_to_seed' as const,
          seedTransactionIds: farmerCrossSettlement.seedTransactionIds,
          rawPotatoEntryIds: farmerCrossSettlement.rawPotatoEntryIds,
        };
      }
    }
    
    // Validate: amount must be > 0 if no cross-settlement
    if (values.amount === 0 && !crossSettlementData) {
      outflowForm.setError("amount", { 
        type: "manual", 
        message: t("Amount must be greater than 0 (or enable cross-settlement)", "राशि 0 से अधिक होनी चाहिए (या क्रॉस-सेटलमेंट सक्षम करें)") 
      });
      return;
    }
    
    createEntryMutation.mutate({
      direction: "outflow",
      expenseType: values.expenseType,
      paymentMode: values.paymentMode,
      bankAccountId: values.paymentMode === "account_transfer" ? values.bankAccountId : null,
      farmerName: values.expenseType === "farmer" ? values.farmerName : null,
      farmerVillage: selectedFarmer?.address || null,
      coldStoreName: values.expenseType === "cold_store_charge" ? values.coldStoreName : null,
      supplierName: values.expenseType === "supplier" ? values.supplierName : null,
      amount: values.amount,
      entryDate: values.entryDate,
      remarks: values.remarks || null,
      crossSettlement: crossSettlementData,
    });
  };

  const onTransferSubmit = (values: TransferFormValues) => {
    // Parse from account - can be "cash_in_hand" or "bank_{id}"
    const isFromBank = values.fromAccountType.startsWith("bank_");
    const fromBankId = isFromBank ? parseInt(values.fromAccountType.replace("bank_", "")) : null;
    
    // Parse to account - can be "cash_in_hand" or "bank_{id}"
    const isToBank = values.toAccountType.startsWith("bank_");
    const toBankId = isToBank ? parseInt(values.toAccountType.replace("bank_", "")) : null;
    
    createEntryMutation.mutate({
      direction: "transfer",
      fromAccountType: isFromBank ? "bank_account" : "cash_in_hand",
      fromBankAccountId: fromBankId,
      toAccountType: isToBank ? "bank_account" : "cash_in_hand",
      toBankAccountId: toBankId,
      amount: values.amount,
      entryDate: values.entryDate,
      remarks: values.remarks || null,
    });
  };

  // Calculate summary values
  const totalCashReceived = entries
    .filter(e => e.direction === "inward" && e.receiptType === "cash_received")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  
  const totalAccountReceived = entries
    .filter(e => e.direction === "inward" && e.receiptType === "account_received")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  
  const totalCashExpense = entries
    .filter(e => e.direction === "outflow" && e.paymentMode === "cash")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  
  const totalAccountExpense = entries
    .filter(e => e.direction === "outflow" && e.paymentMode === "account_transfer")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  
  // Include opening balance from settings
  const openingCashInHand = cashSettings ? parseFloat(cashSettings.openingCashInHand || "0") : 0;
  const legacyOpeningCashInAccount = cashSettings ? parseFloat(cashSettings.openingCashInAccount || "0") : 0;
  
  const netCashInHand = openingCashInHand + totalCashReceived - totalCashExpense;

  // Calculate account-wise breakdown for entries that have bankAccountId
  const accountWiseBreakdown = bankAccounts.map(account => {
    const inward = entries
      .filter(e => e.direction === "inward" && e.receiptType === "account_received" && e.bankAccountId === account.id)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    const outflow = entries
      .filter(e => e.direction === "outflow" && e.paymentMode === "account_transfer" && e.bankAccountId === account.id)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    const openingBalance = parseFloat(account.openingBalance || "0");
    const net = openingBalance + inward - outflow;
    
    return {
      id: account.id,
      name: account.name,
      accountType: account.accountType,
      openingBalance,
      inward,
      outflow,
      net
    };
  });

  // Calculate unassigned account transactions (older entries without bankAccountId)
  const unassignedAccountReceived = entries
    .filter(e => e.direction === "inward" && e.receiptType === "account_received" && !e.bankAccountId)
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  
  const unassignedAccountExpense = entries
    .filter(e => e.direction === "outflow" && e.paymentMode === "account_transfer" && !e.bankAccountId)
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  // Unassigned net uses legacy opening balance (from cash settings) 
  const unassignedAccountNet = legacyOpeningCashInAccount + unassignedAccountReceived - unassignedAccountExpense;

  // Calculate total net in account (sum of all per-account nets + unassigned net, or legacy calculation if no accounts)
  const netCashInAccount = bankAccounts.length > 0
    ? accountWiseBreakdown.reduce((sum, a) => sum + a.net, 0) + unassignedAccountNet
    : legacyOpeningCashInAccount + totalAccountReceived - totalAccountExpense;

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    const entryDate = new Date(entry.entryDate);
    const entryMonth = (entryDate.getMonth() + 1).toString();
    const entryYear = entryDate.getFullYear().toString();

    if (filterPartyName && filterPartyName !== "all" && entry.partyName !== filterPartyName) return false;
    if (filterExpenseType && filterExpenseType !== "all" && entry.expenseType !== filterExpenseType) return false;
    if (filterFarmerName && filterFarmerName !== "all" && entry.farmerName !== filterFarmerName) return false;
    if (filterMonth && filterMonth !== "all" && entryMonth !== filterMonth) return false;
    if (filterYear && filterYear !== "all" && entryYear !== filterYear) return false;
    return true;
  });

  // Filtered summary
  const filteredInflow = filteredEntries
    .filter(e => e.direction === "inward")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  
  const filteredOutflow = filteredEntries
    .filter(e => e.direction === "outflow")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  // Get unique values for filter dropdowns
  const uniquePartyNames = Array.from(new Set(entries.filter(e => e.partyName).map(e => e.partyName!)));
  const uniqueFarmerOptions = (() => {
    const farmerMap = new Map<string, { name: string; village: string | null; contact: string | null }>();
    entries.filter(e => e.farmerName).forEach(e => {
      const key = e.farmerName!.toLowerCase();
      if (!farmerMap.has(key)) {
        // Try to find contact info from the farmers query data
        const farmerWithDue = farmers.find(f => f.farmerName.toLowerCase() === key);
        farmerMap.set(key, {
          name: e.farmerName!,
          village: e.farmerVillage || farmerWithDue?.village || null,
          contact: farmerWithDue?.farmerContact || null,
        });
      }
    });
    return Array.from(farmerMap.values());
  })();
  const uniqueFarmerNames = uniqueFarmerOptions.map(f => f.name);
  const uniqueYears = Array.from(new Set(entries.map(e => new Date(e.entryDate).getFullYear().toString()))).sort().reverse();

  const hasActiveFilters = (filterPartyName && filterPartyName !== "all") || 
    (filterExpenseType && filterExpenseType !== "all") || 
    (filterFarmerName && filterFarmerName !== "all") || 
    (filterMonth && filterMonth !== "all") || 
    (filterYear && filterYear !== "all");

  const clearFilters = () => {
    setFilterPartyName("");
    setFilterExpenseType("");
    setFilterFarmerName("");
    setFilterMonth("");
    setFilterYear("");
  };

  const getReceiptTypeLabel = (type: string) => {
    switch (type) {
      case "cash_received": return t("Cash Received", "नकद प्राप्त");
      case "account_received": return t("Account Received", "खाते में प्राप्त");
      default: return type;
    }
  };

  const getExpenseTypeLabel = (type: string) => {
    switch (type) {
      case "salary": return t("Salary", "वेतन");
      case "general_expense": return t("General Expense", "सामान्य खर्च");
      case "grading": return t("Grading", "ग्रेडिंग");
      case "hammali": return t("Hammali", "हम्माली");
      case "farmer": return t("Farmer", "किसान");
      case "cold_store_charge": return t("Cold Store Charge", "शीत भंडार शुल्क");
      case "supplier": return t("Supplier", "आपूर्तिकर्ता");
      default: return type;
    }
  };

  const getPaymentModeLabel = (mode: string) => {
    switch (mode) {
      case "cash": return t("Cash", "नकद");
      case "account_transfer": return t("Account Transfer", "खाता स्थानांतरण");
      default: return mode;
    }
  };

  const getRevenueTypeLabel = (type: string) => {
    switch (type) {
      case "raw_potato": return t("Raw Potato", "कच्चा आलू");
      case "seed_sale": return t("Seed Sale", "बीज बिक्री");
      default: return type;
    }
  };

  const handleDownloadCSV = () => {
    if (!downloadStartDate || !downloadEndDate) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Please select both start and end dates", "कृपया आरंभ और समाप्ति दोनों तिथियाँ चुनें"),
        variant: "destructive",
      });
      return;
    }

    const startDate = new Date(downloadStartDate);
    const endDate = new Date(downloadEndDate);
    
    if (startDate > endDate) {
      toast({
        title: t("Error", "त्रुटि"),
        description: t("Start date cannot be after end date", "आरंभ तिथि समाप्ति तिथि के बाद नहीं हो सकती"),
        variant: "destructive",
      });
      return;
    }

    const filteredForDownload = entries.filter(entry => {
      const entryDate = new Date(entry.entryDate);
      return entryDate >= startDate && entryDate <= endDate;
    });

    if (filteredForDownload.length === 0) {
      toast({
        title: t("No Data", "कोई डेटा नहीं"),
        description: t("No entries found in the selected date range", "चयनित तिथि सीमा में कोई प्रविष्टि नहीं मिली"),
        variant: "destructive",
      });
      return;
    }

    const headers = [
      t("Date", "तिथि"),
      t("Direction", "दिशा"),
      t("Receipt Type", "रसीद प्रकार"),
      t("Revenue Type", "राजस्व प्रकार"),
      t("Expense Type", "खर्च प्रकार"),
      t("Payment Mode", "भुगतान माध्यम"),
      t("Party Name", "पार्टी का नाम"),
      t("Party Village", "पार्टी का गाँव"),
      t("Farmer Name", "किसान का नाम"),
      t("Farmer Village", "किसान का गाँव"),
      t("Cold Store", "शीत भंडार"),
      t("Supplier Name", "आपूर्तिकर्ता का नाम"),
      t("Amount", "राशि"),
      t("Status", "स्थिति"),
      t("Remarks", "टिप्पणी"),
      t("Created At", "बनाया गया"),
    ];

    const rows = filteredForDownload.map(entry => [
      format(new Date(entry.entryDate), "dd/MM/yyyy"),
      entry.direction === "inward" ? t("Inward", "आवक") : t("Outflow", "जावक"),
      entry.receiptType ? getReceiptTypeLabel(entry.receiptType) : "",
      entry.revenueType ? getRevenueTypeLabel(entry.revenueType) : "",
      entry.expenseType ? getExpenseTypeLabel(entry.expenseType) : "",
      entry.paymentMode ? getPaymentModeLabel(entry.paymentMode) : "",
      entry.partyName || "",
      entry.partyVillage || "",
      entry.farmerName || "",
      entry.farmerVillage || "",
      entry.coldStoreName || "",
      entry.supplierName || "",
      entry.amount,
      entry.isReversed ? t("Reversed", "उलट दिया गया") : t("Active", "सक्रिय"),
      entry.remarks || "",
      format(new Date(entry.createdAt), "dd/MM/yyyy HH:mm"),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `cash_entries_${downloadStartDate}_to_${downloadEndDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    setDownloadDialogOpen(false);
    setDownloadStartDate("");
    setDownloadEndDate("");
    
    toast({
      title: t("Success", "सफल"),
      description: t("CSV downloaded successfully", "CSV सफलतापूर्वक डाउनलोड हुई"),
    });
  };

  return (
    <div className="space-y-6" data-testid="cash-management-tab">
      {/* Settings Dialog */}
      <CashSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      
      {/* Download Dialog */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Download Cash Entries", "नकद प्रविष्टियाँ डाउनलोड करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">{t("Start Date", "आरंभ तिथि")}</Label>
              <Input
                id="start-date"
                type="date"
                value={downloadStartDate}
                onChange={(e) => setDownloadStartDate(e.target.value)}
                data-testid="input-download-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">{t("End Date", "समाप्ति तिथि")}</Label>
              <Input
                id="end-date"
                type="date"
                value={downloadEndDate}
                onChange={(e) => setDownloadEndDate(e.target.value)}
                data-testid="input-download-end-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} data-testid="button-download-cancel">
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleDownloadCSV} data-testid="button-download-csv">
              <Download className="h-4 w-4 mr-2" />
              {t("Download CSV", "CSV डाउनलोड करें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* View Details Dialog */}
      <Dialog open={!!viewDetailsEntry} onOpenChange={(open) => !open && setViewDetailsEntry(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Cash Entry Details", "नकद प्रविष्टि विवरण")}</DialogTitle>
          </DialogHeader>
          {viewDetailsEntry && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("Entry Date", "प्रविष्टि तिथि")}</Label>
                  <p className="font-medium">{format(new Date(viewDetailsEntry.entryDate), "dd/MM/yyyy")}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("Direction", "दिशा")}</Label>
                  <p className="font-medium">{viewDetailsEntry.direction === "inward" ? t("Inward", "आवक") : t("Outflow", "जावक")}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("Amount", "राशि")}</Label>
                  <p className={cn("font-bold text-lg", viewDetailsEntry.direction === "inward" ? "text-green-600" : "text-amber-600")}>
                    {viewDetailsEntry.direction === "inward" ? "+" : "-"}₹{parseFloat(viewDetailsEntry.amount).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("Status", "स्थिति")}</Label>
                  <p className="font-medium">{viewDetailsEntry.isReversed ? t("Reversed", "उलट दिया गया") : t("Active", "सक्रिय")}</p>
                </div>
              </div>

              {viewDetailsEntry.direction === "inward" && (
                <>
                  <div className="border-t pt-3">
                    <h4 className="font-semibold text-sm mb-2">{t("Inward Details", "आवक विवरण")}</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("Receipt Type", "रसीद प्रकार")}</Label>
                        <p className="font-medium">{getReceiptTypeLabel(viewDetailsEntry.receiptType || "")}</p>
                      </div>
                      {viewDetailsEntry.revenueType && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("Revenue Type", "राजस्व प्रकार")}</Label>
                          <p className="font-medium">{getRevenueTypeLabel(viewDetailsEntry.revenueType)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {viewDetailsEntry.partyName && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("Party Name", "पार्टी का नाम")}</Label>
                        <p className="font-medium">{viewDetailsEntry.partyName}</p>
                      </div>
                      {viewDetailsEntry.partyVillage && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("Party Village", "पार्टी का गाँव")}</Label>
                          <p className="font-medium">{viewDetailsEntry.partyVillage}</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {viewDetailsEntry.farmerName && viewDetailsEntry.revenueType === "seed_sale" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("Farmer Name", "किसान का नाम")}</Label>
                        <p className="font-medium">{viewDetailsEntry.farmerName}</p>
                      </div>
                      {viewDetailsEntry.farmerVillage && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("Farmer Village", "किसान का गाँव")}</Label>
                          <p className="font-medium">{viewDetailsEntry.farmerVillage}</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {viewDetailsEntry.direction === "outflow" && (
                <>
                  <div className="border-t pt-3">
                    <h4 className="font-semibold text-sm mb-2">{t("Outflow Details", "जावक विवरण")}</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("Expense Type", "खर्च प्रकार")}</Label>
                        <p className="font-medium">{getExpenseTypeLabel(viewDetailsEntry.expenseType || "")}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("Payment Mode", "भुगतान माध्यम")}</Label>
                        <p className="font-medium">{getPaymentModeLabel(viewDetailsEntry.paymentMode || "")}</p>
                      </div>
                    </div>
                  </div>
                  
                  {viewDetailsEntry.farmerName && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("Farmer Name", "किसान का नाम")}</Label>
                        <p className="font-medium">{viewDetailsEntry.farmerName}</p>
                      </div>
                      {viewDetailsEntry.farmerVillage && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("Farmer Village", "किसान का गाँव")}</Label>
                          <p className="font-medium">{viewDetailsEntry.farmerVillage}</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {viewDetailsEntry.coldStoreName && (
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("Cold Store Name", "शीत भंडार का नाम")}</Label>
                      <p className="font-medium">{viewDetailsEntry.coldStoreName}</p>
                    </div>
                  )}
                  
                  {viewDetailsEntry.supplierName && (
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("Supplier Name", "आपूर्तिकर्ता का नाम")}</Label>
                      <p className="font-medium">{viewDetailsEntry.supplierName}</p>
                    </div>
                  )}
                </>
              )}

              {viewDetailsEntry.remarks && (
                <div className="border-t pt-3">
                  <Label className="text-xs text-muted-foreground">{t("Remarks", "टिप्पणी")}</Label>
                  <p className="font-medium">{viewDetailsEntry.remarks}</p>
                </div>
              )}

              <div className="border-t pt-3 text-xs text-muted-foreground">
                <p>{t("Created", "बनाया गया")}: {format(new Date(viewDetailsEntry.createdAt), "dd/MM/yyyy HH:mm")}</p>
                {viewDetailsEntry.reversedAt && (
                  <p>{t("Reversed", "उलटा गया")}: {format(new Date(viewDetailsEntry.reversedAt), "dd/MM/yyyy HH:mm")}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDetailsEntry(null)} data-testid="button-close-details">
              {t("Close", "बंद करें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Header with Settings Button */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("Cash Management", "नकद प्रबंधन")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Track payments received and expenses", "प्राप्त भुगतान और खर्चों को ट्रैक करें")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDownloadDialogOpen(true)}
            title={t("Download", "डाउनलोड")}
            data-testid="button-cash-download"
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            title={t("Settings", "सेटिंग्स")}
            data-testid="button-cash-settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card data-testid="card-cash-received">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Banknote className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Cash Received", "नकद प्राप्त")}</span>
            </div>
            <p className="text-lg font-bold text-green-600">₹{totalCashReceived.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-account-received">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Account Received", "खाते में प्राप्त")}</span>
            </div>
            <p className="text-lg font-bold text-blue-600">₹{totalAccountReceived.toLocaleString()}</p>
            {accountWiseBreakdown.length > 0 && (
              <div className="mt-2 pt-2 border-t border-blue-200 space-y-1">
                {accountWiseBreakdown.filter(a => a.inward > 0).map(account => (
                  <div key={account.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[100px]" title={account.name}>{account.name}</span>
                    <span className="text-blue-600 font-medium">₹{account.inward.toLocaleString()}</span>
                  </div>
                ))}
                {unassignedAccountReceived > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground italic">{t("Unassigned", "अनिर्दिष्ट")}</span>
                    <span className="text-blue-600 font-medium">₹{unassignedAccountReceived.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-cash-expense">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Cash Expense", "नकद खर्च")}</span>
            </div>
            <p className="text-lg font-bold text-amber-600">₹{totalCashExpense.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-account-expense">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <CreditCard className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Account Expense", "खाता खर्च")}</span>
            </div>
            <p className="text-lg font-bold text-orange-600">₹{totalAccountExpense.toLocaleString()}</p>
            {accountWiseBreakdown.length > 0 && (
              <div className="mt-2 pt-2 border-t border-orange-200 space-y-1">
                {accountWiseBreakdown.filter(a => a.outflow > 0).map(account => (
                  <div key={account.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[100px]" title={account.name}>{account.name}</span>
                    <span className="text-orange-600 font-medium">₹{account.outflow.toLocaleString()}</span>
                  </div>
                ))}
                {unassignedAccountExpense > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground italic">{t("Unassigned", "अनिर्दिष्ट")}</span>
                    <span className="text-orange-600 font-medium">₹{unassignedAccountExpense.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-net-cash">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-teal-600 mb-1">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Net Cash in Hand", "हाथ में शुद्ध नकद")}</span>
            </div>
            <p className={`text-lg font-bold ${netCashInHand >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
              ₹{netCashInHand.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-net-account">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-indigo-600 mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Net in Account", "खाते में शुद्ध")}</span>
            </div>
            <p className={`text-lg font-bold ${netCashInAccount >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
              ₹{netCashInAccount.toLocaleString()}
            </p>
            {accountWiseBreakdown.length > 0 && (
              <div className="mt-2 pt-2 border-t border-indigo-200 space-y-1">
                {accountWiseBreakdown.map(account => (
                  <div key={account.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[100px]" title={account.name}>{account.name}</span>
                    <span className={`font-medium ${account.net >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                      ₹{account.net.toLocaleString()}
                    </span>
                  </div>
                ))}
                {(unassignedAccountReceived > 0 || unassignedAccountExpense > 0 || legacyOpeningCashInAccount > 0) && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground italic">{t("Unassigned", "अनिर्दिष्ट")}</span>
                    <span className={`font-medium ${unassignedAccountNet >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                      ₹{unassignedAccountNet.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters Section */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">{t("Filters", "फ़िल्टर")}</span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="ml-auto text-xs h-7"
                data-testid="button-clear-filters"
              >
                <X className="h-3 w-3 mr-1" />
                {t("Clear", "साफ़ करें")}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Select value={filterPartyName} onValueChange={setFilterPartyName}>
              <SelectTrigger data-testid="filter-party-name" className="h-9">
                <SelectValue placeholder={t("Party Name", "पार्टी का नाम")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Parties", "सभी पार्टी")}</SelectItem>
                {uniquePartyNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterExpenseType} onValueChange={setFilterExpenseType}>
              <SelectTrigger data-testid="filter-expense-type" className="h-9">
                <SelectValue placeholder={t("Expense Type", "खर्च प्रकार")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Types", "सभी प्रकार")}</SelectItem>
                {EXPENSE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{getExpenseTypeLabel(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterFarmerName} onValueChange={setFilterFarmerName}>
              <SelectTrigger data-testid="filter-farmer-name" className="h-9">
                <SelectValue placeholder={t("Farmer Name", "किसान का नाम")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Farmers", "सभी किसान")}</SelectItem>
                {uniqueFarmerOptions.map((farmer) => (
                  <SelectItem key={farmer.name} value={farmer.name}>
                    <div className="flex flex-col">
                      <span>{farmer.name}</span>
                      {(farmer.village || farmer.contact) && (
                        <span className="text-xs text-muted-foreground">
                          {farmer.village || ""}
                          {farmer.village && farmer.contact && " • "}
                          {farmer.contact || ""}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger data-testid="filter-month" className="h-9">
                <SelectValue placeholder={t("Month", "महीना")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Months", "सभी महीने")}</SelectItem>
                <SelectItem value="1">{t("January", "जनवरी")}</SelectItem>
                <SelectItem value="2">{t("February", "फरवरी")}</SelectItem>
                <SelectItem value="3">{t("March", "मार्च")}</SelectItem>
                <SelectItem value="4">{t("April", "अप्रैल")}</SelectItem>
                <SelectItem value="5">{t("May", "मई")}</SelectItem>
                <SelectItem value="6">{t("June", "जून")}</SelectItem>
                <SelectItem value="7">{t("July", "जुलाई")}</SelectItem>
                <SelectItem value="8">{t("August", "अगस्त")}</SelectItem>
                <SelectItem value="9">{t("September", "सितम्बर")}</SelectItem>
                <SelectItem value="10">{t("October", "अक्टूबर")}</SelectItem>
                <SelectItem value="11">{t("November", "नवम्बर")}</SelectItem>
                <SelectItem value="12">{t("December", "दिसम्बर")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger data-testid="filter-year" className="h-9">
                <SelectValue placeholder={t("Year", "वर्ष")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Years", "सभी वर्ष")}</SelectItem>
                {uniqueYears.length > 0 ? (
                  uniqueYears.map((year) => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Filtered Summary */}
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{t("Filtered Total", "फ़िल्टर्ड कुल")}:</span>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400">
                {t("Inflow", "आवक")}: ₹{filteredInflow.toLocaleString()}
              </Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400">
                {t("Outflow", "बहिर्वाह")}: ₹{filteredOutflow.toLocaleString()}
              </Badge>
              <span className="text-muted-foreground">({filteredEntries.length} {t("entries", "प्रविष्टियाँ")})</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row gap-6 h-full">
        <div className="w-full md:w-1/2 space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "inward" | "outflow" | "transfer")}>
          <TabsList className="grid w-full grid-cols-3 bg-green-50 dark:bg-green-900/20">
            <TabsTrigger value="inward" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-white" data-testid="tab-inward">
              <ArrowDownLeft className="h-4 w-4" />
              {t("Inward Cash", "नकद आवक")}
            </TabsTrigger>
            <TabsTrigger value="outflow" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-white" data-testid="tab-outflow">
              <ArrowUpRight className="h-4 w-4" />
              {t("Expense", "खर्च")}
            </TabsTrigger>
            <TabsTrigger value="transfer" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-white" data-testid="tab-transfer">
              <RefreshCw className="h-4 w-4" />
              {t("Transfer", "ट्रांसफर")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Card className="relative z-10">
          <CardContent className="pt-6">
            <div className={activeTab === "inward" ? "block" : "hidden"}>
              <Form {...inwardForm}>
                <form onSubmit={inwardForm.handleSubmit(onInwardSubmit)} className="space-y-4">
                  <FormField
                    control={inwardForm.control}
                    name="receiptType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Receipt Type", "रसीद प्रकार")} *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-receipt-type">
                              <SelectValue placeholder={t("Select receipt type", "रसीद प्रकार चुनें")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cash_received">
                              <div className="flex items-center gap-2">
                                <Banknote className="h-4 w-4" />
                                {t("Cash Received", "नकद प्राप्त")}
                              </div>
                            </SelectItem>
                            <SelectItem value="account_received">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4" />
                                {t("Account Received", "खाते में प्राप्त")}
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {receiptType === "account_received" && bankAccounts.length > 0 && (
                    <FormField
                      control={inwardForm.control}
                      name="bankAccountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Bank Account", "बैंक खाता")} *</FormLabel>
                          <Select onValueChange={(value) => field.onChange(Number(value))} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger data-testid="select-inward-bank-account">
                                <SelectValue placeholder={t("Select account", "खाता चुनें")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {bankAccounts.filter(a => a.isActive).map((account) => (
                                <SelectItem key={account.id} value={account.id.toString()}>
                                  {account.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {receiptType === "account_received" && bankAccounts.length === 0 && (
                    <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                      {t("No bank accounts configured. Add accounts in Settings.", "कोई बैंक खाता कॉन्फ़िगर नहीं है। सेटिंग्स में खाते जोड़ें।")}
                    </div>
                  )}

                  <FormField
                    control={inwardForm.control}
                    name="revenueType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Revenue Type", "राजस्व प्रकार")} *</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          inwardForm.setValue("partyName", "");
                          inwardForm.setValue("seedFarmerName", "");
                        }} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-revenue-type">
                              <SelectValue placeholder={t("Select revenue type", "राजस्व प्रकार चुनें")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="raw_potato">
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                {t("Raw Potato", "कच्चा आलू")}
                              </div>
                            </SelectItem>
                            <SelectItem value="seed_sale">
                              <div className="flex items-center gap-2">
                                <Leaf className="h-4 w-4" />
                                {t("Seed Sale", "बीज बिक्री")}
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {revenueType === "raw_potato" && (
                    <FormField
                      control={inwardForm.control}
                      name="partyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Party Name", "पार्टी का नाम")} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-party-name">
                                <SelectValue placeholder={t("Select Party", "पार्टी चुनें")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {mergedParties.map((party) => (
                                <SelectItem key={party.name} value={party.name}>
                                  <div className="flex items-center justify-between gap-4">
                                    <span>{party.name}</span>
                                    {party.address && (
                                      <span className="text-xs text-muted-foreground">({party.address})</span>
                                    )}
                                    <Badge variant="secondary">
                                      {t("Due", "बकाया")}: ₹{party.pendingDues.toFixed(0)}
                                    </Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {revenueType === "seed_sale" && (
                    <>
                      <FormField
                        control={inwardForm.control}
                        name="seedFarmerName"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>{t("Farmer Name", "किसान का नाम")} *</FormLabel>
                            <Popover open={seedFarmerPopoverOpen} onOpenChange={setSeedFarmerPopoverOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      "w-full justify-between",
                                      !field.value && "text-muted-foreground"
                                    )}
                                    data-testid="select-seed-farmer"
                                  >
                                    {field.value
                                      ? seedFarmers.find(f => f.farmerName === field.value)?.farmerName || field.value
                                      : t("Select Farmer", "किसान चुनें")}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-[350px] p-0" align="start">
                                <Command>
                                  <CommandInput placeholder={t("Search farmer...", "किसान खोजें...")} />
                                  <CommandList>
                                    <CommandEmpty>{t("No farmer found.", "कोई किसान नहीं मिला।")}</CommandEmpty>
                                    <CommandGroup>
                                      {seedFarmers.map((farmer) => (
                                        <CommandItem
                                          key={farmer.farmerName}
                                          value={`${farmer.farmerName} ${farmer.village || ""}`}
                                          onSelect={() => {
                                            field.onChange(farmer.farmerName);
                                            setSelectedInwardSeedFarmerName(farmer.farmerName);
                                            setSeedFarmerPopoverOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              field.value === farmer.farmerName ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          <div className="flex flex-col flex-1">
                                            <span className="font-medium">{farmer.farmerName}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {farmer.village || ""}
                                              {farmer.village && farmer.farmerContact && " • "}
                                              {farmer.farmerContact || ""}
                                            </span>
                                          </div>
                                          <Badge variant="secondary" className="ml-2">
                                            ₹{farmer.totalDue.toFixed(0)}
                                          </Badge>
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
                      
                      {/* Cross-settlement preview for seed sale payment */}
                      {seedFarmerCrossSettlement?.hasRawPotatoDues && seedFarmerCrossSettlement?.hasSeedDues && (
                        <Card className="border-secondary bg-secondary/50">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 text-foreground font-medium text-sm mb-1">
                                  <RefreshCw className="h-4 w-4" />
                                  {t("Cross-Settlement", "क्रॉस-सेटलमेंट")}
                                  {inwardCrossSettlementEnabled && (
                                    <Badge variant="default" className="text-xs">
                                      ₹{Math.min(seedFarmerCrossSettlement.seedDueAmount, seedFarmerCrossSettlement.rawPotatoDueAmount).toFixed(0)}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {inwardCrossSettlementEnabled ? t(
                                    `Auto-settling ₹${Math.min(seedFarmerCrossSettlement.seedDueAmount, seedFarmerCrossSettlement.rawPotatoDueAmount).toFixed(0)} (min of seed dues ₹${seedFarmerCrossSettlement.seedDueAmount.toFixed(0)} and raw dues ₹${seedFarmerCrossSettlement.rawPotatoDueAmount.toFixed(0)}). Any amount above is additional cash.`,
                                    `₹${Math.min(seedFarmerCrossSettlement.seedDueAmount, seedFarmerCrossSettlement.rawPotatoDueAmount).toFixed(0)} स्वतः सेटल। नीचे की राशि अतिरिक्त नकद है।`
                                  ) : t(
                                    `Farmer owes ₹${seedFarmerCrossSettlement.seedDueAmount.toFixed(0)} for seeds. You owe farmer ₹${seedFarmerCrossSettlement.rawPotatoDueAmount.toFixed(0)} for raw potatoes.`,
                                    `किसान पर ₹${seedFarmerCrossSettlement.seedDueAmount.toFixed(0)} बीज का बकाया है। आप पर किसान का ₹${seedFarmerCrossSettlement.rawPotatoDueAmount.toFixed(0)} कच्चे का बकाया है।`
                                  )}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant={inwardCrossSettlementEnabled ? "default" : "outline"}
                                size="sm"
                                className="text-xs shrink-0"
                                onClick={() => setInwardCrossSettlementEnabled(!inwardCrossSettlementEnabled)}
                                data-testid="button-toggle-cross-settlement-inward"
                              >
                                {inwardCrossSettlementEnabled 
                                  ? t("Enabled", "सक्षम") 
                                  : t("Disabled", "अक्षम")}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}

                  <FormField
                    control={inwardForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {(revenueType === "seed_sale" && inwardCrossSettlementEnabled && 
                            seedFarmerCrossSettlement?.hasSeedDues && seedFarmerCrossSettlement?.hasRawPotatoDues)
                            ? t("Additional Cash Amount", "अतिरिक्त नकद राशि")
                            : t("Amount", "राशि")} (₹) {!(revenueType === "seed_sale" && inwardCrossSettlementEnabled && 
                            seedFarmerCrossSettlement?.hasSeedDues && seedFarmerCrossSettlement?.hasRawPotatoDues) && "*"}
                        </FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" min="0" {...field} data-testid="input-amount" />
                        </FormControl>
                        {(revenueType === "seed_sale" && inwardCrossSettlementEnabled && 
                          seedFarmerCrossSettlement?.hasSeedDues && seedFarmerCrossSettlement?.hasRawPotatoDues) && (
                          <p className="text-xs text-muted-foreground">
                            {t("Enter 0 if only settling via cross-settlement", "यदि केवल क्रॉस-सेटलमेंट करना है तो 0 डालें")}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={inwardForm.control}
                    name="entryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Received On", "प्राप्त तिथि")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-entry-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={inwardForm.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Remarks", "टिप्पणी")}</FormLabel>
                        <FormControl>
                          <Textarea placeholder={t("Remarks", "टिप्पणी")} {...field} data-testid="input-remarks" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full bg-teal-600 hover:bg-teal-700"
                    disabled={createEntryMutation.isPending}
                    data-testid="button-submit-inward"
                  >
                    {createEntryMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Banknote className="h-4 w-4 mr-2" />
                    )}
                    {t("Record Payment", "भुगतान दर्ज करें")}
                  </Button>
                </form>
              </Form>
            </div>
            <div className={activeTab === "outflow" ? "block" : "hidden"}>
              <Form {...outflowForm}>
                <form onSubmit={outflowForm.handleSubmit(onOutflowSubmit)} className="space-y-4">
                  <FormField
                    control={outflowForm.control}
                    name="expenseType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Expense Type", "खर्च प्रकार")} *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-expense-type">
                              <SelectValue placeholder={t("Select expense type", "खर्च प्रकार चुनें")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {EXPENSE_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {getExpenseTypeLabel(type)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {expenseType === "farmer" && (
                    <>
                      <FormField
                        control={outflowForm.control}
                        name="farmerName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("Farmer Name", "किसान का नाम")} *</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedOutflowFarmerName(value);
                              }} 
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-farmer-name">
                                  <SelectValue placeholder={t("Select Farmer", "किसान चुनें")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {mergedFarmers.map((farmer) => (
                                  <SelectItem key={farmer.name} value={farmer.name}>
                                    <div className="flex items-center justify-between gap-4">
                                      <span>{farmer.name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {farmer.address || ""}
                                        {farmer.address && farmer.contact && " • "}
                                        {farmer.contact || ""}
                                      </span>
                                      {farmer.pendingDues > 0 && (
                                        <Badge variant="secondary">
                                          {t("Due", "बकाया")}: ₹{farmer.pendingDues.toFixed(0)}
                                        </Badge>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Cross-settlement preview for farmer payment */}
                      {farmerCrossSettlement?.hasSeedDues && farmerCrossSettlement?.hasRawPotatoDues && (
                        <Card className="border-secondary bg-secondary/50">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 text-foreground font-medium text-sm mb-1">
                                  <RefreshCw className="h-4 w-4" />
                                  {t("Cross-Settlement", "क्रॉस-सेटलमेंट")}
                                  {outflowCrossSettlementEnabled && (
                                    <Badge variant="default" className="text-xs">
                                      ₹{Math.min(farmerCrossSettlement.seedDueAmount, farmerCrossSettlement.rawPotatoDueAmount).toFixed(0)}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {outflowCrossSettlementEnabled ? t(
                                    `Auto-settling ₹${Math.min(farmerCrossSettlement.seedDueAmount, farmerCrossSettlement.rawPotatoDueAmount).toFixed(0)} (min of seed dues ₹${farmerCrossSettlement.seedDueAmount.toFixed(0)} and raw dues ₹${farmerCrossSettlement.rawPotatoDueAmount.toFixed(0)}). Any amount above is additional cash.`,
                                    `₹${Math.min(farmerCrossSettlement.seedDueAmount, farmerCrossSettlement.rawPotatoDueAmount).toFixed(0)} स्वतः सेटल (बीज बकाया ₹${farmerCrossSettlement.seedDueAmount.toFixed(0)} और कच्चे बकाया ₹${farmerCrossSettlement.rawPotatoDueAmount.toFixed(0)} का न्यूनतम)। नीचे की राशि अतिरिक्त नकद है।`
                                  ) : t(
                                    `Farmer owes ₹${farmerCrossSettlement.seedDueAmount.toFixed(0)} for seeds. You owe farmer ₹${farmerCrossSettlement.rawPotatoDueAmount.toFixed(0)} for raw potatoes.`,
                                    `किसान पर ₹${farmerCrossSettlement.seedDueAmount.toFixed(0)} बीज का बकाया है। आप पर किसान का ₹${farmerCrossSettlement.rawPotatoDueAmount.toFixed(0)} कच्चे का बकाया है।`
                                  )}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant={outflowCrossSettlementEnabled ? "default" : "outline"}
                                size="sm"
                                className="text-xs shrink-0"
                                onClick={() => setOutflowCrossSettlementEnabled(!outflowCrossSettlementEnabled)}
                                data-testid="button-toggle-cross-settlement"
                              >
                                {outflowCrossSettlementEnabled 
                                  ? t("Enabled", "सक्षम") 
                                  : t("Disabled", "अक्षम")}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}

                  {expenseType === "cold_store_charge" && (
                    <FormField
                      control={outflowForm.control}
                      name="coldStoreName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Cold Store Name", "शीत भंडार का नाम")} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-cold-store-name">
                                <SelectValue placeholder={t("Select Cold Store", "शीत भंडार चुनें")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {coldStores.map((store) => (
                                <SelectItem key={store.coldStoreName} value={store.coldStoreName}>
                                  <div className="flex items-center justify-between gap-4">
                                    <span>{store.coldStoreName}</span>
                                    <Badge variant="secondary">
                                      {t("Due", "बकाया")}: ₹{store.totalDue.toFixed(0)}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      ({store.lotCount} {t("lots", "लॉट")})
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {expenseType === "supplier" && (
                    <FormField
                      control={outflowForm.control}
                      name="supplierName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Supplier Name", "आपूर्तिकर्ता का नाम")} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-supplier-name">
                                <SelectValue placeholder={t("Select Supplier", "आपूर्तिकर्ता चुनें")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {seedSuppliers.map((supplier) => (
                                <SelectItem key={supplier.supplierName} value={supplier.supplierName}>
                                  <div className="flex items-center justify-between gap-4">
                                    <span>{supplier.supplierName}</span>
                                    {supplier.district && (
                                      <span className="text-xs text-muted-foreground">({supplier.district})</span>
                                    )}
                                    <Badge variant="secondary">
                                      {t("Due", "बकाया")}: ₹{supplier.totalDue.toFixed(0)}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      ({supplier.entryCount} {t("entries", "प्रविष्टियाँ")})
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={outflowForm.control}
                    name="paymentMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Payment Mode", "भुगतान मोड")} *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-payment-mode">
                              <SelectValue placeholder={t("Select payment mode", "भुगतान मोड चुनें")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cash">
                              <div className="flex items-center gap-2">
                                <Banknote className="h-4 w-4" />
                                {t("Cash", "नकद")}
                              </div>
                            </SelectItem>
                            <SelectItem value="account_transfer">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4" />
                                {t("Account Transfer", "खाता स्थानांतरण")}
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {paymentMode === "account_transfer" && bankAccounts.length > 0 && (
                    <FormField
                      control={outflowForm.control}
                      name="bankAccountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Bank Account", "बैंक खाता")} *</FormLabel>
                          <Select onValueChange={(value) => field.onChange(Number(value))} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger data-testid="select-outflow-bank-account">
                                <SelectValue placeholder={t("Select account", "खाता चुनें")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {bankAccounts.filter(a => a.isActive).map((account) => (
                                <SelectItem key={account.id} value={account.id.toString()}>
                                  {account.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {paymentMode === "account_transfer" && bankAccounts.length === 0 && (
                    <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                      {t("No bank accounts configured. Add accounts in Settings.", "कोई बैंक खाता कॉन्फ़िगर नहीं है। सेटिंग्स में खाते जोड़ें।")}
                    </div>
                  )}

                  <FormField
                    control={outflowForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {(expenseType === "farmer" && outflowCrossSettlementEnabled && 
                            farmerCrossSettlement?.hasSeedDues && farmerCrossSettlement?.hasRawPotatoDues)
                            ? t("Additional Cash Amount", "अतिरिक्त नकद राशि")
                            : t("Amount", "राशि")} (₹) {!(expenseType === "farmer" && outflowCrossSettlementEnabled && 
                            farmerCrossSettlement?.hasSeedDues && farmerCrossSettlement?.hasRawPotatoDues) && "*"}
                        </FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" min="0" {...field} data-testid="input-outflow-amount" />
                        </FormControl>
                        {(expenseType === "farmer" && outflowCrossSettlementEnabled && 
                          farmerCrossSettlement?.hasSeedDues && farmerCrossSettlement?.hasRawPotatoDues) && (
                          <p className="text-xs text-muted-foreground">
                            {t("Enter 0 if only settling via cross-settlement", "यदि केवल क्रॉस-सेटलमेंट करना है तो 0 डालें")}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={outflowForm.control}
                    name="entryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Paid on", "भुगतान तिथि")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-outflow-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={outflowForm.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Remarks", "टिप्पणी")}</FormLabel>
                        <FormControl>
                          <Textarea placeholder={t("Remarks", "टिप्पणी")} {...field} data-testid="input-outflow-remarks" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full bg-amber-600 hover:bg-amber-700"
                    disabled={createEntryMutation.isPending}
                    data-testid="button-submit-outflow"
                  >
                    {createEntryMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                    )}
                    {t("Record Expense", "खर्च दर्ज करें")}
                  </Button>
                </form>
              </Form>
            </div>

            <div className={activeTab === "transfer" ? "block" : "hidden"}>
              <Form {...transferForm}>
                <form onSubmit={transferForm.handleSubmit(onTransferSubmit)} className="space-y-4">
                  <FormField
                    control={transferForm.control}
                    name="fromAccountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("From Account", "किस खाते से")} *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-from-account-type">
                              <SelectValue placeholder={t("Select source", "स्रोत चुनें")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cash_in_hand">
                              <div className="flex items-center gap-2">
                                <Banknote className="h-4 w-4" />
                                {t("Cash in Hand", "हाथ में नकद")}
                              </div>
                            </SelectItem>
                            {bankAccounts.filter(a => a.isActive).map((account) => (
                              <SelectItem key={account.id} value={`bank_${account.id}`}>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4" />
                                  {account.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={transferForm.control}
                    name="toAccountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("To Account", "किस खाते में")} *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-to-account-type">
                              <SelectValue placeholder={t("Select destination", "गंतव्य चुनें")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cash_in_hand">
                              <div className="flex items-center gap-2">
                                <Banknote className="h-4 w-4" />
                                {t("Cash in Hand", "हाथ में नकद")}
                              </div>
                            </SelectItem>
                            {bankAccounts.filter(a => a.isActive).map((account) => (
                              <SelectItem key={account.id} value={`bank_${account.id}`}>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4" />
                                  {account.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={transferForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Amount", "राशि")} (₹) *</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" min="0" {...field} data-testid="input-transfer-amount" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={transferForm.control}
                    name="entryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Transfer Date", "ट्रांसफर तिथि")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-transfer-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={transferForm.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Remarks", "टिप्पणी")}</FormLabel>
                        <FormControl>
                          <Textarea placeholder={t("Remarks", "टिप्पणी")} {...field} data-testid="input-transfer-remarks" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={createEntryMutation.isPending}
                    data-testid="button-submit-transfer"
                  >
                    {createEntryMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {t("Record Transfer", "ट्रांसफर दर्ज करें")}
                  </Button>
                </form>
              </Form>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="w-full md:w-1/2 space-y-4">
        <h2 className="text-lg font-semibold">{t("Cash Flow History", "नकद प्रवाह इतिहास")}</h2>
        
        <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {entriesLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("Loading...", "लोड हो रहा है...")}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {hasActiveFilters 
                ? t("No entries match the selected filters", "चयनित फ़िल्टर से कोई प्रविष्टि मेल नहीं खाती")
                : t("No entries yet", "अभी तक कोई प्रविष्टि नहीं")}
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <CashEntryCard key={entry.id} entry={entry} onViewDetails={() => setViewDetailsEntry(entry)} />
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function CashEntryCard({ entry, onViewDetails }: { entry: CashEntry; onViewDetails: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const isInward = entry.direction === "inward";
  const isTransfer = entry.direction === "transfer";
  const amount = parseFloat(entry.amount);
  const totalApplied = entry.allocations.reduce((sum, a) => sum + parseFloat(a.appliedAmount), 0);
  const isReversed = entry.isReversed === true;

  const reverseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/cash/entries/${entry.id}/reverse`);
    },
    onSuccess: () => {
      toast({
        title: t("Entry Reversed", "प्रविष्टि उलट दी गई"),
        description: t("The cash entry has been reversed successfully.", "नकद प्रविष्टि सफलतापूर्वक उलट दी गई है।"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/cold-stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message || t("Failed to reverse entry", "प्रविष्टि उलटने में विफल"),
        variant: "destructive",
      });
    },
  });

  const getReceiptTypeLabel = (type: string | null) => {
    switch (type) {
      case "cash_received": return t("Cash", "नकद");
      case "account_received": return t("Account", "खाता");
      default: return type || "";
    }
  };

  const getExpenseTypeLabel = (type: string | null) => {
    switch (type) {
      case "salary": return t("Salary", "वेतन");
      case "general_expense": return t("General", "सामान्य");
      case "grading": return t("Grading", "ग्रेडिंग");
      case "hammali": return t("Hammali", "हम्माली");
      case "farmer": return t("Farmer", "किसान");
      case "cold_store_charge": return t("Cold Store", "शीत भंडार");
      case "supplier": return t("Supplier", "आपूर्तिकर्ता");
      default: return type || "";
    }
  };

  const getTransferLabel = () => {
    const fromLabel = entry.fromAccountType === "cash_in_hand" 
      ? t("Cash", "नकद") 
      : t("Bank", "बैंक");
    const toLabel = entry.toAccountType === "cash_in_hand" 
      ? t("Cash", "नकद") 
      : t("Bank", "बैंक");
    return `${fromLabel} → ${toLabel}`;
  };

  return (
    <Card 
      className={cn(
        isTransfer 
          ? 'border-l-4 border-l-blue-500' 
          : isInward 
            ? 'border-l-4 border-l-green-500' 
            : 'border-l-4 border-l-amber-500',
        isReversed ? 'opacity-60 blur-[0.5px]' : 'hover-elevate cursor-pointer'
      )}
      onClick={onViewDetails}
      data-testid={`card-cash-entry-${entry.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isTransfer ? (
              <RefreshCw className="h-4 w-4 text-blue-600 shrink-0" />
            ) : isInward ? (
              <ArrowDownLeft className="h-4 w-4 text-green-600 shrink-0" />
            ) : (
              <ArrowUpRight className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            <span className={cn("font-semibold truncate", isReversed && "line-through text-muted-foreground")} data-testid={`text-entry-name-${entry.id}`}>
              {isTransfer 
                ? getTransferLabel()
                : isInward 
                  ? (entry.partyName || entry.farmerName || t("Unknown", "अज्ञात"))
                  : (entry.farmerName || entry.coldStoreName || entry.supplierName || getExpenseTypeLabel(entry.expenseType))}
            </span>
            <Badge 
              variant="outline" 
              className={cn(
                `shrink-0`,
                isReversed 
                  ? "bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-600"
                  : isTransfer 
                    ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600"
                    : isInward 
                      ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600" 
                      : "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-600"
              )}
            >
              {isTransfer ? t("Transfer", "ट्रांसफर") : isInward ? t("Inflow", "आवक") : t("Outflow", "बहिर्वाह")}
            </Badge>
            {isReversed && (
              <Badge 
                variant="outline" 
                className="shrink-0 bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-600"
              >
                {t("Reversed", "उलट दिया गया")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "font-bold",
              isReversed ? "text-muted-foreground line-through" : isInward ? 'text-green-600' : 'text-amber-600'
            )}>
              {isInward ? '+' : '-'}₹{amount.toLocaleString()}
            </span>
            {!isReversed && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    title={t("Reverse Entry", "प्रविष्टि उलटें")}
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`button-reverse-entry-${entry.id}`}
                  >
                    <Undo2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("Reverse Cash Entry?", "नकद प्रविष्टि उलटें?")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t(
                        "Are you sure you want to reverse this payment? This will restore all affected dues (farmer, buyer, supplier, cold store) to their previous state. The entry will remain in history but marked as reversed.",
                        "क्या आप वाकई इस भुगतान को उलटना चाहते हैं? यह सभी प्रभावित बकाया (किसान, खरीदार, आपूर्तिकर्ता, शीत भंडार) को उनकी पिछली स्थिति में बहाल कर देगा। प्रविष्टि इतिहास में रहेगी लेकिन उलट के रूप में चिह्नित होगी।"
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-reverse">
                      {t("Cancel", "रद्द करें")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => reverseMutation.mutate()}
                      disabled={reverseMutation.isPending}
                      className="bg-destructive text-destructive-foreground"
                      data-testid="button-confirm-reverse"
                    >
                      {reverseMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4 mr-2" />
                      )}
                      {t("Yes, Reverse", "हाँ, उलटें")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className={isReversed ? "line-through" : ""}>{format(new Date(entry.entryDate), "dd/MM/yyyy")}</span>
          {isInward && entry.receiptType && (
            <Badge variant="secondary" className="text-xs py-0">
              {getReceiptTypeLabel(entry.receiptType)}
            </Badge>
          )}
          {!isInward && entry.paymentMode && (
            <Badge variant="secondary" className="text-xs py-0">
              {entry.paymentMode === "cash" ? t("Cash", "नकद") : t("Account", "खाता")}
            </Badge>
          )}
          {isInward && totalApplied > 0 && !isReversed && (
            <span className="text-green-600">
              {t("Applied", "लागू")}: ₹{totalApplied.toLocaleString()}
            </span>
          )}
          {entry.remarks && (
            <span className={cn("italic truncate max-w-[200px]", isReversed && "line-through")}>{entry.remarks}</span>
          )}
          {isReversed && entry.reversedAt && (
            <span className="text-red-500 text-xs">
              {t("Reversed on", "उलटा गया")} {format(new Date(entry.reversedAt), "dd/MM/yyyy")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
