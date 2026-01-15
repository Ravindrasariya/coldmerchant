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
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Banknote, Building2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RECEIPT_TYPES, EXPENSE_TYPES, PAYMENT_MODES } from "@shared/schema";

interface CashEntry {
  id: number;
  merchantId: number;
  direction: string;
  receiptType: string | null;
  expenseType: string | null;
  paymentMode: string | null;
  partyName: string | null;
  partyVillage: string | null;
  farmerName: string | null;
  farmerVillage: string | null;
  coldStoreName: string | null;
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

const inwardFormSchema = z.object({
  receiptType: z.string().min(1, "Receipt type is required"),
  partyName: z.string().min(1, "Party name is required"),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  entryDate: z.string().min(1, "Date is required"),
  remarks: z.string().optional(),
});

const outflowFormSchema = z.object({
  expenseType: z.string().min(1, "Expense type is required"),
  paymentMode: z.string().min(1, "Payment mode is required"),
  farmerName: z.string().optional(),
  coldStoreName: z.string().optional(),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  entryDate: z.string().min(1, "Date is required"),
  remarks: z.string().optional(),
});

type InwardFormValues = z.infer<typeof inwardFormSchema>;
type OutflowFormValues = z.infer<typeof outflowFormSchema>;

export function CashManagementTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"inward" | "outflow">("inward");

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

  const inwardForm = useForm<InwardFormValues>({
    resolver: zodResolver(inwardFormSchema),
    defaultValues: {
      receiptType: "cash_received",
      partyName: "",
      amount: 0,
      entryDate: format(new Date(), "yyyy-MM-dd"),
      remarks: "",
    },
  });

