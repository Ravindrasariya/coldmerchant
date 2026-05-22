import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Save, Loader2, Snowflake, ChevronDown, ChevronRight, History, Pencil, Check, X } from "lucide-react";
import { InlineEditableDate } from "@/components/ui/inline-editable-date";
import { InlinePartyPicker, type PartyOption } from "@/components/ui/inline-party-picker";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { SeedStockEntryWithLots, SEED_SIZE_OPTIONS, type SeedStockEntryEditHistory, type ChangeSet } from "@shared/schema";
import { format } from "date-fns";

interface SeedStockEntryEditDialogProps {
  entry: SeedStockEntryWithLots;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SeedStockEntryEditDialog({ entry, open, onOpenChange }: SeedStockEntryEditDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  // Local mirror so inline supplier/date edits show through immediately
  // without waiting for the parent list query to refetch and re-derive props.
  const [displayEntry, setDisplayEntry] = useState<SeedStockEntryWithLots>(entry);
  useEffect(() => {
    setDisplayEntry(entry);
  }, [entry]);
  const amountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
  const [remarks, setRemarks] = useState(entry.remarks || "");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [currentSerial, setCurrentSerial] = useState<number>(entry.serialNumber);
  const [isEditingSerial, setIsEditingSerial] = useState(false);
  const [serialDraft, setSerialDraft] = useState<string>("");
  useEffect(() => {
    setCurrentSerial(entry.serialNumber);
  }, [entry.id, entry.serialNumber]);

  const updateSerialMutation = useMutation<{ serialNumber: number }, Error, number>({
    mutationFn: async (newSerial: number) => {
      const res = await apiRequest("PATCH", `/api/seed-stock-entries/${entry.id}/serial-number`, { serialNumber: newSerial });
      return await res.json();
    },
    onSuccess: (updated) => {
      const newVal = Number(updated?.serialNumber ?? serialDraft);
      if (Number.isFinite(newVal)) setCurrentSerial(newVal);
      setIsEditingSerial(false);
      setSerialDraft("");
      toast({
        title: t("Sr# updated", "Sr# अपडेट किया गया"),
        description: t(`Serial number changed to #${newVal}`, `सीरियल नंबर #${newVal} में बदला गया`),
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries/next-serial"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions/unsold-inventory"] });
      queryClient.invalidateQueries({ queryKey: ['/api/seed-stock-entries', entry.id, 'edit-history'] });
    },
    onError: (error: Error) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveSerial = () => {
    const n = Number(serialDraft);
    if (!Number.isInteger(n) || n <= 0) return;
    if (n === currentSerial) {
      setIsEditingSerial(false);
      setSerialDraft("");
      return;
    }
    updateSerialMutation.mutate(n);
  };
  const [seedLots, setSeedLots] = useState(entry.seedLots.map(lot => ({
    ...lot,
    pricePerBag: lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0,
    coldStoreChargesPerBag: lot.coldStoreChargesPerBag ? parseFloat(lot.coldStoreChargesPerBag) : 0,
    hammaliCharges: lot.hammaliCharges ? parseFloat(lot.hammaliCharges) : 0,
    gradingCharges: lot.gradingCharges ? parseFloat(lot.gradingCharges) : 0,
    transportCharges: lot.transportCharges ? parseFloat(lot.transportCharges) : 0,
    coldStoreDbId: (lot as any).coldStoreDbId ?? null,
  })));

  const [allColdStores, setAllColdStores] = useState<{id: number, name: string}[]>([]);
  const [showColdStoreDropdown, setShowColdStoreDropdown] = useState<number | null>(null);
  const [coldStoreSearch, setColdStoreSearch] = useState("");
  const coldStoreDropdownRefs = useRef<{[key: number]: HTMLDivElement | null}>({});

  useEffect(() => {
    const fetchColdStores = async () => {
      try {
        const response = await fetch("/api/cold-stores/search?q=");
        if (response.ok) {
          const data = await response.json();
          setAllColdStores(data);
        }
      } catch (error) {
        console.error("Error fetching cold stores:", error);
      }
    };
    if (open) fetchColdStores();
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      let isInside = false;
      Object.values(coldStoreDropdownRefs.current).forEach(el => {
        if (el && el.contains(target)) isInside = true;
      });
      if (!isInside) {
        setShowColdStoreDropdown(null);
        setColdStoreSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredColdStores = allColdStores.filter(cs =>
    !coldStoreSearch || cs.name.toLowerCase().includes(coldStoreSearch.toLowerCase())
  );

  interface SeedLotUpdate {
    id: number;
    coldStoreName: string;
    coldStoreDbId: number | null;
    originalBags: number;
    remainingBags: number;
    potatoType: string;
    bagType: string;
    size: string;
    pricePerBag: number;
    coldStoreChargesPerBag: number;
    hammaliCharges: number;
    gradingCharges: number;
    transportCharges: number;
    remarks?: string;
  }

  const { data: editHistory = [], isLoading: historyLoading } = useQuery<(SeedStockEntryEditHistory & { userName?: string })[]>({
    queryKey: ['/api/seed-stock-entries', entry.id, 'edit-history'],
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { remarks: string; seedLots: SeedLotUpdate[] }) => {
      const res = await apiRequest("PATCH", `/api/seed-stock-entries/${entry.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t("Entry Updated", "एंट्री अपडेट हो गई"),
        description: t("The seed stock entry has been updated successfully.", "बीज स्टॉक एंट्री सफलतापूर्वक अपडेट हो गई।"),
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries", entry.id, "edit-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-transactions/unsold-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLotChange = (
    lotIndex: number,
    field: string,
    value: number | string | null
  ) => {
    const newLots = [...seedLots];
    (newLots[lotIndex] as any)[field] = value;
    setSeedLots(newLots);
  };

  const handleSave = () => {
    updateMutation.mutate({
      remarks,
      seedLots: seedLots.map(lot => ({
        id: lot.id,
        coldStoreName: lot.coldStoreName,
        coldStoreDbId: lot.coldStoreDbId,
        originalBags: lot.originalBags,
        remainingBags: lot.remainingBags,
        potatoType: lot.potatoType,
        bagType: lot.bagType,
        size: lot.size,
        pricePerBag: lot.pricePerBag,
        coldStoreChargesPerBag: lot.coldStoreChargesPerBag,
        hammaliCharges: lot.hammaliCharges,
        gradingCharges: lot.gradingCharges,
        transportCharges: lot.transportCharges,
        remarks: lot.remarks || undefined,
      })),
    });
  };

  const calculateTotalValue = () => {
    return seedLots.reduce((sum, lot) => sum + (lot.originalBags * lot.pricePerBag), 0);
  };

  const calculateAdditionalCharges = () => {
    return seedLots.reduce((sum, lot) => {
      const coldChargesTotal = (lot.coldStoreChargesPerBag || 0) * (lot.originalBags || 0);
      const hammali = lot.hammaliCharges || 0;
      const grading = lot.gradingCharges || 0;
      const transport = lot.transportCharges || 0;
      return sum + coldChargesTotal + hammali + grading + transport;
    }, 0);
  };

  const totalValue = calculateTotalValue();
  const remainingDue = Math.max(totalValue - amountPaid, 0);
  const totalAdditionalCharges = calculateAdditionalCharges();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {isEditingSerial ? (
              <span className="flex items-center gap-1">
                <span className="text-primary font-mono">#</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={serialDraft}
                  onChange={(e) => setSerialDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveSerial();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setIsEditingSerial(false);
                      setSerialDraft("");
                    }
                  }}
                  className="h-7 w-24 font-mono"
                  data-testid="input-edit-seed-serial"
                  autoFocus
                  disabled={updateSerialMutation.isPending}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={(() => {
                    const n = Number(serialDraft);
                    return !serialDraft || !Number.isInteger(n) || n <= 0 || n === currentSerial || updateSerialMutation.isPending;
                  })()}
                  onClick={handleSaveSerial}
                  data-testid="button-save-seed-serial"
                  aria-label={t("Save", "सहेजें")}
                >
                  {updateSerialMutation.isPending ? (
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
                    setIsEditingSerial(false);
                    setSerialDraft("");
                  }}
                  data-testid="button-cancel-seed-serial"
                  aria-label={t("Cancel", "रद्द करें")}
                  disabled={updateSerialMutation.isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="font-mono text-primary" data-testid="text-edit-seed-serial">#{currentSerial}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    setSerialDraft(String(currentSerial));
                    setIsEditingSerial(true);
                  }}
                  data-testid="button-edit-seed-serial"
                  aria-label={t("Edit Sr#", "Sr# संपादित करें")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </span>
            )}
            <span>{t("Edit Seed Stock Entry", "बीज स्टॉक एंट्री संपादित करें")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">{t("Supplier Details", "आपूर्तिकर्ता विवरण")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-muted-foreground shrink-0">{t("Supplier", "आपूर्तिकर्ता")}:</span>
                  <InlinePartyPicker
                    currentName={displayEntry.supplierName}
                    currentKey={`${displayEntry.supplierName}|${displayEntry.supplierContact || ""}|${displayEntry.address || ""}|${displayEntry.district || ""}|${displayEntry.state || ""}`}
                    fetchKey={["/api/suppliers/list"]}
                    mapOptions={(rows: any[]) =>
                      (rows || []).map((s: any): PartyOption => ({
                        key: `${s.supplierName}|${s.supplierContact || ""}|${s.address || ""}|${s.district || ""}|${s.state || ""}`,
                        label: s.supplierName,
                        sublabel: [s.district, s.state, s.supplierContact].filter(Boolean).join(" • "),
                        searchText: `${s.supplierName} ${s.supplierContact || ""} ${s.address || ""} ${s.district || ""} ${s.state || ""}`,
                        payload: {
                          supplierName: s.supplierName,
                          supplierContact: s.supplierContact,
                          address: s.address,
                          district: s.district,
                          state: s.state,
                        },
                      }))
                    }
                    endpoint={`/api/seed-stock-entries/${entry.id}/supplier`}
                    invalidateKeys={[
                      ["/api/seed-stock-entries"],
                      ["/api/seed-stock-entries", entry.id],
                      ["/api/suppliers/list"],
                      ["/api/dashboard/timeseries"],
                    ]}
                    testIdSuffix="seed-supplier"
                    searchPlaceholder={t("Search supplier...", "आपूर्तिकर्ता खोजें...")}
                    emptyText={t("No supplier found.", "कोई आपूर्तिकर्ता नहीं मिला।")}
                    successTitle={{ en: "Supplier updated", hi: "आपूर्तिकर्ता अपडेट किया गया" }}
                    ariaLabel={{ en: "Change supplier", hi: "आपूर्तिकर्ता बदलें" }}
                    onSuccess={(data: any) => setDisplayEntry((prev) => ({ ...prev, ...data }))}
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-muted-foreground shrink-0">{t("Date", "तिथि")}:</span>
                  <InlineEditableDate
                    currentDate={displayEntry.purchaseDate}
                    endpoint={`/api/seed-stock-entries/${entry.id}/date`}
                    invalidateKeys={[
                      ["/api/seed-stock-entries"],
                      ["/api/seed-stock-entries", entry.id],
                      ["/api/dashboard/timeseries"],
                    ]}
                    testIdSuffix="seed-stock"
                    onSuccess={(data: any) => setDisplayEntry((prev) => ({ ...prev, ...data }))}
                  />
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Location", "स्थान")}:</span>{" "}
                  <span className="font-medium">{displayEntry.district}, {displayEntry.state}</span>
                </div>
                {displayEntry.supplierContact && (
                  <div>
                    <span className="text-muted-foreground">{t("Contact", "संपर्क")}:</span>{" "}
                    <span className="font-medium">{displayEntry.supplierContact}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h3 className="font-medium">{t("Seed Lots", "बीज लॉट")}</h3>
            {seedLots.map((lot, lotIndex) => (
              <Card key={lot.id} className="border-border/50">
                <CardHeader className="py-2 px-4">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Snowflake className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="relative flex-1 max-w-[220px]" ref={(el) => { coldStoreDropdownRefs.current[lotIndex] = el; }}>
                      <div
                        className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm cursor-pointer hover:bg-accent/50 transition-colors items-center"
                        onClick={() => {
                          setShowColdStoreDropdown(showColdStoreDropdown === lotIndex ? null : lotIndex);
                          setColdStoreSearch("");
                        }}
                        data-testid={`seed-edit-cold-store-name-${lotIndex}`}
                      >
                        <span className={lot.coldStoreName ? "text-foreground truncate" : "text-muted-foreground"}>
                          {lot.coldStoreName || t("Select cold store", "कोल्ड स्टोर चुनें")}
                        </span>
                      </div>
                      {showColdStoreDropdown === lotIndex && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg min-w-[200px]">
                          <div className="p-2 border-b">
                            <Input
                              placeholder={t("Search cold store...", "कोल्ड स्टोर खोजें...")}
                              value={coldStoreSearch}
                              onChange={(e) => setColdStoreSearch(e.target.value)}
                              autoFocus
                              className="h-7 text-sm"
                              data-testid={`search-seed-edit-cold-store-${lotIndex}`}
                            />
                          </div>
                          <div className="max-h-40 overflow-y-auto">
                            {filteredColdStores.length > 0 ? filteredColdStores.map((cs, idx) => (
                              <div
                                key={cs.id}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleLotChange(lotIndex, "coldStoreName", cs.name);
                                  handleLotChange(lotIndex, "coldStoreDbId", cs.id);
                                  setShowColdStoreDropdown(null);
                                  setColdStoreSearch("");
                                }}
                                data-testid={`seed-edit-coldstore-suggestion-${lotIndex}-${idx}`}
                              >
                                {cs.name}
                              </div>
                            )) : (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                {t("No cold stores found", "कोई कोल्ड स्टोर नहीं मिला")}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <Badge className="text-[11px] px-2 py-0.5 font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0 shrink-0">
                      {lot.potatoType}
                    </Badge>
                    <Badge className="text-[11px] px-2 py-0.5 font-medium bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-0 shrink-0">
                      {lot.size}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="py-3 px-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("Original Bags", "मूल बोरी")}</Label>
                      <Input
                        type="number"
                        value={lot.originalBags || ""}
                        min={(lot as any).soldBags ?? 0}
                        onChange={(e) => {
                          const requested = parseInt(e.target.value) || 0;
                          const sold = (lot as any).soldBags ?? Math.max(0, (lot.originalBags || 0) - (lot.remainingBags || 0));
                          // Floor at soldBags — capacity can never drop below sold history.
                          handleLotChange(lotIndex, "originalBags", Math.max(requested, sold));
                        }}
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        data-testid={`input-seed-lot-${lotIndex}-original-bags`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("Remaining Bags", "बचे बोरी")}</Label>
                      <Input
                        type="number"
                        value={Math.max(0, (lot.originalBags || 0) - ((lot as any).soldBags ?? 0)) || ""}
                        onChange={(e) => handleLotChange(lotIndex, "remainingBags", parseInt(e.target.value) || 0)}
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        data-testid={`input-seed-lot-${lotIndex}-remaining-bags`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("Price/Bag", "मूल्य/बोरी")}</Label>
                      <Input
                        type="number"
                        step="any"
                        value={lot.pricePerBag || ""}
                        onChange={(e) => handleLotChange(lotIndex, "pricePerBag", parseFloat(e.target.value) || 0)}
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        data-testid={`input-seed-lot-${lotIndex}-price`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("Cold Charges/Bag", "कोल्ड शुल्क/बोरी")}</Label>
                      <Input
                        type="number"
                        step="any"
                        value={lot.coldStoreChargesPerBag || ""}
                        onChange={(e) => handleLotChange(lotIndex, "coldStoreChargesPerBag", parseFloat(e.target.value) || 0)}
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        data-testid={`input-seed-lot-${lotIndex}-cold-charges`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("Total Hammali", "कुल हम्माली")}</Label>
                      <Input
                        type="number"
                        step="any"
                        value={lot.hammaliCharges || ""}
                        onChange={(e) => handleLotChange(lotIndex, "hammaliCharges", parseFloat(e.target.value) || 0)}
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        data-testid={`input-seed-lot-${lotIndex}-hammali`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("Total Grading", "कुल ग्रेडिंग")}</Label>
                      <Input
                        type="number"
                        step="any"
                        value={lot.gradingCharges || ""}
                        onChange={(e) => handleLotChange(lotIndex, "gradingCharges", parseFloat(e.target.value) || 0)}
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        data-testid={`input-seed-lot-${lotIndex}-grading`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("Total Transport", "कुल ट्रांसपोर्ट")}</Label>
                      <Input
                        type="number"
                        step="any"
                        value={lot.transportCharges || ""}
                        onChange={(e) => handleLotChange(lotIndex, "transportCharges", parseFloat(e.target.value) || 0)}
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        data-testid={`input-seed-lot-${lotIndex}-transport`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Payment Summary - read-only based on cash expenses */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {t("Payment Summary", "भुगतान सारांश")}
                {(() => {
                  const status = remainingDue <= 0 ? "paid" : amountPaid > 0 ? "partial" : "due";
                  if (status === "paid") {
                    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0">{t("Paid", "भुगतान हो गया")}</Badge>;
                  } else if (status === "partial") {
                    return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border-0">{t("Partial Paid", "आंशिक भुगतान")}</Badge>;
                  } else {
                    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">{t("Due", "बाकी")}</Badge>;
                  }
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs">{t("Total Value", "कुल मूल्य")}</span>
                  <div className="font-semibold text-base">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs">{t("Amount Paid", "भुगतान राशि")}</span>
                  <div className="font-semibold text-base text-green-600 dark:text-green-400">₹{amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs">{t("Remaining Due", "बाकी राशि")}</span>
                  <div className={`font-semibold text-base ${remainingDue > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                    ₹{remainingDue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("Amount paid is updated from Cash Management expenses to this supplier.", "भुगतान राशि इस आपूर्तिकर्ता को किए गए खर्चों से अपडेट होती है।")}
              </p>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <span className="text-sm font-medium">{t("Additional Charges", "अतिरिक्त शुल्क")}</span>
            <span className="text-sm font-semibold">
              ₹{totalAdditionalCharges.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <span className="text-sm font-medium">{t("Total Cost", "कुल लागत")}</span>
              <span className="text-sm font-semibold" data-testid="text-seed-total-cost">
                ₹{(totalValue + totalAdditionalCharges).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <span className="text-sm font-medium">{t("Avg Cost/Bag", "औसत लागत/बोरी")}</span>
              <span className="text-sm font-semibold" data-testid="text-seed-avg-cost-per-bag">
                ₹{(() => {
                  const totalBags = seedLots.reduce((sum, lot) => sum + (lot.originalBags || 0), 0);
                  return totalBags > 0 ? ((totalValue + totalAdditionalCharges) / totalBags).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) : "0";
                })()}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("Remarks", "टिप्पणी")}</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={t("Add any notes...", "कोई नोट जोड़ें...")}
              data-testid="textarea-seed-remarks"
            />
          </div>

          {editHistory.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="border rounded-lg">
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-sm font-medium hover-elevate" data-testid="button-seed-edit-history-toggle">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {t("Edit History", "संपादन इतिहास")} ({editHistory.length})
                </div>
                {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t">
                <div className="max-h-60 overflow-y-auto">
                  {editHistory.map((historyItem, index) => (
                    <div key={historyItem.id} className={`p-3 text-xs ${index > 0 ? "border-t" : ""}`}>
                      <div className="flex justify-between items-center mb-2 text-muted-foreground">
                        <span className="font-medium">
                          {historyItem.userName || t("System", "सिस्टम")}
                        </span>
                        <span>
                          {historyItem.changedAt ? format(new Date(historyItem.changedAt), "dd MMM yyyy, hh:mm a") : ""}
                        </span>
                      </div>
                      {(historyItem.changeSet as ChangeSet).map((changeItem, itemIndex) => (
                        <div key={itemIndex} className="pl-2 border-l-2 border-muted mb-2 last:mb-0">
                          <div className="font-medium text-foreground mb-1">
                            {changeItem.label}
                          </div>
                          {changeItem.changes.map((change, changeIndex) => (
                            <div key={changeIndex} className="text-muted-foreground">
                              <span className="text-foreground">{change.field}:</span>{" "}
                              <span className="line-through text-red-500/70">{change.oldValue ?? "—"}</span>
                              {" → "}
                              <span className="text-green-600">{change.newValue ?? "—"}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-seed-edit-cancel">
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-seed-edit-save">
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t("Save Changes", "परिवर्तन सहेजें")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
