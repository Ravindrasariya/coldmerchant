import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Plus, Trash2, Package } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SIZE_OPTIONS } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

interface StockEntryWithLots {
  id: number;
  serialNumber: number;
  purchaseDate: string;
  farmerName: string;
  farmerContact: string | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  paymentStatus: string;
  remarks: string | null;
  lots: Array<{
    id: number;
    coldStoreName: string;
    originalBags: number;
    remainingBags: number;
    potatoType: string;
    bagType: string;
    quality: string;
    cutType: string;
    size: string | null;
    pricePerKg: string | null;
    remarks: string | null;
    bagBreakdowns: Array<{
      id: number;
      size: string;
      numberOfBags: number;
      weight: string | null;
      pricePerKg: string | null;
      totalAmount: string | null;
    }>;
  }>;
}

interface StockEntryEditDialogProps {
  entry: StockEntryWithLots;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockEntryEditDialog({ entry, open, onOpenChange }: StockEntryEditDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [paymentStatus, setPaymentStatus] = useState(entry.paymentStatus);
  const [remarks, setRemarks] = useState(entry.remarks || "");
  const [lots, setLots] = useState(entry.lots.map(lot => ({
    ...lot,
    bagBreakdowns: lot.bagBreakdowns.map(bd => ({
      ...bd,
      weight: bd.weight ? parseFloat(bd.weight) : 0,
      pricePerKg: bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0,
    }))
  })));

  const updateMutation = useMutation({
    mutationFn: async (data: { paymentStatus: string; remarks: string; lots: typeof lots }) => {
      const res = await apiRequest("PATCH", `/api/stock-entries/${entry.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t("Entry Updated", "एंट्री अपडेट हो गई"),
        description: t("The stock entry has been updated successfully.", "स्टॉक एंट्री सफलतापूर्वक अपडेट हो गई।"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-entries"] });
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

  const handleAddBreakdown = (lotIndex: number) => {
    const newLots = [...lots];
    newLots[lotIndex].bagBreakdowns.push({
      id: 0,
      size: "",
      numberOfBags: 0,
      weight: 0,
      pricePerKg: 0,
      totalAmount: null,
    });
    setLots(newLots);
  };

  const handleRemoveBreakdown = (lotIndex: number, breakdownIndex: number) => {
    const newLots = [...lots];
    newLots[lotIndex].bagBreakdowns.splice(breakdownIndex, 1);
    setLots(newLots);
  };

  const handleBreakdownChange = (
    lotIndex: number,
    breakdownIndex: number,
    field: string,
    value: string | number | undefined
  ) => {
    const newLots = [...lots];
    (newLots[lotIndex].bagBreakdowns[breakdownIndex] as any)[field] = value;
    setLots(newLots);
  };

  const handleSave = () => {
    updateMutation.mutate({ paymentStatus, remarks, lots });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-primary">#{entry.serialNumber}</span>
            <span>{t("Edit Stock Entry", "स्टॉक एंट्री संपादित करें")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("Farmer Details", "किसान विवरण")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">{t("Name", "नाम")}</p>
                  <p className="font-medium">{entry.farmerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("Contact", "संपर्क")}</p>
                  <p className="font-medium">{entry.farmerContact || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("Date", "तिथि")}</p>
                  <p className="font-medium">
                    {new Date(entry.purchaseDate).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("Village", "गाँव")}</p>
                  <p className="font-medium">{entry.village || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("District", "जिला")}</p>
                  <p className="font-medium">{entry.district}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("State", "राज्य")}</p>
                  <p className="font-medium">{entry.state}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("Payment Status", "भुगतान स्थिति")}</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger data-testid="edit-payment-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due">{t("Due", "बाकी")}</SelectItem>
                  <SelectItem value="paid">{t("Paid", "भुगतान हो गया")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("Remarks", "टिप्पणी")}</Label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={t("Enter remarks...", "टिप्पणी दर्ज करें...")}
                className="resize-none"
                rows={2}
                data-testid="edit-remarks"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium">{t("Lots", "लॉट")}</h4>
            {lots.map((lot, lotIndex) => (
              <Card key={lot.id || lotIndex} className="border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
                        <Package className="h-3 w-3 text-primary" />
                      </div>
                      <CardTitle className="text-base font-medium">{lot.coldStoreName}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {lot.potatoType} • {lot.quality}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-mono font-medium">{lot.remainingBags}</span>
                      <span>/{lot.originalBags} {t("bags", "बोरी")}</span>
                    </div>
                  </div>
                </CardHeader>

                {lot.cutType === "bilty_cut" && (
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{t("Bag Breakdown", "बोरी विवरण")}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddBreakdown(lotIndex)}
                          data-testid={`edit-add-breakdown-${lotIndex}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {t("Add Row", "पंक्ति जोड़ें")}
                        </Button>
                      </div>

                      {lot.bagBreakdowns.length > 0 && (
                        <div className="space-y-2">
                          <div className="hidden md:grid md:grid-cols-6 gap-3 px-2 text-xs font-semibold text-muted-foreground uppercase">
                            <div>{t("Size", "आकार")}</div>
                            <div>{t("# Bags", "बोरी")}</div>
                            <div>{t("Weight", "वजन")}</div>
                            <div>{t("Price/kg", "मूल्य/किलो")}</div>
                            <div>{t("Total", "कुल")}</div>
                            <div></div>
                          </div>
                          {lot.bagBreakdowns.map((bd, bdIndex) => {
                            const total = (bd.weight || 0) * (bd.pricePerKg || 0);
                            return (
                              <div key={bd.id || bdIndex} className="grid grid-cols-2 md:grid-cols-6 gap-2 p-2 bg-muted/30 rounded-md items-center">
                                <Select
                                  value={bd.size}
                                  onValueChange={(v) => handleBreakdownChange(lotIndex, bdIndex, "size", v)}
                                >
                                  <SelectTrigger className="h-8" data-testid={`edit-breakdown-size-${lotIndex}-${bdIndex}`}>
                                    <SelectValue placeholder={t("Size", "आकार")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SIZE_OPTIONS.map((size) => (
                                      <SelectItem key={size} value={size}>{size}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  className="h-8"
                                  placeholder=""
                                  value={bd.numberOfBags ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                    handleBreakdownChange(lotIndex, bdIndex, "numberOfBags", val === "" ? undefined : parseInt(val));
                                  }}
                                  data-testid={`edit-breakdown-bags-${lotIndex}-${bdIndex}`}
                                />
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  className="h-8"
                                  placeholder=""
                                  value={bd.weight ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9.]/g, '');
                                    handleBreakdownChange(lotIndex, bdIndex, "weight", val === "" ? undefined : parseFloat(val));
                                  }}
                                  data-testid={`edit-breakdown-weight-${lotIndex}-${bdIndex}`}
                                />
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  className="h-8"
                                  placeholder=""
                                  value={bd.pricePerKg ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9.]/g, '');
                                    handleBreakdownChange(lotIndex, bdIndex, "pricePerKg", val === "" ? undefined : parseFloat(val));
                                  }}
                                  data-testid={`edit-breakdown-price-${lotIndex}-${bdIndex}`}
                                />
                                <div className="font-mono text-sm">
                                  {total > 0 ? `₹${total.toFixed(2)}` : "—"}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => handleRemoveBreakdown(lotIndex, bdIndex)}
                                  data-testid={`edit-remove-breakdown-${lotIndex}-${bdIndex}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {lot.bagBreakdowns.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          {t("No breakdown rows. Click \"Add Row\" to add breakdown details.", "कोई विवरण पंक्ति नहीं। विवरण जोड़ने के लिए \"पंक्ति जोड़ें\" पर क्लिक करें।")}
                        </p>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="edit-cancel">
            {t("Cancel", "रद्द करें")}
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="edit-save">
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("Save Changes", "बदलाव सहेजें")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
