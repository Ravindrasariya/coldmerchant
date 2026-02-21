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
import { Store, AlertTriangle } from "lucide-react";
import { StockEntryForm } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface AadhtiyaInfoSectionProps {
  form: UseFormReturn<StockEntryForm>;
}

interface AadhatSuggestion {
  id: number;
  name: string;
  address: string;
  contact: string | null;
  redFlag: boolean | null;
}

export function AadhtiyaInfoSection({ form }: AadhtiyaInfoSectionProps) {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = useState<AadhatSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [redFlagWarning, setRedFlagWarning] = useState<string | null>(null);
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchAadhats = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`/api/aadhats`);
      if (response.ok) {
        const data: AadhatSuggestion[] = await response.json();
        const filtered = data.filter(a =>
          a.name.toLowerCase().includes(query.toLowerCase()) ||
          (a.address && a.address.toLowerCase().includes(query.toLowerCase()))
        );
        setSuggestions(filtered);
      }
    } catch (error) {
      console.error("Error searching aadhats:", error);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchAadhats(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, searchAadhats]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const suggestionElements = document.querySelectorAll('[data-aadhat-suggestion-dropdown]');
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

  const handleSelectAadhat = (aadhat: AadhatSuggestion) => {
    const fieldsToHighlight = new Set<string>();

    form.setValue("aadhatDbId", aadhat.id);
    form.setValue("aadhatName", aadhat.name);
    fieldsToHighlight.add("aadhatName");

    setHighlightedFields(fieldsToHighlight);
    if (aadhat.redFlag) {
      setRedFlagWarning(aadhat.name);
    } else {
      setRedFlagWarning(null);
    }
    setShowSuggestions(false);
    setSuggestions([]);
    setSearchQuery("");

    setTimeout(() => {
      setHighlightedFields(new Set());
    }, 2000);
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
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500/10">
            <Store className="h-4 w-4 text-orange-600" />
          </div>
          <CardTitle className="text-lg font-medium">{t("Aadhtiya Details", "आढ़तिया विवरण")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    data-testid="input-purchase-date-mandi"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="aadhatName"
            render={({ field }) => (
              <FormItem className="relative">
                <FormLabel>{t("Aadhtiya Name", "आढ़तिया का नाम")} *</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("Search aadhtiya name", "आढ़तिया का नाम खोजें")}
                    {...field}
                    value={field.value || ""}
                    onChange={(e) => {
                      field.onChange(e);
                      setSearchQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      if (field.value && field.value.length >= 1) {
                        setSearchQuery(field.value);
                        setShowSuggestions(true);
                      }
                    }}
                    className={cn(getHighlightClass("aadhatName"))}
                    autoComplete="off"
                    data-testid="input-aadhtiya-name"
                  />
                </FormControl>
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    data-aadhat-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {suggestions.map((aadhat, index) => (
                      <div
                        key={`${aadhat.id}-${index}`}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectAadhat(aadhat);
                        }}
                        data-testid={`suggestion-aadhat-${index}`}
                      >
                        <div className="text-sm font-medium flex items-center">
                          {aadhat.name}
                          {aadhat.redFlag && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                              Red Flag
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {aadhat.address}
                          {aadhat.contact && <span> • {aadhat.contact}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {redFlagWarning && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-3 py-2 text-sm text-orange-700 dark:text-orange-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{redFlagWarning} {t("is marked as Red Flag", "रेड फ्लैग के रूप में चिह्नित है")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
