import { useState, useEffect, useCallback, useRef, type ComponentType, type DragEvent } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import vyaparVriddhiLogo from "@assets/Screenshot_2026-01-17_at_10.27.58_AM_1768625967467.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { CropToggle } from "@/components/crop-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockEntryForm } from "@/components/stock-entry/stock-entry-form";
import { StockRegisterCard } from "@/components/stock-register/stock-register-card";
import { SeedSection } from "@/components/seed/seed-section";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { 
  PackagePlus, 
  ClipboardList, 
  ChevronDown, 
  LogOut,
  Settings,
  KeyRound,
  Loader2,
  Truck,
  Wallet,
  Menu,
  Download,
  Leaf,
  Users,
  Wheat,
  Phone,
  LayoutDashboard,
  PlayCircle,
  BookOpen,
  Building2,
  GripVertical,
  RotateCcw
} from "lucide-react";

interface TabConfig {
  value: string;
  icon: ComponentType<{ className?: string }>;
  labelEn: string;
  labelHi: string;
  badge?: string;
}

const DEFAULT_TAB_ORDER: TabConfig[] = [
  { value: "dashboard", icon: LayoutDashboard, labelEn: "Dashboard", labelHi: "डैशबोर्ड" },
  { value: "stock-entry", icon: PackagePlus, labelEn: "Stock Entry", labelHi: "स्टॉक एंट्री" },
  { value: "stock-register", icon: ClipboardList, labelEn: "Stock Register", labelHi: "स्टॉक रजिस्टर" },
  { value: "transactions", icon: Truck, labelEn: "Transactions", labelHi: "लेनदेन" },
  { value: "cash-management", icon: Wallet, labelEn: "Cash", labelHi: "नकद" },
  { value: "seed", icon: Leaf, labelEn: "Seed", labelHi: "बीज" },
  { value: "farmer-ledger", icon: Wheat, labelEn: "Farmer", labelHi: "किसान" },
  { value: "buyers", icon: Users, labelEn: "Buyers", labelHi: "खरीदार" },
  { value: "aadhat", icon: Users, labelEn: "Aadhat", labelHi: "आढ़त" },
  { value: "cold-store", icon: Building2, labelEn: "Cold Store", labelHi: "कोल्ड स्टोर" },
  { value: "books", icon: BookOpen, labelEn: "Books", labelHi: "बुक्स", badge: "Beta" },
  { value: "demo-videos", icon: PlayCircle, labelEn: "Demo Videos", labelHi: "डेमो वीडियो" },
];

function getTabOrderKey(userId: number | string) {
  return `vyapar_tab_order:${userId}`;
}

function getSavedTabOrder(userId: number | string): TabConfig[] {
  try {
    const saved = localStorage.getItem(getTabOrderKey(userId));
    if (!saved) return DEFAULT_TAB_ORDER;
    const savedValues: string[] = JSON.parse(saved);
    if (!Array.isArray(savedValues)) return DEFAULT_TAB_ORDER;
    const tabMap = new Map(DEFAULT_TAB_ORDER.map(t => [t.value, t]));
    const seen = new Set<string>();
    const ordered: TabConfig[] = [];
    for (const v of savedValues) {
      const tab = tabMap.get(v);
      if (tab && !seen.has(v)) {
        ordered.push(tab);
        seen.add(v);
      }
    }
    for (const tab of DEFAULT_TAB_ORDER) {
      if (!seen.has(tab.value)) {
        ordered.push(tab);
      }
    }
    return ordered;
  } catch {
    return DEFAULT_TAB_ORDER;
  }
}

