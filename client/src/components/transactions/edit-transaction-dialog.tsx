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
import { ChevronDown, ChevronUp, History, Save } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TransactionItem {
  id: number;
  serialNumber: number;
  coldStoreName: string;
  potatoType: string | null;
  size: string | null;
  bagsMoved: number;
  netWeight: string | null;
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

  const { data: transaction, isLoading } = useQuery<TransactionWithHistory>({
    queryKey: ["/api/transactions", transactionId],
    enabled: !!transactionId && open,
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
    }
  }, [transaction, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditTransactionFormData) => {
      return apiRequest("PATCH", `/api/transactions/${transactionId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions", transactionId] });
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
            <div className="bg-muted/50 p-4 rounded-md space-y-2">
              <h4 className="font-medium text-sm">{t("Items in Transaction", "लेनदेन में आइटम")}</h4>
              {transaction.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>S#{item.serialNumber} - {item.coldStoreName} - {item.potatoType} - {item.size || "Mixed"}</span>
                  <span>{item.bagsMoved} {t("bags", "बोरी")} ({parseFloat(item.netWeight || "0").toFixed(1)} kg)</span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>{t("Total", "कुल")}</span>
                <span>{transaction.totalBags} {t("bags", "बोरी")} ({parseFloat(transaction.totalNetWeight || "0").toFixed(1)} kg)</span>
              </div>
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
