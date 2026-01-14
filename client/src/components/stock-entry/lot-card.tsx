import { useFieldArray, UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, Package } from "lucide-react";
import { StockEntryForm, POTATO_TYPES, BAG_TYPES, QUALITY_OPTIONS, SIZE_OPTIONS } from "@shared/schema";
import { BagBreakdownRow } from "./bag-breakdown-row";

interface LotCardProps {
  form: UseFormReturn<StockEntryForm>;
  lotIndex: number;
  onRemove: () => void;
  canRemove: boolean;
}

export function LotCard({ form, lotIndex, onRemove, canRemove }: LotCardProps) {
  const { fields: breakdownFields, append: appendBreakdown, remove: removeBreakdown } = useFieldArray({
    control: form.control,
    name: `lots.${lotIndex}.bagBreakdowns`,
  });

  const cutType = form.watch(`lots.${lotIndex}.cutType`);
  const originalBags = form.watch(`lots.${lotIndex}.originalBags`) || 0;

  const handleAddBreakdown = () => {
    appendBreakdown({
      size: "",
      numberOfBags: 0,
      weight: undefined,
      pricePerKg: undefined,
    });
  };

  const totalBreakdownBags = breakdownFields.reduce((sum, _, idx) => {
    const bags = form.watch(`lots.${lotIndex}.bagBreakdowns.${idx}.numberOfBags`) || 0;
    return sum + bags;
  }, 0);

  const remainingToAllocate = originalBags - totalBreakdownBags;

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-lg font-medium">Lot {lotIndex + 1}</CardTitle>
        </div>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive"
            data-testid={`button-remove-lot-${lotIndex}`}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Remove
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name={`lots.${lotIndex}.coldStoreName`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cold Store Name *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter cold store name" 
                    {...field} 
                    data-testid={`input-cold-store-${lotIndex}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`lots.${lotIndex}.originalBags`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Original # Bags *</FormLabel>
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
                    data-testid={`input-original-bags-${lotIndex}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`lots.${lotIndex}.potatoType`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type of Potato *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-potato-type-${lotIndex}`}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {POTATO_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
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
            name={`lots.${lotIndex}.bagType`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bag Type *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-bag-type-${lotIndex}`}>
                      <SelectValue placeholder="Select bag type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {BAG_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
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
            name={`lots.${lotIndex}.quality`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quality *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-quality-${lotIndex}`}>
                      <SelectValue placeholder="Select quality" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {QUALITY_OPTIONS.map((quality) => (
                      <SelectItem key={quality} value={quality}>
                        {quality}
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
            name={`lots.${lotIndex}.cutType`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cut Type *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-cut-type-${lotIndex}`}>
                      <SelectValue placeholder="Select cut type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="gate_cut">Gate Cut</SelectItem>
                    <SelectItem value="bilty_cut">Bilty Cut</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {cutType === "gate_cut" && (
            <>
              <FormField
                control={form.control}
                name={`lots.${lotIndex}.size`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Size</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid={`select-size-${lotIndex}`}>
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SIZE_OPTIONS.filter(s => s !== "Wastage").map((size) => (
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
                name={`lots.${lotIndex}.pricePerKg`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price/kg</FormLabel>
                    <FormControl>
                      <Input 
                        type="text"
                        inputMode="decimal"
                        placeholder="" 
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          field.onChange(val === "" ? undefined : parseFloat(val));
                        }}
                        data-testid={`input-price-per-kg-${lotIndex}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </div>

        {cutType === "bilty_cut" && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Final Bags Breakdown</h4>
                <p className="text-xs text-muted-foreground">
                  Allocate {originalBags} bags into different sizes
                  {remainingToAllocate !== 0 && (
                    <span className={remainingToAllocate < 0 ? "text-destructive ml-1" : "text-primary ml-1"}>
                      ({remainingToAllocate > 0 ? `${remainingToAllocate} remaining` : `${Math.abs(remainingToAllocate)} over-allocated`})
                    </span>
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddBreakdown}
                data-testid={`button-add-breakdown-${lotIndex}`}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
            </div>

            {breakdownFields.length > 0 && (
              <div className="space-y-3">
                <div className="hidden md:grid md:grid-cols-5 gap-4 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <div>Size</div>
                  <div># Bags</div>
                  <div>Weight (kg)</div>
                  <div>Price/kg</div>
                  <div>Total</div>
                </div>
                {breakdownFields.map((field, breakdownIndex) => (
                  <BagBreakdownRow
                    key={field.id}
                    form={form}
                    lotIndex={lotIndex}
                    breakdownIndex={breakdownIndex}
                    onRemove={() => removeBreakdown(breakdownIndex)}
                  />
                ))}
              </div>
            )}

            {breakdownFields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-md">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No breakdown rows added yet</p>
                <p className="text-xs">Click "Add Row" to start allocating bags</p>
              </div>
            )}
          </div>
        )}

        <div className="pt-4 border-t">
          <FormField
            control={form.control}
            name={`lots.${lotIndex}.remarks`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remarks</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Enter any remarks for this lot..." 
                    className="resize-none"
                    rows={2}
                    {...field} 
                    value={field.value || ""}
                    data-testid={`textarea-remarks-${lotIndex}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
