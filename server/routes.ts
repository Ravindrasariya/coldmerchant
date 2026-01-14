import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { stockEntryFormSchema, lotFormSchema } from "@shared/schema";

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
      const id = parseInt(req.params.id);
      const { paymentStatus, remarks, lots } = req.body;

      // Check if entry exists and belongs to merchant
      const existingEntry = await storage.getStockEntryById(id, merchantId);
      if (!existingEntry) {
        return res.status(404).json({ message: "Stock entry not found" });
      }

      // Update stock entry
      await storage.updateStockEntry(id, merchantId, {
        paymentStatus: paymentStatus || existingEntry.paymentStatus,
        remarks: remarks !== undefined ? remarks : existingEntry.remarks,
      });

      // Update lots and bag breakdowns if provided
      if (lots && Array.isArray(lots)) {
        for (const lotData of lots) {
          if (lotData.id) {
            // Update existing lot
            await storage.updateLot(lotData.id, merchantId, {
              remainingBags: lotData.remainingBags,
            });

            // Handle bag breakdowns for bilty cut
            if (lotData.cutType === "bilty_cut" && lotData.bagBreakdowns) {
              // Get existing breakdowns
              const existingBreakdowns = await storage.getBagBreakdownsByLot(lotData.id, merchantId);
              const existingIds = new Set(existingBreakdowns.map(b => b.id));

              for (const bdData of lotData.bagBreakdowns) {
                const weight = bdData.weight || 0;
                const pricePerKg = bdData.pricePerKg || 0;
                const totalAmount = weight * pricePerKg;

                if (bdData.id && bdData.id > 0) {
                  // Update existing breakdown
                  await storage.updateBagBreakdown(bdData.id, merchantId, {
                    size: bdData.size,
                    numberOfBags: bdData.numberOfBags,
                    weight: weight > 0 ? weight.toString() : null,
                    pricePerKg: pricePerKg > 0 ? pricePerKg.toString() : null,
                    totalAmount: totalAmount > 0 ? totalAmount.toString() : null,
                  });
                  existingIds.delete(bdData.id);
                } else {
                  // Create new breakdown
                  await storage.createBagBreakdown({
                    lotId: lotData.id,
                    merchantId,
                    size: bdData.size,
                    numberOfBags: bdData.numberOfBags,
                    weight: weight > 0 ? weight.toString() : null,
                    pricePerKg: pricePerKg > 0 ? pricePerKg.toString() : null,
                    totalAmount: totalAmount > 0 ? totalAmount.toString() : null,
                  });
                }
              }

              // Delete removed breakdowns
              const idsToDelete = Array.from(existingIds);
              for (const oldId of idsToDelete) {
                await storage.deleteBagBreakdown(oldId, merchantId);
              }
            }
          }
        }
      }

      // Fetch updated entry
      const updatedEntry = await storage.getStockEntryById(id, merchantId);
      res.json(updatedEntry);
    } catch (error) {
      console.error("Error updating stock entry:", error);
      res.status(500).json({ message: "Failed to update stock entry" });
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
