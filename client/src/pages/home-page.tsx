import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { StockEntryForm } from "@/components/stock-entry/stock-entry-form";
import { StockRegisterTable } from "@/components/stock-register/stock-register-table";
import { useAuth } from "@/hooks/use-auth";
import { 
  PackagePlus, 
  ClipboardList, 
  ChevronDown, 
  LogOut,
  User
} from "lucide-react";

export default function HomePage() {
  const { user, logoutMutation } = useAuth();
  const [activeTab, setActiveTab] = useState("stock-entry");

  const handleLogout = () => {
    logoutMutation.mutate();
  };

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
                  <p className="text-sm font-medium">{user?.username}</p>
                  {user?.merchantName && (
                    <p className="text-xs text-muted-foreground">{user.merchantName}</p>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive" data-testid="button-logout">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
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
              Stock Entry
            </TabsTrigger>
            <TabsTrigger value="stock-register" className="flex items-center gap-2" data-testid="tab-stock-register">
              <ClipboardList className="h-4 w-4" />
              Stock Register
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stock-entry" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Stock Entry</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Record new potato purchases from farmers
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
                <h1 className="text-2xl font-semibold">Stock Register</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  View and manage all stock entries
                </p>
              </div>
            </div>
            <StockRegisterTable />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
