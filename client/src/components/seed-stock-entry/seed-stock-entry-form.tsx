import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getTodayIST, getISTYear } from "@/lib/date-utils";
import { useCurrentDateIST } from "@/hooks/use-current-date-ist";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Save, X, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SeedStockEntryForm as SeedStockEntryFormType, seedStockEntryFormSchema } from "@shared/schema";
import { SupplierInfoSection } from "./supplier-info-section";
import { SeedLotCard } from "./seed-lot-card";
import { useLanguage } from "@/hooks/use-language";

const SEED_STORAGE_KEY = "vyapar_seed_stock_entry_draft";

function getDefaultSeedFormValues(): SeedStockEntryFormType {
  return {
    purchaseDate: getTodayIST(),
    supplierName: "",
    supplierContact: "",
    address: "",
    district: "",
    state: "",
    remarks: "",
    seedLots: [
      {
        coldStoreName: "",
        originalBags: "" as any,
        potatoType: "",
        bagType: "",
        size: "",
        pricePerBag: "" as any,
        coldStoreChargesPerBag: undefined,
        remarks: "",
      },
    ],
  };
}

function loadSavedSeedFormData(): SeedStockEntryFormType {
  try {
    const saved = localStorage.getItem(SEED_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && parsed.seedLots && Array.isArray(parsed.seedLots)) {
        const today = getTodayIST();
        const savedDay = parsed._savedDay;
        if (savedDay && savedDay !== today) {
          localStorage.removeItem(SEED_STORAGE_KEY);
          return getDefaultSeedFormValues();
        }
        const { _savedDay: _, ...formData } = parsed;
        return formData;
      }
    }
  } catch (e) {
    console.error("Failed to load saved seed form data:", e);
  }
  return getDefaultSeedFormValues();
}

