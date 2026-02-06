import { useState, useEffect, useRef, useCallback } from "react";
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
import { cn } from "@/lib/utils";

interface FarmerInfoSectionProps {
  form: UseFormReturn<StockEntryForm>;
}

interface FarmerSuggestion {
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  source: 'stock_entry' | 'seed_transaction';
}

export function FarmerInfoSection({ form }: FarmerInfoSectionProps) {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = useState<FarmerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeField, setActiveField] = useState<'name' | 'contact' | 'village' | null>(null);
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchFarmers = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`/api/farmers/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      }
    } catch (error) {
      console.error("Error searching farmers:", error);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchFarmers(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, searchFarmers]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const suggestionElements = document.querySelectorAll('[data-suggestion-dropdown]');
      let isInsideSuggestion = false;
      suggestionElements.forEach(el => {
        if (el.contains(target)) {
          isInsideSuggestion = true;
        }
      });
      if (!isInsideSuggestion) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectFarmer = (farmer: FarmerSuggestion) => {
    const fieldsToHighlight = new Set<string>();
    
    form.setValue("farmerName", farmer.farmerName);
    fieldsToHighlight.add("farmerName");
    
    if (farmer.farmerContact) {
      form.setValue("farmerContact", farmer.farmerContact);
      fieldsToHighlight.add("farmerContact");
    }
    if (farmer.village) {
      form.setValue("village", farmer.village);
      fieldsToHighlight.add("village");
    }
    if (farmer.tehsil) {
      form.setValue("tehsil", farmer.tehsil);
      fieldsToHighlight.add("tehsil");
    }
    if (farmer.district) {
      form.setValue("district", farmer.district);
      fieldsToHighlight.add("district");
    }
    if (farmer.state) {
      form.setValue("state", farmer.state);
      fieldsToHighlight.add("state");
    }
    
    setHighlightedFields(fieldsToHighlight);
    setShowSuggestions(false);
    setSuggestions([]);
    setSearchQuery("");
    
    setTimeout(() => {
      setHighlightedFields(new Set());
    }, 2000);
  };

  const handleInputChange = (value: string, field: 'name' | 'contact' | 'village') => {
    setSearchQuery(value);
    setActiveField(field);
    setShowSuggestions(true);
  };

  const getHighlightClass = (fieldName: string) => {
    return highlightedFields.has(fieldName) 
      ? "ring-2 ring-green-500 bg-green-50 dark:bg-green-950/30 transition-all duration-300" 
      : "";
  };

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
              <FormItem className="relative">
                <FormLabel>{t("Farmer Name", "किसान का नाम")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter farmer name", "किसान का नाम दर्ज करें")} 
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      handleInputChange(e.target.value, 'name');
                    }}
                    onFocus={() => {
                      setActiveField('name');
                      if (field.value && field.value.length >= 1) {
                        setSearchQuery(field.value);
                        setShowSuggestions(true);
                      }
                    }}
                    className={cn(getHighlightClass("farmerName"))}
                    autoComplete="off"
                    data-testid="input-farmer-name"
                  />
                </FormControl>
                {showSuggestions && activeField === 'name' && suggestions.length > 0 && (
                  <div 
                    data-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {suggestions.map((farmer, index) => (
                      <div
                        key={`${farmer.farmerName}-${farmer.village}-${index}`}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFarmer(farmer);
                        }}
                        data-testid={`suggestion-farmer-${index}`}
                      >
                        <div className="font-medium">{farmer.farmerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {farmer.village && <span>{farmer.village}</span>}
                          {farmer.village && farmer.farmerContact && <span> • </span>}
                          {farmer.farmerContact && <span>{farmer.farmerContact}</span>}
                        </div>
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
            name="farmerContact"
            render={({ field }) => (
              <FormItem className="relative">
                <FormLabel>{t("Contact Number", "संपर्क नंबर")} *</FormLabel>
                <FormControl>
                  <Input 
                    type="tel"
                    maxLength={10}
                    placeholder={t("Enter contact number", "संपर्क नंबर दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      field.onChange(val);
                      handleInputChange(val, 'contact');
                    }}
                    onFocus={() => {
                      setActiveField('contact');
                      if (field.value && field.value.length >= 1) {
                        setSearchQuery(field.value);
                        setShowSuggestions(true);
                      }
                    }}
                    className={cn(getHighlightClass("farmerContact"))}
                    autoComplete="off"
                    data-testid="input-farmer-contact"
                  />
                </FormControl>
                {showSuggestions && activeField === 'contact' && suggestions.length > 0 && (
                  <div 
                    data-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {suggestions.map((farmer, index) => (
                      <div
                        key={`${farmer.farmerName}-${farmer.village}-${index}`}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFarmer(farmer);
                        }}
                        data-testid={`suggestion-contact-${index}`}
                      >
                        <div className="font-medium">{farmer.farmerContact || farmer.farmerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {farmer.farmerName}
                          {farmer.village && <span> • {farmer.village}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {field.value && field.value.length > 0 && field.value.length < 10 && (
                  <p className="text-xs text-destructive mt-1" data-testid="warning-contact-invalid">
                    {t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="village"
            render={({ field }) => (
              <FormItem className="relative">
                <FormLabel>{t("Village", "गाँव")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter village", "गाँव दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    onChange={(e) => {
                      field.onChange(e);
                      handleInputChange(e.target.value, 'village');
                    }}
                    onFocus={() => {
                      setActiveField('village');
                      if (field.value && field.value.length >= 1) {
                        setSearchQuery(field.value);
                        setShowSuggestions(true);
                      }
                    }}
                    className={cn(getHighlightClass("village"))}
                    autoComplete="off"
                    data-testid="input-village"
                  />
                </FormControl>
                {showSuggestions && activeField === 'village' && suggestions.length > 0 && (
                  <div 
                    data-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {suggestions.map((farmer, index) => (
                      <div
                        key={`${farmer.farmerName}-${farmer.village}-${index}`}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFarmer(farmer);
                        }}
                        data-testid={`suggestion-village-${index}`}
                      >
                        <div className="font-medium">{farmer.village || farmer.farmerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {farmer.farmerName}
                          {farmer.farmerContact && <span> • {farmer.farmerContact}</span>}
                        </div>
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
            name="tehsil"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Tehsil", "तहसील")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter tehsil", "तहसील दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    className={cn(getHighlightClass("tehsil"))}
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
                    <SelectTrigger 
                      className={cn(getHighlightClass("district"))}
                      data-testid="select-district"
                    >
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
                    <SelectTrigger 
                      className={cn(getHighlightClass("state"))}
                      data-testid="select-state"
                    >
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
