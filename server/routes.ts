import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { stockEntryFormSchema, lotFormSchema, seedStockEntryFormSchema, seedStockEntryUpdateSchema, insertBuyerSchema, insertFarmerSchema, type ChangeSet, type ChangeItem, type FieldChange, ASSET_DEPRECIATION_RATES, insertAssetSchema, insertLiabilitySchema, insertLiabilityPaymentSchema, type InsertTransactionItem, type TransactionItem, cashEntries, sundryPayStakeholders } from "@shared/schema";
import { db } from "./db";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { formatDateForCode, generateMerchantCode, generateBuyerCode, generateTransactionCode, parseDateToCodeFormat } from "./codeGenerators";
import { getISTDateString, getISTDateYYYYMMDD, getISTYear, dateDiffInDaysIST, dateToISTString, calculateSimpleInterest } from './ist-utils';
import { computeNetWeight } from "@shared/utils";
import multer from "multer";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 },
});

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `header-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const imageUpload = multer({
  storage: imageStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const entryId = req.params.id || Date.now();
    cb(null, `attach-${entryId}-${Date.now()}${ext}`);
  },
});

const attachmentUpload = multer({
  storage: attachmentStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
  limits: { fileSize: 500 * 1024 },
});

function titleCase(str: string | null | undefined): string | null {
  if (!str) return null;
  return str.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function titleCaseKeep(str: string): string {
  return str.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Compute totalCharges and netPayable for a harvest lot based on its breakdowns and charge data
function computeHarvestLotCharges(lot: any) {
  const place = lot.place || "cold_store";
  const breakdowns = lot.bagBreakdowns || [];
  
  // Calculate cost of goods from bag breakdowns
  let costOfGoods = 0;
  const sellable = breakdowns.filter((bd: any) => bd.size !== "Wastage");
  const hasBdData = sellable.some((bd: any) => {
    const w = bd.weight ? parseFloat(bd.weight) : 0;
    const p = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
    return w > 0 && p > 0;
  });
  
  if (hasBdData) {
    for (const bd of sellable) {
      const weight = bd.weight ? parseFloat(bd.weight) : 0;
      const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
      const netWeight = computeNetWeight(weight, bd.numberOfBags, place);
      if (netWeight > 0 && price > 0) {
        costOfGoods += netWeight * price;
      }
    }
  } else {
    const lotWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
    const lotPrice = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
    const netWeight = computeNetWeight(lotWeight, lot.originalBags, place);
    if (netWeight > 0 && lotPrice > 0) {
      costOfGoods = netWeight * lotPrice;
    }
  }

  const wastageBags = breakdowns
    .filter((bd: any) => bd.size === "Wastage")
    .reduce((sum: number, bd: any) => sum + bd.numberOfBags, 0);
  const actualBags = lot.originalBags - wastageBags;

  if (place === "mandi") {
    const mandiPct = lot.mandiCommissionPercent ? parseFloat(lot.mandiCommissionPercent) : 0;
    const aadhatPct = lot.aadhatCommissionPercent ? parseFloat(lot.aadhatCommissionPercent) : 0;
    const hammaliRate = lot.hammaliPerBag ? parseFloat(lot.hammaliPerBag) : 0;
    const extraCharges = lot.mandiExtraCharges ? parseFloat(lot.mandiExtraCharges) : 0;
    const mandiCommission = costOfGoods * mandiPct / 100;
    const aadhatCommission = costOfGoods * aadhatPct / 100;
    const hammaliTotal = actualBags * hammaliRate;
    const totalCharges = mandiCommission + aadhatCommission + hammaliTotal + extraCharges;
    const netPayable = costOfGoods + totalCharges;
    return { totalCharges: totalCharges.toFixed(2), netPayable: netPayable.toFixed(2), earlyPayAmount: "0.00" };
  }
  
  // Farm Gate and Cold Store
  const isFarmGate = place === "farm_gate";
  const charges: Array<{type: string; amount: number | string}> = lot.charges || [];
  const hammaliGrading = lot.hammaliGradingCharges ? parseFloat(lot.hammaliGradingCharges) : 0;
  const coldStoreChargeTypes = ["Cold Charges", "Ware House Charges"];
  const dynamicCharges = charges
    .filter((c: any) => !(isFarmGate && coldStoreChargeTypes.includes(c.type)))
    .reduce((sum: number, c: any) => sum + (parseFloat(String(c.amount)) || 0), 0);
  let totalDeductions = hammaliGrading + dynamicCharges;

  const earlyPayPct = lot.earlyPayPercent ? parseFloat(lot.earlyPayPercent) : 0;
  const earlyPayBase = costOfGoods - totalDeductions;
  const earlyPayAmount = earlyPayPct > 0 && earlyPayBase > 0 ? earlyPayBase * earlyPayPct / 100 : 0;
  totalDeductions += earlyPayAmount;
  
  // Adjustment: use only the interest portion (adjustedAmountFinal - adjustedAmount)
  // Principal is already part of charges/deductions, so only interest affects net payable
  const adjType = lot.adjustedAmountType;
  const adjPrincipal = lot.adjustedAmount ? parseFloat(lot.adjustedAmount) : 0;
  const adjFinal = lot.adjustedAmountFinal ? parseFloat(lot.adjustedAmountFinal) : adjPrincipal;
  const interestOnly = adjFinal - adjPrincipal;
  const signedAdj = adjType === "credit" ? interestOnly : adjType === "debit" ? -interestOnly : 0;
  
  const totalCharges = totalDeductions;
  const netPayable = costOfGoods - totalDeductions + signedAdj;
  return { totalCharges: totalCharges.toFixed(2), netPayable: netPayable.toFixed(2), earlyPayAmount: earlyPayAmount.toFixed(2) };
}

// After creating/updating lots and breakdowns, recompute and store totalCharges and netPayable
async function recomputeHarvestLotCharges(entryId: number, merchantId: number) {
  const entry = await storage.getStockEntryById(entryId, merchantId);
  if (!entry) return;
  for (const lot of entry.lots) {
    const { totalCharges, netPayable, earlyPayAmount } = computeHarvestLotCharges(lot);
    const breakdowns = lot.bagBreakdowns || [];
    const { breakdownCosts, totalCogs } = storage.computeBreakdownCosts(lot, breakdowns);
    for (const bd of breakdowns) {
      const cpb = breakdownCosts.get(bd.id) || 0;
      await storage.updateBagBreakdown(bd.id, merchantId, { costPerBag: cpb.toFixed(2) });
    }
    await storage.updateLot(lot.id, merchantId, {
      totalCharges,
      netPayable,
      totalCogs: totalCogs.toFixed(2),
      earlyPayAmount,
    });
  }
}

// Compute totalCharges, netPayable, avgCostPerBag for a seed lot
function computeSeedLotCharges(lot: any) {
  const bags = lot.originalBags || 0;
  const pricePerBag = lot.pricePerBag ? parseFloat(lot.pricePerBag) : 0;
  const coldStorePerBag = lot.coldStoreChargesPerBag ? parseFloat(lot.coldStoreChargesPerBag) : 0;
  const costOfGoods = bags * pricePerBag;
  
  const hammali = lot.hammaliCharges ? parseFloat(lot.hammaliCharges) : 0;
  const grading = lot.gradingCharges ? parseFloat(lot.gradingCharges) : 0;
  const transport = lot.transportCharges ? parseFloat(lot.transportCharges) : 0;
  const totalCharges = hammali + grading + transport;
  const coldStoreTotal = bags * coldStorePerBag;
  const netPayable = costOfGoods + totalCharges;
  const avgCostPerBag = bags > 0 ? (netPayable + coldStoreTotal) / bags : 0;
  
  return {
    totalCharges: totalCharges.toFixed(2),
    netPayable: netPayable.toFixed(2),
    avgCostPerBag: avgCostPerBag.toFixed(2),
  };
}

// After creating/updating seed lots, recompute and store totalCharges, netPayable, avgCostPerBag
async function recomputeSeedLotCharges(entryId: number, merchantId: number) {
  const entry = await storage.getSeedEntryById(entryId, merchantId);
  if (!entry) return;
  for (const lot of entry.seedLots) {
    const { totalCharges, netPayable, avgCostPerBag } = computeSeedLotCharges(lot);
    await storage.updateSeedLot(lot.id, merchantId, {
      totalCharges,
      netPayable,
      avgCostPerBag,
    });
  }
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // One-time backfill: compute per-breakdown costPerBag and lot totalCogs
  (async () => {
    try {
      const { db } = await import("./db");
      const { stockEntries } = await import("@shared/schema");
      const allEntries = await db.select({ id: stockEntries.id, merchantId: stockEntries.merchantId })
        .from(stockEntries);
      let updatedBd = 0;
      let updatedLots = 0;
      for (const entry of allEntries) {
        const full = await storage.getStockEntryById(entry.id, entry.merchantId);
        if (!full) continue;
        for (const lot of full.lots) {
          const breakdowns = lot.bagBreakdowns || [];
          const { breakdownCosts, totalCogs } = storage.computeBreakdownCosts(lot, breakdowns);
          for (const bd of breakdowns) {
            const cpb = breakdownCosts.get(bd.id) || 0;
            const existingCpb = bd.costPerBag ? parseFloat(bd.costPerBag) : 0;
            if (Math.abs(cpb - existingCpb) > 0.01) {
              await storage.updateBagBreakdown(bd.id, entry.merchantId, { costPerBag: cpb.toFixed(2) });
              updatedBd++;
            }
          }
          const existingCogs = lot.totalCogs ? parseFloat(lot.totalCogs) : 0;
          if (Math.abs(totalCogs - existingCogs) > 0.01) {
            await storage.updateLot(lot.id, entry.merchantId, { totalCogs: totalCogs.toFixed(2) });
            updatedLots++;
          }
        }
      }
      if (updatedBd > 0 || updatedLots > 0) console.log(`[backfill] Updated ${updatedBd} breakdown costPerBag, ${updatedLots} lot totalCogs`);
    } catch (err) {
      console.error("[backfill] Error backfilling breakdown costs:", err);
    }
  })();

  // One-time backfill: recompute seed lot avgCostPerBag to include cold store charges
  (async () => {
    try {
      const { db } = await import("./db");
      const { seedStockEntries } = await import("@shared/schema");
      const allSeedEntries = await db.select({ id: seedStockEntries.id, merchantId: seedStockEntries.merchantId })
        .from(seedStockEntries);
      let updatedSeedLots = 0;
      for (const entry of allSeedEntries) {
        const full = await storage.getSeedEntryById(entry.id, entry.merchantId);
        if (!full) continue;
        for (const lot of full.seedLots) {
          const { avgCostPerBag } = computeSeedLotCharges(lot);
          const existing = lot.avgCostPerBag ? parseFloat(lot.avgCostPerBag) : 0;
          if (Math.abs(parseFloat(avgCostPerBag) - existing) > 0.01) {
            await storage.updateSeedLot(lot.id, entry.merchantId, { avgCostPerBag });
            updatedSeedLots++;
          }
        }
      }
      if (updatedSeedLots > 0) console.log(`[backfill] Updated ${updatedSeedLots} seed lot avgCostPerBag`);
    } catch (err) {
      console.error("[backfill] Error backfilling seed lot costs:", err);
    }
  })();

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

      const [allEntries, allLots, allBreakdowns, allTransactions, allSeedTransactions, allBuyers, allFarmers, allCashFarmers] = await Promise.all([
        storage.getStockEntriesByMerchant(merchantId),
        storage.getAllLotsByMerchant(merchantId),
        storage.getAllBagBreakdownsByMerchant(merchantId),
        storage.getTransactionsByMerchant(merchantId),
        storage.getSeedTransactionsByMerchant(merchantId),
        storage.getBuyersByMerchant(merchantId),
        storage.getFarmersByMerchant(merchantId),
        storage.getCashFarmersByMerchant(merchantId),
      ]);

      const buyerIdToName = new Map<number, string>();
      for (const b of allBuyers) {
        buyerIdToName.set(b.id, b.name);
      }

      const lotsMap = new Map<number, any[]>();
      const mandiEntryIds = new Set<number>();
      for (const lot of allLots) {
        const arr = lotsMap.get(lot.stockEntryId) || [];
        arr.push(lot);
        lotsMap.set(lot.stockEntryId, arr);
        if (lot.place === "mandi") {
          mandiEntryIds.add(lot.stockEntryId);
        }
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
      let summaryMandiTotal = 0;
      let summaryMandiDue = 0;
      const aadhatBagsMap = new Map<string, number>();
      const aadhatDueMap = new Map<string, number>();

      for (const entry of filteredEntries) {
        if (mandiEntryIds.has(entry.id)) {
          const dateKey = entry.purchaseDate;
          const entryLots = lotsMap.get(entry.id) || [];
          let entryNetPayable = 0;
          let entryBags = 0;
          let entryVolume = 0;
          for (const lot of entryLots) {
            entryNetPayable += parseFloat(lot.netPayable || "0");
            const lotBreakdowns = breakdownsMap.get(lot.id) || [];
            entryBags += lotBreakdowns.reduce((s: number, bd: any) => s + (bd.numberOfBags || 0), 0);
            if (entryBags === 0) entryBags += lot.originalBags;
            const sellable = lotBreakdowns.filter((bd: any) => bd.size !== "Wastage");
            const hasBreakdownData = sellable.some((bd: any) => {
              const w = bd.weight ? parseFloat(bd.weight) : 0;
              const p = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
              return w > 0 && p > 0;
            });
            if (hasBreakdownData) {
              for (const bd of sellable) {
                entryVolume += bd.weight ? parseFloat(bd.weight) : 0;
              }
            } else {
              entryVolume += lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
            }
          }
          volumeMap.set(dateKey, (volumeMap.get(dateKey) || 0) + entryVolume);
          const amountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
          const entryDue = Math.max(entryNetPayable - amountPaid, 0);
          summaryMandiTotal += entryNetPayable;
          summaryMandiDue += entryDue;
          const aadhatLabel = entry.aadhatName || "Unknown";
          aadhatBagsMap.set(aadhatLabel, (aadhatBagsMap.get(aadhatLabel) || 0) + entryBags);
          aadhatDueMap.set(aadhatLabel, (aadhatDueMap.get(aadhatLabel) || 0) + entryDue);
          continue;
        }
        const dateKey = entry.purchaseDate;
        const entryLots = lotsMap.get(entry.id) || [];

        let entryNetPayable = 0;
        let entryVolume = 0;

        for (const lot of entryLots) {
          entryNetPayable += parseFloat(lot.netPayable || "0");

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
            }
          } else {
            const lotTotalWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
            entryVolume += lotTotalWeight;
          }

          const coldStoreChargeTypes = ["Cold Charges", "Ware House Charges"];
          const lotColdCharges = (lot.charges || [])
            .filter((c: any) => c && coldStoreChargeTypes.includes(c.type))
            .reduce((sum: number, c: any) => sum + (parseFloat(String(c.amount)) || 0), 0);
          const lotColdPaid = lot.coldStorageChargesPaid ? parseFloat(lot.coldStorageChargesPaid) : 0;
          summaryColdStoreTotalCharges += lotColdCharges;
          summaryColdStoreDue += Math.max(lotColdCharges - lotColdPaid, 0);
        }

        const amountPaid = entry.amountPaid ? parseFloat(entry.amountPaid) : 0;
        const farmerDue = Math.max(entryNetPayable - amountPaid, 0);

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

        if (revenue > 0) {
          const profitLoss = tx.profitLoss ? parseFloat(tx.profitLoss) : 0;
          pnlMap.set(dateKey, (pnlMap.get(dateKey) || 0) + profitLoss);
        }
      }

      for (const buyer of allBuyers) {
        const receivable = parseFloat(buyer.receivableBalance || "0");
        if (receivable > 0) {
          summaryBuyerTotalDue += receivable;
          const buyerKey = String(buyer.id);
          buyerDueByNameMap.set(buyerKey, (buyerDueByNameMap.get(buyerKey) || 0) + receivable);
        }
      }

      const perFarmerSeedDue = new Map<string, number>();
      for (const seedTx of allSeedTransactions) {
        if (!seedTx.createdAt) continue;
        if (crop === "onion") continue;
        const dateKey = dateToISTString(new Date(seedTx.createdAt));
        if (!matchesDateFilter(dateKey)) continue;
        const seedRevenue = seedTx.totalRevenue ? parseFloat(seedTx.totalRevenue) : 0;
        if (seedRevenue > 0) {
          const totalPL = seedTx.totalProfitLoss ? parseFloat(seedTx.totalProfitLoss) : 0;
          pnlMap.set(dateKey, (pnlMap.get(dateKey) || 0) + totalPL);
        }

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

      const sortedFarmerDueDates = Array.from(farmerDueMap.keys()).sort();
      let cumulativeFarmerDue = 0;
      const farmerDueTimeSeries = sortedFarmerDueDates.map(date => {
        cumulativeFarmerDue += farmerDueMap.get(date)!;
        return { date, amount: Math.round(cumulativeFarmerDue * 100) / 100 };
      });

      const sortedBuyerDueDates = Array.from(buyerDueMap.keys()).sort();
      let cumulativeBuyerDue = 0;
      const buyerDueTimeSeries = sortedBuyerDueDates.map(date => {
        cumulativeBuyerDue += buyerDueMap.get(date)!;
        return { date, amount: Math.round(cumulativeBuyerDue * 100) / 100 };
      });

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

      let farmerPyReceivableTotal = 0;
      let farmerPyReceivableDue = 0;
      for (const farmer of allFarmers) {
        const remaining = parseFloat(farmer.remainingReceivable || "0");
        if (remaining > 0) {
          farmerPyReceivableTotal += remaining;
          farmerPyReceivableDue += remaining;
        }
      }

      let buyerPyReceivableTotal = 0;
      let buyerPyReceivableDue = 0;
      for (const buyer of allBuyers) {
        const receivable = parseFloat(buyer.receivableBalance || "0");
        if (receivable > 0) {
          buyerPyReceivableTotal += receivable;
          buyerPyReceivableDue += receivable;
        }
      }

      const coldStoresWithDue = await storage.getColdStoresWithDue(merchantId);
      const coldStoreLedgerTotalDue = coldStoresWithDue.reduce((sum, cs) => sum + cs.totalDue, 0);

      const allSeedEntriesForCS = await storage.getSeedEntriesByMerchant(merchantId);
      for (const seedEntry of allSeedEntriesForCS) {
        for (const sLot of (seedEntry.seedLots || [])) {
          const chargesPerBag = parseFloat(sLot.coldStoreChargesPerBag || "0");
          const seedColdCharges = chargesPerBag * (sLot.originalBags || 0);
          const seedColdPaid = parseFloat(sLot.coldStoreChargesPaid || "0");
          summaryColdStoreTotalCharges += seedColdCharges;
          summaryColdStoreDue += Math.max(seedColdCharges - seedColdPaid, 0);
        }
      }

      const allColdStoreRecords = await storage.getColdStoresByMerchant(merchantId);
      for (const cs of allColdStoreRecords) {
        summaryColdStoreTotalCharges += parseFloat(cs.originalPyPayable || "0");
      }

      const aadhatBagsByName = Array.from(aadhatBagsMap.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name: name.length > 15 ? name.substring(0, 15) + "..." : name, value }));

      const aadhatDueByName = Array.from(aadhatDueMap.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name: name.length > 15 ? name.substring(0, 15) + "..." : name, value: Math.round(value) }));

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
          coldStoreLedgerDue: Math.round(coldStoreLedgerTotalDue),
          buyerTotalRevenue: Math.round(summaryBuyerTotalRevenue),
          buyerTotalDue: Math.round(summaryBuyerTotalDue),
          farmerPyReceivableTotal: Math.round(farmerPyReceivableTotal),
          farmerPyReceivableDue: Math.round(farmerPyReceivableDue),
          buyerPyReceivableTotal: Math.round(buyerPyReceivableTotal),
          buyerPyReceivableDue: Math.round(buyerPyReceivableDue),
          mandiTotal: Math.round(summaryMandiTotal),
          mandiDue: Math.round(summaryMandiDue),
        },
        farmerDueByCrop,
        buyerDueByName,
        aadhatBagsByName,
        aadhatDueByName,
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
      const entryPlace = data.place || data.lots?.[0]?.place || "cold_store";

      let farmerId: number | null = null;
      let farmerName = "";
      let farmerContact: string | null = null;
      let village: string | null = null;
      let tehsil: string | null = null;
      let district: string = "";
      let state: string = "";
      let aadhatDbId: number | null = null;
      let aadhatName: string | null = null;

      if (entryPlace === "mandi") {
        aadhatDbId = data.aadhatDbId || null;
        aadhatName = data.aadhatName || null;
        farmerName = data.aadhatName || "Mandi Entry";
        district = "Mandi";
        state = "Madhya Pradesh";
      } else {
        const farmerResult = await storage.lookupOrCreateFarmer(merchantId, {
          name: titleCaseKeep(data.farmerName!),
          contact: data.farmerContact || null,
          village: titleCase(data.village) || null,
          tehsil: titleCase(data.tehsil) || null,
          district: titleCase(data.district) || null,
          state: titleCase(data.state) || null,
        });
        farmerId = farmerResult.farmerId;
        farmerName = titleCaseKeep(data.farmerName!);
        farmerContact = data.farmerContact || null;
        village = titleCase(data.village) || null;
        tehsil = titleCase(data.tehsil) || null;
        district = titleCase(data.district) || data.district || "";
        state = titleCase(data.state) || data.state || "";
      }

      // Create stock entry
      const stockEntry = await storage.createStockEntry({
        merchantId,
        crop: entryCrop,
        purchaseDate: data.purchaseDate,
        place: entryPlace,
        farmerId,
        farmerName,
        farmerContact,
        village,
        tehsil,
        district,
        state,
        aadhatDbId,
        aadhatName,
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
          coldStoreDbId: lotData.place === "cold_store" ? (lotData.coldStoreDbId || null) : null,
          coldStoreLotNumber: lotData.place === "cold_store" ? (lotData.coldStoreLotNumber || null) : null,
          crop: lotData.crop || "potato",
          originalBags: lotData.originalBags,
          potatoType: lotData.crop === "potato" ? (lotData.potatoType || null) : null,
          harvestPotatoType: lotData.crop === "potato" ? (lotData.harvestPotatoType || null) : null,
          bagType: lotData.bagType || "",
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
          mandiCommissionPercent: lotData.mandiCommissionPercent ? lotData.mandiCommissionPercent.toString() : null,
          aadhatCommissionPercent: lotData.aadhatCommissionPercent ? lotData.aadhatCommissionPercent.toString() : null,
          hammaliPerBag: lotData.hammaliPerBag ? lotData.hammaliPerBag.toString() : null,
          mandiExtraCharges: lotData.mandiExtraCharges ? lotData.mandiExtraCharges.toString() : null,
          earlyPayPercent: lotData.earlyPayPercent != null ? lotData.earlyPayPercent.toString() : null,
          remainingBags: lotData.originalBags,
        });

        // Create bag breakdowns for both cut types
        if (lotData.bagBreakdowns) {
          for (let bdIdx = 0; bdIdx < lotData.bagBreakdowns.length; bdIdx++) {
            const bdData = lotData.bagBreakdowns[bdIdx];
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
              sortOrder: bdIdx,
            });
          }
        }
      }

      // Compute and store totalCharges and netPayable for all lots
      await recomputeHarvestLotCharges(stockEntry.id, merchantId);

      // Fetch the complete entry with lots and breakdowns
      const completeEntry = await storage.getStockEntryById(stockEntry.id, merchantId);
      res.status(201).json(completeEntry);
    } catch (error) {
      console.error("Error creating stock entry:", error);
      res.status(500).json({ message: "Failed to create stock entry" });
    }
  });

  app.post("/api/stock-entries/:id/image", requireMerchant, (req: Request, res: Response, next) => {
    attachmentUpload.single("image")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "File too large. Maximum size is 500KB." });
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      }
      if (err) return res.status(400).json({ message: err.message || "Invalid file type. Only images are allowed." });
      next();
    });
  }, async (req: Request, res: Response) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const entry = await storage.getStockEntryById(id, merchantId);
      if (!entry) {
        if (req.file) await fsPromises.unlink(path.join(uploadsDir, req.file.filename)).catch(() => {});
        return res.status(404).json({ message: "Stock entry not found" });
      }
      if (!req.file) return res.status(400).json({ message: "No image file provided" });
      if (entry.attachmentImage) {
        const oldPath = path.join(uploadsDir, entry.attachmentImage);
        await fsPromises.unlink(oldPath).catch(() => {});
      }
      const ext = path.extname(req.file.originalname);
      const finalName = `${entry.uniqueId || `SE${id}`}${ext}`;
      const oldFilePath = path.join(uploadsDir, req.file.filename);
      const newFilePath = path.join(uploadsDir, finalName);
      await fsPromises.rename(oldFilePath, newFilePath);
      await storage.updateStockEntryImage(id, merchantId, finalName);
      res.json({ filename: finalName });
    } catch (error) {
      console.error("Error uploading stock entry image:", error);
      res.status(500).json({ message: "Failed to upload image" });
    }
  });

  app.get("/api/stock-entries/:id/image", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const entry = await storage.getStockEntryById(id, merchantId);
      if (!entry || !entry.attachmentImage) return res.status(404).json({ message: "No image found" });
      const filePath = path.join(uploadsDir, entry.attachmentImage);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Image file not found" });
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving stock entry image:", error);
      res.status(500).json({ message: "Failed to serve image" });
    }
  });

  app.delete("/api/stock-entries/:id/image", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const entry = await storage.getStockEntryById(id, merchantId);
      if (!entry) return res.status(404).json({ message: "Stock entry not found" });
      if (entry.attachmentImage) {
        const filePath = path.join(uploadsDir, entry.attachmentImage);
        await fsPromises.unlink(filePath).catch(() => {});
      }
      await storage.updateStockEntryImage(id, merchantId, null);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting stock entry image:", error);
      res.status(500).json({ message: "Failed to delete image" });
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
      const validChargeTypes = ["Advance", "Bag Charges", "Cold Charges", "Early Pay/Bataw", "Freight Charges", "Grading Charges", "Hammali Charges", "Kata Charges", "Other Charges", "Pesticide Charges", "Ware House Charges"];
      if (lots && Array.isArray(lots)) {
        for (const lot of lots) {
          if (lot.charges && Array.isArray(lot.charges)) {
            // Filter out empty charges and Early Pay/Bataw (handled via earlyPayPercent)
            lot.charges = lot.charges.filter((charge: any) => charge.type && charge.type.length > 0 && charge.type !== "Early Pay/Bataw");
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
            if (existingLot && lotData.earlyPayPercent !== undefined) {
              compareField('earlyPayPercent', existingLot.earlyPayPercent, lotData.earlyPayPercent, lotLabel, 'lot', lotData.id);
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
            if (existingLot && lotData.mandiCommissionPercent !== undefined) {
              compareField('mandiCommissionPercent', existingLot.mandiCommissionPercent, lotData.mandiCommissionPercent, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.aadhatCommissionPercent !== undefined) {
              compareField('aadhatCommissionPercent', existingLot.aadhatCommissionPercent, lotData.aadhatCommissionPercent, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.hammaliPerBag !== undefined) {
              compareField('hammaliPerBag', existingLot.hammaliPerBag, lotData.hammaliPerBag, lotLabel, 'lot', lotData.id);
            }
            if (existingLot && lotData.mandiExtraCharges !== undefined) {
              compareField('mandiExtraCharges', existingLot.mandiExtraCharges, lotData.mandiExtraCharges, lotLabel, 'lot', lotData.id);
            }

            // Track charges array changes
            if (existingLot && lotData.charges !== undefined) {
              const oldCharges: Array<{type: string; amount: number}> = (existingLot.charges as any) || [];
              const newCharges: Array<{type: string; amount: number}> = lotData.charges || [];
              const oldMap = new Map(oldCharges.map(c => [c.type, c.amount]));
              const newMap = new Map(newCharges.map(c => [c.type, c.amount]));

              // Detect added or modified charges
              for (const nc of newCharges) {
                const oldAmt = oldMap.get(nc.type);
                if (oldAmt === undefined) {
                  compareField(`charge:${nc.type}`, null, nc.amount, lotLabel, 'lot', lotData.id);
                } else if (oldAmt !== nc.amount) {
                  compareField(`charge:${nc.type}`, oldAmt, nc.amount, lotLabel, 'lot', lotData.id);
                }
              }
              // Detect removed charges
              for (const oc of oldCharges) {
                if (!newMap.has(oc.type)) {
                  compareField(`charge:${oc.type}`, oc.amount, null, lotLabel, 'lot', lotData.id);
                }
              }
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
              adjustedAmountFinal: (() => {
                const effectivePrincipal = lotData.adjustedAmount !== undefined ? lotData.adjustedAmount : existingLot?.adjustedAmount;
                if (!effectivePrincipal) return lotData.adjustedAmount !== undefined ? null : undefined;
                const effectiveRate = lotData.adjustedAmountRate !== undefined ? lotData.adjustedAmountRate : existingLot?.adjustedAmountRate;
                const effectiveDate = lotData.adjustedAmountEffectiveDate !== undefined ? lotData.adjustedAmountEffectiveDate : existingLot?.adjustedAmountEffectiveDate;
                return calculateSimpleInterest(
                  parseFloat(String(effectivePrincipal)),
                  parseFloat(String(effectiveRate || "0")),
                  effectiveDate || null
                ).toFixed(2);
              })(),
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
              coldStoreDbId: lotData.coldStoreDbId !== undefined
                ? (lotData.coldStoreDbId || null)
                : undefined,
              coldStoreLotNumber: lotData.coldStoreLotNumber !== undefined
                ? (lotData.coldStoreLotNumber || null)
                : undefined,
              charges: lotData.charges !== undefined
                ? (lotData.charges && lotData.charges.length > 0 ? lotData.charges : null)
                : undefined,
              mandiCommissionPercent: lotData.mandiCommissionPercent !== undefined
                ? (lotData.mandiCommissionPercent ? lotData.mandiCommissionPercent.toString() : null)
                : undefined,
              aadhatCommissionPercent: lotData.aadhatCommissionPercent !== undefined
                ? (lotData.aadhatCommissionPercent ? lotData.aadhatCommissionPercent.toString() : null)
                : undefined,
              hammaliPerBag: lotData.hammaliPerBag !== undefined
                ? (lotData.hammaliPerBag ? lotData.hammaliPerBag.toString() : null)
                : undefined,
              mandiExtraCharges: lotData.mandiExtraCharges !== undefined
                ? (lotData.mandiExtraCharges ? lotData.mandiExtraCharges.toString() : null)
                : undefined,
              earlyPayPercent: lotData.earlyPayPercent !== undefined
                ? (lotData.earlyPayPercent != null ? lotData.earlyPayPercent.toString() : null)
                : undefined,
            });

            // Handle bag breakdowns for both cut types
            if (lotData.bagBreakdowns) {
              const existingBreakdowns = existingLot?.bagBreakdowns || [];
              const existingIds = new Set<number>(existingBreakdowns.map((b: any) => b.id));

              for (let bdIdx = 0; bdIdx < lotData.bagBreakdowns.length; bdIdx++) {
                const bdData = lotData.bagBreakdowns[bdIdx];
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
                    let cappedRemaining = bdData.remainingBags !== undefined ? bdData.remainingBags : bdData.numberOfBags;
                    if (bdData.size !== "Wastage") {
                      cappedRemaining = Math.min(cappedRemaining, bdData.numberOfBags);
                    }
                    compareField('remainingBags', existingBd.remainingBags, cappedRemaining, bdLabel, 'breakdown', bdData.id);
                    compareField('weight', existingBd.weight, weight > 0 ? weight : null, bdLabel, 'breakdown', bdData.id);
                    compareField('pricePerKg', existingBd.pricePerKg, pricePerKg > 0 ? pricePerKg : null, bdLabel, 'breakdown', bdData.id);
                  }

                  // Update existing breakdown
                  let newRemaining = bdData.remainingBags !== undefined ? bdData.remainingBags : bdData.numberOfBags;
                  if (bdData.size !== "Wastage") {
                    newRemaining = Math.min(newRemaining, bdData.numberOfBags);
                  }
                  await storage.updateBagBreakdown(bdData.id, merchantId, {
                    size: bdData.size,
                    numberOfBags: bdData.numberOfBags,
                    remainingBags: newRemaining,
                    weight: weight > 0 ? weight.toString() : null,
                    pricePerKg: pricePerKg > 0 ? pricePerKg.toString() : null,
                    totalAmount: totalAmount > 0 ? totalAmount.toString() : null,
                    sortOrder: bdIdx,
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
                    sortOrder: bdIdx,
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

      // Recompute and store totalCharges and netPayable for all lots
      await recomputeHarvestLotCharges(id, merchantId);

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
      const dateStr = formatDateForCode();
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

  app.post("/api/admin/merchants/:id/receipt-header", requireSystemAdmin, imageUpload.single("image"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }
      const merchant = await storage.getMerchantById(id);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      if (merchant.receiptHeaderImage) {
        const oldPath = path.join(uploadsDir, merchant.receiptHeaderImage);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      const updated = await storage.updateMerchant(id, { receiptHeaderImage: req.file.filename });
      res.json(updated);
    } catch (error) {
      console.error("Error uploading receipt header:", error);
      res.status(500).json({ message: "Failed to upload receipt header image" });
    }
  });

  app.delete("/api/admin/merchants/:id/receipt-header", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const merchant = await storage.getMerchantById(id);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      if (merchant.receiptHeaderImage) {
        const filePath = path.join(uploadsDir, merchant.receiptHeaderImage);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      const updated = await storage.updateMerchant(id, { receiptHeaderImage: null });
      res.json(updated);
    } catch (error) {
      console.error("Error deleting receipt header:", error);
      res.status(500).json({ message: "Failed to delete receipt header image" });
    }
  });

  app.get("/api/merchants/:id/receipt-header", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!req.user!.isSystemAdmin && id !== req.user!.merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const merchant = await storage.getMerchantById(id);
      if (!merchant || !merchant.receiptHeaderImage) {
        return res.status(404).json({ message: "No header image" });
      }
      const filename = merchant.receiptHeaderImage;
      if (filename.includes("..") || filename.includes("/")) {
        return res.status(400).json({ message: "Invalid filename" });
      }
      const filePath = path.join(uploadsDir, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving receipt header:", error);
      res.status(500).json({ message: "Failed to serve receipt header" });
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
      
      // Verify admin password against ADMIN_PASSWORD env var for system admin users
      const envAdminPassword = process.env.ADMIN_PASSWORD;
      if (!envAdminPassword || !adminPassword) {
        return res.status(401).json({ message: "Invalid admin password" });
      }
      const { timingSafeEqual } = await import("crypto");
      const suppliedBuf = Buffer.from(adminPassword);
      const storedBuf = Buffer.from(envAdminPassword);
      if (suppliedBuf.length !== storedBuf.length || !timingSafeEqual(suppliedBuf, storedBuf)) {
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
      
      // Verify admin password against ADMIN_PASSWORD env var for system admin users
      const envAdminPassword = process.env.ADMIN_PASSWORD;
      if (!envAdminPassword || !adminPassword) {
        return res.status(401).json({ message: "Invalid admin password" });
      }
      const { timingSafeEqual } = await import("crypto");
      const suppliedBuf = Buffer.from(adminPassword);
      const storedBuf = Buffer.from(envAdminPassword);
      if (suppliedBuf.length !== storedBuf.length || !timingSafeEqual(suppliedBuf, storedBuf)) {
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

  app.post("/api/admin/recalculate-lot-payables", requireSystemAdmin, async (req, res) => {
    try {
      const allMerchants = await storage.getAllMerchants();
      let harvestUpdated = 0;
      let seedUpdated = 0;

      for (const merchant of allMerchants) {
        const entries = await storage.getStockEntriesByMerchant(merchant.id);
        for (const entry of entries) {
          for (const lot of entry.lots) {
            const { totalCharges, netPayable } = computeHarvestLotCharges(lot);
            await storage.updateLot(lot.id, merchant.id, { totalCharges, netPayable });
            harvestUpdated++;
          }
        }

        const seedEntries = await storage.getSeedEntriesByMerchant(merchant.id);
        for (const seedEntry of seedEntries) {
          for (const lot of seedEntry.seedLots) {
            const { totalCharges, netPayable, avgCostPerBag } = computeSeedLotCharges(lot);
            await storage.updateSeedLot(lot.id, merchant.id, { totalCharges, netPayable, avgCostPerBag });
            seedUpdated++;
          }
        }
      }

      res.json({
        message: "Recalculation complete",
        harvestLotsUpdated: harvestUpdated,
        seedLotsUpdated: seedUpdated,
      });
    } catch (error) {
      console.error("Error recalculating lot payables:", error);
      res.status(500).json({ message: "Failed to recalculate lot payables" });
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
      const { transporterName, driverContact, dateOfLoading, partyName, partyAddress, vehicleNumber, buyerId, advancePayment, transportationCharges, otherCharges, revenue, items, transactionType, salesCommission, totalMandiCommission, totalAadhatCommission, totalHammali, totalMandiExtraCharges, tulai, majduri, thelaBhada, palaKarai, bardan } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ message: "At least one item is required" });
      }

      // Parse inventoryKey and validate
      const parsedItems: { lotId: number; breakdownId: number | null; bagsMoved: number; netWeight: number; pricePerKg?: number; amount?: number }[] = [];
      
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
          pricePerKg: item.pricePerKg,
          amount: item.amount,
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
        
        let size: string | null = null;
        if (item.breakdownId) {
          const breakdown = await storage.getBagBreakdownById(item.breakdownId, merchantId);
          size = breakdown?.size || null;
        }
        if (!size) {
          size = lot?.size || null;
        }
        
        const allBreakdowns = await storage.getBagBreakdownsByLot(item.lotId, merchantId);
        const { breakdownCosts } = storage.computeBreakdownCosts(lot!, allBreakdowns);
        const costPerBag = breakdownCosts.get(item.breakdownId || null) || 0;
        
        const computedNetWeight = storage.computeProportionateNetWeight(lot!, allBreakdowns, item.breakdownId, item.bagsMoved);
        const netWeight = (item.netWeight && item.netWeight > 0 && Math.abs(item.netWeight - computedNetWeight) > 0.5)
          ? item.netWeight : computedNetWeight;

        let costOfGoods: number;
        let snapshotPrice: number;
        if (transactionType === "loading" && lot?.place !== "farm_gate") {
          const loadingBd = item.breakdownId
            ? allBreakdowns.find(b => b.id === item.breakdownId)
            : null;
          const bdPricePerKg = loadingBd?.pricePerKg ? parseFloat(loadingBd.pricePerKg) : (lot?.pricePerKg ? parseFloat(lot.pricePerKg) : 0);
          costOfGoods = bdPricePerKg * netWeight;
          snapshotPrice = bdPricePerKg;
        } else {
          costOfGoods = costPerBag * item.bagsMoved;
          snapshotPrice = costPerBag;
        }

        totalBags += item.bagsMoved;
        totalNetWeight += netWeight;
        totalCostOfGoods += costOfGoods;

        const itemBase: Omit<InsertTransactionItem, 'transactionId'> = {
          merchantId,
          lotId: item.lotId,
          breakdownId: item.breakdownId,
          serialNumber: entry?.serialNumber || 0,
          coldStoreName: lot?.coldStoreName || "",
          potatoType: lot?.potatoType || "",
          size,
          bagsMoved: item.bagsMoved,
          netWeight: netWeight.toString(),
          pricePerKgSnapshot: snapshotPrice.toString(),
          costOfGoods: costOfGoods.toString(),
        };

        if (transactionType === "loading") {
          itemBase.pricePerKg = item.pricePerKg ? item.pricePerKg.toString() : null;
          itemBase.amount = item.amount ? item.amount.toString() : null;
          itemBase.revenue = item.amount ? item.amount.toString() : "0";
        }

        return itemBase;
      }));

      // Calculate profit/loss and revenue
      let revenueNum = parseFloat(revenue) || 0;
      const transportNum = parseFloat(transportationCharges) || 0;
      const otherNum = parseFloat(otherCharges) || 0;
      let profitLoss = revenueNum - totalCostOfGoods - transportNum - otherNum;
      if (transactionType === "loading") {
        const scNum = parseFloat(salesCommission) || 0;
        const mcNum = parseFloat(totalMandiCommission) || 0;
        const acNum = parseFloat(totalAadhatCommission) || 0;
        const hNum = parseFloat(totalHammali) || 0;
        const ecNum = parseFloat(totalMandiExtraCharges) || 0;
        const tulaiNum = parseFloat(tulai) || 0;
        const majduriNum = parseFloat(majduri) || 0;
        const thelaBhadaNum = parseFloat(thelaBhada) || 0;
        const palaKaraiNum = parseFloat(palaKarai) || 0;
        const bardanNum = parseFloat(bardan) || 0;
        const mandiTotal = mcNum + acNum + hNum + ecNum;
        const additionalCharges = tulaiNum + majduriNum + thelaBhadaNum + palaKaraiNum + bardanNum;
        const advancePaymentNum = parseFloat(advancePayment) || 0;
        const lotAmounts = transactionItems.reduce((sum: number, item: any) => sum + (parseFloat(item.amount || item.revenue || "0")), 0);
        revenueNum = lotAmounts + mandiTotal + scNum + additionalCharges + advancePaymentNum;
        profitLoss = (lotAmounts - totalCostOfGoods) + scNum;
      }

      const transaction = await storage.createTransaction(
        {
          merchantId,
          transactionNumber,
          transactionType: transactionType || "sale",
          crop: transactionCrop,
          transporterName: titleCase(transporterName) || null,
          driverContact: driverContact || null,
          dateOfLoading: dateOfLoading || null,
          partyName: titleCase(partyName) || null,
          partyAddress: partyAddress || null,
          vehicleNumber: vehicleNumber || null,
          buyerId: buyerId ? parseInt(buyerId) : null,
          advancePayment: advancePayment ? advancePayment.toString() : null,
          transportationCharges: transportationCharges ? transportationCharges.toString() : null,
          otherCharges: otherCharges ? otherCharges.toString() : null,
          revenue: revenueNum ? revenueNum.toString() : null,
          totalBags,
          totalNetWeight: totalNetWeight.toString(),
          totalCostOfGoods: totalCostOfGoods.toString(),
          profitLoss: profitLoss.toString(),
          salesCommission: salesCommission ? salesCommission.toString() : null,
          totalMandiCommission: totalMandiCommission ? totalMandiCommission.toString() : null,
          totalAadhatCommission: totalAadhatCommission ? totalAadhatCommission.toString() : null,
          totalHammali: totalHammali ? totalHammali.toString() : null,
          totalMandiExtraCharges: totalMandiExtraCharges ? totalMandiExtraCharges.toString() : null,
          tulai: tulai ? tulai.toString() : null,
          majduri: majduri ? majduri.toString() : null,
          thelaBhada: thelaBhada ? thelaBhada.toString() : null,
          palaKarai: palaKarai ? palaKarai.toString() : null,
          bardan: bardan ? bardan.toString() : null,
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
      
      const { partyName, partyAddress, vehicleNumber, driverContact, advancePayment, amountReceived, transportationCharges, otherCharges, revenue, remarks, buyerId, salesCommission, totalMandiCommission, totalAadhatCommission, totalHammali, totalMandiExtraCharges, tulai, majduri, thelaBhada, palaKarai, bardan } = req.body;
      
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
      if (driverContact !== undefined && (driverContact || null) !== (existingTxn.driverContact || null)) {
        changes.push({ field: "driverContact", oldValue: existingTxn.driverContact, newValue: driverContact || null });
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
      if (buyerId !== undefined && buyerId !== existingTxn.buyerId) {
        if (buyerId !== null) {
          const buyer = await storage.getBuyerById(buyerId, merchantId);
          if (!buyer) {
            return res.status(400).json({ message: "Invalid buyer" });
          }
        }
        changes.push({ field: "buyerId", oldValue: existingTxn.buyerId?.toString() || null, newValue: buyerId?.toString() || null });
      }
      // Calculate new profit/loss and revenue
      const totalCostOfGoods = parseFloat(existingTxn.totalCostOfGoods || "0");
      const transportNum = parseFloat(transportationCharges !== undefined ? transportationCharges : existingTxn.transportationCharges) || 0;
      const otherNum = parseFloat(otherCharges !== undefined ? otherCharges : existingTxn.otherCharges) || 0;
      let newProfitLoss: number;
      let newRevenue: number | null = null;
      if (existingTxn.transactionType === "loading") {
        const scNum = parseFloat(salesCommission !== undefined ? salesCommission : existingTxn.salesCommission) || 0;
        const mcNum = parseFloat(totalMandiCommission !== undefined ? totalMandiCommission : existingTxn.totalMandiCommission) || 0;
        const acNum = parseFloat(totalAadhatCommission !== undefined ? totalAadhatCommission : existingTxn.totalAadhatCommission) || 0;
        const hNum = parseFloat(totalHammali !== undefined ? totalHammali : existingTxn.totalHammali) || 0;
        const ecNum = parseFloat(totalMandiExtraCharges !== undefined ? totalMandiExtraCharges : existingTxn.totalMandiExtraCharges) || 0;
        const tulaiNum = parseFloat(tulai !== undefined ? tulai : existingTxn.tulai) || 0;
        const majduriNum = parseFloat(majduri !== undefined ? majduri : existingTxn.majduri) || 0;
        const thelaBhadaNum = parseFloat(thelaBhada !== undefined ? thelaBhada : existingTxn.thelaBhada) || 0;
        const palaKaraiNum = parseFloat(palaKarai !== undefined ? palaKarai : existingTxn.palaKarai) || 0;
        const bardanNum = parseFloat(bardan !== undefined ? bardan : existingTxn.bardan) || 0;
        const mandiTotal = mcNum + acNum + hNum + ecNum;
        const additionalCharges = tulaiNum + majduriNum + thelaBhadaNum + palaKaraiNum + bardanNum;
        const advancePaymentNum = parseFloat(advancePayment !== undefined ? advancePayment : existingTxn.advancePayment) || 0;
        const existingItems = existingTxn.items || [];
        const lotAmounts = existingItems.reduce((sum: number, item: any) => sum + parseFloat(item.amount || item.revenue || "0"), 0);
        newRevenue = lotAmounts + mandiTotal + scNum + additionalCharges + advancePaymentNum;
        newProfitLoss = (lotAmounts - totalCostOfGoods) + scNum;
      } else {
        const existingRevenueNum = parseFloat(existingTxn.revenue || "0");
        newProfitLoss = existingRevenueNum - totalCostOfGoods - transportNum - otherNum;
      }
      
      if (!decimalEqual(newProfitLoss, existingTxn.profitLoss)) {
        changes.push({ field: "profitLoss", oldValue: existingTxn.profitLoss, newValue: newProfitLoss.toString() });
      }
      
      // Track loading-specific field changes
      if (salesCommission !== undefined && !decimalEqual(salesCommission, existingTxn.salesCommission)) {
        changes.push({ field: "salesCommission", oldValue: existingTxn.salesCommission, newValue: salesCommission?.toString() || null });
      }
      if (totalMandiCommission !== undefined && !decimalEqual(totalMandiCommission, existingTxn.totalMandiCommission)) {
        changes.push({ field: "totalMandiCommission", oldValue: existingTxn.totalMandiCommission, newValue: totalMandiCommission?.toString() || null });
      }
      if (totalAadhatCommission !== undefined && !decimalEqual(totalAadhatCommission, existingTxn.totalAadhatCommission)) {
        changes.push({ field: "totalAadhatCommission", oldValue: existingTxn.totalAadhatCommission, newValue: totalAadhatCommission?.toString() || null });
      }
      if (totalHammali !== undefined && !decimalEqual(totalHammali, existingTxn.totalHammali)) {
        changes.push({ field: "totalHammali", oldValue: existingTxn.totalHammali, newValue: totalHammali?.toString() || null });
      }
      if (totalMandiExtraCharges !== undefined && !decimalEqual(totalMandiExtraCharges, existingTxn.totalMandiExtraCharges)) {
        changes.push({ field: "totalMandiExtraCharges", oldValue: existingTxn.totalMandiExtraCharges, newValue: totalMandiExtraCharges?.toString() || null });
      }
      if (tulai !== undefined && !decimalEqual(tulai, existingTxn.tulai)) {
        changes.push({ field: "tulai", oldValue: existingTxn.tulai, newValue: tulai?.toString() || null });
      }
      if (majduri !== undefined && !decimalEqual(majduri, existingTxn.majduri)) {
        changes.push({ field: "majduri", oldValue: existingTxn.majduri, newValue: majduri?.toString() || null });
      }
      if (thelaBhada !== undefined && !decimalEqual(thelaBhada, existingTxn.thelaBhada)) {
        changes.push({ field: "thelaBhada", oldValue: existingTxn.thelaBhada, newValue: thelaBhada?.toString() || null });
      }
      if (palaKarai !== undefined && !decimalEqual(palaKarai, existingTxn.palaKarai)) {
        changes.push({ field: "palaKarai", oldValue: existingTxn.palaKarai, newValue: palaKarai?.toString() || null });
      }
      if (bardan !== undefined && !decimalEqual(bardan, existingTxn.bardan)) {
        changes.push({ field: "bardan", oldValue: existingTxn.bardan, newValue: bardan?.toString() || null });
      }

      const updatedTxn = await storage.updateTransaction(transactionId, merchantId, {
        partyName: titleCase(partyName) || null,
        partyAddress: partyAddress || null,
        vehicleNumber: vehicleNumber || null,
        driverContact: driverContact !== undefined ? (driverContact || null) : existingTxn.driverContact,
        advancePayment: advancePayment ? advancePayment.toString() : null,
        amountReceived: amountReceived ? amountReceived.toString() : null,
        transportationCharges: transportationCharges ? transportationCharges.toString() : null,
        otherCharges: otherCharges ? otherCharges.toString() : null,
        remarks: remarks !== undefined ? (remarks || null) : existingTxn.remarks,
        profitLoss: newProfitLoss.toString(),
        ...(newRevenue !== null ? { revenue: newRevenue.toString() } : {}),
        ...(buyerId !== undefined ? { buyerId } : {}),
        ...(salesCommission !== undefined ? { salesCommission: salesCommission ? salesCommission.toString() : null } : {}),
        ...(totalMandiCommission !== undefined ? { totalMandiCommission: totalMandiCommission ? totalMandiCommission.toString() : null } : {}),
        ...(totalAadhatCommission !== undefined ? { totalAadhatCommission: totalAadhatCommission ? totalAadhatCommission.toString() : null } : {}),
        ...(totalHammali !== undefined ? { totalHammali: totalHammali ? totalHammali.toString() : null } : {}),
        ...(totalMandiExtraCharges !== undefined ? { totalMandiExtraCharges: totalMandiExtraCharges ? totalMandiExtraCharges.toString() : null } : {}),
        ...(tulai !== undefined ? { tulai: tulai ? tulai.toString() : null } : {}),
        ...(majduri !== undefined ? { majduri: majduri ? majduri.toString() : null } : {}),
        ...(thelaBhada !== undefined ? { thelaBhada: thelaBhada ? thelaBhada.toString() : null } : {}),
        ...(palaKarai !== undefined ? { palaKarai: palaKarai ? palaKarai.toString() : null } : {}),
        ...(bardan !== undefined ? { bardan: bardan ? bardan.toString() : null } : {}),
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
            
            const editLot = await storage.getLotById(existingItem.lotId, merchantId);
            const editBreakdowns = await storage.getBagBreakdownsByLot(existingItem.lotId, merchantId);
            if (!editLot) {
              return res.status(400).json({ message: `Lot ${existingItem.lotId} not found` });
            }
            const computedNetWeight = storage.computeProportionateNetWeight(editLot, editBreakdowns, existingItem.breakdownId, itemChange.bagsMoved);
            const newNetWeight = (typeof itemChange.netWeight === 'number' && itemChange.netWeight > 0 && Math.abs(itemChange.netWeight - computedNetWeight) > 0.5)
              ? itemChange.netWeight
              : computedNetWeight;
            const { breakdownCosts: editBdCosts } = storage.computeBreakdownCosts(editLot, editBreakdowns);
            const editCostPerBag = editBdCosts.get(existingItem.breakdownId || null) || parseFloat(existingItem.pricePerKgSnapshot || "0");
            let newCostOfGoods: number;
            let editBdPpk = 0;
            if (existingTxn.transactionType === "loading" && editLot?.place !== "farm_gate") {
              const editBd = existingItem.breakdownId
                ? editBreakdowns.find(b => b.id === existingItem.breakdownId)
                : null;
              editBdPpk = editBd?.pricePerKg ? parseFloat(editBd.pricePerKg) : (editLot?.pricePerKg ? parseFloat(editLot.pricePerKg) : 0);
              newCostOfGoods = editBdPpk * newNetWeight;
            } else {
              newCostOfGoods = editCostPerBag * itemChange.bagsMoved;
            }
            
            const itemRevenue = typeof itemChange.revenue === 'number' ? itemChange.revenue : existingRevenue;
            
            const updateFields: Partial<TransactionItem> = {
              bagsMoved: itemChange.bagsMoved,
              netWeight: newNetWeight.toString(),
              costOfGoods: newCostOfGoods.toString(),
              revenue: itemRevenue.toString()
            };
            if (existingTxn.transactionType === "loading") {
              updateFields.pricePerKgSnapshot = (editLot?.place === "farm_gate" ? editCostPerBag : editBdPpk).toString();
              if (typeof itemChange.pricePerKg === 'number') updateFields.pricePerKg = itemChange.pricePerKg.toString();
              if (typeof itemChange.amount === 'number') {
                updateFields.amount = itemChange.amount.toString();
                updateFields.revenue = itemChange.amount.toString();
              }
            }
            await storage.updateTransactionItem(itemChange.id, merchantId, updateFields);
            
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
          let size = lot.size;
          
          if (breakdownId) {
            const breakdown = await storage.getBagBreakdownById(breakdownId, merchantId);
            availableBags = breakdown?.remainingBags ?? breakdown?.numberOfBags ?? 0;
            size = breakdown?.size || null;
          } else {
            availableBags = lot.remainingBags;
          }
          
          if (itemChange.bagsMoved > availableBags) {
            return res.status(400).json({ message: `Not enough bags available (${availableBags})` });
          }
          
          await storage.adjustInventory(lotId, breakdownId, merchantId, -itemChange.bagsMoved);
          
          const addBreakdowns = await storage.getBagBreakdownsByLot(lotId, merchantId);
          const { breakdownCosts: addBdCosts } = storage.computeBreakdownCosts(lot, addBreakdowns);
          const addCostPerBag = addBdCosts.get(breakdownId || null) || 0;
          
          const computedNetWeight = storage.computeProportionateNetWeight(lot, addBreakdowns, breakdownId, itemChange.bagsMoved);
          const netWeight = (typeof itemChange.netWeight === 'number' && itemChange.netWeight > 0 && Math.abs(itemChange.netWeight - computedNetWeight) > 0.5)
            ? itemChange.netWeight
            : computedNetWeight;
          let costOfGoods: number;
          let addSnapshotPrice: number;
          if (existingTxn.transactionType === "loading" && lot.place !== "farm_gate") {
            const addBd = breakdownId
              ? addBreakdowns.find(b => b.id === breakdownId)
              : null;
            const addBdPpk = addBd?.pricePerKg ? parseFloat(addBd.pricePerKg) : (lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0);
            costOfGoods = addBdPpk * netWeight;
            addSnapshotPrice = addBdPpk;
          } else {
            costOfGoods = addCostPerBag * itemChange.bagsMoved;
            addSnapshotPrice = addCostPerBag;
          }
          
          // Use provided revenue if given, default to 0
          const itemRevenue = typeof itemChange.revenue === 'number' ? itemChange.revenue : 0;
          
          const addItemData: InsertTransactionItem = {
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
            pricePerKgSnapshot: addSnapshotPrice.toString(),
            costOfGoods: costOfGoods.toString(),
            revenue: itemRevenue.toString()
          };
          if (existingTxn.transactionType === "loading") {
            addItemData.pricePerKg = typeof itemChange.pricePerKg === 'number' ? itemChange.pricePerKg.toString() : null;
            addItemData.amount = typeof itemChange.amount === 'number' ? itemChange.amount.toString() : itemRevenue.toString();
          }
          const newItem = await storage.addTransactionItem(addItemData);
          
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
          const existingItem = await storage.getTransactionItemById(itemChange.id, merchantId);
          if (existingItem) {
            const existingRevenue = parseFloat(existingItem.revenue || "0");
            let newItemRevenue = typeof itemChange.revenue === 'number' ? itemChange.revenue : existingRevenue;
            
            const keepUpdateFields: Partial<TransactionItem> = {};
            let hasKeepChanges = false;

            if (typeof itemChange.revenue === 'number' && itemChange.revenue !== existingRevenue) {
              keepUpdateFields.revenue = newItemRevenue.toString();
              hasKeepChanges = true;
            }

            if (existingTxn.transactionType === "loading") {
              if (typeof itemChange.pricePerKg === 'number') {
                const existingPpk = parseFloat(existingItem.pricePerKg || "0");
                if (itemChange.pricePerKg !== existingPpk) {
                  keepUpdateFields.pricePerKg = itemChange.pricePerKg.toString();
                  hasKeepChanges = true;
                }
              }
              if (typeof itemChange.amount === 'number') {
                const existingAmt = parseFloat(existingItem.amount || "0");
                if (itemChange.amount !== existingAmt) {
                  keepUpdateFields.amount = itemChange.amount.toString();
                  keepUpdateFields.revenue = itemChange.amount.toString();
                  newItemRevenue = itemChange.amount;
                  hasKeepChanges = true;
                }
              }
            }

            if (hasKeepChanges) {
              await storage.updateTransactionItem(itemChange.id, merchantId, keepUpdateFields);
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
      
      // Recalculate profit/loss and revenue
      let newProfitLoss: number;
      let finalRevenue = newTotalRevenue;
      if (existingTxn.transactionType === "loading") {
        const salesCommission = parseFloat(existingTxn.salesCommission || "0");
        const totalMandiCommission = parseFloat(existingTxn.totalMandiCommission || "0");
        const totalAadhatCommission = parseFloat(existingTxn.totalAadhatCommission || "0");
        const totalHammali = parseFloat(existingTxn.totalHammali || "0");
        const totalMandiExtraCharges = parseFloat(existingTxn.totalMandiExtraCharges || "0");
        const mandiTotal = totalMandiCommission + totalAadhatCommission + totalHammali + totalMandiExtraCharges;
        finalRevenue = newTotalRevenue + mandiTotal + salesCommission;
        newProfitLoss = (newTotalRevenue - newTotalCostOfGoods) + salesCommission;
      } else {
        const transportationCharges = parseFloat(existingTxn.transportationCharges || "0");
        const otherCharges = parseFloat(existingTxn.otherCharges || "0");
        newProfitLoss = newTotalRevenue - newTotalCostOfGoods - transportationCharges - otherCharges;
      }
      
      // Update transaction totals with aggregated revenue
      await storage.updateTransaction(transactionId, merchantId, {
        totalBags: newTotalBags,
        totalNetWeight: newTotalNetWeight.toString(),
        totalCostOfGoods: newTotalCostOfGoods.toString(),
        revenue: finalRevenue.toString(),
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

  app.get("/api/farmers/villages", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const villages = await storage.getDistinctVillages(merchantId);
      res.json(villages);
    } catch (error) {
      console.error("Error fetching distinct villages:", error);
      res.status(500).json({ message: "Failed to fetch villages" });
    }
  });

  app.get("/api/farmers/tehsils", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const tehsils = await storage.getDistinctTehsils(merchantId);
      res.json(tehsils);
    } catch (error) {
      console.error("Error fetching distinct tehsils:", error);
      res.status(500).json({ message: "Failed to fetch tehsils" });
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

  // GET /api/cash/aadhat-pending-entries/:aadhatDbId - Get pending stock entries for an aadhat (for manual allocation)
  app.get("/api/cash/aadhat-pending-entries/:aadhatDbId", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const aadhatDbId = parseInt(req.params.aadhatDbId);
      if (isNaN(aadhatDbId)) {
        return res.status(400).json({ message: "Invalid aadhat ID" });
      }

      const aadhat = await storage.getAadhatById(aadhatDbId, merchantId);
      if (!aadhat) {
        return res.status(404).json({ message: "Aadhat not found" });
      }

      const stockEntryList = await storage.getStockEntriesByMerchant(merchantId);
      const allLots = await storage.getAllLotsByMerchant(merchantId);

      const lotsByEntryId = new Map<number, typeof allLots>();
      for (const lot of allLots) {
        const arr = lotsByEntryId.get(lot.stockEntryId) || [];
        arr.push(lot);
        lotsByEntryId.set(lot.stockEntryId, arr);
      }

      type AadhatStockEntry = { id: number; aadhatDbId?: number | null; paymentStatus?: string | null; createdAt?: Date | string | null; amountPaid?: string | null; uniqueId?: string | null; serialNumber?: number | null; purchaseDate?: string | null };
      const pendingEntries = (stockEntryList as AadhatStockEntry[])
        .filter(se => se.aadhatDbId === aadhatDbId && (se.paymentStatus === "due" || se.paymentStatus === "partial"))
        .sort((a, b) => new Date(String(a.createdAt || 0)).getTime() - new Date(String(b.createdAt || 0)).getTime())
        .map(se => {
          const entryLots = lotsByEntryId.get(se.id) || [];
          let netPayable = 0;
          let totalBags = 0;
          for (const lot of entryLots) {
            netPayable += parseFloat(lot.netPayable || "0");
            totalBags += lot.originalBags;
          }
          const amountPaid = parseFloat(se.amountPaid || "0");
          const dueAmount = Math.max(0, netPayable - amountPaid);
          if (dueAmount <= 0) return null;

          const purchaseDate = se.purchaseDate;
          const daysSince = Math.floor((Date.now() - new Date(purchaseDate).getTime()) / (1000 * 60 * 60 * 24));

          return {
            stockEntryId: se.id,
            serialNumber: se.serialNumber,
            crop: se.crop || "potato",
            purchaseDate,
            totalBags,
            netPayable: parseFloat(netPayable.toFixed(2)),
            amountPaid: parseFloat(amountPaid.toFixed(2)),
            dueAmount: parseFloat(dueAmount.toFixed(2)),
            daysSince,
          };
        })
        .filter(Boolean);

      const pyPayable = parseFloat(aadhat.pyPayable || "0");

      res.json({
        pendingEntries,
        pyPayable: parseFloat(pyPayable.toFixed(2)),
      });
    } catch (error) {
      console.error("Error fetching aadhat pending entries:", error);
      res.status(500).json({ message: "Failed to fetch aadhat pending entries" });
    }
  });

  // GET /api/cash/buyer-pending-transactions/:buyerId - Get pending transactions for a buyer (for manual allocation)
  app.get("/api/cash/buyer-pending-transactions/:buyerId", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const buyerId = parseInt(req.params.buyerId);
      if (isNaN(buyerId)) {
        return res.status(400).json({ message: "Invalid buyer ID" });
      }

      const buyer = await storage.getBuyerById(buyerId, merchantId);
      if (!buyer) {
        return res.status(404).json({ message: "Buyer not found" });
      }

      const allTransactions = await storage.getTransactionsWithDueByParty(merchantId, buyer.name, buyerId);

      const pendingEntries = allTransactions
        .filter(txn => {
          const revenue = parseFloat(txn.revenue || "0");
          const received = parseFloat(txn.amountReceived || "0");
          return revenue > received;
        })
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map(txn => {
          const revenue = parseFloat(txn.revenue || "0");
          const received = parseFloat(txn.amountReceived || "0");
          const dueAmount = revenue - received;
          const daysSince = Math.floor((Date.now() - new Date(txn.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          return {
            transactionId: txn.id,
            transactionNumber: txn.transactionNumber,
            crop: txn.crop || "potato",
            dateOfLoading: txn.dateOfLoading,
            totalBags: txn.totalBags,
            revenue: parseFloat(revenue.toFixed(2)),
            amountReceived: parseFloat(received.toFixed(2)),
            dueAmount: parseFloat(dueAmount.toFixed(2)),
            daysSince,
          };
        });

      const pyBalance = parseFloat(buyer.receivableBalance || "0");

      res.json({
        pendingEntries,
        pyBalance: parseFloat(pyBalance.toFixed(2)),
      });
    } catch (error) {
      console.error("Error fetching buyer pending transactions:", error);
      res.status(500).json({ message: "Failed to fetch buyer pending transactions" });
    }
  });

  // GET /api/cash/aadhats-with-dues - Get aadhats with outstanding dues (totalDue > 0)
  app.get("/api/cash/aadhats-with-dues", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const allAadhats = await storage.getAadhatsByMerchant(merchantId);
      const stockEntryList = await storage.getStockEntriesByMerchant(merchantId);
      const allLots = await storage.getAllLotsByMerchant(merchantId);
      
      const lotsByEntryId = new Map<number, typeof allLots>();
      for (const lot of allLots) {
        const arr = lotsByEntryId.get(lot.stockEntryId) || [];
        arr.push(lot);
        lotsByEntryId.set(lot.stockEntryId, arr);
      }
      
      const aadhatDuesMap = new Map<number, number>();
      for (const entry of stockEntryList) {
        if (!entry.aadhatDbId) continue;
        const entryLots = lotsByEntryId.get(entry.id) || [];
        let entryNetPayable = 0;
        for (const lot of entryLots) {
          entryNetPayable += parseFloat(lot.netPayable || "0");
        }
        const amountPaid = parseFloat(entry.amountPaid || "0");
        const entryDue = Math.max(0, entryNetPayable - amountPaid);
        aadhatDuesMap.set(entry.aadhatDbId, (aadhatDuesMap.get(entry.aadhatDbId) || 0) + entryDue);
      }
      
      const aadhatsWithDues = allAadhats
        .filter(a => a.isActive)
        .map(a => ({
          id: a.id,
          aadhatId: a.aadhatId,
          name: a.name,
          address: a.address,
          contact: a.contact,
          pyPayable: a.pyPayable,
          stockDue: aadhatDuesMap.get(a.id) || 0,
          totalDue: parseFloat(a.pyPayable || "0") + (aadhatDuesMap.get(a.id) || 0),
        }))
        .filter(a => a.totalDue > 0);
      res.json(aadhatsWithDues);
    } catch (error) {
      console.error("Error fetching aadhats with dues:", error);
      res.status(500).json({ message: "Failed to fetch aadhats with dues" });
    }
  });

  // POST /api/cash/entries - Create a cash entry (inward, outflow, or transfer)
  app.post("/api/cash/entries", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const { direction, receiptType, revenueType, expenseType, paymentMode, bankAccountId, fromAccountType, fromBankAccountId, toAccountType, toBankAccountId, partyName, partyVillage, buyerId: requestBuyerId, farmerName, farmerVillage, farmerContact, farmerId: requestFarmerId, coldStoreName, coldStoreDbId: requestColdStoreDbId, supplierName, aadhatName, aadhatDbId: requestAadhatDbId, sundryPayName, sundryPayDbId: requestSundryPayDbId, amount, entryDate, remarks, aadhatAllocations, buyerAllocations, expenseCategory, capitalAssetName, capitalAssetCategory, chequeNumber } = req.body;

      // Validate required fields
      if (!direction || !["inward", "outflow", "transfer"].includes(direction)) {
        return res.status(400).json({ message: "Valid direction (inward/outflow/transfer) is required" });
      }
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }
      if (!entryDate) {
        return res.status(400).json({ message: "Entry date is required" });
      }
      
      // Validate direction-specific fields
      if (direction === "inward") {
        if (!receiptType || !["cash_received", "account_received", "cheque_received"].includes(receiptType)) {
          return res.status(400).json({ message: "Valid receipt type is required for inward entries" });
        }
        // Validate revenue type for inward entries
        if (revenueType && !["raw_potato", "seed_sale", "sundry_pay"].includes(revenueType)) {
          return res.status(400).json({ message: "Valid revenue type is required" });
        }
        // For raw_potato, partyName is required; for seed_sale, farmerName is required
        if (revenueType === "raw_potato" && !partyName) {
          return res.status(400).json({ message: "Party name is required for harvest entries" });
        }
        // Validate buyer allocations for raw_potato (REQUIRED - manual allocation replaces FIFO)
        if (revenueType === "raw_potato" && direction === "inward") {
          if (!Array.isArray(buyerAllocations) || buyerAllocations.length === 0) {
            return res.status(400).json({ message: "At least one allocation is required for buyer payments" });
          }
          let allocCashSum = 0;
          for (const alloc of buyerAllocations) {
            const allocAmount = parseFloat(alloc.amount) || 0;
            const allocPetty = parseFloat(alloc.pettyAdjustment) || 0;
            if (allocAmount < 0 || allocPetty < 0) {
              return res.status(400).json({ message: "Allocation amounts must be non-negative" });
            }
            if (allocAmount <= 0) {
              return res.status(400).json({ message: "Each allocation must have a positive amount" });
            }
            if (!alloc.isPyBalance && !alloc.transactionId) {
              return res.status(400).json({ message: "Each allocation must reference either a transaction or PY balance" });
            }
            allocCashSum += allocAmount;
          }
          const entryAmount = parseFloat(amount) || 0;
          if (Math.abs(allocCashSum - entryAmount) > 0.01) {
            return res.status(400).json({ message: `Sum of allocation cash amounts (₹${allocCashSum.toFixed(2)}) must equal entry amount (₹${entryAmount.toFixed(2)})` });
          }
        }
        if (revenueType === "seed_sale" && !farmerName) {
          return res.status(400).json({ message: "Farmer name is required for seed sale entries" });
        }
        if (revenueType === "sundry_pay" && !sundryPayName) {
          return res.status(400).json({ message: "Stakeholder name is required for sundry pay entries" });
        }
        // Fallback for legacy entries without revenueType
        if (!revenueType && !partyName) {
          return res.status(400).json({ message: "Party name is required for inward entries" });
        }
      } else if (direction === "outflow") {
        if (!expenseType || !["salary", "general_expense", "grading", "hammali", "farmer", "farmer_advance", "farmer_freight", "farmer_others", "cold_store_charge", "supplier", "aadhtiya", "capital_expense", "transport_freight", "sundry_pay", "bag_charges", "kata_charges", "pesticide_charges", "warehouse_charges"].includes(expenseType)) {
          return res.status(400).json({ message: "Valid expense type is required for outflow entries" });
        }
        if (expenseType === "capital_expense") {
          if (!capitalAssetName || !capitalAssetCategory) {
            return res.status(400).json({ message: "Asset name and category are required for capital expenses" });
          }
        }
        if (!paymentMode || !["cash", "account_transfer", "cheque"].includes(paymentMode)) {
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
        if (expenseType === "aadhtiya" && !aadhatName) {
          return res.status(400).json({ message: "Aadhtiya name is required when expense type is aadhtiya" });
        }
        if (expenseType === "sundry_pay" && !sundryPayName) {
          return res.status(400).json({ message: "Stakeholder name is required when expense type is sundry pay" });
        }
        if (expenseType === "aadhtiya" && Array.isArray(aadhatAllocations)) {
          if (aadhatAllocations.length === 0) {
            return res.status(400).json({ message: "At least one allocation is required for aadhtiya payments" });
          }
          for (const alloc of aadhatAllocations) {
            const allocAmount = parseFloat(alloc.amount) || 0;
            const allocDiscount = parseFloat(alloc.discountAmount) || 0;
            const allocPetty = parseFloat(alloc.pettyAdjustment) || 0;
            if (allocAmount < 0 || allocDiscount < 0 || allocPetty < 0) {
              return res.status(400).json({ message: "Allocation amounts must be non-negative" });
            }
            const totalSettled = allocAmount + allocDiscount + allocPetty;
            if (totalSettled <= 0) {
              return res.status(400).json({ message: "Each allocation must have a positive total settled amount" });
            }
            if (!alloc.isPyPayable && !alloc.stockEntryId) {
              return res.status(400).json({ message: "Each allocation must reference either a stock entry or PY payable" });
            }
          }
          const totalCash = aadhatAllocations.reduce((sum: number, a: any) => sum + (parseFloat(a.amount) || 0), 0);
          if (totalCash <= 0) {
            return res.status(400).json({ message: "Total cash amount must be greater than 0" });
          }
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

      // Resolve buyerId and farmerId from ledger for reliable matching
      // If IDs are provided directly from the frontend (from ledger dropdowns), use them
      let resolvedBuyerId: number | null = requestBuyerId ? parseInt(requestBuyerId) : null;
      let resolvedFarmerId: number | null = requestFarmerId ? parseInt(requestFarmerId) : null;
      
      if (!resolvedBuyerId && partyName) {
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
      
      if (!resolvedFarmerId && farmerName) {
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

      // Resolve aadhatDbId
      let resolvedAadhatDbId: number | null = requestAadhatDbId ? parseInt(requestAadhatDbId) : null;

      // Resolve sundryPayDbId - lookup or create stakeholder
      let resolvedSundryPayDbId: number | null = requestSundryPayDbId ? parseInt(requestSundryPayDbId) : null;
      if (!resolvedSundryPayDbId && sundryPayName && ((direction === "outflow" && expenseType === "sundry_pay") || (direction === "inward" && revenueType === "sundry_pay"))) {
        try {
          const existing = await storage.getSundryPayByCompositeKey(merchantId, sundryPayName, null);
          if (existing) {
            resolvedSundryPayDbId = existing.id;
          } else {
            const today = getISTDateString();
            const dateStr = parseDateToCodeFormat(today);
            const codePrefix = `SU${dateStr}`;
            const maxSeq = await storage.getMaxSundryPayCodeSequence(merchantId, codePrefix);
            const sundryPayCode = `SU${dateStr}${maxSeq + 1}`;
            const created = await storage.createSundryPay({
              merchantId,
              sundryPayId: sundryPayCode,
              dateAdded: today,
              name: titleCaseKeep(sundryPayName.trim()),
              address: "-",
              contact: null,
              pyReceivable: "0",
              redFlag: false,
              isActive: true,
            });
            resolvedSundryPayDbId = created.id;
          }
        } catch (e) {
          console.error("Failed to resolve sundryPayDbId for cash entry:", e);
        }
      }

      // Resolve bank account names for history preservation
      let resolvedBankAccountName: string | null = null;
      let resolvedFromBankAccountName: string | null = null;
      let resolvedToBankAccountName: string | null = null;
      
      if (bankAccountId || fromBankAccountId || toBankAccountId) {
        const accounts = await storage.getBankAccountsByMerchant(merchantId);
        if (bankAccountId) {
          resolvedBankAccountName = accounts.find((a: any) => a.id === bankAccountId)?.name || null;
        }
        if (fromBankAccountId) {
          resolvedFromBankAccountName = accounts.find((a: any) => a.id === fromBankAccountId)?.name || null;
        }
        if (toBankAccountId) {
          resolvedToBankAccountName = accounts.find((a: any) => a.id === toBankAccountId)?.name || null;
        }
      }

      // Determine if FIFO should be applied (raw_potato is now manual allocation, excluded here)
      const applyFIFO = (direction === "inward" && revenueType === "seed_sale" && !!farmerName) ||
                        (direction === "outflow" && expenseType === "farmer" && !!farmerName) ||
                        (direction === "outflow" && expenseType === "cold_store_charge" && !!coldStoreName) ||
                        (direction === "outflow" && expenseType === "supplier" && !!supplierName) ||
                        (direction === "outflow" && expenseType === "aadhtiya" && !!aadhatName);

      // Generate cash flow code: CFYYYYMMDD{seq} - unique per merchant (MAX-based with retry)
      const txDateStr = parseDateToCodeFormat(entryDate);
      const txCodePrefix = `CF${txDateStr}`;
      
      const maxRetries = 3;
      let createdEntry: any;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const maxSeq = await storage.getMaxCashCodeSequence(merchantId, txCodePrefix);
        const transactionCode = `CF${txDateStr}${maxSeq + 1 + attempt}`;
        try {
          createdEntry = await storage.createCashEntry({
            merchantId,
            transactionCode,
            direction,
            receiptType: receiptType || null,
            revenueType: revenueType || null,
            expenseType: expenseType || null,
            paymentMode: paymentMode || null,
            bankAccountId: bankAccountId || null,
            bankAccountName: resolvedBankAccountName,
            fromAccountType: fromAccountType || null,
            fromBankAccountId: fromBankAccountId || null,
            fromBankAccountName: resolvedFromBankAccountName,
            toAccountType: toAccountType || null,
            toBankAccountId: toBankAccountId || null,
            toBankAccountName: resolvedToBankAccountName,
            partyName: titleCase(partyName) || null,
            partyVillage: titleCase(partyVillage) || null,
            buyerId: resolvedBuyerId,
            farmerName: titleCase(farmerName) || null,
            farmerVillage: titleCase(farmerVillage) || null,
            farmerContact: farmerContact || null,
            farmerId: resolvedFarmerId,
            coldStoreName: titleCase(coldStoreName) || null,
            coldStoreDbId: expenseType === "cold_store_charge" ? (requestColdStoreDbId || null) : null,
            supplierName: titleCase(supplierName) || null,
            aadhatName: expenseType === "aadhtiya" ? (aadhatName || null) : null,
            aadhatDbId: expenseType === "aadhtiya" ? resolvedAadhatDbId : null,
            sundryPayName: (expenseType === "sundry_pay" || revenueType === "sundry_pay") ? (titleCaseKeep(sundryPayName) || null) : null,
            sundryPayDbId: (expenseType === "sundry_pay" || revenueType === "sundry_pay") ? resolvedSundryPayDbId : null,
            expenseCategory: expenseCategory || null,
            capitalAssetName: capitalAssetName || null,
            capitalAssetCategory: capitalAssetCategory || null,
            chequeNumber: chequeNumber || null,
            amount: amount.toString(),
            entryDate,
            remarks: remarks || null,
          }, applyFIFO, userId, expenseType === "aadhtiya" && Array.isArray(aadhatAllocations) ? aadhatAllocations : undefined, revenueType === "raw_potato" && Array.isArray(buyerAllocations) ? buyerAllocations : undefined);
          break;
        } catch (error: any) {
          if (error?.code === '23505' && error?.constraint?.includes('transaction_code') && attempt < maxRetries - 1) {
            continue;
          }
          throw error;
        }
      }
      if (!createdEntry) throw new Error("Failed to generate unique cash code after multiple attempts");

      if ((expenseCategory === "capital" || expenseType === "capital_expense") && capitalAssetName && capitalAssetCategory) {
        const usefulLifeMap: Record<string, number> = {
          vehicle: 7, building: 20, equipment: 7, furniture: 10,
          computer: 3, plant_machinery: 7, electrical_fittings: 10, other: 5,
        };
        const asset = await storage.createAsset({
          merchantId,
          name: capitalAssetName,
          category: capitalAssetCategory,
          purchaseDate: entryDate,
          purchaseCost: amount.toString(),
          salvageValue: "0",
          usefulLifeYears: usefulLifeMap[capitalAssetCategory] || 5,
          remarks: `Auto-created from capital expense ${createdEntry.transactionCode}`,
        });
        await storage.updateCashEntry(createdEntry.id, merchantId, { capitalAssetId: asset.id });
        createdEntry.capitalAssetId = asset.id;
      }
      
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
      res.json(farmers);
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
        effectiveDate: effectiveDate || getISTDateString(),
      });

      if (farmerId) {
        const addedAmount = parseFloat(pendingDueToBePaid?.toString() || "0");
        const roi = parseFloat(rateOfInterest?.toString() || "0");
        const effDate = effectiveDate || getISTDateString();
        const existingFarmer = await storage.getFarmerById(farmerId, merchantId);
        const currentPyReceivable = parseFloat(existingFarmer?.pyReceivable || "0");
        const currentFinal = parseFloat(existingFarmer?.pyReceivableFinalAmount || existingFarmer?.pyReceivable || "0");
        const currentRemaining = parseFloat(existingFarmer?.remainingReceivable || "0");
        const newPyReceivable = (currentPyReceivable + addedAmount).toFixed(2);
        const newFinal = (currentFinal + addedAmount).toFixed(2);
        const newRemaining = (currentRemaining + addedAmount).toFixed(2);
        await storage.updateFarmer(farmerId, merchantId, {
          pyReceivable: newPyReceivable,
          pyReceivableFinalAmount: newFinal,
          remainingReceivable: newRemaining,
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
            const currentFinal = parseFloat(existingFarmer?.pyReceivableFinalAmount || existingFarmer?.pyReceivable || "0");
            const currentRemaining = parseFloat(existingFarmer?.remainingReceivable || "0");
            const newBalance = Math.max(0, currentPyReceivable + delta);
            const newFinalBalance = Math.max(0, currentFinal + delta);
            const newRemainingBalance = Math.max(0, currentRemaining + delta);
            syncData.pyReceivable = newBalance.toFixed(2);
            syncData.pyReceivableFinalAmount = newFinalBalance.toFixed(2);
            syncData.remainingReceivable = newRemainingBalance.toFixed(2);
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
          const currentFinal = parseFloat(existingFarmer.pyReceivableFinalAmount || existingFarmer.pyReceivable || "0");
          const currentRemaining = parseFloat(existingFarmer.remainingReceivable || "0");
          const newBalance = Math.max(0, currentPyReceivable - removedAmount);
          const newFinalBalance = Math.max(0, currentFinal - removedAmount);
          const newRemainingBalance = Math.max(0, currentRemaining - removedAmount);
          const updateData: any = { pyReceivable: newBalance.toFixed(2), pyReceivableFinalAmount: newFinalBalance.toFixed(2), remainingReceivable: newRemainingBalance.toFixed(2) };
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
      
      const transactionList = await storage.getTransactionsByMerchant(merchantId);
      
      const todayStr = getISTDateString();

      const buyersWithDues = buyerList.map(buyer => {
        let totalDue = 0;
        let dueTodayAmount = 0;
        let dueOver15Days = 0;
        let dueOver30Days = 0;
        const receivables = parseFloat(buyer.receivableBalance || "0");
        
        for (const txn of transactionList) {
          if (txn.buyerId === buyer.id) {
            const revenue = parseFloat(txn.revenue || "0");
            const amountReceived = parseFloat(txn.amountReceived || "0");
            const due = Math.max(0, revenue - amountReceived);
            totalDue += due;

            if (due > 0 && txn.dateOfLoading) {
              const txnDate = typeof txn.dateOfLoading === 'string' ? txn.dateOfLoading : String(txn.dateOfLoading);
              const ageDays = dateDiffInDaysIST(txnDate, todayStr);

              if (txnDate === todayStr) {
                dueTodayAmount += due;
              }
              if (ageDays > 30) {
                dueOver30Days += due;
              } else if (ageDays > 15) {
                dueOver15Days += due;
              }
            }
          }
        }
        
        return {
          ...buyer,
          overallDue: totalDue + receivables,
          receivables: receivables,
          transactionDue: totalDue,
          dueTodayAmount,
          dueOver15Days,
          dueOver30Days,
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
      
      const { dateAdded, name, address, mandiCode, contact, redFlag, isActive } = validationResult.data;

      // Generate buyer code: BYYYYYMMDD{seq} - unique per merchant (MAX-based with retry)
      const effectiveDateAdded = dateAdded || getISTDateString();
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
            redFlag: redFlag ?? false,
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
      
      const { dateAdded, name, address, mandiCode, contact, redFlag, isActive } = validationResult.data;

      const buyer = await storage.updateBuyer(id, merchantId, {
        ...(dateAdded !== undefined && { dateAdded }),
        ...(name !== undefined && { name: titleCaseKeep(name) }),
        ...(address !== undefined && { address: titleCase(address) || address }),
        ...(mandiCode !== undefined && { mandiCode }),
        ...(contact !== undefined && { contact }),
        ...(redFlag !== undefined && { redFlag }),
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
      const { name, address, mandiCode, contact, redFlag } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: "Buyer name is required" });
      }

      const existingBuyer = await storage.getBuyerById(id, merchantId);
      if (!existingBuyer) {
        return res.status(404).json({ message: "Buyer not found" });
      }

      const newName = name.trim();
      const newContact = contact?.trim() || null;
      const matchingBuyer = await storage.getBuyerByCompositeKey(merchantId, newName, newContact);
      if (matchingBuyer && matchingBuyer.id !== id) {
        return res.status(409).json({
          message: "A buyer with this name and contact already exists",
          requiresMerge: true,
          existingBuyer: matchingBuyer,
        });
      }

      // Track changes for edit history
      const changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> = [];
      
      const newAddress = address?.trim() || null;
      const newMandiCode = mandiCode?.trim() || null;
      const newRedFlag = redFlag ?? existingBuyer.redFlag;

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
      if (existingBuyer.redFlag !== newRedFlag) {
        changes.push({ fieldName: "redFlag", oldValue: String(existingBuyer.redFlag), newValue: String(newRedFlag) });
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

      // Also update redFlag if changed
      if (existingBuyer.redFlag !== newRedFlag) {
        await storage.updateBuyer(id, merchantId, { redFlag: newRedFlag });
      }

      if (!result.buyer) {
        return res.status(404).json({ message: "Buyer not found" });
      }

      const totalUpdated = result.transactionsUpdated + result.partiesUpdated + result.cashEntriesUpdated;
      res.json({
        buyer: result.buyer,
        transactionsUpdated: result.transactionsUpdated,
        partiesUpdated: result.partiesUpdated,
        cashEntriesUpdated: result.cashEntriesUpdated,
        changesRecorded: changes.length,
        message: `Buyer updated. ${totalUpdated} linked record(s) updated.`
      });
    } catch (error) {
      console.error("Error updating buyer with propagation:", error);
      res.status(500).json({ message: "Failed to update buyer" });
    }
  });

  // POST /api/buyers/merge - Merge two buyers
  app.post("/api/buyers/merge", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const { sourceId, targetId } = req.body;

      if (!sourceId || !targetId) {
        return res.status(400).json({ message: "sourceId and targetId are required" });
      }

      const result = await storage.mergeBuyers(merchantId, userId, sourceId, targetId);
      res.json({
        buyer: result.survivingBuyer,
        mergedCount: result.mergedCount,
        message: `Buyers merged successfully. ${result.mergedCount} linked records transferred.`
      });
    } catch (error) {
      console.error("Error merging buyers:", error);
      res.status(500).json({ message: "Failed to merge buyers" });
    }
  });

  // GET /api/buyers/:id/ledger - Get buyer ledger entries for current FY
  app.get("/api/buyers/:id/ledger", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const buyerId = parseInt(req.params.id);
      if (isNaN(buyerId)) return res.status(400).json({ message: "Invalid buyer ID" });

      const buyer = await storage.getBuyerById(buyerId, merchantId);
      if (!buyer) {
        return res.status(404).json({ message: "Buyer not found" });
      }

      const todayStr = getISTDateString();
      const todayDate = new Date(todayStr + "T00:00:00+05:30");
      const currentMonth = todayDate.getMonth();
      const currentYear = todayDate.getFullYear();
      const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      const fyStart = `${fyStartYear}-04-01`;
      const fyEnd = `${fyStartYear + 1}-03-31`;

      const allTransactions = await storage.getTransactionsByMerchant(merchantId);
      const allCashEntries = await storage.getCashEntriesByMerchant(merchantId);

      const buyerTxns = allTransactions.filter(txn => txn.buyerId === buyerId);
      const buyerCashEntries = allCashEntries.filter(entry =>
        entry.buyerId === buyerId &&
        entry.direction === "inward" &&
        entry.revenueType === "raw_potato" &&
        !entry.isReversed
      );

      const fyTxns = buyerTxns.filter(txn =>
        txn.dateOfLoading && txn.dateOfLoading >= fyStart && txn.dateOfLoading <= fyEnd
      );
      const fyCashEntries = buyerCashEntries.filter(entry =>
        entry.entryDate && entry.entryDate >= fyStart && entry.entryDate <= fyEnd
      );

      let pyAllocPaid = 0;
      for (const entry of fyCashEntries) {
        if (entry.buyerAllocations && Array.isArray(entry.buyerAllocations)) {
          for (const alloc of entry.buyerAllocations) {
            if (alloc.isPyBalance) {
              pyAllocPaid += parseFloat(alloc.appliedAmount || "0") + parseFloat(alloc.pettyAdjustment || "0");
            }
          }
        }
      }

      const currentReceivable = parseFloat(buyer.receivableBalance || "0");
      const openingBalance = currentReceivable + pyAllocPaid;

      const preFyTxnIds = new Set<number>();
      let preFyTxnDueCurrent = 0;
      for (const txn of buyerTxns) {
        if (txn.dateOfLoading && txn.dateOfLoading < fyStart) {
          preFyTxnIds.add(txn.id);
          const revenue = parseFloat(txn.revenue || "0");
          const received = parseFloat(txn.amountReceived || "0");
          preFyTxnDueCurrent += Math.max(0, revenue - received);
        }
      }

      let fyAllocsToPreFyTxns = 0;
      for (const entry of fyCashEntries) {
        if (entry.buyerAllocations && Array.isArray(entry.buyerAllocations)) {
          for (const alloc of entry.buyerAllocations) {
            if (!alloc.isPyBalance && alloc.transactionId && preFyTxnIds.has(alloc.transactionId)) {
              fyAllocsToPreFyTxns += parseFloat(alloc.appliedAmount || "0") + parseFloat(alloc.pettyAdjustment || "0");
            }
          }
        }
      }

      const preFyTxnDueAtFyStart = preFyTxnDueCurrent + fyAllocsToPreFyTxns;
      const totalOpening = openingBalance + preFyTxnDueAtFyStart;

      interface LedgerEntry {
        date: string;
        tnxCode: string;
        particulars: string;
        dr: number;
        cr: number;
        sourceType: "transaction" | "payment";
        sourceId: number;
      }

      const entries: LedgerEntry[] = [];

      for (const txn of fyTxns) {
        const revenue = parseFloat(txn.revenue || "0");
        if (revenue > 0) {
          entries.push({
            date: txn.dateOfLoading || "",
            tnxCode: `Tnx #${txn.transactionNumber}`,
            particulars: "Harvest Sale",
            dr: revenue,
            cr: 0,
            sourceType: "transaction",
            sourceId: txn.id,
          });
        }
      }

      for (const entry of fyCashEntries) {
        let totalApplied = 0;
        let totalPetty = 0;
        if (entry.buyerAllocations && Array.isArray(entry.buyerAllocations)) {
          for (const alloc of entry.buyerAllocations) {
            totalApplied += parseFloat(alloc.appliedAmount || "0");
            totalPetty += parseFloat(alloc.pettyAdjustment || "0");
          }
        }
        const totalCr = totalApplied + totalPetty;
        if (totalCr > 0) {
          const hasPy = entry.buyerAllocations?.some((a: { isPyBalance?: boolean }) => a.isPyBalance);
          entries.push({
            date: entry.entryDate || "",
            tnxCode: entry.transactionCode || "",
            particulars: hasPy ? "Payment (incl. PY)" : "Payment (Cash)",
            dr: 0,
            cr: totalCr,
            sourceType: "payment",
            sourceId: entry.id,
          });
        }
      }

      entries.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.sourceType !== b.sourceType) return a.sourceType === "transaction" ? -1 : 1;
        return a.sourceId - b.sourceId;
      });

      const merchant = await storage.getMerchant(merchantId);
      res.json({
        buyerId,
        buyerName: buyer.name,
        buyerAddress: buyer.address,
        merchantName: merchant?.name || "",
        merchantAddress: merchant?.address || "",
        merchantContact: merchant?.contactNumber || "",
        openingBalance: totalOpening,
        fyStart,
        fyEnd,
        entries,
      });
    } catch (error) {
      console.error("Error fetching buyer ledger:", error);
      res.status(500).json({ message: "Failed to fetch buyer ledger" });
    }
  });

  // GET /api/aadhats/:id/ledger - Get aadhat ledger for current FY
  app.get("/api/aadhats/:id/ledger", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const aadhatId = parseInt(req.params.id);
      if (isNaN(aadhatId)) return res.status(400).json({ message: "Invalid aadhat ID" });

      const aadhat = await storage.getAadhatById(aadhatId, merchantId);
      if (!aadhat) {
        return res.status(404).json({ message: "Aadhat not found" });
      }

      const todayStr = getISTDateString();
      const todayDate = new Date(todayStr + "T00:00:00+05:30");
      const currentMonth = todayDate.getMonth();
      const currentYear = todayDate.getFullYear();
      const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      const fyStart = `${fyStartYear}-04-01`;
      const fyEnd = `${fyStartYear + 1}-03-31`;

      const allStockEntries = await storage.getStockEntriesByMerchant(merchantId);
      const allLots = await storage.getAllLotsByMerchant(merchantId);
      const allCashEntries = await storage.getCashEntriesByMerchant(merchantId);

      type StockEntryRecord = { id: number; aadhatDbId?: number | null; purchaseDate?: string | null; amountPaid?: string | null; uniqueId?: string | null; serialNumber?: number | null };
      type LotRecord = typeof allLots[number];

      const aadhatStockEntries = (allStockEntries as StockEntryRecord[]).filter(se => se.aadhatDbId === aadhatId);
      const aadhatCashEntries = allCashEntries.filter(entry =>
        entry.aadhatDbId === aadhatId &&
        entry.direction === "outflow" &&
        entry.expenseType === "aadhtiya" &&
        !entry.isReversed
      );

      const lotsByEntryId = new Map<number, LotRecord[]>();
      for (const lot of allLots) {
        const arr = lotsByEntryId.get(lot.stockEntryId) || [];
        arr.push(lot);
        lotsByEntryId.set(lot.stockEntryId, arr);
      }

      const fyStockEntries = aadhatStockEntries.filter(se =>
        se.purchaseDate && se.purchaseDate >= fyStart && se.purchaseDate <= fyEnd
      );
      const fyCashEntries = aadhatCashEntries.filter(entry =>
        entry.entryDate && entry.entryDate >= fyStart && entry.entryDate <= fyEnd
      );

      let pyAllocPaid = 0;
      for (const entry of fyCashEntries) {
        if (entry.aadhatAllocations && Array.isArray(entry.aadhatAllocations)) {
          for (const alloc of entry.aadhatAllocations) {
            if (alloc.isPyPayable) {
              pyAllocPaid += parseFloat(alloc.appliedAmount || "0") + parseFloat(alloc.discountAmount || "0") + parseFloat(alloc.pettyAdjustment || "0");
            }
          }
        }
      }

      const currentPyPayable = parseFloat(aadhat.pyPayable || "0");
      const openingPyPayable = currentPyPayable + pyAllocPaid;

      const preFyStockEntryIds = new Set<number>();
      let preFyStockDueCurrent = 0;
      for (const se of aadhatStockEntries) {
        if (se.purchaseDate && se.purchaseDate < fyStart) {
          preFyStockEntryIds.add(se.id);
          const entryLots = lotsByEntryId.get(se.id) || [];
          let netPayable = 0;
          for (const lot of entryLots) {
            netPayable += parseFloat(lot.netPayable || "0");
          }
          const paid = parseFloat(se.amountPaid || "0");
          preFyStockDueCurrent += Math.max(0, netPayable - paid);
        }
      }

      let fyAllocsToPreFyStock = 0;
      for (const entry of fyCashEntries) {
        if (entry.aadhatAllocations && Array.isArray(entry.aadhatAllocations)) {
          for (const alloc of entry.aadhatAllocations) {
            if (!alloc.isPyPayable && alloc.stockEntryId && preFyStockEntryIds.has(alloc.stockEntryId)) {
              fyAllocsToPreFyStock += parseFloat(alloc.appliedAmount || "0") + parseFloat(alloc.discountAmount || "0") + parseFloat(alloc.pettyAdjustment || "0");
            }
          }
        }
      }

      const preFyStockDueAtFyStart = preFyStockDueCurrent + fyAllocsToPreFyStock;
      const totalOpening = openingPyPayable + preFyStockDueAtFyStart;

      interface LedgerEntry {
        date: string;
        tnxCode: string;
        particulars: string;
        dr: number;
        cr: number;
        sourceType: "stock_entry" | "payment";
        sourceId: number;
      }

      const entries: LedgerEntry[] = [];

      for (const se of fyStockEntries) {
        const entryLots = lotsByEntryId.get(se.id) || [];
        let netPayable = 0;
        for (const lot of entryLots) {
          netPayable += parseFloat(lot.netPayable || "0");
        }
        if (netPayable > 0) {
          entries.push({
            date: se.purchaseDate || "",
            tnxCode: se.uniqueId || `SE #${se.serialNumber}`,
            particulars: "Harvest Purchase",
            dr: 0,
            cr: netPayable,
            sourceType: "stock_entry",
            sourceId: se.id,
          });
        }
      }

      for (const entry of fyCashEntries) {
        let totalApplied = 0;
        let totalDiscount = 0;
        let totalPetty = 0;
        if (entry.aadhatAllocations && Array.isArray(entry.aadhatAllocations)) {
          for (const alloc of entry.aadhatAllocations) {
            totalApplied += parseFloat(alloc.appliedAmount || "0");
            totalDiscount += parseFloat(alloc.discountAmount || "0");
            totalPetty += parseFloat(alloc.pettyAdjustment || "0");
          }
        }
        const totalDr = totalApplied + totalDiscount + totalPetty;
        if (totalDr > 0) {
          const hasPy = entry.aadhatAllocations?.some((a: Record<string, unknown>) => a.isPyPayable);
          entries.push({
            date: entry.entryDate || "",
            tnxCode: entry.transactionCode || "",
            particulars: hasPy ? "Payment (incl. PY)" : "Payment",
            dr: totalDr,
            cr: 0,
            sourceType: "payment",
            sourceId: entry.id,
          });
        }
      }

      entries.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.sourceType !== b.sourceType) return a.sourceType === "stock_entry" ? -1 : 1;
        return a.sourceId - b.sourceId;
      });

      const merchant = await storage.getMerchant(merchantId);
      res.json({
        aadhatId: aadhatId,
        aadhatName: aadhat.name,
        aadhatAddress: aadhat.address,
        merchantName: merchant?.name || "",
        merchantAddress: merchant?.address || "",
        merchantContact: merchant?.contactNumber || "",
        openingBalance: totalOpening,
        fyStart,
        fyEnd,
        entries,
      });
    } catch (error) {
      console.error("Error fetching aadhat ledger:", error);
      res.status(500).json({ message: "Failed to fetch aadhat ledger" });
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
      
      
      // Build a map of stockEntryId -> lots and identify Mandi entries
      const lotsByEntryId = new Map<number, typeof allLots>();
      const mandiEntryIds = new Set<number>();
      for (const lot of allLots) {
        const existing = lotsByEntryId.get(lot.stockEntryId) || [];
        existing.push(lot);
        lotsByEntryId.set(lot.stockEntryId, existing);
        if (lot.place === "mandi") {
          mandiEntryIds.add(lot.stockEntryId);
        }
      }
      
      // Build a map of lotId -> bag breakdowns for harvest due calculation
      const breakdownsByLotId = new Map<number, typeof allBreakdowns>();
      for (const breakdown of allBreakdowns) {
        const existing = breakdownsByLotId.get(breakdown.lotId) || [];
        existing.push(breakdown);
        breakdownsByLotId.set(breakdown.lotId, existing);
      }
      
      // Calculate dues for each farmer - match by farmerId first, then fall back to composite key (name+contact+village)
      const farmersWithDues = farmerList.map(farmer => {
        const normalizedFarmerName = farmer.name.trim().toLowerCase();
        const normalizedFarmerContact = farmer.contact?.trim().toLowerCase() || null;
        const normalizedFarmerVillage = farmer.village?.trim().toLowerCase() || null;
        
        // Calculate Harvest Due (sum of bag breakdown amounts - amount paid, from stock entries with status due/partial)
        let harvestDue = 0;
        // Calculate Cold Due (sum of Cold Charges/Ware House Charges from lot charges array)
        let coldDue = 0;
        
        for (const entry of stockEntryList) {
          if (mandiEntryIds.has(entry.id)) continue;
          // Match by farmerId first (primary), then fall back to composite key (for legacy data)
          const matchesByFarmerId = entry.farmerId === farmer.id;
          const entryName = entry.farmerName?.trim().toLowerCase() || "";
          const entryContact = entry.farmerContact?.trim().toLowerCase() || null;
          const entryVillage = (entry as any).village?.trim().toLowerCase() || null;
          const matchesByCompositeKey = !entry.farmerId && entryName === normalizedFarmerName && entryContact === normalizedFarmerContact && entryVillage === normalizedFarmerVillage;
          
          if (matchesByFarmerId || matchesByCompositeKey) {
            // Only calculate harvest due for entries with "due" or "partial" payment status
            if (entry.paymentStatus === "due" || entry.paymentStatus === "partial") {
              const entryLots = lotsByEntryId.get(entry.id) || [];
              let entryNetPayable = 0;
              
              for (const lot of entryLots) {
                entryNetPayable += parseFloat(lot.netPayable || "0");
                
                // Extract cold charges for cold due calculation
                let lotColdCharges = 0;
                const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
                if (lot.charges) {
                  try {
                    const chargesArray = typeof lot.charges === 'string' ? JSON.parse(lot.charges) : lot.charges;
                    if (Array.isArray(chargesArray)) {
                      lotColdCharges = chargesArray
                        .filter((c: any) => c && coldStoreTypes.includes(c.type))
                        .reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
                    }
                  } catch (e) {
                    // ignore parse errors
                  }
                }
                coldDue += lotColdCharges;
              }
              
              const amountPaid = parseFloat(entry.amountPaid || "0");
              const entryDue = Math.max(0, entryNetPayable - amountPaid);
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
          const txnVillage = (txn as any).village?.trim().toLowerCase() || null;
          const matchesByCompositeKey = !txn.farmerId && txnName === normalizedFarmerName && txnContact === normalizedFarmerContact && txnVillage === normalizedFarmerVillage;
          
          if (matchesByFarmerId || matchesByCompositeKey) {
            seedDue += parseFloat(txn.totalDueToFarmer || "0");
          }
        }
        
        // PY Receivable: use remainingReceivable (finalAmount minus payments made)
        const pyReceivableWithInterest = parseFloat(farmer.remainingReceivable || "0");
        
        // Net Due = Harvest Due - PY Receivables - Seed Due
        const netDue = harvestDue - pyReceivableWithInterest - seedDue;
        
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
        redFlag: farmer.redFlag || false,
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
      
      // Get all lots to identify Mandi entries (aadhatiyas - not farmers)
      const allLots = await storage.getAllLotsByMerchant(merchantId);
      const mandiEntryIds = new Set<number>();
      for (const lot of allLots) {
        if (lot.place === "mandi") {
          mandiEntryIds.add(lot.stockEntryId);
        }
      }
      
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
      // Skip Mandi entries - those are aadhatiyas, not farmers
      for (const entry of stockEntryList) {
        if (mandiEntryIds.has(entry.id)) continue;
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
      const today = getISTDateString();
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
                redFlag: false,
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
        farmerIdMap.set(key, existing!.id);
      }
      
      // Link farmerId to stock entries that don't have one (skip Mandi entries)
      for (const entry of stockEntryList) {
        if (mandiEntryIds.has(entry.id)) continue;
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
      
      const { redFlag, isArchived, pyReceivable } = validationResult.data;

      const farmer = await storage.updateFarmer(id, merchantId, {
        ...(redFlag !== undefined && { redFlag }),
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
          coldStoreDbId: lotData.coldStoreDbId || null,
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

      // Compute and store totalCharges, netPayable, avgCostPerBag for all seed lots
      await recomputeSeedLotCharges(seedEntry.id, merchantId);

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
              coldStoreDbId: lotData.coldStoreDbId !== undefined ? (lotData.coldStoreDbId || null) : undefined,
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
              coldStoreDbId: lotData.coldStoreDbId || null,
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

      // Recompute and store totalCharges, netPayable, avgCostPerBag for all seed lots
      await recomputeSeedLotCharges(id, merchantId);

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
        
        const costPerBag = parseFloat(seedLot.avgCostPerBag || "0");
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
          costPerBag: costPerBag.toFixed(2),
          revenue: revenue.toString(),
          cost: cost.toFixed(2),
          profitLoss: profitLoss.toFixed(2),
        });
      }

      const totalProfitLoss = totalRevenue - totalCost;
      const transportTotal = parseFloat(transportCharges) || 0;
      const otherTotal = parseFloat(otherCharges) || 0;
      const baseDueToFarmer = totalRevenue + transportTotal + otherTotal;

      const effectivePrincipal = adjustmentAmount !== undefined ? adjustmentAmount : existingTxn.adjustmentAmount;
      const effectiveRate = adjustmentRate !== undefined ? adjustmentRate : existingTxn.adjustmentRate;
      const effectiveDate = adjustmentEffectiveDate !== undefined ? adjustmentEffectiveDate : existingTxn.adjustmentEffectiveDate;
      const effectiveType = adjustmentType !== undefined ? adjustmentType : existingTxn.adjustmentType;
      let computedAdjFinal: string | null = null;
      let interestAdj = 0;
      if (effectivePrincipal) {
        const principal = parseFloat(String(effectivePrincipal));
        const finalVal = calculateSimpleInterest(principal, parseFloat(String(effectiveRate || "0")), effectiveDate || null);
        computedAdjFinal = finalVal.toFixed(2);
        const interestOnly = finalVal - principal;
        if (interestOnly > 0) {
          interestAdj = effectiveType === "credit" ? interestOnly : effectiveType === "debit" ? -interestOnly : 0;
        }
      }
      const totalDueToFarmer = baseDueToFarmer + interestAdj;

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
          totalDueToFarmer: totalDueToFarmer.toFixed(2),
          adjustmentType: adjustmentType || null,
          adjustmentAmount: adjustmentAmount ? adjustmentAmount.toString() : null,
          adjustmentAmountFinal: computedAdjFinal,
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
      const { farmerName, farmerContact, village, tehsil, district, state, vehicleNumber, transportCharges, otherCharges, otherChargesRemarks, adjustmentType, adjustmentAmount, adjustmentRate, adjustmentEffectiveDate, adjustmentReason, items } = req.body;

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
        
        const costPerBag = parseFloat(seedLot.avgCostPerBag || "0");
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
          costPerBag: costPerBag.toFixed(2),
          revenue: revenue.toString(),
          cost: cost.toFixed(2),
          profitLoss: profitLoss.toFixed(2),
        });
      }

      const totalProfitLoss = totalRevenue - totalCost;
      const transportTotal = parseFloat(transportCharges) || 0;
      const otherTotal = parseFloat(otherCharges) || 0;
      const baseDueToFarmer = totalRevenue + transportTotal + otherTotal;

      let computedAdjFinal: string | null = null;
      let interestAdj = 0;
      if (adjustmentAmount) {
        const principal = parseFloat(String(adjustmentAmount));
        const finalVal = calculateSimpleInterest(principal, parseFloat(String(adjustmentRate || "0")), adjustmentEffectiveDate || null);
        computedAdjFinal = finalVal.toFixed(2);
        const interestOnly = finalVal - principal;
        if (interestOnly > 0) {
          interestAdj = adjustmentType === "credit" ? interestOnly : adjustmentType === "debit" ? -interestOnly : 0;
        }
      }
      const totalDueToFarmer = baseDueToFarmer + interestAdj;

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
          totalDueToFarmer: totalDueToFarmer.toFixed(2),
          adjustmentType: adjustmentType || null,
          adjustmentAmount: adjustmentAmount ? adjustmentAmount.toString() : null,
          adjustmentAmountFinal: computedAdjFinal,
          adjustmentRate: adjustmentRate ? adjustmentRate.toString() : null,
          adjustmentEffectiveDate: adjustmentEffectiveDate || null,
          adjustmentReason: adjustmentReason || null,
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
          issues.push(`Harvest: ${rawPotatoRemaining.count} lots with ${rawPotatoRemaining.totalBags} remaining bags`);
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

  // ==================== AADHAT LEDGER ROUTES ====================

  // GET /api/aadhats - Get all aadhats for the authenticated merchant
  app.get("/api/aadhats", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const aadhatList = await storage.getAadhatsByMerchant(merchantId);
      const stockEntryList = await storage.getStockEntriesByMerchant(merchantId);
      const allLots = await storage.getAllLotsByMerchant(merchantId);
      
      const lotsByEntryId = new Map<number, typeof allLots>();
      for (const lot of allLots) {
        const arr = lotsByEntryId.get(lot.stockEntryId) || [];
        arr.push(lot);
        lotsByEntryId.set(lot.stockEntryId, arr);
      }
      
      const todayStr = getISTDateString();

      const aadhatDuesMap = new Map<number, { stockDue: number; dueTodayAmount: number; dueOver15Days: number; dueOver30Days: number }>();
      for (const entry of stockEntryList) {
        if (!entry.aadhatDbId) continue;
        const entryLots = lotsByEntryId.get(entry.id) || [];
        let entryNetPayable = 0;
        for (const lot of entryLots) {
          entryNetPayable += parseFloat(lot.netPayable || "0");
        }
        const amountPaid = parseFloat(entry.amountPaid || "0");
        const entryDue = Math.max(0, entryNetPayable - amountPaid);

        const existing = aadhatDuesMap.get(entry.aadhatDbId) || { stockDue: 0, dueTodayAmount: 0, dueOver15Days: 0, dueOver30Days: 0 };
        existing.stockDue += entryDue;

        if (entryDue > 0 && entry.purchaseDate) {
          const entryDate = typeof entry.purchaseDate === 'string' ? entry.purchaseDate : String(entry.purchaseDate);
          const ageDays = dateDiffInDaysIST(entryDate, todayStr);
          if (entryDate === todayStr) {
            existing.dueTodayAmount += entryDue;
          }
          if (ageDays > 30) {
            existing.dueOver30Days += entryDue;
          } else if (ageDays > 15) {
            existing.dueOver15Days += entryDue;
          }
        }

        aadhatDuesMap.set(entry.aadhatDbId, existing);
      }
      
      const aadhatsWithDues = aadhatList.map(aadhat => {
        const pyPayable = parseFloat(aadhat.pyPayable || "0");
        const buckets = aadhatDuesMap.get(aadhat.id) || { stockDue: 0, dueTodayAmount: 0, dueOver15Days: 0, dueOver30Days: 0 };
        return {
          ...aadhat,
          stockDue: buckets.stockDue,
          totalDue: pyPayable + buckets.stockDue,
          pyPayableAmount: pyPayable,
          dueTodayAmount: buckets.dueTodayAmount,
          dueOver15Days: buckets.dueOver15Days,
          dueOver30Days: buckets.dueOver30Days,
        };
      });
      
      res.json(aadhatsWithDues);
    } catch (error) {
      console.error("Error fetching aadhats:", error);
      res.status(500).json({ message: "Failed to fetch aadhats" });
    }
  });

  // POST /api/aadhats - Create a new aadhat
  app.post("/api/aadhats", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      
      const { name, address, contact, pyPayable, redFlag, isActive } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: "Aadhat name is required" });
      }
      if (!address || address.trim() === '') {
        return res.status(400).json({ message: "Address is required" });
      }

      const today = getISTDateString();
      const dateStr = parseDateToCodeFormat(today);
      const codePrefix = `AD${dateStr}`;
      
      const maxRetries = 3;
      let aadhat: any;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const maxSeq = await storage.getMaxAadhatCodeSequence(merchantId, codePrefix);
        const aadhatCode = `AD${dateStr}${maxSeq + 1 + attempt}`;
        try {
          aadhat = await storage.createAadhat({
            merchantId,
            aadhatId: aadhatCode,
            dateAdded: today,
            name: titleCaseKeep(name.trim()),
            address: titleCase(address.trim()) || address.trim(),
            contact: contact?.trim() || null,
            pyPayable: pyPayable || "0",
            redFlag: redFlag ?? false,
            isActive: isActive ?? true,
          });
          break;
        } catch (error: any) {
          if (error?.code === '23505' && error?.constraint?.includes('aadhat_id') && attempt < maxRetries - 1) {
            continue;
          }
          throw error;
        }
      }
      if (!aadhat) throw new Error("Failed to generate unique aadhat code after multiple attempts");
      res.status(201).json(aadhat);
    } catch (error) {
      console.error("Error creating aadhat:", error);
      res.status(500).json({ message: "Failed to create aadhat" });
    }
  });

  // PATCH /api/aadhats/:id - Update an aadhat (simple fields like isActive)
  app.patch("/api/aadhats/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      
      const updated = await storage.updateAadhat(id, merchantId, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Aadhat not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating aadhat:", error);
      res.status(500).json({ message: "Failed to update aadhat" });
    }
  });

  // PATCH /api/aadhats/:id/details - Update aadhat details with edit history
  app.patch("/api/aadhats/:id/details", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const id = parseInt(req.params.id);
      const { name, address, contact, pyPayable, redFlag } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: "Aadhat name is required" });
      }

      const existingAadhat = await storage.getAadhatById(id, merchantId);
      if (!existingAadhat) {
        return res.status(404).json({ message: "Aadhat not found" });
      }

      const newName = name.trim();
      const newAddress = address?.trim() || null;
      const newContact = contact?.trim() || null;

      const matchingAadhat = await storage.getAadhatByCompositeKey(merchantId, newName, newContact);
      if (matchingAadhat && matchingAadhat.id !== id) {
        return res.status(409).json({
          message: "An aadhat with this name and contact already exists",
          requiresMerge: true,
          existingAadhat: matchingAadhat,
        });
      }

      const changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> = [];
      const newPyPayable = pyPayable ?? "0";
      const newRedFlag = redFlag ?? existingAadhat.redFlag;

      if (existingAadhat.name !== newName) {
        changes.push({ fieldName: "name", oldValue: existingAadhat.name, newValue: newName });
      }
      if (existingAadhat.address !== newAddress) {
        changes.push({ fieldName: "address", oldValue: existingAadhat.address, newValue: newAddress });
      }
      if (existingAadhat.contact !== newContact) {
        changes.push({ fieldName: "contact", oldValue: existingAadhat.contact, newValue: newContact });
      }
      if (existingAadhat.pyPayable !== newPyPayable) {
        changes.push({ fieldName: "pyPayable", oldValue: existingAadhat.pyPayable, newValue: newPyPayable });
      }
      if (existingAadhat.redFlag !== newRedFlag) {
        changes.push({ fieldName: "redFlag", oldValue: String(existingAadhat.redFlag), newValue: String(newRedFlag) });
      }

      if (changes.length > 0) {
        const nextSerial = await storage.getNextAadhatEditHistorySerialNumber(merchantId);
        for (const change of changes) {
          await storage.createAadhatEditHistory({
            serialNumber: nextSerial,
            merchantId,
            aadhatId: id,
            changedBy: userId,
            fieldName: change.fieldName,
            oldValue: change.oldValue,
            newValue: change.newValue,
          });
        }
      }

      const result = await storage.updateAadhatWithPropagation(id, merchantId, {
        name: newName,
        address: newAddress,
        contact: newContact,
      });

      if (existingAadhat.pyPayable !== newPyPayable || existingAadhat.redFlag !== newRedFlag) {
        await storage.updateAadhat(id, merchantId, {
          pyPayable: newPyPayable,
          redFlag: newRedFlag,
        });
      }

      if (!result.aadhat) {
        return res.status(404).json({ message: "Aadhat not found" });
      }

      const totalUpdated = result.stockEntriesUpdated + result.cashEntriesUpdated;
      res.json({
        aadhat: result.aadhat,
        stockEntriesUpdated: result.stockEntriesUpdated,
        cashEntriesUpdated: result.cashEntriesUpdated,
        changesRecorded: changes.length,
        message: `Aadhat updated. ${totalUpdated} linked record(s) updated.`
      });
    } catch (error) {
      console.error("Error updating aadhat details:", error);
      res.status(500).json({ message: "Failed to update aadhat" });
    }
  });

  // POST /api/aadhats/merge - Merge two aadhats
  app.post("/api/aadhats/merge", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const { sourceId, targetId } = req.body;

      if (!sourceId || !targetId) {
        return res.status(400).json({ message: "sourceId and targetId are required" });
      }

      const result = await storage.mergeAadhats(merchantId, userId, sourceId, targetId);
      res.json({
        aadhat: result.survivingAadhat,
        mergedCount: result.mergedCount,
        message: `Aadhats merged successfully. ${result.mergedCount} linked records transferred.`
      });
    } catch (error) {
      console.error("Error merging aadhats:", error);
      res.status(500).json({ message: "Failed to merge aadhats" });
    }
  });

  // GET /api/aadhats/:id/history - Get edit history for an aadhat
  app.get("/api/aadhats/:id/history", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const aadhatId = parseInt(req.params.id);
      
      const history = await storage.getAadhatEditHistory(aadhatId, merchantId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching aadhat edit history:", error);
      res.status(500).json({ message: "Failed to fetch edit history" });
    }
  });

  // ==================== Sundry Pay Ledger ====================

  app.get("/api/sundry-pay", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const year = req.query.year as string | undefined;
      const stakeholders = await storage.getSundryPayByMerchant(merchantId);

      const conditions = [
        eq(cashEntries.merchantId, merchantId),
        eq(cashEntries.isReversed, false),
        isNotNull(cashEntries.sundryPayDbId),
      ];

      if (year && year !== "all") {
        conditions.push(sql`EXTRACT(YEAR FROM ${cashEntries.entryDate}::date) = ${parseInt(year)}`);
      }

      const cashEntryList = await db.select().from(cashEntries).where(
        and(...conditions)
      );

      const duesMap = new Map<number, { totalGiven: number; totalReceived: number }>();
      for (const entry of cashEntryList) {
        if (!entry.sundryPayDbId) continue;
        const existing = duesMap.get(entry.sundryPayDbId) || { totalGiven: 0, totalReceived: 0 };
        const amount = parseFloat(entry.amount || "0");
        if (entry.direction === "outflow") {
          existing.totalGiven += amount;
        } else if (entry.direction === "inward") {
          existing.totalReceived += amount;
        }
        duesMap.set(entry.sundryPayDbId, existing);
      }

      const stakeholdersWithDues = stakeholders.map(s => {
        const pyReceivable = parseFloat(s.pyReceivable || "0");
        const dues = duesMap.get(s.id) || { totalGiven: 0, totalReceived: 0 };
        const totalDue = pyReceivable + dues.totalGiven - dues.totalReceived;
        return {
          ...s,
          pyReceivableAmount: pyReceivable,
          totalGiven: dues.totalGiven,
          totalReceived: dues.totalReceived,
          totalDue: Math.max(0, totalDue),
        };
      });

      res.json(stakeholdersWithDues);
    } catch (error) {
      console.error("Error fetching sundry pay stakeholders:", error);
      res.status(500).json({ message: "Failed to fetch sundry pay stakeholders" });
    }
  });

  app.post("/api/sundry-pay", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { name, address, contact, pyReceivable, redFlag, isActive } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: "Stakeholder name is required" });
      }
      if (!address || address.trim() === '') {
        return res.status(400).json({ message: "Address is required" });
      }

      const today = getISTDateString();
      const dateStr = parseDateToCodeFormat(today);
      const codePrefix = `SU${dateStr}`;

      const maxRetries = 3;
      let stakeholder: any;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const maxSeq = await storage.getMaxSundryPayCodeSequence(merchantId, codePrefix);
        const sundryPayCode = `SU${dateStr}${maxSeq + 1 + attempt}`;
        try {
          stakeholder = await storage.createSundryPay({
            merchantId,
            sundryPayId: sundryPayCode,
            dateAdded: today,
            name: titleCaseKeep(name.trim()),
            address: titleCase(address.trim()) || address.trim(),
            contact: contact?.trim() || null,
            pyReceivable: pyReceivable || "0",
            redFlag: redFlag ?? false,
            isActive: isActive ?? true,
          });
          break;
        } catch (error: any) {
          if (error?.code === '23505' && error?.constraint?.includes('sundry_pay') && attempt < maxRetries - 1) {
            continue;
          }
          throw error;
        }
      }
      if (!stakeholder) throw new Error("Failed to generate unique sundry pay code after multiple attempts");
      res.status(201).json(stakeholder);
    } catch (error) {
      console.error("Error creating sundry pay stakeholder:", error);
      res.status(500).json({ message: "Failed to create sundry pay stakeholder" });
    }
  });

  app.patch("/api/sundry-pay/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      const updated = await storage.updateSundryPay(id, merchantId, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Stakeholder not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating sundry pay stakeholder:", error);
      res.status(500).json({ message: "Failed to update sundry pay stakeholder" });
    }
  });

  app.patch("/api/sundry-pay/:id/details", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const id = parseInt(req.params.id);
      const { name, address, contact, pyReceivable, redFlag } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: "Stakeholder name is required" });
      }

      const existing = await storage.getSundryPayById(id, merchantId);
      if (!existing) {
        return res.status(404).json({ message: "Stakeholder not found" });
      }

      const newName = name.trim();
      const newAddress = address?.trim() || null;
      const newContact = contact?.trim() || null;

      const matching = await storage.getSundryPayByCompositeKey(merchantId, newName, newContact);
      if (matching && matching.id !== id) {
        return res.status(409).json({
          message: "A stakeholder with this name and contact already exists",
          existingStakeholder: matching,
        });
      }

      const changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> = [];
      const newPyReceivable = pyReceivable ?? "0";
      const newRedFlag = redFlag ?? existing.redFlag;

      if (existing.name !== newName) {
        changes.push({ fieldName: "name", oldValue: existing.name, newValue: newName });
      }
      if (existing.address !== newAddress) {
        changes.push({ fieldName: "address", oldValue: existing.address, newValue: newAddress });
      }
      if (existing.contact !== newContact) {
        changes.push({ fieldName: "contact", oldValue: existing.contact, newValue: newContact });
      }
      if (existing.pyReceivable !== newPyReceivable) {
        changes.push({ fieldName: "pyReceivable", oldValue: existing.pyReceivable, newValue: newPyReceivable });
      }
      if (existing.redFlag !== newRedFlag) {
        changes.push({ fieldName: "redFlag", oldValue: String(existing.redFlag), newValue: String(newRedFlag) });
      }

      if (changes.length > 0) {
        const nextSerial = await storage.getNextSundryPayEditHistorySerialNumber(merchantId);
        for (const change of changes) {
          await storage.createSundryPayEditHistory({
            serialNumber: nextSerial,
            merchantId,
            sundryPayStakeholderId: id,
            changedBy: userId,
            fieldName: change.fieldName,
            oldValue: change.oldValue,
            newValue: change.newValue,
          });
        }
      }

      const result = await storage.updateSundryPayWithPropagation(id, merchantId, {
        name: newName,
        address: newAddress,
        contact: newContact,
      });

      if (existing.pyReceivable !== newPyReceivable || existing.redFlag !== newRedFlag) {
        await storage.updateSundryPay(id, merchantId, {
          pyReceivable: newPyReceivable,
          redFlag: newRedFlag,
        });
      }

      if (!result.stakeholder) {
        return res.status(404).json({ message: "Stakeholder not found" });
      }

      res.json({
        stakeholder: result.stakeholder,
        cashEntriesUpdated: result.cashEntriesUpdated,
        changesRecorded: changes.length,
        message: `Stakeholder updated. ${result.cashEntriesUpdated} linked record(s) updated.`
      });
    } catch (error) {
      console.error("Error updating sundry pay details:", error);
      res.status(500).json({ message: "Failed to update sundry pay stakeholder" });
    }
  });

  app.get("/api/sundry-pay/:id/history", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const stakeholderId = parseInt(req.params.id);
      const history = await storage.getSundryPayEditHistory(stakeholderId, merchantId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching sundry pay edit history:", error);
      res.status(500).json({ message: "Failed to fetch edit history" });
    }
  });

  // ==================== Cold Store Ledger ====================

  app.get("/api/cold-store-ledger", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const coldStoreList = await storage.getColdStoresByMerchant(merchantId);
      const coldStoresWithDue = await storage.getColdStoresWithDue(merchantId);
      
      const dueMap = new Map<number, number>();
      for (const cs of coldStoresWithDue) {
        if (cs.coldStoreDbId) dueMap.set(cs.coldStoreDbId, cs.totalDue);
      }
      
      const result = coldStoreList.map(cs => {
        const pyPayable = parseFloat(cs.pyPayable || "0");
        const totalDue = dueMap.get(cs.id) || pyPayable;
        const coldStoreDue = totalDue - pyPayable;
        return {
          ...cs,
          coldStoreDue,
          totalDue,
        };
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching cold store ledger:", error);
      res.status(500).json({ message: "Failed to fetch cold store ledger" });
    }
  });

  app.post("/api/cold-store-ledger", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const { name, address, contact, pyPayable, redFlag, isActive, bankName, bankAccountNumber, ifscCode } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: "Cold store name is required" });
      }
      if (!address && address !== '') {
        return res.status(400).json({ message: "Address is required" });
      }

      const today = getISTDateString();
      const dateStr = parseDateToCodeFormat(today);
      const codePrefix = `CS${dateStr}`;
      
      const maxRetries = 3;
      let coldStore: any;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const maxSeq = await storage.getMaxColdStoreCodeSequence(merchantId, codePrefix);
        const csCode = `CS${dateStr}${maxSeq + 1 + attempt}`;
        try {
          coldStore = await storage.createColdStore({
            merchantId,
            coldStoreId: csCode,
            dateAdded: today,
            name: titleCaseKeep(name.trim()),
            address: (address || "").trim(),
            contact: contact?.trim() || null,
            pyPayable: pyPayable || "0",
            originalPyPayable: pyPayable || "0",
            redFlag: redFlag ?? false,
            isActive: isActive ?? true,
            bankName: bankName ? bankName.trim().toUpperCase() : null,
            bankAccountNumber: bankAccountNumber?.trim() || null,
            ifscCode: ifscCode?.trim() || null,
          });
          break;
        } catch (error: any) {
          if (error?.code === '23505' && error?.constraint?.includes('cold_store_id') && attempt < maxRetries - 1) {
            continue;
          }
          throw error;
        }
      }
      if (!coldStore) throw new Error("Failed to generate unique cold store code after multiple attempts");
      res.status(201).json(coldStore);
    } catch (error) {
      console.error("Error creating cold store:", error);
      res.status(500).json({ message: "Failed to create cold store" });
    }
  });

  app.post("/api/cold-store-ledger/sync", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;

      const existingColdStores = await storage.getColdStoresByMerchant(merchantId);
      const existingNameMap = new Map<string, number>();
      for (const cs of existingColdStores) {
        existingNameMap.set(cs.name.trim().toLowerCase(), cs.id);
      }

      const allLots = await storage.getAllLotsByMerchant(merchantId);
      const allSeedEntries = await storage.getSeedEntriesByMerchant(merchantId);

      const coldStoreNames = new Map<string, string>();
      for (const lot of allLots) {
        if (lot.coldStoreName && lot.coldStoreName.trim()) {
          const key = lot.coldStoreName.trim().toLowerCase();
          if (!coldStoreNames.has(key)) {
            coldStoreNames.set(key, titleCaseKeep(lot.coldStoreName.trim()));
          }
        }
      }
      for (const entry of allSeedEntries) {
        for (const sLot of (entry.seedLots || [])) {
          if (sLot.coldStoreName && sLot.coldStoreName.trim()) {
            const key = sLot.coldStoreName.trim().toLowerCase();
            if (!coldStoreNames.has(key)) {
              coldStoreNames.set(key, titleCaseKeep(sLot.coldStoreName.trim()));
            }
          }
        }
      }

      let created = 0;
      const today = getISTDateString();
      const dateStr = parseDateToCodeFormat(today);

      for (const [key, displayName] of coldStoreNames) {
        if (!existingNameMap.has(key)) {
          const maxRetries = 3;
          let newCS: any = null;
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            const maxSeq = await storage.getMaxColdStoreCodeSequence(merchantId, `CS${dateStr}`);
            const csCode = `CS${dateStr}${maxSeq + 1 + attempt}`;
            try {
              newCS = await storage.createColdStore({
                merchantId,
                coldStoreId: csCode,
                dateAdded: today,
                name: displayName,
                address: "",
                contact: null,
                pyPayable: "0",
                originalPyPayable: "0",
                redFlag: false,
                isActive: true,
                bankName: null,
                bankAccountNumber: null,
                ifscCode: null,
              });
              break;
            } catch (error: any) {
              if (error?.code === '23505' && error?.constraint?.includes('cold_store_id') && attempt < maxRetries - 1) {
                continue;
              }
              throw error;
            }
          }
          if (!newCS) throw new Error(`Failed to create cold store "${displayName}" after ${maxRetries} attempts`);
          existingNameMap.set(key, newCS.id);
          created++;
        }
      }

      let linked = 0;
      for (const lot of allLots) {
        if (lot.coldStoreName && lot.coldStoreName.trim() && !lot.coldStoreDbId) {
          const key = lot.coldStoreName.trim().toLowerCase();
          const csId = existingNameMap.get(key);
          if (csId) {
            await storage.updateLot(lot.id, merchantId, { coldStoreDbId: csId });
            linked++;
          }
        }
      }
      for (const entry of allSeedEntries) {
        for (const sLot of (entry.seedLots || [])) {
          if (sLot.coldStoreName && sLot.coldStoreName.trim() && !sLot.coldStoreDbId) {
            const key = sLot.coldStoreName.trim().toLowerCase();
            const csId = existingNameMap.get(key);
            if (csId) {
              await storage.updateSeedLot(sLot.id, merchantId, { coldStoreDbId: csId });
              linked++;
            }
          }
        }
      }

      res.json({ created, linked });
    } catch (error) {
      console.error("Error syncing cold stores:", error);
      res.status(500).json({ message: "Failed to sync cold stores" });
    }
  });

  app.patch("/api/cold-store-ledger/:id", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const id = parseInt(req.params.id);
      
      const allowedFields: Record<string, any> = {};
      if (req.body.isActive !== undefined) allowedFields.isActive = req.body.isActive;
      const updated = await storage.updateColdStore(id, merchantId, allowedFields);
      if (!updated) {
        return res.status(404).json({ message: "Cold store not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating cold store:", error);
      res.status(500).json({ message: "Failed to update cold store" });
    }
  });

  app.patch("/api/cold-store-ledger/:id/details", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const id = parseInt(req.params.id);
      const { name, address, contact, pyPayable, redFlag, bankName, bankAccountNumber, ifscCode } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: "Cold store name is required" });
      }

      const existingCS = await storage.getColdStoreById(id, merchantId);
      if (!existingCS) {
        return res.status(404).json({ message: "Cold store not found" });
      }

      const newName = name.trim();

      const matchingCS = await storage.getColdStoreByCompositeKey(merchantId, newName);
      if (matchingCS && matchingCS.id !== id) {
        return res.status(409).json({
          message: "A cold store with this name already exists",
          requiresMerge: true,
          existingColdStore: matchingCS,
        });
      }

      const changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> = [];
      const newAddress = (address || "").trim();
      const newContact = contact?.trim() || null;
      const newPyPayable = pyPayable ?? "0";
      const newRedFlag = redFlag ?? existingCS.redFlag;
      const newBankName = bankName ? bankName.trim().toUpperCase() : null;
      const newBankAccountNumber = bankAccountNumber?.trim() || null;
      const newIfscCode = ifscCode?.trim() || null;

      if (existingCS.name !== newName) changes.push({ fieldName: "name", oldValue: existingCS.name, newValue: newName });
      if (existingCS.address !== newAddress) changes.push({ fieldName: "address", oldValue: existingCS.address, newValue: newAddress });
      if (existingCS.contact !== newContact) changes.push({ fieldName: "contact", oldValue: existingCS.contact, newValue: newContact });
      if (existingCS.pyPayable !== newPyPayable) changes.push({ fieldName: "pyPayable", oldValue: existingCS.pyPayable, newValue: newPyPayable });
      if (existingCS.redFlag !== newRedFlag) changes.push({ fieldName: "redFlag", oldValue: String(existingCS.redFlag), newValue: String(newRedFlag) });
      if (existingCS.bankName !== newBankName) changes.push({ fieldName: "bankName", oldValue: existingCS.bankName, newValue: newBankName });
      if (existingCS.bankAccountNumber !== newBankAccountNumber) changes.push({ fieldName: "bankAccountNumber", oldValue: existingCS.bankAccountNumber, newValue: newBankAccountNumber });
      if (existingCS.ifscCode !== newIfscCode) changes.push({ fieldName: "ifscCode", oldValue: existingCS.ifscCode, newValue: newIfscCode });

      if (changes.length > 0) {
        const nextSerial = await storage.getNextColdStoreEditHistorySerialNumber(merchantId);
        for (const change of changes) {
          await storage.createColdStoreEditHistory({
            serialNumber: nextSerial,
            merchantId,
            coldStoreId: id,
            changedBy: userId,
            fieldName: change.fieldName,
            oldValue: change.oldValue,
            newValue: change.newValue,
          });
        }
      }

      const result = await storage.updateColdStoreWithPropagation(id, merchantId, {
        name: newName,
        address: newAddress,
        contact: newContact,
      });

      if (existingCS.pyPayable !== newPyPayable || existingCS.redFlag !== newRedFlag || 
          existingCS.bankName !== newBankName || existingCS.bankAccountNumber !== newBankAccountNumber ||
          existingCS.ifscCode !== newIfscCode) {
        const updateData: any = {
          pyPayable: newPyPayable,
          redFlag: newRedFlag,
          bankName: newBankName,
          bankAccountNumber: newBankAccountNumber,
          ifscCode: newIfscCode,
        };
        if (existingCS.pyPayable !== newPyPayable) {
          updateData.originalPyPayable = newPyPayable;
        }
        await storage.updateColdStore(id, merchantId, updateData);
      }

      if (!result.coldStore) {
        return res.status(404).json({ message: "Cold store not found" });
      }

      const totalUpdated = result.lotsUpdated + result.seedLotsUpdated + result.cashEntriesUpdated;
      res.json({
        coldStore: result.coldStore,
        lotsUpdated: result.lotsUpdated,
        seedLotsUpdated: result.seedLotsUpdated,
        cashEntriesUpdated: result.cashEntriesUpdated,
        changesRecorded: changes.length,
        message: `Cold store updated. ${totalUpdated} linked record(s) updated.`
      });
    } catch (error) {
      console.error("Error updating cold store details:", error);
      res.status(500).json({ message: "Failed to update cold store" });
    }
  });

  app.post("/api/cold-store-ledger/merge", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const userId = req.user!.id;
      const { sourceId, targetId } = req.body;

      if (!sourceId || !targetId) {
        return res.status(400).json({ message: "sourceId and targetId are required" });
      }

      const result = await storage.mergeColdStores(merchantId, userId, sourceId, targetId);
      res.json({
        coldStore: result.survivingColdStore,
        mergedCount: result.mergedCount,
        message: `Cold stores merged successfully. ${result.mergedCount} linked records transferred.`
      });
    } catch (error) {
      console.error("Error merging cold stores:", error);
      res.status(500).json({ message: "Failed to merge cold stores" });
    }
  });

  app.get("/api/cold-store-ledger/:id/history", requireMerchant, async (req, res) => {
    try {
      const merchantId = req.user!.merchantId!;
      const coldStoreId = parseInt(req.params.id);
      
      const history = await storage.getColdStoreEditHistory(coldStoreId, merchantId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching cold store edit history:", error);
      res.status(500).json({ message: "Failed to fetch edit history" });
    }
  });

  // ==================== Demo Videos ====================

  app.post("/api/admin/demo-videos", requireSystemAdmin, (req, res) => {
    videoUpload.single("video")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ message: "File too large. Maximum size is 200MB." });
        }
        return res.status(400).json({ message: err.message || "Upload failed" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No video file provided" });
      }
      try {
        const caption = (req.body.caption as string) || req.file.originalname;
        const video = await storage.createDemoVideo({
          filename: req.file.filename,
          originalName: req.file.originalname,
          caption,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
        });
        res.status(201).json(video);
      } catch (error) {
        console.error("Error creating demo video:", error);
        res.status(500).json({ message: "Failed to save video" });
      }
    });
  });

  app.get("/api/demo-videos", requireAuth, async (_req, res) => {
    try {
      const videos = await storage.getDemoVideos();
      res.json(videos);
    } catch (error) {
      console.error("Error fetching demo videos:", error);
      res.status(500).json({ message: "Failed to fetch videos" });
    }
  });

  app.get("/api/demo-videos/:id/stream", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const video = await storage.getDemoVideoById(id);
      if (!video) return res.status(404).json({ message: "Video not found" });

      const filePath = path.join(uploadsDir, video.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Video file not found" });

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      const CHUNK_SIZE = 1024 * 1024;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + CHUNK_SIZE, fileSize - 1);
        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });
        stream.on("error", (err) => {
          console.error("Stream read error:", err);
          if (!res.headersSent) res.status(500).end();
        });
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": video.mimeType,
          "Cache-Control": "no-cache, no-store",
          "X-Accel-Buffering": "no",
          "Connection": "keep-alive",
        });
        stream.pipe(res);
      } else {
        const end = Math.min(CHUNK_SIZE, fileSize - 1);
        const chunkSize = end + 1;
        const stream = fs.createReadStream(filePath, { start: 0, end });
        stream.on("error", (err) => {
          console.error("Stream read error:", err);
          if (!res.headersSent) res.status(500).end();
        });
        res.writeHead(206, {
          "Content-Range": `bytes 0-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": video.mimeType,
          "Cache-Control": "no-cache, no-store",
          "X-Accel-Buffering": "no",
          "Connection": "keep-alive",
        });
        stream.pipe(res);
      }
    } catch (error) {
      console.error("Error streaming demo video:", error);
      res.status(500).json({ message: "Failed to stream video" });
    }
  });

  app.patch("/api/admin/demo-videos/:id", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { caption } = req.body;
      if (!caption || typeof caption !== "string") {
        return res.status(400).json({ message: "Caption is required" });
      }
      const updated = await storage.updateDemoVideoCaption(id, caption);
      if (!updated) return res.status(404).json({ message: "Video not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating demo video:", error);
      res.status(500).json({ message: "Failed to update video" });
    }
  });

  app.delete("/api/admin/demo-videos/:id", requireSystemAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const video = await storage.getDemoVideoById(id);
      if (!video) return res.status(404).json({ message: "Video not found" });

      const filePath = path.join(uploadsDir, video.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await storage.deleteDemoVideo(id);
      res.json({ message: "Video deleted" });
    } catch (error) {
      console.error("Error deleting demo video:", error);
      res.status(500).json({ message: "Failed to delete video" });
    }
  });

  // ==================== Books: Asset Routes ====================
  app.get("/api/assets", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const assetsList = await storage.getAssets(merchantId);
      const depLogs = await storage.getDepreciationLogs(merchantId);
      const enriched = assetsList.map(a => {
        const logs = depLogs.filter(d => d.assetId === a.id);
        const totalDepreciation = logs.reduce((sum, d) => sum + parseFloat(d.depreciationAmount), 0);
        const currentBookValue = parseFloat(a.purchaseCost) - totalDepreciation;
        return { ...a, depreciationLogs: logs, totalDepreciation, currentBookValue };
      });
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching assets:", error);
      res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  app.post("/api/assets", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const data = insertAssetSchema.parse({ ...req.body, merchantId });
      const asset = await storage.createAsset(data);
      res.json(asset);
    } catch (error) {
      console.error("Error creating asset:", error);
      res.status(500).json({ message: "Failed to create asset" });
    }
  });

  app.patch("/api/assets/:id", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const id = parseInt(req.params.id);
      const updated = await storage.updateAsset(id, merchantId, req.body);
      if (!updated) return res.status(404).json({ message: "Asset not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating asset:", error);
      res.status(500).json({ message: "Failed to update asset" });
    }
  });

  app.delete("/api/assets/:id", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const id = parseInt(req.params.id);
      await storage.deleteAsset(id, merchantId);
      res.json({ message: "Asset deleted" });
    } catch (error) {
      console.error("Error deleting asset:", error);
      res.status(500).json({ message: "Failed to delete asset" });
    }
  });

  app.get("/api/assets/:id/depreciation", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const assetId = parseInt(req.params.id);
      const logs = await storage.getDepreciationLogs(merchantId, assetId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching depreciation logs:", error);
      res.status(500).json({ message: "Failed to fetch depreciation logs" });
    }
  });

  app.post("/api/assets/:id/depreciate", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const assetId = parseInt(req.params.id);
      const { financialYear } = req.body;
      if (!financialYear) return res.status(400).json({ message: "Financial year is required" });

      const asset = await storage.getAssetById(assetId, merchantId);
      if (!asset) return res.status(404).json({ message: "Asset not found" });

      const existingLogs = await storage.getDepreciationLogs(merchantId, assetId, financialYear);
      if (existingLogs.length > 0) return res.status(400).json({ message: "Depreciation already calculated for this FY" });

      const allLogs = await storage.getDepreciationLogs(merchantId, assetId);
      const totalPriorDep = allLogs.reduce((sum, d) => sum + parseFloat(d.depreciationAmount), 0);
      const openingValue = parseFloat(asset.purchaseCost) - totalPriorDep;
      const salvage = parseFloat(asset.salvageValue || "0");

      if (openingValue <= salvage) {
        return res.status(400).json({ message: "Asset fully depreciated" });
      }

      const rate = ASSET_DEPRECIATION_RATES[asset.category] || 10;
      let depAmount = (openingValue * rate) / 100;
      if (openingValue - depAmount < salvage) {
        depAmount = openingValue - salvage;
      }
      const closingValue = openingValue - depAmount;

      const log = await storage.createDepreciationLog({
        assetId,
        merchantId,
        financialYear,
        openingValue: openingValue.toFixed(2),
        depreciationAmount: depAmount.toFixed(2),
        closingValue: closingValue.toFixed(2),
        depreciationRate: rate.toFixed(2),
      });
      res.json(log);
    } catch (error) {
      console.error("Error calculating depreciation:", error);
      res.status(500).json({ message: "Failed to calculate depreciation" });
    }
  });

  // ==================== Books: Liability Routes ====================
  app.get("/api/liabilities", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const liabilitiesList = await storage.getLiabilities(merchantId);
      const enriched = await Promise.all(liabilitiesList.map(async (l) => {
        const payments = await storage.getLiabilityPayments(l.id, merchantId);
        const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const totalPrincipalPaid = payments.reduce((sum, p) => sum + parseFloat(p.principalPortion || "0"), 0);
        const remainingBalance = parseFloat(l.principalAmount) - totalPrincipalPaid;
        return { ...l, payments, totalPaid, totalPrincipalPaid, remainingBalance };
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching liabilities:", error);
      res.status(500).json({ message: "Failed to fetch liabilities" });
    }
  });

  app.post("/api/liabilities", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const data = insertLiabilitySchema.parse({ ...req.body, merchantId });
      const liability = await storage.createLiability(data);
      res.json(liability);
    } catch (error) {
      console.error("Error creating liability:", error);
      res.status(500).json({ message: "Failed to create liability" });
    }
  });

  app.patch("/api/liabilities/:id", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const id = parseInt(req.params.id);
      const updated = await storage.updateLiability(id, merchantId, req.body);
      if (!updated) return res.status(404).json({ message: "Liability not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating liability:", error);
      res.status(500).json({ message: "Failed to update liability" });
    }
  });

  app.delete("/api/liabilities/:id", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const id = parseInt(req.params.id);
      await storage.deleteLiability(id, merchantId);
      res.json({ message: "Liability deleted" });
    } catch (error) {
      console.error("Error deleting liability:", error);
      res.status(500).json({ message: "Failed to delete liability" });
    }
  });

  app.get("/api/liabilities/:id/payments", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const liabilityId = parseInt(req.params.id);
      const payments = await storage.getLiabilityPayments(liabilityId, merchantId);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching liability payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post("/api/liabilities/:id/payments", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const liabilityId = parseInt(req.params.id);
      const data = insertLiabilityPaymentSchema.parse({ ...req.body, liabilityId, merchantId });
      const payment = await storage.createLiabilityPayment(data);
      res.json(payment);
    } catch (error) {
      console.error("Error creating liability payment:", error);
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  app.delete("/api/liabilities/payments/:id", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const id = parseInt(req.params.id);
      await storage.deleteLiabilityPayment(id, merchantId);
      res.json({ message: "Payment deleted" });
    } catch (error) {
      console.error("Error deleting liability payment:", error);
      res.status(500).json({ message: "Failed to delete payment" });
    }
  });

  // ==================== Books: Balance Sheet ====================
  app.get("/api/books/balance-sheet", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const fy = req.query.fy as string;
      if (!fy) return res.status(400).json({ message: "Financial year (fy) is required" });

      const [fyStartYear] = fy.split("-").map(Number);
      const fyStartDate = `${fyStartYear}-04-01`;
      const fyEndDate = `${fyStartYear + 1}-03-31`;

      const assetsList = await storage.getAssets(merchantId);
      const allDepLogs = await storage.getDepreciationLogs(merchantId);

      let fixedAssetsGross = 0;
      let accumulatedDepreciation = 0;
      const fixedAssetDetails: any[] = [];
      for (const a of assetsList) {
        const cost = parseFloat(a.purchaseCost);
        const logsUpToFY = allDepLogs.filter(d => d.assetId === a.id && d.financialYear <= fy);
        const totalDep = logsUpToFY.reduce((sum, d) => sum + parseFloat(d.depreciationAmount), 0);
        fixedAssetsGross += cost;
        accumulatedDepreciation += totalDep;
        fixedAssetDetails.push({ name: a.name, category: a.category, cost, depreciation: totalDep, bookValue: cost - totalDep });
      }

      const cashSettingsData = await storage.getCashSettings(merchantId, fy);
      const openingCash = parseFloat(cashSettingsData?.openingCashInHand || "0");
      const openingAccount = parseFloat(cashSettingsData?.openingCashInAccount || "0");

      const cashEntries = await storage.getCashEntriesByMerchant(merchantId);
      const fyEntries = cashEntries.filter(e => {
        const d = e.entryDate;
        return d >= fyStartDate && d <= fyEndDate && !e.isReversed;
      });

      let cashInHand = openingCash;
      let bankBalance = openingAccount;
      for (const e of fyEntries) {
        const amt = parseFloat(e.amount);
        if (e.direction === "inward") {
          if (e.receiptType === "cash_received") cashInHand += amt;
          else if (e.receiptType === "account_received" || e.receiptType === "cheque_received") bankBalance += amt;
        } else if (e.direction === "outflow") {
          if (e.paymentMode === "cash") cashInHand -= amt;
          else if (e.paymentMode === "account_transfer" || e.paymentMode === "cheque") bankBalance -= amt;
        } else if (e.direction === "transfer") {
          if (e.fromAccountType === "cash_in_hand") cashInHand -= amt;
          if (e.toAccountType === "cash_in_hand") cashInHand += amt;
        }
      }

      const bankAccounts = await storage.getBankAccountsByMerchant(merchantId);
      const bankAccountBalances: any[] = [];
      const limitAccountLiabilityDetails: any[] = [];
      let totalBankBalance = 0;
      let limitAccountLiabilities = 0;
      if (bankAccounts.length > 0) {
        for (const acct of bankAccounts) {
          let bal = parseFloat(acct.openingBalance || "0");
          for (const e of fyEntries) {
            const amt = parseFloat(e.amount);
            if (e.direction === "inward" && (e.receiptType === "account_received" || e.receiptType === "cheque_received") && e.bankAccountId === acct.id) bal += amt;
            if (e.direction === "outflow" && (e.paymentMode === "account_transfer" || e.paymentMode === "cheque") && e.bankAccountId === acct.id) bal -= amt;
            if (e.direction === "transfer" && e.toBankAccountId === acct.id) bal += amt;
            if (e.direction === "transfer" && e.fromBankAccountId === acct.id) bal -= amt;
          }
          if (bal < 0) {
            limitAccountLiabilities += Math.abs(bal);
            limitAccountLiabilityDetails.push({ name: acct.name, balance: Math.abs(bal) });
          } else {
            bankAccountBalances.push({ name: acct.name, balance: bal });
            totalBankBalance += bal;
          }
        }
      } else {
        totalBankBalance = bankBalance;
      }

      const buyers = await storage.getBuyersByMerchant(merchantId);
      const transactionList = await storage.getTransactionsByMerchant(merchantId);
      let buyerReceivables = 0;
      for (const buyer of buyers) {
        let totalDue = 0;
        for (const txn of transactionList) {
          if (txn.buyerId === buyer.id) {
            const revenue = parseFloat(txn.revenue || "0");
            const amountReceived = parseFloat(txn.amountReceived || "0");
            totalDue += Math.max(0, revenue - amountReceived);
          }
        }
        buyerReceivables += totalDue + parseFloat(buyer.receivableBalance || "0");
      }

      const farmers = await storage.getFarmersByMerchant(merchantId);
      const stockEntryList = await storage.getStockEntriesByMerchant(merchantId);
      const seedTransactionList = await storage.getSeedTransactionsByMerchant(merchantId);
      const allLots = await storage.getAllLotsByMerchant(merchantId);

      const lotsByEntryId = new Map<number, typeof allLots>();
      const mandiEntryIds = new Set<number>();
      for (const lot of allLots) {
        const existing = lotsByEntryId.get(lot.stockEntryId) || [];
        existing.push(lot);
        lotsByEntryId.set(lot.stockEntryId, existing);
        if (lot.place === "mandi") {
          mandiEntryIds.add(lot.stockEntryId);
        }
      }

      let farmerReceivables = 0;
      let farmerPayables = 0;
      for (const farmer of farmers) {
        const normalizedName = farmer.name.trim().toLowerCase();
        const normalizedContact = farmer.contact?.trim().toLowerCase() || null;
        const normalizedVillage = farmer.village?.trim().toLowerCase() || null;

        let harvestDue = 0;
        for (const entry of stockEntryList) {
          if (mandiEntryIds.has(entry.id)) continue;
          const matchById = entry.farmerId === farmer.id;
          const eName = entry.farmerName?.trim().toLowerCase() || "";
          const eContact = entry.farmerContact?.trim().toLowerCase() || null;
          const eVillage = (entry as any).village?.trim().toLowerCase() || null;
          const matchByKey = !entry.farmerId && eName === normalizedName && eContact === normalizedContact && eVillage === normalizedVillage;
          if (matchById || matchByKey) {
            if (entry.paymentStatus === "due" || entry.paymentStatus === "partial") {
              const entryLots = lotsByEntryId.get(entry.id) || [];
              let entryNetPayable = 0;
              for (const lot of entryLots) {
                entryNetPayable += parseFloat(lot.netPayable || "0");
              }
              const amountPaid = parseFloat(entry.amountPaid || "0");
              harvestDue += Math.max(0, entryNetPayable - amountPaid);
            }
          }
        }

        let seedDue = 0;
        for (const txn of seedTransactionList) {
          const matchById = txn.farmerId === farmer.id;
          const tName = txn.farmerName?.trim().toLowerCase() || "";
          const tContact = txn.farmerContact?.trim().toLowerCase() || null;
          const tVillage = (txn as any).village?.trim().toLowerCase() || null;
          const matchByKey = !txn.farmerId && tName === normalizedName && tContact === normalizedContact && tVillage === normalizedVillage;
          if (matchById || matchByKey) {
            seedDue += parseFloat(txn.totalDueToFarmer || "0");
          }
        }

        const pyReceivable = parseFloat(farmer.remainingReceivable || "0");
        const netDue = harvestDue - pyReceivable - seedDue;

        if (netDue > 0) {
          farmerPayables += netDue;
        } else if (netDue < 0) {
          farmerReceivables += Math.abs(netDue);
        }
      }

      const liabilitiesList = await storage.getLiabilities(merchantId);
      let longTermLiabilities = 0;
      let shortTermLiabilities = 0;
      const liabilityDetails: any[] = [];
      for (const l of liabilitiesList) {
        if (!l.isActive) continue;
        const payments = await storage.getLiabilityPayments(l.id, merchantId);
        const principalPaid = payments.reduce((sum, p) => sum + parseFloat(p.principalPortion || "0"), 0);
        const remaining = parseFloat(l.principalAmount) - principalPaid;
        if (remaining <= 0) continue;
        if (l.type === "long_term") longTermLiabilities += remaining;
        else shortTermLiabilities += remaining;
        liabilityDetails.push({ name: l.name, type: l.type, remaining });
      }

      const allAadhats = await storage.getAadhatsByMerchant(merchantId);
      const aadhatDuesMap = new Map<number, number>();
      for (const entry of stockEntryList) {
        if (!entry.aadhatDbId) continue;
        const entryLots = lotsByEntryId.get(entry.id) || [];
        let entryNetPayable = 0;
        for (const lot of entryLots) {
          entryNetPayable += parseFloat(lot.netPayable || "0");
        }
        const amountPaid = parseFloat(entry.amountPaid || "0");
        const entryDue = Math.max(0, entryNetPayable - amountPaid);
        aadhatDuesMap.set(entry.aadhatDbId, (aadhatDuesMap.get(entry.aadhatDbId) || 0) + entryDue);
      }
      let aadhtiyaPayables = 0;
      for (const a of allAadhats) {
        if (!a.isActive) continue;
        const totalDue = parseFloat(a.pyPayable || "0") + (aadhatDuesMap.get(a.id) || 0);
        if (totalDue > 0) aadhtiyaPayables += totalDue;
      }

      const seedSuppliers = await storage.getSeedSuppliersWithDue(merchantId);
      let supplierPayables = 0;
      for (const s of seedSuppliers) {
        supplierPayables += s.totalDue;
      }

      const coldStores = await storage.getColdStoresWithDue(merchantId);
      let coldStorePayables = 0;
      for (const cs of coldStores) {
        coldStorePayables += cs.totalDue;
      }

      const unsoldHarvest = await storage.getUnsoldInventory(merchantId);
      let harvestStockValue = 0;
      for (const item of unsoldHarvest) {
        const cpb = parseFloat(item.costPerBag || "0");
        if (cpb > 0) {
          harvestStockValue += item.remainingBags * cpb;
        }
      }

      const unsoldSeed = await storage.getUnsoldSeedInventory(merchantId);
      let seedStockValue = 0;
      for (const item of unsoldSeed) {
        const avg = parseFloat(item.avgCostPerBag || "0");
        seedStockValue += item.remainingBags * avg;
      }

      const inventoryValue = harvestStockValue + seedStockValue;

      const sundryPayStakeholdersList = await storage.getSundryPayByMerchant(merchantId);
      const sundryPayCashEntries = fyEntries.filter(e => e.sundryPayDbId != null);
      const sundryPayDuesMap = new Map<number, { totalGiven: number; totalReceived: number }>();
      for (const entry of sundryPayCashEntries) {
        if (!entry.sundryPayDbId) continue;
        const existing = sundryPayDuesMap.get(entry.sundryPayDbId) || { totalGiven: 0, totalReceived: 0 };
        const amount = parseFloat(entry.amount || "0");
        if (entry.direction === "outflow") {
          existing.totalGiven += amount;
        } else if (entry.direction === "inward") {
          existing.totalReceived += amount;
        }
        sundryPayDuesMap.set(entry.sundryPayDbId, existing);
      }

      let sundryPayReceivables = 0;
      let sundryPayPayables = 0;
      for (const s of sundryPayStakeholdersList) {
        if (!s.isActive) continue;
        const pyReceivable = parseFloat(s.pyReceivable || "0");
        const dues = sundryPayDuesMap.get(s.id) || { totalGiven: 0, totalReceived: 0 };
        const totalDue = pyReceivable + dues.totalGiven - dues.totalReceived;
        if (totalDue > 0) {
          sundryPayReceivables += totalDue;
        } else if (totalDue < 0) {
          sundryPayPayables += Math.abs(totalDue);
        }
      }

      const fixedAssetsNet = fixedAssetsGross - accumulatedDepreciation;
      const currentAssets = cashInHand + totalBankBalance + buyerReceivables + farmerReceivables + inventoryValue + sundryPayReceivables;
      const totalAssets = fixedAssetsNet + currentAssets;
      const totalLiabilities = longTermLiabilities + shortTermLiabilities + farmerPayables + supplierPayables + aadhtiyaPayables + coldStorePayables + limitAccountLiabilities + sundryPayPayables;
      const ownersEquity = totalAssets - totalLiabilities;

      res.json({
        financialYear: fy,
        assets: {
          fixedAssets: { gross: fixedAssetsGross, depreciation: accumulatedDepreciation, net: fixedAssetsNet, details: fixedAssetDetails },
          currentAssets: { cashInHand, bankBalances: bankAccounts.length > 0 ? bankAccountBalances : [{ name: "Bank Account", balance: bankBalance }], totalBankBalance, buyerReceivables, farmerReceivables, sundryPayReceivables, harvestStockValue, seedStockValue, total: currentAssets },
          totalAssets,
        },
        liabilities: {
          longTerm: { total: longTermLiabilities, details: liabilityDetails.filter(l => l.type === "long_term") },
          shortTerm: { total: shortTermLiabilities, details: liabilityDetails.filter(l => l.type === "short_term") },
          currentLiabilities: { farmerPayables, supplierPayables, aadhtiyaPayables, coldStorePayables, sundryPayPayables, limitAccountLiabilities, limitAccountDetails: limitAccountLiabilityDetails },
          totalLiabilities,
        },
        ownersEquity,
        balanceCheck: Math.abs(totalAssets - (totalLiabilities + ownersEquity)) < 0.01,
      });
    } catch (error) {
      console.error("Error generating balance sheet:", error);
      res.status(500).json({ message: "Failed to generate balance sheet" });
    }
  });

  // ==================== Books: Profit & Loss ====================
  app.get("/api/books/profit-loss", requireAuth, async (req, res) => {
    try {
      const merchantId = (req.user as any).merchantId;
      const fy = req.query.fy as string;
      if (!fy) return res.status(400).json({ message: "Financial year (fy) is required" });

      const [fyStartYear] = fy.split("-").map(Number);
      const fyStartDate = `${fyStartYear}-04-01`;
      const fyEndDate = `${fyStartYear + 1}-03-31`;

      const cashEntries = await storage.getCashEntriesByMerchant(merchantId);
      const fyEntries = cashEntries.filter(e => {
        const d = e.entryDate;
        return d >= fyStartDate && d <= fyEndDate && !e.isReversed;
      });

      const revenueByType: Record<string, number> = {};
      const expenseByType: Record<string, number> = {};

      for (const e of fyEntries) {
        const amt = parseFloat(e.amount);
        if (e.direction === "inward" && e.revenueType && e.revenueType !== "raw_potato" && e.revenueType !== "seed_sale" && e.revenueType !== "sundry_pay") {
          revenueByType[e.revenueType] = (revenueByType[e.revenueType] || 0) + amt;
        } else if (e.direction === "outflow" && e.expenseType && e.expenseType !== "capital_expense" && e.expenseType !== "aadhtiya" && e.expenseType !== "supplier" && e.expenseType !== "cold_store_charge" && e.expenseType !== "warehouse_charges" && e.expenseType !== "sundry_pay") {
          expenseByType[e.expenseType] = (expenseByType[e.expenseType] || 0) + amt;
        }
      }

      const harvestTxns = await storage.getTransactionsByMerchant(merchantId);
      const harvestCOGS = harvestTxns
        .filter(tx => tx.dateOfLoading && tx.dateOfLoading >= fyStartDate && tx.dateOfLoading <= fyEndDate)
        .reduce((sum, tx) => {
          const cost = tx.totalCostOfGoods ? parseFloat(tx.totalCostOfGoods) : 0;
          const transport = tx.transportationCharges ? parseFloat(tx.transportationCharges) : 0;
          const other = tx.otherCharges ? parseFloat(tx.otherCharges) : 0;
          return sum + cost + transport + other;
        }, 0);

      const seedTxns = await storage.getSeedTransactionsByMerchant(merchantId);
      const seedCOGS = seedTxns
        .filter(tx => {
          if (!tx.createdAt) return false;
          const dt = new Date(tx.createdAt);
          const createdDate = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
          return createdDate >= fyStartDate && createdDate <= fyEndDate;
        })
        .reduce((sum: number, tx: any) => {
          const cost = tx.totalCost ? parseFloat(tx.totalCost) : 0;
          const transport = tx.transportCharges ? parseFloat(tx.transportCharges) : 0;
          const other = tx.otherCharges ? parseFloat(tx.otherCharges) : 0;
          return sum + cost + transport + other;
        }, 0);

      const totalCOGS = harvestCOGS + seedCOGS;
      if (totalCOGS > 0) {
        expenseByType["cost_of_goods_sold"] = totalCOGS;
      }

      const harvestRevenue = harvestTxns
        .filter(tx => tx.dateOfLoading && tx.dateOfLoading >= fyStartDate && tx.dateOfLoading <= fyEndDate)
        .reduce((sum, tx) => sum + (tx.revenue ? parseFloat(tx.revenue) : 0), 0);
      if (harvestRevenue > 0) {
        revenueByType["raw_potato"] = (revenueByType["raw_potato"] || 0) + harvestRevenue;
      }

      const seedRevenue = seedTxns
        .filter(tx => {
          if (!tx.createdAt) return false;
          const dt = new Date(tx.createdAt);
          const createdDate = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
          return createdDate >= fyStartDate && createdDate <= fyEndDate;
        })
        .reduce((sum: number, tx: any) => {
          const rev = tx.totalRevenue ? parseFloat(tx.totalRevenue) : 0;
          const transport = tx.transportCharges ? parseFloat(tx.transportCharges) : 0;
          const other = tx.otherCharges ? parseFloat(tx.otherCharges) : 0;
          return sum + rev + transport + other;
        }, 0);
      if (seedRevenue > 0) {
        revenueByType["seed_sale"] = (revenueByType["seed_sale"] || 0) + seedRevenue;
      }

      const depLogs = await storage.getDepreciationLogs(merchantId, undefined, fy);
      const totalDepreciation = depLogs.reduce((sum, d) => sum + parseFloat(d.depreciationAmount), 0);
      if (totalDepreciation > 0) {
        expenseByType["depreciation"] = totalDepreciation;
      }

      const liabilitiesList = await storage.getLiabilities(merchantId);
      let liabilityInterest = 0;
      for (const l of liabilitiesList) {
        const payments = await storage.getLiabilityPayments(l.id, merchantId);
        const fyPayments = payments.filter(p => p.paymentDate >= fyStartDate && p.paymentDate <= fyEndDate);
        liabilityInterest += fyPayments.reduce((sum, p) => sum + parseFloat(p.interestPortion || "0"), 0);
      }
      if (liabilityInterest > 0) {
        expenseByType["interest_on_loans"] = liabilityInterest;
      }

      const totalRevenue = Object.values(revenueByType).reduce((a, b) => a + b, 0);
      const totalExpenses = Object.values(expenseByType).reduce((a, b) => a + b, 0);
      const netProfitLoss = totalRevenue - totalExpenses;

      res.json({
        financialYear: fy,
        revenue: { byType: revenueByType, total: totalRevenue },
        expenses: { byType: expenseByType, total: totalExpenses },
        netProfitLoss,
      });
    } catch (error) {
      console.error("Error generating P&L:", error);
      res.status(500).json({ message: "Failed to generate P&L" });
    }
  });

  return httpServer;
}
