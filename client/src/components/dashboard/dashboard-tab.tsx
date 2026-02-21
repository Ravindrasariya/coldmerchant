import { useState, useMemo } from "react";
import { calculateInterestOnly } from "@/lib/interest-utils";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChevronDown, Loader2 } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";

interface StockEntryWithLots {
  id: number;
  uniqueId: string | null;
  serialNumber: number;
  purchaseDate: string;
  farmerName: string;
  farmerContact: string | null;
  farmerId: number | null;
  village: string | null;
  tehsil: string | null;
  district: string;
  state: string;
  paymentStatus: string;
  amountPaid: string | null;
  remarks: string | null;
  crop?: string;
  lots: Array<{
    id: number;
    place: string | null;
    coldStoreName: string | null;
    coldStoreLotNumber: string | null;
    crop?: string;
    originalBags: number;
    remainingBags: number;
    potatoType: string | null;
    harvestPotatoType: string | null;
    bagType: string;
    quality: string;
    cutType: string;
    size: string | null;
    pricePerKg: string | null;
    totalWeight: string | null;
    coldStoreChargesPerBag: string | null;
    hammaliGradingCharges: string | null;
    charges: Array<{ type: string; amount: number | string }> | null;
    coldStorageChargesPaid: string | null;
    adjustedAmount: string | null;
    adjustedAmountType: string | null;
    adjustedAmountRate: string | null;
    adjustedAmountEffectiveDate: string | null;
    adjustedAmountRemark: string | null;
    remarks: string | null;
    bagBreakdowns: Array<{
      id: number;
      size: string;
      numberOfBags: number;
      remainingBags: number | null;
      weight: string | null;
      pricePerKg: string | null;
      totalAmount: string | null;
    }>;
  }>;
}

interface SeedStockEntry {
  id: number;
  serialNumber: number;
  purchaseDate: string;
  supplierName: string;
  seedLots: Array<{
    id: number;
    originalBags: number;
    remainingBags: number;
    pricePerBag: string;
    coldStoreChargesPerBag: string | null;
    hammaliCharges: string | null;
    gradingCharges: string | null;
    transportCharges: string | null;
  }>;
}

interface FarmerWithDues {
  id: number;
  farmerCode: string | null;
  name: string;
  harvestDue: number;
  seedDue: number;
  netDue: number;
  coldDue: number;
}

interface BuyerWithDues {
  id: number;
  buyerCode: string | null;
  name: string;
  address: string;
  overallDue: number;
  receivables: number;
}

interface ColdStoreWithDue {
  coldStoreName: string;
  totalDue: number;
  lotCount: number;
}

interface TimeseriesData {
  farmerDueTimeSeries: Array<{ date: string; amount: number }>;
  buyerDueTimeSeries: Array<{ date: string; amount: number }>;
  dailyVolumeTimeSeries: Array<{ date: string; volume: number }>;
  cumulativePnlTimeSeries: Array<{ date: string; pnl: number }>;
  summary: {
    farmerHarvestPayable: number;
    farmerHarvestDue: number;
    farmerSeedPayable: number;
    farmerSeedDue: number;
    coldStoreTotalCharges: number;
    coldStoreDue: number;
    buyerTotalRevenue: number;
    buyerTotalDue: number;
    farmerPyReceivableTotal: number;
    farmerPyReceivableDue: number;
    buyerPyReceivableTotal: number;
    buyerPyReceivableDue: number;
  };
  farmerDueByCrop: Array<{ name: string; value: number }>;
  buyerDueByName: Array<{ name: string; value: number; percentage: number }>;
}

