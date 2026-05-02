import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface PartyOption {
  key: string;
  label: string;
  sublabel?: string;
  searchText: string;
  payload: Record<string, any>;
}

interface InlinePartyPickerProps {
  currentName: string;
  currentKey?: string | number | null;
  fetchKey: (string | number)[];
  mapOptions: (data: any) => PartyOption[];
  endpoint: string;
  invalidateKeys: (string | number)[][];
  testIdSuffix?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  successTitle?: { en: string; hi: string };
  className?: string;
  ariaLabel?: { en: string; hi: string };
  onSuccess?: (data: any, option: PartyOption) => void;
}

export function InlinePartyPicker({
  currentName,
  currentKey,
  fetchKey,
  mapOptions,
  endpoint,
  invalidateKeys,
  testIdSuffix,
  searchPlaceholder,
  emptyText,
  successTitle,
  className,
  ariaLabel,
  onSuccess,
}: InlinePartyPickerProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const suffix = testIdSuffix !== undefined ? `-${testIdSuffix}` : "";

  const { data, isLoading } = useQuery<any>({
    queryKey: fetchKey,
    enabled: open,
  });

  const options = useMemo<PartyOption[]>(() => {
    if (!data) return [];
    try {
      return mapOptions(data);
    } catch {
      return [];
    }
  }, [data, mapOptions]);

  const mutation = useMutation<any, Error, PartyOption>({
    mutationFn: async (opt: PartyOption) => {
      const res = await apiRequest("PATCH", endpoint, opt.payload);
      const data = await res.json();
      return { data, option: opt };
    },
    onSuccess: (result: any) => {
      setOpen(false);
      toast({
        title: successTitle
          ? t(successTitle.en, successTitle.hi)
          : t("Updated", "अपडेट किया गया"),
        variant: "success",
      });
      for (const k of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: k });
      }
      onSuccess?.(result.data, result.option);
    },
    onError: (err: Error) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <span className={cn("inline-flex items-center gap-1 align-middle min-w-0", className)}>
      <span
        className="font-medium truncate"
        data-testid={`text-party${suffix}`}
        title={currentName}
      >
        {currentName || "—"}
      </span>
      <Popover open={open} onOpenChange={(v) => !mutation.isPending && setOpen(v)}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            data-testid={`button-edit-party${suffix}`}
            aria-label={ariaLabel ? t(ariaLabel.en, ariaLabel.hi) : t("Change", "बदलें")}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={searchPlaceholder || t("Search...", "खोजें...")}
              data-testid={`input-search-party${suffix}`}
            />
            <CommandList>
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                  {t("Loading...", "लोड हो रहा है...")}
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    {emptyText || t("No results.", "कोई परिणाम नहीं।")}
                  </CommandEmpty>
                  <CommandGroup>
                    {options.map((opt) => {
                      const isCurrent =
                        currentKey != null && String(opt.key) === String(currentKey);
                      return (
                        <CommandItem
                          key={opt.key}
                          value={opt.searchText}
                          onSelect={() => {
                            if (isCurrent) {
                              setOpen(false);
                              return;
                            }
                            mutation.mutate(opt);
                          }}
                          data-testid={`option-party${suffix}-${opt.key}`}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4 shrink-0",
                              isCurrent ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium truncate">
                              {opt.label}
                            </span>
                            {opt.sublabel && (
                              <span className="text-xs text-muted-foreground truncate">
                                {opt.sublabel}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </span>
  );
}