function saveSeedFormData(data: SeedStockEntryFormType) {
  try {
    const toSave = { ...data, _savedDay: getTodayIST() };
    localStorage.setItem(SEED_STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error("Failed to save seed form data:", e);
  }
}

function clearSavedSeedFormData() {
  try {
    localStorage.removeItem(SEED_STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear saved seed form data:", e);
  }
}

interface SeedStockEntryFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function SeedStockEntryForm({ onSuccess, onCancel }: SeedStockEntryFormProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const isPausingAutoSaveRef = useRef(false);
  const [overrideSerial, setOverrideSerial] = useState<string | null>(null);

  const form = useForm<SeedStockEntryFormType>({
    resolver: zodResolver(seedStockEntryFormSchema),
    defaultValues: loadSavedSeedFormData(),
  });

  // Live midnight reset: when IST date changes while the form is open,
  // snap purchaseDate to the new current date. `changed` is false on the
  // initial render so we never override a user-selected same-day date.
  const { today: currentDateIST, changed: dateChanged } = useCurrentDateIST();
  useEffect(() => {
    if (!dateChanged) return;
    form.setValue("purchaseDate", currentDateIST);
  }, [dateChanged, currentDateIST]);

  const watchedPurchaseDate = form.watch("purchaseDate");
  const nextSerialYear = useMemo(() => {
    if (!watchedPurchaseDate) return getISTYear();
    const y = getISTYear(watchedPurchaseDate);
    return Number.isFinite(y) && y > 1900 ? y : getISTYear();
  }, [watchedPurchaseDate]);

  const { data: nextSerialData, isLoading: nextSerialLoading } = useQuery<{ next: number; year: number }>({
    queryKey: ["/api/seed-stock-entries/next-serial", nextSerialYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/seed-stock-entries/next-serial?year=${nextSerialYear}`);
      return await res.json();
    },
    staleTime: 0,
  });
  const autoNext = nextSerialData?.next;

  // Reconcile override against autoNext: if the user typed a number that
  // (later, e.g. after changing purchase date) becomes equal to the new
  // auto-suggested Sr#, drop the override so we don't unnecessarily send
  // a serialNumber and so the Reset affordance disappears.
  useEffect(() => {
    if (overrideSerial === null) return;
    if (autoNext == null) return;
    const n = Number(overrideSerial);
    if (Number.isInteger(n) && n === autoNext) {
      setOverrideSerial(null);
    }
  }, [autoNext, overrideSerial]);

  useEffect(() => {
    const subscription = form.watch((data) => {
      if (data && !isPausingAutoSaveRef.current) {
        saveSeedFormData(data as SeedStockEntryFormType);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const { fields: lotFields, append: appendLot, remove: removeLot } = useFieldArray({
    control: form.control,
    name: "seedLots",
  });

  const createMutation = useMutation({
    mutationFn: async (data: SeedStockEntryFormType) => {
      const payload: SeedStockEntryFormType & { serialNumber?: number } = { ...data };
      if (overrideSerial !== null && overrideSerial !== "") {
        const n = Number(overrideSerial);
        if (Number.isInteger(n) && n > 0) {
          payload.serialNumber = n;
        }
      }
      const res = await apiRequest("POST", "/api/seed-stock-entries", payload);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t("Seed Stock Entry Created", "बीज स्टॉक एंट्री बनाई गई"),
        description: t("The seed stock entry has been saved successfully.", "बीज स्टॉक एंट्री सफलतापूर्वक सहेजी गई।"),
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries/next-serial"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions/unsold-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
      isPausingAutoSaveRef.current = true;
      clearSavedSeedFormData();
      form.reset(getDefaultSeedFormValues());
      setOverrideSerial(null);
      setTimeout(() => { isPausingAutoSaveRef.current = false; }, 100);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddLot = () => {
    appendLot({
      coldStoreName: "",
      originalBags: "" as any,
      potatoType: "",
      bagType: "",
      size: "",
      pricePerBag: "" as any,
      coldStoreChargesPerBag: undefined,
      remarks: "",
    });
  };

  const onSubmit = (data: SeedStockEntryFormType) => {
    createMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <SupplierInfoSection form={form} />

        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h3 className="text-lg font-medium">{t("Seed Lots", "बीज लॉट")}</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="next-seed-serial-input" className="whitespace-nowrap">{t("Sr#", "Sr#")}</Label>
                <div className="relative">
                  <Input
                    id="next-seed-serial-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    className="w-28 font-mono"
                    placeholder={nextSerialLoading ? "" : autoNext != null ? String(autoNext) : "—"}
                    value={
                      overrideSerial !== null
                        ? overrideSerial
                        : autoNext != null
                          ? String(autoNext)
                          : ""
                    }
                    disabled={nextSerialLoading}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setOverrideSerial(null);
                        return;
                      }
                      const n = Number(raw);
                      if (autoNext != null && Number.isInteger(n) && n === autoNext) {
                        setOverrideSerial(null);
                      } else {
                        setOverrideSerial(raw);
                      }
                    }}
                    data-testid="input-next-seed-serial"
                  />
                  {nextSerialLoading && (
                    <Loader2
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
              {overrideSerial !== null && (
                <button
                  type="button"
                  className="text-xs underline text-muted-foreground hover-elevate active-elevate-2 px-1 rounded"
                  onClick={() => setOverrideSerial(null)}
                  data-testid="button-reset-next-seed-serial"
                >
                  {t("Reset", "रीसेट")}
                </button>
              )}
            </div>
          </div>

          {lotFields.map((field, index) => (
            <SeedLotCard
              key={field.id}
              form={form}
              lotIndex={index}
              onRemove={() => removeLot(index)}
              canRemove={lotFields.length > 1}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={handleAddLot}
            className="w-full"
            data-testid="button-add-seed-lot"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("Add More Seed Lot", "और बीज लॉट जोड़ें")}
          </Button>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              isPausingAutoSaveRef.current = true;
              clearSavedSeedFormData();
              form.reset(getDefaultSeedFormValues());
              setTimeout(() => { isPausingAutoSaveRef.current = false; }, 100);
              onCancel?.();
            }}
            data-testid="button-cancel-seed"
          >
            <X className="h-4 w-4 mr-2" />
            {t("Cancel", "रद्द करें")}
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            data-testid="button-save-seed"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("Save Entry", "एंट्री सहेजें")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
