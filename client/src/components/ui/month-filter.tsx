import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr",
  "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec",
];

interface MonthFilterProps {
  selectedMonths: number[];
  onSelectedMonthsChange: (months: number[]) => void;
}

export function MonthFilter({ selectedMonths, onSelectedMonthsChange }: MonthFilterProps) {
  const [open, setOpen] = useState(false);

  const allSelected = selectedMonths.length === 0 || selectedMonths.length === 12;

  const toggleMonth = (month: number) => {
    if (selectedMonths.includes(month)) {
      const next = selectedMonths.filter((m) => m !== month);
      onSelectedMonthsChange(next);
    } else {
      const next = [...selectedMonths, month];
      onSelectedMonthsChange(next.length === 12 ? [] : next);
    }
  };

  const toggleAll = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      onSelectedMonthsChange([]);
    } else {
      onSelectedMonthsChange([new Date().getMonth()]);
    }
  };

  const label = allSelected
    ? "All"
    : selectedMonths.length === 1
      ? MONTHS[selectedMonths[0]]
      : `${selectedMonths.length} mo`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1 text-sm h-9 px-2.5", !allSelected && "border-green-500 dark:border-green-600")}
          data-testid="filter-month"
        >
          <Calendar className="h-3.5 w-3.5" />
          {label}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="start">
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            data-testid="filter-month-all"
          />
          <span className="text-sm font-medium">All Months</span>
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {MONTHS.map((m, i) => {
            const isSelected = allSelected || selectedMonths.includes(i);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMonth(i)}
                className={cn(
                  "text-xs py-1.5 px-1 rounded-md font-medium transition-colors",
                  isSelected
                    ? "bg-green-600 text-white"
                    : "hover:bg-muted text-muted-foreground"
                )}
                data-testid={`filter-month-${i}`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
