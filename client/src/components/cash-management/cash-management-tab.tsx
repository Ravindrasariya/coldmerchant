import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { printHtmlDocument } from "@/lib/print-receipt";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { getTodayIST } from "@/lib/date-utils";
import { useCurrentDateIST } from "@/hooks/use-current-date-ist";
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
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Banknote, Building2, Wallet, CreditCard, Filter, X, Settings, Download, Leaf, Package, ChevronsUpDown, Check, Undo2, Printer, FileText, HandCoins, Calculator } from "lucide-react";
import { numberToIndianWords, escapeHtml } from "@/lib/number-to-words";
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
import { MultiDayFilter } from "@/components/ui/multi-day-filter";
import { CashSettingsDialog } from "./cash-settings-dialog";
import { CalcDialog } from "@/components/ui/calc-dialog";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RECEIPT_TYPES, EXPENSE_TYPES, PAYMENT_MODES, ASSET_CATEGORIES, ASSET_DEPRECIATION_RATES } from "@shared/schema";

type DecimalInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (value: number) => void;
};

function DecimalInput({ value, onValueChange, ...props }: DecimalInputProps) {
  const [text, setText] = useState<string>(value ? String(value) : "");
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setText(value ? String(value) : "");
    }
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        const n = parseFloat(text);
        if (isNaN(n) || n === 0) {
          setText("");
        } else {
          setText(String(n));
        }
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        const n = parseFloat(raw);
        onValueChange(isNaN(n) ? 0 : n);
      }}
    />
  );
}

interface CashEntry {
  id: number;
  merchantId: number;
  transactionCode: string | null;
  direction: string;
  receiptType: string | null;
  revenueType: string | null;
  expenseType: string | null;
  paymentMode: string | null;
  bankAccountId: number | null;
  bankAccountName: string | null;
  fromAccountType: string | null;
  fromBankAccountId: number | null;
  fromBankAccountName: string | null;
  toAccountType: string | null;
  toBankAccountId: number | null;
  toBankAccountName: string | null;
  partyName: string | null;
  partyVillage: string | null;
  farmerName: string | null;
  farmerId: number | null;
  farmerVillage: string | null;
  coldStoreName: string | null;
  coldStoreDbId: number | null;
  supplierName: string | null;
  aadhatName: string | null;
  aadhatDbId: number | null;
  sundryPayName: string | null;
  sundryPayDbId: number | null;
  chequeNumber: string | null;
  expenseCategory: string | null;
  capitalAssetName: string | null;
  capitalAssetCategory: string | null;
  capitalAssetId: number | null;
  amount: string;
  entryDate: string;
  remarks: string | null;
  isReversed: boolean | null;
  reversedAt: string | null;
  createdAt: string;
  allocations: CashEntryAllocation[];
  aadhatAllocations: AadhatPaymentAllocationDetail[];
  buyerAllocations: BuyerPaymentAllocationDetail[];
  coldStoreAllocations: ColdStorePaymentAllocationDetail[];
}

interface CashEntryAllocation {
  id: number;
  cashEntryId: number;
  transactionId: number;
  merchantId: number;
  appliedAmount: string;
}

interface AadhatPaymentAllocationDetail {
  id: number;
  cashEntryId: number;
  stockEntryId: number | null;
  appliedAmount: string;
  discountPercent: string;
  discountAmount: string;
  pettyAdjustment: string;
  isPyPayable: boolean;
  serialNumber: number | null;
}

interface ColdStorePaymentAllocationDetail {
  id: number;
  cashEntryId: number;
  lotId: number | null;
  seedLotId: number | null;
  coldStoreId: number | null;
  appliedAmount: string;
  pettyAdjustment: string;
  isPyPayable: boolean;
}

interface ColdStorePendingCharge {
  lotId?: number;
  seedLotId?: number;
  sourceType: string;
  serialNumber: number;
  dueAmount: number;
  lotNumber?: string;
}

interface ColdStorePendingResponse {
  pendingCharges: ColdStorePendingCharge[];
  pyPayable: number;
}

interface ColdStoreAllocationRow {
  lotId?: number;
  seedLotId?: number;
  isPyPayable?: boolean;
  label: string;
  sourceType: string;
  dueAmount: number;
  amount: number;
  pettyAdjustment: number;
}

interface PartyWithDue {
  partyName: string;
  partyAddress: string | null;
  totalDue: number;
  transactionCount: number;
}

interface FarmerWithDue {
  farmerId: number | null;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  totalDue: number;
  entryCount: number;
}

interface ColdStoreWithDue {
  coldStoreName: string;
  coldStoreDbId: number | null;
  totalDue: number;
  lotCount: number;
}

interface SeedFarmerWithDue {
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  totalDue: number;
  transactionCount: number;
  receivables: number;
}

interface SeedSupplierWithDue {
  supplierName: string;
  district: string | null;
  totalDue: number;
  entryCount: number;
}

interface AadhatWithDue {
  id: number;
  aadhatId: string;
  name: string;
  address: string;
  contact: string | null;
  pyPayable: string;
  totalDue: number;
}

interface AadhatPendingEntry {
  stockEntryId: number;
  serialNumber: number;
  crop: string;
  purchaseDate: string;
  totalBags: number;
  netPayable: number;
  amountPaid: number;
  dueAmount: number;
}

interface AadhatPendingResponse {
  pendingEntries: AadhatPendingEntry[];
  pyPayable: number;
}

interface BuyerPaymentAllocationDetail {
  id: number;
  cashEntryId: number;
  transactionId: number | null;
  appliedAmount: string;
  pettyAdjustment: string;
  isPyBalance: boolean;
  transactionCode: string | null;
}

interface BuyerPendingEntry {
  transactionId: number;
  transactionNumber: number;
  crop: string;
  dateOfLoading: string;
  totalBags: number;
  revenue: number;
  amountReceived: number;
  dueAmount: number;
  daysSince: number;
  daysSinceLoading: number;
}

interface BuyerPendingResponse {
  pendingEntries: BuyerPendingEntry[];
  pyBalance: number;
}

interface BuyerAllocationRow {
  transactionId?: number;
  isPyBalance?: boolean;
  label: string;
  dueAmount: number;
  amount: number;
  pettyAdjustment: number;
}

interface AadhatAllocationRow {
  stockEntryId?: number;
  isPyPayable?: boolean;
  label: string;
  dueAmount: number;
  amount: number;
  discountPercent: number;
  discountAmount: number;
  pettyAdjustment: number;
}

// Farmer Ledger data with comprehensive dues
interface LedgerFarmer {
  id: number;
  name: string;
  contact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string | null;
  pyPayable: string | null;
  pyReceivable: string | null;
  harvestDue: number;
  seedDue: number;
  netDue: number;
  coldDue: number;
  receivables: number;
  redFlag: boolean | null;
  isArchived: boolean | null;
}

// Buyer Ledger data with dues
interface LedgerBuyer {
  id: number;
  name: string;
  address: string | null;
  mandiCode: string | null;
  contact: string | null;
  redFlag: boolean | null;
  isActive: boolean | null;
  overallDue: number; // Total due including receivables from linked Cash Management parties
  receivables: number; // Receivables breakdown from linked Cash Management parties
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
  rateOfInterest: string | null;
  effectiveDate: string | null;
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
  sundryPayName: z.string().optional(),
  sundryPayDbId: z.coerce.number().optional(),
  bankAccountId: z.coerce.number().optional(),
  chequeNumber: z.string().optional(),
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
  if (data.revenueType === "sundry_pay" && (!data.sundryPayName || data.sundryPayName.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Stakeholder name is required",
      path: ["sundryPayName"],
    });
  }
  if ((data.receiptType === "account_received" || data.receiptType === "cheque_received") && !data.bankAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bank account is required for account transfers",
      path: ["bankAccountId"],
    });
  }
  if (data.receiptType === "cheque_received" && (!data.chequeNumber || data.chequeNumber.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cheque number is required",
      path: ["chequeNumber"],
    });
  }
});

