import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { stockEntryFormSchema, lotFormSchema, seedStockEntryFormSchema, seedStockEntryUpdateSchema, insertBuyerSchema, type ChangeSet, type ChangeItem, type FieldChange } from "@shared/schema";
import { z } from "zod";
import { formatDateForCode, generateMerchantCode, generateBuyerCode, generateTransactionCode, parseDateToCodeFormat } from "./codeGenerators";

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
      
      // Determine crop from first lot (all lots in an entry should have the same crop)
      const entryCrop = data.lots?.[0]?.crop || "potato";

      // Create stock entry
      const stockEntry = await storage.createStockEntry({
        merchantId,
        crop: entryCrop,
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
          place: lotData.place || "cold_store",
          coldStoreName: lotData.place === "cold_store" ? (lotData.coldStoreName || null) : null,
          coldStoreLotNumber: lotData.place === "cold_store" ? (lotData.coldStoreLotNumber || null) : null,
          crop: lotData.crop || "potato",
          originalBags: lotData.originalBags,
          potatoType: lotData.crop === "potato" ? (lotData.potatoType || null) : null,
          harvestPotatoType: lotData.crop === "potato" ? (lotData.harvestPotatoType || null) : null,
          bagType: lotData.bagType,
          quality: lotData.quality,
          cutType: lotData.cutType,
          size: lotData.cutType === "gate_cut" ? (lotData.size || null) : null,
          pricePerKg: lotData.cutType === "gate_cut" && lotData.pricePerKg 
            ? lotData.pricePerKg.toString() 
            : null,
          totalWeight: lotData.cutType === "gate_cut" && lotData.totalWeight 
            ? lotData.totalWeight.toString() 
            : null,
          charges: lotData.charges && lotData.charges.length > 0 ? lotData.charges : null,
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

      // Validate charges in lots if present using CHARGE_TYPES
      const validChargeTypes = ["Advance", "Bag Charges", "Cold Charges", "Freight Charges", "Grading Charges", "Hammali Charges", "Kata Charges", "Other Charges", "Ware House Charges"];
      if (lots && Array.isArray(lots)) {
        for (const lot of lots) {
          if (lot.charges && Array.isArray(lot.charges)) {
            // Filter out empty charges and validate
            lot.charges = lot.charges.filter((charge: any) => charge.type && charge.type.length > 0);
            for (const charge of lot.charges) {
              // Validate charge type is in allowed list
              if (!validChargeTypes.includes(charge.type)) {
                return res.status(400).json({ 
                  message: `Invalid charge type: ${charge.type}. Allowed types: ${validChargeTypes.join(", ")}` 
                });
              }
              // Validate amount is a positive number
              if (typeof charge.amount !== 'number' || charge.amount <= 0) {
                return res.status(400).json({ 
                  message: `Invalid charge amount: ${charge.type} must have amount greater than 0` 
                });
              }
            }
          }
        }
      }

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
            if (existingLot && lotData.hammaliGradingCharges !== undefined) {
              compareField('hammaliGradingCharges', existingLot.hammaliGradingCharges, lotData.hammaliGradingCharges, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.expectedColdCharges !== undefined) {
              compareField('expectedColdCharges', existingLot.expectedColdCharges, lotData.expectedColdCharges, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.adjustedAmount !== undefined) {
              compareField('adjustedAmount', existingLot.adjustedAmount, lotData.adjustedAmount, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.adjustedAmountType !== undefined) {
              compareField('adjustedAmountType', existingLot.adjustedAmountType, lotData.adjustedAmountType, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.adjustedAmountRemark !== undefined) {
              compareField('adjustedAmountRemark', existingLot.adjustedAmountRemark, lotData.adjustedAmountRemark, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.place !== undefined) {
              compareField('place', existingLot.place, lotData.place, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.crop !== undefined) {
              compareField('crop', existingLot.crop, lotData.crop, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.harvestPotatoType !== undefined) {
              compareField('harvestPotatoType', existingLot.harvestPotatoType, lotData.harvestPotatoType, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.coldStoreLotNumber !== undefined) {
              compareField('coldStoreLotNumber', existingLot.coldStoreLotNumber, lotData.coldStoreLotNumber, lotLabel, 'lot', lotData.id);
            }

            // Update existing lot
            await storage.updateLot(lotData.id, merchantId, {
              remainingBags: lotData.remainingBags,
              coldStoreChargesPerBag: lotData.coldStoreChargesPerBag !== undefined 
                ? (lotData.coldStoreChargesPerBag ? lotData.coldStoreChargesPerBag.toString() : null)
                : undefined,
              hammaliGradingCharges: lotData.hammaliGradingCharges !== undefined
                ? (lotData.hammaliGradingCharges ? lotData.hammaliGradingCharges.toString() : null)
                : undefined,
              expectedColdCharges: lotData.expectedColdCharges !== undefined
                ? (lotData.expectedColdCharges ? lotData.expectedColdCharges.toString() : null)
                : undefined,
              adjustedAmount: lotData.adjustedAmount !== undefined
                ? (lotData.adjustedAmount ? lotData.adjustedAmount.toString() : null)
                : undefined,
              adjustedAmountType: lotData.adjustedAmountType !== undefined
                ? (lotData.adjustedAmountType || null)
                : undefined,
              adjustedAmountRemark: lotData.adjustedAmountRemark !== undefined
                ? (lotData.adjustedAmountRemark || null)
                : undefined,
              place: lotData.place !== undefined
                ? (lotData.place || "cold_store")
                : undefined,
              crop: lotData.crop !== undefined
                ? (lotData.crop || "potato")
                : undefined,
              harvestPotatoType: lotData.harvestPotatoType !== undefined
                ? (lotData.harvestPotatoType || null)
                : undefined,
              coldStoreLotNumber: lotData.coldStoreLotNumber !== undefined
                ? (lotData.coldStoreLotNumber || null)
                : undefined,
              charges: lotData.charges !== undefined
                ? (lotData.charges && lotData.charges.length > 0 ? lotData.charges : null)
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

      // Generate merchant code: MRYYYYMMDD{seq}
      const dateStr = formatDateForCode(new Date());
      const codePrefix = `MR${dateStr}`;
      const existingCount = await storage.countMerchantsByCodePrefix(codePrefix);
      const merchantCode = generateMerchantCode(dateStr, existingCount);

      const merchant = await storage.createMerchant({
        merchantCode,
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

  // GET /api/transactions/transporters - Get unique transporter names for autocomplete
  app.get("/api/transactions/transporters", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const transporters = await storage.getUniqueTransporterNames(merchantId);
      res.json(transporters);
    } catch (error) {
      console.error("Error fetching transporters:", error);
      res.status(500).json({ message: "Failed to fetch transporters" });
    }
  });

  // POST /api/transactions - Create a new transaction (Load a Truck)
  app.post("/api/transactions", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { transporterName, dateOfLoading, partyName, partyAddress, vehicleNumber, buyerId, advancePayment, transportationCharges, otherCharges, revenue, items } = req.body;

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

      // Determine crop from first item's lot
      const firstLot = await storage.getLotById(parsedItems[0].lotId, merchantId);
      const transactionCrop = firstLot?.crop || "potato";

      // Get next transaction number for this crop
      const transactionNumber = await storage.getNextTransactionNumber(merchantId, transactionCrop);

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
          crop: transactionCrop,
          transporterName: transporterName || null,
          dateOfLoading: dateOfLoading || null,
          partyName: partyName || null,
          partyAddress: partyAddress || null,
          vehicleNumber: vehicleNumber || null,
          buyerId: buyerId ? parseInt(buyerId) : null,
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
      // Revenue is now calculated from item-level revenues, so we don't update it directly
      // Calculate new profit/loss using existing transaction revenue (aggregated from items)
      const existingRevenueNum = parseFloat(existingTxn.revenue || "0");
      const transportNum = parseFloat(transportationCharges !== undefined ? transportationCharges : existingTxn.transportationCharges) || 0;
      const otherNum = parseFloat(otherCharges !== undefined ? otherCharges : existingTxn.otherCharges) || 0;
      const totalCostOfGoods = parseFloat(existingTxn.totalCostOfGoods || "0");
      const newProfitLoss = existingRevenueNum - totalCostOfGoods - transportNum - otherNum;
      
      if (!decimalEqual(newProfitLoss, existingTxn.profitLoss)) {
        changes.push({ field: "profitLoss", oldValue: existingTxn.profitLoss, newValue: newProfitLoss.toString() });
      }
      
      // Update the transaction (do NOT update revenue - it's derived from items)
      const updatedTxn = await storage.updateTransaction(transactionId, merchantId, {
        partyName: partyName || null,
        partyAddress: partyAddress || null,
        vehicleNumber: vehicleNumber || null,
        advancePayment: advancePayment ? advancePayment.toString() : null,
        amountReceived: amountReceived ? amountReceived.toString() : null,
        transportationCharges: transportationCharges ? transportationCharges.toString() : null,
        otherCharges: otherCharges ? otherCharges.toString() : null,
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
            coldStoreName: lot.coldStoreName || "",
            potatoType: lot.potatoType || "",
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
  
  // GET /api/farmers/search - Search farmers for autocomplete (from stock entries and seed transactions)
  app.get("/api/farmers/search", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const query = (req.query.q as string) || "";
      const farmers = await storage.searchFarmers(merchantId, query);
      res.json(farmers);
    } catch (error) {
      console.error("Error searching farmers:", error);
      res.status(500).json({ message: "Failed to search farmers" });
    }
  });

  // GET /api/suppliers/search - Search suppliers for autocomplete (from seed stock entries)
  app.get("/api/suppliers/search", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const query = (req.query.q as string) || "";
      const suppliers = await storage.searchSuppliers(merchantId, query);
      res.json(suppliers);
    } catch (error) {
      console.error("Error searching suppliers:", error);
      res.status(500).json({ message: "Failed to search suppliers" });
    }
  });

  // GET /api/cold-stores/search - Search cold stores for autocomplete (from lots and seed lots)
  app.get("/api/cold-stores/search", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const query = (req.query.q as string) || "";
      const coldStores = await storage.searchColdStores(merchantId, query);
      res.json(coldStores);
    } catch (error) {
      console.error("Error searching cold stores:", error);
      res.status(500).json({ message: "Failed to search cold stores" });
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

  // GET /api/cash/seed-farmers - Get seed farmers with outstanding dues from seed transactions
  app.get("/api/cash/seed-farmers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const seedFarmers = await storage.getSeedFarmersWithDue(merchantId);
      res.json(seedFarmers);
    } catch (error) {
      console.error("Error fetching seed farmers:", error);
      res.status(500).json({ message: "Failed to fetch seed farmers" });
    }
  });

  // GET /api/cash/seed-suppliers - Get seed suppliers with outstanding dues from seed stock entries
  app.get("/api/cash/seed-suppliers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const seedSuppliers = await storage.getSeedSuppliersWithDue(merchantId);
      res.json(seedSuppliers);
    } catch (error) {
      console.error("Error fetching seed suppliers:", error);
      res.status(500).json({ message: "Failed to fetch seed suppliers" });
    }
  });

  // GET /api/cash/cross-settlement-check - Check cross-settlement eligibility for a farmer
  app.get("/api/cash/cross-settlement-check", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { farmerName, farmerVillage, farmerContact } = req.query;
      
      if (!farmerName || typeof farmerName !== 'string') {
        return res.status(400).json({ message: "Farmer name is required" });
      }

      const eligibility = await storage.checkCrossSettlementEligibility(
        merchantId,
        farmerName,
        typeof farmerVillage === 'string' ? farmerVillage : null,
        typeof farmerContact === 'string' ? farmerContact : null
      );
      
      res.json(eligibility);
    } catch (error) {
      console.error("Error checking cross-settlement eligibility:", error);
      res.status(500).json({ message: "Failed to check cross-settlement eligibility" });
    }
  });

  // POST /api/cash/entries - Create a cash entry (inward or outflow)
  app.post("/api/cash/entries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const { direction, receiptType, revenueType, expenseType, paymentMode, partyName, partyVillage, farmerName, farmerVillage, coldStoreName, supplierName, amount, entryDate, remarks, crossSettlement } = req.body;

      // Validate required fields
      if (!direction || !["inward", "outflow"].includes(direction)) {
        return res.status(400).json({ message: "Valid direction (inward/outflow) is required" });
      }
      // Amount can be 0 if cross-settlement is provided (the settlement is the main payment)
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }
      if (parsedAmount === 0 && !crossSettlement) {
        return res.status(400).json({ message: "Amount must be greater than 0 when no cross-settlement" });
      }
      if (!entryDate) {
        return res.status(400).json({ message: "Entry date is required" });
      }
      
      // Validate direction-specific fields
      if (direction === "inward") {
        if (!receiptType || !["cash_received", "account_received"].includes(receiptType)) {
          return res.status(400).json({ message: "Valid receipt type is required for inward entries" });
        }
        // Validate revenue type for inward entries
        if (revenueType && !["raw_potato", "seed_sale"].includes(revenueType)) {
          return res.status(400).json({ message: "Valid revenue type is required" });
        }
        // For raw_potato, partyName is required; for seed_sale, farmerName is required
        if (revenueType === "raw_potato" && !partyName) {
          return res.status(400).json({ message: "Party name is required for raw potato entries" });
        }
        if (revenueType === "seed_sale" && !farmerName) {
          return res.status(400).json({ message: "Farmer name is required for seed sale entries" });
        }
        // Fallback for legacy entries without revenueType
        if (!revenueType && !partyName) {
          return res.status(400).json({ message: "Party name is required for inward entries" });
        }
      } else if (direction === "outflow") {
        if (!expenseType || !["salary", "general_expense", "grading", "hammali", "farmer", "cold_store_charge", "supplier"].includes(expenseType)) {
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
        if (expenseType === "supplier" && !supplierName) {
          return res.status(400).json({ message: "Supplier name is required when expense type is supplier" });
        }
      }

      // Validate cross-settlement if provided
      let validatedCrossSettlement: {
        settledAmount: number;
        direction: 'raw_to_seed' | 'seed_to_raw';
        seedTransactionIds: number[];
        rawPotatoEntryIds: number[];
      } | undefined;
      
      if (crossSettlement) {
        const { settledAmount, direction: settlementDirection, seedTransactionIds, rawPotatoEntryIds } = crossSettlement;
        if (typeof settledAmount !== 'number' || settledAmount <= 0) {
          return res.status(400).json({ message: "Cross-settlement amount must be a positive number" });
        }
        if (!['raw_to_seed', 'seed_to_raw'].includes(settlementDirection)) {
          return res.status(400).json({ message: "Invalid cross-settlement direction" });
        }
        validatedCrossSettlement = {
          settledAmount,
          direction: settlementDirection,
          seedTransactionIds: seedTransactionIds || [],
          rawPotatoEntryIds: rawPotatoEntryIds || [],
        };
      }

      // Determine if FIFO should be applied
      const applyFIFO = (direction === "inward" && !!partyName) || 
                        (direction === "inward" && revenueType === "seed_sale" && !!farmerName) ||
                        (direction === "outflow" && expenseType === "farmer" && !!farmerName) ||
                        (direction === "outflow" && expenseType === "cold_store_charge" && !!coldStoreName);

      // Generate transaction code: TXYYYYMMDD{seq} - unique per merchant
      const txDateStr = parseDateToCodeFormat(entryDate);
      const txCodePrefix = `TX${txDateStr}`;
      const existingTxCount = await storage.countCashEntriesByCodePrefix(merchantId, txCodePrefix);
      const transactionCode = generateTransactionCode(txDateStr, existingTxCount);

      // Create the cash entry with FIFO allocation and optional cross-settlement
      const createdEntry = await storage.createCashEntryWithCrossSettlement({
        merchantId,
        transactionCode,
        direction,
        receiptType: receiptType || null,
        revenueType: revenueType || null,
        expenseType: expenseType || null,
        paymentMode: paymentMode || null,
        partyName: partyName || null,
        partyVillage: partyVillage || null,
        farmerName: farmerName || null,
        farmerVillage: farmerVillage || null,
        coldStoreName: coldStoreName || null,
        supplierName: supplierName || null,
        amount: amount.toString(),
        entryDate,
        remarks: remarks || null,
      }, applyFIFO, validatedCrossSettlement, userId);
      
      res.status(201).json(createdEntry);
    } catch (error) {
      console.error("Error creating cash entry:", error);
      res.status(500).json({ message: "Failed to create cash entry" });
    }
  });

  // POST /api/cash/entries/:id/reverse - Reverse a cash entry (soft delete with undo)
  app.post("/api/cash/entries/:id/reverse", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const cashEntryId = parseInt(req.params.id);
      
      if (isNaN(cashEntryId)) {
        return res.status(400).json({ message: "Invalid cash entry ID" });
      }
      
      const reversedEntry = await storage.reverseCashEntry(cashEntryId, merchantId);
      res.json(reversedEntry);
    } catch (error: any) {
      console.error("Error reversing cash entry:", error);
      if (error.message === "Cash entry not found") {
        return res.status(404).json({ message: "Cash entry not found" });
      }
      if (error.message === "Cash entry is already reversed") {
        return res.status(400).json({ message: "Cash entry is already reversed" });
      }
      res.status(500).json({ message: "Failed to reverse cash entry" });
    }
  });

  // Cash Settings Routes
  app.get("/api/cash/settings/:year", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const financialYear = req.params.year;
      const settings = await storage.getCashSettings(merchantId, financialYear);
      res.json(settings || { financialYear, openingCashInHand: "0", openingCashInAccount: "0" });
    } catch (error) {
      console.error("Error fetching cash settings:", error);
      res.status(500).json({ message: "Failed to fetch cash settings" });
    }
  });

  app.post("/api/cash/settings", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { financialYear, openingCashInHand, openingCashInAccount } = req.body;
      
      if (!financialYear) {
        return res.status(400).json({ message: "Financial year is required" });
      }

      const settings = await storage.upsertCashSettings(merchantId, financialYear, {
        openingCashInHand: openingCashInHand?.toString() || "0",
        openingCashInAccount: openingCashInAccount?.toString() || "0",
      });
      res.json(settings);
    } catch (error) {
      console.error("Error saving cash settings:", error);
      res.status(500).json({ message: "Failed to save cash settings" });
    }
  });

  // Managed Parties Routes (for settings)
  app.get("/api/cash/managed-parties", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const parties = await storage.getPartiesByMerchant(merchantId);
      res.json(parties);
    } catch (error) {
      console.error("Error fetching managed parties:", error);
      res.status(500).json({ message: "Failed to fetch managed parties" });
    }
  });

  app.post("/api/cash/managed-parties", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { name, contactNumber, address, pendingDues } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Party name is required" });
      }

      const party = await storage.createParty({
        merchantId,
        name,
        contactNumber: contactNumber || null,
        address: address || null,
        pendingDues: pendingDues?.toString() || "0",
      });
      res.status(201).json(party);
    } catch (error) {
      console.error("Error creating party:", error);
      res.status(500).json({ message: "Failed to create party" });
    }
  });

  app.patch("/api/cash/managed-parties/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const { name, contactNumber, address, pendingDues } = req.body;

      const party = await storage.updateParty(id, merchantId, {
        ...(name && { name }),
        ...(contactNumber !== undefined && { contactNumber }),
        ...(address !== undefined && { address }),
        ...(pendingDues !== undefined && { pendingDues: pendingDues?.toString() }),
      });
      
      if (!party) {
        return res.status(404).json({ message: "Party not found" });
      }
      res.json(party);
    } catch (error) {
      console.error("Error updating party:", error);
      res.status(500).json({ message: "Failed to update party" });
    }
  });

  app.delete("/api/cash/managed-parties/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      await storage.deleteParty(id, merchantId);
      res.json({ message: "Party deleted successfully" });
    } catch (error) {
      console.error("Error deleting party:", error);
      res.status(500).json({ message: "Failed to delete party" });
    }
  });

  // Managed Cash Farmers Routes (for settings)
  app.get("/api/cash/managed-farmers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const farmers = await storage.getCashFarmersByMerchant(merchantId);
      res.json(farmers);
    } catch (error) {
      console.error("Error fetching managed farmers:", error);
      res.status(500).json({ message: "Failed to fetch managed farmers" });
    }
  });

  app.post("/api/cash/managed-farmers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { name, contactNumber, address, pendingDueToBePaid } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Farmer name is required" });
      }

      const farmer = await storage.createCashFarmer({
        merchantId,
        name,
        contactNumber: contactNumber || null,
        address: address || null,
        pendingDueToBePaid: pendingDueToBePaid?.toString() || "0",
      });
      res.status(201).json(farmer);
    } catch (error) {
      console.error("Error creating farmer:", error);
      res.status(500).json({ message: "Failed to create farmer" });
    }
  });

  app.patch("/api/cash/managed-farmers/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const { name, contactNumber, address, pendingDueToBePaid } = req.body;

      const farmer = await storage.updateCashFarmer(id, merchantId, {
        ...(name && { name }),
        ...(contactNumber !== undefined && { contactNumber }),
        ...(address !== undefined && { address }),
        ...(pendingDueToBePaid !== undefined && { pendingDueToBePaid: pendingDueToBePaid?.toString() }),
      });
      
      if (!farmer) {
        return res.status(404).json({ message: "Farmer not found" });
      }
      res.json(farmer);
    } catch (error) {
      console.error("Error updating farmer:", error);
      res.status(500).json({ message: "Failed to update farmer" });
    }
  });

  app.delete("/api/cash/managed-farmers/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      await storage.deleteCashFarmer(id, merchantId);
      res.json({ message: "Farmer deleted successfully" });
    } catch (error) {
      console.error("Error deleting farmer:", error);
      res.status(500).json({ message: "Failed to delete farmer" });
    }
  });

  // ===================== BUYER MANAGEMENT ROUTES =====================

  // GET /api/buyers - Get all buyers for the authenticated merchant
  app.get("/api/buyers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const buyerList = await storage.getBuyersByMerchant(merchantId);
      res.json(buyerList);
    } catch (error) {
      console.error("Error fetching buyers:", error);
      res.status(500).json({ message: "Failed to fetch buyers" });
    }
  });

  // POST /api/buyers - Create a new buyer
  app.post("/api/buyers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      
      const validationResult = insertBuyerSchema.omit({ merchantId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const { dateAdded, name, address, mandiCode, contact, negativeFlag, isActive } = validationResult.data;

      // Generate buyer code: BYYYYYMMDD{seq} - unique per merchant
      const effectiveDateAdded = dateAdded || new Date().toISOString().split('T')[0];
      const dateStr = parseDateToCodeFormat(effectiveDateAdded);
      const codePrefix = `BY${dateStr}`;
      const existingCount = await storage.countBuyersByCodePrefix(merchantId, codePrefix);
      const buyerCode = generateBuyerCode(dateStr, existingCount);

      const buyer = await storage.createBuyer({
        merchantId,
        buyerCode,
        dateAdded: effectiveDateAdded,
        name,
        address,
        mandiCode: mandiCode || null,
        contact: contact || null,
        negativeFlag: negativeFlag ?? false,
        isActive: isActive ?? true,
      });
      res.status(201).json(buyer);
    } catch (error) {
      console.error("Error creating buyer:", error);
      res.status(500).json({ message: "Failed to create buyer" });
    }
  });

  // PATCH /api/buyers/:id - Update a buyer
  const updateBuyerSchema = insertBuyerSchema.omit({ merchantId: true }).partial();
  
  app.patch("/api/buyers/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      
      const validationResult = updateBuyerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const { dateAdded, name, address, mandiCode, contact, negativeFlag, isActive } = validationResult.data;

      const buyer = await storage.updateBuyer(id, merchantId, {
        ...(dateAdded !== undefined && { dateAdded }),
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address }),
        ...(mandiCode !== undefined && { mandiCode }),
        ...(contact !== undefined && { contact }),
        ...(negativeFlag !== undefined && { negativeFlag }),
        ...(isActive !== undefined && { isActive }),
      });
      
      if (!buyer) {
        return res.status(404).json({ message: "Buyer not found" });
      }
      res.json(buyer);
    } catch (error) {
      console.error("Error updating buyer:", error);
      res.status(500).json({ message: "Failed to update buyer" });
    }
  });

  // DELETE /api/buyers/:id - Delete a buyer
  app.delete("/api/buyers/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      await storage.deleteBuyer(id, merchantId);
      res.json({ message: "Buyer deleted successfully" });
    } catch (error) {
      console.error("Error deleting buyer:", error);
      res.status(500).json({ message: "Failed to delete buyer" });
    }
  });

  // ===================== BANK ACCOUNT ROUTES =====================

  // GET /api/bank-accounts - Get all bank accounts for the authenticated merchant
  app.get("/api/bank-accounts", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const accountList = await storage.getBankAccountsByMerchant(merchantId);
      res.json(accountList);
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      res.status(500).json({ message: "Failed to fetch bank accounts" });
    }
  });

  // POST /api/bank-accounts - Create a new bank account
  app.post("/api/bank-accounts", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { name, accountType, openingBalance } = req.body;
      
      if (!name || !accountType) {
        return res.status(400).json({ message: "Name and account type are required" });
      }
      
      const account = await storage.createBankAccount({
        merchantId,
        name,
        accountType,
        openingBalance: openingBalance || "0",
        isActive: true
      });
      
      res.status(201).json(account);
    } catch (error) {
      console.error("Error creating bank account:", error);
      res.status(500).json({ message: "Failed to create bank account" });
    }
  });

  // PATCH /api/bank-accounts/:id - Update a bank account
  app.patch("/api/bank-accounts/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const { name, accountType, openingBalance, isActive } = req.body;
      
      const updated = await storage.updateBankAccount(id, merchantId, {
        name,
        accountType,
        openingBalance,
        isActive
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Bank account not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating bank account:", error);
      res.status(500).json({ message: "Failed to update bank account" });
    }
  });

  // DELETE /api/bank-accounts/:id - Delete a bank account
  app.delete("/api/bank-accounts/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      await storage.deleteBankAccount(id, merchantId);
      res.json({ message: "Bank account deleted successfully" });
    } catch (error) {
      console.error("Error deleting bank account:", error);
      res.status(500).json({ message: "Failed to delete bank account" });
    }
  });

  // ===================== SEED STOCK ENTRY ROUTES =====================

  // GET /api/seed-stock-entries - Get all seed stock entries for the authenticated merchant
  app.get("/api/seed-stock-entries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const entries = await storage.getSeedEntriesByMerchant(merchantId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching seed stock entries:", error);
      res.status(500).json({ message: "Failed to fetch seed stock entries" });
    }
  });

  // GET /api/seed-stock-entries/:id - Get a specific seed stock entry
  app.get("/api/seed-stock-entries/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      
      const entry = await storage.getSeedEntryById(id, merchantId);
      if (!entry) {
        return res.status(404).json({ message: "Seed stock entry not found" });
      }
      
      res.json(entry);
    } catch (error) {
      console.error("Error fetching seed stock entry:", error);
      res.status(500).json({ message: "Failed to fetch seed stock entry" });
    }
  });

  // POST /api/seed-stock-entries - Create a new seed stock entry
  app.post("/api/seed-stock-entries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const validationResult = seedStockEntryFormSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }

      const data = validationResult.data;

      // Create seed stock entry
      const seedEntry = await storage.createSeedEntry({
        merchantId,
        purchaseDate: data.purchaseDate,
        supplierName: data.supplierName,
        supplierContact: data.supplierContact || null,
        address: data.address || null,
        district: data.district,
        state: data.state,
        remarks: data.remarks || null,
        paymentStatus: "due",
      });

      // Create seed lots
      for (const lotData of data.seedLots) {
        await storage.createSeedLot({
          seedEntryId: seedEntry.id,
          merchantId,
          coldStoreName: lotData.coldStoreName,
          originalBags: lotData.originalBags,
          potatoType: lotData.potatoType,
          bagType: lotData.bagType,
          size: lotData.size,
          pricePerBag: lotData.pricePerBag.toString(),
          coldStoreChargesPerBag: lotData.coldStoreChargesPerBag 
            ? lotData.coldStoreChargesPerBag.toString() 
            : null,
          remainingBags: lotData.originalBags,
          remarks: lotData.remarks || null,
        });
      }

      // Fetch the complete entry with lots
      const completeEntry = await storage.getSeedEntryById(seedEntry.id, merchantId);
      res.status(201).json(completeEntry);
    } catch (error) {
      console.error("Error creating seed stock entry:", error);
      res.status(500).json({ message: "Failed to create seed stock entry" });
    }
  });

  // PATCH /api/seed-stock-entries/:id - Update a seed stock entry
  app.patch("/api/seed-stock-entries/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const id = parseInt(req.params.id);
      
      // Validate request body
      const validatedData = seedStockEntryUpdateSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ message: "Invalid data", errors: validatedData.error.errors });
      }
      
      const { paymentStatus, amountPaid, remarks, seedLots } = validatedData.data;

      // Check if entry exists and belongs to merchant
      const existingEntry = await storage.getSeedEntryById(id, merchantId);
      if (!existingEntry) {
        return res.status(404).json({ message: "Seed stock entry not found" });
      }

      // Helper to normalize values for comparison (handles decimal strings like "20.00" vs 20)
      const normalizeNum = (val: any): string | null => {
        if (val === null || val === undefined || val === '') return null;
        const num = Number(val);
        if (!isNaN(num)) return String(num);
        return String(val);
      };

      // Track changes for edit history
      const changeSet: ChangeSet = [];

      // Track entry-level changes
      const entryChanges: FieldChange[] = [];
      const entryUpdates: Partial<{ paymentStatus: string; amountPaid: string; remarks: string }> = {};
      
      if (paymentStatus !== undefined && paymentStatus !== existingEntry.paymentStatus) {
        entryChanges.push({ field: "Payment Status", oldValue: existingEntry.paymentStatus || "due", newValue: paymentStatus });
        entryUpdates.paymentStatus = paymentStatus;
      }
      if (amountPaid !== undefined && normalizeNum(amountPaid) !== normalizeNum(existingEntry.amountPaid)) {
        entryChanges.push({ field: "Amount Paid", oldValue: normalizeNum(existingEntry.amountPaid) || "0", newValue: normalizeNum(amountPaid) || "0" });
        entryUpdates.amountPaid = amountPaid.toString();
      }
      if (remarks !== undefined && remarks !== existingEntry.remarks) {
        entryChanges.push({ field: "Remarks", oldValue: existingEntry.remarks || "", newValue: remarks });
        entryUpdates.remarks = remarks;
      }

      if (entryChanges.length > 0) {
        changeSet.push({ scope: "entry", entityId: id, label: "Entry", changes: entryChanges });
      }

      if (Object.keys(entryUpdates).length > 0) {
        await storage.updateSeedEntry(id, merchantId, entryUpdates);
      }

      // Update lots if provided and track changes
      if (seedLots && Array.isArray(seedLots)) {
        for (const lotData of seedLots) {
          if (lotData.id) {
            // Find existing lot to compare changes
            const existingLot = existingEntry.seedLots.find(l => l.id === lotData.id);
            const lotChanges: FieldChange[] = [];
            
            if (existingLot) {
              // Track field changes with proper normalization
              if (lotData.coldStoreName !== undefined && lotData.coldStoreName !== existingLot.coldStoreName) {
                lotChanges.push({ field: "Cold Store", oldValue: existingLot.coldStoreName, newValue: lotData.coldStoreName });
              }
              if (lotData.originalBags !== undefined && lotData.originalBags !== existingLot.originalBags) {
                lotChanges.push({ field: "Original Bags", oldValue: existingLot.originalBags, newValue: lotData.originalBags });
              }
              if (lotData.remainingBags !== undefined && lotData.remainingBags !== existingLot.remainingBags) {
                lotChanges.push({ field: "Remaining Bags", oldValue: existingLot.remainingBags, newValue: lotData.remainingBags });
              }
              if (lotData.potatoType !== undefined && lotData.potatoType !== existingLot.potatoType) {
                lotChanges.push({ field: "Potato Type", oldValue: existingLot.potatoType, newValue: lotData.potatoType });
              }
              if (lotData.bagType !== undefined && lotData.bagType !== existingLot.bagType) {
                lotChanges.push({ field: "Bag Type", oldValue: existingLot.bagType, newValue: lotData.bagType });
              }
              if (lotData.size !== undefined && lotData.size !== existingLot.size) {
                lotChanges.push({ field: "Size", oldValue: existingLot.size, newValue: lotData.size });
              }
              if (lotData.pricePerBag !== undefined && normalizeNum(lotData.pricePerBag) !== normalizeNum(existingLot.pricePerBag)) {
                lotChanges.push({ field: "Price/Bag", oldValue: normalizeNum(existingLot.pricePerBag), newValue: normalizeNum(lotData.pricePerBag) });
              }
              if (lotData.coldStoreChargesPerBag !== undefined && normalizeNum(lotData.coldStoreChargesPerBag) !== normalizeNum(existingLot.coldStoreChargesPerBag)) {
                lotChanges.push({ field: "Cold Charges/Bag", oldValue: normalizeNum(existingLot.coldStoreChargesPerBag) || "0", newValue: normalizeNum(lotData.coldStoreChargesPerBag) || "0" });
              }
              if (lotData.coldStoreChargesPaid !== undefined && normalizeNum(lotData.coldStoreChargesPaid) !== normalizeNum(existingLot.coldStoreChargesPaid)) {
                lotChanges.push({ field: "Cold Charges Paid", oldValue: normalizeNum(existingLot.coldStoreChargesPaid) || "0", newValue: normalizeNum(lotData.coldStoreChargesPaid) || "0" });
              }
              if (lotData.hammaliCharges !== undefined && normalizeNum(lotData.hammaliCharges) !== normalizeNum(existingLot.hammaliCharges)) {
                lotChanges.push({ field: "Hammali Charges", oldValue: normalizeNum(existingLot.hammaliCharges) || "0", newValue: normalizeNum(lotData.hammaliCharges) || "0" });
              }
              if (lotData.gradingCharges !== undefined && normalizeNum(lotData.gradingCharges) !== normalizeNum(existingLot.gradingCharges)) {
                lotChanges.push({ field: "Grading Charges", oldValue: normalizeNum(existingLot.gradingCharges) || "0", newValue: normalizeNum(lotData.gradingCharges) || "0" });
              }
              if (lotData.transportCharges !== undefined && normalizeNum(lotData.transportCharges) !== normalizeNum(existingLot.transportCharges)) {
                lotChanges.push({ field: "Transport Charges", oldValue: normalizeNum(existingLot.transportCharges) || "0", newValue: normalizeNum(lotData.transportCharges) || "0" });
              }
              if (lotData.remarks !== undefined && lotData.remarks !== existingLot.remarks) {
                lotChanges.push({ field: "Remarks", oldValue: existingLot.remarks || "", newValue: lotData.remarks || "" });
              }

              if (lotChanges.length > 0) {
                changeSet.push({ 
                  scope: "lot", 
                  entityId: lotData.id, 
                  label: `${existingLot.coldStoreName} (${existingLot.potatoType})`, 
                  changes: lotChanges 
                });
              }
            }

            // Update existing lot
            await storage.updateSeedLot(lotData.id, merchantId, {
              coldStoreName: lotData.coldStoreName,
              originalBags: lotData.originalBags,
              potatoType: lotData.potatoType,
              bagType: lotData.bagType,
              size: lotData.size,
              pricePerBag: lotData.pricePerBag?.toString(),
              coldStoreChargesPerBag: lotData.coldStoreChargesPerBag?.toString() || null,
              coldStoreChargesPaid: lotData.coldStoreChargesPaid?.toString() || "0",
              hammaliCharges: lotData.hammaliCharges?.toString() || null,
              gradingCharges: lotData.gradingCharges?.toString() || null,
              transportCharges: lotData.transportCharges?.toString() || null,
              remainingBags: lotData.remainingBags ?? lotData.originalBags,
              remarks: lotData.remarks || null,
            });
          } else if (lotData.coldStoreName && lotData.originalBags && lotData.potatoType && lotData.bagType && lotData.size && lotData.pricePerBag !== undefined) {
            // Create new lot - track as structural change
            changeSet.push({
              scope: "lot",
              entityId: 0,
              label: `New Lot: ${lotData.coldStoreName} (${lotData.potatoType})`,
              changes: [{ field: "Added", oldValue: null, newValue: `${lotData.originalBags} bags` }]
            });

            await storage.createSeedLot({
              seedEntryId: id,
              merchantId,
              coldStoreName: lotData.coldStoreName,
              originalBags: lotData.originalBags,
              potatoType: lotData.potatoType,
              bagType: lotData.bagType,
              size: lotData.size,
              pricePerBag: lotData.pricePerBag.toString(),
              coldStoreChargesPerBag: lotData.coldStoreChargesPerBag?.toString() || null,
              coldStoreChargesPaid: lotData.coldStoreChargesPaid?.toString() || "0",
              hammaliCharges: lotData.hammaliCharges?.toString() || null,
              gradingCharges: lotData.gradingCharges?.toString() || null,
              transportCharges: lotData.transportCharges?.toString() || null,
              remainingBags: lotData.originalBags,
              remarks: lotData.remarks || null,
            });
          }
        }
      }

      // Save edit history if there were changes
      if (changeSet.length > 0) {
        await storage.createSeedEditHistory(id, merchantId, userId, changeSet);
      }

      // Fetch and return the updated entry
      const updatedEntry = await storage.getSeedEntryById(id, merchantId);
      res.json(updatedEntry);
    } catch (error) {
      console.error("Error updating seed stock entry:", error);
      res.status(500).json({ message: "Failed to update seed stock entry" });
    }
  });

  // GET /api/seed-stock-entries/:id/edit-history - Get edit history for a seed stock entry
  app.get("/api/seed-stock-entries/:id/edit-history", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      
      const history = await storage.getSeedEditHistory(id, merchantId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching seed edit history:", error);
      res.status(500).json({ message: "Failed to fetch edit history" });
    }
  });

  // DELETE /api/seed-stock-entries/:id/lots/:lotId - Delete a seed lot
  app.delete("/api/seed-stock-entries/:id/lots/:lotId", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const lotId = parseInt(req.params.lotId);
      
      await storage.deleteSeedLot(lotId, merchantId);
      res.json({ message: "Seed lot deleted successfully" });
    } catch (error) {
      console.error("Error deleting seed lot:", error);
      res.status(500).json({ message: "Failed to delete seed lot" });
    }
  });

  // ===================== SEED TRANSACTION ROUTES =====================

  // GET /api/seed-transactions - Get all seed transactions for the authenticated merchant
  app.get("/api/seed-transactions", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const transactions = await storage.getSeedTransactionsByMerchant(merchantId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching seed transactions:", error);
      res.status(500).json({ message: "Failed to fetch seed transactions" });
    }
  });

  // GET /api/seed-transactions/unsold-inventory - Get unsold seed inventory
  app.get("/api/seed-transactions/unsold-inventory", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const inventory = await storage.getUnsoldSeedInventory(merchantId);
      res.json(inventory);
    } catch (error) {
      console.error("Error fetching unsold seed inventory:", error);
      res.status(500).json({ message: "Failed to fetch unsold seed inventory" });
    }
  });

  // GET /api/seed-transactions/:id - Get a single seed transaction by ID
  app.get("/api/seed-transactions/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const transaction = await storage.getSeedTransactionById(id, merchantId);
      if (!transaction) {
        return res.status(404).json({ message: "Seed transaction not found" });
      }
      res.json(transaction);
    } catch (error) {
      console.error("Error fetching seed transaction:", error);
      res.status(500).json({ message: "Failed to fetch seed transaction" });
    }
  });

  // GET /api/seed-transactions/:id/edit-history - Get edit history for a seed transaction
  app.get("/api/seed-transactions/:id/edit-history", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const history = await storage.getSeedTransactionEditHistory(id, merchantId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching seed transaction edit history:", error);
      res.status(500).json({ message: "Failed to fetch edit history" });
    }
  });

  // PATCH /api/seed-transactions/:id - Update a seed transaction
  app.patch("/api/seed-transactions/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const id = parseInt(req.params.id);
      const { farmerName, farmerContact, village, tehsil, district, state, vehicleNumber, transportCharges, otherCharges, otherChargesRemarks, items } = req.body;

      if (!farmerName || !district || !state || !items || items.length === 0) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Get existing transaction for change tracking
      const existingTxn = await storage.getSeedTransactionById(id, merchantId);
      if (!existingTxn) {
        return res.status(404).json({ message: "Seed transaction not found" });
      }

      // Calculate totals
      let totalBags = 0;
      let totalCost = 0;
      let totalRevenue = 0;

      const processedItems = [];
      for (const item of items) {
        const seedLot = await storage.getSeedLotById(item.seedLotId, merchantId);
        if (!seedLot) {
          return res.status(400).json({ message: `Seed lot ${item.seedLotId} not found` });
        }

        // Get parent entry for serial number
        const entry = await storage.getSeedEntryById(seedLot.seedEntryId, merchantId);
        const serialNumber = entry?.serialNumber || 0;
        
        const costPerBag = parseFloat(seedLot.pricePerBag) || 0;
        const pricePerBag = item.pricePerBag || 0;
        const bags = item.bagsMoved;
        const cost = bags * costPerBag;
        const revenue = bags * pricePerBag;
        const profitLoss = revenue - cost;

        totalBags += bags;
        totalCost += cost;
        totalRevenue += revenue;

        processedItems.push({
          merchantId,
          seedLotId: item.seedLotId,
          serialNumber,
          coldStoreName: seedLot.coldStoreName,
          potatoType: seedLot.potatoType,
          size: seedLot.size,
          bagType: seedLot.bagType,
          bagsMoved: bags,
          pricePerBag: pricePerBag.toString(),
          costPerBag: costPerBag.toString(),
          revenue: revenue.toString(),
          cost: cost.toString(),
          profitLoss: profitLoss.toString(),
        });
      }

      const totalProfitLoss = totalRevenue - totalCost;
      const transportTotal = parseFloat(transportCharges) || 0;
      const otherTotal = parseFloat(otherCharges) || 0;
      const totalDueToFarmer = totalRevenue + transportTotal + otherTotal;

      const transaction = await storage.updateSeedTransaction(
        id,
        merchantId,
        {
          farmerName,
          farmerContact: farmerContact || null,
          village: village || null,
          tehsil: tehsil || null,
          district,
          state,
          vehicleNumber: vehicleNumber || null,
          transportCharges: transportTotal.toString(),
          otherCharges: otherTotal.toString(),
          otherChargesRemarks: otherChargesRemarks || null,
          totalBags,
          totalCost: totalCost.toString(),
          totalRevenue: totalRevenue.toString(),
          totalProfitLoss: totalProfitLoss.toString(),
          totalDueToFarmer: totalDueToFarmer.toString(),
        },
        processedItems
      );

      if (!transaction) {
        return res.status(404).json({ message: "Seed transaction not found" });
      }

      // Track changes for edit history
      const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
      
      // Helper to normalize values for comparison (handles decimal string vs number)
      const normalizeValue = (val: any): string => {
        if (val === null || val === undefined || val === '') return '';
        const num = parseFloat(String(val));
        return isNaN(num) ? String(val).trim() : num.toString();
      };
      
      // Compare text fields
      const textFieldsToTrack = [
        { key: 'farmerName', label: 'Farmer Name' },
        { key: 'farmerContact', label: 'Farmer Contact' },
        { key: 'village', label: 'Village' },
        { key: 'tehsil', label: 'Tehsil' },
        { key: 'district', label: 'District' },
        { key: 'state', label: 'State' },
        { key: 'vehicleNumber', label: 'Vehicle Number' },
        { key: 'otherChargesRemarks', label: 'Other Charges Remarks' },
      ];

      for (const { key, label } of textFieldsToTrack) {
        const oldVal = existingTxn[key as keyof typeof existingTxn];
        const newVal = transaction[key as keyof typeof transaction];
        if (String(oldVal || '').trim() !== String(newVal || '').trim()) {
          changes.push({ field: label, oldValue: oldVal || null, newValue: newVal || null });
        }
      }

      // Compare numeric fields with normalization
      const numericFieldsToTrack = [
        { key: 'transportCharges', label: 'Transport Charges' },
        { key: 'otherCharges', label: 'Other Charges' },
        { key: 'totalBags', label: 'Total Bags' },
        { key: 'totalCost', label: 'Total Cost' },
        { key: 'totalRevenue', label: 'Total Revenue' },
        { key: 'totalProfitLoss', label: 'Profit/Loss' },
        { key: 'totalDueToFarmer', label: 'Total Due' },
      ];

      for (const { key, label } of numericFieldsToTrack) {
        const oldVal = existingTxn[key as keyof typeof existingTxn];
        const newVal = transaction[key as keyof typeof transaction];
        if (normalizeValue(oldVal) !== normalizeValue(newVal)) {
          const formattedOld = oldVal !== null ? `₹${parseFloat(String(oldVal)).toLocaleString('en-IN')}` : null;
          const formattedNew = newVal !== null ? `₹${parseFloat(String(newVal)).toLocaleString('en-IN')}` : null;
          changes.push({ field: label, oldValue: formattedOld, newValue: formattedNew });
        }
      }

      // Track item changes
      const oldItemsMap = new Map(existingTxn.items.map((i: any) => [i.seedLotId, i]));
      const newItemsMap = new Map(transaction.items.map((i: any) => [i.seedLotId, i]));

      // Check for removed items
      for (const oldItem of existingTxn.items) {
        if (!newItemsMap.has(oldItem.seedLotId)) {
          changes.push({ 
            field: `Lot S#${oldItem.serialNumber}`, 
            oldValue: `${oldItem.bagsMoved} bags @ ₹${parseFloat(oldItem.pricePerBag).toLocaleString('en-IN')}`, 
            newValue: 'Removed' 
          });
        }
      }

      // Check for added/modified items
      for (const newItem of transaction.items) {
        const oldItem = oldItemsMap.get(newItem.seedLotId);
        if (!oldItem) {
          changes.push({ 
            field: `Lot S#${newItem.serialNumber}`, 
            oldValue: 'Not included', 
            newValue: `${newItem.bagsMoved} bags @ ₹${parseFloat(newItem.pricePerBag).toLocaleString('en-IN')}` 
          });
        } else if (
          oldItem.bagsMoved !== newItem.bagsMoved || 
          normalizeValue(oldItem.pricePerBag) !== normalizeValue(newItem.pricePerBag)
        ) {
          changes.push({ 
            field: `Lot S#${newItem.serialNumber}`, 
            oldValue: `${oldItem.bagsMoved} bags @ ₹${parseFloat(oldItem.pricePerBag).toLocaleString('en-IN')}`, 
            newValue: `${newItem.bagsMoved} bags @ ₹${parseFloat(newItem.pricePerBag).toLocaleString('en-IN')}` 
          });
        }
      }

      // Save edit history if there are changes
      if (changes.length > 0) {
        await storage.createSeedTransactionEditHistory({
          seedTransactionId: id,
          merchantId,
          userId,
          changeSet: changes,
        });
      }

      res.json(transaction);
    } catch (error) {
      console.error("Error updating seed transaction:", error);
      res.status(500).json({ message: "Failed to update seed transaction" });
    }
  });

  // POST /api/seed-transactions - Create a new seed transaction
  app.post("/api/seed-transactions", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { farmerName, farmerContact, village, tehsil, district, state, vehicleNumber, transportCharges, otherCharges, otherChargesRemarks, items } = req.body;

      if (!farmerName || !district || !state || !items || items.length === 0) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Calculate totals
      let totalBags = 0;
      let totalCost = 0;
      let totalRevenue = 0;

      const processedItems = [];
      for (const item of items) {
        const seedLot = await storage.getSeedLotById(item.seedLotId, merchantId);
        if (!seedLot) {
          return res.status(400).json({ message: `Seed lot ${item.seedLotId} not found` });
        }
        
        if (seedLot.remainingBags < item.bagsMoved) {
          return res.status(400).json({ message: `Not enough bags in seed lot ${item.seedLotId}. Available: ${seedLot.remainingBags}` });
        }

        // Get parent entry for serial number
        const entry = await storage.getSeedEntryById(seedLot.seedEntryId, merchantId);
        const serialNumber = entry?.serialNumber || 0;
        
        const costPerBag = parseFloat(seedLot.pricePerBag) || 0;
        const pricePerBag = item.pricePerBag || 0;
        const bags = item.bagsMoved;
        const cost = bags * costPerBag;
        const revenue = bags * pricePerBag;
        const profitLoss = revenue - cost;

        totalBags += bags;
        totalCost += cost;
        totalRevenue += revenue;

        processedItems.push({
          merchantId,
          seedLotId: item.seedLotId,
          serialNumber,
          coldStoreName: seedLot.coldStoreName,
          potatoType: seedLot.potatoType,
          size: seedLot.size,
          bagType: seedLot.bagType,
          bagsMoved: bags,
          pricePerBag: pricePerBag.toString(),
          costPerBag: costPerBag.toString(),
          revenue: revenue.toString(),
          cost: cost.toString(),
          profitLoss: profitLoss.toString(),
        });
      }

      const totalProfitLoss = totalRevenue - totalCost;
      const transportTotal = parseFloat(transportCharges) || 0;
      const otherTotal = parseFloat(otherCharges) || 0;
      const totalDueToFarmer = totalRevenue + transportTotal + otherTotal;

      const transactionNumber = await storage.getNextSeedTransactionNumber(merchantId);

      const transaction = await storage.createSeedTransaction(
        {
          merchantId,
          transactionNumber,
          farmerName,
          farmerContact: farmerContact || null,
          village: village || null,
          tehsil: tehsil || null,
          district,
          state,
          vehicleNumber: vehicleNumber || null,
          transportCharges: transportTotal.toString(),
          otherCharges: otherTotal.toString(),
          otherChargesRemarks: otherChargesRemarks || null,
          totalBags,
          totalCost: totalCost.toString(),
          totalRevenue: totalRevenue.toString(),
          totalProfitLoss: totalProfitLoss.toString(),
          totalDueToFarmer: totalDueToFarmer.toString(),
        },
        processedItems
      );

      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating seed transaction:", error);
      res.status(500).json({ message: "Failed to create seed transaction" });
    }
  });

  // Season Reset Endpoint
  app.post("/api/season/reset", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      
      // Check for remaining bags in raw potato stock
      const rawPotatoRemaining = await storage.checkRemainingBags(merchantId);
      
      // Check for remaining bags in seed stock
      const seedRemaining = await storage.checkSeedRemainingBags(merchantId);
      
      if (rawPotatoRemaining.hasRemaining || seedRemaining.hasRemaining) {
        const issues: string[] = [];
        
        if (rawPotatoRemaining.hasRemaining) {
          issues.push(`Raw Potato: ${rawPotatoRemaining.count} lots with ${rawPotatoRemaining.totalBags} remaining bags`);
        }
        
        if (seedRemaining.hasRemaining) {
          issues.push(`Seed: ${seedRemaining.count} lots with ${seedRemaining.totalBags} remaining bags`);
        }
        
        return res.status(400).json({ 
          message: `Cannot reset: There are still bags left to be sold. ${issues.join(". ")}`,
          details: { rawPotatoRemaining, seedRemaining }
        });
      }
      
      // Perform the reset - delete all stock entries (transactions are NOT affected)
      await storage.resetSeasonStockEntries(merchantId);
      
      res.json({ message: "Season reset completed successfully" });
    } catch (error) {
      console.error("Error resetting season:", error);
      res.status(500).json({ message: "Failed to reset season" });
    }
  });

  return httpServer;
}
