import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface EditableTnxNumberProps {
  transactionId: number;
  transactionNumber: number;
  prefix?: string;
  className?: string;
  testIdSuffix?: string | number;
  /**
   * Endpoint to PATCH. Defaults to harvest transactions endpoint. Pass the
   * seed transactions endpoint to reuse this component for seed Tnx# edits.
   */
  endpoint?: string;
  /**
   * Query keys to invalidate on success. Defaults to harvest transactions
   * keys. Pass seed transaction keys when using this for seed Tnx# edits.
   */
  invalidateKeys?: (string | number)[][];
}

export function EditableTnxNumber({
  transactionId,
  transactionNumber,
  prefix = "Tr No: ",
  className = "",
  testIdSuffix,
  endpoint,
  invalidateKeys,
}: EditableTnxNumberProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");

  const suffix = testIdSuffix !== undefined ? `-${testIdSuffix}` : "";
  const patchUrl = endpoint ?? `/api/transactions/${transactionId}/transaction-number`;
  const keysToInvalidate: (string | number)[][] = invalidateKeys ?? [
    ["/api/transactions"],
    ["/api/transactions/next-number"],
  ];

  const mutation = useMutation<{ transactionNumber: number; updatedIds?: number[] }, Error, number>({
    mutationFn: async (newNumber: number) => {
      const res = await apiRequest(
        "PATCH",
        patchUrl,
        { transactionNumber: newNumber },
      );
      return await res.json();
    },
    onSuccess: (updated) => {
      const newVal = Number(updated?.transactionNumber ?? draft);
      setIsEditing(false);
      setDraft("");
      toast({
        title: t("Tnx# updated", "लेन-देन# अपडेट किया गया"),
        description: t(
          `Transaction number changed to #${newVal}`,
          `लेन-देन नंबर #${newVal} में बदला गया`,
        ),
        variant: "success",
      });
      for (const key of keysToInvalidate) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error: Error) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const n = Number(draft);
    if (!Number.isInteger(n) || n <= 0) return;
    if (n === transactionNumber) {
      setIsEditing(false);
      setDraft("");
      return;
    }
    mutation.mutate(n);
  };

  if (isEditing) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        {prefix && <span className="font-bold text-sm">{prefix}</span>}
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
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
          className="h-7 w-20 px-2 text-sm"
          autoFocus
          disabled={mutation.isPending}
          data-testid={`input-edit-tnx${suffix}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={(() => {
            const n = Number(draft);
            return (
              !draft ||
              !Number.isInteger(n) ||
              n <= 0 ||
              n === transactionNumber ||
              mutation.isPending
            );
          })()}
          onClick={handleSave}
          data-testid={`button-save-tnx${suffix}`}
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
          data-testid={`button-cancel-tnx${suffix}`}
          aria-label={t("Cancel", "रद्द करें")}
        >
          <X className="h-4 w-4" />
        </Button>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        className="font-bold text-sm leading-tight whitespace-nowrap"
        data-testid={`text-tnx${suffix}`}
      >
        {prefix}
        {transactionNumber}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(String(transactionNumber));
          setIsEditing(true);
        }}
        data-testid={`button-edit-tnx${suffix}`}
        aria-label={t("Edit Tnx#", "लेन-देन# संपादित करें")}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