function computeLotMetrics(lot: StockEntryWithLots['lots'][0]) {
  const wastageBags = lot.bagBreakdowns
    .filter(bd => bd.size === "Wastage")
    .reduce((sum, bd) => sum + bd.numberOfBags, 0);

  const actualSellableBags = lot.originalBags - wastageBags;
  const remainingToSell = Math.min(lot.remainingBags, actualSellableBags);

  let totalAmount: number | null = null;

  const sellableBreakdownsForCalc = lot.bagBreakdowns.filter(bd => bd.size !== "Wastage");
  const hasBreakdownData = sellableBreakdownsForCalc.some(bd => {
    const w = bd.weight ? parseFloat(bd.weight) : 0;
    const p = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
    return w > 0 && p > 0;
  });

  if (hasBreakdownData) {
    lot.bagBreakdowns.forEach(bd => {
      if (bd.size !== "Wastage") {
        const weight = bd.weight ? parseFloat(bd.weight) : 0;
        const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
        const netWeight = weight > 0 ? weight - bd.numberOfBags : 0;
        if (netWeight > 0 && price > 0) {
          totalAmount = (totalAmount ?? 0) + (netWeight * price);
        }
      }
    });
  } else {
    const lotTotalWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
    const price = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
    const netWeight = lotTotalWeight > 0 ? lotTotalWeight - lot.originalBags : 0;
    if (netWeight > 0 && price > 0) {
      totalAmount = netWeight * price;
    }
  }

  const hammaliGradingCharges = lot.hammaliGradingCharges ? parseFloat(lot.hammaliGradingCharges) : 0;
  const isFarmGate = lot.place === "farm_gate";
  const farmerDeductionTypes = ["Cold Charges", "Ware House Charges"];
  const dynamicCharges = (lot.charges || [])
    .filter(c => !(isFarmGate && farmerDeductionTypes.includes(c.type)))
    .reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);
  const totalDeductions = hammaliGradingCharges + dynamicCharges;

  const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
  const coldStoreTotalCharges = (lot.charges || [])
    .filter(c => c && coldStoreTypes.includes(c.type))
    .reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);
  const coldStorePaid = lot.coldStorageChargesPaid ? parseFloat(lot.coldStorageChargesPaid) : 0;

  const rawAdjustedAmount = lot.adjustedAmount !== null ? parseFloat(lot.adjustedAmount) : 0;
  const adjustedAmountType = lot.adjustedAmountType;
  const adjustedAmountRate = lot.adjustedAmountRate ? parseFloat(lot.adjustedAmountRate) : 0;

  const { interest: finalAdjustment } = calculateInterestOnly(rawAdjustedAmount, adjustedAmountRate, lot.adjustedAmountEffectiveDate || null);

  return {
    actualSellableBags,
    remainingToSell,
    totalAmount,
    totalDeductions,
    coldStoreTotalCharges,
    coldStorePaid,
    adjustedAmount: finalAdjustment,
    adjustedAmountType,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_HI = ["जन", "फर", "मार्च", "अप्रै", "मई", "जून", "जुल", "अग", "सित", "अक्टू", "नव", "दिस"];

const formatINR = (value: number) => `₹${new Intl.NumberFormat('en-IN').format(Math.round(value))}`;

const PIE_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#14532d", "#dc2626", "#7c3aed", "#0891b2", "#ca8a04", "#be185d", "#334155"];

const shortName = (name: string) => {
  const words = name.split(/\s+/);
  return words.length > 2 ? words.slice(0, 2).join(" ") : name;
};

const RADIAN = Math.PI / 180;

const renderOuterLabel = (formatter: (v: number) => string, colors: string[]) =>
  ({ cx, cy, midAngle, outerRadius, index, name, value }: {
    cx: number; cy: number; midAngle: number; outerRadius: number;
    index: number; name: string; value: number;
  }) => {
    const radius = outerRadius + 20;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const anchor = midAngle > 90 && midAngle < 270 ? "end" : "start";
    const fill = colors[index % colors.length];
    return (
      <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" style={{ fontSize: "11px", fontWeight: 600, fill }}>
        <tspan x={x} dy="-0.5em">{formatter(value)}</tspan>
        <tspan x={x} dy="1.15em" style={{ fontSize: "10px", fontWeight: 500 }}>{shortName(name)}</tspan>
      </text>
    );
  };

const renderShortLabelLine = (colors: string[]) =>
  ({ cx, cy, midAngle, outerRadius, index }: {
    cx: number; cy: number; midAngle: number; outerRadius: number; index: number;
  }) => {
    const startR = outerRadius + 2;
    const endR = outerRadius + 12;
    const x1 = cx + startR * Math.cos(-midAngle * RADIAN);
    const y1 = cy + startR * Math.sin(-midAngle * RADIAN);
    const x2 = cx + endR * Math.cos(-midAngle * RADIAN);
    const y2 = cy + endR * Math.sin(-midAngle * RADIAN);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors[index % colors.length]} strokeWidth={1.5} />;
  };

