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
  Users,
  Pencil,
  History,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SiWhatsapp } from "react-icons/si";
import { shareReceiptAsPdf } from "@/lib/receipt-share";
import { buildAadhatPannaElement, type AadhatPannaEntry, type PannaMerchant } from "@/lib/aadhat-panna";
import { type Aadhat, type AadhatEditHistory } from "@shared/schema";

interface LedgerEntry {
  date: string;
  tnxCode: string;
  particulars: string;
  dr: number;
  cr: number;
  sourceType: "stock_entry" | "payment";
  sourceId: number;
}

interface AadhatLedgerData {
  aadhatId: number;
  aadhatName: string;
  aadhatAddress: string;
  merchantName: string;
  merchantAddress: string;
  merchantContact: string;
  openingBalance: number;
  closingBalance: number;
  fyStart: string;
  fyEnd: string;
  availableFYs: string[];
  entries: LedgerEntry[];
}

function AadhatLedgerSection({ aadhatId, aadhatName, t, formatLedgerAmount, formatDate }: {
  aadhatId: number;
  aadhatName: string;
  t: (en: string, hi: string) => string;
  formatLedgerAmount: (v: number) => string;
  formatDate: (d: string) => string;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [selectedFy, setSelectedFy] = useState<string>("");

  const { data: ledgerData, isLoading } = useQuery<AadhatLedgerData>({
    queryKey: ["/api/aadhats", aadhatId, "ledger", selectedFy],
    queryFn: async () => {
      const fyParam = selectedFy ? `?fy=${selectedFy}` : "";
      const res = await fetch(`/api/aadhats/${aadhatId}/ledger${fyParam}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ledger");
      return res.json();
    },
    enabled: !!aadhatId,
  });

  const activeFyLabel = useMemo(() => {
    if (!ledgerData) return "";
    const startYear = ledgerData.fyStart.substring(0, 4);
    const endShort = String(parseInt(startYear) + 1).slice(2);
    return `${startYear}-${endShort}`;
  }, [ledgerData]);

  const ledgerRows = useMemo(() => {
    if (!ledgerData) return [];
    const rows: { kramank: number; date: string; tnxCode: string; particulars: string; dr: number; cr: number; balance: number; isClosing?: boolean }[] = [];
    let balance = ledgerData.openingBalance;
    rows.push({ kramank: 0, date: ledgerData.fyStart, tnxCode: "", particulars: "Opening Balance", dr: 0, cr: ledgerData.openingBalance, balance });
    ledgerData.entries.forEach((entry, idx) => {
      const isClosing = entry.particulars === "Closing Balance";
      if (!isClosing) {
        balance = balance + entry.cr - entry.dr;
      }
      rows.push({ kramank: isClosing ? 0 : idx + 1, date: entry.date, tnxCode: entry.tnxCode, particulars: entry.particulars, dr: entry.dr, cr: entry.cr, balance: isClosing ? (ledgerData.closingBalance ?? balance) : balance, isClosing });
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
      h1.textContent = aadhatName;
      const addrP = document.createElement("p");
      addrP.style.cssText = "font-size:13px;color:#555;margin:4px 0;";
      addrP.textContent = ledgerData.aadhatAddress || "";
      const fyP = document.createElement("p");
      fyP.style.cssText = "font-size:14px;font-weight:600;margin:6px 0 0 0;";
      fyP.textContent = `${t("Aadhat Ledger", "आढ़त खाता")} — FY ${fyLabel}`;
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
          { text: row.tnxCode || "—", align: "left" },
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
      await shareReceiptAsPdf(printDiv, `${aadhatName}_Ledger_FY${fyLabel}`);
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
    <div className="bg-muted/10 border-b" data-testid={`aadhat-ledger-${aadhatId}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          {t("Ledger", "खाता")} — {aadhatName}
        </span>
        <div className="flex items-center gap-2">
          {ledgerData.availableFYs && ledgerData.availableFYs.length >= 1 && (
            <Select value={selectedFy || activeFyLabel} onValueChange={setSelectedFy} data-testid={`select-fy-aadhat-${aadhatId}`}>
              <SelectTrigger className="h-7 text-xs w-[110px]" data-testid={`select-fy-trigger-aadhat-${aadhatId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ledgerData.availableFYs.map(fy => (
                  <SelectItem key={fy} value={fy} data-testid={`select-fy-option-${fy}`}>FY {fy}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePdfExport}
            disabled={pdfLoading}
            data-testid={`button-pdf-ledger-aadhat-${aadhatId}`}
          >
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            <span className="ml-1 text-xs">{t("PDF", "PDF")}</span>
          </Button>
        </div>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="border px-2 py-1.5 text-center w-10">{t("Sr", "क्र.")}</th>
              <th className="border px-2 py-1.5 text-left w-24">{t("Date", "तारीख")}</th>
              <th className="border px-2 py-1.5 text-left w-20">{t("Ref #", "Ref #")}</th>
              <th className="border px-2 py-1.5 text-left">{t("Particulars", "विवरण")}</th>
              <th className="border px-2 py-1.5 text-right w-24">{t("Dr", "डेबिट")}</th>
              <th className="border px-2 py-1.5 text-right w-24">{t("Cr", "क्रेडिट")}</th>
              <th className="border px-2 py-1.5 text-right w-28">{t("Balance", "शेष")}</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.map((row, i) => (
              <tr key={i} className={row.isClosing ? "bg-amber-50/50 dark:bg-amber-950/20 font-semibold border-t-2" : i === 0 ? "bg-blue-50/50 dark:bg-blue-950/20 font-semibold" : row.dr > 0 ? "bg-green-50/30 dark:bg-green-950/10" : ""} data-testid={`aadhat-ledger-row-${aadhatId}-${i}`}>
                <td className="border px-2 py-1.5 text-center text-muted-foreground">{row.isClosing ? "" : row.kramank}</td>
                <td className="border px-2 py-1.5">{formatDate(row.date)}</td>
                <td className="border px-2 py-1.5 font-mono">{row.tnxCode || "—"}</td>
                <td className="border px-2 py-1.5">{row.particulars}</td>
                <td className="border px-2 py-1.5 text-right text-green-700 dark:text-green-400">{row.isClosing ? "" : formatLedgerAmount(row.dr)}</td>
                <td className="border px-2 py-1.5 text-right">{row.isClosing ? "" : formatLedgerAmount(row.cr)}</td>
                <td className="border px-2 py-1.5 text-right font-semibold">{row.isClosing ? `${formatLedgerAmount(Math.abs(row.balance))} ${row.balance >= 0 ? "Cr" : "Dr"}` : formatLedgerAmount(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-2 px-3 py-2">
        {ledgerRows.map((row, i) => (
          <div
            key={i}
            className={`rounded-md border p-3 text-xs ${row.isClosing ? "bg-amber-50/50 dark:bg-amber-950/20 font-semibold border-t-2" : i === 0 ? "bg-blue-50/50 dark:bg-blue-950/20 font-semibold" : row.dr > 0 ? "bg-green-50/30 dark:bg-green-950/10" : "bg-card"}`}
            data-testid={`aadhat-ledger-card-${aadhatId}-${i}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-muted-foreground">{row.isClosing ? "" : `#${row.kramank} · `}{formatDate(row.date)}</span>
              {row.tnxCode && <span className="font-mono text-muted-foreground">{row.tnxCode}</span>}
            </div>
            <div className="mb-1.5">{row.particulars}</div>
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                {!row.isClosing && row.dr > 0 && <span className="text-green-700 dark:text-green-400">{t("Dr", "डे.")}: {formatLedgerAmount(row.dr)}</span>}
                {!row.isClosing && row.cr > 0 && <span>{t("Cr", "क्रे.")}: {formatLedgerAmount(row.cr)}</span>}
              </div>
              <span className="font-semibold">{t("Bal", "शेष")}: {row.isClosing ? `${formatLedgerAmount(Math.abs(row.balance))} ${row.balance >= 0 ? "Cr" : "Dr"}` : formatLedgerAmount(row.balance)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AadhatWithDues extends Aadhat {
  stockDue: number;
  totalDue: number;
  pyPayableAmount: number;
  dueTodayAmount: number;
  dueOver15Days: number;
  dueOver30Days: number;
}

export default function AadhatLedgerTab() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAadhat, setEditingAadhat] = useState<AadhatWithDues | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "", contact: "", pyPayable: "", redFlag: false });
  const [showHistory, setShowHistory] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergingAadhat, setMergingAadhat] = useState<{ id: number; aadhatId: string; name: string } | null>(null);
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", contact: "", pyPayable: "", redFlag: false });

  const [yearFilter, setYearFilter] = useState<string>("all");
  const [nameFilter, setNameFilter] = useState("");
  
  const [sortColumn, setSortColumn] = useState<'aadhatId' | 'totalDue' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedAadhatId, setExpandedAadhatId] = useState<number | null>(null);

  const { data: aadhatList = [], isLoading } = useQuery<AadhatWithDues[]>({
    queryKey: ["/api/aadhats"],
    enabled: !!user,
  });

  const { data: merchant } = useQuery<PannaMerchant>({
    queryKey: ["/api/merchants", user?.merchantId],
    enabled: !!user?.merchantId,
  });

  const [sharingAadhatId, setSharingAadhatId] = useState<number | null>(null);

  const handleShareAadhatPanna = async (aadhat: AadhatWithDues) => {
    if (sharingAadhatId) return;
    if (user?.merchantId && !merchant) {
      toast({ title: t("Still loading, please try again", "लोड हो रहा है, कृपया पुनः प्रयास करें") });
      return;
    }
    setSharingAadhatId(aadhat.id);
    try {
      const res = await fetch(`/api/cash/aadhat-pending-entries/${aadhat.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending entries");
      const data: { pendingEntries: AadhatPannaEntry[]; pyPayable: number } = await res.json();
      const entries = (data.pendingEntries || []).filter(e => e.dueAmount >= 1);
      const pyPayable = data.pyPayable || 0;

      if (entries.length === 0 && pyPayable < 1) {
        toast({ title: t("No outstanding dues for this aadhat", "इस आढ़त का कोई बकाया नहीं है") });
        return;
      }

      const merchantData: PannaMerchant = merchant || {
        id: user?.merchantId ?? 0,
        name: "",
        address: null,
        contactNumber: null,
        receiptHeaderImage: null,
        receiptHtmlTemplate: null,
      };

      const printDiv = buildAadhatPannaElement({
        merchant: merchantData,
        aadhatName: aadhat.name,
        aadhatAddress: aadhat.address ?? null,
        aadhatContact: aadhat.contact ?? null,
        entries,
        pyPayable,
        t,
      });
      document.body.appendChild(printDiv);
      try {
        await shareReceiptAsPdf(printDiv, `${aadhat.name}_Aadhat_Panna`);
      } finally {
        if (printDiv.parentNode) document.body.removeChild(printDiv);
      }
    } catch (err) {
      console.error("Aadhat Panna share failed:", err);
      toast({ title: t("Failed to create Aadhat Panna", "आढ़त पन्ना बनाने में विफल"), variant: "destructive" });
    } finally {
      setSharingAadhatId(null);
    }
  };

  const { data: editHistory = [], isLoading: historyLoading } = useQuery<AadhatEditHistory[]>({
    queryKey: ["/api/aadhats", editingAadhat?.id, "history"],
    queryFn: async () => {
      if (!editingAadhat?.id) return [];
      const res = await fetch(`/api/aadhats/${editingAadhat.id}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!editingAadhat?.id && showHistory,
  });

  const createMutation = useMutation({
    mutationFn: async (aadhat: typeof addForm) => {
      const response = await apiRequest("POST", "/api/aadhats", {
        name: aadhat.name,
        address: aadhat.address,
        contact: aadhat.contact || null,
        pyPayable: aadhat.pyPayable || "0",
        redFlag: aadhat.redFlag,
        isActive: true,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aadhats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
      setAddDialogOpen(false);
      setAddForm({ name: "", address: "", contact: "", pyPayable: "", redFlag: false });
      toast({ title: t("Aadhat added successfully", "आढ़त सफलतापूर्वक जोड़ा गया"), variant: "success" });
    },
    onError: () => {
      toast({ title: t("Failed to add aadhat", "आढ़त जोड़ने में विफल"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & typeof editForm) => {
      const response = await fetch(`/api/aadhats/${id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          address: data.address,
          contact: data.contact || null,
          pyPayable: data.pyPayable || "0",
          redFlag: data.redFlag,
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
      queryClient.invalidateQueries({ queryKey: ["/api/aadhats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
      setEditDialogOpen(false);
      setEditingAadhat(null);
      setShowHistory(false);
      toast({ title: t("Aadhat updated successfully", "आढ़त सफलतापूर्वक अपडेट किया गया"), description: data.message, variant: "success" });
    },
    onError: (error: any) => {
      const errorData = error.data || error;
      if (error.status === 409 && errorData.requiresMerge && errorData.existingAadhat) {
        setEditDialogOpen(false);
        setMergingAadhat({
          id: errorData.existingAadhat.id,
          aadhatId: errorData.existingAadhat.aadhatId,
          name: errorData.existingAadhat.name,
        });
        setMergeDialogOpen(true);
      } else {
        toast({ title: t("Failed to update aadhat", "आढ़त अपडेट करने में विफल"), description: errorData.message, variant: "destructive" });
      }
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: number; targetId: number }) => {
      const response = await apiRequest("POST", "/api/aadhats/merge", { sourceId, targetId });
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/aadhats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/timeseries"] });
      setMergeDialogOpen(false);
      setMergingAadhat(null);
      setEditingAadhat(null);
      toast({
        title: t("Aadhats Merged", "आढ़त मर्ज किए गए"),
        description: data.message,
        variant: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "त्रुटि"),
        description: error.message || t("Failed to merge aadhats", "आढ़तों को मर्ज करने में विफल"),
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/aadhats/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aadhats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/aadhats-with-dues"] });
    },
  });

  const handleEditClick = (aadhat: AadhatWithDues) => {
    setEditingAadhat(aadhat);
    setEditForm({
      name: aadhat.name,
      address: aadhat.address,
      contact: aadhat.contact || "",
      pyPayable: aadhat.pyPayable || "0",
      redFlag: aadhat.redFlag ?? false,
    });
    setShowHistory(false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingAadhat) return;
    if (!editForm.name.trim() || !editForm.address.trim()) {
      toast({ title: t("Name and Address are required", "नाम और पता आवश्यक हैं"), variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editingAadhat.id, ...editForm });
  };

  const handleConfirmMerge = () => {
    if (!editingAadhat || !mergingAadhat) return;
    mergeMutation.mutate({
      sourceId: editingAadhat.id,
      targetId: mergingAadhat.id,
    });
  };

  const handleAddAadhat = () => {
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
    };
    return fieldMap[field] || field;
  };

  const yearOptions = Array.from(new Set(
    aadhatList
      .map(a => a.aadhatId?.substring(2, 6))
      .filter(Boolean)
  )).sort().reverse();

  const handleSort = (column: 'aadhatId' | 'totalDue') => {
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

  const filteredAadhats = aadhatList
    .filter(aadhat => {
      if (yearFilter !== "all") {
        if (!aadhat.aadhatId) return false;
        const aadhatYear = aadhat.aadhatId.substring(2, 6);
        if (aadhatYear !== yearFilter) return false;
      }
      if (nameFilter.trim()) {
        const searchLower = nameFilter.toLowerCase().trim();
        if (!aadhat.name.toLowerCase().includes(searchLower)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortColumn) return 0;
      
      if (sortColumn === 'aadhatId') {
        const aCode = a.aadhatId || '';
        const bCode = b.aadhatId || '';
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

  const summary = useMemo(() => {
    return {
      totalDue: filteredAadhats.reduce((sum, a) => sum + a.totalDue, 0),
      receivableDue: filteredAadhats.reduce((sum, a) => sum + a.pyPayableAmount, 0),
      dueOver30Days: filteredAadhats.reduce((sum, a) => sum + a.dueOver30Days, 0),
      dueOver15Days: filteredAadhats.reduce((sum, a) => sum + a.dueOver15Days, 0),
      dueToday: filteredAadhats.reduce((sum, a) => sum + a.dueTodayAmount, 0),
    };
  }, [filteredAadhats]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value);
  };

  const formatLedgerAmount = (v: number) => {
    if (v === 0) return "—";
    return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
  };

  const formatDate = (d: string) => {
    if (!d) return "—";
    const parts = d.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="border-blue-300 dark:border-blue-700 p-4">
          <div className="text-xs text-muted-foreground">{t("Total Due", "कुल बकाया")}</div>
          <div className="text-sm font-bold mt-1" data-testid="summary-total-due">{formatCurrency(summary.totalDue)}</div>
        </Card>
        <Card className="border-purple-300 dark:border-purple-700 p-4">
          <div className="text-xs text-muted-foreground">{t("PY Payable Due", "पीवाय देय बकाया")}</div>
          <div className="text-sm font-bold mt-1 text-purple-600 dark:text-purple-400" data-testid="summary-receivable-due">{formatCurrency(summary.receivableDue)}</div>
        </Card>
        <Card className="border-red-300 dark:border-red-700 p-4">
          <div className="text-xs text-muted-foreground">{t("Due (>30 Days)", "बकाया (>30 दिन)")}</div>
          <div className="text-sm font-bold mt-1 text-red-600 dark:text-red-400" data-testid="summary-due-over-30">{formatCurrency(summary.dueOver30Days)}</div>
        </Card>
        <Card className="border-orange-300 dark:border-orange-700 p-4">
          <div className="text-xs text-muted-foreground">{t("Due (>15 Days)", "बकाया (>15 दिन)")}</div>
          <div className="text-sm font-bold mt-1 text-orange-600 dark:text-orange-400" data-testid="summary-due-over-15">{formatCurrency(summary.dueOver15Days)}</div>
        </Card>
        <Card className="border-green-300 dark:border-green-700 p-4">
          <div className="text-xs text-muted-foreground">{t("Due (Today)", "बकाया (आज)")}</div>
          <div className="text-sm font-bold mt-1 text-green-600 dark:text-green-400" data-testid="summary-due-today">{formatCurrency(summary.dueToday)}</div>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("Aadhat Ledger", "आढ़त खाता")}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[90px]" data-testid="select-aadhat-year-filter">
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
                  data-testid="input-aadhat-name-filter"
                />
              </div>
              <Button
                onClick={() => setAddDialogOpen(true)}
                variant="outline"
                size="sm"
                data-testid="button-add-aadhat"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("Add Aadhat", "आढ़त जोड़ें")}
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
                <div className="grid items-center gap-2 px-3 py-2 bg-muted/50 text-xs font-medium border-b min-w-[800px]" style={{ gridTemplateColumns: '36px minmax(100px, 1fr) minmax(100px, 1.2fr) minmax(100px, 1.2fr) minmax(80px, 0.8fr) 55px 48px minmax(80px, 0.8fr) minmax(80px, 0.8fr) minmax(80px, 0.8fr) 44px' }}>
                  <div></div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('aadhatId')}
                    data-testid="sort-aadhat-id"
                  >
                    {t("Aadhat ID", "आढ़त आईडी")}
                    {sortColumn === 'aadhatId' ? (
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
                  <div>{t("Stock Due", "स्टॉक बकाया")}</div>
                  <div 
                    className="flex items-center gap-1 cursor-pointer select-none"
                    onClick={() => handleSort('totalDue')}
                    data-testid="sort-aadhat-total-due"
                  >
                    {t("Total Due", "कुल बकाया")}
                    {sortColumn === 'totalDue' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div></div>
                </div>
                
                {filteredAadhats.map((aadhat, index) => (
                  <div key={aadhat.id}>
                    <div 
                      className="grid items-center gap-2 px-3 py-2 border-b min-w-[800px] cursor-pointer hover:bg-muted/30 transition-colors"
                      style={{ gridTemplateColumns: '36px minmax(100px, 1fr) minmax(100px, 1.2fr) minmax(100px, 1.2fr) minmax(80px, 0.8fr) 55px 48px minmax(80px, 0.8fr) minmax(80px, 0.8fr) minmax(80px, 0.8fr) 44px' }}
                      data-testid={`aadhat-row-${index}`}
                      onClick={() => setExpandedAadhatId(expandedAadhatId === aadhat.id ? null : aadhat.id)}
                    >
                      <div className="flex items-center justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleEditClick(aadhat); }}
                          data-testid={`button-edit-aadhat-${index}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground truncate flex items-center gap-1" data-testid={`text-aadhat-code-${index}`}>
                        {expandedAadhatId === aadhat.id ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
                        {aadhat.aadhatId || '-'}
                      </div>
                      <div className="text-xs truncate" data-testid={`text-aadhat-name-${index}`}>
                        {aadhat.name}
                      </div>
                      <div className="text-xs truncate" data-testid={`text-aadhat-address-${index}`}>
                        {aadhat.address}
                      </div>
                      <div className="text-xs truncate" data-testid={`text-aadhat-contact-${index}`}>
                        {aadhat.contact || '-'}
                      </div>
                      <div className="flex items-center">
                        {aadhat.redFlag ? (
                          <Badge variant="destructive" className="text-xs">{t("Yes", "हाँ")}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">{t("No", "नहीं")}</Badge>
                        )}
                      </div>
                      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={aadhat.isActive ?? true}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: aadhat.id, isActive: checked })}
                          data-testid={`switch-aadhat-active-${index}`}
                        />
                      </div>
                      <div className="text-xs font-mono text-orange-600 dark:text-orange-400">
                        ₹{parseFloat(aadhat.pyPayable || "0").toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </div>
                      <div className="text-xs font-mono text-blue-600 dark:text-blue-400" data-testid={`text-aadhat-stock-due-${index}`}>
                        ₹{(aadhat.stockDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </div>
                      <div className="text-xs font-mono text-green-600 dark:text-green-400 font-semibold">
                        ₹{aadhat.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </div>
                      <div className="flex items-center justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleShareAadhatPanna(aadhat); }}
                          disabled={sharingAadhatId === aadhat.id}
                          title={t("Share Aadhat Panna", "आढ़त पन्ना साझा करें")}
                          data-testid={`button-share-aadhat-panna-${index}`}
                        >
                          {sharingAadhatId === aadhat.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <SiWhatsapp className="h-4 w-4 text-green-600 dark:text-green-500" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {expandedAadhatId === aadhat.id && (
                      <AadhatLedgerSection
                        aadhatId={aadhat.id}
                        aadhatName={aadhat.name}
                        t={t}
                        formatLedgerAmount={formatLedgerAmount}
                        formatDate={formatDate}
                      />
                    )}
                  </div>
                ))}
              </div>
              
              {filteredAadhats.map((aadhat, index) => (
                <div key={`mobile-${aadhat.id}`} className="md:hidden">
                  <div 
                    className="p-4 border rounded-lg bg-card space-y-3 cursor-pointer"
                    data-testid={`aadhat-card-${index}`}
                    onClick={() => setExpandedAadhatId(expandedAadhatId === aadhat.id ? null : aadhat.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                        {expandedAadhatId === aadhat.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {aadhat.aadhatId || '-'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleEditClick(aadhat); }}
                        data-testid={`button-edit-aadhat-mobile-${index}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="font-medium">{aadhat.name}</div>
                    <div className="text-sm text-muted-foreground">{aadhat.address}</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {aadhat.contact && <span>{t("Contact", "संपर्क")}: {aadhat.contact}</span>}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {aadhat.redFlag ? (
                          <Badge variant="destructive">{t("Red Flag", "रेड फ्लैग")}</Badge>
                        ) : null}
                        <Switch
                          checked={aadhat.isActive ?? true}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: aadhat.id, isActive: checked })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-xs text-orange-600 dark:text-orange-400">{t("PY Payable", "पीवाय देय")}: ₹{parseFloat(aadhat.pyPayable || "0").toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                          <div className="text-xs text-blue-600 dark:text-blue-400">{t("Stock Due", "स्टॉक बकाया")}: ₹{(aadhat.stockDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                          <div className="text-sm font-mono text-green-600 dark:text-green-400 font-semibold">{t("Total Due", "कुल बकाया")}: ₹{aadhat.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleShareAadhatPanna(aadhat); }}
                          disabled={sharingAadhatId === aadhat.id}
                          title={t("Share Aadhat Panna", "आढ़त पन्ना साझा करें")}
                          data-testid={`button-share-aadhat-panna-mobile-${index}`}
                        >
                          {sharingAadhatId === aadhat.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <SiWhatsapp className="h-4 w-4 text-green-600 dark:text-green-500" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {expandedAadhatId === aadhat.id && (
                    <AadhatLedgerSection
                      aadhatId={aadhat.id}
                      aadhatName={aadhat.name}
                      t={t}
                      formatLedgerAmount={formatLedgerAmount}
                      formatDate={formatDate}
                    />
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
              {t("Edit Aadhat", "आढ़त संपादित करें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder={t("Aadhat name", "आढ़त का नाम")}
                data-testid="input-edit-aadhat-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-edit-aadhat-address"
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
                  data-testid="input-edit-aadhat-contact"
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
                  data-testid="input-edit-aadhat-py-payable"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={editForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setEditForm({ ...editForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-edit-aadhat-red-flag">
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
                data-testid="button-toggle-aadhat-history"
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
              {t("Add Aadhat", "आढ़त जोड़ें")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Name", "नाम")} *</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder={t("Aadhat name", "आढ़त का नाम")}
                data-testid="input-add-aadhat-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Address", "पता")} *</Label>
              <Input
                value={addForm.address}
                onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                placeholder={t("Address", "पता")}
                data-testid="input-add-aadhat-address"
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
                  data-testid="input-add-aadhat-contact"
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
                  data-testid="input-add-aadhat-py-payable"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Red Flag", "रेड फ्लैग")}</Label>
              <Select
                value={addForm.redFlag ? "yes" : "no"}
                onValueChange={(v) => setAddForm({ ...addForm, redFlag: v === "yes" })}
              >
                <SelectTrigger data-testid="select-add-aadhat-red-flag">
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
            <Button onClick={handleAddAadhat} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("Add", "जोड़ें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{t("Merge Aadhats", "आढ़त मर्ज करें")}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm mb-4">
              {t("An aadhat with these details already exists:", "इन विवरणों के साथ एक आढ़त पहले से मौजूद है:")}
            </p>
            <div className="bg-muted/50 p-3 rounded mb-4">
              <div className="text-sm font-medium" data-testid="text-merge-aadhat-name">{mergingAadhat?.name}</div>
              <div className="text-xs text-muted-foreground font-mono" data-testid="text-merge-aadhat-code">{mergingAadhat?.aadhatId}</div>
            </div>
            <p className="text-sm mb-2">
              {t("If you merge:", "यदि आप मर्ज करते हैं:")}
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
              <li>{t("The aadhat with the lower ID will be kept", "कम आईडी वाला आढ़त रखा जाएगा")}</li>
              <li>{t("All linked stock entries and cash entries will be transferred", "सभी संबंधित स्टॉक एंट्री और नकद प्रविष्टियाँ स्थानांतरित की जाएंगी")}</li>
              <li>{t("PY payable balances will be combined", "पिछले वर्ष की देय शेष राशि संयोजित की जाएगी")}</li>
              <li>{t("The other aadhat record will be deleted", "दूसरा आढ़त रिकॉर्ड हटा दिया जाएगा")}</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMergeDialogOpen(false); setMergingAadhat(null); }}>
              {t("Cancel", "रद्द करें")}
            </Button>
            <Button 
              onClick={handleConfirmMerge} 
              disabled={mergeMutation.isPending}
              data-testid="button-confirm-aadhat-merge"
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
