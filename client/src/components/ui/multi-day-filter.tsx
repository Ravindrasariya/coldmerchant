import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface MultiDayFilterProps {
  selectedDays: number[];
  onSelectedDaysChange: (days: number[]) => void;
}

export function MultiDayFilter({ selectedDays, onSelectedDaysChange }: MultiDayFilterProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const allSelected = selectedDays.length === 0;

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      const next = selectedDays.filter((d) => d !== day);
      onSelectedDaysChange(next);
    } else {
      const next = [...selectedDays, day];
      onSelectedDaysChange(next.length === 31 ? [] : next);
    }
  };

  const toggleAll = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      onSelectedDaysChange([]);
    } else {
      onSelectedDaysChange([new Date().getDate()]);
    }
  };

  const label = allSelected
    ? t("All", "सभी")
    : selectedDays.length === 1
      ? selectedDays[0].toString()
      : `${selectedDays.length} ${t("days", "दिन")}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1 text-sm h-9 px-2.5", !allSelected && "border-green-500 dark:border-green-600")}
          data-testid="filter-days"
        >
          <Calendar className="h-3.5 w-3.5" />
          {label}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            data-testid="filter-days-all"
          />
          <span className="text-sm font-medium">{t("All Days", "सभी दिन")}</span>
        </label>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
            const isSelected = allSelected || selectedDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={cn(
                  "text-xs py-1.5 rounded-md font-medium transition-colors",
                  isSelected
                    ? "bg-green-600 text-white"
                    : "hover:bg-muted text-muted-foreground"
                )}
                data-testid={`filter-days-${d}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
