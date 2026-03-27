import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, Plus, Edit, Trash2, KeyRound, Building2, Users, 
  LogOut, Phone, MapPin, Archive, Power, RotateCcw, AlertTriangle, Search,
  Wrench, Play, CheckCircle2, XCircle, PlayCircle, Upload, ImageIcon, X
} from "lucide-react";
import type { Merchant, User, DemoVideo } from "@shared/schema";

type MerchantWithUsers = Merchant;
type UserWithMerchant = Omit<User, 'password'> & { merchantName?: string };

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("merchants");
  
  const [merchantDialogOpen, setMerchantDialogOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<MerchantWithUsers | null>(null);
  const [merchantForm, setMerchantForm] = useState({ name: "", contactNumber: "", address: "" });
  
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithMerchant | null>(null);
  const [userForm, setUserForm] = useState({ username: "", name: "", mobileNumber: "", merchantId: "", canEdit: true });

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogMerchant, setStatusDialogMerchant] = useState<MerchantWithUsers | null>(null);
  const [statusDialogAction, setStatusDialogAction] = useState<"active" | "inactive" | "archived">("active");
  const [statusPassword, setStatusPassword] = useState("");

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetDialogMerchant, setResetDialogMerchant] = useState<MerchantWithUsers | null>(null);
  const [resetAdminPassword, setResetAdminPassword] = useState("");
  const [resetSpecialPassword, setResetSpecialPassword] = useState("");
  
  const [merchantFilter, setMerchantFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const [utilityResults, setUtilityResults] = useState<Record<string, { status: "idle" | "running" | "success" | "error"; message?: string }>>({});

  const [videoCaption, setVideoCaption] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState<number | null>(null);
  const [editingVideoCaption, setEditingVideoCaption] = useState("");
  const [headerImageUploading, setHeaderImageUploading] = useState(false);
  const [templateUploading, setTemplateUploading] = useState(false);

  useEffect(() => {
    if (!user?.isSystemAdmin) {
      setLocation("/");
    }
  }, [user, setLocation]);

  if (!user?.isSystemAdmin) {
    return null;
  }

  const { data: merchants = [], isLoading: merchantsLoading } = useQuery<MerchantWithUsers[]>({
    queryKey: ["/api/admin/merchants"],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<UserWithMerchant[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: demoVideos = [], isLoading: videosLoading } = useQuery<DemoVideo[]>({
    queryKey: ["/api/demo-videos"],
  });

  const handleVideoUpload = async () => {
    if (!videoFile) return;
    setVideoUploading(true);
    try {
      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("caption", videoCaption || videoFile.name);
      const res = await fetch("/api/admin/demo-videos", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error("File too large. Maximum size is 200MB. If using a reverse proxy (Nginx), ensure client_max_body_size is set to at least 200M.");
        }
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const err = await res.json();
          throw new Error(err.message || "Upload failed");
        }
        throw new Error(`Upload failed (${res.status}). Server may have a file size limit configured.`);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/demo-videos"] });
      setVideoFile(null);
      setVideoCaption("");
      const fileInput = document.getElementById("video-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      toast({ title: "Video uploaded successfully", variant: "success" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setVideoUploading(false);
    }
  };

  const handleVideoDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    try {
      await apiRequest("DELETE", `/api/admin/demo-videos/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/demo-videos"] });
      toast({ title: "Video deleted", variant: "success" });
    } catch (error: any) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    }
  };

  const handleVideoCaptionUpdate = async (id: number) => {
    try {
      await apiRequest("PATCH", `/api/admin/demo-videos/${id}`, { caption: editingVideoCaption });
      queryClient.invalidateQueries({ queryKey: ["/api/demo-videos"] });
      setEditingVideoId(null);
      toast({ title: "Caption updated", variant: "success" });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const createMerchantMutation = useMutation({
    mutationFn: async (data: typeof merchantForm) => {
      const res = await apiRequest("POST", "/api/admin/merchants", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      setMerchantDialogOpen(false);
      setMerchantForm({ name: "", contactNumber: "", address: "" });
      toast({ title: "Merchant created successfully", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create merchant", description: error.message, variant: "destructive" });
    },
  });

  const updateMerchantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof merchantForm }) => {
      const res = await apiRequest("PUT", `/api/admin/merchants/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      setMerchantDialogOpen(false);
      setEditingMerchant(null);
      setMerchantForm({ name: "", contactNumber: "", address: "" });
      toast({ title: "Merchant updated successfully", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update merchant", description: error.message, variant: "destructive" });
    },
  });

  const updateMerchantStatusMutation = useMutation({
    mutationFn: async ({ id, status, adminPassword }: { id: number; status: string; adminPassword: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/merchants/${id}/status`, { status, adminPassword });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      setStatusDialogOpen(false);
      setStatusDialogMerchant(null);
      setStatusPassword("");
      const statusMessages: Record<string, string> = {
        active: "Merchant activated successfully",
        inactive: "Merchant deactivated. All users have been logged out.",
        archived: "Merchant archived. All users have been logged out.",
      };
      toast({ title: statusMessages[variables.status] || "Status updated", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  const factoryResetMutation = useMutation({
    mutationFn: async ({ id, adminPassword, resetPassword }: { id: number; adminPassword: string; resetPassword: string }) => {
      const res = await apiRequest("POST", `/api/admin/merchants/${id}/reset`, { adminPassword, resetPassword });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      setResetDialogOpen(false);
      setResetDialogMerchant(null);
      setResetAdminPassword("");
      setResetSpecialPassword("");
      toast({ title: "Factory reset complete", description: "All merchant data has been deleted.", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset merchant", description: error.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof userForm) => {
      const res = await apiRequest("POST", "/api/admin/users", {
        ...data,
        merchantId: parseInt(data.merchantId),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setUserDialogOpen(false);
      setUserForm({ username: "", name: "", mobileNumber: "", merchantId: "", canEdit: true });
      toast({ title: "User created successfully", description: "Default password is 'password123'", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create user", description: error.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof userForm> }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setUserDialogOpen(false);
      setEditingUser(null);
      setUserForm({ username: "", name: "", mobileNumber: "", merchantId: "", canEdit: true });
      toast({ title: "User updated successfully", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update user", description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/users/${id}/reset-password`);
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully", description: "New password is 'password123'", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset password", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted successfully", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete user", description: error.message, variant: "destructive" });
    },
  });

  const openMerchantDialog = (merchant?: MerchantWithUsers) => {
    if (merchant) {
      setEditingMerchant(merchant);
      setMerchantForm({
        name: merchant.name,
        contactNumber: merchant.contactNumber || "",
        address: merchant.address || "",
      });
    } else {
      setEditingMerchant(null);
      setMerchantForm({ name: "", contactNumber: "", address: "" });
    }
    setMerchantDialogOpen(true);
  };

  const openUserDialog = (userToEdit?: UserWithMerchant) => {
    if (userToEdit) {
      setEditingUser(userToEdit);
      setUserForm({
        username: userToEdit.username,
        name: userToEdit.name,
        mobileNumber: userToEdit.mobileNumber || "",
        merchantId: userToEdit.merchantId?.toString() || "",
        canEdit: userToEdit.canEdit ?? true,
      });
    } else {
      setEditingUser(null);
      setUserForm({ username: "", name: "", mobileNumber: "", merchantId: "", canEdit: true });
    }
    setUserDialogOpen(true);
  };

  const handleMerchantSubmit = () => {
    if (editingMerchant) {
      updateMerchantMutation.mutate({ id: editingMerchant.id, data: merchantForm });
    } else {
      createMerchantMutation.mutate(merchantForm);
    }
  };

  const handleHeaderImageUpload = async (merchantId: number, file: File) => {
    setHeaderImageUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/admin/merchants/${merchantId}/receipt-header`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      const updated = await res.json();
      if (editingMerchant && editingMerchant.id === merchantId) {
        setEditingMerchant({ ...editingMerchant, receiptHeaderImage: updated.receiptHeaderImage });
      }
      toast({ title: "Header image uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setHeaderImageUploading(false);
    }
  };

  const handleHeaderImageDelete = async (merchantId: number) => {
    setHeaderImageUploading(true);
    try {
      await apiRequest("DELETE", `/api/admin/merchants/${merchantId}/receipt-header`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      if (editingMerchant && editingMerchant.id === merchantId) {
        setEditingMerchant({ ...editingMerchant, receiptHeaderImage: null });
      }
      toast({ title: "Header image removed" });
    } catch {
      toast({ title: "Failed to remove", variant: "destructive" });
    } finally {
      setHeaderImageUploading(false);
    }
  };

  const handleTemplateUpload = async (merchantId: number, file: File) => {
    setTemplateUploading(true);
    try {
      const text = await file.text();
      const res = await apiRequest("POST", `/api/admin/merchants/${merchantId}/receipt-template`, { htmlContent: text });
      if (!res.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      if (editingMerchant && editingMerchant.id === merchantId) {
        setEditingMerchant({ ...editingMerchant, receiptHtmlTemplate: text });
      }
      toast({ title: "Receipt template uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setTemplateUploading(false);
    }
  };

  const handleTemplateDelete = async (merchantId: number) => {
    setTemplateUploading(true);
    try {
      await apiRequest("DELETE", `/api/admin/merchants/${merchantId}/receipt-template`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      if (editingMerchant && editingMerchant.id === merchantId) {
        setEditingMerchant({ ...editingMerchant, receiptHtmlTemplate: null });
      }
      toast({ title: "Receipt template removed" });
    } catch {
      toast({ title: "Failed to remove", variant: "destructive" });
    } finally {
      setTemplateUploading(false);
    }
  };

  const handleUserSubmit = () => {
    if (editingUser) {
      updateUserMutation.mutate({
        id: editingUser.id,
        data: {
          name: userForm.name,
          mobileNumber: userForm.mobileNumber,
          canEdit: userForm.canEdit,
        },
      });
    } else {
      createUserMutation.mutate(userForm);
    }
  };

  const openStatusDialog = (merchant: MerchantWithUsers, action: "active" | "inactive" | "archived") => {
    setStatusDialogMerchant(merchant);
    setStatusDialogAction(action);
    setStatusPassword("");
    setStatusDialogOpen(true);
  };

  const openResetDialog = (merchant: MerchantWithUsers) => {
    setResetDialogMerchant(merchant);
    setResetAdminPassword("");
    setResetSpecialPassword("");
    setResetDialogOpen(true);
  };

  const handleStatusConfirm = () => {
    if (!statusDialogMerchant || !statusPassword) return;
    updateMerchantStatusMutation.mutate({
      id: statusDialogMerchant.id,
      status: statusDialogAction,
      adminPassword: statusPassword,
    });
  };

  const handleResetConfirm = () => {
    if (!resetDialogMerchant || !resetAdminPassword || !resetSpecialPassword) return;
    factoryResetMutation.mutate({
      id: resetDialogMerchant.id,
      adminPassword: resetAdminPassword,
      resetPassword: resetSpecialPassword,
    });
  };

  const sortedMerchants = [...merchants].sort((a, b) => {
    const statusOrder: Record<string, number> = { active: 0, inactive: 1, archived: 2 };
    const aOrder = statusOrder[a.status || "active"] || 0;
    const bOrder = statusOrder[b.status || "active"] || 0;
    return aOrder - bOrder;
  });

  const filteredMerchants = sortedMerchants.filter(m => 
    merchantFilter.trim() === "" || 
    m.name.toLowerCase().includes(merchantFilter.toLowerCase().trim())
  );
  const activeMerchants = filteredMerchants.filter(m => (m.status || "active") !== "archived");
  const archivedMerchants = filteredMerchants.filter(m => m.status === "archived");
  
  const filteredUsers = users.filter(u => 
    userFilter.trim() === "" || 
    u.name.toLowerCase().includes(userFilter.toLowerCase().trim()) ||
    u.username.toLowerCase().includes(userFilter.toLowerCase().trim())
  );

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl" data-no-capitalize>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">Manage merchants and users</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          data-testid="button-logout"
        >
          {logoutMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 mr-2" />
          )}
          Logout
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="merchants" data-testid="tab-merchants">
            <Building2 className="h-4 w-4 mr-2" />
            Merchants
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="utilities" data-testid="tab-utilities">
            <Wrench className="h-4 w-4 mr-2" />
            Utilities
          </TabsTrigger>
          <TabsTrigger value="demo-videos" data-testid="tab-demo-videos">
            <PlayCircle className="h-4 w-4 mr-2" />
            Demo Videos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="merchants">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Merchants</CardTitle>
                <CardDescription>Manage all registered merchants/businesses</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search merchants..."
                    value={merchantFilter}
                    onChange={(e) => setMerchantFilter(e.target.value)}
                    className="pl-8 w-48"
                    data-testid="input-filter-merchants"
                  />
                </div>
                <Button onClick={() => openMerchantDialog()} data-testid="button-add-merchant">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Merchant
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {merchantsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : merchants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No merchants found. Add your first merchant to get started.
                </div>
              ) : filteredMerchants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No merchants match your search.
                </div>
              ) : (
                <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Merchant ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeMerchants.map((merchant) => (
                        <TableRow key={merchant.id} data-testid={`row-merchant-${merchant.id}`}>
                          <TableCell className="font-mono text-sm text-muted-foreground" data-testid={`text-merchant-code-${merchant.id}`}>{merchant.merchantCode || '-'}</TableCell>
                          <TableCell className="font-medium">{merchant.name}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={(merchant.status || "active") === "active" ? "default" : "secondary"}
                              className={(merchant.status || "active") === "active" ? "bg-green-600" : "bg-yellow-600"}
                            >
                              {(merchant.status || "active") === "active" ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {merchant.contactNumber ? (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {merchant.contactNumber}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {merchant.address ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                {merchant.address}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openMerchantDialog(merchant)}
                                title="Edit"
                                data-testid={`button-edit-merchant-${merchant.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openStatusDialog(merchant, (merchant.status || "active") === "active" ? "inactive" : "active")}
                                title={(merchant.status || "active") === "active" ? "Deactivate" : "Activate"}
                                data-testid={`button-toggle-status-${merchant.id}`}
                              >
                                <Power className={`h-4 w-4 ${(merchant.status || "active") === "active" ? "text-green-600" : "text-yellow-600"}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openStatusDialog(merchant, "archived")}
                                title="Archive"
                                data-testid={`button-archive-merchant-${merchant.id}`}
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openResetDialog(merchant)}
                                title="Factory Reset"
                                className="text-destructive"
                                data-testid={`button-reset-merchant-${merchant.id}`}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {archivedMerchants.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-semibold mb-4 text-muted-foreground flex items-center gap-2">
                      <Archive className="h-5 w-5" />
                      Archived Merchants
                    </h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Merchant ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {archivedMerchants.map((merchant) => (
                            <TableRow key={merchant.id} className="opacity-60" data-testid={`row-merchant-archived-${merchant.id}`}>
                              <TableCell className="font-mono text-sm text-muted-foreground">{merchant.merchantCode || '-'}</TableCell>
                              <TableCell className="font-medium">{merchant.name}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="bg-gray-500">
                                  Archived
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {merchant.contactNumber ? (
                                  <div className="flex items-center gap-1">
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                    {merchant.contactNumber}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {merchant.address ? (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    {merchant.address}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openStatusDialog(merchant, "active")}
                                    title="Restore (Activate)"
                                    data-testid={`button-restore-merchant-${merchant.id}`}
                                  >
                                    <Power className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openResetDialog(merchant)}
                                    title="Factory Reset"
                                    className="text-destructive"
                                    data-testid={`button-reset-archived-merchant-${merchant.id}`}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Users</CardTitle>
                <CardDescription>Manage all user accounts</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="pl-8 w-48"
                    data-testid="input-filter-users"
                  />
                </div>
                <Button 
                  onClick={() => openUserDialog()} 
                  disabled={merchants.length === 0}
                  data-testid="button-add-user"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No users found.
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No users match your search.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Mobile</TableHead>
                        <TableHead>Merchant</TableHead>
                        <TableHead>Permissions</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((userItem) => (
                        <TableRow key={userItem.id} data-testid={`row-user-${userItem.id}`}>
                          <TableCell className="font-medium">{userItem.username}</TableCell>
                          <TableCell>{userItem.name}</TableCell>
                          <TableCell>
                            {userItem.mobileNumber || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            {userItem.isSystemAdmin ? (
                              <Badge variant="secondary">System Admin</Badge>
                            ) : (
                              userItem.merchantName || <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {userItem.isSystemAdmin ? (
                              <Badge>Full Access</Badge>
                            ) : userItem.canEdit ? (
                              <Badge variant="outline">Can Edit</Badge>
                            ) : (
                              <Badge variant="secondary">View Only</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {!userItem.isSystemAdmin && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openUserDialog(userItem)}
                                    data-testid={`button-edit-user-${userItem.id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm("Reset password to 'password123'?")) {
                                        resetPasswordMutation.mutate(userItem.id);
                                      }
                                    }}
                                    data-testid={`button-reset-password-${userItem.id}`}
                                  >
                                    <KeyRound className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm("Are you sure you want to delete this user?")) {
                                        deleteUserMutation.mutate(userItem.id);
                                      }
                                    }}
                                    data-testid={`button-delete-user-${userItem.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="utilities">
          <Card>
            <CardHeader>
              <CardTitle>Admin Utilities</CardTitle>
              <CardDescription>One-time fix scripts and maintenance tools. These are safe to run multiple times.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {[
                  {
                    id: "recalculate-lot-payables",
                    name: "Recalculate Lot Payables",
                    description: "Recalculates totalCharges, netPayable, and avgCostPerBag for all harvest and seed lots across all merchants. Use this after migrations or if farmer dues show as 0.",
                    endpoint: "/api/admin/recalculate-lot-payables",
                  },
                ].map((utility) => {
                  const result = utilityResults[utility.id] || { status: "idle" };
                  return (
                    <div
                      key={utility.id}
                      className="flex items-start justify-between gap-4 p-4 border rounded-lg"
                      data-testid={`utility-card-${utility.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm">{utility.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{utility.description}</p>
                        {result.status === "success" && (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {result.message}
                          </div>
                        )}
                        {result.status === "error" && (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
                            <XCircle className="h-3.5 w-3.5" />
                            {result.message || "Failed to run"}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={result.status === "running"}
                        data-testid={`button-run-${utility.id}`}
                        onClick={async () => {
                          setUtilityResults((prev) => ({
                            ...prev,
                            [utility.id]: { status: "running" },
                          }));
                          try {
                            const res = await apiRequest("POST", utility.endpoint);
                            const data = await res.json();
                            setUtilityResults((prev) => ({
                              ...prev,
                              [utility.id]: {
                                status: "success",
                                message: data.message
                                  ? `${data.message}${data.harvestLotsUpdated != null ? ` (Harvest: ${data.harvestLotsUpdated}, Seed: ${data.seedLotsUpdated})` : ""}`
                                  : "Completed successfully",
                              },
                            }));
                          } catch (err: any) {
                            setUtilityResults((prev) => ({
                              ...prev,
                              [utility.id]: {
                                status: "error",
                                message: err?.message || "An error occurred",
                              },
                            }));
                          }
                        }}
                      >
                        {result.status === "running" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-1" />
                        )}
                        {result.status === "running" ? "Running..." : "Run"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demo-videos">
          <Card>
            <CardHeader>
              <CardTitle>Demo Videos</CardTitle>
              <CardDescription>Upload and manage demo/tutorial videos visible to all users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-3 items-end p-4 border rounded-lg bg-muted/30">
                <div className="flex-1 w-full">
                  <Label htmlFor="video-file-input" className="text-xs">Video File</Label>
                  <Input
                    id="video-file-input"
                    type="file"
                    accept="video/*"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    data-testid="input-video-file"
                  />
                </div>
                <div className="flex-1 w-full">
                  <Label className="text-xs">Caption</Label>
                  <Input
                    placeholder="Enter video caption..."
                    value={videoCaption}
                    onChange={(e) => setVideoCaption(e.target.value)}
                    data-testid="input-video-caption"
                  />
                </div>
                <Button
                  onClick={handleVideoUpload}
                  disabled={!videoFile || videoUploading}
                  data-testid="button-upload-video"
                >
                  {videoUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {videoUploading ? "Uploading..." : "Upload"}
                </Button>
              </div>

              {videosLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : demoVideos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No demo videos uploaded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {demoVideos.map((video) => (
                    <div
                      key={video.id}
                      className="flex items-center justify-between gap-4 p-3 border rounded-lg"
                      data-testid={`admin-video-row-${video.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        {editingVideoId === video.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingVideoCaption}
                              onChange={(e) => setEditingVideoCaption(e.target.value)}
                              className="h-8 text-sm"
                              data-testid={`input-edit-caption-${video.id}`}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleVideoCaptionUpdate(video.id)}
                              data-testid={`button-save-caption-${video.id}`}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingVideoId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <h4 className="font-medium text-sm truncate">{video.caption}</h4>
                            <p className="text-xs text-muted-foreground">
                              {video.originalName} · {(video.fileSize / (1024 * 1024)).toFixed(1)} MB · {video.uploadedAt ? new Date(video.uploadedAt).toLocaleDateString() : ""}
                            </p>
                          </>
                        )}
                      </div>
                      {editingVideoId !== video.id && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingVideoId(video.id);
                              setEditingVideoCaption(video.caption);
                            }}
                            data-testid={`button-edit-video-${video.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleVideoDelete(video.id)}
                            data-testid={`button-delete-video-${video.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={merchantDialogOpen} onOpenChange={setMerchantDialogOpen}>
        <DialogContent data-no-capitalize>
          <DialogHeader>
            <DialogTitle>{editingMerchant ? "Edit Merchant" : "Add New Merchant"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="merchant-name">Merchant Name *</Label>
              <Input
                id="merchant-name"
                value={merchantForm.name}
                onChange={(e) => setMerchantForm({ ...merchantForm, name: e.target.value })}
                placeholder="Enter business name"
                data-testid="input-merchant-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant-contact">Contact Number</Label>
              <Input
                id="merchant-contact"
                value={merchantForm.contactNumber}
                onChange={(e) => setMerchantForm({ ...merchantForm, contactNumber: e.target.value })}
                placeholder="Enter contact number"
                data-testid="input-merchant-contact"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant-address">Address</Label>
              <Input
                id="merchant-address"
                value={merchantForm.address}
                onChange={(e) => setMerchantForm({ ...merchantForm, address: e.target.value })}
                placeholder="Enter address"
                data-testid="input-merchant-address"
              />
            </div>
            {editingMerchant && (
              <div className="space-y-2">
                <Label>Custom Receipt Template (HTML)</Label>
                <p className="text-xs text-muted-foreground">
                  Upload a custom HTML file to fully replace the default receipt layout. If provided, this takes priority over the header image.
                </p>
                {editingMerchant.receiptHtmlTemplate ? (
                  <div className="space-y-2">
                    <div className="relative border rounded-lg p-3 bg-green-50 dark:bg-green-950">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">Custom template uploaded</span>
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={() => handleTemplateDelete(editingMerchant.id)}
                        disabled={templateUploading}
                        data-testid="button-remove-receipt-template"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <label className="cursor-pointer inline-block">
                      <Button variant="outline" size="sm" disabled={templateUploading} asChild data-testid="button-replace-receipt-template">
                        <span>
                          {templateUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                          Replace Template
                        </span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept=".html,.htm"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleTemplateUpload(editingMerchant.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-4 text-center">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">Upload an HTML file for a fully custom receipt</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Available placeholders: {"{{merchantName}}"}, {"{{receiptNumber}}"}, {"{{date}}"}, {"{{buyerName}}"}, {"{{buyerAddress}}"}, {"{{itemsTableHtml}}"}, {"{{totalBags}}"}, {"{{totalWeight}}"}, {"{{totalAmount}}"}, {"{{grandTotal}}"}, {"{{cropName}}"}
                    </p>
                    <label className="cursor-pointer">
                      <Button variant="outline" size="sm" disabled={templateUploading} asChild data-testid="button-upload-receipt-template">
                        <span>
                          {templateUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                          Choose HTML File
                        </span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept=".html,.htm"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleTemplateUpload(editingMerchant.id, file);
                          e.target.value = "";
                        }}
                        data-testid="input-receipt-template-file"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
            {editingMerchant && (
              <div className="space-y-2">
                <Label>Receipt Header Image</Label>
                {editingMerchant.receiptHeaderImage ? (
                  <div className="space-y-2">
                    <div className="relative border rounded-lg overflow-hidden">
                      <img
                        src={`/api/merchants/${editingMerchant.id}/receipt-header`}
                        alt="Receipt header"
                        className="w-full max-h-32 object-contain bg-white"
                        data-testid="img-receipt-header-preview"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={() => handleHeaderImageDelete(editingMerchant.id)}
                        disabled={headerImageUploading}
                        data-testid="button-remove-header-image"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <label className="cursor-pointer inline-block">
                      <Button variant="outline" size="sm" disabled={headerImageUploading} asChild data-testid="button-replace-header-image">
                        <span>
                          {headerImageUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                          Replace Image
                        </span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleHeaderImageUpload(editingMerchant.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-4 text-center">
                    <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">Upload an image to replace the text header on receipts</p>
                    <label className="cursor-pointer">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={headerImageUploading}
                        asChild
                        data-testid="button-upload-header-image"
                      >
                        <span>
                          {headerImageUploading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Choose Image
                        </span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleHeaderImageUpload(editingMerchant.id, file);
                          e.target.value = "";
                        }}
                        data-testid="input-header-image-file"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMerchantDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMerchantSubmit}
              disabled={!merchantForm.name || createMerchantMutation.isPending || updateMerchantMutation.isPending}
              data-testid="button-save-merchant"
            >
              {(createMerchantMutation.isPending || updateMerchantMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingMerchant ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent data-no-capitalize>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add New User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editingUser && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="user-username">Username *</Label>
                  <Input
                    id="user-username"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    placeholder="Enter username"
                    data-testid="input-user-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-merchant">Merchant *</Label>
                  <Select
                    value={userForm.merchantId}
                    onValueChange={(value) => setUserForm({ ...userForm, merchantId: value })}
                  >
                    <SelectTrigger id="user-merchant" data-testid="select-user-merchant">
                      <SelectValue placeholder="Select merchant" />
                    </SelectTrigger>
                    <SelectContent>
                      {merchants.map((merchant) => (
                        <SelectItem key={merchant.id} value={merchant.id.toString()}>
                          {merchant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="user-name">Name *</Label>
              <Input
                id="user-name"
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                placeholder="Enter full name"
                data-testid="input-user-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-mobile">Mobile Number</Label>
              <Input
                id="user-mobile"
                value={userForm.mobileNumber}
                onChange={(e) => setUserForm({ ...userForm, mobileNumber: e.target.value })}
                placeholder="Enter mobile number"
                data-testid="input-user-mobile"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Edit Permission</Label>
                <p className="text-sm text-muted-foreground">
                  Allow this user to add and edit stock entries
                </p>
              </div>
              <Switch
                checked={userForm.canEdit}
                onCheckedChange={(checked) => setUserForm({ ...userForm, canEdit: checked })}
                data-testid="switch-user-can-edit"
              />
            </div>
            {!editingUser && (
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                Default password will be <strong>password123</strong>. User will be prompted to change it on first login.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUserSubmit}
              disabled={
                !userForm.name ||
                (!editingUser && (!userForm.username || !userForm.merchantId)) ||
                createUserMutation.isPending ||
                updateUserMutation.isPending
              }
              data-testid="button-save-user"
            >
              {(createUserMutation.isPending || updateUserMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingUser ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent data-no-capitalize>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${statusDialogAction === "archived" ? "text-destructive" : "text-yellow-600"}`} />
              {statusDialogAction === "active" ? "Activate Merchant" : 
               statusDialogAction === "inactive" ? "Deactivate Merchant" : "Archive Merchant"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className={`p-4 rounded-md ${statusDialogAction === "archived" ? "bg-destructive/10 border border-destructive/30" : "bg-yellow-500/10 border border-yellow-500/30"}`}>
              <p className="text-sm font-medium mb-2">
                {statusDialogAction === "active" 
                  ? `Are you sure you want to activate "${statusDialogMerchant?.name}"?`
                  : statusDialogAction === "inactive"
                  ? `Are you sure you want to deactivate "${statusDialogMerchant?.name}"?`
                  : `Are you sure you want to archive "${statusDialogMerchant?.name}"?`}
              </p>
              <p className="text-sm text-muted-foreground">
                {statusDialogAction === "active" 
                  ? "Users of this merchant will be able to login again."
                  : "All users of this merchant will be logged out immediately and cannot login until reactivated. No data will be deleted."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-password">Enter your admin password to confirm</Label>
              <Input
                id="status-password"
                type="password"
                value={statusPassword}
                onChange={(e) => setStatusPassword(e.target.value)}
                placeholder="Admin password"
                data-testid="input-status-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleStatusConfirm}
              disabled={!statusPassword || updateMerchantStatusMutation.isPending}
              variant={statusDialogAction === "archived" ? "destructive" : "default"}
              data-testid="button-confirm-status"
            >
              {updateMerchantStatusMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent data-no-capitalize>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Factory Reset Merchant
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-md bg-destructive/10 border border-destructive/30">
              <p className="text-sm font-bold text-destructive mb-2">
                WARNING: This action cannot be undone!
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                Are you sure you want to factory reset "{resetDialogMerchant?.name}"?
              </p>
              <p className="text-sm text-destructive">
                This will permanently delete ALL data including:
              </p>
              <ul className="text-sm text-muted-foreground mt-1 ml-4 list-disc">
                <li>All stock entries and lots</li>
                <li>All transactions</li>
                <li>All cash entries and payments</li>
                <li>All seed stock and transactions</li>
                <li>All parties, buyers, and farmers</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-admin-password">Admin Password</Label>
              <Input
                id="reset-admin-password"
                type="password"
                value={resetAdminPassword}
                onChange={(e) => setResetAdminPassword(e.target.value)}
                placeholder="Enter your admin password"
                data-testid="input-reset-admin-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-special-password">Reset Password</Label>
              <Input
                id="reset-special-password"
                type="password"
                value={resetSpecialPassword}
                onChange={(e) => setResetSpecialPassword(e.target.value)}
                placeholder="Enter the special reset password"
                data-testid="input-reset-special-password"
              />
              <p className="text-xs text-muted-foreground">
                Contact system administrator if you don't know the reset password.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleResetConfirm}
              disabled={!resetAdminPassword || !resetSpecialPassword || factoryResetMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-reset"
            >
              {factoryResetMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Factory Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
