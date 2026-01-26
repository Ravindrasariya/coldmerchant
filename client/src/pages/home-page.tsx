import { useState, useEffect } from "react";
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
  Users
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { TransactionsTab } from "@/components/transactions/transactions-tab";
import { CashManagementTab } from "@/components/cash-management/cash-management-tab";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { user, logoutMutation, changePasswordMutation } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("stock-entry");
  const [seedDownloadDialogOpen, setSeedDownloadDialogOpen] = useState(false);
  const [rawDownloadDialogOpen, setRawDownloadDialogOpen] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [isFirstLoginDialog, setIsFirstLoginDialog] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedCrop, setSelectedCrop] = useState<"potato" | "onion">("potato");
  const [passwordForm, setPasswordForm] = useState({
    mobileNumber: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

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
                <span className="text-[9px] sm:text-[10px] leading-none mt-1 sm:mt-2">
                  by <span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span>
                </span>
              </div>
            </div>

            {/* Navigation Tabs - Desktop (hidden on mobile) */}
            <nav className="hidden md:flex flex-1 justify-center overflow-x-auto">
              <TabsList className="inline-flex h-9 items-center gap-1 bg-transparent p-0">
                <TabsTrigger 
                  value="stock-entry" 
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                  data-testid="tab-stock-entry"
                >
                  <PackagePlus className="h-4 w-4" />
                  {t("Stock Entry", "स्टॉक एंट्री")}
                </TabsTrigger>
                <TabsTrigger 
                  value="stock-register" 
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                  data-testid="tab-stock-register"
                >
                  <ClipboardList className="h-4 w-4" />
                  {t("Stock Register", "स्टॉक रजिस्टर")}
                </TabsTrigger>
                <TabsTrigger 
                  value="transactions" 
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                  data-testid="tab-transactions"
                >
                  <Truck className="h-4 w-4" />
                  {t("Transactions", "लेनदेन")}
                </TabsTrigger>
                <TabsTrigger 
                  value="cash-management" 
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                  data-testid="tab-cash-management"
                >
                  <Wallet className="h-4 w-4" />
                  {t("Cash", "नकद")}
                </TabsTrigger>
                <TabsTrigger 
                  value="seed" 
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                  data-testid="tab-seed"
                >
                  <Leaf className="h-4 w-4" />
                  {t("Seed", "बीज")}
                </TabsTrigger>
              </TabsList>
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
                  <DropdownMenuItem onClick={() => setLocation("/buyers")} data-testid="button-buyers">
                    <Users className="h-4 w-4 mr-2" />
                    {t("Buyers", "खरीदार")}
                  </DropdownMenuItem>
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
                          <span className="text-[10px] leading-none mt-1">
                            by <span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <nav className="flex-1 p-2">
                      <TabsList className="flex flex-col w-full h-auto gap-1 bg-transparent p-0">
                        <TabsTrigger 
                          value="stock-entry" 
                          className="w-full justify-start gap-2 px-3 py-2.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                          data-testid="tab-stock-entry-mobile"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <PackagePlus className="h-4 w-4" />
                          {t("Stock Entry", "स्टॉक एंट्री")}
                        </TabsTrigger>
                        <TabsTrigger 
                          value="stock-register" 
                          className="w-full justify-start gap-2 px-3 py-2.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                          data-testid="tab-stock-register-mobile"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <ClipboardList className="h-4 w-4" />
                          {t("Stock Register", "स्टॉक रजिस्टर")}
                        </TabsTrigger>
                        <TabsTrigger 
                          value="transactions" 
                          className="w-full justify-start gap-2 px-3 py-2.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                          data-testid="tab-transactions-mobile"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <Truck className="h-4 w-4" />
                          {t("Transactions", "लेनदेन")}
                        </TabsTrigger>
                        <TabsTrigger 
                          value="cash-management" 
                          className="w-full justify-start gap-2 px-3 py-2.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                          data-testid="tab-cash-management-mobile"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <Wallet className="h-4 w-4" />
                          {t("Cash", "नकद")}
                        </TabsTrigger>
                        <TabsTrigger 
                          value="seed" 
                          className="w-full justify-start gap-2 px-3 py-2.5 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50" 
                          data-testid="tab-seed-mobile"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <Leaf className="h-4 w-4" />
                          {t("Seed", "बीज")}
                        </TabsTrigger>
                      </TabsList>
                    </nav>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <main className="container max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
          <div className={activeTab === "stock-entry" ? "block" : "hidden"}>
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold">
                    {t("Stock Entry", "स्टॉक एंट्री")}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedCrop === "potato" 
                      ? t("Record new potato purchases from farmers", "किसानों से नई आलू खरीद दर्ज करें")
                      : t("Record new onion purchases from farmers", "किसानों से नई प्याज खरीद दर्ज करें")
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CropToggle value={selectedCrop} onChange={setSelectedCrop} />
                </div>
              </div>
              <StockEntryForm 
                onSuccess={() => setActiveTab("stock-register")} 
                selectedCrop={selectedCrop}
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
                      : t("View and manage your onion stock", "अपने प्याज स्टॉक को देखें और प्रबंधित करें")
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

          <footer className="mt-8 pt-4 border-t flex flex-col items-center text-center gap-2 text-sm text-muted-foreground">
            <div>
              {t("Need help? Please reach out to", "मदद चाहिए? कृपया संपर्क करें")} <span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span> - 8882589392
            </div>
            <div>
              {t("Powered by", "द्वारा संचालित")} <span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span>
            </div>
            <div>
              {t("All Rights Reserved", "सर्वाधिकार सुरक्षित")}
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
          <div className="space-y-4 py-4">
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
