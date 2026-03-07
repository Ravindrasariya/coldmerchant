import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Banknote, FileText } from "lucide-react";

const CATEGORY_LABELS: Record<string, [string, string]> = {
  bank_loan: ["Bank Loan", "बैंक ऋण"],
  personal_loan: ["Personal Loan", "व्यक्तिगत ऋण"],
  vehicle_loan: ["Vehicle Loan", "वाहन ऋण"],
  other: ["Other", "अन्य"],
};

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function LiabilityRegister() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLiability, setEditingLiability] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [paymentDialogId, setPaymentDialogId] = useState<number | null>(null);
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", category: "bank_loan", lenderName: "", principalAmount: "", interestRate: "0", startDate: "", tenureMonths: "", type: "short_term", remarks: "" });
  const [paymentForm, setPaymentForm] = useState({ paymentDate: "", amount: "", principalPortion: "", interestPortion: "", remarks: "" });

  const { data: liabilities = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/liabilities"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/liabilities", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); setDialogOpen(false); toast({ title: t("Liability added", "देयता जोड़ी गई") }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/liabilities/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); setDialogOpen(false); setEditingLiability(null); toast({ title: t("Liability updated", "देयता अपडेट हुई") }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/liabilities/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); setDeleteId(null); toast({ title: t("Liability deleted", "देयता हटाई गई") }); },
  });

  const paymentMutation = useMutation({
    mutationFn: ({ liabilityId, data }: { liabilityId: number; data: any }) => apiRequest("POST", `/api/liabilities/${liabilityId}/payments`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); setPaymentDialogId(null); setPaymentForm({ paymentDate: "", amount: "", principalPortion: "", interestPortion: "", remarks: "" }); toast({ title: t("Payment recorded", "भुगतान दर्ज हुआ") }); },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/liabilities/payments/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); setDeletePaymentId(null); toast({ title: t("Payment deleted", "भुगतान हटाया गया") }); },
  });

  const openAdd = () => {
    setEditingLiability(null);
    setForm({ name: "", category: "bank_loan", lenderName: "", principalAmount: "", interestRate: "0", startDate: "", tenureMonths: "", type: "short_term", remarks: "" });
    setDialogOpen(true);
  };

  const openEdit = (l: any) => {
    setEditingLiability(l);
    setForm({
      name: l.name, category: l.category, lenderName: l.lenderName || "", principalAmount: l.principalAmount,
      interestRate: l.interestRate || "0", startDate: l.startDate, tenureMonths: l.tenureMonths?.toString() || "",
      type: l.type, remarks: l.remarks || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.principalAmount || !form.startDate) {
      toast({ title: t("Please fill required fields", "कृपया आवश्यक फ़ील्ड भरें"), variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name, category: form.category, lenderName: form.lenderName || null,
      principalAmount: form.principalAmount, interestRate: form.interestRate || "0",
      startDate: form.startDate, tenureMonths: form.tenureMonths ? parseInt(form.tenureMonths) : null,
      type: form.type, remarks: form.remarks || null,
    };
    if (editingLiability) updateMutation.mutate({ id: editingLiability.id, data: payload });
    else createMutation.mutate(payload);
  };

  const handlePaymentSubmit = () => {
    if (!paymentForm.paymentDate || !paymentForm.amount || !paymentDialogId) {
      toast({ title: t("Please fill required fields", "कृपया आवश्यक फ़ील्ड भरें"), variant: "destructive" });
      return;
    }
    paymentMutation.mutate({
      liabilityId: paymentDialogId,
      data: {
        paymentDate: paymentForm.paymentDate, amount: paymentForm.amount,
        principalPortion: paymentForm.principalPortion || "0",
        interestPortion: paymentForm.interestPortion || "0",
        remarks: paymentForm.remarks || null,
      },
    });
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4" data-testid="liability-register">
      <div className="flex justify-end">
        <Button onClick={openAdd} data-testid="button-add-liability">
          <Plus className="h-4 w-4 mr-1" />
          {t("Add Liability", "देयता जोड़ें")}
        </Button>
      </div>

      {liabilities.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>{t("No liabilities recorded yet", "अभी तक कोई देयता दर्ज नहीं है")}</p>
            <p className="text-sm mt-1">{t("Add loans, borrowings etc.", "ऋण, उधार आदि जोड़ें")}</p>
          </CardContent>
        </Card>
      ) : (
        liabilities.map((l: any) => {
          const catLabel = CATEGORY_LABELS[l.category] || ["Other", "अन्य"];
          const isExpanded = expandedId === l.id;
          return (
            <Card key={l.id} data-testid={`card-liability-${l.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg" data-testid={`text-liability-name-${l.id}`}>{l.name}</CardTitle>
                    <Badge variant="secondary">{t(catLabel[0], catLabel[1])}</Badge>
                    <Badge variant={l.type === "long_term" ? "default" : "outline"}>
                      {l.type === "long_term" ? t("Long Term", "दीर्घकालिक") : t("Short Term", "अल्पकालिक")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(l)} data-testid={`button-edit-liability-${l.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(l.id)} data-testid={`button-delete-liability-${l.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t("Principal", "मूलधन")}</span>
                    <p className="font-medium" data-testid={`text-principal-${l.id}`}>₹{fmt(parseFloat(l.principalAmount))}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("Interest Rate", "ब्याज दर")}</span>
                    <p className="font-medium">{l.interestRate}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("Total Paid", "कुल भुगतान")}</span>
                    <p className="font-medium text-green-600">₹{fmt(l.totalPaid)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("Remaining", "शेष")}</span>
                    <p className="font-semibold text-primary" data-testid={`text-remaining-${l.id}`}>₹{fmt(l.remainingBalance)}</p>
                  </div>
                </div>
                {l.lenderName && (
                  <p className="text-sm text-muted-foreground">{t("Lender", "ऋणदाता")}: {l.lenderName}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setPaymentDialogId(l.id); setPaymentForm({ paymentDate: "", amount: "", principalPortion: "", interestPortion: "", remarks: "" }); }} data-testid={`button-add-payment-${l.id}`}>
                    <Banknote className="h-3.5 w-3.5 mr-1" />
                    {t("Record Payment", "भुगतान दर्ज करें")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setExpandedId(isExpanded ? null : l.id)} data-testid={`button-toggle-payments-${l.id}`}>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                    {t("Payment History", "भुगतान इतिहास")} ({l.payments?.length || 0})
                  </Button>
                </div>
                {isExpanded && l.payments && l.payments.length > 0 && (
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left">{t("Date", "तिथि")}</th>
                          <th className="px-3 py-2 text-right">{t("Amount", "राशि")}</th>
                          <th className="px-3 py-2 text-right">{t("Principal", "मूलधन")}</th>
                          <th className="px-3 py-2 text-right">{t("Interest", "ब्याज")}</th>
                          <th className="px-3 py-2 text-left">{t("Remarks", "टिप्पणी")}</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.payments.map((p: any) => (
                          <tr key={p.id} className="border-t" data-testid={`row-payment-${p.id}`}>
                            <td className="px-3 py-2">{p.paymentDate}</td>
                            <td className="px-3 py-2 text-right font-medium">₹{fmt(parseFloat(p.amount))}</td>
                            <td className="px-3 py-2 text-right">₹{fmt(parseFloat(p.principalPortion || "0"))}</td>
                            <td className="px-3 py-2 text-right">₹{fmt(parseFloat(p.interestPortion || "0"))}</td>
                            <td className="px-3 py-2 text-muted-foreground">{p.remarks || "-"}</td>
                            <td className="px-3 py-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletePaymentId(p.id)} data-testid={`button-delete-payment-${p.id}`}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {isExpanded && (!l.payments || l.payments.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-3">{t("No payments recorded yet", "अभी तक कोई भुगतान दर्ज नहीं है")}</p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLiability ? t("Edit Liability", "देयता संपादित करें") : t("Add Liability", "देयता जोड़ें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Name", "नाम")} *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-liability-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Category", "श्रेणी")}</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-liability-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{t(v[0], v[1])}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Type", "प्रकार")}</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger data-testid="select-liability-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short_term">{t("Short Term", "अल्पकालिक")}</SelectItem>
                    <SelectItem value="long_term">{t("Long Term", "दीर्घकालिक")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("Lender Name", "ऋणदाता का नाम")}</Label>
              <Input value={form.lenderName} onChange={e => setForm(f => ({ ...f, lenderName: e.target.value }))} data-testid="input-lender-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Principal Amount (₹)", "मूलधन राशि (₹)")} *</Label>
                <Input type="number" value={form.principalAmount} onChange={e => setForm(f => ({ ...f, principalAmount: e.target.value }))} data-testid="input-principal-amount" />
              </div>
              <div>
                <Label>{t("Interest Rate (%)", "ब्याज दर (%)")}</Label>
                <Input type="number" value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} data-testid="input-interest-rate" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Start Date", "प्रारम्भ तिथि")} *</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} data-testid="input-start-date" />
              </div>
              <div>
                <Label>{t("Tenure (months)", "अवधि (महीने)")}</Label>
                <Input type="number" value={form.tenureMonths} onChange={e => setForm(f => ({ ...f, tenureMonths: e.target.value }))} data-testid="input-tenure-months" />
              </div>
            </div>
            <div>
              <Label>{t("Remarks", "टिप्पणी")}</Label>
              <Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} data-testid="input-liability-remarks" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-liability">{t("Cancel", "रद्द करें")}</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-liability">
              {editingLiability ? t("Update", "अपडेट करें") : t("Save", "सहेजें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogId !== null} onOpenChange={() => setPaymentDialogId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Record Payment", "भुगतान दर्ज करें")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Payment Date", "भुगतान तिथि")} *</Label>
              <Input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(f => ({ ...f, paymentDate: e.target.value }))} data-testid="input-payment-date" />
            </div>
            <div>
              <Label>{t("Total Amount (₹)", "कुल राशि (₹)")} *</Label>
              <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} data-testid="input-payment-amount" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Principal Portion (₹)", "मूलधन हिस्सा (₹)")}</Label>
                <Input type="number" value={paymentForm.principalPortion} onChange={e => setPaymentForm(f => ({ ...f, principalPortion: e.target.value }))} data-testid="input-principal-portion" />
              </div>
              <div>
                <Label>{t("Interest Portion (₹)", "ब्याज हिस्सा (₹)")}</Label>
                <Input type="number" value={paymentForm.interestPortion} onChange={e => setPaymentForm(f => ({ ...f, interestPortion: e.target.value }))} data-testid="input-interest-portion" />
              </div>
            </div>
            <div>
              <Label>{t("Remarks", "टिप्पणी")}</Label>
              <Input value={paymentForm.remarks} onChange={e => setPaymentForm(f => ({ ...f, remarks: e.target.value }))} data-testid="input-payment-remarks" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogId(null)} data-testid="button-cancel-payment">{t("Cancel", "रद्द करें")}</Button>
            <Button onClick={handlePaymentSubmit} disabled={paymentMutation.isPending} data-testid="button-save-payment">{t("Save Payment", "भुगतान सहेजें")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("Delete Liability?", "देयता हटाएं?")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("This will permanently delete this liability and all its payment records.", "यह इस देयता और उसके सभी भुगतान रिकॉर्ड को स्थायी रूप से हटा देगा।")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} data-testid="button-cancel-delete-liability">{t("Cancel", "रद्द करें")}</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending} data-testid="button-confirm-delete-liability">{t("Delete", "हटाएं")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletePaymentId !== null} onOpenChange={() => setDeletePaymentId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("Delete Payment?", "भुगतान हटाएं?")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("Are you sure you want to delete this payment record?", "क्या आप वाकई इस भुगतान रिकॉर्ड को हटाना चाहते हैं?")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePaymentId(null)}>{t("Cancel", "रद्द करें")}</Button>
            <Button variant="destructive" onClick={() => deletePaymentId && deletePaymentMutation.mutate(deletePaymentId)} disabled={deletePaymentMutation.isPending}>{t("Delete", "हटाएं")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
