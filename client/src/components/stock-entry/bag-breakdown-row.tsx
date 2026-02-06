import { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Trash2 } from "lucide-react";
import { StockEntryForm, SIZE_OPTIONS } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

interface BagBreakdownRowProps {
  form: UseFormReturn<StockEntryForm>;
  lotIndex: number;
  breakdownIndex: number;
  onRemove: () => void;
}

export function BagBreakdownRow({ form, lotIndex, breakdownIndex, onRemove }: BagBreakdownRowProps) {
  const { t } = useLanguage();
  const weight = form.watch(`lots.${lotIndex}.bagBreakdowns.${breakdownIndex}.weight`) || 0;
  const pricePerKg = form.watch(`lots.${lotIndex}.bagBreakdowns.${breakdownIndex}.pricePerKg`) || 0;
  const totalAmount = weight * pricePerKg;

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3 bg-muted/30 rounded-md items-end">
      <FormField
        control={form.control}
        name={`lots.${lotIndex}.bagBreakdowns.${breakdownIndex}.size`}
        render={({ field }) => (
          <FormItem className="col-span-1">
            <FormLabel className="md:hidden text-xs">{t("Size", "आकार")}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid={`select-breakdown-size-${lotIndex}-${breakdownIndex}`}>
                  <SelectValue placeholder={t("Size", "आकार")} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`lots.${lotIndex}.bagBreakdowns.${breakdownIndex}.numberOfBags`}
        render={({ field }) => (
          <FormItem className="col-span-1">
            <FormLabel className="md:hidden text-xs">{t("# Bags", "बोरी")}</FormLabel>
            <FormControl>
              <Input 
                type="text"
                inputMode="numeric"
                placeholder="" 
                {...field}
                value={field.value ?? ""}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  field.onChange(val === "" ? undefined : parseInt(val));
                }}
                data-testid={`input-breakdown-bags-${lotIndex}-${breakdownIndex}`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`lots.${lotIndex}.bagBreakdowns.${breakdownIndex}.weight`}
        render={({ field }) => (
          <FormItem className="col-span-1">
            <FormLabel className="md:hidden text-xs">{t("Weight", "वजन")}</FormLabel>
            <FormControl>
              <Input 
                type="number"
                step="any"
                placeholder="" 
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                {...field}
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value));
                }}
                data-testid={`input-breakdown-weight-${lotIndex}-${breakdownIndex}`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`lots.${lotIndex}.bagBreakdowns.${breakdownIndex}.pricePerKg`}
        render={({ field }) => (
          <FormItem className="col-span-1">
            <FormLabel className="md:hidden text-xs">{t("Price/kg", "मूल्य/किलो")}</FormLabel>
            <FormControl>
              <Input 
                type="number"
                step="any"
                placeholder="" 
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                {...field}
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value));
                }}
                data-testid={`input-breakdown-price-${lotIndex}-${breakdownIndex}`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="col-span-1 flex items-center">
        <div className="flex-1">
          <p className="md:hidden text-xs text-muted-foreground mb-1">{t("Total", "कुल")}</p>
          <p className="font-mono text-sm font-medium" data-testid={`text-breakdown-total-${lotIndex}-${breakdownIndex}`}>
            {totalAmount > 0 ? `₹${parseFloat(totalAmount.toFixed(1)).toLocaleString('en-IN')}` : "—"}
          </p>
        </div>
      </div>

      <div className="col-span-1 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="text-destructive"
          data-testid={`button-remove-breakdown-${lotIndex}-${breakdownIndex}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
