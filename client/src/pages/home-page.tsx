import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { StockEntryForm } from "@/components/stock-entry/stock-entry-form";
import { StockRegisterCard } from "@/components/stock-register/stock-register-card";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { 
  PackagePlus, 
  ClipboardList, 
  ChevronDown, 
  LogOut,
  Settings,
  KeyRound,
  Loader2
} from "lucide-react";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { user, logoutMutation, changePasswordMutation } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("stock-entry");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [isFirstLoginDialog, setIsFirstLoginDialog] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
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
      currentPassword: isFirstLoginDialog ? undefined : passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
      isFirstLogin: isFirstLoginDialog,
    }, {
      onSuccess: () => {
        setShowPasswordDialog(false);
        setIsFirstLoginDialog(false);
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
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
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <PackagePlus className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg hidden sm:block">Vyapar Vriddhi</span>
            </div>
            {user?.merchantName && (
              <span className="text-sm text-muted-foreground hidden md:block">
                {user.merchantName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2" data-testid="button-user-menu">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {user?.username ? getInitials(user.username) : "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm">{user?.username}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
          </div>
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-4 md:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2 mx-auto">
            <TabsTrigger value="stock-entry" className="flex items-center gap-2" data-testid="tab-stock-entry">
              <PackagePlus className="h-4 w-4" />
              {t("Stock Entry", "स्टॉक एंट्री")}
            </TabsTrigger>
            <TabsTrigger value="stock-register" className="flex items-center gap-2" data-testid="tab-stock-register">
              <ClipboardList className="h-4 w-4" />
              {t("Stock Register", "स्टॉक रजिस्टर")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stock-entry" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">{t("Stock Entry", "स्टॉक एंट्री")}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("Record new potato purchases from farmers", "किसानों से नई आलू खरीद दर्ज करें")}
                </p>
              </div>
            </div>
            <StockEntryForm 
              onSuccess={() => setActiveTab("stock-register")} 
            />
          </TabsContent>

          <TabsContent value="stock-register" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">{t("Stock Register", "स्टॉक रजिस्टर")}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("View and manage all stock entries", "सभी स्टॉक एंट्री देखें और प्रबंधित करें")}
                </p>
              </div>
            </div>
            <StockRegisterCard />
          </TabsContent>
        </Tabs>

        <footer className="mt-8 pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
          <div>
            {t("Need help? Please reach out to", "मदद चाहिए? कृपया संपर्क करें")} <span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span> - 8882589392
          </div>
          <div>
            {t("Powered by", "द्वारा संचालित")} <span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span>
          </div>
        </footer>
      </main>

      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        if (!open && !isFirstLoginDialog) {
          setShowPasswordDialog(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isFirstLoginDialog ? t("Set New Password", "नया पासवर्ड सेट करें") : t("Change Password", "पासवर्ड बदलें")}</DialogTitle>
          </DialogHeader>
          {isFirstLoginDialog && (
            <p className="text-sm text-muted-foreground">
              {t("Please set a new password to continue. This is required on first login.", "जारी रखने के लिए कृपया नया पासवर्ड सेट करें। पहले लॉगिन पर यह आवश्यक है।")}
            </p>
          )}
          <div className="space-y-4 py-4">
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
