import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Plus, Save, X, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StockEntryForm as StockEntryFormType, stockEntryFormSchema } from "@shared/schema";
import { FarmerInfoSection } from "./farmer-info-section";
import { LotCard } from "./lot-card";
import { useLanguage } from "@/hooks/use-language";

const STORAGE_KEY_PREFIX = "stock-entry-form-draft-";

function getStorageKey(crop: "potato" | "onion") {
  return `${STORAGE_KEY_PREFIX}${crop}`;
}

function getDefaultFormValues(selectedCrop: "potato" | "onion"): StockEntryFormType {
  return {
    purchaseDate: new Date().toISOString().split("T")[0],
    farmerName: "",
    farmerContact: "",
    village: "",
    tehsil: "",
    district: "",
    state: "",
    remarks: "",
    lots: [
      {
        place: "cold_store",
        coldStoreName: "",
        coldStoreLotNumber: "",
        crop: selectedCrop,
        originalBags: 0,
        potatoType: "",
        harvestPotatoType: "",
        bagType: "",
        quality: "",
        cutType: "gate_cut",
        size: "",
        pricePerKg: undefined,
        charges: [],
        remarks: "",
        bagBreakdowns: [],
      },
    ],
  };
}

function loadSavedFormData(selectedCrop: "potato" | "onion"): StockEntryFormType {
  try {
    const saved = localStorage.getItem(getStorageKey(selectedCrop));
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && parsed.lots && Array.isArray(parsed.lots)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Failed to load saved form data:", e);
  }
  return getDefaultFormValues(selectedCrop);
}

function saveFormData(data: StockEntryFormType, crop: "potato" | "onion") {
  try {
    localStorage.setItem(getStorageKey(crop), JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save form data:", e);
  }
}

function clearSavedFormData(crop: "potato" | "onion") {
  try {
    localStorage.removeItem(getStorageKey(crop));
  } catch (e) {
    console.error("Failed to clear saved form data:", e);
  }
}

interface StockEntryFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  selectedCrop?: "potato" | "onion";
}

export function StockEntryForm({ onSuccess, onCancel, selectedCrop = "potato" }: StockEntryFormProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const formContainerRef = useRef<HTMLFormElement>(null);
  const isPausingAutoSaveRef = useRef(false);
  
  const form = useForm<StockEntryFormType>({
    resolver: zodResolver(stockEntryFormSchema),
    defaultValues: loadSavedFormData(selectedCrop),
  });

  useEffect(() => {
    const subscription = form.watch((data) => {
      if (data && !isPausingAutoSaveRef.current) {
        saveFormData(data as StockEntryFormType, selectedCrop);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, selectedCrop]);

  useEffect(() => {
    form.reset(loadSavedFormData(selectedCrop));
  }, [selectedCrop, form]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    formContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetFormAndClearStorage = () => {
    isPausingAutoSaveRef.current = true;
    clearSavedFormData(selectedCrop);
    form.reset(getDefaultFormValues(selectedCrop));
    scrollToTop();
    setTimeout(() => {
      isPausingAutoSaveRef.current = false;
    }, 100);
  };

  const { fields: lotFields, append: appendLot, remove: removeLot } = useFieldArray({
    control: form.control,
    name: "lots",
  });

  const createMutation = useMutation({
    mutationFn: async (data: StockEntryFormType) => {
      const res = await apiRequest("POST", "/api/stock-entries", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t("Stock Entry Created", "स्टॉक एंट्री बनाई गई"),
        description: t("The stock entry has been saved successfully.", "स्टॉक एंट्री सफलतापूर्वक सहेजी गई।"),
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/cross-settlement-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      resetFormAndClearStorage();
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
      place: "cold_store",
      coldStoreName: "",
      coldStoreLotNumber: "",
      crop: selectedCrop,
      originalBags: 0,
      potatoType: "",
      harvestPotatoType: "",
      bagType: "",
      quality: "",
      cutType: "gate_cut",
      size: "",
      pricePerKg: undefined,
      charges: [],
      remarks: "",
      bagBreakdowns: [],
    });
  };

  const onSubmit = (data: StockEntryFormType) => {
    createMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form ref={formContainerRef} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FarmerInfoSection form={form} />

        <div className="space-y-4">
          <h3 className="text-lg font-medium">{t("Lots", "लॉट")}</h3>

          {lotFields.map((field, index) => (
            <LotCard
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
            data-testid="button-add-lot"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("Add More Lot", "और लॉट जोड़ें")}
          </Button>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resetFormAndClearStorage();
              onCancel?.();
            }}
            data-testid="button-cancel"
          >
            <X className="h-4 w-4 mr-2" />
            {t("Cancel", "रद्द करें")}
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            data-testid="button-save"
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
