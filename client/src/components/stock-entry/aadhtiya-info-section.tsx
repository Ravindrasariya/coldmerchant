import { useState, useEffect, useRef } from "react";
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
import { Store, AlertTriangle, ChevronDown, X, Paperclip } from "lucide-react";
import { StockEntryForm } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface AadhtiyaInfoSectionProps {
  form: UseFormReturn<StockEntryForm>;
  attachmentFile?: File | null;
  onAttachmentChange?: (file: File | null) => void;
}

interface AadhatOption {
  id: number;
  name: string;
  address: string;
  contact: string | null;
  redFlag: boolean | null;
}

export function AadhtiyaInfoSection({ form, attachmentFile, onAttachmentChange }: AadhtiyaInfoSectionProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: aadhats = [] } = useQuery<AadhatOption[]>({
    queryKey: ["/api/aadhats"],
  });

  const selectedId = form.watch("aadhatDbId");
  const selectedAadhat = aadhats.find(a => a.id === selectedId);

  const filtered = aadhats.filter(a =>
    a.name.toLowerCase().includes(searchText.toLowerCase()) ||
    (a.address && a.address.toLowerCase().includes(searchText.toLowerCase()))
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchText("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (aadhat: AadhatOption) => {
    form.setValue("aadhatDbId", aadhat.id);
    form.setValue("aadhatName", aadhat.name);
    setIsOpen(false);
    setSearchText("");
  };

  const handleClear = () => {
    form.setValue("aadhatDbId", undefined as any);
    form.setValue("aadhatName", "");
    setSearchText("");
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
            render={() => (
              <FormItem>
                <FormLabel>{t("Aadhtiya Name", "आढ़तिया का नाम")} *</FormLabel>
                <div ref={dropdownRef} className="relative">
                  {selectedAadhat && !isOpen ? (
                    <div
                      className={cn(
                        "flex items-center justify-between h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm cursor-pointer",
                        selectedAadhat.redFlag && "border-orange-400"
                      )}
                      onClick={() => {
                        setIsOpen(true);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      data-testid="select-aadhtiya-trigger"
                    >
                      <span className="flex items-center gap-2 truncate">
                        {selectedAadhat.name}
                        {selectedAadhat.redFlag && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            Red Flag
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <X
                          className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClear();
                          }}
                          data-testid="button-clear-aadhtiya"
                        />
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  ) : (
                    <div
                      className="relative"
                      onClick={() => {
                        setIsOpen(true);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                    >
                      <Input
                        ref={inputRef}
                        placeholder={t("Search aadhtiya...", "आढ़तिया खोजें...")}
                        value={searchText}
                        onChange={(e) => {
                          setSearchText(e.target.value);
                          setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        autoComplete="off"
                        data-testid="input-search-aadhtiya"
                      />
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  )}

                  {isOpen && (
                    <div
                      className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto"
                      data-testid="dropdown-aadhtiya-list"
                    >
                      {filtered.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                          {aadhats.length === 0
                            ? t("No aadhtiyas found. Add them in Aadhat Ledger first.", "कोई आढ़तिया नहीं मिला। पहले आढ़त खाता में जोड़ें।")
                            : t("No matching aadhtiya", "कोई मिलता आढ़तिया नहीं")}
                        </div>
                      ) : (
                        filtered.map((aadhat) => (
                          <div
                            key={aadhat.id}
                            className={cn(
                              "px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0",
                              selectedId === aadhat.id && "bg-muted"
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelect(aadhat);
                            }}
                            data-testid={`option-aadhat-${aadhat.id}`}
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
                        ))
                      )}
                    </div>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {selectedAadhat?.redFlag && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-3 py-2 text-sm text-orange-700 dark:text-orange-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{selectedAadhat.name} {t("is marked as Red Flag", "रेड फ्लैग के रूप में चिह्नित है")}</span>
          </div>
        )}
        {onAttachmentChange && (
          <div className="mt-3">
            <label className="text-sm font-medium">{t("Attachment", "अटैचमेंट")}</label>
            <div className="flex items-center gap-3 mt-1">
              {attachmentFile ? (
                <div className="flex items-center gap-3">
                  <img
                    src={URL.createObjectURL(attachmentFile)}
                    alt="Preview"
                    className="h-16 w-16 rounded-md object-cover border"
                    data-testid="img-attachment-preview-mandi"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground truncate max-w-[200px]">{attachmentFile.name}</span>
                    <button type="button" onClick={() => onAttachmentChange(null)} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1" data-testid="button-remove-attachment-mandi">
                      <X className="h-3 w-3" />
                      {t("Remove", "हटाएं")}
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm cursor-pointer border rounded-md px-3 py-1.5 hover:bg-muted transition-colors" data-testid="button-add-attachment-mandi">
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
                    data-testid="input-attachment-file-mandi"
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
