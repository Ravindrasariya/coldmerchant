import { useState, useEffect, useRef } from "react";
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
import { StockEntryForm, POTATO_TYPES, HARVEST_POTATO_TYPES, QUALITY_OPTIONS, SIZE_OPTIONS, CHARGE_TYPES, BAG_TYPE_SUGGESTIONS } from "@shared/schema";
import { BagBreakdownRow } from "./bag-breakdown-row";
import { useLanguage } from "@/hooks/use-language";

interface LotCardProps {
  form: UseFormReturn<StockEntryForm>;
  lotIndex: number;
  onRemove: () => void;
  canRemove: boolean;
}

function BagTypeField({ form, lotIndex }: { form: UseFormReturn<StockEntryForm>; lotIndex: number }) {
  const { t } = useLanguage();
  const [bagTypeOpen, setBagTypeOpen] = useState(false);
  const bagTypeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bagTypeRef.current && !bagTypeRef.current.contains(e.target as Node)) {
        setBagTypeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <FormField
      control={form.control}
      name={`lots.${lotIndex}.bagType`}
      render={({ field }) => {
        const filteredSuggestions = BAG_TYPE_SUGGESTIONS.filter(s =>
          !field.value || s.toLowerCase().includes((field.value || "").toLowerCase())
        );
        return (
          <FormItem>
            <FormLabel>{t("Bag Type", "बोरी का प्रकार")}</FormLabel>
            <div ref={bagTypeRef} className="relative">
              <FormControl>
                <Input
                  placeholder={t("e.g. Jute, Shakti", "जैसे जूट, शक्ति")}
                  {...field}
                  value={field.value || ""}
                  onChange={(e) => {
                    field.onChange(e);
                    setBagTypeOpen(true);
                  }}
                  onFocus={() => setBagTypeOpen(true)}
                  autoComplete="off"
                  data-testid={`input-bag-type-${lotIndex}`}
                />
              </FormControl>
              {bagTypeOpen && filteredSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-36 overflow-y-auto">
                  {filteredSuggestions.map((suggestion) => (
                    <div
                      key={suggestion}
                      className="px-3 py-1.5 hover:bg-muted cursor-pointer text-sm border-b last:border-b-0"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        field.onChange(suggestion);
                        setBagTypeOpen(false);
                      }}
                      data-testid={`suggestion-bag-type-${lotIndex}-${suggestion}`}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

export function LotCard({ form, lotIndex, onRemove, canRemove }: LotCardProps) {
  const { t } = useLanguage();
  const { fields: breakdownFields, append: appendBreakdown, remove: removeBreakdown } = useFieldArray({
    control: form.control,
    name: `lots.${lotIndex}.bagBreakdowns`,
  });

  const { fields: chargeFields, append: appendCharge, remove: removeCharge } = useFieldArray({
    control: form.control,
    name: `lots.${lotIndex}.charges`,
  });

  const handleAddCharge = () => {
    appendCharge({ type: "", amount: undefined as any, coldStoreName: "", coldStoreDbId: undefined });
  };

  const [chargeCSDropdownOpen, setChargeCSDropdownOpen] = useState<number | null>(null);
  const [chargeCSSearch, setChargeCSSearch] = useState("");
  const chargeCSDropdownRefs = useRef<{[key: number]: HTMLDivElement | null}>({});
  const coldStoreChargeTypes = ["Cold Charges", "Ware House Charges"];

  const [allColdStores, setAllColdStores] = useState<{id: number, name: string}[]>([]);
  const [showColdStoreDropdown, setShowColdStoreDropdown] = useState(false);
  const [coldStoreSearch, setColdStoreSearch] = useState("");
  const coldStoreDropdownRef = useRef<HTMLDivElement>(null);

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
      if (chargeCSDropdownOpen !== null) {
        const ref = chargeCSDropdownRefs.current[chargeCSDropdownOpen];
        if (ref && !ref.contains(event.target as Node)) {
          setChargeCSDropdownOpen(null);
          setChargeCSSearch("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [chargeCSDropdownOpen]);

  const filteredColdStores = allColdStores.filter(cs =>
    !coldStoreSearch || cs.name.toLowerCase().includes(coldStoreSearch.toLowerCase())
  );

  const handleSelectColdStore = (selected: {id: number, name: string}) => {
    form.setValue(`lots.${lotIndex}.coldStoreName`, selected.name);
    form.setValue(`lots.${lotIndex}.coldStoreDbId`, selected.id);
    setShowColdStoreDropdown(false);
    setColdStoreSearch("");
  };

  const place = form.watch(`lots.${lotIndex}.place`) || "cold_store";
  const crop = form.watch(`lots.${lotIndex}.crop`) || "potato";
  const cutType = form.watch(`lots.${lotIndex}.cutType`);
  const originalBags = form.watch(`lots.${lotIndex}.originalBags`) || 0;
  const totalWeight = form.watch(`lots.${lotIndex}.totalWeight`);

  const mandiCommission = form.watch(`lots.${lotIndex}.mandiCommissionPercent`);
  const aadhatCommission = form.watch(`lots.${lotIndex}.aadhatCommissionPercent`);
  const hammali = form.watch(`lots.${lotIndex}.hammaliPerBag`);

  useEffect(() => {
    if (place === "mandi") {
      const savedMandi = localStorage.getItem("vyapar_mandi_commission");
      const savedAadhat = localStorage.getItem("vyapar_aadhat_commission");
      const savedHammali = localStorage.getItem("vyapar_hammali_per_bag");
      const currentMandi = parseFloat(String(form.getValues(`lots.${lotIndex}.mandiCommissionPercent`) ?? "0"));
      const currentAadhat = parseFloat(String(form.getValues(`lots.${lotIndex}.aadhatCommissionPercent`) ?? "0"));
      const currentHammali = parseFloat(String(form.getValues(`lots.${lotIndex}.hammaliPerBag`) ?? "0"));
      if (savedMandi && currentMandi === 0) form.setValue(`lots.${lotIndex}.mandiCommissionPercent`, parseFloat(savedMandi) as any);
      if (savedAadhat && currentAadhat === 0) form.setValue(`lots.${lotIndex}.aadhatCommissionPercent`, parseFloat(savedAadhat) as any);
      if (savedHammali && currentHammali === 0) form.setValue(`lots.${lotIndex}.hammaliPerBag`, parseFloat(savedHammali) as any);
    }
  }, [place, lotIndex, form]);

  useEffect(() => {
    if (place === "mandi") {
      const mc = parseFloat(String(mandiCommission || "0"));
      const ac = parseFloat(String(aadhatCommission || "0"));
      const hm = parseFloat(String(hammali || "0"));
      if (mc > 0) localStorage.setItem("vyapar_mandi_commission", String(mc));
      if (ac > 0) localStorage.setItem("vyapar_aadhat_commission", String(ac));
      if (hm > 0) localStorage.setItem("vyapar_hammali_per_bag", String(hm));
    }
  }, [place, mandiCommission, aadhatCommission, hammali]);

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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {place === "cold_store" && (
            <>
              <FormField
                control={form.control}
                name={`lots.${lotIndex}.coldStoreName`}
                render={({ field }) => (
                  <FormItem className="relative">
                    <FormLabel>{t("Cold Store Name", "कोल्ड स्टोर का नाम")} *</FormLabel>
                    <div ref={coldStoreDropdownRef} className="relative">
                      <FormControl>
                        <div
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => setShowColdStoreDropdown(!showColdStoreDropdown)}
                          data-testid={`input-cold-store-${lotIndex}`}
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
                              data-testid={`search-cold-store-${lotIndex}`}
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
                                data-testid={`suggestion-coldstore-${lotIndex}-${index}`}
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
                name={`lots.${lotIndex}.coldStoreLotNumber`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Cold Store Lot #", "कोल्ड स्टोर लॉट #")}</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder={t("Enter lot number", "लॉट नंबर दर्ज करें")} 
                        {...field}
                        value={field.value || ""}
                        data-testid={`input-cold-store-lot-number-${lotIndex}`}
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

          {crop === "potato" && (
            <>
              <FormField
                control={form.control}
                name={`lots.${lotIndex}.potatoType`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Variety", "किस्म")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid={`select-variety-${lotIndex}`}>
                          <SelectValue placeholder={t("Select variety", "किस्म चुनें")} />
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
                name={`lots.${lotIndex}.harvestPotatoType`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Potato Type", "आलू का प्रकार")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid={`select-potato-type-${lotIndex}`}>
                          <SelectValue placeholder={t("Select type", "प्रकार चुनें")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {HARVEST_POTATO_TYPES.map((type) => (
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
            </>
          )}

          <BagTypeField form={form} lotIndex={lotIndex} />

          <FormField
            control={form.control}
            name={`lots.${lotIndex}.quality`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Quality", "गुणवत्ता")}</FormLabel>
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
                <FormLabel>{t("Delivery Type", "डिलीवरी प्रकार")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={place === "mandi"}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-delivery-type-${lotIndex}`}>
                      <SelectValue placeholder={t("Select delivery type", "डिलीवरी प्रकार चुनें")} />
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
                        type="number"
                        step="any"
                        placeholder="" 
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value));
                        }}
                        data-testid={`input-price-per-kg-${lotIndex}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`lots.${lotIndex}.totalWeight`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Total Weight (Kg)", "कुल वजन (किलो)")}</FormLabel>
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
                        data-testid={`input-total-weight-${lotIndex}`}
                      />
                    </FormControl>
                    {totalWeight && originalBags > 0 && (
                      <p className="text-xs font-semibold text-orange-600 mt-1" data-testid={`text-avg-weight-${lotIndex}`}>
                        {t("Avg. Weight", "औसत वजन")} {parseFloat((totalWeight / originalBags).toFixed(1))} Kg
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

        </div>

        {place === "mandi" ? (
          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-medium">{t("Mandi Charges", "मंडी शुल्क")}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name={`lots.${lotIndex}.mandiCommissionPercent`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Mandi Commission %", "मंडी कमीशन %")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0"
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : parseFloat(e.target.value);
                          field.onChange(val);
                        }}
                        data-testid={`input-mandi-commission-${lotIndex}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`lots.${lotIndex}.aadhatCommissionPercent`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Aadhat Commission %", "आढ़त कमीशन %")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0"
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : parseFloat(e.target.value);
                          field.onChange(val);
                        }}
                        data-testid={`input-aadhat-commission-${lotIndex}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`lots.${lotIndex}.hammaliPerBag`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Hammali / Bag", "हम्माली / बोरी")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0"
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : parseFloat(e.target.value);
                          field.onChange(val);
                        }}
                        data-testid={`input-hammali-per-bag-${lotIndex}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`lots.${lotIndex}.mandiExtraCharges`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Extra Charges", "अतिरिक्त शुल्क")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0"
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : parseFloat(e.target.value);
                          field.onChange(val);
                        }}
                        data-testid={`input-mandi-extra-charges-${lotIndex}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">{t("Charges", "शुल्क")}</h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCharge}
                data-testid={`button-add-charge-${lotIndex}`}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Charges", "शुल्क जोड़ें")}
              </Button>
            </div>

            {chargeFields.length > 0 && (
              <div className="space-y-3">
                {chargeFields.map((chargeField, chargeIndex) => {
                  const chargeType = form.watch(`lots.${lotIndex}.charges.${chargeIndex}.type`);
                  const isEarlyPay = chargeType === "Early Pay/Bataw";
                  const showCSDropdown = place === "farm_gate" && coldStoreChargeTypes.includes(chargeType);
                  const chargeFilteredCS = allColdStores.filter(cs =>
                    !chargeCSSearch || cs.name.toLowerCase().includes(chargeCSSearch.toLowerCase())
                  );
                  return (
                  <div key={chargeField.id}>
                    <div className="flex items-end gap-3">
                      <FormField
                        control={form.control}
                        name={`lots.${lotIndex}.charges.${chargeIndex}.type`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            {chargeIndex === 0 && (
                              <FormLabel>{t("Charge Type", "शुल्क प्रकार")} *</FormLabel>
                            )}
                            <Select 
                              onValueChange={(v) => {
                                const oldVal = field.value;
                                field.onChange(v);
                                if (!coldStoreChargeTypes.includes(v)) {
                                  form.setValue(`lots.${lotIndex}.charges.${chargeIndex}.coldStoreName`, "");
                                  form.setValue(`lots.${lotIndex}.charges.${chargeIndex}.coldStoreDbId`, undefined);
                                }
                                if (oldVal === "Early Pay/Bataw" && v !== "Early Pay/Bataw") {
                                  form.setValue(`lots.${lotIndex}.earlyPayPercent`, null);
                                }
                                if (v === "Early Pay/Bataw") {
                                  const amt = form.getValues(`lots.${lotIndex}.charges.${chargeIndex}.amount`);
                                  form.setValue(`lots.${lotIndex}.earlyPayPercent`, amt ? parseFloat(String(amt)) : null);
                                }
                              }} 
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger className="text-left" data-testid={`select-charge-type-${lotIndex}-${chargeIndex}`}>
                                  <SelectValue placeholder={t("Select charge type", "शुल्क प्रकार चुनें")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {CHARGE_TYPES.map((type) => (
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
                      {isEarlyPay ? (
                        <>
                          <FormField
                            control={form.control}
                            name={`lots.${lotIndex}.charges.${chargeIndex}.amount`}
                            render={({ field }) => (
                              <FormItem className="w-24">
                                {chargeIndex === 0 && (
                                  <FormLabel>% *</FormLabel>
                                )}
                                <FormControl>
                                  <Input 
                                    type="number"
                                    step="any"
                                    placeholder="0" 
                                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    {...field}
                                    value={field.value || ""}
                                    onChange={(e) => {
                                      const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                      field.onChange(val);
                                      form.setValue(`lots.${lotIndex}.earlyPayPercent`, val ?? null);
                                    }}
                                    data-testid={`input-early-pay-percent-${lotIndex}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="w-28">
                            {chargeIndex === 0 && (
                              <p className="text-sm font-medium mb-1.5">{t("Amount", "राशि")}</p>
                            )}
                            <p className="text-sm font-mono font-semibold h-9 flex items-center" data-testid={`text-early-pay-amount-${lotIndex}`}>
                              {(() => {
                                const pct = parseFloat(String(form.watch(`lots.${lotIndex}.charges.${chargeIndex}.amount`) || "0"));
                                if (!pct) return "₹0";
                                const bds = form.watch(`lots.${lotIndex}.bagBreakdowns`) || [];
                                const bags = form.watch(`lots.${lotIndex}.originalBags`) || 0;
                                const sellable = bds.filter((bd: any) => bd.size !== "Wastage");
                                const hasBd = sellable.some((bd: any) => (parseFloat(String(bd.weight || 0)) > 0 && parseFloat(String(bd.pricePerKg || 0)) > 0));
                                let cogs = 0;
                                if (hasBd) {
                                  for (const bd of sellable) {
                                    const w = parseFloat(String(bd.weight || 0));
                                    const p = parseFloat(String(bd.pricePerKg || 0));
                                    const nw = w > 0 ? w - (bd.numberOfBags || 0) : 0;
                                    if (nw > 0 && p > 0) cogs += nw * p;
                                  }
                                } else {
                                  const w = parseFloat(String(form.watch(`lots.${lotIndex}.totalWeight`) || 0));
                                  const p = parseFloat(String(form.watch(`lots.${lotIndex}.pricePerKg`) || 0));
                                  const nw = w > 0 ? w - bags : 0;
                                  if (nw > 0 && p > 0) cogs = nw * p;
                                }
                                const isFG = place === "farm_gate";
                                const cstTypes = ["Cold Charges", "Ware House Charges"];
                                const chgs = form.watch(`lots.${lotIndex}.charges`) || [];
                                const dynChg = chgs.filter((c: any) => c.type !== "Early Pay/Bataw" && !(isFG && cstTypes.includes(c.type))).reduce((s: number, c: any) => s + (parseFloat(String(c.amount)) || 0), 0);
                                const hammali = parseFloat(String(form.watch(`lots.${lotIndex}.hammaliGradingCharges`) || "0"));
                                const otherDed = hammali + dynChg;
                                const base = cogs - otherDed;
                                const amt = base > 0 ? base * pct / 100 : 0;
                                return `₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
                              })()}
                            </p>
                          </div>
                        </>
                      ) : (
                        <FormField
                          control={form.control}
                          name={`lots.${lotIndex}.charges.${chargeIndex}.amount`}
                          render={({ field }) => (
                            <FormItem className="w-32">
                              {chargeIndex === 0 && (
                                <FormLabel>{t("Amount", "राशि")} *</FormLabel>
                              )}
                              <FormControl>
                                <Input 
                                  type="number"
                                  step="any"
                                  placeholder="0" 
                                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  {...field}
                                  value={field.value || ""}
                                  onChange={(e) => {
                                    field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value));
                                  }}
                                  data-testid={`input-charge-amount-${lotIndex}-${chargeIndex}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (chargeType === "Early Pay/Bataw") {
                            form.setValue(`lots.${lotIndex}.earlyPayPercent`, null);
                          }
                          removeCharge(chargeIndex);
                        }}
                        className="text-destructive h-9 w-9"
                        data-testid={`button-remove-charge-${lotIndex}-${chargeIndex}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {showCSDropdown && (
                      <FormField
                        control={form.control}
                        name={`lots.${lotIndex}.charges.${chargeIndex}.coldStoreName`}
                        render={({ field }) => (
                          <FormItem className="mt-2 ml-0">
                            <div ref={(el) => { chargeCSDropdownRefs.current[chargeIndex] = el; }} className="relative">
                              <div
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                                onClick={() => {
                                  setChargeCSDropdownOpen(chargeCSDropdownOpen === chargeIndex ? null : chargeIndex);
                                  setChargeCSSearch("");
                                }}
                                data-testid={`select-charge-coldstore-${lotIndex}-${chargeIndex}`}
                              >
                                <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                                  {field.value || t("Select cold store", "कोल्ड स्टोर चुनें")}
                                </span>
                              </div>
                              {chargeCSDropdownOpen === chargeIndex && (
                                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg">
                                  <div className="p-2 border-b">
                                    <Input
                                      placeholder={t("Search cold store...", "कोल्ड स्टोर खोजें...")}
                                      value={chargeCSSearch}
                                      onChange={(e) => setChargeCSSearch(e.target.value)}
                                      autoFocus
                                      className="h-8"
                                    />
                                  </div>
                                  <div className="max-h-36 overflow-y-auto">
                                    {chargeFilteredCS.length > 0 ? chargeFilteredCS.map((cs) => (
                                      <div
                                        key={cs.id}
                                        className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground border-b last:border-b-0"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          form.setValue(`lots.${lotIndex}.charges.${chargeIndex}.coldStoreName`, cs.name);
                                          form.setValue(`lots.${lotIndex}.charges.${chargeIndex}.coldStoreDbId`, cs.id);
                                          setChargeCSDropdownOpen(null);
                                          setChargeCSSearch("");
                                        }}
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
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
