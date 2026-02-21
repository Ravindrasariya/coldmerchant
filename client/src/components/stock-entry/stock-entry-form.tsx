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
import { AadhtiyaInfoSection } from "./aadhtiya-info-section";
import { LotCard } from "./lot-card";
import { useLanguage } from "@/hooks/use-language";

const STORAGE_KEY_PREFIX = "stock-entry-form-draft-";

function getStorageKey(crop: "potato" | "onion" | "garlic") {
  return `${STORAGE_KEY_PREFIX}${crop}`;
}

function getDefaultFormValues(selectedCrop: "potato" | "onion" | "garlic", selectedPlace: "farm_gate" | "cold_store" | "mandi" = "cold_store"): StockEntryFormType {
  return {
    purchaseDate: new Date().toISOString().split("T")[0],
    place: selectedPlace,
    farmerName: "",
    farmerContact: "",
    village: "",
    tehsil: "",
    district: "",
    state: "",
    aadhatDbId: undefined,
    aadhatName: "",
    remarks: "",
    lots: [
      {
        place: selectedPlace,
        coldStoreName: "",
        coldStoreLotNumber: "",
        crop: selectedCrop,
        originalBags: 0,
        potatoType: "",
        harvestPotatoType: "",
        bagType: "",
        quality: "",
        cutType: selectedPlace === "mandi" ? "gate_cut" : "gate_cut",
        size: "",
        pricePerKg: undefined,
        charges: [],
        mandiCommissionPercent: undefined,
        aadhatCommissionPercent: undefined,
        hammaliPerBag: undefined,
        mandiExtraCharges: undefined,
        remarks: "",
        bagBreakdowns: [],
      },
    ],
  };
}

function loadSavedFormData(selectedCrop: "potato" | "onion" | "garlic"): StockEntryFormType {
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

function saveFormData(data: StockEntryFormType, crop: "potato" | "onion" | "garlic") {
  try {
    localStorage.setItem(getStorageKey(crop), JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save form data:", e);
  }
}

function clearSavedFormData(crop: "potato" | "onion" | "garlic") {
  try {
    localStorage.removeItem(getStorageKey(crop));
  } catch (e) {
    console.error("Failed to clear saved form data:", e);
  }
}

interface StockEntryFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  selectedCrop?: "potato" | "onion" | "garlic";
  selectedPlace?: "farm_gate" | "cold_store" | "mandi";
}

export function StockEntryForm({ onSuccess, onCancel, selectedCrop = "potato", selectedPlace = "cold_store" }: StockEntryFormProps) {
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

  useEffect(() => {
    form.setValue("place", selectedPlace);
    const lots = form.getValues("lots");
    lots.forEach((_, index) => {
      form.setValue(`lots.${index}.place`, selectedPlace);
      if (selectedPlace === "mandi") {
        form.setValue(`lots.${index}.cutType`, "gate_cut");
      }
    });
  }, [selectedPlace, form]);

  useEffect(() => {
    const lots = form.getValues("lots");
    lots.forEach((_, index) => {
      form.setValue(`lots.${index}.crop`, selectedCrop);
    });
  }, [selectedCrop, form]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    formContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetFormAndClearStorage = () => {
    isPausingAutoSaveRef.current = true;
    clearSavedFormData(selectedCrop);
    form.reset(getDefaultFormValues(selectedCrop, selectedPlace));
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
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
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
    const currentLots = form.getValues("lots");
    const lastLot = currentLots.length > 0 ? currentLots[currentLots.length - 1] : null;

    const mandiChargesFromPrev = selectedPlace === "mandi" && lastLot ? {
      mandiCommissionPercent: lastLot.mandiCommissionPercent,
      aadhatCommissionPercent: lastLot.aadhatCommissionPercent,
      hammaliPerBag: lastLot.hammaliPerBag,
    } : {
      mandiCommissionPercent: undefined,
      aadhatCommissionPercent: undefined,
      hammaliPerBag: undefined,
    };

    appendLot({
      place: selectedPlace,
      coldStoreName: "",
      coldStoreLotNumber: "",
      crop: selectedCrop,
      originalBags: 0,
      potatoType: "",
      harvestPotatoType: "",
      bagType: "",
      quality: "",
      cutType: selectedPlace === "mandi" ? "gate_cut" : "gate_cut",
      size: "",
      pricePerKg: undefined,
      charges: [],
      ...mandiChargesFromPrev,
      mandiExtraCharges: undefined,
      remarks: "",
      bagBreakdowns: [],
    });
  };

  const onSubmit = (data: StockEntryFormType) => {
    createMutation.mutate(data);
  };

  const onInvalid = (errors: any) => {
    const flatErrors: string[] = [];
    const collectErrors = (obj: any, prefix = "") => {
      for (const key in obj) {
        const val = obj[key];
        if (val?.message) {
          flatErrors.push(val.message);
        } else if (Array.isArray(val)) {
          val.forEach((item: any, i: number) => {
            if (item) collectErrors(item, `${prefix}Lot ${i + 1} > `);
          });
        } else if (typeof val === "object" && val !== null) {
          collectErrors(val, `${prefix}${key} > `);
        }
      }
    };
    collectErrors(errors);
    toast({
      title: t("Please fix the following errors", "कृपया निम्नलिखित त्रुटियाँ ठीक करें"),
      description: flatErrors.slice(0, 5).join("\n") + (flatErrors.length > 5 ? `\n...and ${flatErrors.length - 5} more` : ""),
      variant: "destructive",
    });
    const firstError = formContainerRef.current?.querySelector("[aria-invalid='true'], .text-destructive");
    if (firstError) {
      firstError.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <Form {...form}>
      <form ref={formContainerRef} onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
        {selectedPlace === "mandi" ? (
          <AadhtiyaInfoSection form={form} />
        ) : (
          <FarmerInfoSection form={form} />
        )}

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
