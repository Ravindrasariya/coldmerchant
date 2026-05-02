import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getTodayIST } from "@/lib/date-utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Save, X, Loader2, Pencil, Check } from "lucide-react";
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
    purchaseDate: getTodayIST(),
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

function loadSavedFormData(selectedCrop: "potato" | "onion" | "garlic", selectedPlace?: "farm_gate" | "cold_store" | "mandi"): StockEntryFormType {
  try {
    const saved = localStorage.getItem(getStorageKey(selectedCrop));
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && parsed.lots && Array.isArray(parsed.lots)) {
        const today = getTodayIST();
        const savedDay = parsed._savedDay;
        if (savedDay && savedDay !== today) {
          localStorage.removeItem(getStorageKey(selectedCrop));
          return getDefaultFormValues(selectedCrop, selectedPlace);
        }
        const { _savedDay: _, ...formData } = parsed;
        return formData;
      }
    }
  } catch (e) {
    console.error("Failed to load saved form data:", e);
  }
  return getDefaultFormValues(selectedCrop, selectedPlace);
}

function saveFormData(data: StockEntryFormType, crop: "potato" | "onion" | "garlic") {
  try {
    const toSave = { ...data, _savedDay: getTodayIST() };
    localStorage.setItem(getStorageKey(crop), JSON.stringify(toSave));
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
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [overrideSerial, setOverrideSerial] = useState<string | null>(null);
  const [isEditingSerial, setIsEditingSerial] = useState(false);
  const [serialDraft, setSerialDraft] = useState<string>("");

  const form = useForm<StockEntryFormType>({
    resolver: zodResolver(stockEntryFormSchema),
    defaultValues: loadSavedFormData(selectedCrop, selectedPlace),
  });

  const watchedPurchaseDate = form.watch("purchaseDate");
  const nextSerialYear = useMemo(() => {
    const fallback = new Date().getFullYear();
    if (!watchedPurchaseDate) return fallback;
    const parsed = new Date(watchedPurchaseDate);
    const y = parsed.getFullYear();
    return Number.isFinite(y) && y > 1900 ? y : fallback;
  }, [watchedPurchaseDate]);

  const { data: nextSerialData, isLoading: nextSerialLoading } = useQuery<{ next: number; year: number }>({
    queryKey: ["/api/stock-entries/next-serial", nextSerialYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/stock-entries/next-serial?year=${nextSerialYear}`);
      return await res.json();
    },
    staleTime: 0,
  });
  const autoNext = nextSerialData?.next;

  useEffect(() => {
    const subscription = form.watch((data) => {
      if (data && !isPausingAutoSaveRef.current) {
        saveFormData(data as StockEntryFormType, selectedCrop);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, selectedCrop]);

  useEffect(() => {
    const draft = loadSavedFormData(selectedCrop, selectedPlace);
    draft.place = selectedPlace;
    if (draft.lots && Array.isArray(draft.lots)) {
      draft.lots.forEach((lot) => {
        lot.place = selectedPlace;
        lot.crop = selectedCrop;
        if (selectedPlace === "mandi") {
          lot.coldStoreName = "";
          lot.coldStoreLotNumber = "";
          lot.coldStoreDbId = undefined;
          lot.charges = [];
          lot.cutType = "gate_cut";
        } else if (selectedPlace === "farm_gate") {
          lot.coldStoreName = "";
          lot.coldStoreLotNumber = "";
          lot.coldStoreDbId = undefined;
          lot.mandiCommissionPercent = undefined;
          lot.aadhatCommissionPercent = undefined;
          lot.hammaliPerBag = undefined;
          lot.mandiExtraCharges = undefined;
        } else {
          lot.mandiCommissionPercent = undefined;
          lot.aadhatCommissionPercent = undefined;
          lot.hammaliPerBag = undefined;
          lot.mandiExtraCharges = undefined;
        }
      });
    }
    isPausingAutoSaveRef.current = true;
    form.reset(draft);
    isPausingAutoSaveRef.current = false;
  }, [selectedCrop, selectedPlace, form]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    formContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetFormAndClearStorage = () => {
    isPausingAutoSaveRef.current = true;
    clearSavedFormData(selectedCrop);
    form.reset(getDefaultFormValues(selectedCrop, selectedPlace));
    setAttachmentFile(null);
    setOverrideSerial(null);
    setIsEditingSerial(false);
    setSerialDraft("");
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
      const payload: any = { ...data };
      if (overrideSerial !== null && overrideSerial !== "") {
        const n = Number(overrideSerial);
        if (Number.isInteger(n) && n > 0) {
          payload.serialNumber = n;
        }
      }
      const res = await apiRequest("POST", "/api/stock-entries", payload);
      return await res.json();
    },
    onSuccess: async (result: { id: number }) => {
      let imageError = false;
      if (attachmentFile && result?.id) {
        try {
          const formData = new FormData();
          formData.append("image", attachmentFile);
          const imgRes = await fetch(`/api/stock-entries/${result.id}/image`, { method: "POST", body: formData, credentials: "include" });
          if (!imgRes.ok) imageError = true;
        } catch (e) {
          console.error("Image upload failed:", e);
          imageError = true;
        }
        setAttachmentFile(null);
      }
      toast({
        title: t("Stock Entry Created", "स्टॉक एंट्री बनाई गई"),
        description: imageError
          ? t("Entry saved but image upload failed.", "एंट्री सहेजी गई लेकिन फोटो अपलोड विफल।")
          : t("The stock entry has been saved successfully.", "स्टॉक एंट्री सफलतापूर्वक सहेजी गई।"),
        variant: imageError ? "destructive" : "success",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries/next-serial"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/unsold"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cold-store-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cold-stores/search"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/cold-stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhat-pending-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/seed-suppliers"] });
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

  const fieldLabels: Record<string, string> = {
    purchaseDate: t("Purchase Date", "खरीद तिथि"),
    farmerName: t("Farmer Name", "किसान का नाम"),
    farmerContact: t("Phone Number", "फोन नंबर"),
    village: t("Village", "गाँव"),
    tehsil: t("Tehsil", "तहसील"),
    district: t("District", "जिला"),
    state: t("State", "राज्य"),
    aadhatName: t("Aadhtiya", "आढ़तिया"),
    originalBags: t("Total Bags", "कुल बोरी"),
    quality: t("Quality", "गुणवत्ता"),
    cutType: t("Delivery Type", "डिलीवरी प्रकार"),
    coldStoreName: t("Cold Store Name", "कोल्ड स्टोर नाम"),
    potatoType: t("Variety", "किस्म"),
    size: t("Size", "साइज़"),
    numberOfBags: t("Number of Bags", "बोरी की संख्या"),
  };

  const onInvalid = (errors: any) => {
    console.log("Form validation errors:", JSON.stringify(errors, null, 2));
    const flatErrors: string[] = [];
    const getLabel = (key: string) => fieldLabels[key] || key;

    if (errors.purchaseDate) flatErrors.push(`${getLabel("purchaseDate")}: ${errors.purchaseDate.message}`);
    if (errors.farmerName) flatErrors.push(`${getLabel("farmerName")}: ${errors.farmerName.message}`);
    if (errors.farmerContact) flatErrors.push(`${getLabel("farmerContact")}: ${errors.farmerContact.message}`);
    if (errors.village) flatErrors.push(`${getLabel("village")}: ${errors.village.message}`);
    if (errors.tehsil) flatErrors.push(`${getLabel("tehsil")}: ${errors.tehsil.message}`);
    if (errors.district) flatErrors.push(`${getLabel("district")}: ${errors.district.message}`);
    if (errors.state) flatErrors.push(`${getLabel("state")}: ${errors.state.message}`);
    if (errors.aadhatName) flatErrors.push(`${getLabel("aadhatName")}: ${errors.aadhatName.message}`);

    if (errors.lots && Array.isArray(errors.lots)) {
      errors.lots.forEach((lotErr: any, i: number) => {
        if (!lotErr) return;
        const lotLabel = `${t("Lot", "लॉट")} ${i + 1}`;
        for (const key in lotErr) {
          if (key === "bagBreakdowns" && Array.isArray(lotErr[key])) {
            lotErr[key].forEach((bdErr: any, j: number) => {
              if (!bdErr) return;
              for (const bk in bdErr) {
                if (bdErr[bk]?.message) {
                  flatErrors.push(`${lotLabel} > ${t("Breakdown", "ब्रेकडाउन")} ${j + 1} > ${getLabel(bk)}`);
                }
              }
            });
          } else if (lotErr[key]?.message) {
            flatErrors.push(`${lotLabel} > ${getLabel(key)}`);
          }
        }
      });
    }

    toast({
      title: t("Please fill required fields", "कृपया आवश्यक फ़ील्ड भरें"),
      description: flatErrors.slice(0, 6).join(" • "),
      variant: "destructive",
      duration: 8000,
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
          <AadhtiyaInfoSection form={form} attachmentFile={attachmentFile} onAttachmentChange={setAttachmentFile} />
        ) : (
          <FarmerInfoSection form={form} attachmentFile={attachmentFile} onAttachmentChange={setAttachmentFile} />
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-lg font-medium">{t("Lots", "लॉट")}</h3>
            <div className="flex items-center gap-2">
              {isEditingSerial ? (
                <>
                  <span className="text-sm text-muted-foreground">{t("Sr#", "Sr#")}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={serialDraft}
                    onChange={(e) => setSerialDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const n = Number(serialDraft);
                        if (!Number.isInteger(n) || n <= 0) return;
                        if (autoNext != null && n === autoNext) {
                          setOverrideSerial(null);
                        } else {
                          setOverrideSerial(String(n));
                        }
                        setIsEditingSerial(false);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setIsEditingSerial(false);
                      }
                    }}
                    className="h-7 w-20 font-mono"
                    data-testid="input-edit-next-serial"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={(() => {
                      const n = Number(serialDraft);
                      return !serialDraft || !Number.isInteger(n) || n <= 0;
                    })()}
                    onClick={() => {
                      const n = Number(serialDraft);
                      if (!Number.isInteger(n) || n <= 0) return;
                      if (autoNext != null && n === autoNext) {
                        setOverrideSerial(null);
                      } else {
                        setOverrideSerial(String(n));
                      }
                      setIsEditingSerial(false);
                    }}
                    data-testid="button-apply-next-serial"
                    aria-label={t("Apply", "लागू करें")}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsEditingSerial(false)}
                    data-testid="button-cancel-next-serial"
                    aria-label={t("Cancel", "रद्द करें")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Badge variant="secondary" className="font-mono" data-testid="badge-next-serial">
                    {t("Sr#:", "Sr#:")}{" "}
                    {overrideSerial !== null ? (
                      overrideSerial
                    ) : nextSerialLoading || autoNext == null ? (
                      <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />
                    ) : (
                      autoNext
                    )}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      const initial = overrideSerial ?? (autoNext != null ? String(autoNext) : "");
                      setSerialDraft(initial);
                      setIsEditingSerial(true);
                    }}
                    data-testid="button-edit-next-serial"
                    aria-label={t("Edit Sr#", "Sr# संपादित करें")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {overrideSerial !== null && (
                    <button
                      type="button"
                      className="text-xs underline text-muted-foreground hover-elevate active-elevate-2 px-1 rounded"
                      onClick={() => setOverrideSerial(null)}
                      data-testid="button-reset-next-serial"
                    >
                      {t("Reset", "रीसेट")}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

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
