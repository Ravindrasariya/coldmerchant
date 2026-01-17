import { useState, useEffect, useRef, useCallback } from "react";
import { useFieldArray, UseFormReturn } from "react-hook-form";
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
import { Plus, Trash2, Package } from "lucide-react";
import { StockEntryForm, POTATO_TYPES, BAG_TYPES, QUALITY_OPTIONS, SIZE_OPTIONS } from "@shared/schema";
import { BagBreakdownRow } from "./bag-breakdown-row";
import { useLanguage } from "@/hooks/use-language";

interface LotCardProps {
  form: UseFormReturn<StockEntryForm>;
  lotIndex: number;
  onRemove: () => void;
  canRemove: boolean;
}

export function LotCard({ form, lotIndex, onRemove, canRemove }: LotCardProps) {
  const { t } = useLanguage();
  const { fields: breakdownFields, append: appendBreakdown, remove: removeBreakdown } = useFieldArray({
    control: form.control,
    name: `lots.${lotIndex}.bagBreakdowns`,
  });

  const [coldStoreSuggestions, setColdStoreSuggestions] = useState<string[]>([]);
  const [showColdStoreSuggestions, setShowColdStoreSuggestions] = useState(false);
  const [coldStoreQuery, setColdStoreQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchColdStores = useCallback(async (query: string) => {
    if (query.length < 2) {
      setColdStoreSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`/api/cold-stores/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setColdStoreSuggestions(data);
      }
    } catch (error) {
      console.error("Error searching cold stores:", error);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchColdStores(coldStoreQuery);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [coldStoreQuery, searchColdStores]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const suggestionElements = document.querySelectorAll('[data-coldstore-suggestion-dropdown]');
      let isInsideSuggestion = false;
      suggestionElements.forEach(el => {
        if (el.contains(target)) {
          isInsideSuggestion = true;
        }
      });
      if (!isInsideSuggestion) {
        setShowColdStoreSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectColdStore = (name: string) => {
    form.setValue(`lots.${lotIndex}.coldStoreName`, name);
    setShowColdStoreSuggestions(false);
    setColdStoreSuggestions([]);
    setColdStoreQuery("");
  };

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
          <CardTitle className="text-lg font-medium">{t("Lot", "लॉट")} {lotIndex + 1}</CardTitle>
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
            {t("Remove", "हटाएं")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name={`lots.${lotIndex}.coldStoreName`}
            render={({ field }) => (
              <FormItem className="relative">
                <FormLabel>{t("Cold Store Name", "कोल्ड स्टोर का नाम")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter cold store name", "कोल्ड स्टोर का नाम दर्ज करें")} 
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      setColdStoreQuery(e.target.value);
                      setShowColdStoreSuggestions(true);
                    }}
                    onFocus={() => {
                      if (field.value && field.value.length >= 2) {
                        setColdStoreQuery(field.value);
                        setShowColdStoreSuggestions(true);
                      }
                    }}
                    autoComplete="off"
                    data-testid={`input-cold-store-${lotIndex}`}
                  />
                </FormControl>
                {showColdStoreSuggestions && coldStoreSuggestions.length > 0 && (
                  <div 
                    data-coldstore-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {coldStoreSuggestions.map((name, index) => (
                      <div
                        key={`${name}-${index}`}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectColdStore(name);
                        }}
                        data-testid={`suggestion-coldstore-${lotIndex}-${index}`}
                      >
                        <div className="font-medium">{name}</div>
                      </div>
                    ))}
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`lots.${lotIndex}.originalBags`}
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
                <FormLabel>{t("Type of Potato", "आलू का प्रकार")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-potato-type-${lotIndex}`}>
                      <SelectValue placeholder={t("Select type", "प्रकार चुनें")} />
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
                <FormLabel>{t("Bag Type", "बोरी का प्रकार")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-bag-type-${lotIndex}`}>
                      <SelectValue placeholder={t("Select bag type", "बोरी का प्रकार चुनें")} />
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
                <FormLabel>{t("Quality", "गुणवत्ता")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-quality-${lotIndex}`}>
                      <SelectValue placeholder={t("Select quality", "गुणवत्ता चुनें")} />
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
                <FormLabel>{t("Cut Type", "कट प्रकार")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-cut-type-${lotIndex}`}>
                      <SelectValue placeholder={t("Select cut type", "कट प्रकार चुनें")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="gate_cut">{t("Gate Cut", "गेट कट")}</SelectItem>
                    <SelectItem value="bilty_cut">{t("Bilty Cut", "बिल्टी कट")}</SelectItem>
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
                    <FormLabel>{t("Size", "आकार")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid={`select-size-${lotIndex}`}>
                          <SelectValue placeholder={t("Select size", "आकार चुनें")} />
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
                    <FormLabel>{t("Price/kg", "मूल्य/किलो")}</FormLabel>
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

          <FormField
            control={form.control}
            name={`lots.${lotIndex}.coldStoreChargesPerBag`}
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
                    data-testid={`input-coldstore-charge-${lotIndex}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {cutType === "bilty_cut" && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">{t("Final Bags Breakdown", "अंतिम बोरी विवरण")}</h4>
                <p className="text-xs text-muted-foreground">
                  {t("Allocate", "आवंटित करें")} {originalBags} {t("bags into different sizes", "बोरी विभिन्न आकारों में")}
                  {remainingToAllocate !== 0 && (
                    <span className={remainingToAllocate < 0 ? "text-destructive ml-1" : "text-primary ml-1"}>
                      ({remainingToAllocate > 0 ? `${remainingToAllocate} ${t("remaining", "शेष")}` : `${Math.abs(remainingToAllocate)} ${t("over-allocated", "अधिक आवंटित")}`})
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
                {t("Add Row", "पंक्ति जोड़ें")}
              </Button>
            </div>

            {breakdownFields.length > 0 && (
              <div className="space-y-3">
                <div className="hidden md:grid md:grid-cols-5 gap-4 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <div>{t("Size", "आकार")}</div>
                  <div>{t("# Bags", "बोरी")}</div>
                  <div>{t("Weight (kg)", "वजन (किलो)")}</div>
                  <div>{t("Price/kg", "मूल्य/किलो")}</div>
                  <div>{t("Total", "कुल")}</div>
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
                <p className="text-sm">{t("No breakdown rows added yet", "अभी तक कोई विवरण पंक्ति नहीं जोड़ी गई")}</p>
                <p className="text-xs">{t("Click \"Add Row\" to start allocating bags", "बोरी आवंटित करने के लिए \"पंक्ति जोड़ें\" पर क्लिक करें")}</p>
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
                <FormLabel>{t("Remarks", "टिप्पणी")}</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder={t("Enter any remarks for this lot...", "इस लॉट के लिए कोई टिप्पणी दर्ज करें...")} 
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
