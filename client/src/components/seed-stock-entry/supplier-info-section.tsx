import { useState, useEffect, useRef, useCallback } from "react";
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

interface SupplierSuggestion {
  supplierName: string;
  supplierContact: string | null;
  address: string | null;
  district: string;
  state: string;
}

interface SupplierInfoSectionProps {
  form: UseFormReturn<SeedStockEntryForm>;
}

export function SupplierInfoSection({ form }: SupplierInfoSectionProps) {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = useState<SupplierSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeField, setActiveField] = useState<'name' | 'contact' | 'address' | null>(null);
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchSuppliers = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`/api/suppliers/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      }
    } catch (error) {
      console.error("Error searching suppliers:", error);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchSuppliers(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, searchSuppliers]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const suggestionElements = document.querySelectorAll('[data-supplier-suggestion-dropdown]');
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

  const handleSelectSupplier = (supplier: SupplierSuggestion) => {
    const fieldsToHighlight = new Set<string>();
    
    form.setValue("supplierName", supplier.supplierName);
    fieldsToHighlight.add("supplierName");
    
    if (supplier.supplierContact) {
      form.setValue("supplierContact", supplier.supplierContact);
      fieldsToHighlight.add("supplierContact");
    }
    if (supplier.address) {
      form.setValue("address", supplier.address);
      fieldsToHighlight.add("address");
    }
    if (supplier.district) {
      form.setValue("district", supplier.district);
      fieldsToHighlight.add("district");
    }
    if (supplier.state) {
      form.setValue("state", supplier.state);
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

  const getHighlightClass = (fieldName: string) => {
    return highlightedFields.has(fieldName) 
      ? "ring-2 ring-green-500 bg-green-50 dark:bg-green-900/20 transition-all duration-300" 
      : "";
  };

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
              <FormItem className="relative">
                <FormLabel>{t("Supplier Name", "आपूर्तिकर्ता का नाम")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter supplier name", "आपूर्तिकर्ता का नाम दर्ज करें")} 
                    {...field}
                    className={getHighlightClass("supplierName")}
                    onChange={(e) => {
                      field.onChange(e);
                      setSearchQuery(e.target.value);
                      setActiveField('name');
                      setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      setActiveField('name');
                      if (field.value && field.value.length >= 1) {
                        setSearchQuery(field.value);
                        setShowSuggestions(true);
                      }
                    }}
                    autoComplete="off"
                    data-testid="input-supplier-name"
                  />
                </FormControl>
                {showSuggestions && activeField === 'name' && suggestions.length > 0 && (
                  <div 
                    data-supplier-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {suggestions.map((supplier, index) => (
                      <div
                        key={`${supplier.supplierName}-${supplier.address}-${index}`}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSupplier(supplier);
                        }}
                        data-testid={`suggestion-supplier-${index}`}
                      >
                        <div className="font-medium">{supplier.supplierName}</div>
                        <div className="text-xs text-muted-foreground">
                          {supplier.address && <span>{supplier.address}</span>}
                          {supplier.address && supplier.district && <span> • </span>}
                          {supplier.district && <span>{supplier.district}</span>}
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
            name="supplierContact"
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
                    className={getHighlightClass("supplierContact")}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      field.onChange(val);
                      setSearchQuery(val);
                      setActiveField('contact');
                      setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      setActiveField('contact');
                      if (field.value && field.value.length >= 1) {
                        setSearchQuery(field.value);
                        setShowSuggestions(true);
                      }
                    }}
                    autoComplete="off"
                    data-testid="input-supplier-contact"
                  />
                </FormControl>
                {showSuggestions && activeField === 'contact' && suggestions.length > 0 && (
                  <div 
                    data-supplier-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {suggestions.map((supplier, index) => (
                      <div
                        key={`${supplier.supplierName}-${supplier.address}-${index}`}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSupplier(supplier);
                        }}
                        data-testid={`suggestion-contact-${index}`}
                      >
                        <div className="font-medium">{supplier.supplierContact || supplier.supplierName}</div>
                        <div className="text-xs text-muted-foreground">
                          {supplier.supplierName}
                          {supplier.district && <span> • {supplier.district}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {field.value && field.value.length > 0 && field.value.length < 10 && (
                  <p className="text-xs text-destructive mt-1" data-testid="warning-supplier-contact-invalid">
                    {t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem className="relative">
                <FormLabel>{t("Address", "पता")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter address", "पता दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    className={getHighlightClass("address")}
                    onChange={(e) => {
                      field.onChange(e);
                      setSearchQuery(e.target.value);
                      setActiveField('address');
                      setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      setActiveField('address');
                      if (field.value && field.value.length >= 1) {
                        setSearchQuery(field.value);
                        setShowSuggestions(true);
                      }
                    }}
                    autoComplete="off"
                    data-testid="input-supplier-address"
                  />
                </FormControl>
                {showSuggestions && activeField === 'address' && suggestions.length > 0 && (
                  <div 
                    data-supplier-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {suggestions.map((supplier, index) => (
                      <div
                        key={`${supplier.supplierName}-${supplier.address}-${index}`}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSupplier(supplier);
                        }}
                        data-testid={`suggestion-address-${index}`}
                      >
                        <div className="font-medium">{supplier.address || supplier.supplierName}</div>
                        <div className="text-xs text-muted-foreground">
                          {supplier.supplierName}
                          {supplier.supplierContact && <span> • {supplier.supplierContact}</span>}
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
            name="district"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("District", "जिला")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter district", "जिला दर्ज करें")} 
                    {...field}
                    className={getHighlightClass("district")}
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
                    className={getHighlightClass("state")}
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