function saveTabOrder(userId: number | string, tabs: TabConfig[]) {
  localStorage.setItem(getTabOrderKey(userId), JSON.stringify(tabs.map(t => t.value)));
}
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { TransactionsTab } from "@/components/transactions/transactions-tab";
import { CashManagementTab } from "@/components/cash-management/cash-management-tab";
import { FarmerLedgerTab } from "@/components/farmer-ledger/farmer-ledger-tab";
import BuyersTab from "@/components/buyers/buyers-tab";
import AadhatLedgerTab from "@/components/aadhat/aadhat-ledger-tab";
import ColdStoreLedgerTab from "@/components/cold-store/cold-store-ledger-tab";
import { DashboardTab } from "@/components/dashboard/dashboard-tab";
import { DemoVideosTab } from "@/components/demo-videos/demo-videos-tab";
import { BooksTab } from "@/components/books/books-tab";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { user, logoutMutation, changePasswordMutation } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTabState] = useState(() => localStorage.getItem("vyapar_activeTab") || "dashboard");
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    localStorage.setItem("vyapar_activeTab", tab);
  };
  const [seedDownloadDialogOpen, setSeedDownloadDialogOpen] = useState(false);
  const [rawDownloadDialogOpen, setRawDownloadDialogOpen] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [isFirstLoginDialog, setIsFirstLoginDialog] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedCrop, setSelectedCropState] = useState<"potato" | "onion" | "garlic">(() => {
    const saved = localStorage.getItem("vyapar_selected_crop");
    if (saved === "onion" || saved === "garlic") return saved;
    return "potato";
  });
  const setSelectedCrop = (crop: "potato" | "onion" | "garlic") => {
    setSelectedCropState(crop);
    localStorage.setItem("vyapar_selected_crop", crop);
  };
  const [selectedPlace, setSelectedPlaceState] = useState<"farm_gate" | "cold_store" | "mandi">(() => {
    const saved = localStorage.getItem("vyapar_selected_place");
    if (saved === "farm_gate" || saved === "cold_store" || saved === "mandi") return saved;
    return "cold_store";
  });
  const setSelectedPlace = (place: "farm_gate" | "cold_store" | "mandi") => {
    setSelectedPlaceState(place);
    localStorage.setItem("vyapar_selected_place", place);
    if (place === "cold_store") {
      setSelectedCrop("potato");
    }
  };
  const [passwordForm, setPasswordForm] = useState({
    mobileNumber: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const userId = user?.id ?? "anonymous";
  const [tabOrder, setTabOrder] = useState<TabConfig[]>(() => getSavedTabOrder(userId));
  const isCustomOrder = tabOrder.some((tab, i) => tab.value !== DEFAULT_TAB_ORDER[i].value);
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    setTabOrder(getSavedTabOrder(userId));
  }, [userId]);

  const handleDragStart = useCallback((index: number) => {
    dragItemRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>, index: number) => {
    e.preventDefault();
    dragOverItemRef.current = index;
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLElement>, dropIndex: number) => {
    e.preventDefault();
    const from = dragItemRef.current;
    if (from === null || from === dropIndex) return;
    setTabOrder(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(dropIndex, 0, moved);
      saveTabOrder(userId, updated);
      return updated;
    });
  }, [userId]);

  const handleDragEnd = useCallback(() => {
    dragItemRef.current = null;
    dragOverItemRef.current = null;
    setDragOverIndex(null);
  }, []);

  const resetTabOrder = useCallback(() => {
    setTabOrder(DEFAULT_TAB_ORDER);
    localStorage.removeItem(getTabOrderKey(userId));
  }, [userId]);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handlePasswordChange = () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return;
    }
    changePasswordMutation.mutate({
      mobileNumber: passwordForm.mobileNumber,
      currentPassword: isFirstLoginDialog ? undefined : passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
      isFirstLogin: isFirstLoginDialog,
    }, {
      onSuccess: () => {
        setShowPasswordDialog(false);
        setIsFirstLoginDialog(false);
        setPasswordForm({ mobileNumber: "", currentPassword: "", newPassword: "", confirmPassword: "" });
      },
    });
  };

  useEffect(() => {
    if (user?.isSystemAdmin && !user?.merchantId) {
      setLocation("/admin");
    }
  }, [user, setLocation]);

  useEffect(() => {
    if (user?.mustChangePassword && !showPasswordDialog && !changePasswordMutation.isSuccess) {
      setShowPasswordDialog(true);
      setIsFirstLoginDialog(true);
    }
  }, [user?.mustChangePassword, showPasswordDialog, changePasswordMutation.isSuccess]);

  if (user?.isSystemAdmin && !user?.merchantId) {
    return <></>;
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center px-2 sm:px-4 md:px-6 gap-2 sm:gap-4 md:gap-6">
            {/* Brand */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 md:ml-4 lg:ml-12 xl:ml-16">
              <div className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-md border-2 border-primary bg-white overflow-hidden">
                <img src={vyaparVriddhiLogo} alt="Vyapar Vriddhi" className="h-full w-full object-contain bg-white" />
              </div>
              <div className="flex flex-col h-9 sm:h-12">
                <span className="font-bold text-base sm:text-xl leading-tight text-primary">Vyapar Vriddhi</span>
                <span className="text-[9px] sm:text-[10px] leading-none mt-1 sm:mt-2 whitespace-nowrap">
                  by <span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span>
                </span>
              </div>
            </div>

            {/* Navigation Tabs - Desktop (hidden on mobile) */}
            <nav className="hidden md:flex flex-1 overflow-x-auto scrollbar-hide items-center">
              <TabsList className="inline-flex h-9 items-center gap-1 bg-transparent p-0">
                {tabOrder.map((tab, index) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-extrabold rounded-md transition-colors cursor-grab active:cursor-grabbing data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 ${dragOverIndex === index ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                      data-testid={`tab-${tab.value}`}
                    >
                      <Icon className="h-4 w-4" />
                      {t(tab.labelEn, tab.labelHi)}
                      {tab.badge && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold leading-none rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">{tab.badge}</span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {isCustomOrder && (
                <button
                  onClick={resetTabOrder}
                  className="ml-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                  title={t("Reset tab order", "टैब क्रम रीसेट करें")}
                  data-testid="reset-tab-order"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </nav>

            {/* Spacer for mobile */}
            <div className="flex-1 md:hidden" />

            {/* Right side controls */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <LanguageToggle />
              <ThemeToggle />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-user-menu">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {user?.username ? getInitials(user.username) : "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.name || user?.username}</p>
                    {user?.merchantName && (
                      <p className="text-xs text-muted-foreground">{user.merchantName}</p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  {user?.isSystemAdmin && (
                    <DropdownMenuItem onClick={() => setLocation("/admin")} data-testid="button-admin">
                      <Settings className="h-4 w-4 mr-2" />
                      {t("Admin Panel", "एडमिन पैनल")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setShowPasswordDialog(true)} data-testid="button-change-password">
                    <KeyRound className="h-4 w-4 mr-2" />
                    {t("Change Password", "पासवर्ड बदलें")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive" data-testid="button-logout">
                    <LogOut className="h-4 w-4 mr-2" />
                    {t("Logout", "लॉगआउट")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile Menu - at the very end */}
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" data-testid="button-mobile-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64 p-0">
                  <div className="flex flex-col h-full">
                    <div className="p-4 border-b">
                      <div className="flex items-center gap-2">
                        <div className="flex h-12 w-12 items-center justify-center rounded-md border-2 border-primary bg-white overflow-hidden">
                          <img src={vyaparVriddhiLogo} alt="Vyapar Vriddhi" className="h-full w-full object-contain bg-white" />
                        </div>
                        <div className="flex flex-col h-12 justify-center">
                          <span className="font-bold text-xl leading-tight text-primary">Vyapar Vriddhi</span>
                          <span className="text-[10px] leading-none mt-1 whitespace-nowrap">
                            by <span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <nav className="flex-1 p-2">
                      <TabsList className="flex flex-col w-full h-auto gap-1 bg-transparent p-0">
                        {tabOrder.map((tab, index) => {
                          const Icon = tab.icon;
                          return (
                            <div
                              key={tab.value}
                              draggable
                              onDragStart={() => handleDragStart(index)}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDrop={(e) => handleDrop(e, index)}
                              onDragEnd={handleDragEnd}
                              className={`flex items-center w-full ${dragOverIndex === index ? 'ring-2 ring-primary ring-offset-1 rounded-md' : ''}`}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 cursor-grab active:cursor-grabbing mr-1" />
                              <TabsTrigger
                                value={tab.value}
                                className="flex-1 justify-start gap-2 px-3 py-2.5 text-sm font-extrabold rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50"
                                data-testid={`tab-${tab.value}-mobile`}
                                onClick={() => setIsMobileMenuOpen(false)}
                              >
                                <Icon className="h-4 w-4" />
                                {t(tab.labelEn, tab.labelHi)}
                                {tab.badge && (
                                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold leading-none rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">{tab.badge}</span>
                                )}
                              </TabsTrigger>
                            </div>
                          );
                        })}
                      </TabsList>
                      {isCustomOrder && (
                        <button
                          onClick={resetTabOrder}
                          className="flex items-center gap-2 w-full mt-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                          data-testid="reset-tab-order-mobile"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {t("Reset tab order", "टैब क्रम रीसेट करें")}
                        </button>
                      )}
                    </nav>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <main className="container max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
          <div className={activeTab === "dashboard" ? "block" : "hidden"}>
            <DashboardTab />
          </div>

          <div className={activeTab === "stock-entry" ? "block" : "hidden"}>
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold">
                    {t("Stock Entry", "स्टॉक एंट्री")}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("Record new purchases from farmers", "किसानों से नई खरीद दर्ज करें")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={selectedPlace} onValueChange={(v) => setSelectedPlace(v as "farm_gate" | "cold_store" | "mandi")}>
                    <SelectTrigger
                      className="w-fit shrink-0 bg-orange-500 text-white border-orange-500 focus:ring-orange-400 font-bold [&>svg]:text-white [&>span]:!line-clamp-none"
                      data-testid="select-place-header"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="farm_gate">{t("Farm Gate", "खेत गेट")}</SelectItem>
                      <SelectItem value="cold_store">{t("Cold Store", "कोल्ड स्टोर")}</SelectItem>
                      <SelectItem value="mandi">{t("Mandi", "मंडी")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <CropToggle value={selectedCrop} onChange={setSelectedCrop} allowedCrops={selectedPlace === "cold_store" ? ["potato"] : undefined} />
                </div>
              </div>
              <StockEntryForm 
                onSuccess={() => setActiveTab("stock-register")}
                selectedCrop={selectedCrop}
                selectedPlace={selectedPlace}
              />
            </div>
          </div>

          <div className={activeTab === "stock-register" ? "block" : "hidden"}>
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold">
                    {t("Stock Register", "स्टॉक रजिस्टर")}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedCrop === "potato"
                      ? t("View and manage your potato stock", "अपने आलू स्टॉक को देखें और प्रबंधित करें")
                      : selectedCrop === "onion"
                      ? t("View and manage your onion stock", "अपने प्याज स्टॉक को देखें और प्रबंधित करें")
                      : t("View and manage your garlic stock", "अपने लहसुन स्टॉक को देखें और प्रबंधित करें")
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CropToggle value={selectedCrop} onChange={setSelectedCrop} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRawDownloadDialogOpen(true)}
                    title={t("Download CSV", "CSV डाउनलोड")}
                    data-testid="button-raw-download-header"
                  >
                    <Download className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <StockRegisterCard 
                downloadDialogOpen={rawDownloadDialogOpen}
                onDownloadDialogClose={() => setRawDownloadDialogOpen(false)}
                selectedCrop={selectedCrop}
              />
            </div>
          </div>

          <div className={activeTab === "transactions" ? "block" : "hidden"}>
            <TransactionsTab selectedCrop={selectedCrop} onCropChange={setSelectedCrop} />
          </div>

          <div className={activeTab === "cash-management" ? "block" : "hidden"}>
            <CashManagementTab />
          </div>

          <div className={activeTab === "seed" ? "block" : "hidden"}>
            <SeedSection 
              seedDownloadDialogOpen={seedDownloadDialogOpen}
              setSeedDownloadDialogOpen={setSeedDownloadDialogOpen}
            />
          </div>

          <div className={activeTab === "farmer-ledger" ? "block" : "hidden"}>
            <FarmerLedgerTab />
          </div>

          <div className={activeTab === "buyers" ? "block" : "hidden"}>
            <BuyersTab />
          </div>

          <div className={activeTab === "aadhat" ? "block" : "hidden"}>
            <AadhatLedgerTab />
          </div>

          <div className={activeTab === "cold-store" ? "block" : "hidden"}>
            <ColdStoreLedgerTab />
          </div>

          <div className={activeTab === "books" ? "block" : "hidden"}>
            <BooksTab />
          </div>

          <div className={activeTab === "demo-videos" ? "block" : "hidden"}>
            <DemoVideosTab />
          </div>

          <footer className="mt-8 pt-4 border-t text-sm text-muted-foreground">
            {/* Desktop/Tablet: Single row layout */}
            <div className="hidden md:flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {t("Need Help? Reach out to", "मदद चाहिए? संपर्क करें")} <span className="whitespace-nowrap"><span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span></span>: +918882589392
              </div>
              <div className="flex items-center gap-4">
                <span>{t("Powered by", "द्वारा संचालित")} <span className="whitespace-nowrap"><span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span></span></span>
                <span>{t("All Rights Reserved", "सर्वाधिकार सुरक्षित")}</span>
              </div>
            </div>
            {/* Mobile: Stacked layout */}
            <div className="flex flex-col items-center text-center gap-2 md:hidden">
              <div>
                {t("Need help? Please reach out to", "मदद चाहिए? कृपया संपर्क करें")} <span className="whitespace-nowrap"><span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span></span> - +918882589392
              </div>
              <div>
                {t("Powered by", "द्वारा संचालित")} <span className="whitespace-nowrap"><span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span></span>
              </div>
              <div>
                {t("All Rights Reserved", "सर्वाधिकार सुरक्षित")}
              </div>
            </div>
          </footer>
        </main>
      </Tabs>

      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        if (!open && !isFirstLoginDialog) {
          setShowPasswordDialog(false);
        }
      }}>
        <DialogContent 
          onEscapeKeyDown={isFirstLoginDialog ? (e) => e.preventDefault() : undefined}
          onPointerDownOutside={isFirstLoginDialog ? (e) => e.preventDefault() : undefined}
          onInteractOutside={isFirstLoginDialog ? (e) => e.preventDefault() : undefined}
          className={isFirstLoginDialog ? "[&>button]:hidden" : ""}
        >
          <DialogHeader>
            <DialogTitle>{isFirstLoginDialog ? t("Set New Password", "नया पासवर्ड सेट करें") : t("Change Password", "पासवर्ड बदलें")}</DialogTitle>
          </DialogHeader>
          {isFirstLoginDialog && (
            <p className="text-sm text-muted-foreground">
              {t("Please set a new password to continue. This is required on first login.", "जारी रखने के लिए कृपया नया पासवर्ड सेट करें। पहले लॉगिन पर यह आवश्यक है।")}
            </p>
          )}
          <div className="space-y-4 py-4" data-no-capitalize>
            {/* Mobile number is always required for validation */}
            <div className="space-y-2">
              <Label htmlFor="mobile-number">{t("Registered Mobile Number", "पंजीकृत मोबाइल नंबर")}</Label>
              <Input
                id="mobile-number"
                type="text"
                value={passwordForm.mobileNumber}
                onChange={(e) => setPasswordForm({ ...passwordForm, mobileNumber: e.target.value })}
                placeholder={t("Enter registered mobile number", "पंजीकृत मोबाइल नंबर दर्ज करें")}
                data-testid="input-mobile-number"
              />
            </div>
            {!isFirstLoginDialog && (
              <div className="space-y-2">
                <Label htmlFor="current-password">{t("Current Password", "वर्तमान पासवर्ड")}</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder={t("Enter current password", "वर्तमान पासवर्ड दर्ज करें")}
                  data-testid="input-current-password"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("New Password", "नया पासवर्ड")}</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder={t("Enter new password (min 6 characters)", "नया पासवर्ड दर्ज करें (न्यूनतम 6 अक्षर)")}
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("Confirm New Password", "नए पासवर्ड की पुष्टि करें")}</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder={t("Confirm new password", "नए पासवर्ड की पुष्टि करें")}
                data-testid="input-confirm-password"
              />
              {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                <p className="text-sm text-destructive">{t("Passwords do not match", "पासवर्ड मेल नहीं खाते")}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            {!isFirstLoginDialog && (
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
                {t("Cancel", "रद्द करें")}
              </Button>
            )}
            <Button
              onClick={handlePasswordChange}
              disabled={
                !passwordForm.mobileNumber ||
                (!isFirstLoginDialog && !passwordForm.currentPassword) ||
                !passwordForm.newPassword ||
                passwordForm.newPassword.length < 6 ||
                passwordForm.newPassword !== passwordForm.confirmPassword ||
                changePasswordMutation.isPending
              }
              data-testid="button-save-password"
            >
              {changePasswordMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {isFirstLoginDialog ? t("Set Password", "पासवर्ड सेट करें") : t("Change Password", "पासवर्ड बदलें")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
