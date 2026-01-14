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
          coldStoreChargesPerBag: lotData.coldStoreChargesPerBag 
            ? lotData.coldStoreChargesPerBag.toString() 
            : null,
          remainingBags: lotData.originalBags,
        });

        // Create bag breakdowns for both cut types
        if (lotData.bagBreakdowns) {
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
            if (existingLot && lotData.coldStoreChargesPerBag !== undefined) {
              compareField('coldStoreChargesPerBag', existingLot.coldStoreChargesPerBag, lotData.coldStoreChargesPerBag, lotLabel, 'lot', lotData.id);
            }

            // Update existing lot
            await storage.updateLot(lotData.id, merchantId, {
              remainingBags: lotData.remainingBags,
              coldStoreChargesPerBag: lotData.coldStoreChargesPerBag !== undefined 
                ? (lotData.coldStoreChargesPerBag ? lotData.coldStoreChargesPerBag.toString() : null)
                : undefined,
            });

            // Handle bag breakdowns for both cut types
            if (lotData.bagBreakdowns) {
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

  // Transaction Routes
  // GET /api/transactions - Get all transactions for the merchant
  app.get("/api/transactions", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const txns = await storage.getTransactionsByMerchant(merchantId);
      res.json(txns);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // GET /api/inventory/unsold - Get unsold inventory for selection in transactions
  app.get("/api/inventory/unsold", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const inventory = await storage.getUnsoldInventory(merchantId);
      res.json(inventory);
    } catch (error) {
      console.error("Error fetching unsold inventory:", error);
      res.status(500).json({ message: "Failed to fetch unsold inventory" });
    }
  });

  // POST /api/transactions - Create a new transaction (Load a Truck)
  app.post("/api/transactions", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { partyName, partyAddress, vehicleNumber, advancePayment, transportationCharges, otherCharges, revenue, items } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ message: "At least one item is required" });
      }

      // Parse inventoryKey and validate
      const parsedItems: { lotId: number; breakdownId: number | null; bagsMoved: number; netWeight: number }[] = [];
      
      for (const item of items) {
        // Parse inventoryKey format: "lotId-breakdownId" or "lotId-lot"
        const [lotIdStr, breakdownPart] = (item.inventoryKey || "").split("-");
        const lotId = parseInt(lotIdStr);
        const breakdownId = breakdownPart === "lot" ? null : parseInt(breakdownPart);
        
        if (isNaN(lotId)) {
          return res.status(400).json({ message: "Invalid lot selection" });
        }

        const lot = await storage.getLotById(lotId, merchantId);
        if (!lot) {
          return res.status(400).json({ message: `Lot ${lotId} not found` });
        }

        // Check available bags based on breakdown or lot
        if (breakdownId) {
          const breakdown = await storage.getBagBreakdownById(breakdownId, merchantId);
          if (!breakdown) {
            return res.status(400).json({ message: `Breakdown ${breakdownId} not found` });
          }
          // Validate breakdown belongs to the correct lot
          if (breakdown.lotId !== lotId) {
            return res.status(400).json({ message: `Breakdown ${breakdownId} does not belong to lot ${lotId}` });
          }
          const available = breakdown.remainingBags ?? breakdown.numberOfBags ?? 0;
          if (available < item.bagsMoved) {
            return res.status(400).json({ 
              message: `Not enough bags. Available: ${available}, Requested: ${item.bagsMoved}` 
            });
          }
        } else {
          if (lot.remainingBags < item.bagsMoved) {
            return res.status(400).json({ 
              message: `Not enough bags in lot. Available: ${lot.remainingBags}, Requested: ${item.bagsMoved}` 
            });
          }
        }

        parsedItems.push({
          lotId,
          breakdownId,
          bagsMoved: item.bagsMoved,
          netWeight: item.netWeight || 0,
        });
      }

      // Get next transaction number
      const transactionNumber = await storage.getNextTransactionNumber(merchantId);

      // Calculate totals
      let totalBags = 0;
      let totalNetWeight = 0;
      let totalCostOfGoods = 0;

      const transactionItems = await Promise.all(parsedItems.map(async (item) => {
        const lot = await storage.getLotById(item.lotId, merchantId);
        const entry = await storage.getStockEntryById(lot!.stockEntryId, merchantId);
        
        // Get price from breakdown if available, otherwise from lot
        let pricePerKg = 0;
        let size: string | null = null;
        if (item.breakdownId) {
          const breakdown = await storage.getBagBreakdownById(item.breakdownId, merchantId);
          pricePerKg = breakdown?.pricePerKg ? parseFloat(breakdown.pricePerKg) : 0;
          size = breakdown?.size || null;
        }
        if (pricePerKg === 0 && lot?.pricePerKg) {
          pricePerKg = parseFloat(lot.pricePerKg);
        }
        if (!size) {
          size = lot?.size || null;
        }
        
        const netWeight = item.netWeight || 0;
        const costOfGoods = netWeight * pricePerKg;

        totalBags += item.bagsMoved;
        totalNetWeight += netWeight;
        totalCostOfGoods += costOfGoods;

        return {
          merchantId,
          lotId: item.lotId,
          breakdownId: item.breakdownId,
          serialNumber: entry?.serialNumber || 0,
          coldStoreName: lot?.coldStoreName || "",
          potatoType: lot?.potatoType || "",
          size,
          bagsMoved: item.bagsMoved,
          netWeight: netWeight.toString(),
          pricePerKgSnapshot: pricePerKg.toString(),
          costOfGoods: costOfGoods.toString(),
        };
      }));

      // Calculate profit/loss
      const revenueNum = parseFloat(revenue) || 0;
      const transportNum = parseFloat(transportationCharges) || 0;
      const otherNum = parseFloat(otherCharges) || 0;
      const profitLoss = revenueNum - totalCostOfGoods - transportNum - otherNum;

      const transaction = await storage.createTransaction(
        {
          merchantId,
          transactionNumber,
          partyName: partyName || null,
          partyAddress: partyAddress || null,
          vehicleNumber: vehicleNumber || null,
          advancePayment: advancePayment ? advancePayment.toString() : null,
          transportationCharges: transportationCharges ? transportationCharges.toString() : null,
          otherCharges: otherCharges ? otherCharges.toString() : null,
          revenue: revenue ? revenue.toString() : null,
          totalBags,
          totalNetWeight: totalNetWeight.toString(),
          totalCostOfGoods: totalCostOfGoods.toString(),
          profitLoss: profitLoss.toString(),
        },
        transactionItems
      );

      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating transaction:", error);
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  // GET /api/transactions/:id - Get a single transaction with edit history
  app.get("/api/transactions/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const transactionId = parseInt(req.params.id);
      
      const transaction = await storage.getTransactionById(transactionId, merchantId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      const editHistory = await storage.getTransactionEditHistory(transactionId, merchantId);
      res.json({ ...transaction, editHistory });
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ message: "Failed to fetch transaction" });
    }
  });

  // PATCH /api/transactions/:id - Update a transaction (only partyName, advancePayment, transportationCharges, otherCharges, revenue)
  app.patch("/api/transactions/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const transactionId = parseInt(req.params.id);
      
      const existingTxn = await storage.getTransactionById(transactionId, merchantId);
      if (!existingTxn) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      const { partyName, partyAddress, vehicleNumber, advancePayment, amountReceived, transportationCharges, otherCharges, revenue } = req.body;
      
      // Helper to compare decimal values (treats "1000.00" and "1000" as equal)
      const decimalEqual = (a: string | number | null | undefined, b: string | number | null | undefined): boolean => {
        const numA = parseFloat(String(a ?? "")) || 0;
        const numB = parseFloat(String(b ?? "")) || 0;
        return numA === numB;
      };
      
      // Track changes for edit history
      const changes: { field: string; oldValue: string | number | null; newValue: string | number | null }[] = [];
      
      if (partyName !== undefined && (partyName || null) !== (existingTxn.partyName || null)) {
        changes.push({ field: "partyName", oldValue: existingTxn.partyName, newValue: partyName || null });
      }
      if (partyAddress !== undefined && (partyAddress || null) !== (existingTxn.partyAddress || null)) {
        changes.push({ field: "partyAddress", oldValue: existingTxn.partyAddress, newValue: partyAddress || null });
      }
      if (vehicleNumber !== undefined && (vehicleNumber || null) !== (existingTxn.vehicleNumber || null)) {
        changes.push({ field: "vehicleNumber", oldValue: existingTxn.vehicleNumber, newValue: vehicleNumber || null });
      }
      if (advancePayment !== undefined && !decimalEqual(advancePayment, existingTxn.advancePayment)) {
        changes.push({ field: "advancePayment", oldValue: existingTxn.advancePayment, newValue: advancePayment?.toString() || null });
      }
      if (amountReceived !== undefined && !decimalEqual(amountReceived, existingTxn.amountReceived)) {
        changes.push({ field: "amountReceived", oldValue: existingTxn.amountReceived, newValue: amountReceived?.toString() || null });
      }
      if (transportationCharges !== undefined && !decimalEqual(transportationCharges, existingTxn.transportationCharges)) {
        changes.push({ field: "transportationCharges", oldValue: existingTxn.transportationCharges, newValue: transportationCharges?.toString() || null });
      }
      if (otherCharges !== undefined && !decimalEqual(otherCharges, existingTxn.otherCharges)) {
        changes.push({ field: "otherCharges", oldValue: existingTxn.otherCharges, newValue: otherCharges?.toString() || null });
      }
      if (revenue !== undefined && !decimalEqual(revenue, existingTxn.revenue)) {
        changes.push({ field: "revenue", oldValue: existingTxn.revenue, newValue: revenue?.toString() || null });
      }
      
      // Calculate new profit/loss
      const revenueNum = parseFloat(revenue) || 0;
      const transportNum = parseFloat(transportationCharges) || 0;
      const otherNum = parseFloat(otherCharges) || 0;
      const totalCostOfGoods = parseFloat(existingTxn.totalCostOfGoods || "0");
      const newProfitLoss = revenueNum - totalCostOfGoods - transportNum - otherNum;
      
      if (!decimalEqual(newProfitLoss, existingTxn.profitLoss)) {
        changes.push({ field: "profitLoss", oldValue: existingTxn.profitLoss, newValue: newProfitLoss.toString() });
      }
      
      // Update the transaction
      const updatedTxn = await storage.updateTransaction(transactionId, merchantId, {
        partyName: partyName || null,
        partyAddress: partyAddress || null,
        vehicleNumber: vehicleNumber || null,
        advancePayment: advancePayment ? advancePayment.toString() : null,
        amountReceived: amountReceived ? amountReceived.toString() : null,
        transportationCharges: transportationCharges ? transportationCharges.toString() : null,
        otherCharges: otherCharges ? otherCharges.toString() : null,
        revenue: revenue ? revenue.toString() : null,
        profitLoss: newProfitLoss.toString(),
      });
      
      // Record edit history if there are changes
      if (changes.length > 0) {
        await storage.createTransactionEditHistory({
          transactionId,
          merchantId,
          userId,
          changeSet: changes,
        });
      }
      
      res.json(updatedTxn);
    } catch (error) {
      console.error("Error updating transaction:", error);
      res.status(500).json({ message: "Failed to update transaction" });
    }
  });

  // PUT /api/transactions/:id/items - Update transaction items (add/remove/update bags)
  app.put("/api/transactions/:id/items", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const transactionId = parseInt(req.params.id);
      
      const existingTxn = await storage.getTransactionById(transactionId, merchantId);
      if (!existingTxn) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      const { items } = req.body; // Array of { id?, inventoryKey?, bagsMoved, action: 'update'|'add'|'remove' }
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ message: "Items array is required" });
      }
      
      const changes: { field: string; oldValue: string | number | null; newValue: string | number | null }[] = [];
      let newTotalBags = 0;
      let newTotalNetWeight = 0;
      let newTotalCostOfGoods = 0;
      let newTotalRevenue = 0;
      
      // Process item changes
      for (const itemChange of items) {
        if (itemChange.action === 'remove' && itemChange.id) {
          // Remove item - return bags to inventory
          const existingItem = await storage.getTransactionItemById(itemChange.id, merchantId);
          if (existingItem) {
            // Return bags to inventory (positive delta = add back)
            await storage.adjustInventory(existingItem.lotId, existingItem.breakdownId, merchantId, existingItem.bagsMoved);
            await storage.deleteTransactionItem(itemChange.id, merchantId);
            
            changes.push({
              field: `item_S#${existingItem.serialNumber}_${existingItem.size || 'Mixed'}`,
              oldValue: `${existingItem.bagsMoved} bags`,
              newValue: "Removed"
            });
          }
        } else if (itemChange.action === 'update' && itemChange.id) {
          // Update bag count and/or weight
          const existingItem = await storage.getTransactionItemById(itemChange.id, merchantId);
          const existingNetWeight = parseFloat(existingItem?.netWeight || "0");
          const existingRevenue = parseFloat(existingItem?.revenue || "0");
          const hasChanges = existingItem && (
            itemChange.bagsMoved !== existingItem.bagsMoved || 
            (typeof itemChange.netWeight === 'number' && itemChange.netWeight !== existingNetWeight) ||
            (typeof itemChange.revenue === 'number' && itemChange.revenue !== existingRevenue)
          );
          
          if (existingItem && hasChanges) {
            const bagsDelta = existingItem.bagsMoved - itemChange.bagsMoved; // positive = returning bags
            
            // Validate: can't take more than available + current allocation
            if (bagsDelta < 0) {
              // Taking more bags - check availability
              const lot = await storage.getLotById(existingItem.lotId, merchantId);
              let availableBags = 0;
              if (existingItem.breakdownId) {
                const breakdown = await storage.getBagBreakdownById(existingItem.breakdownId, merchantId);
                availableBags = (breakdown?.remainingBags ?? breakdown?.numberOfBags ?? 0);
              } else {
                availableBags = lot?.remainingBags ?? 0;
              }
              if (Math.abs(bagsDelta) > availableBags) {
                return res.status(400).json({ message: `Not enough bags available for S#${existingItem.serialNumber}` });
              }
            }
            
            // Adjust inventory only if bags changed
            if (bagsDelta !== 0) {
              await storage.adjustInventory(existingItem.lotId, existingItem.breakdownId, merchantId, bagsDelta);
            }
            
            // Use provided netWeight if given, otherwise calculate
            const pricePerKg = parseFloat(existingItem.pricePerKgSnapshot || "0");
            const newNetWeight = typeof itemChange.netWeight === 'number' && itemChange.netWeight > 0
              ? itemChange.netWeight
              : (existingItem.bagsMoved > 0 
                  ? parseFloat(existingItem.netWeight || "0") / existingItem.bagsMoved * itemChange.bagsMoved
                  : itemChange.bagsMoved * 50);
            const newCostOfGoods = newNetWeight * pricePerKg;
            
            const itemRevenue = typeof itemChange.revenue === 'number' ? itemChange.revenue : existingRevenue;
            
            await storage.updateTransactionItem(itemChange.id, merchantId, {
              bagsMoved: itemChange.bagsMoved,
              netWeight: newNetWeight.toString(),
              costOfGoods: newCostOfGoods.toString(),
              revenue: itemRevenue.toString()
            });
            
            const changeDetails: string[] = [];
            if (itemChange.bagsMoved !== existingItem.bagsMoved) {
              changeDetails.push(`${existingItem.bagsMoved} → ${itemChange.bagsMoved} bags`);
            }
            if (newNetWeight !== existingNetWeight) {
              changeDetails.push(`${existingNetWeight.toFixed(1)} → ${newNetWeight.toFixed(1)} Kg`);
            }
            
            changes.push({
              field: `item_S#${existingItem.serialNumber}_${existingItem.size || 'Mixed'}`,
              oldValue: `${existingItem.bagsMoved} bags, ${existingNetWeight.toFixed(1)} Kg`,
              newValue: `${itemChange.bagsMoved} bags, ${newNetWeight.toFixed(1)} Kg`
            });
            
            newTotalBags += itemChange.bagsMoved;
            newTotalNetWeight += newNetWeight;
            newTotalCostOfGoods += newCostOfGoods;
            newTotalRevenue += itemRevenue;
          } else if (existingItem) {
            // No change, keep existing values
            newTotalBags += existingItem.bagsMoved;
            newTotalNetWeight += parseFloat(existingItem.netWeight || "0");
            newTotalCostOfGoods += parseFloat(existingItem.costOfGoods || "0");
            newTotalRevenue += parseFloat(existingItem.revenue || "0");
          }
        } else if (itemChange.action === 'add' && itemChange.inventoryKey) {
          // Add new item from inventory
          const [lotIdStr, breakdownPart] = (itemChange.inventoryKey || "").split("-");
          const lotId = parseInt(lotIdStr);
          const breakdownId = breakdownPart === "lot" ? null : parseInt(breakdownPart);
          
          const lot = await storage.getLotById(lotId, merchantId);
          if (!lot) {
            return res.status(400).json({ message: `Lot ${lotId} not found` });
          }
          
          // Get stock entry for serial number
          const entries = await storage.getStockEntriesByMerchant(merchantId);
          const entry = entries.find(e => e.id === lot.stockEntryId);
          
          // Calculate available bags
          let availableBags = 0;
          let pricePerKg = parseFloat(lot.pricePerKg || "0");
          let size = lot.size;
          
          if (breakdownId) {
            const breakdown = await storage.getBagBreakdownById(breakdownId, merchantId);
            availableBags = breakdown?.remainingBags ?? breakdown?.numberOfBags ?? 0;
            pricePerKg = parseFloat(breakdown?.pricePerKg || lot.pricePerKg || "0");
            size = breakdown?.size || null;
          } else {
            availableBags = lot.remainingBags;
          }
          
          if (itemChange.bagsMoved > availableBags) {
            return res.status(400).json({ message: `Not enough bags available (${availableBags})` });
          }
          
          // Deduct from inventory (negative delta = take bags)
          await storage.adjustInventory(lotId, breakdownId, merchantId, -itemChange.bagsMoved);
          
          // Use provided netWeight if given, otherwise calculate with default
          const netWeight = typeof itemChange.netWeight === 'number' && itemChange.netWeight > 0
            ? itemChange.netWeight
            : itemChange.bagsMoved * 50; // Default 50kg per bag
          const costOfGoods = netWeight * pricePerKg;
          
          // Use provided revenue if given, default to 0
          const itemRevenue = typeof itemChange.revenue === 'number' ? itemChange.revenue : 0;
          
          // Create the transaction item
          const newItem = await storage.addTransactionItem({
            transactionId,
            merchantId,
            lotId,
            breakdownId,
            serialNumber: entry?.serialNumber || 0,
            coldStoreName: lot.coldStoreName,
            potatoType: lot.potatoType,
            size,
            bagsMoved: itemChange.bagsMoved,
            netWeight: netWeight.toString(),
            pricePerKgSnapshot: pricePerKg.toString(),
            costOfGoods: costOfGoods.toString(),
            revenue: itemRevenue.toString()
          });
          
          changes.push({
            field: `item_S#${entry?.serialNumber || 0}_${size || 'Mixed'}`,
            oldValue: null,
            newValue: `Added ${itemChange.bagsMoved} bags`
          });
          
          newTotalBags += itemChange.bagsMoved;
          newTotalNetWeight += netWeight;
          newTotalCostOfGoods += costOfGoods;
          newTotalRevenue += itemRevenue;
        } else if (itemChange.action === 'keep' && itemChange.id) {
          // Keep existing item - but check if revenue was updated
          const existingItem = await storage.getTransactionItemById(itemChange.id, merchantId);
          if (existingItem) {
            const existingRevenue = parseFloat(existingItem.revenue || "0");
            const newItemRevenue = typeof itemChange.revenue === 'number' ? itemChange.revenue : existingRevenue;
            
            // Update revenue if changed
            if (typeof itemChange.revenue === 'number' && itemChange.revenue !== existingRevenue) {
              await storage.updateTransactionItem(itemChange.id, merchantId, {
                revenue: newItemRevenue.toString()
              });
              changes.push({
                field: `item_S#${existingItem.serialNumber}_${existingItem.size || 'Mixed'}_revenue`,
                oldValue: `₹${existingRevenue.toFixed(0)}`,
                newValue: `₹${newItemRevenue.toFixed(0)}`
              });
            }
            
            newTotalBags += existingItem.bagsMoved;
            newTotalNetWeight += parseFloat(existingItem.netWeight || "0");
            newTotalCostOfGoods += parseFloat(existingItem.costOfGoods || "0");
            newTotalRevenue += newItemRevenue;
          }
        }
      }
      
      // Recalculate profit/loss using aggregated item revenues
      const transportationCharges = parseFloat(existingTxn.transportationCharges || "0");
      const otherCharges = parseFloat(existingTxn.otherCharges || "0");
      const newProfitLoss = newTotalRevenue - newTotalCostOfGoods - transportationCharges - otherCharges;
      
      // Update transaction totals with aggregated revenue
      await storage.updateTransaction(transactionId, merchantId, {
        totalBags: newTotalBags,
        totalNetWeight: newTotalNetWeight.toString(),
        totalCostOfGoods: newTotalCostOfGoods.toString(),
        revenue: newTotalRevenue.toString(),
        profitLoss: newProfitLoss.toString()
      });
      
      // Record edit history
      if (changes.length > 0) {
        await storage.createTransactionEditHistory({
          transactionId,
          merchantId,
          userId,
          changeSet: changes
        });
      }
      
      // Return updated transaction
      const updatedTxn = await storage.getTransactionById(transactionId, merchantId);
      res.json(updatedTxn);
    } catch (error) {
      console.error("Error updating transaction items:", error);
      res.status(500).json({ message: "Failed to update transaction items" });
    }
  });

  // GET /api/merchants/:id - Get merchant details (for print receipt)
  app.get("/api/merchants/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      // Only allow access to own merchant data
      if (merchantId !== req.user!.merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      res.json(merchant);
    } catch (error) {
      console.error("Error fetching merchant:", error);
      res.status(500).json({ message: "Failed to fetch merchant" });
    }
  });

  // ============== CASH MANAGEMENT ENDPOINTS ==============

  // GET /api/cash/entries - Get all cash entries for merchant
  app.get("/api/cash/entries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const entries = await storage.getCashEntriesByMerchant(merchantId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching cash entries:", error);
      res.status(500).json({ message: "Failed to fetch cash entries" });
    }
  });

  // GET /api/cash/parties - Get parties with outstanding dues
  app.get("/api/cash/parties", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const parties = await storage.getPartiesWithDue(merchantId);
      res.json(parties);
    } catch (error) {
      console.error("Error fetching parties:", error);
      res.status(500).json({ message: "Failed to fetch parties" });
    }
  });

  // GET /api/cash/farmers - Get farmers with outstanding dues
  app.get("/api/cash/farmers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const farmers = await storage.getFarmersWithDue(merchantId);
      res.json(farmers);
    } catch (error) {
      console.error("Error fetching farmers:", error);
      res.status(500).json({ message: "Failed to fetch farmers" });
    }
  });

  // GET /api/cash/cold-stores - Get cold stores with outstanding dues
  app.get("/api/cash/cold-stores", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const coldStores = await storage.getColdStoresWithDue(merchantId);
      res.json(coldStores);
    } catch (error) {
      console.error("Error fetching cold stores:", error);
      res.status(500).json({ message: "Failed to fetch cold stores" });
    }
  });

  // POST /api/cash/entries - Create a cash entry (inward or outflow)
  app.post("/api/cash/entries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { direction, receiptType, expenseType, paymentMode, partyName, partyVillage, farmerName, farmerVillage, coldStoreName, amount, entryDate, remarks } = req.body;

      // Validate required fields
      if (!direction || !["inward", "outflow"].includes(direction)) {
        return res.status(400).json({ message: "Valid direction (inward/outflow) is required" });
      }
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "Valid positive amount is required" });
      }
      if (!entryDate) {
        return res.status(400).json({ message: "Entry date is required" });
      }
      
      // Validate direction-specific fields
      if (direction === "inward") {
        if (!receiptType || !["cash_received", "account_received"].includes(receiptType)) {
          return res.status(400).json({ message: "Valid receipt type is required for inward entries" });
        }
        if (!partyName) {
          return res.status(400).json({ message: "Party name is required for inward entries" });
        }
      } else if (direction === "outflow") {
        if (!expenseType || !["salary", "general_expense", "grading", "hammali", "farmer", "cold_store_charge"].includes(expenseType)) {
          return res.status(400).json({ message: "Valid expense type is required for outflow entries" });
        }
        if (!paymentMode || !["cash", "account_transfer"].includes(paymentMode)) {
          return res.status(400).json({ message: "Valid payment mode is required for outflow entries" });
        }
        if (expenseType === "farmer" && !farmerName) {
          return res.status(400).json({ message: "Farmer name is required when expense type is farmer" });
        }
        if (expenseType === "cold_store_charge" && !coldStoreName) {
          return res.status(400).json({ message: "Cold store name is required when expense type is cold store charge" });
        }
      }

      // Determine if FIFO should be applied
      const applyFIFO = (direction === "inward" && !!partyName) || 
                        (direction === "outflow" && expenseType === "farmer" && !!farmerName) ||
                        (direction === "outflow" && expenseType === "cold_store_charge" && !!coldStoreName);

      // Create the cash entry with FIFO allocation in a single transaction
      const createdEntry = await storage.createCashEntryWithFIFO({
        merchantId,
        direction,
        receiptType: receiptType || null,
        expenseType: expenseType || null,
        paymentMode: paymentMode || null,
        partyName: partyName || null,
        partyVillage: partyVillage || null,
        farmerName: farmerName || null,
        farmerVillage: farmerVillage || null,
        coldStoreName: coldStoreName || null,
        amount: amount.toString(),
        entryDate,
        remarks: remarks || null,
      }, applyFIFO);
      
      res.status(201).json(createdEntry);
    } catch (error) {
      console.error("Error creating cash entry:", error);
      res.status(500).json({ message: "Failed to create cash entry" });
    }
  });

  return httpServer;
}
