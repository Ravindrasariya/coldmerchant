import { UseFormReturn } from "react-hook-form";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";
import { StockEntryForm, DISTRICTS, STATES } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

interface FarmerInfoSectionProps {
  form: UseFormReturn<StockEntryForm>;
}

export function FarmerInfoSection({ form }: FarmerInfoSectionProps) {
  const { t } = useLanguage();

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-lg font-medium">{t("Farmer Information", "किसान जानकारी")}</CardTitle>
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
                    data-testid="input-purchase-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="farmerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Farmer Name", "किसान का नाम")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter farmer name", "किसान का नाम दर्ज करें")} 
                    {...field} 
                    data-testid="input-farmer-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="farmerContact"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Contact Number", "संपर्क नंबर")}</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter contact number", "संपर्क नंबर दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    data-testid="input-farmer-contact"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="village"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Village", "गाँव")}</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter village", "गाँव दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    data-testid="input-village"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tehsil"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Tehsil", "तहसील")}</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter tehsil", "तहसील दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    data-testid="input-tehsil"
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
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-district">
                      <SelectValue placeholder={t("Select district", "जिला चुनें")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DISTRICTS.map((district) => (
                      <SelectItem key={district} value={district}>
                        {district}
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
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("State", "राज्य")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-state">
                      <SelectValue placeholder={t("Select state", "राज्य चुनें")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
