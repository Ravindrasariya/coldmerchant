import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Plus, Save, X, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StockEntryForm as StockEntryFormType, stockEntryFormSchema } from "@shared/schema";
import { FarmerInfoSection } from "./farmer-info-section";
import { LotCard } from "./lot-card";

interface StockEntryFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function StockEntryForm({ onSuccess, onCancel }: StockEntryFormProps) {
  const { toast } = useToast();
  
  const form = useForm<StockEntryFormType>({
    resolver: zodResolver(stockEntryFormSchema),
    defaultValues: {
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
          coldStoreName: "",
          originalBags: 0,
          potatoType: "",
          bagType: "",
          quality: "",
          cutType: "gate_cut",
          size: "",
          pricePerKg: undefined,
          remarks: "",
          bagBreakdowns: [],
        },
      ],
    },
  });

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
        title: "Stock Entry Created",
        description: "The stock entry has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddLot = () => {
    appendLot({
      coldStoreName: "",
      originalBags: 0,
      potatoType: "",
      bagType: "",
      quality: "",
      cutType: "gate_cut",
      size: "",
      pricePerKg: undefined,
      remarks: "",
      bagBreakdowns: [],
    });
  };

  const onSubmit = (data: StockEntryFormType) => {
    createMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FarmerInfoSection form={form} />

        <div className="space-y-4">
          <h3 className="text-lg font-medium">Lots</h3>

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
            Add More Lot
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
            data-testid="button-cancel"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
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
            Save Entry
          </Button>
        </div>
      </form>
    </Form>
  );
}
