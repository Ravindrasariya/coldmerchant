import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, 
  Loader2,
  Building2,
  Pencil,
  History,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  FileDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type ColdStore, type ColdStoreEditHistory } from "@shared/schema";
import { shareReceiptAsPdf } from "@/lib/receipt-share";

interface ColdStoreWithDues extends ColdStore {
  coldStoreDue: number;
  totalDue: number;
}

type ColdStoreFormFields = {
  name: string;
  address: string;
  contact: string;
  pyPayable: string;
  redFlag: boolean;
  bankName: string;
  bankAccountNumber: string;
  ifscCode: string;
};

const emptyForm: ColdStoreFormFields = {
  name: "",
  address: "",
  contact: "",
  pyPayable: "",
  redFlag: false,
  bankName: "",
  bankAccountNumber: "",
  ifscCode: "",
};

interface CsLedgerEntry {
  date: string;
  refCode: string;
  particulars: string;
  dr: number;
  cr: number;
  sourceType: "harvest_charge" | "seed_charge" | "payment";
  sourceId: number;
}

interface ColdStoreLedgerData {
  coldStoreId: number;
  coldStoreName: string;
  coldStoreAddress: string;
  merchantName: string;
  merchantAddress: string;
  merchantContact: string;
  openingBalance: number;
  fyStart: string;
  fyEnd: string;
  entries: CsLedgerEntry[];
}

