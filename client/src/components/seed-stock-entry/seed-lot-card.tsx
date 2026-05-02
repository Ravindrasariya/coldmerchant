import { useState, useEffect, useRef } from "react";
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
import { SeedStockEntryForm, SEED_POTATO_TYPES, SEED_SIZE_OPTIONS } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

interface SeedLotCardProps {
  form: UseFormReturn<SeedStockEntryForm>;
  lotIndex: number;
  onRemove: () => void;
  canRemove: boolean;
}

export function SeedLotCard({ form, lotIndex, onRemove, canRemove }: SeedLotCardProps) {
  const { t } = useLanguage();

  const [allColdStores, setAllColdStores] = useState<{id: number, name: string}[]>([]);
  const [showColdStoreDropdown, setShowColdStoreDropdown] = useState(false);
  const [coldStoreSearch, setColdStoreSearch] = useState("");
  const coldStoreDropdownRef = useRef<HTMLDivElement>(null);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const fetchColdStores = async () => {
      try {
        const response = await fetch("/api/cold-stores/search?q=");
        if (response.ok) {
          const data = await response.json();
          setAllColdStores(data);
        }
      } catch (error) {
        console.error("Error fetching cold stores:", error);
      }
    };
    fetchColdStores();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (coldStoreDropdownRef.current && !coldStoreDropdownRef.current.contains(event.target as Node)) {
        setShowColdStoreDropdown(false);
        setColdStoreSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredColdStores = allColdStores.filter(cs =>
    !coldStoreSearch || cs.name.toLowerCase().includes(coldStoreSearch.toLowerCase())
  );

  const handleSelectColdStore = (selected: {id: number, name: string}) => {
    form.setValue(`seedLots.${lotIndex}.coldStoreName`, selected.name);
    form.setValue(`seedLots.${lotIndex}.coldStoreDbId`, selected.id);
    setShowColdStoreDropdown(false);
    setColdStoreSearch("");
  };

  // Fetch brand suggestions on mount
  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const response = await fetch("/api/seed-brands/search");
        if (response.ok) {
          const data = await response.json();
          setBrandSuggestions(data);
        }
      } catch (error) {
        console.error("Error fetching brand suggestions:", error);
      }
    };
    fetchBrands();
  }, []);

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FormField
            control={form.control}
            name={`seedLots.${lotIndex}.coldStoreName`}
            render={({ field }) => (
              <FormItem className="relative">
                <FormLabel>{t("Cold Store Name", "कोल्ड स्टोर का नाम")} *</FormLabel>
                <div ref={coldStoreDropdownRef} className="relative">
                  <FormControl>
                    <div
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => setShowColdStoreDropdown(!showColdStoreDropdown)}
                      data-testid={`input-seed-cold-store-${lotIndex}`}
                    >
                      <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                        {field.value || t("Select cold store", "कोल्ड स्टोर चुनें")}
                      </span>
                    </div>
                  </FormControl>
                  {showColdStoreDropdown && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg">
                      <div className="p-2 border-b">
                        <Input
                          placeholder={t("Search cold store...", "कोल्ड स्टोर खोजें...")}
                          value={coldStoreSearch}
                          onChange={(e) => setColdStoreSearch(e.target.value)}
                          autoFocus
                          className="h-8"
                          data-testid={`search-seed-cold-store-${lotIndex}`}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredColdStores.length > 0 ? filteredColdStores.map((cs, index) => (
                          <div
                            key={cs.id}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground border-b last:border-b-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectColdStore(cs);
                            }}
                            data-testid={`suggestion-seed-coldstore-${lotIndex}-${index}`}
                          >
                            <div className="font-medium">{cs.name}</div>
                          </div>
                        )) : (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            {t("No cold stores found", "कोई कोल्ड स्टोर नहीं मिला")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
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
                <FormLabel>{t("Variety", "किस्म")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-seed-potato-type-${lotIndex}`}>
                      <SelectValue placeholder={t("Select variety", "किस्म चुनें")} />
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
                <FormLabel>{t("Potato Type", "आलू का प्रकार")} *</FormLabel>
                <FormControl>
                  <>
                    <Input
                      list={`bagTypeSuggestions-${lotIndex}`}
                      placeholder={t("e.g. 50kg, Jute", "जैसे 50kg, Jute")}
                      {...field}
                      value={field.value || ""}
                      data-testid={`input-seed-bag-type-${lotIndex}`}
                    />
                    <datalist id={`bagTypeSuggestions-${lotIndex}`}>
                      <option value="50kg" />
                      <option value="Jute" />
                      <option value="Wafer" />
                      <option value="Ration" />
                      <option value="HDPE" />
                    </datalist>
                  </>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`seedLots.${lotIndex}.brandName`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Brand Name", "ब्रांड का नाम")}</FormLabel>
                <FormControl>
                  <>
                    <Input
                      list={`brandSuggestions-${lotIndex}`}
                      placeholder={t("Enter brand name", "ब्रांड का नाम दर्ज करें")}
                      {...field}
                      value={field.value || ""}
                      data-testid={`input-seed-brand-${lotIndex}`}
                    />
                    <datalist id={`brandSuggestions-${lotIndex}`}>
                      {brandSuggestions.map((brand) => (
                        <option key={brand} value={brand} />
                      ))}
                    </datalist>
                  </>
                </FormControl>
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
                    type="number"
                    step="any"
                    placeholder="" 
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value));
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
                    type="number"
                    step="any"
                    placeholder="" 
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value));
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
              <FormItem className="w-full md:w-1/3">
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
