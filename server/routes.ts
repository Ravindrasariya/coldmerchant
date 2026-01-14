import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { stockEntryFormSchema, lotFormSchema, type ChangeSet, type ChangeItem, type FieldChange } from "@shared/schema";

// Middleware to ensure user is authenticated
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// Middleware to ensure user has a merchant (not a system admin without merchant)
function requireMerchant(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user || !req.user.merchantId) {
    return res.status(403).json({ message: "This action requires a merchant account" });
  }
  next();
}

// Middleware to ensure user is a system admin
function requireSystemAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user || !req.user.isSystemAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // Stock Entries Routes
  // GET /api/stock-entries - Get all stock entries for the authenticated merchant
  app.get("/api/stock-entries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const entries = await storage.getStockEntriesByMerchant(merchantId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching stock entries:", error);
      res.status(500).json({ message: "Failed to fetch stock entries" });
    }
  });

  // GET /api/stock-entries/:id - Get a specific stock entry
  app.get("/api/stock-entries/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      
      const entry = await storage.getStockEntryById(id, merchantId);
      if (!entry) {
        return res.status(404).json({ message: "Stock entry not found" });
      }
      
      res.json(entry);
    } catch (error) {
      console.error("Error fetching stock entry:", error);
      res.status(500).json({ message: "Failed to fetch stock entry" });
    }
  });

  // POST /api/stock-entries - Create a new stock entry
  app.post("/api/stock-entries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const validationResult = stockEntryFormSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }

      const data = validationResult.data;

      // Create stock entry
      const stockEntry = await storage.createStockEntry({
        merchantId,
        purchaseDate: data.purchaseDate,
        farmerName: data.farmerName,
        farmerContact: data.farmerContact || null,
        village: data.village || null,
        tehsil: data.tehsil || null,
        district: data.district,
        state: data.state,
        remarks: data.remarks || null,
        paymentStatus: "due",
      });

      // Create lots and bag breakdowns
      for (const lotData of data.lots) {
        const lot = await storage.createLot({
          stockEntryId: stockEntry.id,
          merchantId,
          coldStoreName: lotData.coldStoreName,
          originalBags: lotData.originalBags,
          potatoType: lotData.potatoType,
          bagType: lotData.bagType,
          quality: lotData.quality,
          cutType: lotData.cutType,
          size: lotData.cutType === "gate_cut" ? (lotData.size || null) : null,
          pricePerKg: lotData.cutType === "gate_cut" && lotData.pricePerKg 
            ? lotData.pricePerKg.toString() 
            : null,
          remainingBags: lotData.originalBags,
        });

        // Create bag breakdowns for bilty cut
        if (lotData.cutType === "bilty_cut" && lotData.bagBreakdowns) {
          for (const bdData of lotData.bagBreakdowns) {
            const weight = bdData.weight || 0;
            const pricePerKg = bdData.pricePerKg || 0;
            const totalAmount = weight * pricePerKg;

            await storage.createBagBreakdown({
              lotId: lot.id,
              merchantId,
              size: bdData.size,
              numberOfBags: bdData.numberOfBags,
              remainingBags: bdData.size === "Wastage" ? 0 : bdData.numberOfBags,
              weight: weight > 0 ? weight.toString() : null,
              pricePerKg: pricePerKg > 0 ? pricePerKg.toString() : null,
              totalAmount: totalAmount > 0 ? totalAmount.toString() : null,
            });
          }
        }
      }

      // Fetch the complete entry with lots and breakdowns
      const completeEntry = await storage.getStockEntryById(stockEntry.id, merchantId);
      res.status(201).json(completeEntry);
    } catch (error) {
      console.error("Error creating stock entry:", error);
      res.status(500).json({ message: "Failed to create stock entry" });
    }
  });

  // PATCH /api/stock-entries/:id - Update a stock entry
  app.patch("/api/stock-entries/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const id = parseInt(req.params.id);
      const { paymentStatus, remarks, lots } = req.body;

      // Check if entry exists and belongs to merchant - this is our snapshot
      const existingEntry = await storage.getStockEntryById(id, merchantId);
      if (!existingEntry) {
        return res.status(404).json({ message: "Stock entry not found" });
      }

      // Track changes
      const changes: ChangeSet = [];

      // Helper to normalize values for comparison (handles decimals like "20.00" vs 20)
      const normalizeValue = (val: any): string | null => {
        if (val === null || val === undefined || val === '') return null;
        const num = Number(val);
        if (!isNaN(num)) return String(num); // Converts "20.00" to "20"
        return String(val);
      };

      // Helper to compare values
      const compareField = (field: string, oldVal: any, newVal: any, label: string, scope: 'entry' | 'lot' | 'breakdown', entityId?: number) => {
        const oldStr = normalizeValue(oldVal);
        const newStr = normalizeValue(newVal);
        if (oldStr !== newStr) {
          const existingItem = changes.find(c => c.scope === scope && c.entityId === entityId);
          const change: FieldChange = { field, oldValue: oldStr, newValue: newStr };
          if (existingItem) {
            existingItem.changes.push(change);
          } else {
            changes.push({ scope, entityId, label, changes: [change] });
          }
        }
      };

      // Track entry-level changes
      const newPaymentStatus = paymentStatus || existingEntry.paymentStatus;
      const newRemarks = remarks !== undefined ? remarks : existingEntry.remarks;
      compareField('paymentStatus', existingEntry.paymentStatus, newPaymentStatus, 'Stock Entry', 'entry', id);
      compareField('remarks', existingEntry.remarks, newRemarks, 'Stock Entry', 'entry', id);

      // Update stock entry
      await storage.updateStockEntry(id, merchantId, {
        paymentStatus: newPaymentStatus,
        remarks: newRemarks,
      });

      // Update lots and bag breakdowns if provided
      if (lots && Array.isArray(lots)) {
        for (const lotData of lots) {
          if (lotData.id) {
            const existingLot = existingEntry.lots.find((l: any) => l.id === lotData.id);
            const lotLabel = `Lot #${lotData.id} (${existingLot?.coldStoreName || 'Unknown'})`;

            // Track lot-level changes
            if (existingLot && lotData.remainingBags !== undefined) {
              compareField('remainingBags', existingLot.remainingBags, lotData.remainingBags, lotLabel, 'lot', lotData.id);
            }

            // Update existing lot
            await storage.updateLot(lotData.id, merchantId, {
              remainingBags: lotData.remainingBags,
            });

            // Handle bag breakdowns for bilty cut
            if (lotData.cutType === "bilty_cut" && lotData.bagBreakdowns) {
              const existingBreakdowns = existingLot?.bagBreakdowns || [];
              const existingIds = new Set<number>(existingBreakdowns.map((b: any) => b.id));

              for (const bdData of lotData.bagBreakdowns) {
                const weight = bdData.weight || 0;
                const pricePerKg = bdData.pricePerKg || 0;
                const totalAmount = weight * pricePerKg;

                if (bdData.id && bdData.id > 0) {
                  const existingBd = existingBreakdowns.find((b: any) => b.id === bdData.id);
                  const bdLabel = `Breakdown ${bdData.size} in ${existingLot?.coldStoreName || 'Unknown'}`;

                  // Track breakdown changes
                  if (existingBd) {
                    compareField('size', existingBd.size, bdData.size, bdLabel, 'breakdown', bdData.id);
                    compareField('numberOfBags', existingBd.numberOfBags, bdData.numberOfBags, bdLabel, 'breakdown', bdData.id);
                    const newRemaining = bdData.remainingBags !== undefined ? bdData.remainingBags : bdData.numberOfBags;
                    compareField('remainingBags', existingBd.remainingBags, newRemaining, bdLabel, 'breakdown', bdData.id);
                    compareField('weight', existingBd.weight, weight > 0 ? weight : null, bdLabel, 'breakdown', bdData.id);
                    compareField('pricePerKg', existingBd.pricePerKg, pricePerKg > 0 ? pricePerKg : null, bdLabel, 'breakdown', bdData.id);
                  }

                  // Update existing breakdown
                  await storage.updateBagBreakdown(bdData.id, merchantId, {
                    size: bdData.size,
                    numberOfBags: bdData.numberOfBags,
                    remainingBags: bdData.remainingBags !== undefined ? bdData.remainingBags : bdData.numberOfBags,
                    weight: weight > 0 ? weight.toString() : null,
                    pricePerKg: pricePerKg > 0 ? pricePerKg.toString() : null,
                    totalAmount: totalAmount > 0 ? totalAmount.toString() : null,
                  });
                  existingIds.delete(bdData.id);
                } else {
                  // Create new breakdown - record as addition
                  changes.push({
                    scope: 'breakdown',
                    label: `Added breakdown ${bdData.size} (${bdData.numberOfBags} bags)`,
                    changes: [],
                  });

                  await storage.createBagBreakdown({
                    lotId: lotData.id,
                    merchantId,
                    size: bdData.size,
                    numberOfBags: bdData.numberOfBags,
                    remainingBags: bdData.size === "Wastage" ? 0 : bdData.numberOfBags,
                    weight: weight > 0 ? weight.toString() : null,
                    pricePerKg: pricePerKg > 0 ? pricePerKg.toString() : null,
                    totalAmount: totalAmount > 0 ? totalAmount.toString() : null,
                  });
                }
              }

              // Delete removed breakdowns - record as deletion
              const idsToDelete = Array.from(existingIds);
              for (const oldId of idsToDelete) {
                const deletedBd = existingBreakdowns.find((b: any) => b.id === oldId);
                if (deletedBd) {
                  changes.push({
                    scope: 'breakdown',
                    entityId: oldId,
                    label: `Deleted breakdown ${deletedBd.size} (${deletedBd.numberOfBags} bags)`,
                    changes: [],
                  });
                }
                await storage.deleteBagBreakdown(oldId, merchantId);
              }
            }
          }
        }
      }

      // Save edit history if there were any changes
      if (changes.length > 0) {
        await storage.createEditHistory(id, merchantId, userId, changes);
      }

      // Fetch updated entry
      const updatedEntry = await storage.getStockEntryById(id, merchantId);
      res.json(updatedEntry);
    } catch (error) {
      console.error("Error updating stock entry:", error);
      res.status(500).json({ message: "Failed to update stock entry" });
    }
  });

  // GET /api/stock-entries/:id/history - Get edit history for a stock entry
  app.get("/api/stock-entries/:id/history", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);

      // Verify entry exists and belongs to merchant
      const entry = await storage.getStockEntryById(id, merchantId);
      if (!entry) {
        return res.status(404).json({ message: "Stock entry not found" });
      }

      const history = await storage.getEditHistory(id, merchantId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching edit history:", error);
      res.status(500).json({ message: "Failed to fetch edit history" });
    }
  });

  // POST /api/bag-breakdowns/:id/sell - Mark bags as sold for a specific breakdown
  app.post("/api/bag-breakdowns/:id/sell", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const breakdownId = parseInt(req.params.id);
      const { quantity } = req.body;

      if (!quantity || quantity <= 0) {
        return res.status(400).json({ message: "Invalid quantity. Must be a positive number." });
      }

      // Get the breakdown
      const breakdown = await storage.getBagBreakdownById(breakdownId, merchantId);
      
      if (!breakdown) {
        return res.status(404).json({ message: "Breakdown not found" });
      }

      const currentRemaining = breakdown.remainingBags ?? breakdown.numberOfBags;
      if (quantity > currentRemaining) {
        return res.status(400).json({ 
          message: `Cannot sell ${quantity} bags. Only ${currentRemaining} remaining.` 
        });
      }

      // Update the breakdown
      const newRemaining = currentRemaining - quantity;
      await storage.updateBagBreakdown(breakdownId, merchantId, {
        remainingBags: newRemaining,
      });

      // Update the lot's remaining bags
      const lot = await storage.getLotById(breakdown.lotId, merchantId);
      if (lot) {
        const allBreakdowns = await storage.getBagBreakdownsByLot(breakdown.lotId, merchantId);
        const totalRemaining = allBreakdowns.reduce((sum, bd) => {
          if (bd.size === "Wastage") return sum;
          if (bd.id === breakdownId) return sum + newRemaining;
          return sum + (bd.remainingBags ?? bd.numberOfBags);
        }, 0);
        
        await storage.updateLot(breakdown.lotId, merchantId, {
          remainingBags: totalRemaining,
        });
      }

      res.json({ success: true, remainingBags: newRemaining });
    } catch (error) {
      console.error("Error marking bags as sold:", error);
      res.status(500).json({ message: "Failed to mark bags as sold" });
    }
  });

  // POST /api/lots/:id/sell - Mark bags as sold for a gate_cut lot
  app.post("/api/lots/:id/sell", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const lotId = parseInt(req.params.id);
      const { quantity } = req.body;

      if (!quantity || quantity <= 0) {
        return res.status(400).json({ message: "Invalid quantity. Must be a positive number." });
      }

      const lot = await storage.getLotById(lotId, merchantId);
      if (!lot) {
        return res.status(404).json({ message: "Lot not found" });
      }

      if (quantity > lot.remainingBags) {
        return res.status(400).json({ 
          message: `Cannot sell ${quantity} bags. Only ${lot.remainingBags} remaining.` 
        });
      }

      const newRemaining = lot.remainingBags - quantity;
      await storage.updateLot(lotId, merchantId, {
        remainingBags: newRemaining,
      });

      res.json({ success: true, remainingBags: newRemaining });
    } catch (error) {
      console.error("Error marking lot bags as sold:", error);
      res.status(500).json({ message: "Failed to mark bags as sold" });
    }
  });

  // ============= ADMIN ROUTES =============
  
  // GET /api/admin/merchants - Get all merchants (admin only)
  app.get("/api/admin/merchants", requireSystemAdmin, async (req, res) => {
    try {
      const allMerchants = await storage.getAllMerchants();
      res.json(allMerchants);
    } catch (error) {
      console.error("Error fetching merchants:", error);
      res.status(500).json({ message: "Failed to fetch merchants" });
    }
  });

  // POST /api/admin/merchants - Create a new merchant (admin only)
  app.post("/api/admin/merchants", requireSystemAdmin, async (req, res) => {
    try {
      const { name, contactNumber, address } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Merchant name is required" });
      }

      const merchant = await storage.createMerchant({
        name,
        contactNumber: contactNumber || null,
        address: address || null,
      });

      res.status(201).json(merchant);
    } catch (error) {
      console.error("Error creating merchant:", error);
      res.status(500).json({ message: "Failed to create merchant" });
    }
  });

  // PUT /api/admin/merchants/:id - Update a merchant (admin only)
  app.put("/api/admin/merchants/:id", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, contactNumber, address } = req.body;

      const updated = await storage.updateMerchant(id, {
        name,
        contactNumber,
        address,
      });

      if (!updated) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating merchant:", error);
      res.status(500).json({ message: "Failed to update merchant" });
    }
  });

  // DELETE /api/admin/merchants/:id - Delete a merchant (admin only)
  app.delete("/api/admin/merchants/:id", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteMerchant(id);
      res.json({ message: "Merchant deleted successfully" });
    } catch (error) {
      console.error("Error deleting merchant:", error);
      res.status(500).json({ message: "Failed to delete merchant" });
    }
  });

  // GET /api/admin/users - Get all users (admin only)
  app.get("/api/admin/users", requireSystemAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      // Remove password from response
      const usersWithoutPasswords = allUsers.map(({ password, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // POST /api/admin/users - Create a new user (admin only)
  app.post("/api/admin/users", requireSystemAdmin, async (req, res) => {
    try {
      const { username, name, mobileNumber, merchantId, canEdit } = req.body;

      if (!username || !name || !merchantId) {
        return res.status(400).json({ message: "Username, name, and merchant are required" });
      }

      // Check if username exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Default password is "password123"
      const { hashPassword } = await import("./auth");
      const hashedPassword = await hashPassword("password123");

      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        mobileNumber: mobileNumber || null,
        merchantId,
        isSystemAdmin: false,
        canEdit: canEdit ?? true,
        mustChangePassword: true,
      });

      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // PUT /api/admin/users/:id - Update a user (admin only)
  app.put("/api/admin/users/:id", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, mobileNumber, canEdit } = req.body;

      const updated = await storage.updateUser(id, {
        name,
        mobileNumber,
        canEdit,
      });

      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      // Remove password from response
      const { password, ...userWithoutPassword } = updated;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // POST /api/admin/users/:id/reset-password - Reset user password to default (admin only)
  app.post("/api/admin/users/:id/reset-password", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Reset to default password "password123"
      const { hashPassword } = await import("./auth");
      const hashedPassword = await hashPassword("password123");

      await storage.updateUserPassword(id, hashedPassword);
      await storage.updateUserMustChangePassword(id, true);

      res.json({ message: "Password reset to default. User must change password on next login." });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // DELETE /api/admin/users/:id - Delete a user (admin only)
  app.delete("/api/admin/users/:id", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Don't allow deleting yourself
      if (req.user!.id === id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      await storage.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  return httpServer;
}
