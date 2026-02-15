import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { stockEntryFormSchema, lotFormSchema, seedStockEntryFormSchema, seedStockEntryUpdateSchema, insertBuyerSchema, insertFarmerSchema, type ChangeSet, type ChangeItem, type FieldChange } from "@shared/schema";
import { z } from "zod";
import { formatDateForCode, generateMerchantCode, generateBuyerCode, generateTransactionCode, parseDateToCodeFormat } from "./codeGenerators";

function titleCase(str: string | null | undefined): string | null {
  if (!str) return null;
  return str.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function titleCaseKeep(str: string): string {
  return str.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

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

function computeCompoundInterestDue(principal: number, rateOfInterest: number, effectiveDate: string | null): number {
  if (!effectiveDate || !rateOfInterest || rateOfInterest <= 0 || principal <= 0) {
    return principal;
  }
  const today = new Date();
  const startDate = new Date(effectiveDate);
  const diffMs = today.getTime() - startDate.getTime();
  if (diffMs <= 0) return principal;
  const days = diffMs / (1000 * 60 * 60 * 24);
  return principal * Math.pow(1 + rateOfInterest / 100, days / 365);
}

function getReceivableWithInterest(farmer: { pendingDueToBePaid: string | null; rateOfInterest: string | null; effectiveDate: string | null }): number {
  const principal = parseFloat(farmer.pendingDueToBePaid || "0");
  const roi = parseFloat(farmer.rateOfInterest || "0");
  return computeCompoundInterestDue(principal, roi, farmer.effectiveDate);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // Dashboard Timeseries endpoint
  app.get("/api/dashboard/timeseries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const crop = (req.query.crop as string) || "all";
      const yearsParam = (req.query.years as string) || "all";
      const monthsParam = (req.query.months as string) || "all";
      const daysParam = (req.query.days as string) || "all";

      const yearsFilter = yearsParam === "all" ? null : yearsParam.split(",").map(Number);
      const monthsFilter = monthsParam === "all" ? null : monthsParam.split(",").map(Number);
      const daysFilter = daysParam === "all" ? null : daysParam.split(",").map(Number);

      const matchesDateFilter = (dateStr: string): boolean => {
        const d = new Date(dateStr);
        if (yearsFilter && !yearsFilter.includes(d.getFullYear())) return false;
        if (monthsFilter && !monthsFilter.includes(d.getMonth() + 1)) return false;
        if (daysFilter && !daysFilter.includes(d.getDate())) return false;
        return true;
      };

      const [allEntries, allLots, allBreakdowns, allTransactions, allSeedTransactions, allBuyers] = await Promise.all([
        storage.getStockEntriesByMerchant(merchantId),
        storage.getAllLotsByMerchant(merchantId),
        storage.getAllBagBreakdownsByMerchant(merchantId),
        storage.getTransactionsByMerchant(merchantId),
        storage.getSeedTransactionsByMerchant(merchantId),
        storage.getBuyersByMerchant(merchantId),
      ]);

      const buyerIdToName = new Map<number, string>();
      for (const b of allBuyers) {
        buyerIdToName.set(b.id, b.name);
      }

      const lotsMap = new Map<number, any[]>();
      for (const lot of allLots) {
        const arr = lotsMap.get(lot.stockEntryId) || [];
        arr.push(lot);
        lotsMap.set(lot.stockEntryId, arr);
      }

      const breakdownsMap = new Map<number, any[]>();
      for (const bd of allBreakdowns) {
        const arr = breakdownsMap.get(bd.lotId) || [];
        arr.push(bd);
        breakdownsMap.set(bd.lotId, arr);
      }

      const filteredEntries = allEntries.filter(entry => {
        if (crop !== "all" && entry.crop !== crop) return false;
        if (!entry.purchaseDate) return false;
        return matchesDateFilter(entry.purchaseDate);
      });

      const farmerDueMap = new Map<string, number>();
      const volumeMap = new Map<string, number>();
      const perFarmerHarvestDue = new Map<string, number>();
      const cropDuesMap: Record<string, number> = {};
      let summaryColdStoreTotalCharges = 0;
      let summaryColdStoreDue = 0;

      for (const entry of filteredEntries) {
        const dateKey = entry.purchaseDate;
        const entryLots = lotsMap.get(entry.id) || [];

        let entryTotalAmount = 0;
        let entryDeductions = 0;
        let entryAdjustment = 0;
        let entryVolume = 0;

        for (const lot of entryLots) {
          const lotBreakdowns = breakdownsMap.get(lot.id) || [];
          const sellable = lotBreakdowns.filter((bd: any) => bd.size !== "Wastage");

          const hasBreakdownData = sellable.some((bd: any) => {
            const w = bd.weight ? parseFloat(bd.weight) : 0;
            const p = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
            return w > 0 && p > 0;
          });

          if (hasBreakdownData) {
            for (const bd of sellable) {
              const weight = bd.weight ? parseFloat(bd.weight) : 0;
              entryVolume += weight;
              const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
              const netWeight = weight > 0 ? weight - bd.numberOfBags : 0;
              if (netWeight > 0 && price > 0) {
                entryTotalAmount += netWeight * price;
              }
            }
          } else {
            const lotTotalWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
            const price = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
            const netWeight = lotTotalWeight > 0 ? lotTotalWeight - lot.originalBags : 0;
            entryVolume += lotTotalWeight;
            if (netWeight > 0 && price > 0) {
              entryTotalAmount += netWeight * price;
            }
          }

          const hammaliGradingCharges = lot.hammaliGradingCharges ? parseFloat(lot.hammaliGradingCharges) : 0;
          const dynamicCharges = (lot.charges || []).reduce((sum: number, c: any) => sum + (parseFloat(String(c.amount)) || 0), 0);
          entryDeductions += hammaliGradingCharges + dynamicCharges;

          const coldStoreChargeTypes = ["Cold Charges", "Ware House Charges"];
          const lotColdCharges = (lot.charges || [])
            .filter((c: any) => c && coldStoreChargeTypes.includes(c.type))
            .reduce((sum: number, c: any) => sum + (parseFloat(String(c.amount)) || 0), 0);
          const lotColdPaid = lot.coldStorageChargesPaid ? parseFloat(lot.coldStorageChargesPaid) : 0;
          summaryColdStoreTotalCharges += lotColdCharges;
          summaryColdStoreDue += Math.max(lotColdCharges - lotColdPaid, 0);

          const rawAdjustedAmount = lot.adjustedAmount !== null ? parseFloat(lot.adjustedAmount) : 0;
          const adjustedAmountRate = lot.adjustedAmountRate ? parseFloat(lot.adjustedAmountRate) : 0;
          const adjustedAmountEffectiveDate = lot.adjustedAmountEffectiveDate;

          let finalAdj = 0;
          if (rawAdjustedAmount > 0 && adjustedAmountRate > 0 && adjustedAmountEffectiveDate) {
            const effectiveDate = new Date(adjustedAmountEffectiveDate);
            const today = new Date();
            const days = Math.max(0, Math.floor((today.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24)));
            const years = days / 365;
            finalAdj = Math.round((rawAdjustedAmount * (Math.pow(1 + adjustedAmountRate / 100, years) - 1)) * 100) / 100;
          }

          if (finalAdj > 0 && lot.adjustedAmountType) {
            if (lot.adjustedAmountType === "credit") {
              entryAdjustment += finalAdj;
            } else if (lot.adjustedAmountType === "debit") {
              entryAdjustment -= finalAdj;
            }
          }
        }

        const netPayable = entryTotalAmount - entryDeductions + entryAdjustment;
        const amountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
        const farmerDue = Math.max(netPayable - amountPaid, 0);

        farmerDueMap.set(dateKey, (farmerDueMap.get(dateKey) || 0) + farmerDue);
        volumeMap.set(dateKey, (volumeMap.get(dateKey) || 0) + entryVolume);

        const farmerKey = entry.farmerId
          ? String(entry.farmerId)
          : `composite:${(entry.farmerName || "").toLowerCase().trim()}|${(entry.farmerContact || "").toLowerCase().trim()}|${(entry.village || "").toLowerCase().trim()}`;
        const prev = perFarmerHarvestDue.get(farmerKey) || 0;
        perFarmerHarvestDue.set(farmerKey, prev + farmerDue);

        const entryCrop = entry.crop || "potato";
        cropDuesMap[entryCrop] = (cropDuesMap[entryCrop] || 0) + farmerDue;
      }

      const filteredTransactions = allTransactions.filter(tx => {
        if (crop !== "all" && tx.crop !== crop) return false;
        if (!tx.dateOfLoading) return false;
        return matchesDateFilter(tx.dateOfLoading);
      });

      const buyerDueMap = new Map<string, number>();
      const pnlMap = new Map<string, number>();
      let summaryBuyerTotalRevenue = 0;
      let summaryBuyerTotalDue = 0;
      const buyerDueByNameMap = new Map<string, number>();

      for (const tx of filteredTransactions) {
        const dateKey = tx.dateOfLoading!;
        const revenue = tx.revenue ? parseFloat(tx.revenue) : 0;
        const amountReceived = tx.amountReceived ? parseFloat(tx.amountReceived) : 0;
        const buyerDue = Math.max(revenue - amountReceived, 0);
        buyerDueMap.set(dateKey, (buyerDueMap.get(dateKey) || 0) + buyerDue);
        summaryBuyerTotalRevenue += revenue;
        summaryBuyerTotalDue += buyerDue;

        const buyerKey = tx.buyerId ? String(tx.buyerId) : `name:${(tx.partyName || "Unknown").toLowerCase().trim()}`;
        buyerDueByNameMap.set(buyerKey, (buyerDueByNameMap.get(buyerKey) || 0) + buyerDue);

        const profitLoss = tx.profitLoss ? parseFloat(tx.profitLoss) : 0;
        pnlMap.set(dateKey, (pnlMap.get(dateKey) || 0) + profitLoss);
      }

      const perFarmerSeedDue = new Map<string, number>();
      for (const seedTx of allSeedTransactions) {
        if (!seedTx.createdAt) continue;
        if (crop === "onion") continue;
        const dateKey = new Date(seedTx.createdAt).toISOString().split("T")[0];
        if (!matchesDateFilter(dateKey)) continue;
        const totalPL = seedTx.totalProfitLoss ? parseFloat(seedTx.totalProfitLoss) : 0;
        pnlMap.set(dateKey, (pnlMap.get(dateKey) || 0) + totalPL);

        const totalDueToFarmer = seedTx.totalDueToFarmer ? parseFloat(seedTx.totalDueToFarmer) : 0;
        const seedDue = Math.max(totalDueToFarmer, 0);
        const farmerKey = seedTx.farmerId
          ? String(seedTx.farmerId)
          : `composite:${(seedTx.farmerName || "").toLowerCase().trim()}|${(seedTx.farmerContact || "").toLowerCase().trim()}|${(seedTx.village || "").toLowerCase().trim()}`;
        perFarmerSeedDue.set(farmerKey, (perFarmerSeedDue.get(farmerKey) || 0) + seedDue);
      }

      const allFarmerIdsArr = Array.from(new Set([...Array.from(perFarmerHarvestDue.keys()), ...Array.from(perFarmerSeedDue.keys())]));
      let summaryFarmerHarvestPayable = 0;
      let summaryFarmerSeedPayable = 0;
      let summaryFarmerHarvestDue = 0;
      let summaryFarmerSeedDue = 0;
      for (const fId of allFarmerIdsArr) {
        const hDue = perFarmerHarvestDue.get(fId) || 0;
        const sDue = perFarmerSeedDue.get(fId) || 0;
        summaryFarmerHarvestPayable += hDue;
        summaryFarmerSeedPayable += sDue;
        if (hDue >= sDue) {
          summaryFarmerHarvestDue += (hDue - sDue);
        } else {
          summaryFarmerSeedDue += (sDue - hDue);
        }
      }

      const farmerDueTimeSeries = Array.from(farmerDueMap.entries())
        .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const buyerDueTimeSeries = Array.from(buyerDueMap.entries())
        .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const dailyVolumeTimeSeries = Array.from(volumeMap.entries())
        .map(([date, volume]) => ({ date, volume: Math.round(volume * 100) / 100 }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const sortedPnlDates = Array.from(pnlMap.keys()).sort();
      let cumulative = 0;
      const cumulativePnlTimeSeries = sortedPnlDates.map(date => {
        cumulative += pnlMap.get(date)!;
        return { date, pnl: Math.round(cumulative * 100) / 100 };
      });

      const farmerDueByCrop = Object.entries(cropDuesMap)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value: Math.round(value) }));

      const buyerDueByName = Array.from(buyerDueByNameMap.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([key, value]) => {
          const total = Array.from(buyerDueByNameMap.values()).reduce((s, v) => s + v, 0);
          const numericId = parseInt(key);
          const displayName = !isNaN(numericId) ? (buyerIdToName.get(numericId) || key) : key.replace(/^name:/, "");
          return { name: displayName.length > 12 ? displayName.substring(0, 12) + "..." : displayName, value: Math.round(value), percentage: total > 0 ? Math.round((value / total) * 100) : 0 };
        });

      res.json({
        farmerDueTimeSeries,
        buyerDueTimeSeries,
        dailyVolumeTimeSeries,
        cumulativePnlTimeSeries,
        summary: {
          farmerHarvestPayable: Math.round(summaryFarmerHarvestPayable),
          farmerHarvestDue: Math.round(summaryFarmerHarvestDue),
          farmerSeedPayable: Math.round(summaryFarmerSeedPayable),
          farmerSeedDue: Math.round(summaryFarmerSeedDue),
          coldStoreTotalCharges: Math.round(summaryColdStoreTotalCharges),
          coldStoreDue: Math.round(summaryColdStoreDue),
          buyerTotalRevenue: Math.round(summaryBuyerTotalRevenue),
          buyerTotalDue: Math.round(summaryBuyerTotalDue),
        },
        farmerDueByCrop,
        buyerDueByName,
      });
    } catch (error) {
      console.error("Error fetching dashboard timeseries:", error);
      res.status(500).json({ message: "Failed to fetch dashboard timeseries" });
    }
  });

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

      // Lookup or create farmer in farmer ledger
      const { farmerId } = await storage.lookupOrCreateFarmer(merchantId, {
        name: titleCaseKeep(data.farmerName),
        contact: data.farmerContact || null,
        village: titleCase(data.village) || null,
        tehsil: titleCase(data.tehsil) || null,
        district: titleCase(data.district) || null,
        state: titleCase(data.state) || null,
      });

      // Create stock entry
      const stockEntry = await storage.createStockEntry({
        merchantId,
        crop: entryCrop,
        purchaseDate: data.purchaseDate,
        farmerId,
        farmerName: titleCaseKeep(data.farmerName),
        farmerContact: data.farmerContact || null,
        village: titleCase(data.village) || null,
        tehsil: titleCase(data.tehsil) || null,
        district: titleCase(data.district) || data.district,
        state: titleCase(data.state) || data.state,
        remarks: data.remarks || null,
        paymentStatus: "due",
      });

      // Create lots and bag breakdowns
      for (const lotData of data.lots) {
        const lot = await storage.createLot({
          stockEntryId: stockEntry.id,
          merchantId,
          place: lotData.place || "cold_store",
          coldStoreName: lotData.place === "cold_store" ? (titleCase(lotData.coldStoreName) || null) : null,
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
            if (existingLot && lotData.adjustedAmount !== undefined) {
              compareField('adjustedAmount', existingLot.adjustedAmount, lotData.adjustedAmount, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.adjustedAmountType !== undefined) {
              compareField('adjustedAmountType', existingLot.adjustedAmountType, lotData.adjustedAmountType, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.adjustedAmountRemark !== undefined) {
              compareField('adjustedAmountRemark', existingLot.adjustedAmountRemark, lotData.adjustedAmountRemark, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.adjustedAmountRate !== undefined) {
              compareField('adjustedAmountRate', existingLot.adjustedAmountRate, lotData.adjustedAmountRate, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.adjustedAmountEffectiveDate !== undefined) {
              compareField('adjustedAmountEffectiveDate', existingLot.adjustedAmountEffectiveDate, lotData.adjustedAmountEffectiveDate, lotLabel, 'lot', lotData.id);
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
            if (existingLot && lotData.coldStoreName !== undefined) {
              compareField('coldStoreName', existingLot.coldStoreName, lotData.coldStoreName, lotLabel, 'lot', lotData.id);
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
              adjustedAmount: lotData.adjustedAmount !== undefined
                ? (lotData.adjustedAmount ? lotData.adjustedAmount.toString() : null)
                : undefined,
              adjustedAmountType: lotData.adjustedAmountType !== undefined
                ? (lotData.adjustedAmountType || null)
                : undefined,
              adjustedAmountRemark: lotData.adjustedAmountRemark !== undefined
                ? (lotData.adjustedAmountRemark || null)
                : undefined,
              adjustedAmountRate: lotData.adjustedAmountRate !== undefined
                ? (lotData.adjustedAmountRate ? lotData.adjustedAmountRate.toString() : null)
                : undefined,
              adjustedAmountEffectiveDate: lotData.adjustedAmountEffectiveDate !== undefined
                ? (lotData.adjustedAmountEffectiveDate || null)
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
              coldStoreName: lotData.coldStoreName !== undefined
                ? (titleCase(lotData.coldStoreName) || null)
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

  // PATCH /api/admin/merchants/:id/status - Update merchant status (archive/active/inactive)
  app.patch("/api/admin/merchants/:id/status", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, adminPassword } = req.body;
      
      // Validate status
      const validStatuses = ["active", "inactive", "archived"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be active, inactive, or archived" });
      }
      
      // Verify admin password
      const { comparePasswords } = await import("./auth");
      const adminUser = await storage.getUser(req.user!.id);
      if (!adminUser || !(await comparePasswords(adminPassword, adminUser.password))) {
        return res.status(401).json({ message: "Invalid admin password" });
      }
      
      // Update status
      const updated = await storage.updateMerchantStatus(id, status);
      if (!updated) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      
      // Invalidate sessions for all users of this merchant if status is not active
      if (status !== "active") {
        await storage.invalidateMerchantSessions(id);
      }
      
      res.json({ message: `Merchant status updated to ${status}`, merchant: updated });
    } catch (error) {
      console.error("Error updating merchant status:", error);
      res.status(500).json({ message: "Failed to update merchant status" });
    }
  });

  // POST /api/admin/merchants/:id/reset - Factory reset a merchant (requires dual password verification)
  app.post("/api/admin/merchants/:id/reset", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { adminPassword, resetPassword } = req.body;
      
      // Verify admin password
      const { comparePasswords } = await import("./auth");
      const adminUser = await storage.getUser(req.user!.id);
      if (!adminUser || !(await comparePasswords(adminPassword, adminUser.password))) {
        return res.status(401).json({ message: "Invalid admin password" });
      }
      
      // Verify special reset password from environment
      const expectedResetPassword = process.env.RESET_PASSWORD;
      if (!expectedResetPassword || resetPassword !== expectedResetPassword) {
        return res.status(401).json({ message: "Invalid reset password" });
      }
      
      // Verify merchant exists
      const merchant = await storage.getMerchant(id);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      
      // Invalidate all sessions first
      await storage.invalidateMerchantSessions(id);
      
      // Perform factory reset
      await storage.factoryResetMerchant(id);
      
      res.json({ message: "Merchant data has been reset successfully" });
    } catch (error) {
      console.error("Error resetting merchant:", error);
      res.status(500).json({ message: "Failed to reset merchant" });
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
          transporterName: titleCase(transporterName) || null,
          dateOfLoading: dateOfLoading || null,
          partyName: titleCase(partyName) || null,
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
      
      const { partyName, partyAddress, vehicleNumber, advancePayment, amountReceived, transportationCharges, otherCharges, revenue, remarks } = req.body;
      
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
      if (remarks !== undefined && (remarks || null) !== (existingTxn.remarks || null)) {
        changes.push({ field: "remarks", oldValue: existingTxn.remarks, newValue: remarks || null });
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
        partyName: titleCase(partyName) || null,
        partyAddress: partyAddress || null,
        vehicleNumber: vehicleNumber || null,
        advancePayment: advancePayment ? advancePayment.toString() : null,
        amountReceived: amountReceived ? amountReceived.toString() : null,
        transportationCharges: transportationCharges ? transportationCharges.toString() : null,
        otherCharges: otherCharges ? otherCharges.toString() : null,
        remarks: remarks !== undefined ? (remarks || null) : existingTxn.remarks,
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

  // GET /api/seed-brands/search - Search brand names for autocomplete
  app.get("/api/seed-brands/search", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const query = (req.query.q as string) || "";
      const brands = await storage.searchSeedBrands(merchantId, query);
      res.json(brands);
    } catch (error) {
      console.error("Error searching seed brands:", error);
      res.status(500).json({ message: "Failed to search seed brands" });
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
      const { farmerName, farmerVillage, farmerContact, farmerId } = req.query;
      
      if (!farmerName || typeof farmerName !== 'string') {
        return res.status(400).json({ message: "Farmer name is required" });
      }

      const eligibility = await storage.checkCrossSettlementEligibility(
        merchantId,
        farmerName,
        typeof farmerVillage === 'string' ? farmerVillage : null,
        typeof farmerContact === 'string' ? farmerContact : null,
        farmerId ? parseInt(farmerId as string, 10) : null
      );
      
      res.json(eligibility);
    } catch (error) {
      console.error("Error checking cross-settlement eligibility:", error);
      res.status(500).json({ message: "Failed to check cross-settlement eligibility" });
    }
  });

  // POST /api/cash/entries - Create a cash entry (inward, outflow, or transfer)
  app.post("/api/cash/entries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const { direction, receiptType, revenueType, expenseType, paymentMode, bankAccountId, fromAccountType, fromBankAccountId, toAccountType, toBankAccountId, partyName, partyVillage, farmerName, farmerVillage, farmerContact, coldStoreName, supplierName, amount, entryDate, remarks, crossSettlement } = req.body;

      // Validate required fields
      if (!direction || !["inward", "outflow", "transfer"].includes(direction)) {
        return res.status(400).json({ message: "Valid direction (inward/outflow/transfer) is required" });
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
        if (!expenseType || !["salary", "general_expense", "grading", "hammali", "farmer", "farmer_advance", "farmer_freight", "farmer_others", "cold_store_charge", "supplier"].includes(expenseType)) {
          return res.status(400).json({ message: "Valid expense type is required for outflow entries" });
        }
        if (!paymentMode || !["cash", "account_transfer"].includes(paymentMode)) {
          return res.status(400).json({ message: "Valid payment mode is required for outflow entries" });
        }
        const farmerExpenseTypes = ["farmer", "farmer_advance", "farmer_freight", "farmer_others"];
        if (farmerExpenseTypes.includes(expenseType) && !farmerName) {
          return res.status(400).json({ message: "Farmer name is required when expense type is farmer-related" });
        }
        if (expenseType === "cold_store_charge" && !coldStoreName) {
          return res.status(400).json({ message: "Cold store name is required when expense type is cold store charge" });
        }
        if (expenseType === "supplier" && !supplierName) {
          return res.status(400).json({ message: "Supplier name is required when expense type is supplier" });
        }
      } else if (direction === "transfer") {
        if (!fromAccountType || !["cash_in_hand", "bank_account"].includes(fromAccountType)) {
          return res.status(400).json({ message: "Valid from account type is required for transfers" });
        }
        if (!toAccountType || !["cash_in_hand", "bank_account"].includes(toAccountType)) {
          return res.status(400).json({ message: "Valid to account type is required for transfers" });
        }
        if (fromAccountType === "bank_account" && !fromBankAccountId) {
          return res.status(400).json({ message: "Source bank account is required for bank transfers" });
        }
        if (toAccountType === "bank_account" && !toBankAccountId) {
          return res.status(400).json({ message: "Destination bank account is required for bank transfers" });
        }
        // Prevent same-to-same transfers
        if (fromAccountType === toAccountType && fromAccountType === "cash_in_hand") {
          return res.status(400).json({ message: "Cannot transfer from cash to cash" });
        }
        if (fromAccountType === "bank_account" && toAccountType === "bank_account" && 
            fromBankAccountId === toBankAccountId) {
          return res.status(400).json({ message: "Cannot transfer to the same bank account" });
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

      // Resolve buyerId and farmerId from ledger for reliable matching
      let resolvedBuyerId: number | null = null;
      let resolvedFarmerId: number | null = null;
      
      if (partyName) {
        try {
          const { buyerId: bId } = await storage.lookupOrCreateBuyer(merchantId, {
            name: titleCaseKeep(partyName),
            contact: null,
            address: titleCase(partyVillage) || null,
          });
          resolvedBuyerId = bId;
        } catch (e) {
          console.error("Failed to resolve buyerId for cash entry:", e);
        }
      }
      
      if (farmerName) {
        try {
          const { farmerId: fId } = await storage.lookupOrCreateFarmer(merchantId, {
            name: titleCaseKeep(farmerName),
            contact: farmerContact || null,
            village: titleCase(farmerVillage) || null,
          });
          resolvedFarmerId = fId;
        } catch (e) {
          console.error("Failed to resolve farmerId for cash entry:", e);
        }
      }

      // Determine if FIFO should be applied
      const applyFIFO = (direction === "inward" && !!partyName) || 
                        (direction === "inward" && revenueType === "seed_sale" && !!farmerName) ||
                        (direction === "outflow" && expenseType === "farmer" && !!farmerName) ||
                        (direction === "outflow" && expenseType === "cold_store_charge" && !!coldStoreName);

      // Generate cash flow code: CFYYYYMMDD{seq} - unique per merchant (MAX-based with retry)
      const txDateStr = parseDateToCodeFormat(entryDate);
      const txCodePrefix = `CF${txDateStr}`;
      
      const maxRetries = 3;
      let createdEntry: any;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const maxSeq = await storage.getMaxCashCodeSequence(merchantId, txCodePrefix);
        const transactionCode = `CF${txDateStr}${maxSeq + 1 + attempt}`;
        try {
          createdEntry = await storage.createCashEntryWithCrossSettlement({
            merchantId,
            transactionCode,
            direction,
            receiptType: receiptType || null,
            revenueType: revenueType || null,
            expenseType: expenseType || null,
            paymentMode: paymentMode || null,
            bankAccountId: bankAccountId || null,
            fromAccountType: fromAccountType || null,
            fromBankAccountId: fromBankAccountId || null,
            toAccountType: toAccountType || null,
            toBankAccountId: toBankAccountId || null,
            partyName: titleCase(partyName) || null,
            partyVillage: titleCase(partyVillage) || null,
            buyerId: resolvedBuyerId,
            farmerName: titleCase(farmerName) || null,
            farmerVillage: titleCase(farmerVillage) || null,
            farmerContact: farmerContact || null,
            farmerId: resolvedFarmerId,
            coldStoreName: titleCase(coldStoreName) || null,
            supplierName: titleCase(supplierName) || null,
            amount: amount.toString(),
            entryDate,
            remarks: remarks || null,
          }, applyFIFO, validatedCrossSettlement, userId);
          break;
        } catch (error: any) {
          if (error?.code === '23505' && error?.constraint?.includes('transaction_code') && attempt < maxRetries - 1) {
            continue;
          }
          throw error;
        }
      }
      if (!createdEntry) throw new Error("Failed to generate unique cash code after multiple attempts");
      
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

      // Lookup or create buyer in buyer ledger
      const tcPartyName = titleCaseKeep(name);
      const { buyerId } = await storage.lookupOrCreateBuyer(merchantId, {
        name: tcPartyName,
        contact: contactNumber || null,
        address: titleCase(address) || null,
      });

      const party = await storage.createParty({
        merchantId,
        buyerId,
        name: tcPartyName,
        contactNumber: contactNumber || null,
        address: titleCase(address) || null,
        pendingDues: pendingDues?.toString() || "0",
      });

      if (buyerId && pendingDues !== undefined) {
        const newAmount = parseFloat(pendingDues?.toString() || "0");
        if (newAmount > 0) {
          const existingBuyer = await storage.getBuyerById(buyerId, merchantId);
          const currentBalance = parseFloat(existingBuyer?.receivableBalance || "0");
          await storage.updateBuyer(buyerId, merchantId, { receivableBalance: (currentBalance + newAmount).toFixed(2) });
        }
      }

      res.status(201).json(party);
    } catch (error) {
      console.error("Error creating party:", error);
      res.status(500).json({ message: "Failed to create party" });
    }
  });

  // Sync existing parties with buyer ledger
  app.post("/api/cash/managed-parties/sync", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const result = await storage.syncPartiesWithBuyers(merchantId);
      res.json(result);
    } catch (error) {
      console.error("Error syncing parties with buyers:", error);
      res.status(500).json({ message: "Failed to sync parties with buyers" });
    }
  });

  app.patch("/api/cash/managed-parties/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const { name, contactNumber, address, pendingDues } = req.body;

      const allParties = await storage.getPartiesByMerchant(merchantId);
      const oldParty = allParties.find(p => p.id === id);
      const oldAmount = parseFloat(oldParty?.pendingDues || "0");

      const party = await storage.updateParty(id, merchantId, {
        ...(name && { name }),
        ...(contactNumber !== undefined && { contactNumber }),
        ...(address !== undefined && { address }),
        ...(pendingDues !== undefined && { pendingDues: pendingDues?.toString() }),
      });
      
      if (!party) {
        return res.status(404).json({ message: "Party not found" });
      }

      if (party.buyerId && pendingDues !== undefined) {
        const newAmount = parseFloat(pendingDues?.toString() || "0");
        const delta = newAmount - oldAmount;
        if (delta !== 0) {
          const existingBuyer = await storage.getBuyerById(party.buyerId, merchantId);
          const currentBalance = parseFloat(existingBuyer?.receivableBalance || "0");
          const newBalance = Math.max(0, currentBalance + delta);
          await storage.updateBuyer(party.buyerId, merchantId, { receivableBalance: newBalance.toFixed(2) });
        }
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
      const allParties = await storage.getPartiesByMerchant(merchantId);
      const deletedParty = allParties.find(p => p.id === id);
      await storage.deleteParty(id, merchantId);

      if (deletedParty?.buyerId) {
        const removedAmount = parseFloat(deletedParty.pendingDues || "0");
        if (removedAmount > 0) {
          const existingBuyer = await storage.getBuyerById(deletedParty.buyerId, merchantId);
          const currentBalance = parseFloat(existingBuyer?.receivableBalance || "0");
          const newBalance = Math.max(0, currentBalance - removedAmount);
          await storage.updateBuyer(deletedParty.buyerId, merchantId, { receivableBalance: newBalance.toFixed(2) });
        }
      }

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
      const farmersWithFinalDue = farmers.map(f => ({
        ...f,
        finalDue: getReceivableWithInterest(f).toFixed(2),
      }));
      res.json(farmersWithFinalDue);
    } catch (error) {
      console.error("Error fetching managed farmers:", error);
      res.status(500).json({ message: "Failed to fetch managed farmers" });
    }
  });

  app.post("/api/cash/managed-farmers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { name, contactNumber, village, tehsil, district, state, pendingDueToBePaid, rateOfInterest, effectiveDate } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Farmer name is required" });
      }

      // Lookup or create farmer in farmer ledger
      const tcName = titleCaseKeep(name);
      const { farmerId } = await storage.lookupOrCreateFarmer(merchantId, {
        name: tcName,
        contact: contactNumber || null,
        village: titleCase(village) || null,
        tehsil: titleCase(tehsil) || null,
        district: titleCase(district) || null,
        state: titleCase(state) || null,
      });

      const cashFarmer = await storage.createCashFarmer({
        merchantId,
        farmerId,
        name: tcName,
        contactNumber: contactNumber || null,
        village: titleCase(village) || null,
        tehsil: titleCase(tehsil) || null,
        district: titleCase(district) || null,
        state: titleCase(state) || null,
        pendingDueToBePaid: pendingDueToBePaid?.toString() || "0",
        rateOfInterest: rateOfInterest?.toString() || "0",
        effectiveDate: effectiveDate || new Date().toISOString().split('T')[0],
      });

      if (farmerId) {
        const addedAmount = parseFloat(pendingDueToBePaid?.toString() || "0");
        const roi = parseFloat(rateOfInterest?.toString() || "0");
        const effDate = effectiveDate || new Date().toISOString().split('T')[0];
        const existingFarmer = await storage.getFarmerById(farmerId, merchantId);
        const currentPyReceivable = parseFloat(existingFarmer?.pyReceivable || "0");
        await storage.updateFarmer(farmerId, merchantId, {
          pyReceivable: (currentPyReceivable + addedAmount).toFixed(2),
          receivableInterestRate: roi.toFixed(2),
          receivableEffectiveDate: effDate,
        });
      }

      res.status(201).json(cashFarmer);
    } catch (error) {
      console.error("Error creating farmer:", error);
      res.status(500).json({ message: "Failed to create farmer" });
    }
  });

  app.patch("/api/cash/managed-farmers/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const { name, contactNumber, village, tehsil, district, state, pendingDueToBePaid, rateOfInterest, effectiveDate } = req.body;

      const allCashFarmers = await storage.getCashFarmersByMerchant(merchantId);
      const oldCashFarmer = allCashFarmers.find(f => f.id === id);
      if (!oldCashFarmer) {
        return res.status(404).json({ message: "Farmer not found" });
      }

      const updatedCashFarmer = await storage.updateCashFarmer(id, merchantId, {
        ...(name && { name: titleCaseKeep(name) }),
        ...(contactNumber !== undefined && { contactNumber }),
        ...(village !== undefined && { village: titleCase(village) }),
        ...(tehsil !== undefined && { tehsil: titleCase(tehsil) }),
        ...(district !== undefined && { district: titleCase(district) }),
        ...(state !== undefined && { state: titleCase(state) }),
        ...(pendingDueToBePaid !== undefined && { pendingDueToBePaid: pendingDueToBePaid?.toString() }),
        ...(rateOfInterest !== undefined && { rateOfInterest: rateOfInterest?.toString() }),
        ...(effectiveDate !== undefined && { effectiveDate }),
      });
      
      if (!updatedCashFarmer) {
        return res.status(404).json({ message: "Farmer not found" });
      }

      if (updatedCashFarmer.farmerId) {
        const syncData: any = {};
        if (pendingDueToBePaid !== undefined) {
          const newAmount = parseFloat(pendingDueToBePaid?.toString() || "0");
          const oldAmount = parseFloat(oldCashFarmer.pendingDueToBePaid || "0");
          const delta = newAmount - oldAmount;
          if (delta !== 0) {
            const existingFarmer = await storage.getFarmerById(updatedCashFarmer.farmerId, merchantId);
            const currentPyReceivable = parseFloat(existingFarmer?.pyReceivable || "0");
            const newBalance = Math.max(0, currentPyReceivable + delta);
            syncData.pyReceivable = newBalance.toFixed(2);
            if (newBalance <= 0) {
              syncData.receivableInterestRate = "0";
              syncData.receivableEffectiveDate = null;
            }
          }
        }
        if (rateOfInterest !== undefined) {
          syncData.receivableInterestRate = parseFloat(rateOfInterest?.toString() || "0").toFixed(2);
        }
        if (effectiveDate !== undefined) {
          syncData.receivableEffectiveDate = effectiveDate;
        }
        if (Object.keys(syncData).length > 0) {
          await storage.updateFarmer(updatedCashFarmer.farmerId, merchantId, syncData);
        }
      }

      res.json(updatedCashFarmer);
    } catch (error) {
      console.error("Error updating farmer:", error);
      res.status(500).json({ message: "Failed to update farmer" });
    }
  });

  app.delete("/api/cash/managed-farmers/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const allCashFarmers = await storage.getCashFarmersByMerchant(merchantId);
      const deletedCashFarmer = allCashFarmers.find(f => f.id === id);
      await storage.deleteCashFarmer(id, merchantId);

      if (deletedCashFarmer?.farmerId) {
        const removedAmount = parseFloat(deletedCashFarmer.pendingDueToBePaid || "0");
        const existingFarmer = await storage.getFarmerById(deletedCashFarmer.farmerId, merchantId);
        if (existingFarmer) {
          const currentPyReceivable = parseFloat(existingFarmer.pyReceivable || "0");
          const newBalance = Math.max(0, currentPyReceivable - removedAmount);
          const updateData: any = { pyReceivable: newBalance.toFixed(2) };
          if (newBalance <= 0) {
            updateData.receivableInterestRate = "0";
            updateData.receivableEffectiveDate = null;
          }
          await storage.updateFarmer(deletedCashFarmer.farmerId, merchantId, updateData);
        }
      }

      res.json({ message: "Farmer deleted successfully" });
    } catch (error) {
      console.error("Error deleting farmer:", error);
      res.status(500).json({ message: "Failed to delete farmer" });
    }
  });

  // ===================== BUYER MANAGEMENT ROUTES =====================

  // GET /api/buyers - Get all buyers for the authenticated merchant with dues calculation
  app.get("/api/buyers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const buyerList = await storage.getBuyersByMerchant(merchantId);
      
      // Get all transactions for this merchant to calculate buyer dues
      const transactionList = await storage.getTransactionsByMerchant(merchantId);
      
      // Calculate dues for each buyer: revenue - amountReceived for all transactions with that buyerId
      // Plus receivableBalance from buyer record (synced from Cash Settings)
      const buyersWithDues = buyerList.map(buyer => {
        let totalDue = 0;
        const receivables = parseFloat(buyer.receivableBalance || "0");
        
        for (const txn of transactionList) {
          if (txn.buyerId === buyer.id) {
            const revenue = parseFloat(txn.revenue || "0");
            const amountReceived = parseFloat(txn.amountReceived || "0");
            totalDue += Math.max(0, revenue - amountReceived);
          }
        }
        
        return {
          ...buyer,
          overallDue: totalDue + receivables,
          receivables: receivables,
        };
      });
      
      res.json(buyersWithDues);
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

      // Generate buyer code: BYYYYYMMDD{seq} - unique per merchant (MAX-based with retry)
      const effectiveDateAdded = dateAdded || new Date().toISOString().split('T')[0];
      const dateStr = parseDateToCodeFormat(effectiveDateAdded);
      const codePrefix = `BY${dateStr}`;
      
      const maxRetries = 3;
      let buyer: any;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const maxSeq = await storage.getMaxBuyerCodeSequence(merchantId, codePrefix);
        const buyerCode = `BY${dateStr}${maxSeq + 1 + attempt}`;
        try {
          buyer = await storage.createBuyer({
            merchantId,
            buyerCode,
            dateAdded: effectiveDateAdded,
            name: titleCaseKeep(name),
            address: titleCase(address) || address,
            mandiCode: mandiCode || null,
            contact: contact || null,
            negativeFlag: negativeFlag ?? false,
            isActive: isActive ?? true,
          });
          break;
        } catch (error: any) {
          if (error?.code === '23505' && error?.constraint?.includes('buyer_code') && attempt < maxRetries - 1) {
            continue;
          }
          throw error;
        }
      }
      if (!buyer) throw new Error("Failed to generate unique buyer code after multiple attempts");
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
        ...(name !== undefined && { name: titleCaseKeep(name) }),
        ...(address !== undefined && { address: titleCase(address) || address }),
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

  // PATCH /api/buyers/:id/details - Update buyer details with propagation to linked transactions
  app.patch("/api/buyers/:id/details", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const id = parseInt(req.params.id);
      const { name, address, mandiCode, contact, negativeFlag } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: "Buyer name is required" });
      }

      // Get existing buyer for comparison
      const existingBuyer = await storage.getBuyerById(id, merchantId);
      if (!existingBuyer) {
        return res.status(404).json({ message: "Buyer not found" });
      }

      // Track changes for edit history
      const changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> = [];
      
      const newName = name.trim();
      const newAddress = address?.trim() || null;
      const newMandiCode = mandiCode?.trim() || null;
      const newContact = contact?.trim() || null;
      const newNegativeFlag = negativeFlag ?? existingBuyer.negativeFlag;

      if (existingBuyer.name !== newName) {
        changes.push({ fieldName: "name", oldValue: existingBuyer.name, newValue: newName });
      }
      if (existingBuyer.address !== newAddress) {
        changes.push({ fieldName: "address", oldValue: existingBuyer.address, newValue: newAddress });
      }
      if (existingBuyer.mandiCode !== newMandiCode) {
        changes.push({ fieldName: "mandiCode", oldValue: existingBuyer.mandiCode, newValue: newMandiCode });
      }
      if (existingBuyer.contact !== newContact) {
        changes.push({ fieldName: "contact", oldValue: existingBuyer.contact, newValue: newContact });
      }
      if (existingBuyer.negativeFlag !== newNegativeFlag) {
        changes.push({ fieldName: "negativeFlag", oldValue: String(existingBuyer.negativeFlag), newValue: String(newNegativeFlag) });
      }

      // If there are changes, record them
      if (changes.length > 0) {
        const nextSerial = await storage.getNextBuyerEditHistorySerialNumber(merchantId);
        for (const change of changes) {
          await storage.createBuyerEditHistory({
            serialNumber: nextSerial,
            merchantId,
            buyerId: id,
            changedBy: userId,
            fieldName: change.fieldName,
            oldValue: change.oldValue,
            newValue: change.newValue,
          });
        }
      }

      const result = await storage.updateBuyerWithPropagation(id, merchantId, {
        name: newName,
        address: newAddress,
        mandiCode: newMandiCode,
        contact: newContact,
      });

      // Also update negativeFlag if changed
      if (existingBuyer.negativeFlag !== newNegativeFlag) {
        await storage.updateBuyer(id, merchantId, { negativeFlag: newNegativeFlag });
      }

      if (!result.buyer) {
        return res.status(404).json({ message: "Buyer not found" });
      }

      res.json({
        buyer: result.buyer,
        transactionsUpdated: result.transactionsUpdated,
        changesRecorded: changes.length,
        message: `Buyer updated. ${result.transactionsUpdated} transaction(s) updated.`
      });
    } catch (error) {
      console.error("Error updating buyer with propagation:", error);
      res.status(500).json({ message: "Failed to update buyer" });
    }
  });

  // GET /api/buyers/:id/history - Get edit history for a buyer
  app.get("/api/buyers/:id/history", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const buyerId = parseInt(req.params.id);
      
      const history = await storage.getBuyerEditHistory(buyerId, merchantId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching buyer edit history:", error);
      res.status(500).json({ message: "Failed to fetch edit history" });
    }
  });

  // ===================== FARMER LEDGER ROUTES =====================

  // Helper function to generate farmer code
  function generateFarmerCode(dateStr: string, existingCount: number): string {
    return `FM${dateStr}${existingCount + 1}`;
  }

  // GET /api/farmers - Get all farmers with calculated dues for the authenticated merchant
  app.get("/api/farmers", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const farmerList = await storage.getFarmersByMerchant(merchantId);
      
      // Get all stock entries for harvest dues calculation
      const stockEntryList = await storage.getStockEntriesByMerchant(merchantId);
      
      // Get all seed transactions for seed dues calculation
      const seedTransactionList = await storage.getSeedTransactionsByMerchant(merchantId);
      
      // Get all lots for cold due calculation
      const allLots = await storage.getAllLotsByMerchant(merchantId);
      
      // Get all bag breakdowns for harvest due calculation
      const allBreakdowns = await storage.getAllBagBreakdownsByMerchant(merchantId);
      
      
      // Build a map of stockEntryId -> lots for cold charges calculation
      const lotsByEntryId = new Map<number, typeof allLots>();
      for (const lot of allLots) {
        const existing = lotsByEntryId.get(lot.stockEntryId) || [];
        existing.push(lot);
        lotsByEntryId.set(lot.stockEntryId, existing);
      }
      
      // Build a map of lotId -> bag breakdowns for harvest due calculation
      const breakdownsByLotId = new Map<number, typeof allBreakdowns>();
      for (const breakdown of allBreakdowns) {
        const existing = breakdownsByLotId.get(breakdown.lotId) || [];
        existing.push(breakdown);
        breakdownsByLotId.set(breakdown.lotId, existing);
      }
      
      // Calculate dues for each farmer - match by farmerId first, then fall back to composite key (name+contact)
      const farmersWithDues = farmerList.map(farmer => {
        const normalizedFarmerName = farmer.name.trim().toLowerCase();
        const normalizedFarmerContact = farmer.contact?.trim().toLowerCase() || null;
        
        // Calculate Harvest Due (sum of bag breakdown amounts - amount paid, from stock entries with status due/partial)
        let harvestDue = 0;
        // Calculate Cold Due (sum of Cold Charges/Ware House Charges from lot charges array)
        let coldDue = 0;
        
        for (const entry of stockEntryList) {
          // Match by farmerId first (primary), then fall back to composite key (for legacy data)
          const matchesByFarmerId = entry.farmerId === farmer.id;
          const entryName = entry.farmerName?.trim().toLowerCase() || "";
          const entryContact = entry.farmerContact?.trim().toLowerCase() || null;
          const matchesByCompositeKey = !entry.farmerId && entryName === normalizedFarmerName && entryContact === normalizedFarmerContact;
          
          if (matchesByFarmerId || matchesByCompositeKey) {
            // Only calculate harvest due for entries with "due" or "partial" payment status
            if (entry.paymentStatus === "due" || entry.paymentStatus === "partial") {
              // Get lots for this entry
              const entryLots = lotsByEntryId.get(entry.id) || [];
              let entryTotalCost = 0;
              let entryDeductions = 0;
              let entryAdjustment = 0;
              
              for (const lot of entryLots) {
                // Get breakdowns and calculate total cost using netWeight * pricePerKg (matches edit dialog formula)
                const lotBreakdowns = breakdownsByLotId.get(lot.id) || [];
                for (const bd of lotBreakdowns) {
                  if (bd.size !== "Wastage") {
                    const weight = parseFloat(bd.weight || "0");
                    const pricePerKg = parseFloat(bd.pricePerKg || "0");
                    // Net Weight = Total Weight - Number of Bags (matches edit dialog)
                    const netWeight = weight > 0 ? weight - bd.numberOfBags : 0;
                    if (netWeight > 0 && pricePerKg > 0) {
                      entryTotalCost += netWeight * pricePerKg;
                    }
                  }
                }
                
                // Fallback to lot-level data when no breakdown weight/price data exists
                const hasBreakdownData = lotBreakdowns.some(bd => {
                  if (bd.size === "Wastage") return false;
                  const w = parseFloat(bd.weight || "0");
                  const p = parseFloat(bd.pricePerKg || "0");
                  return w > 0 && p > 0;
                });
                if (!hasBreakdownData && lot.pricePerKg) {
                  const lotTotalWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
                  const price = parseFloat(lot.pricePerKg);
                  const netWeight = lotTotalWeight > 0 ? lotTotalWeight - lot.originalBags : 0;
                  if (netWeight > 0 && price > 0) {
                    entryTotalCost += netWeight * price;
                  }
                }
                
                // Calculate deductions (matches edit dialog formula): hammali/grading + all dynamic charges
                const hammaliGradingCharges = parseFloat(lot.hammaliGradingCharges || "0");
                // Parse lot.charges JSON array to get dynamic charges
                let dynamicCharges = 0;
                let lotColdCharges = 0;
                const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
                if (lot.charges) {
                  try {
                    const chargesArray = typeof lot.charges === 'string' ? JSON.parse(lot.charges) : lot.charges;
                    if (Array.isArray(chargesArray)) {
                      dynamicCharges = chargesArray.reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
                      // Sum only Cold Charges and Ware House Charges for cold due
                      lotColdCharges = chargesArray
                        .filter((c: any) => c && coldStoreTypes.includes(c.type))
                        .reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
                    }
                  } catch (e) {
                    // ignore parse errors
                  }
                }
                entryDeductions += hammaliGradingCharges + dynamicCharges;
                
                // Apply interest-only adjustment (principal is already included in total amount)
                if (lot.adjustedAmount && lot.adjustedAmountType) {
                  const principal = parseFloat(lot.adjustedAmount);
                  const adjustedAmountRate = lot.adjustedAmountRate ? parseFloat(lot.adjustedAmountRate) : 0;
                  const adjustedAmountEffectiveDate = lot.adjustedAmountEffectiveDate;
                  
                  let interestAmount = 0;
                  if (principal > 0 && adjustedAmountRate > 0 && adjustedAmountEffectiveDate) {
                    const effectiveDate = new Date(adjustedAmountEffectiveDate);
                    const today = new Date();
                    const days = Math.max(0, Math.floor((today.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24)));
                    const years = days / 365;
                    interestAmount = Math.round((principal * (Math.pow(1 + adjustedAmountRate / 100, years) - 1)) * 100) / 100;
                  }
                  
                  if (interestAmount > 0) {
                    if (lot.adjustedAmountType === "debit") {
                      entryAdjustment -= interestAmount;
                    } else if (lot.adjustedAmountType === "credit") {
                      entryAdjustment += interestAmount;
                    }
                  }
                }
                
                // Sum cold charges for cold due calculation (from Cold Charges/Ware House Charges in charges array)
                coldDue += lotColdCharges;
              }
              
              // Net Payable = Total Cost - Deductions + Adjustment (matches edit dialog formula)
              const netPayable = entryTotalCost - entryDeductions + entryAdjustment;
              // Harvest Due = Net Payable - Amount Paid
              const amountPaid = parseFloat(entry.amountPaid || "0");
              const entryDue = Math.max(0, netPayable - amountPaid);
              harvestDue += entryDue;
            } else {
              // For fully paid entries, still count cold charges from charges array
              const entryLots = lotsByEntryId.get(entry.id) || [];
              const coldStoreTypesElse = ["Cold Charges", "Ware House Charges"];
              for (const lot of entryLots) {
                if (lot.charges) {
                  try {
                    const chargesArray = typeof lot.charges === 'string' ? JSON.parse(lot.charges) : lot.charges;
                    if (Array.isArray(chargesArray)) {
                      coldDue += chargesArray
                        .filter((c: any) => c && coldStoreTypesElse.includes(c.type))
                        .reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
                    }
                  } catch (e) {
                    // ignore parse errors
                  }
                }
              }
            }
          }
        }
        
        // Calculate Seed Due (totalDueToFarmer from seed transactions where farmer matches by farmerId or composite key)
        let seedDue = 0;
        for (const txn of seedTransactionList) {
          // Match by farmerId first (primary), then fall back to composite key (for legacy data)
          const matchesByFarmerId = txn.farmerId === farmer.id;
          const txnName = txn.farmerName?.trim().toLowerCase() || "";
          const txnContact = txn.farmerContact?.trim().toLowerCase() || null;
          const matchesByCompositeKey = !txn.farmerId && txnName === normalizedFarmerName && txnContact === normalizedFarmerContact;
          
          if (matchesByFarmerId || matchesByCompositeKey) {
            seedDue += parseFloat(txn.totalDueToFarmer || "0");
          }
        }
        
        // PY Receivable with compound interest from farmer's own fields
        const pyPrincipal = parseFloat(farmer.pyReceivable || "0");
        const pyRoi = parseFloat(farmer.receivableInterestRate || "0");
        let pyReceivableWithInterest = pyPrincipal;
        if (pyPrincipal > 0 && pyRoi > 0 && farmer.receivableEffectiveDate) {
          pyReceivableWithInterest = computeCompoundInterestDue(pyPrincipal, pyRoi, farmer.receivableEffectiveDate);
        }
        
        // Net Due = PY Receivable (with interest) + Harvest Due - Seed Due
        const netDue = pyReceivableWithInterest + harvestDue - seedDue;
        
        return {
          ...farmer,
          harvestDue,
          seedDue,
          netDue,
          coldDue,
          pyReceivableWithInterest,
        };
      });
      
      res.json(farmersWithDues);
    } catch (error) {
      console.error("Error fetching farmers:", error);
      res.status(500).json({ message: "Failed to fetch farmers" });
    }
  });

  // GET /api/farmers/suggestions - Get farmer suggestions for auto-complete
  app.get("/api/farmers/suggestions", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const farmerList = await storage.getFarmersByMerchant(merchantId);
      
      // Return only the fields needed for auto-suggest
      const suggestions = farmerList.map(farmer => ({
        id: farmer.id,
        name: farmer.name,
        contact: farmer.contact || "",
        village: farmer.village || "",
        tehsil: farmer.tehsil || "",
        district: farmer.district || "",
        state: farmer.state || "",
      }));
      
      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching farmer suggestions:", error);
      res.status(500).json({ message: "Failed to fetch farmer suggestions" });
    }
  });

  // POST /api/farmers/sync - Sync farmers from stock entries and seed transactions
  app.post("/api/farmers/sync", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      
      // Get all existing farmers
      const existingFarmers = await storage.getFarmersByMerchant(merchantId);
      
      // Get all stock entries
      const stockEntryList = await storage.getStockEntriesByMerchant(merchantId);
      
      // Get all seed transactions  
      const seedTransactionList = await storage.getSeedTransactionsByMerchant(merchantId);
      
      // Collect unique farmers from stock entries
      // Use full composite key: name + contact + village (case-insensitive, trimmed)
      const farmerMap = new Map<string, { name: string; contact: string | null; village: string | null; tehsil: string | null; district: string | null; state: string | null }>();
      
      // Helper to create composite key from name + contact + village
      const makeKey = (name: string, contact: string | null, village: string | null) => {
        return [
          name.trim().toLowerCase(),
          contact?.trim().toLowerCase() || "",
          village?.trim().toLowerCase() || ""
        ].join("|");
      };
      
      // Process stock entries first (has mandatory farmer fields)
      for (const entry of stockEntryList) {
        if (entry.farmerName) {
          const key = makeKey(entry.farmerName, entry.farmerContact || null, entry.village || null);
          const existing = farmerMap.get(key);
          
          // Prefer entries with more complete data (tehsil, district, state)
          if (!existing || (entry.tehsil && !existing.tehsil)) {
            farmerMap.set(key, {
              name: titleCaseKeep(entry.farmerName.trim()),
              contact: entry.farmerContact?.trim() || null,
              village: titleCase(entry.village) || null,
              tehsil: titleCase(entry.tehsil) || existing?.tehsil || null,
              district: titleCase(entry.district) || existing?.district || null,
              state: titleCase(entry.state) || existing?.state || null,
            });
          }
        }
      }
      
      // Add farmers from seed transactions (only if not already present)
      for (const txn of seedTransactionList) {
        if (txn.farmerName) {
          const key = makeKey(txn.farmerName, txn.farmerContact || null, txn.village || null);
          const existing = farmerMap.get(key);
          
          if (!existing) {
            farmerMap.set(key, {
              name: titleCaseKeep(txn.farmerName.trim()),
              contact: txn.farmerContact?.trim() || null,
              village: titleCase(txn.village) || null,
              tehsil: titleCase(txn.tehsil) || null,
              district: titleCase(txn.district) || null,
              state: titleCase(txn.state) || null,
            });
          } else if (txn.tehsil && !existing.tehsil) {
            // Update with tehsil/district/state if missing
            farmerMap.set(key, {
              ...existing,
              tehsil: titleCase(txn.tehsil) || null,
              district: titleCase(txn.district) || existing.district || null,
              state: titleCase(txn.state) || existing.state || null,
            });
          }
        }
      }
      
      // Create or update farmers
      let createdCount = 0;
      let linkedCount = 0;
      const today = new Date().toISOString().split('T')[0];
      const dateStr = parseDateToCodeFormat(today);
      
      // Build a map of composite key (name+contact+village) -> farmerId for linking
      const farmerIdMap = new Map<string, number>();
      
      for (const data of Array.from(farmerMap.values())) {
        // Match by full composite key: name + contact + village
        let existing = await storage.getFarmerByCompositeKey(merchantId, data.name, data.contact, data.village);
        
        if (!existing) {
          const codePrefix = `FM${dateStr}`;
          const fmMaxRetries = 3;
          let createdFarmer: any = null;
          for (let attempt = 0; attempt < fmMaxRetries; attempt++) {
            const maxSeq = await storage.getMaxFarmerCodeSequence(merchantId, codePrefix);
            const farmerCode = `FM${dateStr}${maxSeq + 1 + attempt}`;
            try {
              createdFarmer = await storage.createFarmer({
                merchantId,
                farmerCode,
                dateAdded: today,
                name: data.name,
                contact: data.contact,
                village: data.village,
                tehsil: data.tehsil,
                district: data.district,
                state: data.state,
                pyReceivable: "0",
                negativeFlag: false,
                isArchived: false,
              });
              break;
            } catch (error: any) {
              if (error?.code === '23505' && error?.constraint?.includes('farmer_code') && attempt < fmMaxRetries - 1) {
                continue;
              }
              throw error;
            }
          }
          if (!createdFarmer) throw new Error("Failed to generate unique farmer code after multiple attempts");
          existing = createdFarmer;
          createdCount++;
        } else if (data.village && !existing.village) {
          // Update existing farmer with village data if missing
          await storage.updateFarmer(existing.id, merchantId, {
            village: data.village,
            tehsil: data.tehsil || existing.tehsil,
            district: data.district || existing.district,
            state: data.state || existing.state,
          });
        }
        
        // Store farmerId for linking using full composite key
        const key = makeKey(data.name, data.contact, data.village);
        farmerIdMap.set(key, existing.id);
      }
      
      // Link farmerId to stock entries that don't have one
      for (const entry of stockEntryList) {
        if (!entry.farmerId && entry.farmerName) {
          const key = makeKey(entry.farmerName, entry.farmerContact || null, entry.village || null);
          const farmerId = farmerIdMap.get(key);
          if (farmerId) {
            await storage.updateStockEntry(entry.id, merchantId, { farmerId });
            linkedCount++;
          }
        }
      }
      
      // Link farmerId to seed transactions that don't have one
      for (const txn of seedTransactionList) {
        if (!txn.farmerId && txn.farmerName) {
          const key = makeKey(txn.farmerName, txn.farmerContact || null, txn.village || null);
          const farmerId = farmerIdMap.get(key);
          if (farmerId) {
            await storage.updateSeedTransactionFarmerId(txn.id, merchantId, farmerId);
            linkedCount++;
          }
        }
      }
      
      res.json({ 
        message: `Synced farmers successfully. Created ${createdCount} new farmers, linked ${linkedCount} existing entries.`,
        createdCount,
        linkedCount,
        totalFarmers: existingFarmers.length + createdCount 
      });
    } catch (error) {
      console.error("Error syncing farmers:", error);
      res.status(500).json({ message: "Failed to sync farmers" });
    }
  });

  // POST /api/farmers/lookup-or-create - Find existing farmer or create new one based on composite key (name+contact+village)
  app.post("/api/farmers/lookup-or-create", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { name, contact, village, tehsil, district, state } = req.body;
      
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Farmer name is required" });
      }
      
      const result = await storage.lookupOrCreateFarmer(merchantId, {
        name: name.trim(),
        contact: contact?.trim() || null,
        village: village?.trim() || null,
        tehsil: tehsil?.trim() || null,
        district: district?.trim() || null,
        state: state?.trim() || null,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error in farmer lookup/create:", error);
      res.status(500).json({ message: "Failed to lookup or create farmer" });
    }
  });

  // PATCH /api/farmers/:id - Update a farmer (toggle negative flag, archive, PY balances)
  const updateFarmerSchema = insertFarmerSchema.omit({ merchantId: true }).partial();
  
  app.patch("/api/farmers/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      
      const validationResult = updateFarmerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const { negativeFlag, isArchived, pyReceivable } = validationResult.data;

      const farmer = await storage.updateFarmer(id, merchantId, {
        ...(negativeFlag !== undefined && { negativeFlag }),
        ...(isArchived !== undefined && { isArchived }),
        ...(pyReceivable !== undefined && { pyReceivable }),
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

  // GET /api/farmers/edit-history - Get farmer edit history
  app.get("/api/farmers/edit-history", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const history = await storage.getFarmerEditHistory(merchantId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching farmer edit history:", error);
      res.status(500).json({ message: "Failed to fetch farmer edit history" });
    }
  });

  // GET /api/farmers/:id/edit-history - Get edit history for a specific farmer
  app.get("/api/farmers/:id/edit-history", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const farmerId = parseInt(req.params.id);
      const history = await storage.getFarmerEditHistoryById(farmerId, merchantId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching farmer edit history:", error);
      res.status(500).json({ message: "Failed to fetch farmer edit history" });
    }
  });

  // PATCH /api/farmers/:id/details - Update farmer details with propagation to linked records
  app.patch("/api/farmers/:id/details", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const id = parseInt(req.params.id);
      const { name, contact, village, tehsil, district, state } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: "Farmer name is required" });
      }

      // Check if new details would match another existing farmer (merge detection)
      const existingFarmer = await storage.getFarmerByCompositeKey(
        merchantId,
        name,
        contact || null,
        village || null
      );

      if (existingFarmer && existingFarmer.id !== id) {
        // Return the existing farmer for merge confirmation
        return res.status(409).json({ 
          message: "Another farmer with these details already exists",
          existingFarmer,
          requiresMerge: true
        });
      }

      // Update farmer with propagation
      const result = await storage.updateFarmerWithPropagation(id, merchantId, userId, {
        name: titleCaseKeep(name.trim()),
        contact: contact?.trim() || null,
        village: titleCase(village) || null,
        tehsil: titleCase(tehsil) || null,
        district: titleCase(district) || null,
        state: titleCase(state) || null,
      });

      if (!result.farmer) {
        return res.status(404).json({ message: "Farmer not found" });
      }

      res.json({ 
        farmer: result.farmer, 
        changesLogged: result.changesLogged,
        message: result.changesLogged > 0 ? `${result.changesLogged} field(s) updated and propagated` : 'No changes detected'
      });
    } catch (error) {
      console.error("Error updating farmer details:", error);
      res.status(500).json({ message: "Failed to update farmer details" });
    }
  });

  // POST /api/farmers/merge - Merge two farmers, keeping the lower ID and aggregating balances
  app.post("/api/farmers/merge", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const { sourceId, targetId } = req.body;

      if (!sourceId || !targetId || sourceId === targetId) {
        return res.status(400).json({ message: "Valid source and target farmer IDs required" });
      }

      const result = await storage.mergeFarmers(merchantId, userId, sourceId, targetId);
      res.json({ 
        survivingFarmer: result.survivingFarmer,
        mergedCount: result.mergedCount,
        message: `Farmers merged successfully. ${result.mergedCount} linked records transferred.`
      });
    } catch (error) {
      console.error("Error merging farmers:", error);
      res.status(500).json({ message: "Failed to merge farmers" });
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
        supplierName: titleCaseKeep(data.supplierName),
        supplierContact: data.supplierContact || null,
        address: titleCase(data.address) || null,
        district: titleCase(data.district) || data.district,
        state: titleCase(data.state) || data.state,
        remarks: data.remarks || null,
        paymentStatus: "due",
      });

      // Create seed lots
      for (const lotData of data.seedLots) {
        await storage.createSeedLot({
          seedEntryId: seedEntry.id,
          merchantId,
          coldStoreName: titleCaseKeep(lotData.coldStoreName),
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
              coldStoreName: titleCase(lotData.coldStoreName) || lotData.coldStoreName,
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
              coldStoreName: titleCaseKeep(lotData.coldStoreName),
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
  // Note: Farmer fields are now read-only - they are managed via Farmer Ledger
  app.patch("/api/seed-transactions/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const id = parseInt(req.params.id);
      const { vehicleNumber, transportCharges, otherCharges, otherChargesRemarks, adjustmentType, adjustmentAmount, adjustmentRate, adjustmentEffectiveDate, adjustmentReason, items } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ message: "At least one seed lot item is required" });
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

      // Farmer fields are read-only and managed via Farmer Ledger - not updated here
      const transaction = await storage.updateSeedTransaction(
        id,
        merchantId,
        {
          vehicleNumber: vehicleNumber || null,
          transportCharges: transportTotal.toString(),
          otherCharges: otherTotal.toString(),
          otherChargesRemarks: otherChargesRemarks || null,
          totalBags,
          totalCost: totalCost.toString(),
          totalRevenue: totalRevenue.toString(),
          totalProfitLoss: totalProfitLoss.toString(),
          totalDueToFarmer: totalDueToFarmer.toString(),
          adjustmentType: adjustmentType || null,
          adjustmentAmount: adjustmentAmount ? adjustmentAmount.toString() : null,
          adjustmentRate: adjustmentRate ? adjustmentRate.toString() : null,
          adjustmentEffectiveDate: adjustmentEffectiveDate || null,
          adjustmentReason: adjustmentReason || null,
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
        { key: 'adjustmentType', label: 'Adjustment Type' },
        { key: 'adjustmentEffectiveDate', label: 'Adjustment Effective Date' },
        { key: 'adjustmentReason', label: 'Adjustment Reason' },
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
        { key: 'adjustmentAmount', label: 'Adjustment Amount' },
        { key: 'adjustmentRate', label: 'Adjustment Rate' },
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

      // Lookup or create farmer in farmer ledger
      const tcFarmerName = titleCaseKeep(farmerName);
      const { farmerId } = await storage.lookupOrCreateFarmer(merchantId, {
        name: tcFarmerName,
        contact: farmerContact || null,
        village: titleCase(village) || null,
        tehsil: titleCase(tehsil) || null,
        district: titleCase(district) || null,
        state: titleCase(state) || null,
      });

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
          farmerId,
          farmerName: tcFarmerName,
          farmerContact: farmerContact || null,
          village: titleCase(village) || null,
          tehsil: titleCase(tehsil) || null,
          district: titleCase(district) || district,
          state: titleCase(state) || state,
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
