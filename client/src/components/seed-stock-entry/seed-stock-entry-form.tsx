import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Plus, Save, X, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SeedStockEntryForm as SeedStockEntryFormType, seedStockEntryFormSchema } from "@shared/schema";
import { SupplierInfoSection } from "./supplier-info-section";
import { SeedLotCard } from "./seed-lot-card";
import { useLanguage } from "@/hooks/use-language";

interface SeedStockEntryFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function SeedStockEntryForm({ onSuccess, onCancel }: SeedStockEntryFormProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  
  const form = useForm<SeedStockEntryFormType>({
    resolver: zodResolver(seedStockEntryFormSchema),
    defaultValues: {
      purchaseDate: new Date().toISOString().split("T")[0],
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
    },
  });

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
      form.reset();
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
              form.reset();
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