export function DashboardTab() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [cropFilter, setCropFilter] = useState<string>("all");
  const [selectedYears, setSelectedYears] = useState<number[]>([currentYear]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([currentMonth]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [allDays, setAllDays] = useState(true);

  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = 2022; y <= currentYear; y++) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const allYearsSelected = selectedYears.length === availableYears.length;

  const toggleYear = (year: number) => {
    setSelectedYears(prev =>
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
    );
  };

  const toggleAllYears = () => {
    if (allYearsSelected) {
      setSelectedYears([currentYear]);
    } else {
      setSelectedYears([...availableYears]);
    }
  };

  const toggleMonth = (month: number) => {
    setSelectedMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
    );
  };

  const allMonthsSelected = selectedMonths.length === 12;

  const toggleAllMonths = () => {
    if (allMonthsSelected) {
      setSelectedMonths([currentMonth]);
    } else {
      setSelectedMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
  };

  const maxDaysInSelectedMonths = useMemo(() => {
    if (selectedMonths.length === 0) return 31;
    let max = 28;
    for (const m of selectedMonths) {
      if ([1, 3, 5, 7, 8, 10, 12].includes(m)) max = Math.max(max, 31);
      else if ([4, 6, 9, 11].includes(m)) max = Math.max(max, 30);
      else max = Math.max(max, 29);
    }
    return max;
  }, [selectedMonths]);

  const toggleDay = (day: number) => {
    setAllDays(false);
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleAllDaysCheck = () => {
    if (allDays) {
      setAllDays(false);
      setSelectedDays([]);
    } else {
      setAllDays(true);
      setSelectedDays([]);
    }
  };

  const yearsParam = allYearsSelected ? "all" : selectedYears.join(",");
  const monthsParam = allMonthsSelected ? "all" : selectedMonths.join(",");
  const daysParam = allDays ? "all" : selectedDays.join(",");

  const { data: stockEntries, isLoading: stockLoading } = useQuery<StockEntryWithLots[]>({
    queryKey: ["/api/stock-entries"],
  });

  const { data: seedEntries, isLoading: seedLoading } = useQuery<SeedStockEntry[]>({
    queryKey: ["/api/seed-stock-entries"],
  });


  const { data: timeseries, isLoading: timeseriesLoading } = useQuery<TimeseriesData>({
    queryKey: ["/api/dashboard/timeseries", cropFilter, yearsParam, monthsParam, daysParam],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("crop", cropFilter);
      params.set("years", yearsParam);
      params.set("months", monthsParam);
      params.set("days", daysParam);
      const res = await fetch(`/api/dashboard/timeseries?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch timeseries");
      return res.json();
    },
  });

  const matchesFilter = (dateStr: string, crop?: string) => {
    if (cropFilter !== "all" && crop && crop !== cropFilter) return false;
    const d = new Date(dateStr);
    if (!allYearsSelected && !selectedYears.includes(d.getFullYear())) return false;
    if (!allMonthsSelected && !selectedMonths.includes(d.getMonth() + 1)) return false;
    if (!allDays && selectedDays.length > 0 && !selectedDays.includes(d.getDate())) return false;
    return true;
  };

  const harvestSummary = useMemo(() => {
    if (!stockEntries) return { totalBags: 0, remainingBags: 0, totalAmount: 0 };
    let totalBags = 0;
    let remainingBags = 0;
    let totalAmount = 0;

    stockEntries.forEach(entry => {
      if (!matchesFilter(entry.purchaseDate, entry.crop || "potato")) return;
      (entry.lots || []).forEach(lot => {
        if (cropFilter !== "all" && (lot.crop || "potato") !== cropFilter) return;
        const metrics = computeLotMetrics(lot);
        totalBags += metrics.actualSellableBags;
        remainingBags += metrics.remainingToSell;
        if (metrics.totalAmount !== null) {
          totalAmount += metrics.totalAmount;
        }
        if (lot.place === "farm_gate") {
          totalAmount += metrics.coldStoreTotalCharges;
        }
      });
    });

    return { totalBags, remainingBags, totalAmount };
  }, [stockEntries, cropFilter, selectedYears, selectedMonths, selectedDays, allDays, allYearsSelected, allMonthsSelected]);

  const seedSummary = useMemo(() => {
    if (!seedEntries || !Array.isArray(seedEntries)) {
      return { totalBags: 0, remainingBags: 0, totalCost: 0 };
    }
    let totalBags = 0;
    let remainingBags = 0;
    let totalCost = 0;

    seedEntries.forEach(entry => {
      if (cropFilter === "onion" || cropFilter === "garlic") return;
      const dateStr = entry.purchaseDate || (entry as any).purchase_date;
      if (!dateStr || !matchesFilter(dateStr)) {
        return;
      }
      const lots = entry.seedLots || (entry as any).seed_lots || [];
      lots.forEach((lot: any) => {
        const origBags = lot.originalBags ?? lot.original_bags ?? 0;
        const remBags = lot.remainingBags ?? lot.remaining_bags ?? 0;
        totalBags += origBags;
        remainingBags += remBags;
        const ppb = parseFloat(lot.pricePerBag || lot.price_per_bag || "0");
        const coldPerBag = parseFloat(lot.coldStoreChargesPerBag || lot.cold_store_charges_per_bag || "0");
        const hammali = parseFloat(lot.hammaliCharges || lot.hammali_charges || "0");
        const grading = parseFloat(lot.gradingCharges || lot.grading_charges || "0");
        const transport = parseFloat(lot.transportCharges || lot.transport_charges || "0");
        const bags = origBags || 1;
        const avgCostPerBag = ppb + coldPerBag + (hammali + grading + transport) / bags;
        totalCost += origBags * avgCostPerBag;
      });
    });

    return { totalBags, remainingBags, totalCost };
  }, [seedEntries, cropFilter, selectedYears, selectedMonths, selectedDays, allDays, allYearsSelected, allMonthsSelected]);

  const farmerSummary = useMemo(() => {
    if (!timeseries?.summary) return { harvestPayable: 0, harvestDue: 0, seedPayable: 0, seedDue: 0 };
    return {
      harvestPayable: timeseries.summary.farmerHarvestPayable,
      harvestDue: timeseries.summary.farmerHarvestDue,
      seedPayable: timeseries.summary.farmerSeedPayable,
      seedDue: timeseries.summary.farmerSeedDue,
    };
  }, [timeseries]);

  const coldStoreSummary = useMemo(() => {
    if (!timeseries?.summary) return { totalCharges: 0, totalDue: 0 };
    return {
      totalCharges: timeseries.summary.coldStoreTotalCharges,
      totalDue: timeseries.summary.coldStoreDue,
    };
  }, [timeseries]);

  const buyerSummary = useMemo(() => {
    if (!timeseries?.summary) return { totalRevenue: 0, totalDue: 0 };
    return {
      totalRevenue: timeseries.summary.buyerTotalRevenue,
      totalDue: timeseries.summary.buyerTotalDue,
    };
  }, [timeseries]);

  const farmerPyReceivable = useMemo(() => {
    if (!timeseries?.summary) return { total: 0, due: 0 };
    return {
      total: timeseries.summary.farmerPyReceivableTotal,
      due: timeseries.summary.farmerPyReceivableDue,
    };
  }, [timeseries]);

  const buyerPyReceivable = useMemo(() => {
    if (!timeseries?.summary) return { total: 0, due: 0 };
    return {
      total: timeseries.summary.buyerPyReceivableTotal,
      due: timeseries.summary.buyerPyReceivableDue,
    };
  }, [timeseries]);

  const farmerDueByCrop = useMemo(() => {
    if (!timeseries?.farmerDueByCrop) return [];
    return timeseries.farmerDueByCrop.map(item => ({
      name: item.name === "potato" ? t("Potato", "आलू") : item.name === "onion" ? t("Onion", "प्याज") : t("Garlic", "लहसुन"),
      value: item.value,
    }));
  }, [timeseries, t]);

  const buyerDueByName = useMemo(() => {
    if (!timeseries?.buyerDueByName) return [];
    return timeseries.buyerDueByName;
  }, [timeseries]);

  const coldStoreBagsSplit = useMemo(() => {
    const totalMap = new Map<string, number>();
    const remainingMap = new Map<string, number>();
    if (!stockEntries) return { total: [], remaining: [] };
    stockEntries.forEach(entry => {
      if (!matchesFilter(entry.purchaseDate, entry.crop || "potato")) return;
      (entry.lots || []).forEach(lot => {
        if (cropFilter !== "all" && (lot.crop || "potato") !== cropFilter) return;
        if (lot.place !== "cold_store" || !lot.coldStoreName) return;
        const name = lot.coldStoreName.trim();
        const totalBags = (lot.bagBreakdowns || []).reduce((s: number, b: any) => s + (b.numberOfBags || 0), 0);
        const remBags = (lot.bagBreakdowns || []).reduce((s: number, b: any) => s + (b.remainingBags || 0), 0);
        totalMap.set(name, (totalMap.get(name) || 0) + totalBags);
        remainingMap.set(name, (remainingMap.get(name) || 0) + remBags);
      });
    });
    const total = Array.from(totalMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
    const remaining = Array.from(remainingMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
    return { total, remaining };
  }, [stockEntries, cropFilter, selectedYears, selectedMonths, selectedDays, allDays, allYearsSelected, allMonthsSelected]);

  const isLoading = stockLoading || seedLoading || timeseriesLoading;

  const yearLabel = allYearsSelected ? t("All Years", "सभी वर्ष") : selectedYears.length === 1 ? selectedYears[0].toString() : `${selectedYears.length} ${t("Years", "वर्ष")}`;
  const monthLabel = allMonthsSelected ? t("All", "सभी") : selectedMonths.length === 1 ? MONTHS[selectedMonths[0] - 1] : `${selectedMonths.length} ${t("Mon", "माह")}`;
  const dayLabel = allDays ? t("All Days", "सभी दिन") : selectedDays.length === 0 ? t("None", "कोई नहीं") : selectedDays.length === 1 ? selectedDays[0].toString() : `${selectedDays.length} ${t("Days", "दिन")}`;
  const cropLabel = cropFilter === "all" ? t("All Crops", "सभी फसल") : cropFilter === "potato" ? t("Potato", "आलू") : cropFilter === "onion" ? t("Onion", "प्याज") : t("Garlic", "लहसुन");

  const pieChartConfig: ChartConfig = {
    potato: { label: t("Potato", "आलू"), color: "#16a34a" },
    onion: { label: t("Onion", "प्याज"), color: "#f97316" },
    garlic: { label: t("Garlic", "लहसुन"), color: "#8b5cf6" },
  };

  const coldStoreTotalPieConfig: ChartConfig = {};
  coldStoreBagsSplit.total.forEach((c, i) => {
    coldStoreTotalPieConfig[c.name] = { label: c.name, color: PIE_COLORS[i % PIE_COLORS.length] };
  });
  const coldStoreRemPieConfig: ChartConfig = {};
  coldStoreBagsSplit.remaining.forEach((c, i) => {
    coldStoreRemPieConfig[c.name] = { label: c.name, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  const buyerPieConfig: ChartConfig = {};
  buyerDueByName.forEach((b, i) => {
    buyerPieConfig[b.name] = { label: b.name, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  const lineChartConfig: ChartConfig = {
    amount: { label: t("Amount", "राशि"), color: "#16a34a" },
    volume: { label: t("Volume", "मात्रा"), color: "#16a34a" },
    pnl: { label: t("P&L", "लाभ/हानि"), color: "#f97316" },
    buyerDue: { label: t("Buyer Due", "खरीदार बकाया"), color: "#f97316" },
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="dashboard-tab">
      <div className="flex items-center gap-2 flex-wrap" data-testid="dashboard-merchant-name">
        <h1 className="text-xl font-bold">{user?.merchantName || t("Dashboard", "डैशबोर्ड")}</h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="filter-crop">
              {cropLabel}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="start">
            <div className="flex flex-col gap-1">
              {[
                { value: "all", label: t("All Crops", "सभी फसल") },
                { value: "potato", label: t("Potato", "आलू") },
                { value: "onion", label: t("Onion", "प्याज") },
                { value: "garlic", label: t("Garlic", "लहसुन") },
              ].map(opt => (
                <Button
                  key={opt.value}
                  variant={cropFilter === opt.value ? "default" : "ghost"}
                  size="sm"
                  className="justify-start"
                  onClick={() => setCropFilter(opt.value)}
                  data-testid={`filter-crop-${opt.value}`}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="filter-year">
              {yearLabel}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2" align="start">
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer">
                <Checkbox
                  checked={allYearsSelected}
                  onCheckedChange={toggleAllYears}
                  data-testid="filter-year-all"
                />
                {t("All Years", "सभी वर्ष")}
              </label>
              {availableYears.map(y => (
                <label key={y} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedYears.includes(y)}
                    onCheckedChange={() => toggleYear(y)}
                    data-testid={`filter-year-${y}`}
                  />
                  {y}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="filter-month">
              {monthLabel}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <label className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer mb-1">
              <Checkbox
                checked={allMonthsSelected}
                onCheckedChange={toggleAllMonths}
                data-testid="filter-month-all"
              />
              {t("All", "सभी")}
            </label>
            <div className="grid grid-cols-3 gap-1">
              {MONTHS.map((m, i) => (
                <Button
                  key={m}
                  variant="ghost"
                  size="sm"
                  className={`text-xs ${selectedMonths.includes(i + 1) ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
                  onClick={() => toggleMonth(i + 1)}
                  data-testid={`filter-month-${i + 1}`}
                >
                  {t(m, MONTHS_HI[i])}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="filter-day">
              {dayLabel}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <label className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer mb-1">
              <Checkbox
                checked={allDays}
                onCheckedChange={toggleAllDaysCheck}
                data-testid="filter-day-all"
              />
              {t("All Days", "सभी दिन")}
            </label>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: maxDaysInSelectedMonths }, (_, i) => i + 1).map(d => (
                <Button
                  key={d}
                  variant="ghost"
                  size="sm"
                  className={`text-xs p-0 h-7 w-7 ${!allDays && selectedDays.includes(d) ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
                  onClick={() => toggleDay(d)}
                  data-testid={`filter-day-${d}`}
                >
                  {d}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <Card className="border-green-300 dark:border-green-700" data-testid="card-harvest">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground font-medium">{t("Harvest", "फसल")}</div>
            <div className="text-sm font-bold mt-1" data-testid="text-harvest-bags">
              {harvestSummary.totalBags} / {harvestSummary.remainingBags} {t("bags", "बैग")}
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Total", "कुल")}: </span>
              <span className="font-medium" data-testid="text-harvest-amount">{formatINR(harvestSummary.totalAmount)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="card-seed">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground font-medium">{t("Seed", "बीज")}</div>
            <div className="text-sm font-bold mt-1" data-testid="text-seed-bags">
              {seedSummary.totalBags} / {seedSummary.remainingBags} {t("bags", "बैग")}
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Total", "कुल")}: </span>
              <span className="font-medium" data-testid="text-seed-amount">{formatINR(seedSummary.totalCost)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="card-farmer-harvest">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground font-medium">{t("Farmer - Harvest", "किसान - फसल")}</div>
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">{t("Payable", "देय")}: </span>
              <span className="font-medium" data-testid="text-farmer-harvest-payable">{formatINR(farmerSummary.harvestPayable)}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Net Due", "शुद्ध बकाया")}: </span>
              <span className="font-bold text-green-600 dark:text-green-400" data-testid="text-farmer-harvest-due">{formatINR(farmerSummary.harvestDue)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="card-farmer-seed">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground font-medium">{t("Farmer - Seed", "किसान - बीज")}</div>
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">{t("Receivable", "प्राप्य")}: </span>
              <span className="font-medium" data-testid="text-farmer-seed-payable">{formatINR(farmerSummary.seedPayable)}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Net Due", "शुद्ध बकाया")}: </span>
              <span className="font-bold text-red-600 dark:text-red-400" data-testid="text-farmer-seed-due">{formatINR(farmerSummary.seedDue)}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("PY Due", "PY बकाया")}: </span>
              <span className="font-bold text-purple-600 dark:text-purple-400" data-testid="text-farmer-py-due">{formatINR(farmerPyReceivable.due)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="card-cold-store">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground font-medium">{t("Cold Store", "कोल्ड स्टोर")}</div>
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">{t("Total", "कुल")}: </span>
              <span className="font-medium" data-testid="text-cold-total">{formatINR(coldStoreSummary.totalCharges)}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Due", "बकाया")}: </span>
              <span className="font-bold text-blue-600 dark:text-blue-400" data-testid="text-cold-due">{formatINR(coldStoreSummary.totalDue)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="card-buyer">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground font-medium">{t("Buyer", "खरीदार")}</div>
            <div className="text-xs mt-1">
              <span className="text-muted-foreground">{t("Total", "कुल")}: </span>
              <span className="font-medium" data-testid="text-buyer-total">{formatINR(buyerSummary.totalRevenue)}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("Due", "बकाया")}: </span>
              <span className="font-bold text-orange-600 dark:text-orange-400" data-testid="text-buyer-due">{formatINR(Math.max(0, buyerSummary.totalDue - buyerPyReceivable.due))}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("PY Due", "PY बकाया")}: </span>
              <span className="font-bold text-purple-600 dark:text-purple-400" data-testid="text-buyer-py-due">{formatINR(buyerPyReceivable.due)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-green-300 dark:border-green-700" data-testid="chart-cs-total-bags">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm">{t("Total Bags by Cold Store", "कोल्ड स्टोर के अनुसार कुल बैग")}</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {coldStoreBagsSplit.total.length > 0 ? (
              <ChartContainer config={coldStoreTotalPieConfig} className="h-[200px] w-full">
                <PieChart>
                  <Pie
                    data={coldStoreBagsSplit.total}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    labelLine={renderShortLabelLine(PIE_COLORS)}
                    label={renderOuterLabel((v) => `${v}`, PIE_COLORS)}
                  >
                    {coldStoreBagsSplit.total.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                {t("No data", "कोई डेटा नहीं")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="chart-cs-remaining-bags">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm">{t("Remaining Bags by Cold Store", "कोल्ड स्टोर के अनुसार शेष बैग")}</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {coldStoreBagsSplit.remaining.length > 0 ? (
              <ChartContainer config={coldStoreRemPieConfig} className="h-[200px] w-full">
                <PieChart>
                  <Pie
                    data={coldStoreBagsSplit.remaining}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    labelLine={renderShortLabelLine(PIE_COLORS)}
                    label={renderOuterLabel((v) => `${v}`, PIE_COLORS)}
                  >
                    {coldStoreBagsSplit.remaining.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                {t("No data", "कोई डेटा नहीं")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-green-300 dark:border-green-700" data-testid="chart-farmer-due-crop">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm">{t("Farmer Due by Crop", "फसल के अनुसार किसान बकाया")}</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {farmerDueByCrop.length > 0 ? (
              <ChartContainer config={pieChartConfig} className="h-[200px] w-full">
                <PieChart>
                  <Pie
                    data={farmerDueByCrop}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    labelLine={renderShortLabelLine(PIE_COLORS)}
                    label={renderOuterLabel((v) => formatINR(v), PIE_COLORS)}
                  >
                    {farmerDueByCrop.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                {t("No data", "कोई डेटा नहीं")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="chart-buyer-due-name">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm">{t("Buyer Due by Name", "नाम के अनुसार खरीदार बकाया")}</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {buyerDueByName.length > 0 ? (
              <ChartContainer config={buyerPieConfig} className="h-[200px] w-full">
                <PieChart>
                  <Pie
                    data={buyerDueByName}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    labelLine={renderShortLabelLine(PIE_COLORS)}
                    label={renderOuterLabel((v) => formatINR(v), PIE_COLORS)}
                  >
                    {buyerDueByName.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                {t("No data", "कोई डेटा नहीं")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-green-300 dark:border-green-700" data-testid="chart-farmer-due-line">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm">{t("Farmer Due", "किसान बकाया")}</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {timeseriesLoading ? (
              <div className="h-[200px] flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : timeseries?.farmerDueTimeSeries && timeseries.farmerDueTimeSeries.length > 0 ? (
              <ChartContainer config={lineChartConfig} className="h-[200px] w-full">
                <LineChart data={timeseries.farmerDueTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="amount" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                {t("No data", "कोई डेटा नहीं")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="chart-buyer-due-line">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm">{t("Buyer Due", "खरीदार बकाया")}</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {timeseriesLoading ? (
              <div className="h-[200px] flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : timeseries?.buyerDueTimeSeries && timeseries.buyerDueTimeSeries.length > 0 ? (
              <ChartContainer config={lineChartConfig} className="h-[200px] w-full">
                <LineChart data={timeseries.buyerDueTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="amount" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                {t("No data", "कोई डेटा नहीं")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-green-300 dark:border-green-700" data-testid="chart-daily-volume">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm">{t("Daily Volume (Kg)", "दैनिक मात्रा (किलो)")}</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {timeseriesLoading ? (
              <div className="h-[200px] flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : timeseries?.dailyVolumeTimeSeries && timeseries.dailyVolumeTimeSeries.length > 0 ? (
              <ChartContainer config={lineChartConfig} className="h-[200px] w-full">
                <LineChart data={timeseries.dailyVolumeTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="volume" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                {t("No data", "कोई डेटा नहीं")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-green-300 dark:border-green-700" data-testid="chart-cumulative-pnl">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm">{t("Cumulative P&L", "संचयी लाभ/हानि")}</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {timeseriesLoading ? (
              <div className="h-[200px] flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : timeseries?.cumulativePnlTimeSeries && timeseries.cumulativePnlTimeSeries.length > 0 ? (
              <ChartContainer config={lineChartConfig} className="h-[200px] w-full">
                <LineChart data={timeseries.cumulativePnlTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="pnl" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                {t("No data", "कोई डेटा नहीं")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}