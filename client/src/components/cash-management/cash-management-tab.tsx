import { useState } from "react";
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
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Banknote, Building2, Wallet, CreditCard, Filter, X, Settings, Download, Leaf, Package, ChevronsUpDown, Check } from "lucide-react";
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
  partyName: string | null;
  partyVillage: string | null;
  farmerName: string | null;
  farmerVillage: string | null;
  coldStoreName: string | null;
  supplierName: string | null;
  amount: string;
  entryDate: string;
  remarks: string | null;
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

const inwardFormSchema = z.object({
  receiptType: z.string().min(1, "Receipt type is required"),
  revenueType: z.string().min(1, "Revenue type is required"),
  partyName: z.string().optional(),
  seedFarmerName: z.string().optional(),
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
});

const outflowFormSchema = z.object({
  expenseType: z.string().min(1, "Expense type is required"),
  paymentMode: z.string().min(1, "Payment mode is required"),
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
});

type InwardFormValues = z.infer<typeof inwardFormSchema>;
type OutflowFormValues = z.infer<typeof outflowFormSchema>;

export function CashManagementTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"inward" | "outflow">("inward");
  
  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Download dialog state
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState("");
  const [downloadEndDate, setDownloadEndDate] = useState("");
  
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
  
  // Watch revenue type for conditional rendering
  const revenueType = inwardForm.watch("revenueType");

  const outflowForm = useForm<OutflowFormValues>({
    resolver: zodResolver(outflowFormSchema),
    defaultValues: {
      expenseType: "",
      paymentMode: "cash",
      farmerName: "",
      coldStoreName: "",
      supplierName: "",
      amount: 0,
      entryDate: format(new Date(), "yyyy-MM-dd"),
      remarks: "",
    },
  });

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
      } else {
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
    const farmerMap = new Map<string, { name: string; address: string | null; pendingDues: number }>();
    
    // Add stock-entry-derived farmers first
    farmers.forEach(f => {
      farmerMap.set(f.farmerName.toLowerCase(), {
        name: f.farmerName,
        address: f.village,
        pendingDues: f.totalDue,
      });
    });
    
    // Add/override with managed farmers (they take precedence)
    managedFarmers.forEach(f => {
      const existing = farmerMap.get(f.name.toLowerCase());
      farmerMap.set(f.name.toLowerCase(), {
        name: f.name,
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
  const openingCashInAccount = cashSettings ? parseFloat(cashSettings.openingCashInAccount || "0") : 0;
  
  const netCashInHand = openingCashInHand + totalCashReceived - totalCashExpense;
  const netCashInAccount = openingCashInAccount + totalAccountReceived - totalAccountExpense;

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
  const uniqueFarmerNames = Array.from(new Set(entries.filter(e => e.farmerName).map(e => e.farmerName!)));
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
      t("Receipt/Expense Type", "रसीद/खर्च प्रकार"),
      t("Payment Mode", "भुगतान माध्यम"),
      t("Party Name", "पार्टी का नाम"),
      t("Farmer Name", "किसान का नाम"),
      t("Cold Store", "शीत भंडार"),
      t("Amount", "राशि"),
      t("Remarks", "टिप्पणी"),
    ];

    const rows = filteredForDownload.map(entry => [
      format(new Date(entry.entryDate), "dd/MM/yyyy"),
      entry.direction === "inward" ? t("Inward", "आवक") : t("Outflow", "जावक"),
      entry.direction === "inward" ? getReceiptTypeLabel(entry.receiptType || "") : getExpenseTypeLabel(entry.expenseType || ""),
      entry.paymentMode ? getPaymentModeLabel(entry.paymentMode) : "-",
      entry.partyName || "-",
      entry.farmerName || "-",
      entry.coldStoreName || "-",
      entry.amount,
      entry.remarks || "-",
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
                {uniqueFarmerNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "inward" | "outflow")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="inward" className="flex items-center gap-2" data-testid="tab-inward">
              <ArrowDownLeft className="h-4 w-4" />
              {t("Inward Cash", "नकद आवक")}
            </TabsTrigger>
            <TabsTrigger value="outflow" className="flex items-center gap-2" data-testid="tab-outflow">
              <ArrowUpRight className="h-4 w-4" />
              {t("Expense", "खर्च")}
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
                                            {farmer.village && (
                                              <span className="text-xs text-muted-foreground">{farmer.village}</span>
                                            )}
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
                                    `Auto-settling ₹${Math.min(seedFarmerCrossSettlement.seedDueAmount, seedFarmerCrossSettlement.rawPotatoDueAmount).toFixed(0)} (min of seed dues ₹${seedFarmerCrossSettlement.seedDueAmount.toFixed(0)} and raw dues ₹${seedFarmerCrossSettlement.rawPotatoDueAmount.toFixed(0)}). Any amount below is additional cash.`,
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
                                      {farmer.address && (
                                        <span className="text-xs text-muted-foreground">({farmer.address})</span>
                                      )}
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
                                    `Auto-settling ₹${Math.min(farmerCrossSettlement.seedDueAmount, farmerCrossSettlement.rawPotatoDueAmount).toFixed(0)} (min of seed dues ₹${farmerCrossSettlement.seedDueAmount.toFixed(0)} and raw dues ₹${farmerCrossSettlement.rawPotatoDueAmount.toFixed(0)}). Any amount below is additional cash.`,
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
              <CashEntryCard key={entry.id} entry={entry} />
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function CashEntryCard({ entry }: { entry: CashEntry }) {
  const { t } = useLanguage();
  const isInward = entry.direction === "inward";
  const amount = parseFloat(entry.amount);
  const totalApplied = entry.allocations.reduce((sum, a) => sum + parseFloat(a.appliedAmount), 0);

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

  return (
    <Card 
      className={`hover-elevate ${isInward ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-amber-500'}`}
      data-testid={`card-cash-entry-${entry.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isInward ? (
              <ArrowDownLeft className="h-4 w-4 text-green-600 shrink-0" />
            ) : (
              <ArrowUpRight className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            <span className="font-semibold truncate">
              {isInward ? entry.partyName : (entry.farmerName || entry.coldStoreName || entry.supplierName || getExpenseTypeLabel(entry.expenseType))}
            </span>
            <Badge 
              variant="outline" 
              className={`shrink-0 ${isInward 
                ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600" 
                : "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-600"
              }`}
            >
              {isInward ? t("Inflow", "आवक") : t("Outflow", "बहिर्वाह")}
            </Badge>
          </div>
          <span className={`font-bold shrink-0 ${isInward ? 'text-green-600' : 'text-amber-600'}`}>
            {isInward ? '+' : '-'}₹{amount.toLocaleString()}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span>{format(new Date(entry.entryDate), "dd/MM/yyyy")}</span>
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
          {isInward && totalApplied > 0 && (
            <span className="text-green-600">
              {t("Applied", "लागू")}: ₹{totalApplied.toLocaleString()}
            </span>
          )}
          {entry.remarks && (
            <span className="italic truncate max-w-[200px]">{entry.remarks}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
