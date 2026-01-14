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

interface BagBreakdownRowProps {
  form: UseFormReturn<StockEntryForm>;
  lotIndex: number;
  breakdownIndex: number;
  onRemove: () => void;
}

export function BagBreakdownRow({ form, lotIndex, breakdownIndex, onRemove }: BagBreakdownRowProps) {
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
            <FormLabel className="md:hidden text-xs">Size</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid={`select-breakdown-size-${lotIndex}-${breakdownIndex}`}>
                  <SelectValue placeholder="Size" />
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
            <FormLabel className="md:hidden text-xs"># Bags</FormLabel>
            <FormControl>
              <Input 
                type="number" 
                placeholder="0" 
                {...field}
                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
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
            <FormLabel className="md:hidden text-xs">Weight</FormLabel>
            <FormControl>
              <Input 
                type="number"
                step="0.01"
                placeholder="0.00" 
                {...field}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
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
            <FormLabel className="md:hidden text-xs">Price/kg</FormLabel>
            <FormControl>
              <Input 
                type="number"
                step="0.01"
                placeholder="0.00" 
                {...field}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                data-testid={`input-breakdown-price-${lotIndex}-${breakdownIndex}`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="col-span-1 flex items-center">
        <div className="flex-1">
          <p className="md:hidden text-xs text-muted-foreground mb-1">Total</p>
          <p className="font-mono text-sm font-medium" data-testid={`text-breakdown-total-${lotIndex}-${breakdownIndex}`}>
            {totalAmount > 0 ? `₹${totalAmount.toFixed(2)}` : "—"}
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