const outflowFormSchema = z.object({
  expenseCategory: z.string().default("revenue"),
  expenseType: z.string().optional().default(""),
  paymentMode: z.string().min(1, "Payment mode is required"),
  bankAccountId: z.coerce.number().optional(),
  chequeNumber: z.string().optional(),
  farmerName: z.string().optional(),
  coldStoreName: z.string().optional(),
  supplierName: z.string().optional(),
  aadhatName: z.string().optional(),
  aadhatDbId: z.coerce.number().optional(),
  sundryPayName: z.string().optional(),
  sundryPayDbId: z.coerce.number().optional(),
  capitalAssetName: z.string().optional(),
  capitalAssetCategory: z.string().optional(),
  capitalDepreciationRate: z.coerce.number().optional(),
  // Which truck a Transport/Freight payment settles. "others" means untargeted,
  // which is the default and behaves exactly as freight expenses always have.
  freightTruckKey: z.string().optional().default("others"),
  amount: z.coerce.number().min(0, "Amount cannot be negative").optional().default(0),
  entryDate: z.string().min(1, "Date is required"),
  remarks: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.expenseCategory === "capital") {
    if (!data.capitalAssetName || data.capitalAssetName.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Asset name is required",
        path: ["capitalAssetName"],
      });
    }
    if (!data.capitalAssetCategory || data.capitalAssetCategory.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Asset category is required",
        path: ["capitalAssetCategory"],
      });
    }
  } else {
    if (!data.expenseType || data.expenseType.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expense type is required",
        path: ["expenseType"],
      });
    }
    const farmerExpenseTypes = ["farmer", "farmer_advance", "farmer_freight", "farmer_others"];
    if (data.expenseType && farmerExpenseTypes.includes(data.expenseType) && (!data.farmerName || data.farmerName.length === 0)) {
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
    if (data.expenseType === "aadhtiya" && (!data.aadhatName || data.aadhatName.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Aadhtiya name is required",
        path: ["aadhatName"],
      });
    }
    if (data.expenseType === "sundry_pay" && (!data.sundryPayName || data.sundryPayName.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stakeholder name is required",
        path: ["sundryPayName"],
      });
    }
  }
  if ((data.paymentMode === "account_transfer" || data.paymentMode === "cheque") && !data.bankAccountId) {
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
  const { user } = useAuth();

  // Merchant header image (for PDF print header) — mirrors bill-print-dialog.
  const { data: merchantData } = useQuery<{ receiptHeaderImage: string | null }>({
    queryKey: ["/api/merchants", user?.merchantId],
    enabled: !!user?.merchantId,
  });
  const [headerImageDataUri, setHeaderImageDataUri] = useState<string | null>(null);
  useEffect(() => {
    if (!merchantData?.receiptHeaderImage || !user?.merchantId) {
      setHeaderImageDataUri(null);
      return;
    }
    const fetchImage = async () => {
      try {
        const res = await fetch(`/api/merchants/${user.merchantId}/receipt-header`, { credentials: "include" });
        if (!res.ok) { setHeaderImageDataUri(null); return; }
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => setHeaderImageDataUri(reader.result as string);
        reader.readAsDataURL(blob);
      } catch {
        setHeaderImageDataUri(null);
      }
    };
    fetchImage();
  }, [merchantData?.receiptHeaderImage, user?.merchantId]);
  const [activeTab, setActiveTabState] = useState<"inward" | "outflow" | "transfer">(() => (localStorage.getItem("vyapar_cashActiveTab") as "inward" | "outflow" | "transfer") || "inward");
  const setActiveTab = (tab: "inward" | "outflow" | "transfer") => {
    setActiveTabState(tab);
    localStorage.setItem("vyapar_cashActiveTab", tab);
  };
  
  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [buyerCalcOpen, setBuyerCalcOpen] = useState(false);
  const [aadhatCalcOpen, setAadhatCalcOpen] = useState(false);
  
  
  // View details dialog state
  const [viewDetailsEntry, setViewDetailsEntry] = useState<CashEntry | null>(null);
  
  // Filter state
  const [filterDirection, setFilterDirection] = useState<string>("");
  const [filterExpenseCategory, setFilterExpenseCategory] = useState<string>("");
  const [filterPartyName, setFilterPartyName] = useState<string>("");
  const [filterExpenseType, setFilterExpenseType] = useState<string>("");
  const [filterFarmerName, setFilterFarmerName] = useState<string>("");
  const [filterFarmerId, setFilterFarmerId] = useState<number | null>(null);
  const [farmerFilterPopoverOpen, setFarmerFilterPopoverOpen] = useState(false);
  const [filterSupplierName, setFilterSupplierName] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterDays, setFilterDays] = useState<number[]>([]);
  const [filterRemarks, setFilterRemarks] = useState<string>("");

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

  // Fetch seed farmers with dues from seed transactions (legacy)
  const { data: seedFarmers = [] } = useQuery<SeedFarmerWithDue[]>({
    queryKey: ["/api/cash/seed-farmers"],
  });

  // Fetch seed suppliers with dues from seed stock entries
  const { data: seedSuppliers = [] } = useQuery<SeedSupplierWithDue[]>({
    queryKey: ["/api/cash/seed-suppliers"],
  });

  // Fetch aadhats with outstanding dues
  const { data: aadhatsWithDues = [] } = useQuery<AadhatWithDue[]>({
    queryKey: ["/api/cash/aadhats-with-dues"],
  });

  const { data: sundryPayStakeholders = [] } = useQuery<{ id: number; name: string; address: string; contact: string | null; totalDue: number; isActive: boolean }[]>({
    queryKey: ["/api/sundry-pay"],
  });

  // Fetch Farmer Ledger data (comprehensive dues from all sources)
  const { data: ledgerFarmers = [] } = useQuery<LedgerFarmer[]>({
    queryKey: ["/api/farmers"],
  });

  // Fetch Buyer Ledger data (dues from transactions)
  const { data: ledgerBuyers = [] } = useQuery<LedgerBuyer[]>({
    queryKey: ["/api/buyers"],
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

  // Merge ledgerBuyers (transaction dues) with managedParties (receivables)
  // Aggregate at party name level (case-insensitive)
  const mergedPartiesForRawPotato = useMemo(() => {
    const partyMap = new Map<string, { name: string; address: string | null; overallDue: number; receivables: number; isActive: boolean }>();
    
    // Add all buyers from ledger - backend already includes receivables in overallDue
    // and provides separate receivables field for display purposes
    ledgerBuyers.forEach(buyer => {
      const normalizedName = buyer.name.trim().toLowerCase();
      partyMap.set(normalizedName, {
        name: buyer.name,
        address: buyer.address,
        overallDue: buyer.overallDue || 0, // Already includes receivables from backend
        receivables: buyer.receivables || 0, // Receivables for display breakdown
        isActive: buyer.isActive !== false,
      });
    });
    
    // Add managed parties that don't have a linked buyer yet (edge case)
    managedParties.forEach(party => {
      const normalizedName = party.name.trim().toLowerCase();
      const pendingDues = parseFloat(party.pendingDues || "0");
      
      if (!partyMap.has(normalizedName) && pendingDues > 0) {
        // Add as new entry if not in ledger and has pending dues
        partyMap.set(normalizedName, {
          name: party.name,
          address: party.address,
          overallDue: pendingDues, // Treat receivables as due
          receivables: pendingDues,
          isActive: true,
        });
      }
    });
    
    // Return as array, filter to those with total due > 0
    return Array.from(partyMap.values())
      .filter(p => p.isActive && p.overallDue > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ledgerBuyers, managedParties]);

  // Live midnight reset: snap all three entry-date fields to the new IST date
  // when the calendar day changes while the tab is open.
  const { today: currentDateIST, changed: dateChanged } = useCurrentDateIST();

  const inwardForm = useForm<InwardFormValues>({
    resolver: zodResolver(inwardFormSchema),
    defaultValues: {
      receiptType: "cash_received",
      revenueType: "raw_potato",
      partyName: "",
      seedFarmerName: "",
      bankAccountId: undefined,
      chequeNumber: "",
      amount: "" as unknown as number,
      entryDate: getTodayIST(),
      remarks: "",
    },
  });

  // State for seed farmer searchable popover
  const [seedFarmerPopoverOpen, setSeedFarmerPopoverOpen] = useState(false);
  const [expenseFarmerPopoverOpen, setExpenseFarmerPopoverOpen] = useState(false);
  
  // Watch revenue type and receipt type for conditional rendering
  const revenueType = inwardForm.watch("revenueType");
  const receiptType = inwardForm.watch("receiptType");
  const selectedPartyName = inwardForm.watch("partyName");
  const selectedSeedFarmerName = inwardForm.watch("seedFarmerName");

  const outflowForm = useForm<OutflowFormValues>({
    resolver: zodResolver(outflowFormSchema),
    defaultValues: {
      expenseCategory: "revenue",
      expenseType: "",
      paymentMode: "cash",
      bankAccountId: undefined,
      chequeNumber: "",
      farmerName: "",
      coldStoreName: "",
      supplierName: "",
      aadhatName: "",
      aadhatDbId: undefined,
      capitalAssetName: "",
      capitalAssetCategory: "",
      capitalDepreciationRate: "" as unknown as number,
      freightTruckKey: "others",
      amount: "" as unknown as number,
      entryDate: getTodayIST(),
      remarks: "",
    },
  });

  // Watch payment mode for conditional bank account dropdown
  const paymentMode = outflowForm.watch("paymentMode");
  const selectedOutflowFarmerName = outflowForm.watch("farmerName");
  const selectedOutflowColdStore = outflowForm.watch("coldStoreName");
  const selectedOutflowSupplier = outflowForm.watch("supplierName");

  const transferForm = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      fromAccountType: "cash_in_hand",
      toAccountType: "",
      amount: "" as unknown as number,
      entryDate: getTodayIST(),
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

  // Midnight reset: only fires when dateChanged becomes true (actual date flip),
  // never on initial mount, so intraday user-selected dates are preserved.
  useEffect(() => {
    if (!dateChanged) return;
    inwardForm.setValue("entryDate", currentDateIST);
    outflowForm.setValue("entryDate", currentDateIST);
    transferForm.setValue("entryDate", currentDateIST);
  }, [dateChanged, currentDateIST]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhat-pending-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/cold-store-pending-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/buyer-pending-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/freight-outstanding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/aadhats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cold-store-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cold-stores/search"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sundry-pay"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
      toast({
        title: t("Success", "सफलता"),
        description: t("Entry recorded successfully", "प्रविष्टि सफलतापूर्वक दर्ज की गई"),
        variant: "success",
      });
      setAadhatAllocations([]);
      setBuyerAllocations([]);
      setColdStoreAllocations([]);
      if (activeTab === "inward") {
        inwardForm.reset({
          receiptType: "cash_received",
          revenueType: "raw_potato",
          partyName: "",
          seedFarmerName: "",
          sundryPayName: "",
          sundryPayDbId: undefined,
          chequeNumber: "",
          amount: "" as unknown as number,
          entryDate: getTodayIST(),
          remarks: "",
        });
      } else if (activeTab === "outflow") {
        outflowForm.reset({
          expenseCategory: "revenue",
          expenseType: "",
          paymentMode: "cash",
          chequeNumber: "",
          farmerName: "",
          coldStoreName: "",
          supplierName: "",
          aadhatName: "",
          aadhatDbId: undefined,
          sundryPayName: "",
          sundryPayDbId: undefined,
          capitalAssetName: "",
          capitalAssetCategory: "",
          capitalDepreciationRate: "" as unknown as number,
          freightTruckKey: "others",
          amount: "" as unknown as number,
          entryDate: getTodayIST(),
          remarks: "",
        });
        setAadhatAllocations([]);
        setColdStoreAllocations([]);
      } else if (activeTab === "transfer") {
        transferForm.reset({
          fromAccountType: "cash_in_hand",
          toAccountType: "",
          amount: "" as unknown as number,
          entryDate: getTodayIST(),
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
  const expenseCategory = outflowForm.watch("expenseCategory");
  const capitalAssetCategory = outflowForm.watch("capitalAssetCategory");

  // State for searchable expense type popover
  const [expenseTypePopoverOpen, setExpenseTypePopoverOpen] = useState(false);
  // State for searchable aadhtiya name popover
  const [aadhatPopoverOpen, setAadhatPopoverOpen] = useState(false);
  const [sundryPayPopoverOpen, setSundryPayPopoverOpen] = useState(false);

  // Aadhat allocation state
  const [aadhatAllocations, setAadhatAllocations] = useState<AadhatAllocationRow[]>([]);
  const [aadhatEntryPickerOpen, setAadhatEntryPickerOpen] = useState(false);

  // Buyer allocation state (for raw_potato inward)
  const [buyerAllocations, setBuyerAllocations] = useState<BuyerAllocationRow[]>([]);
  const [buyerEntryPickerOpen, setBuyerEntryPickerOpen] = useState(false);

  const selectedAadhatDbId = outflowForm.watch("aadhatDbId");

  const { data: aadhatPendingData } = useQuery<AadhatPendingResponse>({
    queryKey: ["/api/cash/aadhat-pending-entries", selectedAadhatDbId],
    queryFn: async () => {
      if (!selectedAadhatDbId) return { pendingEntries: [], pyPayable: 0 };
      const res = await fetch(`/api/cash/aadhat-pending-entries/${selectedAadhatDbId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending entries");
      return res.json();
    },
    enabled: !!selectedAadhatDbId && expenseType === "aadhtiya",
  });

  useEffect(() => {
    setAadhatAllocations([]);
  }, [selectedAadhatDbId]);

  const aadhatGrandTotalCash = aadhatAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);

  // ---- Transport/Freight: paying a specific truck -------------------------
  // Only trucks marked "freight paid separately" and still owing money appear.
  // The driver advance does not count as paid freight; only Cash tab payments do.
  interface OutstandingFreightTruck {
    key: string;
    dateOfLoading: string;
    transporterName: string;
    vehicleNumber: string;
    transactionNumbers: number[];
    totalFreight: number;
    paidAmount: number;
    remainingFreight: number;
  }

  const selectedFreightTruckKey = outflowForm.watch("freightTruckKey");

  const { data: outstandingFreightTrucks = [], isFetched: freightTrucksFetched } = useQuery<OutstandingFreightTruck[]>({
    queryKey: ["/api/cash/freight-outstanding"],
    queryFn: async () => {
      const res = await fetch("/api/cash/freight-outstanding", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch outstanding freight");
      return res.json();
    },
    enabled: expenseType === "transport_freight",
  });

  const selectedFreightTruck = useMemo(
    () => outstandingFreightTrucks.find(t => t.key === selectedFreightTruckKey) || null,
    [outstandingFreightTrucks, selectedFreightTruckKey],
  );

  // Fall back to "Others" whenever the chosen truck is no longer payable —
  // switching away from freight, or the truck being settled by someone else.
  useEffect(() => {
    if (!selectedFreightTruckKey || selectedFreightTruckKey === "others") return;
    if (expenseType !== "transport_freight") {
      outflowForm.setValue("freightTruckKey", "others");
      return;
    }
    // Wait for the list to have loaded once, otherwise the selection would be
    // cleared on the initial empty render. After that, a missing truck means it
    // was settled elsewhere — including when nothing is outstanding at all.
    if (freightTrucksFetched && !selectedFreightTruck) {
      outflowForm.setValue("freightTruckKey", "others");
    }
  }, [expenseType, selectedFreightTruckKey, selectedFreightTruck, freightTrucksFetched]);

  const [coldStoreAllocations, setColdStoreAllocations] = useState<ColdStoreAllocationRow[]>([]);
  const [coldStoreEntryPickerOpen, setColdStoreEntryPickerOpen] = useState(false);

  const selectedColdStoreDbId = useMemo(() => {
    if (!selectedOutflowColdStore) return null;
    const store = coldStores.find(cs => cs.coldStoreName === selectedOutflowColdStore);
    return store?.coldStoreDbId || null;
  }, [selectedOutflowColdStore, coldStores]);

  const { data: coldStorePendingData } = useQuery<ColdStorePendingResponse>({
    queryKey: ["/api/cash/cold-store-pending-charges", selectedColdStoreDbId],
    queryFn: async () => {
      if (!selectedColdStoreDbId) return { pendingCharges: [], pyPayable: 0 };
      const res = await fetch(`/api/cash/cold-store-pending-charges/${selectedColdStoreDbId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending charges");
      return res.json();
    },
    enabled: !!selectedColdStoreDbId && expenseType === "cold_store_charge",
  });

  useEffect(() => {
    setColdStoreAllocations([]);
  }, [selectedColdStoreDbId]);

  const coldStoreGrandTotalCash = coldStoreAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);

  const toggleColdStoreEntry = (entry: ColdStorePendingCharge | { isPyPayable: true; dueAmount: number }) => {
    if ('isPyPayable' in entry && entry.isPyPayable) {
      const exists = coldStoreAllocations.find(a => a.isPyPayable);
      if (exists) {
        setColdStoreAllocations(prev => prev.filter(a => !a.isPyPayable));
      } else {
        setColdStoreAllocations(prev => [...prev, {
          isPyPayable: true,
          label: t("PY Payable (Previous Year)", "पीवाई देय (पिछला वर्ष)"),
          sourceType: "PY",
          dueAmount: entry.dueAmount,
          amount: 0,
          pettyAdjustment: 0,
        }]);
      }
    } else if ('lotId' in entry || 'seedLotId' in entry) {
      const csEntry = entry as ColdStorePendingCharge;
      const exists = coldStoreAllocations.find(a =>
        (csEntry.lotId && a.lotId === csEntry.lotId) ||
        (csEntry.seedLotId && a.seedLotId === csEntry.seedLotId)
      );
      if (exists) {
        setColdStoreAllocations(prev => prev.filter(a =>
          !(csEntry.lotId && a.lotId === csEntry.lotId) &&
          !(csEntry.seedLotId && a.seedLotId === csEntry.seedLotId)
        ));
      } else {
        const lotLabel = csEntry.lotNumber ? ` | ${csEntry.lotNumber}` : "";
        setColdStoreAllocations(prev => [...prev, {
          lotId: csEntry.lotId,
          seedLotId: csEntry.seedLotId,
          label: `SR #${csEntry.serialNumber} | ${csEntry.sourceType}${lotLabel}`,
          sourceType: csEntry.sourceType,
          dueAmount: csEntry.dueAmount,
          amount: 0,
          pettyAdjustment: 0,
        }]);
      }
    }
  };

  const updateColdStoreAllocation = (index: number, field: 'amount' | 'pettyAdjustment', value: number) => {
    setColdStoreAllocations(prev => {
      const updated = [...prev];
      const row = { ...updated[index] };
      if (field === 'amount') {
        row.amount = value;
      } else if (field === 'pettyAdjustment') {
        row.pettyAdjustment = value;
      }
      updated[index] = row;
      return updated;
    });
  };

  const selectedBuyerDbId = useMemo(() => {
    if (!selectedPartyName) return null;
    const buyer = ledgerBuyers.find(b => b.name.toLowerCase() === selectedPartyName.toLowerCase());
    return buyer?.id || null;
  }, [selectedPartyName, ledgerBuyers]);

  const { data: buyerPendingData } = useQuery<BuyerPendingResponse>({
    queryKey: ["/api/cash/buyer-pending-transactions", selectedBuyerDbId],
    queryFn: async () => {
      if (!selectedBuyerDbId) return { pendingEntries: [], pyBalance: 0 };
      const res = await fetch(`/api/cash/buyer-pending-transactions/${selectedBuyerDbId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending transactions");
      return res.json();
    },
    enabled: !!selectedBuyerDbId && revenueType === "raw_potato",
  });

  useEffect(() => {
    setBuyerAllocations([]);
  }, [selectedPartyName]);

  useEffect(() => {
    if (buyerPendingData && buyerPendingData.pyBalance > 0 && buyerAllocations.length === 0) {
      setBuyerAllocations([{
        isPyBalance: true,
        label: t("PY Balance (Previous Year)", "पीवाई शेष (पिछला वर्ष)"),
        dueAmount: buyerPendingData.pyBalance,
        amount: buyerPendingData.pyBalance,
        pettyAdjustment: 0,
      }]);
    }
  }, [buyerPendingData]);

  const buyerGrandTotalCash = buyerAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
  const buyerGrandTotalPetty = buyerAllocations.reduce((sum, a) => sum + (a.pettyAdjustment || 0), 0);

  const toggleBuyerEntry = (entry: BuyerPendingEntry | { isPyBalance: true; dueAmount: number }) => {
    if ('isPyBalance' in entry) {
      const exists = buyerAllocations.find(a => a.isPyBalance);
      if (exists) {
        setBuyerAllocations(prev => prev.filter(a => !a.isPyBalance));
      } else {
        setBuyerAllocations(prev => [{
          isPyBalance: true,
          label: t("PY Balance (Previous Year)", "पीवाई शेष (पिछला वर्ष)"),
          dueAmount: entry.dueAmount,
          amount: entry.dueAmount,
          pettyAdjustment: 0,
        }, ...prev]);
      }
    } else {
      const exists = buyerAllocations.find(a => a.transactionId === entry.transactionId);
      if (exists) {
        setBuyerAllocations(prev => prev.filter(a => a.transactionId !== entry.transactionId));
      } else {
        setBuyerAllocations(prev => [...prev, {
          transactionId: entry.transactionId,
          label: `Tnx #${entry.transactionNumber} | ${entry.crop} | ${entry.dateOfLoading ? format(new Date(entry.dateOfLoading), "dd/MM/yy") : "?"} | ${entry.totalBags} bags | ${entry.daysSinceLoading ?? entry.daysSince}d`,
          dueAmount: entry.dueAmount,
          amount: entry.dueAmount,
          pettyAdjustment: 0,
        }]);
      }
    }
  };

  const updateBuyerAllocation = (index: number, field: 'amount' | 'pettyAdjustment', value: number) => {
    setBuyerAllocations(prev => {
      const updated = [...prev];
      const row = { ...updated[index] };
      if (field === 'amount') {
        row.amount = value;
      } else if (field === 'pettyAdjustment') {
        row.pettyAdjustment = value;
      }
      updated[index] = row;
      return updated;
    });
  };

  const handlePrintCheque = () => {
    const aadhatName = outflowForm.getValues("aadhatName") || "";
    const amount = aadhatGrandTotalCash;
    if (!aadhatName || amount <= 0) return;

    const safeName = escapeHtml(aadhatName);
    const now = new Date();
    const dateStr = format(now, "dd/MM/yyyy");
    const dateParts = dateStr.split("/");
    const amountInWords = numberToIndianWords(amount);
    let rupees = Math.floor(amount);
    let paise = Math.round((amount - rupees) * 100);
    if (paise >= 100) { rupees += 1; paise = 0; }
    const amountFigures = rupees.toLocaleString("en-IN") + "=" + (paise > 0 ? String(paise).padStart(2, "0") : "00");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cheque - ${safeName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page {
              size: 8in 3.66in;
              margin: 0;
            }
            body {
              width: 8in;
              height: 3.66in;
              position: relative;
              font-family: 'Consolas', 'Courier New', monospace;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .cheque {
              width: 8in;
              height: 3.66in;
              position: relative;
            }
            .date-field {
              position: absolute;
              top: 0.28in;
              right: 0.3in;
              font-size: 16px;
              font-weight: 600;
              letter-spacing: 4px;
              display: flex;
              gap: 2px;
            }
            .date-field span {
              display: inline-block;
              width: 18px;
              text-align: center;
            }
            .date-field .sep {
              width: 8px;
              color: transparent;
            }
            .payee-name {
              position: absolute;
              top: 0.72in;
              left: 0.7in;
              right: 1.2in;
              font-size: 16px;
              font-weight: 700;
              text-transform: uppercase;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .amount-words {
              position: absolute;
              top: 1.08in;
              left: 0.35in;
              right: 1.8in;
              font-size: 13px;
              font-weight: 600;
              line-height: 1.4;
              overflow: hidden;
            }
            .amount-words-line2 {
              position: absolute;
              top: 1.36in;
              left: 0.1in;
              right: 1.8in;
              font-size: 13px;
              font-weight: 600;
              line-height: 1.4;
              overflow: hidden;
            }
            .amount-box {
              position: absolute;
              top: 1.08in;
              right: 0.12in;
              width: 1.55in;
              height: 0.34in;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
              font-weight: 700;
              font-family: 'Consolas', 'Courier New', monospace;
              letter-spacing: 1px;
            }
            @media screen {
              body { background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
              .cheque {
                background: #fff;
                border: 1px dashed #ccc;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }
              .guide { border: 1px dashed rgba(200,200,200,0.5); }
            }
            @media print {
              .guide { border: none; }
            }
          </style>
        </head>
        <body>
          <div class="cheque">
            <div class="date-field">
              ${dateParts[0].split("").map(d => `<span>${d}</span>`).join("")}
              <span class="sep"></span>
              ${dateParts[1].split("").map(d => `<span>${d}</span>`).join("")}
              <span class="sep"></span>
              ${dateParts[2].split("").map(d => `<span>${d}</span>`).join("")}
            </div>
            <div class="payee-name">${safeName}</div>
            ${amountInWords.length > 50
              ? `<div class="amount-words">${amountInWords.substring(0, amountInWords.lastIndexOf(" ", 50)) || amountInWords.substring(0, 50)}</div>
                 <div class="amount-words-line2">${amountInWords.substring((amountInWords.lastIndexOf(" ", 50) || 50) + 1)}</div>`
              : `<div class="amount-words">${amountInWords}</div>`
            }
            <div class="amount-box guide">${amountFigures}</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  };

  const toggleAadhatEntry = (entry: AadhatPendingEntry | { isPyPayable: true; dueAmount: number }) => {
    if ('isPyPayable' in entry && entry.isPyPayable) {
      const exists = aadhatAllocations.find(a => a.isPyPayable);
      if (exists) {
        setAadhatAllocations(prev => prev.filter(a => !a.isPyPayable));
      } else {
        setAadhatAllocations(prev => [...prev, {
          isPyPayable: true,
          label: t("PY Payable (Previous Year)", "पीवाई देय (पिछला वर्ष)"),
          dueAmount: entry.dueAmount,
          amount: entry.dueAmount,
          discountPercent: 0,
          discountAmount: 0,
          pettyAdjustment: 0,
        }]);
      }
    } else if ('stockEntryId' in entry) {
      const exists = aadhatAllocations.find(a => a.stockEntryId === entry.stockEntryId);
      if (exists) {
        setAadhatAllocations(prev => prev.filter(a => a.stockEntryId !== entry.stockEntryId));
      } else {
        const daysSince = Math.floor((Date.now() - new Date(entry.purchaseDate).getTime()) / (1000 * 60 * 60 * 24));
        setAadhatAllocations(prev => [...prev, {
          stockEntryId: entry.stockEntryId,
          label: `SR #${entry.serialNumber} | ${entry.crop} | ${format(new Date(entry.purchaseDate), "dd/MM/yy")} | ${entry.totalBags} bags | ${daysSince}d`,
          dueAmount: entry.dueAmount,
          amount: entry.dueAmount,
          discountPercent: 0,
          discountAmount: 0,
          pettyAdjustment: 0,
        }]);
      }
    }
  };

  const updateAadhatAllocation = (index: number, field: 'amount' | 'discountPercent' | 'pettyAdjustment', value: number) => {
    setAadhatAllocations(prev => {
      const updated = [...prev];
      const row = { ...updated[index] };
      if (field === 'amount') {
        row.amount = value;
      } else if (field === 'discountPercent') {
        row.discountPercent = value;
        // Discount is rounded to whole rupees; the rounded figure feeds
        // Total Settled and all downstream totals/saving.
        row.discountAmount = Math.round((value / 100) * row.dueAmount);
      } else if (field === 'pettyAdjustment') {
        row.pettyAdjustment = value;
      }
      updated[index] = row;
      return updated;
    });
  };

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

  const inwardPartyDue = useMemo(() => {
    if (!selectedPartyName) return 0;
    const party = mergedPartiesForRawPotato.find(p => p.name.toLowerCase() === selectedPartyName.toLowerCase());
    return party?.overallDue || 0;
  }, [selectedPartyName, mergedPartiesForRawPotato]);

  const inwardSeedFarmerDue = useMemo(() => {
    if (!selectedSeedFarmerName) return 0;
    const farmer = ledgerFarmers.find(f => f.name.toLowerCase() === selectedSeedFarmerName.toLowerCase());
    return farmer ? Math.abs(Math.min(farmer.netDue, 0)) : 0;
  }, [selectedSeedFarmerName, ledgerFarmers]);

  const outflowFarmerDue = useMemo(() => {
    if (!selectedOutflowFarmerName) return 0;
    const farmer = ledgerFarmers.find(f => f.name.toLowerCase() === selectedOutflowFarmerName.toLowerCase());
    return farmer && farmer.netDue > 0 ? farmer.netDue : 0;
  }, [selectedOutflowFarmerName, ledgerFarmers]);

  const outflowColdStoreDue = useMemo(() => {
    if (!selectedOutflowColdStore) return 0;
    const store = coldStores.find(cs => cs.coldStoreName === selectedOutflowColdStore);
    return store?.totalDue || 0;
  }, [selectedOutflowColdStore, coldStores]);

  const outflowSupplierDue = useMemo(() => {
    if (!selectedOutflowSupplier) return 0;
    const supplier = seedSuppliers.find(s => s.supplierName === selectedOutflowSupplier);
    return supplier?.totalDue || 0;
  }, [selectedOutflowSupplier, seedSuppliers]);

  const onInwardSubmit = (values: InwardFormValues) => {
    if (values.revenueType === "raw_potato") {
      if (buyerAllocations.length === 0) {
        toast({
          title: t("Error", "त्रुटि"),
          description: t("Please select at least one transaction to allocate", "कृपया आवंटित करने के लिए कम से कम एक लेन-देन चुनें"),
          variant: "destructive",
        });
        return;
      }
      for (const alloc of buyerAllocations) {
        if (!alloc.amount || alloc.amount <= 0) {
          toast({
            title: t("Error", "त्रुटि"),
            description: t("Each allocation must have a positive amount", "प्रत्येक आवंटन में सकारात्मक राशि होनी चाहिए"),
            variant: "destructive",
          });
          return;
        }
        const totalSettled = (alloc.amount || 0) + (alloc.pettyAdjustment || 0);
        if (totalSettled > alloc.dueAmount + 0.01) {
          toast({
            title: t("Error", "त्रुटि"),
            description: t("Allocation exceeds due amount for: ", "आवंटन बकाया राशि से अधिक है: ") + alloc.label,
            variant: "destructive",
          });
          return;
        }
      }
      const totalAmount = buyerGrandTotalCash;
      if (totalAmount <= 0) {
        toast({
          title: t("Error", "त्रुटि"),
          description: t("Total amount must be greater than 0", "कुल राशि 0 से अधिक होनी चाहिए"),
          variant: "destructive",
        });
        return;
      }
      const selectedBuyer = ledgerBuyers.find(b => b.name.toLowerCase() === values.partyName?.toLowerCase());
      createEntryMutation.mutate({
        direction: "inward",
        receiptType: values.receiptType,
        revenueType: values.revenueType,
        partyName: values.partyName,
        partyVillage: selectedBuyer?.address || null,
        buyerId: selectedBuyer?.id || null,
        bankAccountId: (values.receiptType === "account_received" || values.receiptType === "cheque_received") ? values.bankAccountId : null,
        chequeNumber: values.receiptType === "cheque_received" ? (values.chequeNumber || null) : null,
        amount: totalAmount,
        entryDate: values.entryDate,
        remarks: values.remarks || null,
        buyerAllocations: buyerAllocations.map(a => ({
          transactionId: a.transactionId || null,
          isPyBalance: a.isPyBalance || false,
          amount: a.amount,
          pettyAdjustment: a.pettyAdjustment || 0,
        })),
      });
    } else if (values.revenueType === "seed_sale") {
      const selectedLedgerFarmer = ledgerFarmers.find(f => f.name.toLowerCase() === values.seedFarmerName?.toLowerCase());
      
      if (!values.amount || values.amount <= 0) {
        inwardForm.setError("amount", { 
          type: "manual", 
          message: t("Amount must be greater than 0", "राशि 0 से अधिक होनी चाहिए") 
        });
        return;
      }

      const selectedMergedFarmer = mergedFarmers.find(f => f.name.toLowerCase() === values.seedFarmerName?.toLowerCase());
      const farmerDue = selectedMergedFarmer?.pendingDues || 0;
      if (farmerDue > 0 && values.amount > farmerDue) {
        inwardForm.setError("amount", {
          type: "manual",
          message: t(`Amount cannot exceed due amount (₹${farmerDue.toLocaleString('en-IN')})`, `राशि बकाया राशि (₹${farmerDue.toLocaleString('en-IN')}) से अधिक नहीं हो सकती`),
        });
        return;
      }
      
      const inwardData: any = {
        direction: "inward",
        receiptType: values.receiptType,
        revenueType: values.revenueType,
        farmerName: values.seedFarmerName,
        farmerVillage: selectedLedgerFarmer?.village || null,
        farmerContact: selectedLedgerFarmer?.contact || null,
        farmerId: selectedLedgerFarmer?.id || null,
        bankAccountId: (values.receiptType === "account_received" || values.receiptType === "cheque_received") ? values.bankAccountId : null,
        chequeNumber: values.receiptType === "cheque_received" ? (values.chequeNumber || null) : null,
        amount: values.amount,
        entryDate: values.entryDate,
        remarks: values.remarks || null,
      };

      createEntryMutation.mutate(inwardData);
    } else if (values.revenueType === "sundry_pay") {
      if (!values.amount || values.amount <= 0) {
        inwardForm.setError("amount", { 
          type: "manual", 
          message: t("Amount must be greater than 0", "राशि 0 से अधिक होनी चाहिए") 
        });
        return;
      }
      createEntryMutation.mutate({
        direction: "inward",
        receiptType: values.receiptType,
        revenueType: values.revenueType,
        sundryPayName: values.sundryPayName,
        sundryPayDbId: values.sundryPayDbId || null,
        bankAccountId: (values.receiptType === "account_received" || values.receiptType === "cheque_received") ? values.bankAccountId : null,
        chequeNumber: values.receiptType === "cheque_received" ? (values.chequeNumber || null) : null,
        amount: values.amount,
        entryDate: values.entryDate,
        remarks: values.remarks || null,
      });
    }
  };

  const onOutflowSubmit = (values: OutflowFormValues) => {
    const isCapital = values.expenseCategory === "capital";
    const effectiveExpenseType = isCapital ? "capital_expense" : values.expenseType || "";
    const farmerExpenseTypes = ["farmer", "farmer_advance", "farmer_freight", "farmer_others"];
    const isFarmerType = !isCapital && farmerExpenseTypes.includes(effectiveExpenseType);
    const selectedLedgerFarmerOut = isFarmerType
      ? ledgerFarmers.find(f => f.name.toLowerCase() === values.farmerName?.toLowerCase())
      : null;
    
    const isAadhtiya = !isCapital && effectiveExpenseType === "aadhtiya";
    const isColdStoreCharge = !isCapital && effectiveExpenseType === "cold_store_charge";

    if (isAadhtiya) {
      if (aadhatAllocations.length === 0) {
        toast({
          title: t("Error", "त्रुटि"),
          description: t("Please select at least one entry to allocate payment", "कृपया भुगतान आवंटित करने के लिए कम से कम एक प्रविष्टि चुनें"),
          variant: "destructive",
        });
        return;
      }
      for (const alloc of aadhatAllocations) {
        const totalSettled = (alloc.amount || 0) + (alloc.discountAmount || 0) + (alloc.pettyAdjustment || 0);
        if (totalSettled <= 0) {
          toast({
            title: t("Error", "त्रुटि"),
            description: t("Each selected entry must have some amount allocated", "प्रत्येक चयनित प्रविष्टि में कुछ राशि आवंटित होनी चाहिए"),
            variant: "destructive",
          });
          return;
        }
        if (totalSettled > alloc.dueAmount + 0.01) {
          toast({
            title: t("Error", "त्रुटि"),
            description: t("Total settled cannot exceed due amount for an entry", "कुल निपटान एक प्रविष्टि की बकाया राशि से अधिक नहीं हो सकता"),
            variant: "destructive",
          });
          return;
        }
      }
      
      if (aadhatGrandTotalCash <= 0) {
        toast({
          title: t("Error", "त्रुटि"),
          description: t("Total cash amount must be greater than 0", "कुल नकद राशि 0 से अधिक होनी चाहिए"),
          variant: "destructive",
        });
        return;
      }
    } else if (isColdStoreCharge) {
      if (coldStoreAllocations.length === 0) {
        toast({
          title: t("Error", "त्रुटि"),
          description: t("Please select at least one lot to allocate payment", "कृपया भुगतान आवंटित करने के लिए कम से कम एक लॉट चुनें"),
          variant: "destructive",
        });
        return;
      }
      for (const alloc of coldStoreAllocations) {
        const totalSettled = (alloc.amount || 0) + (alloc.pettyAdjustment || 0);
        if (totalSettled <= 0) {
          toast({
            title: t("Error", "त्रुटि"),
            description: t("Each selected lot must have some amount allocated", "प्रत्येक चयनित लॉट में कुछ राशि आवंटित होनी चाहिए"),
            variant: "destructive",
          });
          return;
        }
        if (totalSettled > alloc.dueAmount + 0.01) {
          toast({
            title: t("Error", "त्रुटि"),
            description: t("Total settled cannot exceed due amount for a lot", "कुल निपटान एक लॉट की बकाया राशि से अधिक नहीं हो सकता"),
            variant: "destructive",
          });
          return;
        }
      }
      if (coldStoreGrandTotalCash <= 0) {
        toast({
          title: t("Error", "त्रुटि"),
          description: t("Total cash amount must be greater than 0", "कुल नकद राशि 0 से अधिक होनी चाहिए"),
          variant: "destructive",
        });
        return;
      }
    } else {
      if (!values.amount || values.amount <= 0) {
        outflowForm.setError("amount", { 
          type: "manual", 
          message: t("Amount must be greater than 0", "राशि 0 से अधिक होनी चाहिए") 
        });
        return;
      }
      const dueLimitMap: Record<string, number> = {
        farmer: outflowFarmerDue,
        supplier: outflowSupplierDue,
      };
      const dueLimit = dueLimitMap[effectiveExpenseType] || 0;
      if (dueLimit > 0 && values.amount > dueLimit) {
        outflowForm.setError("amount", {
          type: "manual",
          message: t(`Amount cannot exceed due amount (₹${dueLimit.toLocaleString('en-IN')})`, `राशि बकाया राशि (₹${dueLimit.toLocaleString('en-IN')}) से अधिक नहीं हो सकती`),
        });
        return;
      }
      // Paying a named truck can never exceed that truck's remaining freight.
      if (effectiveExpenseType === "transport_freight" && selectedFreightTruck && values.amount > selectedFreightTruck.remainingFreight + 0.01) {
        const rem = selectedFreightTruck.remainingFreight.toLocaleString('en-IN');
        outflowForm.setError("amount", {
          type: "manual",
          message: t(`Amount cannot exceed the remaining freight (₹${rem})`, `राशि शेष भाड़े (₹${rem}) से अधिक नहीं हो सकती`),
        });
        return;
      }
    }
    
    const selectedAadhat = isAadhtiya
      ? aadhatsWithDues.find(a => a.name === values.aadhatName)
      : null;

    const outflowData: any = {
      direction: "outflow",
      expenseType: effectiveExpenseType,
      expenseCategory: isCapital ? "capital" : "revenue",
      paymentMode: values.paymentMode,
      bankAccountId: (values.paymentMode === "account_transfer" || values.paymentMode === "cheque") ? values.bankAccountId : null,
      chequeNumber: values.paymentMode === "cheque" ? (values.chequeNumber || null) : null,
      farmerName: isFarmerType ? values.farmerName : null,
      farmerVillage: selectedLedgerFarmerOut?.village || null,
      farmerContact: selectedLedgerFarmerOut?.contact || null,
      farmerId: selectedLedgerFarmerOut?.id || null,
      coldStoreName: effectiveExpenseType === "cold_store_charge" ? values.coldStoreName : null,
      coldStoreDbId: effectiveExpenseType === "cold_store_charge" ? (coldStores.find(cs => cs.coldStoreName === values.coldStoreName)?.coldStoreDbId || null) : null,
      supplierName: effectiveExpenseType === "supplier" ? values.supplierName : null,
      aadhatName: isAadhtiya ? values.aadhatName : null,
      aadhatDbId: selectedAadhat?.id || values.aadhatDbId || null,
      sundryPayName: effectiveExpenseType === "sundry_pay" ? values.sundryPayName : null,
      sundryPayDbId: effectiveExpenseType === "sundry_pay" ? (values.sundryPayDbId || null) : null,
      capitalAssetName: isCapital ? values.capitalAssetName : null,
      capitalAssetCategory: isCapital ? values.capitalAssetCategory : null,
      // Null unless the user picked a specific truck ("Others" is the default).
      freightLoadingDate: selectedFreightTruck?.dateOfLoading ?? null,
      freightTransporterName: selectedFreightTruck?.transporterName ?? null,
      freightVehicleNumber: selectedFreightTruck?.vehicleNumber ?? null,
      amount: isAadhtiya ? aadhatGrandTotalCash : isColdStoreCharge ? coldStoreGrandTotalCash : values.amount,
      entryDate: values.entryDate,
      remarks: values.remarks || null,
    };

    if (isAadhtiya) {
      outflowData.aadhatAllocations = aadhatAllocations.map(a => ({
        stockEntryId: a.stockEntryId || null,
        isPyPayable: a.isPyPayable || false,
        amount: a.amount || 0,
        discountPercent: a.discountPercent || 0,
        discountAmount: a.discountAmount || 0,
        pettyAdjustment: a.pettyAdjustment || 0,
      }));
    }

    if (isColdStoreCharge) {
      outflowData.coldStoreAllocations = coldStoreAllocations.map(a => ({
        lotId: a.lotId || null,
        seedLotId: a.seedLotId || null,
        isPyPayable: a.isPyPayable || false,
        amount: a.amount || 0,
        pettyAdjustment: a.pettyAdjustment || 0,
      }));
    }

    createEntryMutation.mutate(outflowData);
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

  // Calculate summary values (exclude reversed entries from balance calculations)
  const { totalCashReceived, totalAccountReceived, totalCashExpense, totalAccountExpense, transfersFromCash, transfersToCash, openingCashInHand, legacyOpeningCashInAccount, netCashInHand } = useMemo(() => {
    const totalCashReceived = entries
      .filter(e => e.direction === "inward" && e.receiptType === "cash_received" && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const totalAccountReceived = entries
      .filter(e => e.direction === "inward" && (e.receiptType === "account_received" || e.receiptType === "cheque_received") && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const totalCashExpense = entries
      .filter(e => e.direction === "outflow" && e.paymentMode === "cash" && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const totalAccountExpense = entries
      .filter(e => e.direction === "outflow" && (e.paymentMode === "account_transfer" || e.paymentMode === "cheque") && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const openingCashInHand = cashSettings ? parseFloat(cashSettings.openingCashInHand || "0") : 0;
    const legacyOpeningCashInAccount = cashSettings ? parseFloat(cashSettings.openingCashInAccount || "0") : 0;
    const transfersFromCash = entries
      .filter(e => e.direction === "transfer" && e.fromAccountType === "cash_in_hand" && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const transfersToCash = entries
      .filter(e => e.direction === "transfer" && e.toAccountType === "cash_in_hand" && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const netCashInHand = openingCashInHand + totalCashReceived - totalCashExpense - transfersFromCash + transfersToCash;
    return { totalCashReceived, totalAccountReceived, totalCashExpense, totalAccountExpense, transfersFromCash, transfersToCash, openingCashInHand, legacyOpeningCashInAccount, netCashInHand };
  }, [entries, cashSettings]);

  // Calculate account-wise breakdown for entries that have bankAccountId (exclude reversed entries)
  const { accountWiseBreakdown, unassignedAccountReceived, unassignedAccountExpense, unassignedAccountNet, netCashInAccount } = useMemo(() => {
    const accountWiseBreakdown = bankAccounts.map(account => {
      const inward = entries
        .filter(e => e.direction === "inward" && (e.receiptType === "account_received" || e.receiptType === "cheque_received") && e.bankAccountId === account.id && !e.isReversed)
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const outflow = entries
        .filter(e => e.direction === "outflow" && (e.paymentMode === "account_transfer" || e.paymentMode === "cheque") && e.bankAccountId === account.id && !e.isReversed)
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const transferIn = entries
        .filter(e => e.direction === "transfer" && e.toBankAccountId === account.id && !e.isReversed)
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const transferOut = entries
        .filter(e => e.direction === "transfer" && e.fromBankAccountId === account.id && !e.isReversed)
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const openingBalance = parseFloat(account.openingBalance || "0");
      const net = openingBalance + inward - outflow + transferIn - transferOut;
      return { id: account.id, name: account.name, accountType: account.accountType, openingBalance, inward, outflow, net };
    });
    const unassignedAccountReceived = entries
      .filter(e => e.direction === "inward" && (e.receiptType === "account_received" || e.receiptType === "cheque_received") && !e.bankAccountId && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const unassignedAccountExpense = entries
      .filter(e => e.direction === "outflow" && (e.paymentMode === "account_transfer" || e.paymentMode === "cheque") && !e.bankAccountId && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const unassignedAccountNet = legacyOpeningCashInAccount + unassignedAccountReceived - unassignedAccountExpense;
    const netCashInAccount = bankAccounts.length > 0
      ? accountWiseBreakdown.reduce((sum, a) => sum + a.net, 0) + unassignedAccountNet
      : legacyOpeningCashInAccount + totalAccountReceived - totalAccountExpense;
    return { accountWiseBreakdown, unassignedAccountReceived, unassignedAccountExpense, unassignedAccountNet, netCashInAccount };
  }, [entries, bankAccounts, legacyOpeningCashInAccount, totalAccountReceived, totalAccountExpense]);

  // Filter entries
  const filteredEntries = useMemo(() => entries.filter(entry => {
    const entryDate = new Date(entry.entryDate);
    const entryMonth = (entryDate.getMonth() + 1).toString();
    const entryYear = entryDate.getFullYear().toString();

    if (filterDirection && filterDirection !== "all") {
      if (filterDirection === "outflow" && entry.direction !== "outflow") return false;
      if (filterDirection === "inward" && entry.direction !== "inward") return false;
      if (filterDirection === "transfer" && entry.direction !== "transfer") return false;
    }
    if (filterExpenseCategory && filterExpenseCategory !== "all") {
      if (entry.direction !== "outflow") return false;
      if (filterExpenseCategory === "capital" && entry.expenseCategory !== "capital") return false;
      if (filterExpenseCategory === "revenue" && entry.expenseCategory === "capital") return false;
    }
    if (filterPartyName && filterPartyName !== "all" && entry.partyName !== filterPartyName) return false;
    if (filterExpenseType && filterExpenseType !== "all") {
      if (filterExpenseCategory === "capital") {
        if (entry.capitalAssetCategory !== filterExpenseType) return false;
      } else {
        if (entry.expenseType !== filterExpenseType) return false;
      }
    }
    if (filterFarmerId != null && entry.farmerId !== filterFarmerId) return false;
    if (filterSupplierName && filterSupplierName !== "all" && entry.supplierName !== filterSupplierName) return false;
    if (filterMonth && filterMonth !== "all" && entryMonth !== filterMonth) return false;
    if (filterYear && filterYear !== "all" && entryYear !== filterYear) return false;
    if (filterDays.length > 0 && !filterDays.includes(entryDate.getDate())) return false;
    if (filterRemarks && !(entry.remarks || "").toLowerCase().includes(filterRemarks.toLowerCase())) return false;
    return true;
  }), [entries, filterDirection, filterExpenseCategory, filterPartyName, filterExpenseType, filterFarmerId, filterSupplierName, filterMonth, filterYear, filterDays, filterRemarks]);

  // Filtered summary (exclude reversed entries)
  const { filteredInflow, filteredOutflow } = useMemo(() => ({
    filteredInflow: filteredEntries
      .filter(e => e.direction === "inward" && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0),
    filteredOutflow: filteredEntries
      .filter(e => e.direction === "outflow" && !e.isReversed)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0),
  }), [filteredEntries]);

  // Get unique values for filter dropdowns
  const { uniquePartyNames, uniqueSupplierNames, uniqueFarmerOptions, uniqueFarmerNames, uniqueYears } = useMemo(() => {
    const uniquePartyNames = Array.from(new Set(entries.filter(e => e.partyName).map(e => e.partyName!)));
    const uniqueSupplierNames = Array.from(new Set(entries.filter(e => e.supplierName).map(e => e.supplierName!)));
    const farmerMap = new Map<number, { id: number; name: string; village: string | null; contact: string | null }>();
    entries.filter(e => e.farmerName && e.farmerId).forEach(e => {
      if (!farmerMap.has(e.farmerId!)) {
        const farmerWithDue = farmers.find(f => f.farmerName.toLowerCase() === e.farmerName!.toLowerCase());
        farmerMap.set(e.farmerId!, {
          id: e.farmerId!,
          name: e.farmerName!,
          village: e.farmerVillage || farmerWithDue?.village || null,
          contact: farmerWithDue?.farmerContact || null,
        });
      }
    });
    const uniqueFarmerOptions = Array.from(farmerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const uniqueFarmerNames = uniqueFarmerOptions.map(f => f.name);
    const uniqueYears = Array.from(new Set(entries.map(e => new Date(e.entryDate).getFullYear().toString()))).sort().reverse();
    return { uniquePartyNames, uniqueSupplierNames, uniqueFarmerOptions, uniqueFarmerNames, uniqueYears };
  }, [entries, farmers]);

  const hasActiveFilters = (filterDirection && filterDirection !== "all") ||
    (filterExpenseCategory && filterExpenseCategory !== "all") ||
    (filterPartyName && filterPartyName !== "all") || 
    (filterExpenseType && filterExpenseType !== "all") || 
    filterFarmerId != null || 
    (filterSupplierName && filterSupplierName !== "all") ||
    (filterMonth && filterMonth !== "all") || 
    (filterYear && filterYear !== "all") ||
    filterDays.length > 0 ||
    !!filterRemarks;

  const clearFilters = () => {
    setFilterDirection("");
    setFilterExpenseCategory("");
    setFilterPartyName("");
    setFilterExpenseType("");
    setFilterFarmerName("");
    setFilterFarmerId(null);
    setFilterSupplierName("");
    setFilterMonth("");
    setFilterYear("");
    setFilterDays([]);
    setFilterRemarks("");
  };

  const getReceiptTypeLabel = (type: string) => {
    switch (type) {
      case "cash_received": return t("Cash Received", "नकद प्राप्त");
      case "account_received": return t("Account Received", "खाते में प्राप्त");
      case "cheque_received": return t("Cheque Received", "चेक प्राप्त");
      default: return type;
    }
  };

  const getExpenseTypeLabel = (type: string) => {
    switch (type) {
      case "aadhtiya": return t("Aadhtiya", "आढ़तिया");
      case "bag_charges": return t("Bag Charges", "बोरी शुल्क");
      case "cold_store_charge": return t("Cold Store Charge", "शीत भंडार शुल्क");
      case "farmer": return t("Farmer - Harvest", "किसान - फसल");
      case "farmer_advance": return t("Farmer Advance", "किसान अग्रिम");
      case "farmer_freight": return t("Farmer Freight", "किसान भाड़ा");
      case "farmer_others": return t("Farmer Others", "किसान अन्य");
      case "general_expense": return t("General Expense", "सामान्य खर्च");
      case "grading": return t("Grading", "ग्रेडिंग");
      case "hammali": return t("Hammali", "हम्माली");
      case "kata_charges": return t("Kata Charges", "काटा शुल्क");
      case "mandi_commission": return t("Mandi Commission", "मण्डी कमीशन");
      case "pesticide_charges": return t("Pesticide Charges", "कीटनाशक शुल्क");
      case "salary": return t("Salary", "वेतन");
      case "sundry_pay": return t("Sundry Pay", "सन्ड्री पे");
      case "supplier": return t("Supplier", "आपूर्तिकर्ता");
      case "transport_freight": return t("Transport/Freight", "परिवहन/भाड़ा");
      case "warehouse_charges": return t("Warehouse Charges", "गोदाम शुल्क");
      case "capital_expense": return t("Capital Expense", "पूंजीगत व्यय");
      default: return type;
    }
  };

  const getAssetCategoryLabel = (cat: string) => {
    switch (cat) {
      case "building": return t("Building", "भवन");
      case "plant_machinery": return t("Plant & Machinery", "यंत्र एवं मशीनरी");
      case "furniture": return t("Furniture & Fixtures", "फर्नीचर एवं जुड़नार");
      case "vehicle": return t("Vehicles", "वाहन");
      case "computer": return t("Computers", "कंप्यूटर");
      case "electrical_fittings": return t("Electrical Fittings", "विद्युत फिटिंग");
      case "equipment": return t("Equipment", "उपकरण");
      case "other": return t("Other", "अन्य");
      default: return cat;
    }
  };

  const getPaymentModeLabel = (mode: string) => {
    switch (mode) {
      case "cash": return t("Cash", "नकद");
      case "account_transfer": return t("Account Transfer", "खाता स्थानांतरण");
      case "cheque": return t("Cheque", "चेक");
      default: return mode;
    }
  };

  const getRevenueTypeLabel = (type: string) => {
    switch (type) {
      case "raw_potato": return t("Harvest", "हार्वेस्ट");
      case "seed_sale": return t("Seed Sale", "बीज बिक्री");
      case "sundry_pay": return t("Sundry Pay Recovery", "सन्ड्री पे वसूली");
      default: return type;
    }
  };

  const handleDownloadCSV = () => {
    // Use filteredEntries if filters are applied, otherwise use all entries.
    // Reversed entries are excluded from the export.
    const entriesToDownload = (hasActiveFilters ? filteredEntries : entries).filter(e => !e.isReversed);

    if (entriesToDownload.length === 0) {
      toast({
        title: t("No Data", "कोई डेटा नहीं"),
        description: t("No entries to download", "डाउनलोड करने के लिए कोई प्रविष्टि नहीं"),
        variant: "destructive",
      });
      return;
    }

    const getFromAccountLabel = (entry: CashEntry) => {
      if (entry.direction !== "transfer") return "";
      if (entry.fromAccountType === "cash_in_hand") return t("Cash in Hand", "हाथ में नकद");
      if (entry.fromAccountType === "bank_account") {
        return entry.fromBankAccountName || t("Bank Account", "बैंक खाता");
      }
      return "";
    };

    const getToAccountLabel = (entry: CashEntry) => {
      if (entry.direction !== "transfer") return "";
      if (entry.toAccountType === "cash_in_hand") return t("Cash in Hand", "हाथ में नकद");
      if (entry.toAccountType === "bank_account") {
        return entry.toBankAccountName || t("Bank Account", "बैंक खाता");
      }
      return "";
    };

    const headers = [
      t("Transaction Code", "लेनदेन कोड"),
      t("Date", "तिथि"),
      t("Direction", "दिशा"),
      t("Receipt Type", "रसीद प्रकार"),
      t("Revenue Type", "राजस्व प्रकार"),
      t("Expense Type", "खर्च प्रकार"),
      t("Payment Mode", "भुगतान माध्यम"),
      t("Bank Account", "बैंक खाता"),
      t("Buyer Name", "खरीदार का नाम"),
      t("Buyer Village", "खरीदार का गाँव"),
      t("Farmer Name", "किसान का नाम"),
      t("Farmer Village", "किसान का गाँव"),
      t("Cold Store", "शीत भंडार"),
      t("Supplier Name", "आपूर्तिकर्ता का नाम"),
      t("Aadhtiya Name", "आढ़तिया का नाम"),
      t("Aadhtiya Payment Details", "आढ़तिया भुगतान विवरण"),
      t("Cold Store Payment Details", "शीत भंडार भुगतान विवरण"),
      t("Expense Category", "व्यय श्रेणी"),
      t("Asset Name", "संपत्ति का नाम"),
      t("Asset Category", "संपत्ति श्रेणी"),
      t("From Account", "स्रोत खाता"),
      t("To Account", "गंतव्य खाता"),
      t("Amount", "राशि"),
      t("Status", "स्थिति"),
      t("Cheque Number", "चेक नंबर"),
      t("Remarks", "टिप्पणी"),
      t("Created At", "बनाया गया"),
    ];

    const rows = entriesToDownload.map(entry => [
      entry.transactionCode || "",
      format(new Date(entry.entryDate), "dd/MM/yyyy"),
      entry.direction === "inward" ? t("Inward", "आवक") : entry.direction === "transfer" ? t("Transfer", "ट्रांसफर") : t("Outflow", "जावक"),
      entry.receiptType ? getReceiptTypeLabel(entry.receiptType) : "",
      entry.revenueType ? getRevenueTypeLabel(entry.revenueType) : "",
      entry.expenseType ? getExpenseTypeLabel(entry.expenseType) : "",
      // Inward entries store their mode in receiptType, not paymentMode.
      entry.direction === "inward"
        ? (entry.receiptType === "cash_received" ? t("Cash", "नकद") : entry.receiptType === "account_received" ? t("Account", "खाता") : entry.receiptType === "cheque_received" ? t("Cheque", "चेक") : "")
        : (entry.paymentMode ? getPaymentModeLabel(entry.paymentMode) : ""),
      entry.bankAccountName || "",
      entry.partyName || "",
      entry.partyVillage || "",
      entry.farmerName || "",
      entry.farmerVillage || "",
      entry.coldStoreName || "",
      entry.supplierName || "",
      entry.aadhatName || "",
      (() => {
        if (!entry.aadhatAllocations || entry.aadhatAllocations.length === 0) return "";
        const parts: string[] = [];
        const allocLabel = (a: AadhatPaymentAllocationDetail) => a.isPyPayable ? "PY" : `SR #${a.serialNumber || "?"}`;
        const discountParts = entry.aadhatAllocations
          .filter(a => parseFloat(a.discountPercent || "0") > 0)
          .map(a => `${allocLabel(a)} - ${parseFloat(a.discountPercent)}%`);
        if (discountParts.length > 0) parts.push(`Discount % - (${discountParts.join(", ")})`);
        const pettyParts = entry.aadhatAllocations
          .filter(a => parseFloat(a.pettyAdjustment || "0") !== 0)
          .map(a => `${allocLabel(a)} - ₹${parseFloat(a.pettyAdjustment).toLocaleString("en-IN")}`);
        if (pettyParts.length > 0) parts.push(`Petty Adj - (${pettyParts.join(", ")})`);
        const entryRefs = entry.aadhatAllocations.map(a => {
          const label = allocLabel(a);
          const amt = parseFloat(a.appliedAmount || "0");
          return `${label}: ₹${amt.toLocaleString("en-IN")}`;
        });
        if (entryRefs.length > 0) parts.unshift(`Entries - (${entryRefs.join(", ")})`);
        return parts.join(". ");
      })(),
      (() => {
        if (!entry.coldStoreAllocations || entry.coldStoreAllocations.length === 0) return "";
        const parts: string[] = [];
        const allocLabel = (a: ColdStorePaymentAllocationDetail) => a.isPyPayable ? "PY" : (a.lotId ? `Lot#${a.lotId}` : `SeedLot#${a.seedLotId}`);
        const pettyParts = entry.coldStoreAllocations
          .filter(a => parseFloat(a.pettyAdjustment || "0") !== 0)
          .map(a => `${allocLabel(a)} - ₹${parseFloat(a.pettyAdjustment).toLocaleString("en-IN")}`);
        if (pettyParts.length > 0) parts.push(`Petty Adj - (${pettyParts.join(", ")})`);
        const entryRefs = entry.coldStoreAllocations.map(a => {
          const label = allocLabel(a);
          const amt = parseFloat(a.appliedAmount || "0");
          return `${label}: ₹${amt.toLocaleString("en-IN")}`;
        });
        if (entryRefs.length > 0) parts.unshift(`Lots - (${entryRefs.join(", ")})`);
        return parts.join(". ");
      })(),
      entry.expenseCategory === "capital" ? t("Capital", "पूंजीगत") : entry.expenseCategory === "revenue" ? t("Revenue", "राजस्व") : "",
      entry.capitalAssetName || "",
      entry.capitalAssetCategory ? getAssetCategoryLabel(entry.capitalAssetCategory) : "",
      getFromAccountLabel(entry),
      getToAccountLabel(entry),
      entry.amount,
      entry.isReversed ? t("Reversed", "उलट दिया गया") : t("Active", "सक्रिय"),
      entry.chequeNumber || "",
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
    const today = format(new Date(), "yyyy-MM-dd");
    link.download = `cash_entries_${hasActiveFilters ? "filtered_" : ""}${today}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast({
      title: t("Success", "सफल"),
      description: hasActiveFilters 
        ? t("Filtered entries downloaded successfully", "फ़िल्टर की गई प्रविष्टियाँ सफलतापूर्वक डाउनलोड हुई")
        : t("All entries downloaded successfully", "सभी प्रविष्टियाँ सफलतापूर्वक डाउनलोड हुई"),
      variant: "success",
    });
  };

  const handlePrintPDF = async () => {
    // Reversed entries are excluded from the printed report.
    const entriesToPrint = (hasActiveFilters ? filteredEntries : entries).filter(e => !e.isReversed);

    if (entriesToPrint.length === 0) {
      toast({
        title: t("No Data", "कोई डेटा नहीं"),
        description: t("No entries to print", "प्रिंट करने के लिए कोई प्रविष्टि नहीं"),
        variant: "destructive",
      });
      return;
    }

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const fmtAmt = (v: number) => v.toLocaleString("en-IN");

    // Party column: counterparty/category context, e.g.
    // "Hammali - Sunil Grading hammali", "General Expense - Kamal carpenter",
    // "Buyer Name (Village)".
    const buildParty = (entry: CashEntry): string => {
      const nameParts: string[] = [];
      if (entry.partyName) nameParts.push(entry.partyVillage ? `${entry.partyName} (${entry.partyVillage})` : entry.partyName);
      if (entry.farmerName) nameParts.push(entry.farmerVillage ? `${entry.farmerName} (${entry.farmerVillage})` : entry.farmerName);
      if (entry.aadhatName) nameParts.push(entry.aadhatName);
      if (entry.supplierName) nameParts.push(entry.supplierName);
      if (entry.coldStoreName) nameParts.push(entry.coldStoreName);
      if (entry.sundryPayName) nameParts.push(entry.sundryPayName);
      if (entry.capitalAssetName) nameParts.push(entry.capitalAssetName);
      const name = nameParts.join(", ");

      if (entry.direction === "transfer") {
        const from = entry.fromAccountType === "cash_in_hand" ? t("Cash in Hand", "हाथ में नकद") : (entry.fromBankAccountName || t("Bank Account", "बैंक खाता"));
        const to = entry.toAccountType === "cash_in_hand" ? t("Cash in Hand", "हाथ में नकद") : (entry.toBankAccountName || t("Bank Account", "बैंक खाता"));
        return `${t("Transfer", "ट्रांसफर")}: ${from} → ${to}`;
      }
      if (entry.direction === "outflow") {
        const category = entry.expenseType ? getExpenseTypeLabel(entry.expenseType) : (entry.capitalAssetCategory ? getAssetCategoryLabel(entry.capitalAssetCategory) : "");
        if (category && name) return `${category} - ${name}`;
        return category || name || "";
      }
      // inward
      if (name) return name;
      return entry.revenueType ? getRevenueTypeLabel(entry.revenueType) : "";
    };

    // Summary figures — same classification as the existing useMemo summary block.
    let sumCashIn = 0, sumCashOut = 0, sumAccIn = 0, sumAccOut = 0;
    for (const e of entriesToPrint) {
      const amt = parseFloat(e.amount || "0");
      if (e.direction === "inward") {
        if (e.receiptType === "cash_received") sumCashIn += amt;
        else if (e.receiptType === "account_received" || e.receiptType === "cheque_received") sumAccIn += amt;
      } else if (e.direction === "outflow") {
        if (e.paymentMode === "cash") sumCashOut += amt;
        else if (e.paymentMode === "account_transfer" || e.paymentMode === "cheque") sumAccOut += amt;
      } else if (e.direction === "transfer") {
        if (e.toAccountType === "cash_in_hand") sumCashIn += amt;       // account → cash
        if (e.fromAccountType === "cash_in_hand") sumCashOut += amt;    // cash → account
        if (e.toAccountType === "bank_account") sumAccIn += amt;        // cash → account
        if (e.fromAccountType === "bank_account") sumAccOut += amt;     // account → cash
      }
    }
    const netCash = sumCashIn - sumCashOut;
    const netAcc = sumAccIn - sumAccOut;
    const fmtSigned = (v: number) => (v >= 0 ? `₹${fmtAmt(v)}` : `−₹${fmtAmt(Math.abs(v))}`);
    const netCashColor = netCash >= 0 ? "#1e8a3c" : "#c62828";
    const netAccColor  = netAcc  >= 0 ? "#1e8a3c" : "#c62828";

    const summaryHtml = `
<div style="display:flex;gap:16px;margin-bottom:14px;font-size:12px">
  <!-- Cash block (left) -->
  <div style="flex:1;border:1px solid #c8e6c9;border-radius:6px;padding:10px 12px;background:#f1faf3">
    <div style="font-size:11px;font-weight:bold;color:#1e8a3c;border-bottom:1px solid #c8e6c9;padding-bottom:4px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">
      ${t("Cash", "नकद")}
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <span style="color:#555">${t("Total Cash In", "कुल नकद आवक")}</span>
      <span style="font-weight:600;color:#1e8a3c">₹${fmtAmt(sumCashIn)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <span style="color:#555">${t("Total Cash Out", "कुल नकद जावक")}</span>
      <span style="font-weight:600;color:#c62828">₹${fmtAmt(sumCashOut)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;border-top:1px solid #c8e6c9;padding-top:6px;margin-top:2px">
      <span style="font-weight:bold">${t("Net Cash", "शुद्ध नकद")}</span>
      <span style="font-weight:bold;color:${netCashColor}">${fmtSigned(netCash)}</span>
    </div>
  </div>
  <!-- Account block (right) -->
  <div style="flex:1;border:1px solid #bbdefb;border-radius:6px;padding:10px 12px;background:#f0f7ff">
    <div style="font-size:11px;font-weight:bold;color:#1565c0;border-bottom:1px solid #bbdefb;padding-bottom:4px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">
      ${t("Account", "खाता")}
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <span style="color:#555">${t("Total Account In", "कुल खाता आवक")}</span>
      <span style="font-weight:600;color:#1565c0">₹${fmtAmt(sumAccIn)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <span style="color:#555">${t("Total Account Out", "कुल खाता जावक")}</span>
      <span style="font-weight:600;color:#c62828">₹${fmtAmt(sumAccOut)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;border-top:1px solid #bbdefb;padding-top:6px;margin-top:2px">
      <span style="font-weight:bold">${t("Net Account", "शुद्ध खाता")}</span>
      <span style="font-weight:bold;color:${netAccColor}">${fmtSigned(netAcc)}</span>
    </div>
  </div>
</div>`;

    let totalDr = 0;
    let totalCr = 0;
    const bodyRows = entriesToPrint.map((entry, idx) => {
      const amt = parseFloat(entry.amount || "0");
      const isOut = entry.direction === "outflow";
      const isIn = entry.direction === "inward";
      const isTransfer = entry.direction === "transfer";
      if (isOut || isTransfer) totalDr += amt;
      if (isIn || isTransfer) totalCr += amt;
      const dr = (isOut || isTransfer) ? fmtAmt(amt) : "-";
      const cr = (isIn || isTransfer) ? fmtAmt(amt) : "-";
      // Inward entries store their mode in receiptType, not paymentMode.
      const mode = isTransfer
        ? t("Transfer", "ट्रांसफर")
        : isIn
          ? (entry.receiptType === "cash_received" ? t("Cash", "नकद") : entry.receiptType === "account_received" ? t("Account", "खाता") : entry.receiptType === "cheque_received" ? t("Cheque", "चेक") : "")
          : (entry.paymentMode ? getPaymentModeLabel(entry.paymentMode) : "");
      const remarks = entry.remarks ? esc(entry.remarks) : "";
      const bg = idx % 2 === 0 ? "#fafafa" : "#f0f0f0";
      return `<tr style="background:${bg}">
        <td>${format(new Date(entry.entryDate), "dd/MM/yyyy")}</td>
        <td>${esc(buildParty(entry))}</td>
        <td>${esc(mode)}</td>
        <td class="num">${dr}</td>
        <td class="num">${cr}</td>
        <td>${remarks}</td>
      </tr>`;
    }).join("");

    const merchantName = user?.merchantName || "";
    const merchantAddress = user?.merchantAddress || "";
    const merchantContact = user?.merchantContact || "";

    // If a header image is configured but the cached data URI isn't ready yet
    // (fetch still in-flight), fetch it now so the printed header never falls
    // back to text when an image exists.
    let headerImg = headerImageDataUri;
    if (!headerImg && merchantData?.receiptHeaderImage && user?.merchantId) {
      try {
        const res = await fetch(`/api/merchants/${user.merchantId}/receipt-header`, { credentials: "include" });
        if (res.ok) {
          const blob = await res.blob();
          headerImg = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          setHeaderImageDataUri(headerImg);
        }
      } catch {
        // fall back to text header
      }
    }

    const headerHtml = headerImg
      ? `<div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px"><img src="${headerImg}" style="width:100%;height:auto;display:block" /></div>`
      : `<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px">
          <div style="font-size:22px;font-weight:bold">${esc(merchantName)}</div>
          ${merchantAddress ? `<div style="font-size:13px;color:#555;margin-top:2px">${esc(merchantAddress)}</div>` : ""}
          ${merchantContact ? `<div style="font-size:13px;color:#555">${esc(merchantContact)}</div>` : ""}
        </div>`;

    const subtitle = hasActiveFilters ? t("Filtered transactions", "फ़िल्टर की गई प्रविष्टियाँ") : t("All transactions", "सभी लेनदेन");
    const generated = format(new Date(), "dd/MM/yyyy");

    const html = `<!DOCTYPE html>
<html>
<head>
<title>Cash Flow History ${generated}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 16px; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1e8a3c; color: #fff; text-align: left; padding: 7px 8px; }
  td { padding: 6px 8px; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.total-row td { background: #e6f4ea; font-weight: bold; border-top: 1px solid #1e8a3c; }
  thead { display: table-header-group; }
  tbody tr { page-break-inside: avoid; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div style="padding:32px">
${headerHtml}
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px">
  <div>
    <div style="font-size:18px;font-weight:bold">${t("Cash Flow History", "नकद प्रवाह इतिहास")}</div>
    <div style="font-size:12px;margin-top:2px">${esc(subtitle)}</div>
  </div>
  <div style="font-size:12px">${t("Generated", "तैयार")}: ${generated}</div>
</div>
${summaryHtml}
<table>
  <colgroup>
    <col style="width:10%"><col style="width:29%"><col style="width:13%"><col style="width:12%"><col style="width:11%"><col style="width:25%">
  </colgroup>
  <thead>
    <tr>
      <th>${t("Date", "तिथि")}</th>
      <th>${t("Party", "पार्टी")}</th>
      <th>${t("Mode", "माध्यम")}</th>
      <th class="num">${t("Dr (Outflow)", "डेबिट (जावक)")}</th>
      <th class="num">${t("Cr (Inflow)", "क्रेडिट (आवक)")}</th>
      <th>${t("Remarks", "टिप्पणी")}</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="total-row">
      <td></td>
      <td>${t("Total", "कुल")}</td>
      <td></td>
      <td class="num">${fmtAmt(totalDr)}</td>
      <td class="num">${fmtAmt(totalCr)}</td>
      <td></td>
    </tr>
  </tbody>
</table>
</div>
</body>
</html>`;
    // Use the hidden-iframe print approach so the browser's native print
    // engine handles page breaks. The canvas-based shareReceiptAsPdf slices a
    // single image at fixed A4 heights and cannot respect CSS page-break rules.
    printHtmlDocument(html);
  };

  return (
    <div className="space-y-6" data-testid="cash-management-tab">
      {/* Settings Dialog */}
      <CashSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      
      
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
                    {viewDetailsEntry.direction === "inward" ? "+" : "-"}₹{parseFloat(viewDetailsEntry.amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
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
                    {viewDetailsEntry.bankAccountName && (
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">{t("Bank Account", "बैंक खाता")}</Label>
                        <p className="font-medium">{viewDetailsEntry.bankAccountName}</p>
                      </div>
                    )}
                    {viewDetailsEntry.chequeNumber && (
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">{t("Cheque Number", "चेक नंबर")}</Label>
                        <p className="font-medium">{viewDetailsEntry.chequeNumber}</p>
                      </div>
                    )}
                  </div>
                  
                  {viewDetailsEntry.partyName && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("Buyer Name", "खरीदार का नाम")}</Label>
                        <p className="font-medium">{viewDetailsEntry.partyName}</p>
                      </div>
                      {viewDetailsEntry.partyVillage && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("Buyer Village", "खरीदार का गाँव")}</Label>
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

                  {viewDetailsEntry.buyerAllocations && viewDetailsEntry.buyerAllocations.length > 0 && (
                    <div className="border-t pt-3">
                      <h4 className="font-semibold text-sm mb-2">{t("Payment Allocations", "भुगतान आवंटन")}</h4>
                      <div className="space-y-2">
                        {viewDetailsEntry.buyerAllocations.map((alloc, idx) => {
                          const appliedAmt = parseFloat(alloc.appliedAmount || "0");
                          const pettyAdj = parseFloat(alloc.pettyAdjustment || "0");
                          const totalSettled = appliedAmt + pettyAdj;
                          return (
                            <div key={idx} className="p-2 bg-muted rounded-md text-sm" data-testid={`buyer-alloc-detail-${idx}`}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold">
                                  {alloc.isPyBalance ? t("PY Balance", "पिछला शेष") : (alloc.transactionCode || "?")}
                                </span>
                                <span className="font-semibold">₹{totalSettled.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                                <span>{t("Cash", "नकद")}: ₹{appliedAmt.toLocaleString("en-IN")}</span>
                                <span className={cn(pettyAdj > 50 ? "text-red-600" : pettyAdj > 1 ? "text-orange-600" : "")}>
                                  {t("Petty", "पेटी")}: ₹{pettyAdj.toLocaleString("en-IN")}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
                    {viewDetailsEntry.bankAccountName && (
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">{t("Bank Account", "बैंक खाता")}</Label>
                        <p className="font-medium">{viewDetailsEntry.bankAccountName}</p>
                      </div>
                    )}
                    {viewDetailsEntry.chequeNumber && (
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">{t("Cheque Number", "चेक नंबर")}</Label>
                        <p className="font-medium">{viewDetailsEntry.chequeNumber}</p>
                      </div>
                    )}
                    {viewDetailsEntry.expenseType === "capital_expense" && (
                      <div className="mt-2 grid grid-cols-2 gap-4">
                        {viewDetailsEntry.capitalAssetName && (
                          <div>
                            <Label className="text-xs text-muted-foreground">{t("Asset Name", "संपत्ति का नाम")}</Label>
                            <p className="font-medium">{viewDetailsEntry.capitalAssetName}</p>
                          </div>
                        )}
                        {viewDetailsEntry.capitalAssetCategory && (
                          <div>
                            <Label className="text-xs text-muted-foreground">{t("Asset Category", "संपत्ति श्रेणी")}</Label>
                            <p className="font-medium">{getAssetCategoryLabel(viewDetailsEntry.capitalAssetCategory)}</p>
                          </div>
                        )}
                      </div>
                    )}
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
                  
                  {viewDetailsEntry.aadhatName && (
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("Aadhtiya Name", "आढ़तिया का नाम")}</Label>
                      <p className="font-medium">{viewDetailsEntry.aadhatName}</p>
                    </div>
                  )}

                  {viewDetailsEntry.aadhatAllocations && viewDetailsEntry.aadhatAllocations.length > 0 && (
                    <div className="border-t pt-3">
                      <h4 className="font-semibold text-sm mb-2">{t("Payment Allocations", "भुगतान आवंटन")}</h4>
                      <div className="space-y-2">
                        {viewDetailsEntry.aadhatAllocations.map((alloc, idx) => {
                          const appliedAmt = parseFloat(alloc.appliedAmount || "0");
                          const discPct = parseFloat(alloc.discountPercent || "0");
                          const discAmt = parseFloat(alloc.discountAmount || "0");
                          const pettyAdj = parseFloat(alloc.pettyAdjustment || "0");
                          const totalSettled = appliedAmt + discAmt + pettyAdj;
                          return (
                            <div key={idx} className="p-2 bg-muted rounded-md text-sm" data-testid={`alloc-detail-${idx}`}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold">
                                  {alloc.isPyPayable ? t("PY Payable", "पिछला शेष") : `SR #${alloc.serialNumber || "?"}`}
                                </span>
                                <span className="font-semibold">₹{totalSettled.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                                <span>{t("Cash", "नकद")}: ₹{appliedAmt.toLocaleString("en-IN")}</span>
                                <span>{t("Disc", "छूट")}: {discPct}% (₹{discAmt.toLocaleString("en-IN")})</span>
                                <span className={cn(pettyAdj > 50 ? "text-red-600" : pettyAdj > 1 ? "text-orange-600" : "")}>
                                  {t("Petty", "पेटी")}: ₹{pettyAdj.toLocaleString("en-IN")}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {viewDetailsEntry.direction === "transfer" && (
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-sm mb-2">{t("Transfer Details", "ट्रांसफर विवरण")}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("From Account", "स्रोत खाता")}</Label>
                      <p className="font-medium">
                        {viewDetailsEntry.fromAccountType === "cash_in_hand" 
                          ? t("Cash in Hand", "हाथ में नकद") 
                          : (viewDetailsEntry.fromBankAccountName || t("Bank Account", "बैंक खाता"))}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("To Account", "गंतव्य खाता")}</Label>
                      <p className="font-medium">
                        {viewDetailsEntry.toAccountType === "cash_in_hand" 
                          ? t("Cash in Hand", "हाथ में नकद") 
                          : (viewDetailsEntry.toBankAccountName || t("Bank Account", "बैंक खाता"))}
                      </p>
                    </div>
                  </div>
                </div>
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
            onClick={() => setSettingsOpen(true)}
            title={t("Settings", "सेटिंग्स")}
            data-testid="button-cash-settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      {/* Summary Cards - Order: Cash Received, Cash Expense, Net Cash in Hand, Account Received, Account Expense, Net in Accounts */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-green-300 dark:border-green-700" data-testid="card-cash-received">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Banknote className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Cash Received", "नकद प्राप्त")}</span>
            </div>
            <p className="text-base font-bold text-green-600">₹{totalCashReceived.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
          </CardContent>
        </Card>

        <Card className="border-amber-300 dark:border-amber-700" data-testid="card-cash-expense">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Cash Expense", "नकद खर्च")}</span>
            </div>
            <p className="text-base font-bold text-amber-600">₹{totalCashExpense.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
          </CardContent>
        </Card>

        <Card className="border-teal-300 dark:border-teal-700" data-testid="card-net-cash">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-teal-600 mb-1">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Net Cash in Hand", "हाथ में शुद्ध नकद")}</span>
            </div>
            <p className={`text-base font-bold ${netCashInHand >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
              ₹{netCashInHand.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-300 dark:border-blue-700" data-testid="card-account-received">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Account Received", "खाते में प्राप्त")}</span>
            </div>
            <p className="text-base font-bold text-blue-600">₹{totalAccountReceived.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
            {accountWiseBreakdown.length > 0 && (
              <div className="mt-2 pt-2 border-t border-blue-200 space-y-1">
                {accountWiseBreakdown.filter(a => a.inward > 0).map(account => (
                  <div key={account.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[100px]" title={account.name}>{account.name}</span>
                    <span className="text-blue-600 font-medium">₹{account.inward.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                  </div>
                ))}
                {unassignedAccountReceived > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground italic">{t("Unassigned", "अनिर्दिष्ट")}</span>
                    <span className="text-blue-600 font-medium">₹{unassignedAccountReceived.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-orange-300 dark:border-orange-700" data-testid="card-account-expense">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <CreditCard className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Account Expense", "खाता खर्च")}</span>
            </div>
            <p className="text-base font-bold text-orange-600">₹{totalAccountExpense.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
            {accountWiseBreakdown.length > 0 && (
              <div className="mt-2 pt-2 border-t border-orange-200 space-y-1">
                {accountWiseBreakdown.filter(a => a.outflow > 0).map(account => (
                  <div key={account.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[100px]" title={account.name}>{account.name}</span>
                    <span className="text-orange-600 font-medium">₹{account.outflow.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                  </div>
                ))}
                {unassignedAccountExpense > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground italic">{t("Unassigned", "अनिर्दिष्ट")}</span>
                    <span className="text-orange-600 font-medium">₹{unassignedAccountExpense.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-indigo-300 dark:border-indigo-700" data-testid="card-net-account">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-indigo-600 mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-medium">{t("Net in Accounts", "खातों में शुद्ध")}</span>
            </div>
            <p className={`text-base font-bold ${netCashInAccount >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
              ₹{netCashInAccount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
            </p>
            {accountWiseBreakdown.length > 0 && (
              <div className="mt-2 pt-2 border-t border-indigo-200 space-y-1">
                {accountWiseBreakdown.map(account => (
                  <div key={account.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[100px]" title={account.name}>{account.name}</span>
                    <span className={`font-medium ${account.net >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                      ₹{account.net.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </span>
                  </div>
                ))}
                {(unassignedAccountReceived > 0 || unassignedAccountExpense > 0 || legacyOpeningCashInAccount > 0) && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground italic">{t("Unassigned", "अनिर्दिष्ट")}</span>
                    <span className={`font-medium ${unassignedAccountNet >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                      ₹{unassignedAccountNet.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Select value={filterDirection} onValueChange={setFilterDirection}>
              <SelectTrigger data-testid="filter-direction" className="h-9">
                <SelectValue placeholder={t("Direction", "दिशा")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All", "सभी")}</SelectItem>
                <SelectItem value="inward">{t("Inward Cash", "आवक नकद")}</SelectItem>
                <SelectItem value="outflow">{t("Expense", "व्यय")}</SelectItem>
                <SelectItem value="transfer">{t("Transfer", "ट्रांसफर")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterExpenseCategory} onValueChange={(val) => { setFilterExpenseCategory(val); setFilterExpenseType(""); }}>
              <SelectTrigger data-testid="filter-expense-category" className="h-9">
                <SelectValue placeholder={t("Expense Category", "व्यय श्रेणी")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All", "सभी")}</SelectItem>
                <SelectItem value="revenue">{t("Revenue Expense", "राजस्व व्यय")}</SelectItem>
                <SelectItem value="capital">{t("Capital Expense", "पूंजीगत व्यय")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterPartyName} onValueChange={setFilterPartyName}>
              <SelectTrigger data-testid="filter-buyer-name" className="h-9">
                <SelectValue placeholder={t("Buyer Name", "खरीदार का नाम")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Buyers", "सभी खरीदार")}</SelectItem>
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
                {filterExpenseCategory === "capital"
                  ? ASSET_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{getAssetCategoryLabel(cat)}</SelectItem>
                  ))
                  : (filterExpenseCategory === "revenue"
                    ? EXPENSE_TYPES.filter(type => type !== "capital_expense")
                    : EXPENSE_TYPES
                  ).map((type) => (
                    <SelectItem key={type} value={type}>{getExpenseTypeLabel(type)}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <Popover open={farmerFilterPopoverOpen} onOpenChange={setFarmerFilterPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={farmerFilterPopoverOpen}
                  className={cn(
                    "justify-between font-normal text-sm h-9 w-full",
                    !filterFarmerName && "text-muted-foreground"
                  )}
                  data-testid="filter-farmer-name"
                >
                  <span className="truncate">
                    {filterFarmerName || t("Farmer Name", "किसान का नाम")}
                  </span>
                  <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0">
                <Command>
                  <CommandInput placeholder={t("Search farmer...", "किसान खोजें...")} />
                  <CommandList>
                    <CommandEmpty>{t("No farmer found.", "कोई किसान नहीं मिला।")}</CommandEmpty>
                    <CommandGroup>
                      {uniqueFarmerOptions.map((farmer) => (
                        <CommandItem
                          key={farmer.id}
                          value={farmer.name}
                          onSelect={() => {
                            if (filterFarmerId === farmer.id) {
                              setFilterFarmerName("");
                              setFilterFarmerId(null);
                            } else {
                              setFilterFarmerName(farmer.name);
                              setFilterFarmerId(farmer.id);
                            }
                            setFarmerFilterPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${filterFarmerId === farmer.id ? "opacity-100" : "opacity-0"}`}
                          />
                          <div className="flex flex-col flex-1">
                            <span className="font-medium">{farmer.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {farmer.contact || ""}
                              {farmer.contact && farmer.village && " • "}
                              {farmer.village || ""}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Select value={filterSupplierName} onValueChange={setFilterSupplierName}>
              <SelectTrigger data-testid="filter-supplier-name" className="h-9">
                <SelectValue placeholder={t("Supplier Name", "आपूर्तिकर्ता का नाम")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Suppliers", "सभी आपूर्तिकर्ता")}</SelectItem>
                {uniqueSupplierNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="col-span-2 md:col-span-1 grid grid-cols-3 gap-2">
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

              <MultiDayFilter selectedDays={filterDays} onSelectedDaysChange={setFilterDays} />
            </div>

            <Input
              placeholder={t("Remarks", "टिप्पणी")}
              value={filterRemarks}
              onChange={(e) => setFilterRemarks(e.target.value)}
              className="h-9 col-span-2 md:col-span-1"
              data-testid="filter-remarks"
            />
          </div>

          {/* Filtered Summary */}
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{t("Filtered Total", "फ़िल्टर्ड कुल")}:</span>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400">
                {t("Inflow", "आवक")}: ₹{filteredInflow.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
              </Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400">
                {t("Outflow", "बहिर्वाह")}: ₹{filteredOutflow.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
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
                            <SelectItem value="cheque_received">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                {t("Cheque Received", "चेक प्राप्त")}
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {(receiptType === "account_received" || receiptType === "cheque_received") && bankAccounts.length > 0 && (
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

                  {(receiptType === "account_received" || receiptType === "cheque_received") && bankAccounts.length === 0 && (
                    <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                      {t("No bank accounts configured. Add accounts in Settings.", "कोई बैंक खाता कॉन्फ़िगर नहीं है। सेटिंग्स में खाते जोड़ें।")}
                    </div>
                  )}

                  {receiptType === "cheque_received" && (
                    <FormField
                      control={inwardForm.control}
                      name="chequeNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Cheque Number", "चेक नंबर")} *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t("Enter cheque number", "चेक नंबर दर्ज करें")} data-testid="input-inward-cheque-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                          inwardForm.setValue("sundryPayName", "");
                          inwardForm.setValue("sundryPayDbId", undefined);
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
                                {t("Harvest", "हार्वेस्ट")}
                              </div>
                            </SelectItem>
                            <SelectItem value="seed_sale">
                              <div className="flex items-center gap-2">
                                <Leaf className="h-4 w-4" />
                                {t("Seed Sale", "बीज बिक्री")}
                              </div>
                            </SelectItem>
                            <SelectItem value="sundry_pay">
                              <div className="flex items-center gap-2">
                                <HandCoins className="h-4 w-4" />
                                {t("Sundry Pay Recovery", "सन्ड्री पे वसूली")}
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
                          <FormLabel>{t("Buyer Name", "खरीदार का नाम")} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-party-name">
                                {field.value ? (() => {
                                  const p = mergedPartiesForRawPotato.find(p => p.name === field.value);
                                  return <span>{p?.name || field.value}{p && p.overallDue > 0 ? ` — ${t("Due", "बकाया")}: ₹${p.overallDue.toLocaleString('en-IN')}` : ""}</span>;
                                })() : <SelectValue placeholder={t("Select Buyer", "खरीदार चुनें")} />}
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {mergedPartiesForRawPotato.map((party, idx) => {
                                return (
                                  <SelectItem key={`party-${idx}`} value={party.name}>
                                    <div className="flex items-center justify-between gap-4">
                                      <span>{party.name}</span>
                                      {party.address && (
                                        <span className="text-xs text-muted-foreground">({party.address})</span>
                                      )}
                                      <Badge variant="secondary">
                                        {t("Due", "बकाया")}: ₹{parseFloat(party.overallDue.toFixed(1)).toLocaleString('en-IN')}
                                      </Badge>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {revenueType === "raw_potato" && selectedBuyerDbId && buyerPendingData && (
                    <div className="space-y-3" data-testid="buyer-allocation-section">
                      <div>
                        <Label className="text-sm font-medium">{t("Select Transactions to Allocate", "आवंटित करने के लिए लेन-देन चुनें")}</Label>
                        <Popover open={buyerEntryPickerOpen} onOpenChange={setBuyerEntryPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn("w-full justify-between mt-1", buyerAllocations.length === 0 && "text-muted-foreground")}
                              data-testid="button-pick-buyer-entries"
                            >
                              {buyerAllocations.length > 0
                                ? `${buyerAllocations.length} ${t("transactions selected", "लेन-देन चयनित")}`
                                : t("Select pending transactions...", "बकाया लेन-देन चुनें...")}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command>
                              <CommandInput placeholder={t("Search transactions...", "लेन-देन खोजें...")} />
                              <CommandList>
                                <CommandEmpty>{t("No pending transactions found", "कोई बकाया लेन-देन नहीं मिला")}</CommandEmpty>
                                <CommandGroup>
                                  {buyerPendingData.pyBalance > 0 && (
                                    <CommandItem
                                      value="py-balance"
                                      onSelect={() => toggleBuyerEntry({ isPyBalance: true, dueAmount: buyerPendingData.pyBalance })}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", buyerAllocations.some(a => a.isPyBalance) ? "opacity-100" : "opacity-0")} />
                                      <div className="flex items-center justify-between gap-2 w-full">
                                        <span className="font-medium">{t("PY Balance", "पीवाई शेष")}</span>
                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 shrink-0">
                                          ₹{buyerPendingData.pyBalance.toLocaleString('en-IN')}
                                        </Badge>
                                      </div>
                                    </CommandItem>
                                  )}
                                  {[...buyerPendingData.pendingEntries].sort((a, b) => a.transactionNumber - b.transactionNumber).map((entry) => {
                                    const isSelected = buyerAllocations.some(a => a.transactionId === entry.transactionId);
                                    return (
                                      <CommandItem
                                        key={entry.transactionId}
                                        value={`Tnx ${entry.transactionNumber} ${entry.crop} ${entry.dateOfLoading}`}
                                        onSelect={() => toggleBuyerEntry(entry)}
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                        <div className="flex items-center justify-between gap-2 w-full text-xs">
                                          <span className="font-medium">Tnx #{entry.transactionNumber}</span>
                                          <span className="text-muted-foreground">{entry.crop}</span>
                                          <span className="text-muted-foreground">{entry.dateOfLoading ? format(new Date(entry.dateOfLoading), "dd/MM/yy") : "?"}</span>
                                          <span className="text-muted-foreground">{entry.totalBags}B</span>
                                          <span className="text-muted-foreground">{entry.daysSinceLoading ?? entry.daysSince}d</span>
                                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 shrink-0">
                                            ₹{entry.dueAmount.toLocaleString('en-IN')}
                                          </Badge>
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

                      {buyerAllocations.length > 0 && (
                        <div className="space-y-3">
                          {buyerAllocations.map((alloc, idx) => {
                            const totalSettled = (alloc.amount || 0) + (alloc.pettyAdjustment || 0);
                            const overLimit = totalSettled > alloc.dueAmount + 0.01;
                            return (
                              <Card key={alloc.transactionId || 'py'} className={cn(overLimit && "border-red-400")} data-testid={`card-buyer-alloc-${idx}`}>
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium truncate">{alloc.label}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400">
                                        {t("Due", "बकाया")}: ₹{alloc.dueAmount.toLocaleString('en-IN')}
                                      </Badge>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setBuyerAllocations(prev => prev.filter((_, i) => i !== idx))}
                                        data-testid={`button-remove-buyer-alloc-${idx}`}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label className="text-xs text-muted-foreground">{t("Amount", "राशि")} (₹)</Label>
                                      <DecimalInput
                                        value={alloc.amount}
                                        onValueChange={(v) => updateBuyerAllocation(idx, 'amount', v)}
                                        data-testid={`input-buyer-alloc-amount-${idx}`}
                                      />
                                    </div>
                                    <div>
                                      <Label className={cn("text-xs", (alloc.pettyAdjustment || 0) > 50 ? "text-red-600 font-semibold" : (alloc.pettyAdjustment || 0) > 1 ? "text-orange-600 font-semibold" : "text-muted-foreground")}>{t("Petty Adj", "पेटी")} (₹)</Label>
                                      <DecimalInput
                                        value={alloc.pettyAdjustment}
                                        onValueChange={(v) => updateBuyerAllocation(idx, 'pettyAdjustment', v)}
                                        className={cn((alloc.pettyAdjustment || 0) > 50 ? "border-red-400 text-red-600" : (alloc.pettyAdjustment || 0) > 1 ? "border-orange-400 text-orange-600" : "")}
                                        data-testid={`input-buyer-alloc-petty-${idx}`}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">{t("Total Settled", "कुल निपटान")}</span>
                                    <span className={cn("font-semibold", overLimit ? "text-red-600" : "text-foreground")}>
                                      ₹{totalSettled.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                      {overLimit && ` (${t("exceeds due", "बकाया से अधिक")})`}
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}

                          <div className="flex items-center justify-between p-3 bg-muted rounded-md" data-testid="buyer-grand-total">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{t("Grand Total (Cash)", "कुल योग (नकद)")}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-primary"
                                onClick={() => setBuyerCalcOpen(true)}
                                title="Calculator"
                                data-testid="buyer-calc-open"
                              >
                                <Calculator className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <span className="font-bold text-lg">₹{buyerGrandTotalCash.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                          </div>
                          <CalcDialog open={buyerCalcOpen} onOpenChange={setBuyerCalcOpen} />
                          {buyerGrandTotalPetty > 0 && (
                            <div className="flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-950/30 rounded-md" data-testid="buyer-petty-total">
                              <span className="text-sm text-orange-700 dark:text-orange-400">{t("Total Petty Adj", "कुल पेटी समायोजन")}</span>
                              <span className="font-semibold text-orange-700 dark:text-orange-400">₹{buyerGrandTotalPetty.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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
                                      ? (() => {
                                          const f = ledgerFarmers.find(f => f.name === field.value);
                                          const due = f ? Math.abs(Math.min(f.netDue, 0)) : 0;
                                          return due > 0
                                            ? `${f?.name || field.value} — ${t("Due", "बकाया")}: ₹${due.toLocaleString('en-IN')}`
                                            : f?.name || field.value;
                                        })()
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
                                      {ledgerFarmers
                                        .filter(f => !f.isArchived)
                                        .filter(f => f.netDue < 0)
                                        .map((farmer) => {
                                          const amountOwedToUs = Math.abs(farmer.netDue);
                                          return (
                                            <CommandItem
                                              key={farmer.id}
                                              value={`${farmer.name} ${farmer.village || ""} ${farmer.contact || ""}`}
                                              onSelect={() => {
                                                field.onChange(farmer.name);
                                                setSeedFarmerPopoverOpen(false);
                                              }}
                                            >
                                              <Check
                                                className={cn(
                                                  "mr-2 h-4 w-4",
                                                  field.value === farmer.name ? "opacity-100" : "opacity-0"
                                                )}
                                              />
                                              <div className="flex flex-col flex-1">
                                                <span className="font-medium">{farmer.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                  {farmer.contact || ""}
                                                  {farmer.contact && farmer.village && " • "}
                                                  {farmer.village || ""}
                                                </span>
                                              </div>
                                              <Badge variant="secondary" className="ml-2">
                                                {t("Due", "बकाया")}: ₹{parseFloat(amountOwedToUs.toFixed(1)).toLocaleString('en-IN')}
                                              </Badge>
                                            </CommandItem>
                                          );
                                        })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                    </>
                  )}

                  {revenueType === "sundry_pay" && (
                    <FormField
                      control={inwardForm.control}
                      name="sundryPayName"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>{t("Sundry Pay Name", "सन्ड्री पे नाम")} *</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "w-full justify-between",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  data-testid="select-sundry-pay-name-inward"
                                >
                                  {field.value
                                    ? (() => {
                                        const s = sundryPayStakeholders.find(s => s.name === field.value);
                                        return s && s.totalDue > 0
                                          ? `${s.name} — ${t("Due", "बकाया")}: ₹${s.totalDue.toLocaleString('en-IN')}`
                                          : field.value;
                                      })()
                                    : t("Select stakeholder", "हितधारक चुनें")}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[350px] p-0" align="start">
                              <Command>
                                <CommandInput
                                  placeholder={t("Search stakeholder...", "हितधारक खोजें...")}
                                />
                                <CommandList>
                                  <CommandEmpty>{t("No stakeholder found.", "कोई हितधारक नहीं मिला।")}</CommandEmpty>
                                  <CommandGroup>
                                    {sundryPayStakeholders.filter(s => s.isActive).map((stakeholder) => (
                                      <CommandItem
                                        key={stakeholder.id}
                                        value={`${stakeholder.name} ${stakeholder.address || ""}`}
                                        onSelect={() => {
                                          field.onChange(stakeholder.name);
                                          inwardForm.setValue("sundryPayDbId", stakeholder.id);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value === stakeholder.name ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <div className="flex flex-col flex-1">
                                          <span className="font-medium">{stakeholder.name}</span>
                                          {stakeholder.address && (
                                            <span className="text-xs text-muted-foreground">{stakeholder.address}</span>
                                          )}
                                        </div>
                                        {stakeholder.totalDue > 0 && (
                                          <Badge variant="secondary" className="ml-2">
                                            {t("Due", "बकाया")}: ₹{stakeholder.totalDue.toLocaleString('en-IN')}
                                          </Badge>
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
                  )}

                  {revenueType !== "raw_potato" && (
                    <FormField
                      control={inwardForm.control}
                      name="amount"
                      render={({ field }) => {
                        const currentDue = revenueType === "seed_sale" ? inwardSeedFarmerDue : 0;
                        return (
                          <FormItem>
                            <FormLabel>
                              {t("Amount", "राशि")} (₹) *
                              {currentDue > 0 && (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  ({t("Max", "अधिकतम")}: ₹{currentDue.toLocaleString('en-IN')})
                                </span>
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="0" min="0" max={currentDue > 0 ? currentDue : undefined} {...field} data-testid="input-amount" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  )}

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
                          <Input placeholder={t("Remarks", "टिप्पणी")} {...field} data-testid="input-remarks" />
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
                    name="expenseCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Expense Category", "व्यय श्रेणी")} *</FormLabel>
                        <div className="flex gap-2" data-testid="expense-category-toggle">
                          <Button
                            type="button"
                            variant={field.value === "revenue" ? "default" : "outline"}
                            className="flex-1"
                            onClick={() => {
                              field.onChange("revenue");
                              outflowForm.setValue("capitalAssetName", "");
                              outflowForm.setValue("capitalAssetCategory", "");
                              outflowForm.setValue("capitalDepreciationRate", "" as unknown as number);
                            }}
                            data-testid="btn-revenue-expense"
                          >
                            {t("Revenue Expense", "राजस्व व्यय")}
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === "capital" ? "default" : "outline"}
                            className="flex-1"
                            onClick={() => {
                              field.onChange("capital");
                              outflowForm.setValue("expenseType", "");
                            }}
                            data-testid="btn-capital-expense"
                          >
                            {t("Capital Expense", "पूंजीगत व्यय")}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {expenseCategory === "capital" && (
                    <>
                      <FormField
                        control={outflowForm.control}
                        name="capitalAssetName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("Asset Name", "संपत्ति का नाम")} *</FormLabel>
                            <FormControl>
                              <Input placeholder={t("Enter asset name", "संपत्ति का नाम दर्ज करें")} {...field} data-testid="input-capital-asset-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={outflowForm.control}
                        name="capitalAssetCategory"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("Asset Category", "संपत्ति श्रेणी")} *</FormLabel>
                            <Select onValueChange={(val) => { field.onChange(val); outflowForm.setValue("capitalDepreciationRate", ASSET_DEPRECIATION_RATES[val] || 10); }} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-capital-asset-category">
                                  <SelectValue placeholder={t("Select category", "श्रेणी चुनें")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="building">{t("Building", "भवन")}</SelectItem>
                                <SelectItem value="plant_machinery">{t("Plant & Machinery", "यंत्र एवं मशीनरी")}</SelectItem>
                                <SelectItem value="furniture">{t("Furniture & Fixtures", "फर्नीचर एवं जुड़नार")}</SelectItem>
                                <SelectItem value="vehicle">{t("Vehicles", "वाहन")}</SelectItem>
                                <SelectItem value="computer">{t("Computers", "कंप्यूटर")}</SelectItem>
                                <SelectItem value="electrical_fittings">{t("Electrical Fittings", "विद्युत फिटिंग")}</SelectItem>
                                <SelectItem value="other">{t("Other", "अन्य")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {capitalAssetCategory && (
                        <FormField
                          control={outflowForm.control}
                          name="capitalDepreciationRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("Depreciation Rate", "मूल्यह्रास दर")} (% {t("per annum", "प्रति वर्ष")})</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.5" min="0" max="100" {...field} data-testid="input-depreciation-rate" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </>
                  )}

                  {expenseCategory !== "capital" && (
                  <FormField
                    control={outflowForm.control}
                    name="expenseType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Expense Type", "खर्च प्रकार")} *</FormLabel>
                        <Popover open={expenseTypePopoverOpen} onOpenChange={setExpenseTypePopoverOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                                data-testid="select-expense-type"
                              >
                                {field.value ? getExpenseTypeLabel(field.value) : t("Select expense type", "खर्च प्रकार चुनें")}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command>
                              <CommandInput placeholder={t("Search expense type...", "खर्च प्रकार खोजें...")} />
                              <CommandList>
                                <CommandEmpty>{t("No type found", "कोई प्रकार नहीं मिला")}</CommandEmpty>
                                <CommandGroup>
                                  {EXPENSE_TYPES.filter(type => type !== "capital_expense").map((type) => (
                                    <CommandItem
                                      key={type}
                                      value={getExpenseTypeLabel(type)}
                                      onSelect={() => {
                                        field.onChange(type);
                                        setExpenseTypePopoverOpen(false);
                                      }}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", field.value === type ? "opacity-100" : "opacity-0")} />
                                      {getExpenseTypeLabel(type)}
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
                  )}

                  {expenseType === "transport_freight" && (
                    <FormField
                      control={outflowForm.control}
                      name="freightTruckKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Pay Freight For", "किस ट्रक का भाड़ा")}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "others"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-freight-truck">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="others">{t("Others", "अन्य")}</SelectItem>
                              {outstandingFreightTrucks.map((truck) => {
                                const [y, m, d] = truck.dateOfLoading.split("-");
                                const label = [
                                  truck.transactionNumbers.length > 0
                                    ? `Tnx #${truck.transactionNumbers.join(", #")}`
                                    : null,
                                  d && m && y ? `${d}/${m}/${y}` : truck.dateOfLoading,
                                  truck.vehicleNumber || t("No vehicle no.", "वाहन नं. नहीं"),
                                  truck.transporterName,
                                ].filter(Boolean).join(" · ");
                                return (
                                  <SelectItem key={truck.key} value={truck.key}>
                                    {label} — ₹{truck.remainingFreight.toLocaleString('en-IN')} {t("left", "बाकी")}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {selectedFreightTruck && (
                            <p className="text-xs text-muted-foreground" data-testid="text-freight-remaining">
                              {t("Total freight", "कुल भाड़ा")} ₹{selectedFreightTruck.totalFreight.toLocaleString('en-IN')}
                              {" · "}
                              {t("Paid", "भुगतान")} ₹{selectedFreightTruck.paidAmount.toLocaleString('en-IN')}
                              {" · "}
                              {t("Remaining", "शेष")} ₹{selectedFreightTruck.remainingFreight.toLocaleString('en-IN')}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {expenseType === "aadhtiya" && (
                    <FormField
                      control={outflowForm.control}
                      name="aadhatName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Aadhtiya Name", "आढ़तिया का नाम")} *</FormLabel>
                          <Popover open={aadhatPopoverOpen} onOpenChange={setAadhatPopoverOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                                  data-testid="select-aadhat-name"
                                >
                                  {field.value || t("Select Aadhtiya", "आढ़तिया चुनें")}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0" align="start">
                              <Command>
                                <CommandInput placeholder={t("Search aadhtiya...", "आढ़तिया खोजें...")} />
                                <CommandList>
                                  <CommandEmpty>{t("No aadhtiya found with dues", "कोई बकाया आढ़तिया नहीं मिला")}</CommandEmpty>
                                  <CommandGroup>
                                    {aadhatsWithDues.map((aadhat) => {
                                      const shortAddr = aadhat.address.length > 25
                                        ? aadhat.address.substring(0, 25) + "..."
                                        : aadhat.address;
                                      return (
                                        <CommandItem
                                          key={aadhat.id}
                                          value={`${aadhat.name} ${aadhat.address}`}
                                          onSelect={() => {
                                            field.onChange(aadhat.name);
                                            outflowForm.setValue("aadhatDbId", aadhat.id);
                                            setAadhatPopoverOpen(false);
                                          }}
                                        >
                                          <Check className={cn("mr-2 h-4 w-4", field.value === aadhat.name ? "opacity-100" : "opacity-0")} />
                                          <div className="flex items-center justify-between gap-2 w-full">
                                            <span>{aadhat.name}</span>
                                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                              {shortAddr}
                                            </span>
                                            <Badge variant="secondary" className="shrink-0">
                                              {t("Due", "बकाया")}: ₹{aadhat.totalDue.toLocaleString('en-IN')}
                                            </Badge>
                                          </div>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {expenseType === "sundry_pay" && (
                    <FormField
                      control={outflowForm.control}
                      name="sundryPayName"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>{t("Stakeholder Name", "हितधारक का नाम")} *</FormLabel>
                          <Popover open={sundryPayPopoverOpen} onOpenChange={setSundryPayPopoverOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                                  data-testid="select-sundry-pay-name"
                                >
                                  {field.value
                                    ? (() => {
                                        const s = sundryPayStakeholders.find(s => s.name === field.value);
                                        return s && s.totalDue > 0
                                          ? `${s.name} — ${t("Due", "बकाया")}: ₹${s.totalDue.toLocaleString('en-IN')}`
                                          : field.value;
                                      })()
                                    : t("Search or type name", "खोजें या नाम लिखें")}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[350px] p-0" align="start">
                              <Command>
                                <CommandInput
                                  placeholder={t("Search or type new name...", "खोजें या नया नाम लिखें...")}
                                  onValueChange={(search) => {
                                    if (search) {
                                      const match = sundryPayStakeholders.find(s => s.name.toLowerCase() === search.toLowerCase());
                                      if (match) {
                                        field.onChange(match.name);
                                        outflowForm.setValue("sundryPayDbId", match.id);
                                      } else {
                                        field.onChange(search);
                                        outflowForm.setValue("sundryPayDbId", undefined);
                                      }
                                    }
                                  }}
                                  data-testid="input-sundry-pay-name"
                                />
                                <CommandList>
                                  <CommandEmpty>
                                    <div
                                      className="p-2 text-sm cursor-pointer hover:bg-accent rounded"
                                      onClick={() => setSundryPayPopoverOpen(false)}
                                    >
                                      {field.value
                                        ? t(`Use "${field.value}" (new stakeholder)`, `"${field.value}" का उपयोग करें (नया हितधारक)`)
                                        : t("Type a name to add new stakeholder", "नया हितधारक जोड़ने के लिए नाम लिखें")}
                                    </div>
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {sundryPayStakeholders.filter(s => s.isActive).map((stakeholder) => (
                                      <CommandItem
                                        key={stakeholder.id}
                                        value={stakeholder.name}
                                        onSelect={() => {
                                          field.onChange(stakeholder.name);
                                          outflowForm.setValue("sundryPayDbId", stakeholder.id);
                                          setSundryPayPopoverOpen(false);
                                        }}
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", field.value === stakeholder.name ? "opacity-100" : "opacity-0")} />
                                        <div className="flex items-center justify-between gap-2 w-full">
                                          <span>{stakeholder.name}</span>
                                          {stakeholder.totalDue > 0 && (
                                            <Badge variant="secondary" className="shrink-0">
                                              {t("Due", "बकाया")}: ₹{stakeholder.totalDue.toLocaleString('en-IN')}
                                            </Badge>
                                          )}
                                        </div>
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
                  )}

                  {expenseType === "aadhtiya" && selectedAadhatDbId && aadhatPendingData && (
                    <div className="space-y-3" data-testid="aadhat-allocation-section">
                      <div>
                        <Label className="text-sm font-medium">{t("Select Entries to Allocate", "आवंटित करने के लिए प्रविष्टियाँ चुनें")}</Label>
                        <Popover open={aadhatEntryPickerOpen} onOpenChange={setAadhatEntryPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn("w-full justify-between mt-1", aadhatAllocations.length === 0 && "text-muted-foreground")}
                              data-testid="button-pick-aadhat-entries"
                            >
                              {aadhatAllocations.length > 0
                                ? `${aadhatAllocations.length} ${t("entries selected", "प्रविष्टियाँ चयनित")}`
                                : t("Select pending entries...", "बकाया प्रविष्टियाँ चुनें...")}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command>
                              <CommandInput placeholder={t("Search entries...", "प्रविष्टियाँ खोजें...")} />
                              <CommandList>
                                <CommandEmpty>{t("No pending entries found", "कोई बकाया प्रविष्टि नहीं मिली")}</CommandEmpty>
                                <CommandGroup>
                                  {aadhatPendingData.pyPayable > 0 && (
                                    <CommandItem
                                      value="py-payable"
                                      onSelect={() => toggleAadhatEntry({ isPyPayable: true, dueAmount: aadhatPendingData.pyPayable })}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", aadhatAllocations.some(a => a.isPyPayable) ? "opacity-100" : "opacity-0")} />
                                      <div className="flex items-center justify-between gap-2 w-full">
                                        <span className="font-medium">{t("PY Payable", "पीवाई देय")}</span>
                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 shrink-0">
                                          ₹{aadhatPendingData.pyPayable.toLocaleString('en-IN')}
                                        </Badge>
                                      </div>
                                    </CommandItem>
                                  )}
                                  {[...aadhatPendingData.pendingEntries].sort((a, b) => a.serialNumber - b.serialNumber).map((entry) => {
                                    const daysSince = Math.floor((Date.now() - new Date(entry.purchaseDate).getTime()) / (1000 * 60 * 60 * 24));
                                    const isSelected = aadhatAllocations.some(a => a.stockEntryId === entry.stockEntryId);
                                    return (
                                      <CommandItem
                                        key={entry.stockEntryId}
                                        value={`SR ${entry.serialNumber} ${entry.crop} ${entry.purchaseDate}`}
                                        onSelect={() => toggleAadhatEntry(entry)}
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                        <div className="flex items-center justify-between gap-2 w-full text-xs">
                                          <span className="font-medium">SR #{entry.serialNumber}</span>
                                          <span className="text-muted-foreground">{entry.crop}</span>
                                          <span className="text-muted-foreground">{format(new Date(entry.purchaseDate), "dd/MM/yy")}</span>
                                          <span className="text-muted-foreground">{entry.totalBags}B</span>
                                          <span className="text-muted-foreground">{daysSince}d</span>
                                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 shrink-0">
                                            ₹{entry.dueAmount.toLocaleString('en-IN')}
                                          </Badge>
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

                      {aadhatAllocations.length > 0 && (
                        <div className="space-y-3">
                          {aadhatAllocations.map((alloc, idx) => {
                            const totalSettled = (alloc.amount || 0) + (alloc.discountAmount || 0) + (alloc.pettyAdjustment || 0);
                            const overLimit = totalSettled > alloc.dueAmount + 0.01;
                            return (
                              <Card key={alloc.stockEntryId || 'py'} className={cn(overLimit && "border-red-400")} data-testid={`card-aadhat-alloc-${idx}`}>
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium truncate">{alloc.label}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400">
                                        {t("Due", "बकाया")}: ₹{alloc.dueAmount.toLocaleString('en-IN')}
                                      </Badge>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setAadhatAllocations(prev => prev.filter((_, i) => i !== idx))}
                                        data-testid={`button-remove-alloc-${idx}`}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <Label className="text-xs text-muted-foreground">{t("Amount", "राशि")} (₹)</Label>
                                      <DecimalInput
                                        value={alloc.amount}
                                        onValueChange={(v) => updateAadhatAllocation(idx, 'amount', v)}
                                        data-testid={`input-alloc-amount-${idx}`}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">{t("Discount", "छूट")} %</Label>
                                      <DecimalInput
                                        value={alloc.discountPercent}
                                        onValueChange={(v) => updateAadhatAllocation(idx, 'discountPercent', v)}
                                        data-testid={`input-alloc-discount-${idx}`}
                                      />
                                      {alloc.discountAmount > 0 && (
                                        <span className="text-xs text-muted-foreground">= ₹{alloc.discountAmount.toLocaleString('en-IN')}</span>
                                      )}
                                    </div>
                                    <div>
                                      <Label className={cn("text-xs", (alloc.pettyAdjustment || 0) > 50 ? "text-red-600 font-semibold" : (alloc.pettyAdjustment || 0) > 1 ? "text-orange-600 font-semibold" : "text-muted-foreground")}>{t("Petty Adj", "पेटी")} (₹)</Label>
                                      <DecimalInput
                                        value={alloc.pettyAdjustment}
                                        onValueChange={(v) => updateAadhatAllocation(idx, 'pettyAdjustment', v)}
                                        className={cn((alloc.pettyAdjustment || 0) > 50 ? "border-red-400 text-red-600" : (alloc.pettyAdjustment || 0) > 1 ? "border-orange-400 text-orange-600" : "")}
                                        data-testid={`input-alloc-petty-${idx}`}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">{t("Total Settled", "कुल निपटान")}</span>
                                    <span className={cn("font-semibold", overLimit ? "text-red-600" : "text-foreground")}>
                                      ₹{totalSettled.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                      {overLimit && ` (${t("exceeds due", "बकाया से अधिक")})`}
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}

                          <div className="flex items-center justify-between p-3 bg-muted rounded-md" data-testid="aadhat-grand-total">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{t("Grand Total (Cash)", "कुल योग (नकद)")}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-primary"
                                onClick={() => setAadhatCalcOpen(true)}
                                title="Calculator"
                                data-testid="aadhat-calc-open"
                              >
                                <Calculator className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <span className="font-bold text-lg">₹{aadhatGrandTotalCash.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                          </div>
                          <CalcDialog open={aadhatCalcOpen} onOpenChange={setAadhatCalcOpen} />
                        </div>
                      )}
                    </div>
                  )}

                  {expenseType === "farmer" && (
                    <>
                      <FormField
                        control={outflowForm.control}
                        name="farmerName"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>{t("Farmer Name", "किसान का नाम")} *</FormLabel>
                            <Popover open={expenseFarmerPopoverOpen} onOpenChange={setExpenseFarmerPopoverOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                                    data-testid="select-farmer-name"
                                  >
                                    {field.value ? (() => {
                                      const f = ledgerFarmers.find(f => f.name === field.value);
                                      const due = f && f.netDue > 0 ? f.netDue : 0;
                                      return due > 0
                                        ? `${f?.name || field.value} — ${t("Due", "बकाया")}: ₹${due.toLocaleString('en-IN')}`
                                        : f?.name || field.value;
                                    })() : t("Select Farmer", "किसान चुनें")}
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
                                      {ledgerFarmers
                                        .filter(f => !f.isArchived)
                                        .filter(f => f.netDue > 0)
                                        .map((farmer) => (
                                          <CommandItem
                                            key={farmer.id}
                                            value={`${farmer.name} ${farmer.village || ""} ${farmer.contact || ""}`}
                                            onSelect={() => {
                                              field.onChange(farmer.name);
                                              setExpenseFarmerPopoverOpen(false);
                                            }}
                                          >
                                            <Check className={cn("mr-2 h-4 w-4", field.value === farmer.name ? "opacity-100" : "opacity-0")} />
                                            <div className="flex flex-col flex-1">
                                              <span className="font-medium">{farmer.name}</span>
                                              <span className="text-xs text-muted-foreground">
                                                {farmer.contact || ""}
                                                {farmer.contact && farmer.village && " • "}
                                                {farmer.village || ""}
                                              </span>
                                            </div>
                                            <Badge variant="secondary" className="ml-2">
                                              {t("Due", "बकाया")}: ₹{parseFloat(farmer.netDue.toFixed(1)).toLocaleString('en-IN')}
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
                      
                    </>
                  )}

                  {(expenseType === "farmer_advance" || expenseType === "farmer_freight" || expenseType === "farmer_others") && (
                    <FormField
                      control={outflowForm.control}
                      name="farmerName"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>{t("Farmer Name", "किसान का नाम")} *</FormLabel>
                          <Popover open={expenseFarmerPopoverOpen} onOpenChange={setExpenseFarmerPopoverOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                                  data-testid="select-farmer-name-expense"
                                >
                                  {field.value
                                    ? ledgerFarmers.find(f => f.name === field.value)?.name || field.value
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
                                    {ledgerFarmers
                                      .filter(f => !f.isArchived)
                                      .map((farmer) => (
                                        <CommandItem
                                          key={farmer.id}
                                          value={`${farmer.name} ${farmer.village || ""} ${farmer.contact || ""}`}
                                          onSelect={() => {
                                            field.onChange(farmer.name);
                                            setExpenseFarmerPopoverOpen(false);
                                          }}
                                        >
                                          <Check className={cn("mr-2 h-4 w-4", field.value === farmer.name ? "opacity-100" : "opacity-0")} />
                                          <div className="flex flex-col flex-1">
                                            <span className="font-medium">{farmer.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {farmer.contact || ""}
                                              {farmer.contact && farmer.village && " • "}
                                              {farmer.village || ""}
                                            </span>
                                          </div>
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
                                {field.value ? (() => {
                                  const cs = coldStores.find(s => s.coldStoreName === field.value);
                                  return <span>{cs?.coldStoreName || field.value}{cs && cs.totalDue > 0 ? ` — ${t("Due", "बकाया")}: ₹${cs.totalDue.toLocaleString('en-IN')}` : ""}</span>;
                                })() : <SelectValue placeholder={t("Select Cold Store", "शीत भंडार चुनें")} />}
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {coldStores.map((store) => (
                                <SelectItem key={store.coldStoreName} value={store.coldStoreName}>
                                  <div className="flex items-center justify-between gap-4">
                                    <span>{store.coldStoreName}</span>
                                    <Badge variant="secondary">
                                      {t("Due", "बकाया")}: ₹{parseFloat(store.totalDue.toFixed(1)).toLocaleString('en-IN')}
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

                  {expenseType === "cold_store_charge" && selectedColdStoreDbId && coldStorePendingData && (
                    <div className="space-y-3" data-testid="cold-store-allocation-section">
                      <div>
                        <Label className="text-sm font-medium">{t("Select Lots to Allocate", "आवंटित करने के लिए लॉट चुनें")}</Label>
                        <Popover open={coldStoreEntryPickerOpen} onOpenChange={setColdStoreEntryPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn("w-full justify-between mt-1", coldStoreAllocations.length === 0 && "text-muted-foreground")}
                              data-testid="button-pick-cold-store-entries"
                            >
                              {coldStoreAllocations.length > 0
                                ? `${coldStoreAllocations.length} ${t("lots selected", "लॉट चयनित")}`
                                : t("Select pending lots...", "बकाया लॉट चुनें...")}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command>
                              <CommandInput placeholder={t("Search lots...", "लॉट खोजें...")} />
                              <CommandList>
                                <CommandEmpty>{t("No pending lots found", "कोई बकाया लॉट नहीं मिला")}</CommandEmpty>
                                <CommandGroup>
                                  {coldStorePendingData.pyPayable > 0 && (
                                    <CommandItem
                                      value="py-payable"
                                      onSelect={() => toggleColdStoreEntry({ isPyPayable: true, dueAmount: coldStorePendingData.pyPayable })}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", coldStoreAllocations.some(a => a.isPyPayable) ? "opacity-100" : "opacity-0")} />
                                      <div className="flex items-center justify-between gap-2 w-full">
                                        <span className="font-medium">{t("PY Payable", "पीवाई देय")}</span>
                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 shrink-0">
                                          ₹{coldStorePendingData.pyPayable.toLocaleString('en-IN')}
                                        </Badge>
                                      </div>
                                    </CommandItem>
                                  )}
                                  {coldStorePendingData.pendingCharges.map((charge) => {
                                    const isSelected = coldStoreAllocations.some(a =>
                                      (charge.lotId && a.lotId === charge.lotId) ||
                                      (charge.seedLotId && a.seedLotId === charge.seedLotId)
                                    );
                                    return (
                                      <CommandItem
                                        key={charge.lotId ? `lot-${charge.lotId}` : `seed-${charge.seedLotId}`}
                                        value={`SR ${charge.serialNumber} ${charge.sourceType} ${charge.lotNumber || ""}`}
                                        onSelect={() => toggleColdStoreEntry(charge)}
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                        <div className="flex items-center justify-between gap-2 w-full text-xs">
                                          <span className="font-medium">SR #{charge.serialNumber}</span>
                                          <Badge variant={charge.sourceType === "Harvest" ? "default" : "secondary"} className="text-[10px] px-1 py-0">
                                            {charge.sourceType}
                                          </Badge>
                                          {charge.lotNumber && <span className="text-muted-foreground">{charge.lotNumber}</span>}
                                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 shrink-0">
                                            ₹{charge.dueAmount.toLocaleString('en-IN')}
                                          </Badge>
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

                      {coldStoreAllocations.length > 0 && (
                        <div className="space-y-3">
                          {coldStoreAllocations.map((alloc, idx) => {
                            const totalSettled = (alloc.amount || 0) + (alloc.pettyAdjustment || 0);
                            const overLimit = totalSettled > alloc.dueAmount + 0.01;
                            return (
                              <Card key={alloc.lotId || alloc.seedLotId || 'py'} className={cn(overLimit && "border-red-400")} data-testid={`card-cold-store-alloc-${idx}`}>
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium truncate">{alloc.label}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400">
                                        {t("Due", "बकाया")}: ₹{alloc.dueAmount.toLocaleString('en-IN')}
                                      </Badge>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setColdStoreAllocations(prev => prev.filter((_, i) => i !== idx))}
                                        data-testid={`button-remove-cs-alloc-${idx}`}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label className="text-xs text-muted-foreground">{t("Amount", "राशि")} (₹)</Label>
                                      <DecimalInput
                                        value={alloc.amount}
                                        onValueChange={(v) => updateColdStoreAllocation(idx, 'amount', v)}
                                        data-testid={`input-cs-alloc-amount-${idx}`}
                                      />
                                    </div>
                                    <div>
                                      <Label className={cn("text-xs", (alloc.pettyAdjustment || 0) > 50 ? "text-red-600 font-semibold" : (alloc.pettyAdjustment || 0) > 1 ? "text-orange-600 font-semibold" : "text-muted-foreground")}>{t("Petty Adj", "पेटी")} (₹)</Label>
                                      <DecimalInput
                                        value={alloc.pettyAdjustment}
                                        onValueChange={(v) => updateColdStoreAllocation(idx, 'pettyAdjustment', v)}
                                        className={cn((alloc.pettyAdjustment || 0) > 50 ? "border-red-400 text-red-600" : (alloc.pettyAdjustment || 0) > 1 ? "border-orange-400 text-orange-600" : "")}
                                        data-testid={`input-cs-alloc-petty-${idx}`}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">{t("Total Settled", "कुल निपटान")}</span>
                                    <span className={cn("font-semibold", overLimit ? "text-red-600" : "text-foreground")}>
                                      ₹{totalSettled.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                      {overLimit && ` (${t("exceeds due", "बकाया से अधिक")})`}
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}

                          <div className="flex items-center justify-between p-3 bg-muted rounded-md" data-testid="cold-store-grand-total">
                            <span className="font-semibold text-sm">{t("Grand Total (Cash)", "कुल योग (नकद)")}</span>
                            <span className="font-bold text-lg">₹{coldStoreGrandTotalCash.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )}
                    </div>
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
                                {field.value ? (() => {
                                  const sup = seedSuppliers.find(s => s.supplierName === field.value);
                                  return <span>{sup?.supplierName || field.value}{sup && sup.totalDue > 0 ? ` — ${t("Due", "बकाया")}: ₹${sup.totalDue.toLocaleString('en-IN')}` : ""}</span>;
                                })() : <SelectValue placeholder={t("Select Supplier", "आपूर्तिकर्ता चुनें")} />}
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
                                      {t("Due", "बकाया")}: ₹{parseFloat(supplier.totalDue.toFixed(1)).toLocaleString('en-IN')}
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
                            <SelectItem value="cheque">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                {t("Cheque", "चेक")}
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {(paymentMode === "account_transfer" || paymentMode === "cheque") && bankAccounts.length > 0 && (
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

                  {(paymentMode === "account_transfer" || paymentMode === "cheque") && bankAccounts.length === 0 && (
                    <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                      {t("No bank accounts configured. Add accounts in Settings.", "कोई बैंक खाता कॉन्फ़िगर नहीं है। सेटिंग्स में खाते जोड़ें।")}
                    </div>
                  )}

                  {paymentMode === "cheque" && (
                    <FormField
                      control={outflowForm.control}
                      name="chequeNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Cheque Number", "चेक नंबर")}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t("Enter cheque number", "चेक नंबर दर्ज करें")} data-testid="input-outflow-cheque-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {expenseType !== "aadhtiya" && expenseType !== "cold_store_charge" && (
                    <FormField
                      control={outflowForm.control}
                      name="amount"
                      render={({ field }) => {
                        const maxDue = expenseType === "farmer" ? outflowFarmerDue
                          : expenseType === "supplier" ? outflowSupplierDue
                          : expenseType === "transport_freight" ? (selectedFreightTruck?.remainingFreight || 0)
                          : 0;
                        return (
                          <FormItem>
                            <FormLabel>
                              {t("Amount", "राशि")} (₹) *
                              {maxDue > 0 && (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  ({t("Max", "अधिकतम")}: ₹{maxDue.toLocaleString('en-IN')})
                                </span>
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input type="number" step="any" placeholder="0" min="0" max={maxDue > 0 ? maxDue : undefined} {...field} data-testid="input-outflow-amount" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  )}

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

                  <div className={cn(expenseType === "aadhtiya" ? "flex gap-3 items-end" : "")}>
                    <FormField
                      control={outflowForm.control}
                      name="remarks"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>{t("Remarks", "टिप्पणी")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("Remarks", "टिप्पणी")} {...field} data-testid="input-outflow-remarks" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {expenseType === "aadhtiya" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="mb-0 shrink-0"
                        disabled={!outflowForm.watch("aadhatName") || aadhatGrandTotalCash <= 0}
                        onClick={handlePrintCheque}
                        data-testid="button-print-cheque"
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        {t("Print Check", "चेक प्रिंट")}
                      </Button>
                    )}
                  </div>

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
                          <Input type="number" step="any" placeholder="0" min="0" {...field} data-testid="input-transfer-amount" />
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
                          <Input placeholder={t("Remarks", "टिप्पणी")} {...field} data-testid="input-transfer-remarks" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full bg-purple-600 text-white"
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("Cash Flow History", "नकद प्रवाह इतिहास")}</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrintPDF}
              title={t("Download PDF", "PDF डाउनलोड करें")}
              data-testid="button-cash-print-pdf"
            >
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleDownloadCSV}
              title={t("Download CSV", "CSV डाउनलोड करें")}
              data-testid="button-cash-download"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
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
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/cold-stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhat-pending-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/cold-store-pending-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/buyer-pending-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/freight-outstanding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/aadhats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cold-store-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cold-stores/search"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sundry-pay"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
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
      case "cheque_received": return t("Cheque", "चेक");
      default: return type || "";
    }
  };

  const getExpenseTypeLabel = (type: string | null) => {
    switch (type) {
      case "aadhtiya": return t("Aadhtiya", "आढ़तिया");
      case "bag_charges": return t("Bag Charges", "बोरी शुल्क");
      case "cold_store_charge": return t("Cold Store", "शीत भंडार");
      case "farmer": return t("Farmer - Harvest", "किसान - फसल");
      case "farmer_advance": return t("Farmer Advance", "किसान अग्रिम");
      case "farmer_freight": return t("Farmer Freight", "किसान भाड़ा");
      case "farmer_others": return t("Farmer Others", "किसान अन्य");
      case "general_expense": return t("General", "सामान्य");
      case "grading": return t("Grading", "ग्रेडिंग");
      case "hammali": return t("Hammali", "हम्माली");
      case "kata_charges": return t("Kata Charges", "काटा शुल्क");
      case "mandi_commission": return t("Mandi Commission", "मण्डी कमीशन");
      case "pesticide_charges": return t("Pesticide Charges", "कीटनाशक शुल्क");
      case "salary": return t("Salary", "वेतन");
      case "supplier": return t("Supplier", "आपूर्तिकर्ता");
      case "transport_freight": return t("Transport/Freight", "परिवहन/भाड़ा");
      case "warehouse_charges": return t("Warehouse Charges", "गोदाम शुल्क");
      case "sundry_pay": return t("Sundry Pay", "सन्ड्री पे");
      default: return type || "";
    }
  };

  const getTransferLabel = () => {
    const fromLabel = entry.fromAccountType === "cash_in_hand" 
      ? t("Cash", "नकद") 
      : (entry.fromBankAccountName || t("Bank", "बैंक"));
    const toLabel = entry.toAccountType === "cash_in_hand" 
      ? t("Cash", "नकद") 
      : (entry.toBankAccountName || t("Bank", "बैंक"));
    return `${fromLabel} → ${toLabel}`;
  };

  return (
    <Card 
      className={cn(
        isTransfer 
          ? 'border-l-4 border-l-purple-500' 
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
              <RefreshCw className="h-4 w-4 text-purple-600 shrink-0" />
            ) : isInward ? (
              <ArrowDownLeft className="h-4 w-4 text-green-600 shrink-0" />
            ) : (
              <ArrowUpRight className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            <span className={cn("text-sm font-semibold truncate", isReversed && "line-through text-muted-foreground")} data-testid={`text-entry-name-${entry.id}`}>
              {isTransfer 
                ? getTransferLabel()
                : isInward 
                  ? (entry.partyName || entry.farmerName || entry.sundryPayName || t("Unknown", "अज्ञात"))
                  : (entry.farmerName || entry.coldStoreName || entry.supplierName || entry.aadhatName || entry.sundryPayName || entry.capitalAssetName || getExpenseTypeLabel(entry.expenseType))}
            </span>
            <Badge 
              variant="outline" 
              className={cn(
                `shrink-0`,
                isReversed 
                  ? "bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-600"
                  : isTransfer 
                    ? "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-600"
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
              "text-sm font-bold",
              isReversed ? "text-muted-foreground line-through" : isInward ? 'text-green-600' : 'text-amber-600'
            )}>
              {isInward ? '+' : '-'}₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
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
              {(entry.receiptType === "account_received" || entry.receiptType === "cheque_received") && entry.bankAccountName 
                ? entry.bankAccountName 
                : getReceiptTypeLabel(entry.receiptType)}
              {entry.receiptType === "cheque_received" && entry.chequeNumber ? ` #${entry.chequeNumber}` : ""}
            </Badge>
          )}
          {!isInward && !isTransfer && entry.paymentMode && (
            <Badge variant="secondary" className="text-xs py-0">
              {entry.paymentMode === "cash" ? t("Cash", "नकद") : (entry.bankAccountName || (entry.paymentMode === "cheque" ? t("Cheque", "चेक") : t("Account", "खाता")))}
              {entry.paymentMode === "cheque" && entry.chequeNumber ? ` #${entry.chequeNumber}` : ""}
            </Badge>
          )}
          {isTransfer && (
            <Badge variant="secondary" className="text-xs py-0">
              {t("Transfer", "ट्रांसफर")}
            </Badge>
          )}
          {isInward && totalApplied > 0 && !isReversed && (
            <span className="text-green-600">
              {t("Applied", "लागू")}: ₹{totalApplied.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
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
