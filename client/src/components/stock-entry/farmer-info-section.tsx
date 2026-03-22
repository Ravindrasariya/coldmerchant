import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { UseFormReturn } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
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
import { User, AlertTriangle, Paperclip, X } from "lucide-react";
import { StockEntryForm, DISTRICTS, STATES } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface FarmerInfoSectionProps {
  form: UseFormReturn<StockEntryForm>;
  attachmentFile?: File | null;
  onAttachmentChange?: (file: File | null) => void;
}

interface FarmerSuggestion {
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  redFlag: boolean | null;
  source: 'stock_entry' | 'seed_transaction';
}

export function FarmerInfoSection({ form, attachmentFile, onAttachmentChange }: FarmerInfoSectionProps) {
  const { t } = useLanguage();
  const attachmentPreviewUrl = useMemo(() => {
    if (attachmentFile) return URL.createObjectURL(attachmentFile);
    return null;
  }, [attachmentFile]);
  useEffect(() => {
    return () => { if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl); };
  }, [attachmentPreviewUrl]);
  const [suggestions, setSuggestions] = useState<FarmerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeField, setActiveField] = useState<'name' | 'contact' | 'village' | 'tehsil' | null>(null);
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [redFlagWarning, setRedFlagWarning] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [villageSearch, setVillageSearch] = useState("");
  const [tehsilSearch, setTehsilSearch] = useState("");
  const [showVillageSuggestions, setShowVillageSuggestions] = useState(false);
  const [showTehsilSuggestions, setShowTehsilSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [selectedVillageIndex, setSelectedVillageIndex] = useState(-1);
  const villageSuggestionsRef = useRef<HTMLDivElement>(null);
  const [selectedTehsilIndex, setSelectedTehsilIndex] = useState(-1);
  const tehsilSuggestionsRef = useRef<HTMLDivElement>(null);

  const { data: distinctVillages = [] } = useQuery<string[]>({
    queryKey: ["/api/farmers/villages"],
  });

  const { data: distinctTehsils = [] } = useQuery<string[]>({
    queryKey: ["/api/farmers/tehsils"],
  });

  const filteredVillages = distinctVillages.filter(v =>
    !villageSearch || v.toLowerCase().includes(villageSearch.toLowerCase())
  );

  const filteredTehsils = distinctTehsils.filter(t =>
    !tehsilSearch || t.toLowerCase().includes(tehsilSearch.toLowerCase())
  );

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
        setShowVillageSuggestions(false);
        setShowTehsilSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setSelectedSuggestionIndex(-1);
  }, [suggestions.length, activeField, searchQuery]);

  useEffect(() => {
    setSelectedVillageIndex(-1);
  }, [filteredVillages.length, villageSearch]);

  useEffect(() => {
    setSelectedTehsilIndex(-1);
  }, [filteredTehsils.length, tehsilSearch]);

  useEffect(() => {
    if (selectedSuggestionIndex >= 0 && suggestionsRef.current) {
      const items = suggestionsRef.current.querySelectorAll('[data-suggestion-item]');
      items[selectedSuggestionIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedSuggestionIndex]);

  useEffect(() => {
    if (selectedVillageIndex >= 0 && villageSuggestionsRef.current) {
      const items = villageSuggestionsRef.current.querySelectorAll('[data-suggestion-item]');
      items[selectedVillageIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedVillageIndex]);

  useEffect(() => {
    if (selectedTehsilIndex >= 0 && tehsilSuggestionsRef.current) {
      const items = tehsilSuggestionsRef.current.querySelectorAll('[data-suggestion-item]');
      items[selectedTehsilIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedTehsilIndex]);

  const handleFarmerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      const farmer = suggestions[selectedSuggestionIndex];
      if (farmer) handleSelectFarmer(farmer);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleVillageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, fieldOnChange: (val: string) => void) => {
    if (!showVillageSuggestions || filteredVillages.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedVillageIndex(prev => (prev + 1) % filteredVillages.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedVillageIndex(prev => (prev <= 0 ? filteredVillages.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && selectedVillageIndex >= 0) {
      e.preventDefault();
      const village = filteredVillages[selectedVillageIndex];
      if (village) {
        fieldOnChange(village);
        setShowVillageSuggestions(false);
        setSelectedVillageIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowVillageSuggestions(false);
      setSelectedVillageIndex(-1);
    }
  };

  const handleTehsilKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, fieldOnChange: (val: string) => void) => {
    if (!showTehsilSuggestions || filteredTehsils.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedTehsilIndex(prev => (prev + 1) % filteredTehsils.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedTehsilIndex(prev => (prev <= 0 ? filteredTehsils.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && selectedTehsilIndex >= 0) {
      e.preventDefault();
      const tehsil = filteredTehsils[selectedTehsilIndex];
      if (tehsil) {
        fieldOnChange(tehsil);
        setShowTehsilSuggestions(false);
        setSelectedTehsilIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowTehsilSuggestions(false);
      setSelectedTehsilIndex(-1);
    }
  };

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
    if (farmer.redFlag) {
      setRedFlagWarning(farmer.farmerName);
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
                    onKeyDown={handleFarmerKeyDown}
                    className={cn(getHighlightClass("farmerName"))}
                    autoComplete="off"
                    data-testid="input-farmer-name"
                  />
                </FormControl>
                {showSuggestions && activeField === 'name' && suggestions.length > 0 && (
                  <div 
                    ref={suggestionsRef}
                    data-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {suggestions.map((farmer, index) => (
                      <div
                        key={`${farmer.farmerName}-${farmer.village}-${index}`}
                        data-suggestion-item
                        className={`px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0 ${index === selectedSuggestionIndex ? 'bg-accent' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFarmer(farmer);
                        }}
                        data-testid={`suggestion-farmer-${index}`}
                      >
                        <div className="text-sm font-medium flex items-center">
                          {farmer.farmerName}
                          {farmer.redFlag && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                              Red Flag
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {farmer.farmerContact && <span>{farmer.farmerContact}</span>}
                          {farmer.farmerContact && farmer.village && <span> • </span>}
                          {farmer.village && <span>{farmer.village}</span>}
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
                    onKeyDown={handleFarmerKeyDown}
                    className={cn(getHighlightClass("farmerContact"))}
                    autoComplete="off"
                    data-testid="input-farmer-contact"
                  />
                </FormControl>
                {showSuggestions && activeField === 'contact' && suggestions.length > 0 && (
                  <div 
                    ref={suggestionsRef}
                    data-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {suggestions.map((farmer, index) => (
                      <div
                        key={`${farmer.farmerName}-${farmer.village}-${index}`}
                        data-suggestion-item
                        className={`px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0 ${index === selectedSuggestionIndex ? 'bg-accent' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFarmer(farmer);
                        }}
                        data-testid={`suggestion-contact-${index}`}
                      >
                        <div className="text-sm font-medium">{farmer.farmerName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {farmer.farmerContact && <span>{farmer.farmerContact}</span>}
                          {farmer.farmerContact && farmer.village && <span> • </span>}
                          {farmer.village && <span>{farmer.village}</span>}
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
                      setVillageSearch(e.target.value);
                      setShowVillageSuggestions(true);
                    }}
                    onFocus={() => {
                      setVillageSearch(field.value || "");
                      setShowVillageSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowVillageSuggestions(false), 200);
                    }}
                    onKeyDown={(e) => handleVillageKeyDown(e, field.onChange)}
                    className={cn(getHighlightClass("village"))}
                    autoComplete="off"
                    data-testid="input-village"
                  />
                </FormControl>
                {showVillageSuggestions && filteredVillages.length > 0 && (
                  <div 
                    ref={villageSuggestionsRef}
                    data-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {filteredVillages.map((village, index) => (
                      <div
                        key={village}
                        data-suggestion-item
                        className={`px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0 ${index === selectedVillageIndex ? 'bg-accent' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          field.onChange(village);
                          setShowVillageSuggestions(false);
                          setSelectedVillageIndex(-1);
                        }}
                        data-testid={`suggestion-village-${index}`}
                      >
                        <div className="text-sm font-medium">{village}</div>
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
              <FormItem className="relative">
                <FormLabel>{t("Tehsil", "तहसील")} *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={t("Enter tehsil", "तहसील दर्ज करें")} 
                    {...field} 
                    value={field.value || ""}
                    onChange={(e) => {
                      field.onChange(e);
                      setTehsilSearch(e.target.value);
                      setShowTehsilSuggestions(true);
                    }}
                    onFocus={() => {
                      setTehsilSearch(field.value || "");
                      setShowTehsilSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowTehsilSuggestions(false), 200);
                    }}
                    onKeyDown={(e) => handleTehsilKeyDown(e, field.onChange)}
                    className={cn(getHighlightClass("tehsil"))}
                    autoComplete="off"
                    data-testid="input-tehsil"
                  />
                </FormControl>
                {showTehsilSuggestions && filteredTehsils.length > 0 && (
                  <div 
                    ref={tehsilSuggestionsRef}
                    data-suggestion-dropdown
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {filteredTehsils.map((tehsil, index) => (
                      <div
                        key={tehsil}
                        data-suggestion-item
                        className={`px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0 ${index === selectedTehsilIndex ? 'bg-accent' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          field.onChange(tehsil);
                          setShowTehsilSuggestions(false);
                          setSelectedTehsilIndex(-1);
                        }}
                        data-testid={`suggestion-tehsil-${index}`}
                      >
                        <div className="text-sm font-medium">{tehsil}</div>
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
        {redFlagWarning && (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-3 py-2 text-sm text-orange-700 dark:text-orange-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{redFlagWarning} {t("is marked as Red Flag", "रेड फ्लैग के रूप में चिह्नित है")}</span>
          </div>
        )}
        {onAttachmentChange && (
          <div className="mt-3">
            <label className="text-sm font-medium">{t("Attachment", "अटैचमेंट")}</label>
            <div className="flex items-center gap-3 mt-1">
              {attachmentFile ? (
                <div className="flex items-center gap-3">
                  <img
                    src={attachmentPreviewUrl || ""}
                    alt="Preview"
                    className="h-16 w-16 rounded-md object-cover border"
                    data-testid="img-attachment-preview"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground truncate max-w-[200px]">{attachmentFile.name}</span>
                    <button type="button" onClick={() => onAttachmentChange(null)} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1" data-testid="button-remove-attachment">
                      <X className="h-3 w-3" />
                      {t("Remove", "हटाएं")}
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm cursor-pointer border rounded-md px-3 py-1.5 hover:bg-muted transition-colors" data-testid="button-add-attachment">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{t("Add Image (max 500KB)", "फोटो जोड़ें (अधिकतम 500KB)")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 500 * 1024) {
                          alert(t("File too large. Max 500KB allowed.", "फ़ाइल बहुत बड़ी है। अधिकतम 500KB अनुमत है।"));
                          return;
                        }
                        onAttachmentChange(file);
                      }
                      e.target.value = "";
                    }}
                    data-testid="input-attachment-file"
                  />
                </label>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
