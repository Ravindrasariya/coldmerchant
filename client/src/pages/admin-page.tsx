import { useState } from "react";
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
  ArrowLeft, Phone, MapPin 
} from "lucide-react";
import type { Merchant, User } from "@shared/schema";

type MerchantWithUsers = Merchant;
type UserWithMerchant = Omit<User, 'password'> & { merchantName?: string };

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("merchants");
  
  const [merchantDialogOpen, setMerchantDialogOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<MerchantWithUsers | null>(null);
  const [merchantForm, setMerchantForm] = useState({ name: "", contactNumber: "", address: "" });
  
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithMerchant | null>(null);
  const [userForm, setUserForm] = useState({ username: "", name: "", mobileNumber: "", merchantId: "", canEdit: true });

  if (!user?.isSystemAdmin) {
    setLocation("/");
    return <></>;
  }

  const { data: merchants = [], isLoading: merchantsLoading } = useQuery<MerchantWithUsers[]>({
    queryKey: ["/api/admin/merchants"],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<UserWithMerchant[]>({
    queryKey: ["/api/admin/users"],
  });

  const createMerchantMutation = useMutation({
    mutationFn: async (data: typeof merchantForm) => {
      const res = await apiRequest("POST", "/api/admin/merchants", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      setMerchantDialogOpen(false);
      setMerchantForm({ name: "", contactNumber: "", address: "" });
      toast({ title: "Merchant created successfully" });
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
      toast({ title: "Merchant updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update merchant", description: error.message, variant: "destructive" });
    },
  });

  const deleteMerchantMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/merchants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      toast({ title: "Merchant deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete merchant", description: error.message, variant: "destructive" });
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
      toast({ title: "User created successfully", description: "Default password is 'password123'" });
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
      toast({ title: "User updated successfully" });
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
      toast({ title: "Password reset successfully", description: "New password is 'password123'" });
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
      toast({ title: "User deleted successfully" });
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

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">Manage merchants and users</p>
        </div>
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
        </TabsList>

        <TabsContent value="merchants">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Merchants</CardTitle>
                <CardDescription>Manage all registered merchants/businesses</CardDescription>
              </div>
              <Button onClick={() => openMerchantDialog()} data-testid="button-add-merchant">
                <Plus className="h-4 w-4 mr-2" />
                Add Merchant
              </Button>
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
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {merchants.map((merchant) => (
                        <TableRow key={merchant.id} data-testid={`row-merchant-${merchant.id}`}>
                          <TableCell className="font-medium">{merchant.name}</TableCell>
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
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openMerchantDialog(merchant)}
                                data-testid={`button-edit-merchant-${merchant.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this merchant?")) {
                                    deleteMerchantMutation.mutate(merchant.id);
                                  }
                                }}
                                data-testid={`button-delete-merchant-${merchant.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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

        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Users</CardTitle>
                <CardDescription>Manage all user accounts</CardDescription>
              </div>
              <Button 
                onClick={() => openUserDialog()} 
                disabled={merchants.length === 0}
                data-testid="button-add-user"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
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
                      {users.map((userItem) => (
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
      </Tabs>

      <Dialog open={merchantDialogOpen} onOpenChange={setMerchantDialogOpen}>
        <DialogContent>
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
        <DialogContent>
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
    </div>
  );
}
