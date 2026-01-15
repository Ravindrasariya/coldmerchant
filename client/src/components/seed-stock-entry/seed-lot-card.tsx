import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Trash2, Leaf } from "lucide-react";
import { SeedStockEntryForm, SEED_POTATO_TYPES, SEED_BAG_TYPES, SEED_SIZE_OPTIONS } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

interface SeedLotCardProps {
  form: UseFormReturn<SeedStockEntryForm>;
  lotIndex: number;
  onRemove: () => void;
  canRemove: boolean;
}

export function SeedLotCard({ form, lotIndex, onRemove, canRemove }: SeedLotCardProps) {
  const { t } = useLanguage();

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-green-500/10">
            <Leaf className="h-4 w-4 text-green-600" />
          </div>
          <CardTitle className="text-lg font-medium">{t("Seed Lot", "बीज लॉट")} {lotIndex + 1}</CardTitle>
        </div>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive"
            data-testid={`button-remove-seed-lot-${lotIndex}`}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            {t("Remove", "हटाएं")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name={`seedLots.${lotIndex}.coldStoreName`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Cold Store Name", "कोल्ड स्टोर का नाम")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter cold store name", "कोल्ड स्टोर का नाम दर्ज करें")} 
                    {...field} 
                    data-testid={`input-seed-cold-store-${lotIndex}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`seedLots.${lotIndex}.originalBags`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Original # Bags", "मूल बोरी संख्या")} *</FormLabel>
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
                    data-testid={`input-seed-original-bags-${lotIndex}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`seedLots.${lotIndex}.potatoType`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Type of Potato", "आलू का प्रकार")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-seed-potato-type-${lotIndex}`}>
                      <SelectValue placeholder={t("Select type", "प्रकार चुनें")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SEED_POTATO_TYPES.map((type) => (
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
            name={`seedLots.${lotIndex}.bagType`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Bag Type", "बोरी का प्रकार")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-seed-bag-type-${lotIndex}`}>
                      <SelectValue placeholder={t("Select bag type", "बोरी का प्रकार चुनें")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SEED_BAG_TYPES.map((type) => (
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
            name={`seedLots.${lotIndex}.size`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Size", "आकार")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-seed-size-${lotIndex}`}>
                      <SelectValue placeholder={t("Select size", "आकार चुनें")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SEED_SIZE_OPTIONS.map((size) => (
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
            name={`seedLots.${lotIndex}.pricePerBag`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Price per Bag", "प्रति बोरी मूल्य")} *</FormLabel>
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
                    data-testid={`input-seed-price-per-bag-${lotIndex}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`seedLots.${lotIndex}.coldStoreChargesPerBag`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Cold Store Charges/Bag", "कोल्ड स्टोर शुल्क/बोरी")}</FormLabel>
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
                    data-testid={`input-seed-coldstore-charge-${lotIndex}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="pt-4 border-t">
          <FormField
            control={form.control}
            name={`seedLots.${lotIndex}.remarks`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Remarks", "टिप्पणी")}</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder={t("Enter any remarks for this lot...", "इस लॉट के लिए कोई टिप्पणी दर्ज करें...")} 
                    className="resize-none"
                    rows={2}
                    {...field} 
                    value={field.value || ""}
                    data-testid={`textarea-seed-remarks-${lotIndex}`}
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
