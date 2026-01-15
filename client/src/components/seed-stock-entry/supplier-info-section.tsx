import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";
import { SeedStockEntryForm } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

interface SupplierInfoSectionProps {
  form: UseFormReturn<SeedStockEntryForm>;
}

export function SupplierInfoSection({ form }: SupplierInfoSectionProps) {
  const { t } = useLanguage();

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-lg font-medium">{t("Supplier Information", "आपूर्तिकर्ता जानकारी")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="purchaseDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Purchase Date", "खरीद तिथि")} *</FormLabel>
                <FormControl>
                  <Input 
                    type="date" 
                    {...field} 
                    data-testid="input-seed-purchase-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="supplierName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Supplier Name", "आपूर्तिकर्ता का नाम")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter supplier name", "आपूर्तिकर्ता का नाम दर्ज करें")} 
                    {...field} 
                    data-testid="input-supplier-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="supplierContact"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Contact Number", "संपर्क नंबर")}</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter contact number", "संपर्क नंबर दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    data-testid="input-supplier-contact"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Address", "पता")}</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter address", "पता दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    data-testid="input-supplier-address"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="district"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("District", "जिला")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter district", "जिला दर्ज करें")} 
                    {...field} 
                    data-testid="input-seed-district"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("State", "राज्य")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter state", "राज्य दर्ज करें")} 
                    {...field} 
                    data-testid="input-seed-state"
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