function ColdStoreLedgerSection({ coldStoreId, coldStoreName, t, formatLedgerAmount, formatDate }: {
  coldStoreId: number;
  coldStoreName: string;
  t: (en: string, hi: string) => string;
  formatLedgerAmount: (v: number) => string;
  formatDate: (d: string) => string;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: ledgerData, isLoading } = useQuery<ColdStoreLedgerData>({
    queryKey: ["/api/cold-store-ledger", coldStoreId, "ledger"],
    queryFn: async () => {
      const res = await fetch(`/api/cold-store-ledger/${coldStoreId}/ledger`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ledger");
      return res.json();
    },
    enabled: !!coldStoreId,
  });

  const ledgerRows = useMemo(() => {
    if (!ledgerData) return [];
    const rows: { kramank: number; date: string; refCode: string; particulars: string; dr: number; cr: number; balance: number }[] = [];
    let balance = ledgerData.openingBalance;
    rows.push({ kramank: 0, date: ledgerData.fyStart, refCode: "", particulars: "Opening Balance", dr: 0, cr: ledgerData.openingBalance, balance });
    ledgerData.entries.forEach((entry, idx) => {
      balance = balance + entry.cr - entry.dr;
      rows.push({ kramank: idx + 1, date: entry.date, refCode: entry.refCode, particulars: entry.particulars, dr: entry.dr, cr: entry.cr, balance });
    });
    return rows;
  }, [ledgerData]);

  const handlePdfExport = async () => {
    if (!ledgerData) return;
    setPdfLoading(true);
    try {
      const fyLabel = `${ledgerData.fyStart.substring(0, 4)}-${ledgerData.fyEnd.substring(2, 4)}`;
      const printDiv = document.createElement("div");
      printDiv.style.cssText = "width:780px;padding:20px;font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000;";

      const merchantHeader = document.createElement("div");
      merchantHeader.style.cssText = "text-align:center;margin-bottom:12px;";
      const merchantH1 = document.createElement("h1");
      merchantH1.style.cssText = "font-size:18px;margin:0;font-weight:700;";
      merchantH1.textContent = ledgerData.merchantName;
      merchantHeader.appendChild(merchantH1);
      if (ledgerData.merchantAddress) {
        const merchantAddr = document.createElement("p");
        merchantAddr.style.cssText = "font-size:12px;color:#555;margin:2px 0;";
        merchantAddr.textContent = ledgerData.merchantAddress;
        merchantHeader.appendChild(merchantAddr);
      }
      if (ledgerData.merchantContact) {
        const merchantPhone = document.createElement("p");
        merchantPhone.style.cssText = "font-size:12px;color:#555;margin:2px 0;";
        merchantPhone.textContent = ledgerData.merchantContact;
        merchantHeader.appendChild(merchantPhone);
      }

      const header = document.createElement("div");
      header.style.cssText = "text-align:center;border-top:1px solid #999;border-bottom:2px solid #000;padding:10px 0 12px;margin-bottom:16px;";
      const h1 = document.createElement("h1");
      h1.style.cssText = "font-size:20px;margin:0;";
      h1.textContent = coldStoreName;
      const addrP = document.createElement("p");
      addrP.style.cssText = "font-size:13px;color:#555;margin:4px 0;";
      addrP.textContent = ledgerData.coldStoreAddress || "";
      const fyP = document.createElement("p");
      fyP.style.cssText = "font-size:14px;font-weight:600;margin:6px 0 0 0;";
      fyP.textContent = `${t("Cold Store Ledger", "कोल्ड स्टोर खाता")} — FY ${fyLabel}`;
      header.append(h1, addrP, fyP);

      const table = document.createElement("table");
      table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;";
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      headerRow.style.background = "#f0f0f0";
      const headers = [
        { text: t("Sr", "क्र."), align: "center", width: "40px" },
        { text: t("Date", "तारीख"), align: "left" },
        { text: t("Ref #", "Ref #"), align: "left" },
        { text: t("Particulars", "विवरण"), align: "left" },
        { text: t("Dr", "डेबिट"), align: "right" },
        { text: t("Cr", "क्रेडिट"), align: "right" },
        { text: t("Balance", "शेष"), align: "right" },
      ];
      for (const h of headers) {
        const th = document.createElement("th");
        th.style.cssText = `border:1px solid #999;padding:5px 6px;text-align:${h.align};${h.width ? `width:${h.width}` : ""}`;
        th.textContent = h.text;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (let i = 0; i < ledgerRows.length; i++) {
        const row = ledgerRows[i];
        const tr = document.createElement("tr");
        if (i === 0) tr.style.cssText = "background:#f9f9f9;font-weight:600;";
        const cellData: { text: string; align: string; bold?: boolean }[] = [
          { text: String(row.kramank), align: "center" },
          { text: formatDate(row.date), align: "left" },
          { text: row.refCode || "—", align: "left" },
          { text: row.particulars, align: "left" },
          { text: row.dr > 0 ? `₹${row.dr.toLocaleString("en-IN")}` : "—", align: "right" },
          { text: row.cr > 0 ? `₹${row.cr.toLocaleString("en-IN")}` : "—", align: "right" },
          { text: `₹${row.balance.toLocaleString("en-IN")}`, align: "right", bold: true },
        ];
        for (const cell of cellData) {
          const td = document.createElement("td");
          td.style.cssText = `border:1px solid #ccc;padding:4px 6px;text-align:${cell.align};${cell.bold ? "font-weight:600;" : ""}`;
          td.textContent = cell.text;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);

      printDiv.append(merchantHeader, header, table);
      document.body.appendChild(printDiv);
      await shareReceiptAsPdf(printDiv, `${coldStoreName}_Ledger_FY${fyLabel}`);
      document.body.removeChild(printDiv);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setPdfLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-6 bg-muted/20 border-b">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ledgerData || ledgerRows.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground bg-muted/20 border-b">
        {t("No ledger entries found", "कोई खाता प्रविष्टि नहीं मिली")}
      </div>
    );
  }

  return (
    <div className="bg-muted/10 border-b" data-testid={`cs-ledger-${coldStoreId}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
        <span className="text-xs font-semibold text-muted-foreground">
          {t("Ledger", "खाता")} — {coldStoreName} (FY {ledgerData.fyStart.substring(0, 4)}-{ledgerData.fyEnd.substring(2, 4)})
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePdfExport}
          disabled={pdfLoading}
          data-testid={`button-pdf-cs-ledger-${coldStoreId}`}
        >
          {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          <span className="ml-1 text-xs">{t("PDF", "PDF")}</span>
        </Button>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="border px-2 py-1.5 text-center w-10">{t("Sr", "क्र.")}</th>
              <th className="border px-2 py-1.5 text-left w-24">{t("Date", "तारीख")}</th>
              <th className="border px-2 py-1.5 text-left w-28">{t("Ref #", "Ref #")}</th>
              <th className="border px-2 py-1.5 text-left">{t("Particulars", "विवरण")}</th>
              <th className="border px-2 py-1.5 text-right w-24">{t("Dr", "डेबिट")}</th>
              <th className="border px-2 py-1.5 text-right w-24">{t("Cr", "क्रेडिट")}</th>
              <th className="border px-2 py-1.5 text-right w-28">{t("Balance", "शेष")}</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.map((row, i) => (
              <tr key={i} className={i === 0 ? "bg-blue-50/50 dark:bg-blue-950/20 font-semibold" : row.dr > 0 ? "bg-green-50/30 dark:bg-green-950/10" : ""} data-testid={`cs-ledger-row-${coldStoreId}-${i}`}>
                <td className="border px-2 py-1.5 text-center text-muted-foreground">{row.kramank}</td>
                <td className="border px-2 py-1.5">{formatDate(row.date)}</td>
                <td className="border px-2 py-1.5 font-mono">{row.refCode || "—"}</td>
                <td className="border px-2 py-1.5">{row.particulars}</td>
                <td className="border px-2 py-1.5 text-right">{formatLedgerAmount(row.dr)}</td>
                <td className="border px-2 py-1.5 text-right text-green-700 dark:text-green-400">{formatLedgerAmount(row.cr)}</td>
                <td className="border px-2 py-1.5 text-right font-semibold">{formatLedgerAmount(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-2 px-3 py-2">
        {ledgerRows.map((row, i) => (
          <div
            key={i}
            className={`rounded-md border p-3 text-xs ${i === 0 ? "bg-blue-50/50 dark:bg-blue-950/20 font-semibold" : row.dr > 0 ? "bg-green-50/30 dark:bg-green-950/10" : "bg-card"}`}
            data-testid={`cs-ledger-card-${coldStoreId}-${i}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-muted-foreground">#{row.kramank} · {formatDate(row.date)}</span>
              {row.refCode && <span className="font-mono text-muted-foreground">{row.refCode}</span>}
            </div>
            <div className="mb-1.5">{row.particulars}</div>
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                {row.dr > 0 && <span>{t("Dr", "डे.")}: {formatLedgerAmount(row.dr)}</span>}
                {row.cr > 0 && <span className="text-green-700 dark:text-green-400">{t("Cr", "क्रे.")}: {formatLedgerAmount(row.cr)}</span>}
              </div>
              <span className="font-semibold">{t("Bal", "शेष")}: {formatLedgerAmount(row.balance)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function invalidateAllColdStoreCaches() {
  queryClient.invalidateQueries({ queryKey: ["/api/cold-store-ledger"] });
  queryClient.invalidateQueries({ queryKey: ["/api/cold-stores/search"] });
  queryClient.invalidateQueries({ queryKey: ["/api/cash/cold-stores"] });
  queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
  queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
  queryClient.invalidateQueries({ queryKey: ["/api/books/balance-sheet"] });
  queryClient.invalidateQueries({ queryKey: ["/api/books/profit-loss"] });
  queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
}

export default function ColdStoreLedgerTab() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingColdStore, setEditingColdStore] = useState<ColdStoreWithDues | null>(null);
  const [editForm, setEditForm] = useState<ColdStoreFormFields>({ ...emptyForm });
  const [showHistory, setShowHistory] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergingColdStore, setMergingColdStore] = useState<{ id: number; coldStoreId: string; name: string } | null>(null);
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<ColdStoreFormFields>({ ...emptyForm });

  const [yearFilter, setYearFilter] = useState<string>("all");
  const [nameFilter, setNameFilter] = useState("");
  
  const [sortColumn, setSortColumn] = useState<'coldStoreId' | 'totalDue' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedColdStoreId, setExpandedColdStoreId] = useState<number | null>(null);

  const { data: coldStoreList = [], isLoading } = useQuery<ColdStoreWithDues[]>({
    queryKey: ["/api/cold-store-ledger"],
    enabled: !!user,
  });

  const { data: editHistory = [], isLoading: historyLoading } = useQuery<ColdStoreEditHistory[]>({
    queryKey: ["/api/cold-store-ledger", editingColdStore?.id, "history"],
    queryFn: async () => {
      if (!editingColdStore?.id) return [];
      const res = await fetch(`/api/cold-store-ledger/${editingColdStore.id}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!editingColdStore?.id && showHistory,
  });

  const createMutation = useMutation({
    mutationFn: async (form: ColdStoreFormFields) => {
      const response = await apiRequest("POST", "/api/cold-store-ledger", {
        name: form.name,
        address: form.address,
        contact: form.contact || null,
        pyPayable: form.pyPayable || "0",
        redFlag: form.redFlag,
        isActive: true,
        bankName: form.bankName || null,
        bankAccountNumber: form.bankAccountNumber || null,
        ifscCode: form.ifscCode || null,
      });
      return response.json();
    },
    onSuccess: () => {
      invalidateAllColdStoreCaches();
      setAddDialogOpen(false);
      setAddForm({ ...emptyForm });
      toast({ title: t("Cold Store added successfully", "कोल्ड स्टोर सफलतापूर्वक जोड़ा गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to add cold store", "कोल्ड स्टोर जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & ColdStoreFormFields) => {
      const response = await fetch(`/api/cold-store-ledger/${id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          address: data.address,
          contact: data.contact || null,
          pyPayable: data.pyPayable || "0",
          redFlag: data.redFlag,
          bankName: data.bankName || null,
          bankAccountNumber: data.bankAccountNumber || null,
          ifscCode: data.ifscCode || null,
        }),
        credentials: "include",
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw { status: response.status, data: responseData };
      }
      return responseData;
    },
    onSuccess: (data) => {
      invalidateAllColdStoreCaches();
      setEditDialogOpen(false);
      setEditingColdStore(null);
      setShowHistory(false);
      toast({ title: t("Cold Store updated successfully", "कोल्ड स्टोर सफलतापूर्वक अपडेट किया गया"), description: data.message, variant: "success" });
    },
    onError: (error: any) => {
      const errorData = error.data || error;
      if (error.status === 409 && errorData.requiresMerge && errorData.existingColdStore) {
        setEditDialogOpen(false);
        setMergingColdStore({
          id: errorData.existingColdStore.id,
          coldStoreId: errorData.existingColdStore.coldStoreId,
          name: errorData.existingColdStore.name,
        });
        setMergeDialogOpen(true);
      } else {
        toast({ title: t("Failed to update cold store", "कोल्ड स्टोर अपडेट करने में विफल"), description: errorData.message, variant: "destructive" });
      }
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: number; targetId: number }) => {
      const response = await apiRequest("POST", "/api/cold-store-ledger/merge", { sourceId, targetId });
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }
      return response.json();
    },
    onSuccess: (data) => {
      invalidateAllColdStoreCaches();
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      setMergeDialogOpen(false);
      setMergingColdStore(null);
      setEditingColdStore(null);
      toast({
        title: t("Cold Stores Merged", "कोल्ड स्टोर मर्ज किए गए"),
        description: data.message,
        variant: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message || t("Failed to merge cold stores", "कोल्ड स्टोर मर्ज करने में विफल"),
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/cold-store-ledger/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      invalidateAllColdStoreCaches();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/cold-store-ledger/sync", {});
      return response.json();
    },
    onSuccess: (data: { created: number; linked: number }) => {
      invalidateAllColdStoreCaches();
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seed-stock-entries"] });
      toast({
        title: t("Sync Complete", "सिंक पूरा"),
        description: t(
          `${data.created} cold store(s) created, ${data.linked} lot(s) linked`,
          `${data.created} कोल्ड स्टोर बनाए, ${data.linked} लॉट जोड़े`
        ),
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("Sync Failed", "सिंक विफल"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditClick = (cs: ColdStoreWithDues) => {
    setEditingColdStore(cs);
    setEditForm({
      name: cs.name,
      address: cs.address,
      contact: cs.contact || "",
      pyPayable: cs.pyPayable || "0",
      redFlag: cs.redFlag ?? false,
      bankName: cs.bankName || "",
      bankAccountNumber: cs.bankAccountNumber || "",
      ifscCode: cs.ifscCode || "",
    });
    setShowHistory(false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingColdStore) return;
    if (!editForm.name.trim() || !editForm.address.trim()) {
      toast({ title: t("Name and Address are required", "नाम और पता आवश्यक हैं"), variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editingColdStore.id, ...editForm });
  };

  const handleConfirmMerge = () => {
    if (!editingColdStore || !mergingColdStore) return;
    mergeMutation.mutate({
      sourceId: editingColdStore.id,
      targetId: mergingColdStore.id,
    });
  };

  const handleAddColdStore = () => {
    if (!addForm.name.trim() || !addForm.address.trim()) {
      toast({ title: t("Name and Address are required", "नाम और पता आवश्यक हैं"), variant: "destructive" });
      return;
    }
    createMutation.mutate(addForm);
  };

  const formatFieldName = (field: string) => {
    const fieldMap: Record<string, string> = {
      name: t("Name", "नाम"),
      address: t("Address", "पता"),
      contact: t("Contact", "संपर्क"),
      pyPayable: t("PY Payable", "पीवाय देय"),
      redFlag: t("Red Flag", "रेड फ्लैग"),
      bankName: t("Bank Name", "बैंक का नाम"),
      bankAccountNumber: t("Bank Account #", "बैंक खाता नं."),
      ifscCode: t("IFSC Code", "IFSC कोड"),
    };
    return fieldMap[field] || field;
  };

  const yearOptions = Array.from(new Set(
    coldStoreList
      .map(cs => cs.coldStoreId?.substring(2, 6))
      .filter(Boolean)
  )).sort().reverse();

  const handleSort = (column: 'coldStoreId' | 'totalDue') => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const toggleExpand = (csId: number) => {
    setExpandedColdStoreId(prev => prev === csId ? null : csId);
  };

  const formatLedgerAmount = (value: number) => {
    if (value === 0) return "—";
    return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
    } catch { return dateStr; }
  };

  const filteredColdStores = coldStoreList
    .filter(cs => {
      if (yearFilter !== "all") {
        if (!cs.coldStoreId) return false;
        const csYear = cs.coldStoreId.substring(2, 6);
        if (csYear !== yearFilter) return false;
      }
      if (nameFilter.trim()) {
        const searchLower = nameFilter.toLowerCase().trim();
        if (!cs.name.toLowerCase().includes(searchLower)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortColumn) return 0;
      
      if (sortColumn === 'coldStoreId') {
        const aCode = a.coldStoreId || '';
        const bCode = b.coldStoreId || '';
        return sortDirection === 'asc' 
          ? aCode.localeCompare(bCode)
          : bCode.localeCompare(aCode);
      }
      
      if (sortColumn === 'totalDue') {
        return sortDirection === 'asc'
          ? a.totalDue - b.totalDue
          : b.totalDue - a.totalDue;
      }
      
      return 0;
    });

  const bankFields = (form: ColdStoreFormFields, setForm: (f: ColdStoreFormFields) => void, prefix: string) => (
    <>
      <div className="space-y-2">
        <Label>{t("Bank Name", "बैंक का नाम")}</Label>
        <Input
          value={form.bankName}
          onChange={(e) => setForm({ ...form, bankName: e.target.value.toUpperCase() })}
          placeholder={t("Bank name (optional)", "बैंक का नाम (वैकल्पिक)")}
          data-testid={`input-${prefix}-coldstore-bank-name`}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("Bank Account #", "बैंक खाता नं.")}</Label>
          <Input
            value={form.bankAccountNumber}
            onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
            placeholder={t("Account number", "खाता नंबर")}
            data-testid={`input-${prefix}-coldstore-bank-account`}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("IFSC Code", "IFSC कोड")}</Label>
          <Input
            value={form.ifscCode}
            onChange={(e) => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })}
            placeholder={t("IFSC code", "IFSC कोड")}
            data-testid={`input-${prefix}-coldstore-ifsc`}
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t("Cold Store Ledger", "कोल्ड स्टोर खाता")}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[90px]" data-testid="select-coldstore-year-filter">
                  <SelectValue placeholder={t("Year", "वर्ष")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All Years", "सभी वर्ष")}</SelectItem>
                  {yearOptions.map(year => (
                    <SelectItem key={year} value={year!}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("Search name...", "नाम खोजें...")}
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="pl-8 w-[160px]"
                  data-testid="input-coldstore-name-filter"
                />
              </div>
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                variant="outline"
                size="sm"
                data-testid="button-sync-coldstores"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                {t("Sync", "सिंक")}
              </Button>
              <Button
                onClick={() => setAddDialogOpen(true)}
                variant="outline"
                size="sm"
                data-testid="button-add-coldstore"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Cold Store", "कोल्ड स्टोर जोड़ें")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
                <div className="grid items-center gap-2 px-3 py-2 bg-muted/50 text-xs font-medium border-b min-w-[800px]" style={{ gridTemplateColumns: '36px minmax(100px, 1fr) minmax(120px, 1.3fr) minmax(90px, 1fr) minmax(80px, 0.8fr) 55px 48px minmax(100px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr)' }}>
                  <div></div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('coldStoreId')}
                    data-testid="sort-coldstore-id"
                  >
                    {t("CS ID", "CS आईडी")}
                    {sortColumn === 'coldStoreId' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div>{t("Name", "नाम")}</div>
                  <div>{t("Address", "पता")}</div>
                  <div>{t("Contact", "संपर्क")}</div>
                  <div>{t("Red Flag", "रेड फ्लैग")}</div>
                  <div>{t("Active", "सक्रिय")}</div>
                  <div>{t("PY Payable", "पीवाय देय")}</div>
                  <div>{t("CS Due", "CS बकाया")}</div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('totalDue')}
                    data-testid="sort-coldstore-total-due"
                  >
                    {t("Total Due", "कुल बकाया")}
                    {sortColumn === 'totalDue' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
                
                {filteredColdStores.map((cs, index) => (
                  <div key={cs.id}>
                  <div 
                    className="grid items-center gap-2 px-3 py-2 border-b min-w-[800px] cursor-pointer hover:bg-muted/30 transition-colors"
                    style={{ gridTemplateColumns: '36px minmax(100px, 1fr) minmax(120px, 1.3fr) minmax(90px, 1fr) minmax(80px, 0.8fr) 55px 48px minmax(100px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr)' }}
                    data-testid={`coldstore-row-${index}`}
                    onClick={() => toggleExpand(cs.id)}
                  >
                    <div className="flex items-center justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleEditClick(cs); }}
                        data-testid={`button-edit-coldstore-${index}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate flex items-center gap-1" data-testid={`text-coldstore-code-${index}`}>
                      {expandedColdStoreId === cs.id ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
                      {cs.coldStoreId || '-'}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-coldstore-name-${index}`}>
                      {cs.name}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-coldstore-address-${index}`}>
                      {cs.address}
                    </div>
                    <div className="text-xs truncate" data-testid={`text-coldstore-contact-${index}`}>
                      {cs.contact || '-'}
                    </div>
                    <div className="flex items-center">
                      {cs.redFlag ? (
                        <Badge variant="destructive" className="text-xs">{t("Yes", "हाँ")}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{t("No", "नहीं")}</Badge>
                      )}
                    </div>
                    <div className="flex items-center">
                      <Switch
                        checked={cs.isActive ?? true}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: cs.id, isActive: checked })}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`switch-coldstore-active-${index}`}
                      />
                    </div>
                    <div className="text-xs font-mono">
                      ₹{parseFloat(cs.pyPayable || "0").toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </div>
                    <div className="text-xs font-mono" data-testid={`text-coldstore-stock-due-${index}`}>
                      ₹{(cs.coldStoreDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </div>
                    <div className="text-xs font-mono">
                      ₹{cs.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </div>
                  </div>
                  {expandedColdStoreId === cs.id && (
                    <ColdStoreLedgerSection coldStoreId={cs.id} coldStoreName={cs.name} t={t} formatLedgerAmount={formatLedgerAmount} formatDate={formatDate} />
                  )}
                  </div>
                ))}
              </div>
              
              {filteredColdStores.map((cs, index) => (
                <div 
                  key={`mobile-${cs.id}`} 
                  className="md:hidden border rounded-lg bg-card"
                  data-testid={`coldstore-card-${index}`}
                >
                  <div className="p-4 space-y-3 cursor-pointer" onClick={() => toggleExpand(cs.id)}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                        {expandedColdStoreId === cs.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {cs.coldStoreId || '-'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleEditClick(cs); }}
                        data-testid={`button-edit-coldstore-mobile-${index}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="font-medium">{cs.name}</div>
                    <div className="text-sm text-muted-foreground">{cs.address}</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {cs.contact && <span>{t("Contact", "संपर्क")}: {cs.contact}</span>}
                      {cs.bankName && <span>{t("Bank", "बैंक")}: {cs.bankName}</span>}
                      {cs.ifscCode && <span>IFSC: {cs.ifscCode}</span>}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2">
                        {cs.redFlag ? (
                          <Badge variant="destructive">{t("Red Flag", "रेड फ्लैग")}</Badge>
                        ) : null}
                        <Switch
                          checked={cs.isActive ?? true}
                          onCheckedChange={(checked) => { toggleActiveMutation.mutate({ id: cs.id, isActive: checked }); }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{t("PY Payable", "पीवाय देय")}: ₹{parseFloat(cs.pyPayable || "0").toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                        <div className="text-xs text-muted-foreground">{t("CS Due", "CS बकाया")}: ₹{(cs.coldStoreDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                        <div className="text-sm font-mono">{t("Total Due", "कुल बकाया")}: ₹{cs.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                      </div>
                    </div>
                  </div>
                  {expandedColdStoreId === cs.id && (
                    <div className="border-t">
                      <ColdStoreLedgerSection coldStoreId={cs.id} coldStoreName={cs.name} t={t} formatLedgerAmount={formatLedgerAmount} formatDate={formatDate} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              {t("Edit Cold Store", "कोल्ड स्टोर संपादित करें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder={t("Cold store name", "कोल्ड स्टोर का नाम")}
                data-testid="input-edit-coldstore-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-edit-coldstore-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Contact", "संपर्क")}</Label>
                <Input
                  type="tel"
                  maxLength={10}
                  value={editForm.contact}
                  onChange={(e) => setEditForm({ ...editForm, contact: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  placeholder={t("Phone", "फ़ोन")}
                  data-testid="input-edit-coldstore-contact"
                />
                {editForm.contact && editForm.contact.length > 0 && editForm.contact.length < 10 && (
                  <p className="text-xs text-destructive mt-1">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("Opening Balance (PY Payable)", "शुरुआती बैलेंस (पीवाय देय)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.pyPayable}
                  onChange={(e) => setEditForm({ ...editForm, pyPayable: e.target.value })}
                  placeholder="0"
                  data-testid="input-edit-coldstore-py-payable"
                />
              </div>
            </div>
            {bankFields(editForm, setEditForm, "edit")}
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={editForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setEditForm({ ...editForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-edit-coldstore-red-flag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">{t("No", "नहीं")}</SelectItem>
                  <SelectItem value="yes">{t("Yes", "हाँ")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="w-full justify-between"
                data-testid="button-toggle-coldstore-history"
              >
                <span className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {t("Edit History", "संपादन इतिहास")}
                </span>
                {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              
              {showHistory && (
                <div className="mt-2 max-h-48 overflow-y-auto">
                  {historyLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : editHistory.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      {t("No edit history", "कोई संपादन इतिहास नहीं")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {editHistory.map((entry) => (
                        <div key={entry.id} className={`p-2 rounded text-xs ${entry.fieldName === 'merge' ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800' : 'bg-muted/50'}`}>
                          <div className="flex justify-between text-muted-foreground">
                            <span className="flex items-center gap-1">
                              #{entry.serialNumber}
                              {entry.fieldName === 'merge' && <Badge variant="outline" className="text-blue-600 border-blue-300 text-[10px] px-1 py-0">{t("Merge", "मर्ज")}</Badge>}
                            </span>
                            <span>{new Date(entry.changedAt!).toLocaleString()}</span>
                          </div>
                          {entry.fieldName === 'merge' ? (
                            <div className="mt-1">
                              <span className="text-blue-700 dark:text-blue-400">{entry.oldValue}</span>
                              <div className="text-muted-foreground mt-0.5">{entry.newValue}</div>
                            </div>
                          ) : (
                            <div className="mt-1">
                              <span className="font-medium">{formatFieldName(entry.fieldName)}</span>: 
                              <span className="line-through text-muted-foreground ml-1">{entry.oldValue || '-'}</span>
                              <span className="ml-1">→</span>
                              <span className="ml-1 text-primary">{entry.newValue || '-'}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("Save", "सहेजें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t("Add Cold Store", "कोल्ड स्टोर जोड़ें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder={t("Cold store name", "कोल्ड स्टोर का नाम")}
                data-testid="input-add-coldstore-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={addForm.address}
                onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-add-coldstore-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Contact", "संपर्क")}</Label>
                <Input
                  type="tel"
                  maxLength={10}
                  value={addForm.contact}
                  onChange={(e) => setAddForm({ ...addForm, contact: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  placeholder={t("Phone", "फ़ोन")}
                  data-testid="input-add-coldstore-contact"
                />
                {addForm.contact && addForm.contact.length > 0 && addForm.contact.length < 10 && (
                  <p className="text-xs text-destructive mt-1">{t("Please enter a valid 10-digit mobile number", "कृपया 10 अंकों का मोबाइल नंबर दर्ज करें")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("Opening Balance (PY Payable)", "शुरुआती बैलेंस (पीवाय देय)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={addForm.pyPayable}
                  onChange={(e) => setAddForm({ ...addForm, pyPayable: e.target.value })}
                  placeholder="0"
                  data-testid="input-add-coldstore-py-payable"
                />
              </div>
            </div>
            {bankFields(addForm, setAddForm, "add")}
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={addForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setAddForm({ ...addForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-add-coldstore-red-flag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">{t("No", "नहीं")}</SelectItem>
                  <SelectItem value="yes">{t("Yes", "हाँ")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button onClick={handleAddColdStore} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("Add", "जोड़ें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{t("Merge Cold Stores", "कोल्ड स्टोर मर्ज करें")}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm mb-4">
              {t("A cold store with these details already exists:", "इन विवरणों के साथ एक कोल्ड स्टोर पहले से मौजूद है:")}
            </p>
            <div className="bg-muted/50 p-3 rounded mb-4">
              <div className="text-sm font-medium" data-testid="text-merge-coldstore-name">{mergingColdStore?.name}</div>
              <div className="text-xs text-muted-foreground font-mono" data-testid="text-merge-coldstore-code">{mergingColdStore?.coldStoreId}</div>
            </div>
            <p className="text-sm mb-2">
              {t("If you merge:", "यदि आप मर्ज करते हैं:")}
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
              <li>{t("The cold store with the lower ID will be kept", "कम आईडी वाला कोल्ड स्टोर रखा जाएगा")}</li>
              <li>{t("All linked stock entries and cash entries will be transferred", "सभी संबंधित स्टॉक एंट्री और नकद प्रविष्टियाँ स्थानांतरित की जाएंगी")}</li>
              <li>{t("PY payable balances will be combined", "पिछले वर्ष की देय शेष राशि संयोजित की जाएगी")}</li>
              <li>{t("The other cold store record will be deleted", "दूसरा कोल्ड स्टोर रिकॉर्ड हटा दिया जाएगा")}</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMergeDialogOpen(false); setMergingColdStore(null); }}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button 
              onClick={handleConfirmMerge} 
              disabled={mergeMutation.isPending}
              data-testid="button-confirm-coldstore-merge"
            >
              {mergeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("Confirm Merge", "मर्ज की पुष्टि करें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}