import { useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { getTodayIST } from "@/lib/date-utils";
import { Form } from "@/components/ui/form";
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
  
  const form = useForm<SeedStockEntryFormType>({
    resolver: zodResolver(seedStockEntryFormSchema),
    defaultValues: loadSavedSeedFormData(),
  });

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
      const res = await apiRequest("POST", "/api/seed-stock-entries", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t("Seed Stock Entry Created", "बीज स्टॉक एंट्री बनाई गई"),
        description: t("The seed stock entry has been saved successfully.", "बीज स्टॉक एंट्री सफलतापूर्वक सहेजी गई।"),
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
      isPausingAutoSaveRef.current = true;
      clearSavedSeedFormData();
      form.reset(getDefaultSeedFormValues());
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
          <h3 className="text-lg font-medium">{t("Seed Lots", "बीज लॉट")}</h3>

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