  const outflowForm = useForm<OutflowFormValues>({
    resolver: zodResolver(outflowFormSchema),
    defaultValues: {
      expenseType: "",
      paymentMode: "cash",
      farmerName: "",
      coldStoreName: "",
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
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: t("Success", "सफलता"),
        description: t("Entry recorded successfully", "प्रविष्टि सफलतापूर्वक दर्ज की गई"),
      });
      if (activeTab === "inward") {
        inwardForm.reset({
          receiptType: "cash_received",
          partyName: "",
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

  const onInwardSubmit = (values: InwardFormValues) => {
    const selectedParty = parties.find(p => p.partyName === values.partyName);
    createEntryMutation.mutate({
      direction: "inward",
      receiptType: values.receiptType,
      partyName: values.partyName,
      partyVillage: selectedParty?.partyAddress || null,
      amount: values.amount,
      entryDate: values.entryDate,
      remarks: values.remarks || null,
    });
  };

  const onOutflowSubmit = (values: OutflowFormValues) => {
    const selectedFarmer = values.expenseType === "farmer" 
      ? farmers.find(f => f.farmerName === values.farmerName)
      : null;
    
    createEntryMutation.mutate({
      direction: "outflow",
      expenseType: values.expenseType,
      paymentMode: values.paymentMode,
      farmerName: values.expenseType === "farmer" ? values.farmerName : null,
      farmerVillage: selectedFarmer?.village || null,
      coldStoreName: values.expenseType === "cold_store_charge" ? values.coldStoreName : null,
      amount: values.amount,
      entryDate: values.entryDate,
      remarks: values.remarks || null,
    });
  };

  const expenseType = outflowForm.watch("expenseType");

  const cashReceived = entries
    .filter(e => e.direction === "inward" && e.receiptType === "cash_received")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  
  const accountReceived = entries
    .filter(e => e.direction === "inward" && e.receiptType === "account_received")
    .reduce((sum, e) => sum + Number(e.amount), 0);
    
  const cashExpense = entries
    .filter(e => e.direction === "outflow" && e.paymentMode === "cash")
    .reduce((sum, e) => sum + Number(e.amount), 0);
    
  const accountExpense = entries
    .filter(e => e.direction === "outflow" && e.paymentMode === "account_transfer")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const netCashInHand = cashReceived - cashExpense;
  const netCashInAccount = accountReceived - accountExpense;

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

  return (
    <div className="flex flex-col gap-6 p-4 h-full" data-testid="cash-management-tab">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wider">{t("Cash Received", "नकद प्राप्त")}</span>
            <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">₹{cashReceived.toLocaleString()}</span>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wider">{t("Account Received", "खाते में प्राप्त")}</span>
            <span className="text-lg font-bold text-blue-700 dark:text-blue-300">₹{accountReceived.toLocaleString()}</span>
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-rose-600 dark:text-rose-400 font-medium uppercase tracking-wider">{t("Cash Expense", "नकद खर्च")}</span>
            <span className="text-lg font-bold text-rose-700 dark:text-rose-300">₹{cashExpense.toLocaleString()}</span>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-100 dark:bg-orange-950/20 dark:border-orange-900">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-orange-600 dark:text-orange-400 font-medium uppercase tracking-wider">{t("Account Expense", "खाता खर्च")}</span>
            <span className="text-lg font-bold text-orange-700 dark:text-orange-300">₹{accountExpense.toLocaleString()}</span>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-100 dark:bg-teal-950/20 dark:border-teal-900">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-teal-600 dark:text-teal-400 font-medium uppercase tracking-wider">{t("Cash In Hand", "हाथ में नकद")}</span>
            <span className="text-lg font-bold text-teal-700 dark:text-teal-300">₹{netCashInHand.toLocaleString()}</span>
          </CardContent>
        </Card>
        <Card className="bg-indigo-50 border-indigo-100 dark:bg-indigo-950/20 dark:border-indigo-900">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wider">{t("In Account", "खाते में")}</span>
            <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">₹{netCashInAccount.toLocaleString()}</span>
          </CardContent>
        </Card>
      </div>

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
                    name="partyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Buyer Name", "खरीदार का नाम")} *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-party-name">
                              <SelectValue placeholder={t("Select Buyer", "खरीदार चुनें")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {parties.map((party) => (
                              <SelectItem key={party.partyName} value={party.partyName}>
                                <div className="flex items-center justify-between gap-4">
                                  <span>{party.partyName}</span>
                                  {party.partyAddress && (
                                    <span className="text-xs text-muted-foreground">({party.partyAddress})</span>
                                  )}
                                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                                    {t("Due", "बकाया")}: ₹{party.totalDue.toFixed(0)}
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

                  <FormField
                    control={inwardForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Amount", "राशि")} (₹) *</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} data-testid="input-amount" />
                        </FormControl>
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
                    <FormField
                      control={outflowForm.control}
                      name="farmerName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Farmer Name", "किसान का नाम")} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-farmer-name">
                                <SelectValue placeholder={t("Select Farmer", "किसान चुनें")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {farmers.map((farmer) => (
                                <SelectItem key={farmer.farmerName} value={farmer.farmerName}>
                                  <div className="flex items-center justify-between gap-4">
                                    <span>{farmer.farmerName}</span>
                                    {farmer.village && (
                                      <span className="text-xs text-muted-foreground">({farmer.village})</span>
                                    )}
                                    {farmer.totalDue > 0 && (
                                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                                        {t("Due", "बकाया")}: ₹{farmer.totalDue.toFixed(0)}
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
                                    <Badge variant="outline" className="text-orange-600 border-orange-300">
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
                        <FormLabel>{t("Amount", "राशि")} (₹) *</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} data-testid="input-outflow-amount" />
                        </FormControl>
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
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("No entries yet", "अभी तक कोई प्रविष्टि नहीं")}
            </div>
          ) : (
            entries.map((entry) => (
              <CashEntryCard key={entry.id} entry={entry} />
            ))
          )}
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
              {isInward ? entry.partyName : (entry.farmerName || entry.coldStoreName || getExpenseTypeLabel(entry.expenseType))}
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
