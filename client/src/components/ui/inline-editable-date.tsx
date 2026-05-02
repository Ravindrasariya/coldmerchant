import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface InlineEditableDateProps {
  currentDate: string;
  endpoint: string;
  bodyKey?: string;
  invalidateKeys: (string | number)[][];
  testIdSuffix?: string;
  className?: string;
  displayMonth?: "short" | "long";
  onSuccess?: (data: any) => void;
}

function toYMD(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (m) return m[1];
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function InlineEditableDate({
  currentDate,
  endpoint,
  bodyKey = "date",
  invalidateKeys,
  testIdSuffix,
  className,
  displayMonth = "short",
  onSuccess,
}: InlineEditableDateProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const suffix = testIdSuffix !== undefined ? `-${testIdSuffix}` : "";
  const ymd = toYMD(currentDate);

  const mutation = useMutation<any, Error, string>({
    mutationFn: async (newDate: string) => {
      const res = await apiRequest("PATCH", endpoint, { [bodyKey]: newDate });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setIsEditing(false);
      setDraft("");
      toast({
        title: t("Date updated", "तिथि अपडेट की गई"),
        variant: "success",
      });
      for (const k of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: k });
      }
      onSuccess?.(data);
    },
    onError: (err: Error) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!draft) return;
    if (draft === ymd) {
      setIsEditing(false);
      setDraft("");
      return;
    }
    mutation.mutate(draft);
  };

  if (isEditing) {
    return (
      <span className={cn("inline-flex items-center gap-1 align-middle", className)}>
        <Input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setIsEditing(false);
              setDraft("");
            }
          }}
          className="h-7 w-36 px-2 text-sm"
          autoFocus
          disabled={mutation.isPending}
          data-testid={`input-edit-date${suffix}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!draft || draft === ymd || mutation.isPending}
          onClick={handleSave}
          data-testid={`button-save-date${suffix}`}
          aria-label={t("Save", "सहेजें")}
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            setIsEditing(false);
            setDraft("");
          }}
          disabled={mutation.isPending}
          data-testid={`button-cancel-date${suffix}`}
          aria-label={t("Cancel", "रद्द करें")}
        >
          <X className="h-4 w-4" />
        </Button>
      </span>
    );
  }

  const display = ymd
    ? new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: displayMonth,
        year: "numeric",
      })
    : "—";

  return (
    <span className={cn("inline-flex items-center gap-1 align-middle", className)}>
      <span className="font-medium" data-testid={`text-date${suffix}`}>
        {display}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(ymd);
          setIsEditing(true);
        }}
        data-testid={`button-edit-date${suffix}`}
        aria-label={t("Edit Date", "तिथि संपादित करें")}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
