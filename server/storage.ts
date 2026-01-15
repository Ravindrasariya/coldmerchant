import { 
  users, merchants, stockEntries, lots, bagBreakdowns, stockEntryEditHistory,
  transactions, transactionItems, transactionEditHistory,
  cashEntries, cashEntryAllocations, coldStoreChargeAllocations,
  cashSettings, parties, cashFarmers,
  seedStockEntries, seedLots, seedStockEntryEditHistory,
  seedTransactions, seedTransactionItems, seedTransactionEditHistory,
  type User, type InsertUser, type Merchant, type InsertMerchant,
  type StockEntry, type InsertStockEntry, type Lot, type InsertLot,
  type BagBreakdown, type InsertBagBreakdown,
  type StockEntryEditHistory, type InsertStockEntryEditHistory, type ChangeSet,
  type Transaction, type InsertTransaction,
  type TransactionItem, type InsertTransactionItem,
  type TransactionEditHistory, type InsertTransactionEditHistory,
  type CashEntry, type InsertCashEntry,
  type CashEntryAllocation, type InsertCashEntryAllocation,
  type ColdStoreChargeAllocation, type InsertColdStoreChargeAllocation,
  type CashSettings, type InsertCashSettings,
  type Party, type InsertParty,
  type CashFarmer, type InsertCashFarmer,
  type SeedStockEntry, type InsertSeedStockEntry,
  type SeedLot, type InsertSeedLot,
  type SeedStockEntryWithLots,
  type SeedStockEntryEditHistory,
  type SeedTransaction, type InsertSeedTransaction,
  type SeedTransactionItem, type InsertSeedTransactionItem,
  type SeedTransactionWithItems,
  type SeedTransactionEditHistory
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, asc, sql, gt, ne } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: session.Store;
  
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: number, hashedPassword: string): Promise<void>;
  updateUserMustChangePassword(id: number, mustChange: boolean): Promise<void>;
  getUsersByMerchant(merchantId: number): Promise<User[]>;
  getAllUsers(): Promise<(User & { merchantName?: string })[]>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  
  // Merchant operations
  getMerchant(id: number): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  getAllMerchants(): Promise<Merchant[]>;
  updateMerchant(id: number, data: Partial<Merchant>): Promise<Merchant | undefined>;
  deleteMerchant(id: number): Promise<void>;
  
  // Stock Entry operations
  getStockEntriesByMerchant(merchantId: number): Promise<any[]>;
  getStockEntryById(id: number, merchantId: number): Promise<any | undefined>;
  createStockEntry(entry: InsertStockEntry & { merchantId: number }): Promise<StockEntry>;
  updateStockEntry(id: number, merchantId: number, data: Partial<StockEntry>): Promise<StockEntry | undefined>;
  getNextSerialNumber(merchantId: number): Promise<number>;
  
  // Lot operations
  createLot(lot: InsertLot): Promise<Lot>;
  updateLot(id: number, merchantId: number, data: Partial<Lot>): Promise<Lot | undefined>;
  getLotsByStockEntry(stockEntryId: number, merchantId: number): Promise<Lot[]>;
  getLotById(id: number, merchantId: number): Promise<Lot | undefined>;
  
  // Bag Breakdown operations
  createBagBreakdown(breakdown: InsertBagBreakdown): Promise<BagBreakdown>;
  updateBagBreakdown(id: number, merchantId: number, data: Partial<BagBreakdown>): Promise<BagBreakdown | undefined>;
  deleteBagBreakdown(id: number, merchantId: number): Promise<void>;
  getBagBreakdownsByLot(lotId: number, merchantId: number): Promise<BagBreakdown[]>;
  getBagBreakdownById(id: number, merchantId: number): Promise<BagBreakdown | undefined>;
  
  // Edit History operations
  createEditHistory(stockEntryId: number, merchantId: number, userId: number | null, changeSet: ChangeSet): Promise<StockEntryEditHistory>;
  getEditHistory(stockEntryId: number, merchantId: number): Promise<(StockEntryEditHistory & { userName?: string })[]>;
  
  // Transaction operations
  getTransactionsByMerchant(merchantId: number): Promise<(Transaction & { items: TransactionItem[] })[]>;
  createTransaction(transaction: InsertTransaction & { transactionNumber: number }, items: Omit<InsertTransactionItem, 'transactionId'>[]): Promise<Transaction & { items: TransactionItem[] }>;
  getNextTransactionNumber(merchantId: number): Promise<number>;
  getUnsoldInventory(merchantId: number): Promise<any[]>;
  
  // Cash Entry operations
  getCashEntriesByMerchant(merchantId: number): Promise<(CashEntry & { allocations: CashEntryAllocation[] })[]>;
  createCashEntry(entry: InsertCashEntry): Promise<CashEntry>;
  createCashEntryAllocation(allocation: InsertCashEntryAllocation): Promise<CashEntryAllocation>;
  getPartiesWithDue(merchantId: number): Promise<{ partyName: string; partyAddress: string | null; totalDue: number; transactionCount: number }[]>;
  getFarmersWithDue(merchantId: number): Promise<{ farmerName: string; village: string | null; totalDue: number; entryCount: number }[]>;
  getTransactionsWithDueByParty(merchantId: number, partyName: string): Promise<Transaction[]>;
  getColdStoresWithDue(merchantId: number): Promise<{ coldStoreName: string; totalDue: number; lotCount: number }[]>;
  getSeedFarmersWithDue(merchantId: number): Promise<{ farmerName: string; village: string | null; totalDue: number; transactionCount: number }[]>;
  getSeedSuppliersWithDue(merchantId: number): Promise<{ supplierName: string; district: string | null; totalDue: number; entryCount: number }[]>;
  createCashEntryWithFIFO(entry: InsertCashEntry, applyFIFO: boolean): Promise<CashEntry & { allocations: CashEntryAllocation[]; coldStoreAllocations?: ColdStoreChargeAllocation[] }>;
  
  // Cash Settings operations
  getCashSettings(merchantId: number, financialYear: string): Promise<CashSettings | undefined>;
  upsertCashSettings(merchantId: number, financialYear: string, data: Partial<InsertCashSettings>): Promise<CashSettings>;
  
  // Party operations
  getPartiesByMerchant(merchantId: number): Promise<Party[]>;
  createParty(party: InsertParty): Promise<Party>;
  updateParty(id: number, merchantId: number, data: Partial<Party>): Promise<Party | undefined>;
  deleteParty(id: number, merchantId: number): Promise<void>;
  
  // Cash Farmer operations
  getCashFarmersByMerchant(merchantId: number): Promise<CashFarmer[]>;
  createCashFarmer(farmer: InsertCashFarmer): Promise<CashFarmer>;
  updateCashFarmer(id: number, merchantId: number, data: Partial<CashFarmer>): Promise<CashFarmer | undefined>;
  deleteCashFarmer(id: number, merchantId: number): Promise<void>;
  
  // Seed Stock Entry operations
  getSeedEntriesByMerchant(merchantId: number): Promise<SeedStockEntryWithLots[]>;
  getSeedEntryById(id: number, merchantId: number): Promise<SeedStockEntryWithLots | undefined>;
  createSeedEntry(entry: InsertSeedStockEntry & { merchantId: number }): Promise<SeedStockEntry>;
  updateSeedEntry(id: number, merchantId: number, data: Partial<SeedStockEntry>): Promise<SeedStockEntry | undefined>;
  getNextSeedSerialNumber(merchantId: number): Promise<number>;
  
  // Seed Lot operations
  createSeedLot(lot: InsertSeedLot): Promise<SeedLot>;
  updateSeedLot(id: number, merchantId: number, data: Partial<SeedLot>): Promise<SeedLot | undefined>;
  getSeedLotsByEntry(seedEntryId: number, merchantId: number): Promise<SeedLot[]>;
  getSeedLotById(id: number, merchantId: number): Promise<SeedLot | undefined>;
  deleteSeedLot(id: number, merchantId: number): Promise<void>;
  
  // Seed Edit History operations
  createSeedEditHistory(seedEntryId: number, merchantId: number, userId: number | null, changeSet: ChangeSet): Promise<SeedStockEntryEditHistory>;
  getSeedEditHistory(seedEntryId: number, merchantId: number): Promise<(SeedStockEntryEditHistory & { userName?: string })[]>;
  
  // Seed Transaction operations
  getSeedTransactionsByMerchant(merchantId: number): Promise<any[]>;
  getSeedTransactionById(id: number, merchantId: number): Promise<any | undefined>;
  createSeedTransaction(transaction: any, items: any[]): Promise<any>;
  updateSeedTransaction(id: number, merchantId: number, data: any, items: any[], userId?: number): Promise<any>;
  getNextSeedTransactionNumber(merchantId: number): Promise<number>;
  getUnsoldSeedInventory(merchantId: number): Promise<any[]>;
  createSeedTransactionEditHistory(data: { seedTransactionId: number; merchantId: number; userId: number; changeSet: any }): Promise<any>;
  getSeedTransactionEditHistory(seedTransactionId: number, merchantId: number): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async updateUserMustChangePassword(id: number, mustChange: boolean): Promise<void> {
    await db.update(users).set({ mustChangePassword: mustChange }).where(eq(users.id, id));
  }

  async getUsersByMerchant(merchantId: number): Promise<User[]> {
    return await db.select().from(users).where(eq(users.merchantId, merchantId));
  }

  async getAllUsers(): Promise<(User & { merchantName?: string })[]> {
    const allUsers = await db.select().from(users);
    const result = await Promise.all(allUsers.map(async (user) => {
      let merchantName: string | undefined;
      if (user.merchantId) {
        const merchant = await this.getMerchant(user.merchantId);
        merchantName = merchant?.name;
      }
      return { ...user, merchantName };
    }));
    return result;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated || undefined;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Merchant operations
  async getMerchant(id: number): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
    return merchant || undefined;
  }

  async createMerchant(merchant: InsertMerchant): Promise<Merchant> {
    const [created] = await db.insert(merchants).values(merchant).returning();
    return created;
  }

  async getAllMerchants(): Promise<Merchant[]> {
    return await db.select().from(merchants);
  }

  async updateMerchant(id: number, data: Partial<Merchant>): Promise<Merchant | undefined> {
    const [updated] = await db.update(merchants).set(data).where(eq(merchants.id, id)).returning();
    return updated || undefined;
  }

  async deleteMerchant(id: number): Promise<void> {
    await db.delete(merchants).where(eq(merchants.id, id));
  }

  // Stock Entry operations
  async getStockEntriesByMerchant(merchantId: number): Promise<any[]> {
    const entries = await db.select().from(stockEntries)
      .where(eq(stockEntries.merchantId, merchantId))
      .orderBy(desc(stockEntries.serialNumber));

    const result = await Promise.all(entries.map(async (entry) => {
      const entryLots = await db.select().from(lots)
        .where(and(eq(lots.stockEntryId, entry.id), eq(lots.merchantId, merchantId)));
      
      const lotsWithBreakdowns = await Promise.all(entryLots.map(async (lot) => {
        const breakdowns = await db.select().from(bagBreakdowns)
          .where(and(eq(bagBreakdowns.lotId, lot.id), eq(bagBreakdowns.merchantId, merchantId)));
        return { ...lot, bagBreakdowns: breakdowns };
      }));

      return { ...entry, lots: lotsWithBreakdowns };
    }));

    return result;
  }

  async getStockEntryById(id: number, merchantId: number): Promise<any | undefined> {
    const [entry] = await db.select().from(stockEntries)
      .where(and(eq(stockEntries.id, id), eq(stockEntries.merchantId, merchantId)));
    
    if (!entry) return undefined;

    const entryLots = await db.select().from(lots)
      .where(and(eq(lots.stockEntryId, entry.id), eq(lots.merchantId, merchantId)));
    
    const lotsWithBreakdowns = await Promise.all(entryLots.map(async (lot) => {
      const breakdowns = await db.select().from(bagBreakdowns)
        .where(and(eq(bagBreakdowns.lotId, lot.id), eq(bagBreakdowns.merchantId, merchantId)));
      return { ...lot, bagBreakdowns: breakdowns };
    }));

    return { ...entry, lots: lotsWithBreakdowns };
  }

  async createStockEntry(entry: InsertStockEntry & { merchantId: number }): Promise<StockEntry> {
    const serialNumber = await this.getNextSerialNumber(entry.merchantId);
    const [created] = await db.insert(stockEntries).values({
      ...entry,
      serialNumber,
    }).returning();
    return created;
  }

  async updateStockEntry(id: number, merchantId: number, data: Partial<StockEntry>): Promise<StockEntry | undefined> {
    const [updated] = await db.update(stockEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(stockEntries.id, id), eq(stockEntries.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async getNextSerialNumber(merchantId: number): Promise<number> {
    const [result] = await db.select({ maxSerial: stockEntries.serialNumber })
      .from(stockEntries)
      .where(eq(stockEntries.merchantId, merchantId))
      .orderBy(desc(stockEntries.serialNumber))
      .limit(1);
    
    return (result?.maxSerial || 0) + 1;
  }

  // Lot operations
  async createLot(lot: InsertLot): Promise<Lot> {
    const [created] = await db.insert(lots).values(lot).returning();
    return created;
  }

  async updateLot(id: number, merchantId: number, data: Partial<Lot>): Promise<Lot | undefined> {
    const [updated] = await db.update(lots)
      .set(data)
      .where(and(eq(lots.id, id), eq(lots.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async getLotsByStockEntry(stockEntryId: number, merchantId: number): Promise<Lot[]> {
    return await db.select().from(lots)
      .where(and(eq(lots.stockEntryId, stockEntryId), eq(lots.merchantId, merchantId)));
  }

  async getLotById(id: number, merchantId: number): Promise<Lot | undefined> {
    const [lot] = await db.select().from(lots)
      .where(and(eq(lots.id, id), eq(lots.merchantId, merchantId)));
    return lot || undefined;
  }

  // Bag Breakdown operations
  async createBagBreakdown(breakdown: InsertBagBreakdown): Promise<BagBreakdown> {
    const [created] = await db.insert(bagBreakdowns).values(breakdown).returning();
    return created;
  }

  async updateBagBreakdown(id: number, merchantId: number, data: Partial<BagBreakdown>): Promise<BagBreakdown | undefined> {
    const [updated] = await db.update(bagBreakdowns)
      .set(data)
      .where(and(eq(bagBreakdowns.id, id), eq(bagBreakdowns.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async deleteBagBreakdown(id: number, merchantId: number): Promise<void> {
    await db.delete(bagBreakdowns)
      .where(and(eq(bagBreakdowns.id, id), eq(bagBreakdowns.merchantId, merchantId)));
  }

  async getBagBreakdownsByLot(lotId: number, merchantId: number): Promise<BagBreakdown[]> {
    return await db.select().from(bagBreakdowns)
      .where(and(eq(bagBreakdowns.lotId, lotId), eq(bagBreakdowns.merchantId, merchantId)));
  }

  async getBagBreakdownById(id: number, merchantId: number): Promise<BagBreakdown | undefined> {
    const [breakdown] = await db.select().from(bagBreakdowns)
      .where(and(eq(bagBreakdowns.id, id), eq(bagBreakdowns.merchantId, merchantId)));
    return breakdown || undefined;
  }

  // Edit History operations
  async createEditHistory(stockEntryId: number, merchantId: number, userId: number | null, changeSet: ChangeSet): Promise<StockEntryEditHistory> {
    const [created] = await db.insert(stockEntryEditHistory).values({
      stockEntryId,
      merchantId,
      userId,
      changeSet,
    }).returning();
    return created;
  }

  async getEditHistory(stockEntryId: number, merchantId: number): Promise<(StockEntryEditHistory & { userName?: string })[]> {
    const history = await db.select().from(stockEntryEditHistory)
      .where(and(
        eq(stockEntryEditHistory.stockEntryId, stockEntryId),
        eq(stockEntryEditHistory.merchantId, merchantId)
      ))
      .orderBy(desc(stockEntryEditHistory.changedAt));
    
    const result = await Promise.all(history.map(async (h) => {
      let userName: string | undefined;
      if (h.userId) {
        const user = await this.getUser(h.userId);
        userName = user?.name;
      }
      return { ...h, userName };
    }));
    
    return result;
  }

  // Transaction operations
  async getTransactionsByMerchant(merchantId: number): Promise<(Transaction & { items: TransactionItem[] })[]> {
    const txns = await db.select().from(transactions)
      .where(eq(transactions.merchantId, merchantId))
      .orderBy(desc(transactions.createdAt));
    
    const result = await Promise.all(txns.map(async (txn) => {
      const items = await db.select().from(transactionItems)
        .where(eq(transactionItems.transactionId, txn.id));
      return { ...txn, items };
    }));
    
    return result;
  }

  async createTransaction(
    transaction: InsertTransaction & { transactionNumber: number }, 
    items: Omit<InsertTransactionItem, 'transactionId'>[]
  ): Promise<Transaction & { items: TransactionItem[] }> {
    const [created] = await db.insert(transactions).values(transaction).returning();
    
    const createdItems: TransactionItem[] = [];
    for (const item of items) {
      const [createdItem] = await db.insert(transactionItems)
        .values({ ...item, transactionId: created.id })
        .returning();
      createdItems.push(createdItem);
      
      // Decrement remaining bags on the breakdown (if exists) or lot
      if (item.breakdownId) {
        // Decrement from breakdown
        const breakdown = await this.getBagBreakdownById(item.breakdownId, item.merchantId);
        if (breakdown) {
          const currentRemaining = breakdown.remainingBags ?? breakdown.numberOfBags ?? 0;
          const newRemaining = Math.max(0, currentRemaining - item.bagsMoved);
          await this.updateBagBreakdown(item.breakdownId, item.merchantId, { remainingBags: newRemaining });
        }
        // Also update lot total remaining by recalculating from all breakdowns AFTER the update
        const lot = await this.getLotById(item.lotId, item.merchantId);
        if (lot) {
          const allBreakdowns = await db.select().from(bagBreakdowns)
            .where(and(eq(bagBreakdowns.lotId, item.lotId), eq(bagBreakdowns.merchantId, item.merchantId)));
          const totalRemaining = allBreakdowns
            .filter(b => b.size !== "Wastage")
            .reduce((sum, b) => sum + (b.remainingBags ?? b.numberOfBags ?? 0), 0);
          await this.updateLot(item.lotId, item.merchantId, { remainingBags: totalRemaining });
        }
      } else {
        // Gate cut lot - decrement directly from lot
        const lot = await this.getLotById(item.lotId, item.merchantId);
        if (lot) {
          const newRemaining = Math.max(0, lot.remainingBags - item.bagsMoved);
          await this.updateLot(item.lotId, item.merchantId, { remainingBags: newRemaining });
        }
      }
    }
    
    return { ...created, items: createdItems };
  }

  async getNextTransactionNumber(merchantId: number): Promise<number> {
    const [result] = await db.select()
      .from(transactions)
      .where(eq(transactions.merchantId, merchantId))
      .orderBy(desc(transactions.transactionNumber))
      .limit(1);
    
    return result ? result.transactionNumber + 1 : 1;
  }

  async getUnsoldInventory(merchantId: number): Promise<any[]> {
    const allLots = await db.select().from(lots)
      .where(eq(lots.merchantId, merchantId));
    
    const unsoldLots = allLots.filter(lot => lot.remainingBags > 0);
    
    const results: any[] = [];
    
    for (const lot of unsoldLots) {
      const [entry] = await db.select().from(stockEntries)
        .where(eq(stockEntries.id, lot.stockEntryId));
      
      const breakdowns = await db.select().from(bagBreakdowns)
        .where(eq(bagBreakdowns.lotId, lot.id));
      
      if (breakdowns.length > 0) {
        // For bilty_cut: return one entry per non-wastage breakdown
        for (const breakdown of breakdowns) {
          if (breakdown.size === "Wastage") continue;
          
          const availableBags = breakdown.remainingBags ?? breakdown.numberOfBags ?? 0;
          if (availableBags <= 0) continue;
          
          results.push({
            breakdownId: breakdown.id,
            lotId: lot.id,
            serialNumber: entry?.serialNumber || 0,
            coldStoreName: lot.coldStoreName,
            farmerName: entry?.farmerName || "",
            potatoType: lot.potatoType,
            quality: lot.quality,
            cutType: lot.cutType,
            size: breakdown.size,
            pricePerKg: breakdown.pricePerKg || lot.pricePerKg,
            remainingBags: availableBags,
            originalBags: breakdown.numberOfBags,
          });
        }
      } else {
        // For gate_cut: return single entry for the lot
        if (lot.remainingBags > 0) {
          results.push({
            breakdownId: null,
            lotId: lot.id,
            serialNumber: entry?.serialNumber || 0,
            coldStoreName: lot.coldStoreName,
            farmerName: entry?.farmerName || "",
            potatoType: lot.potatoType,
            quality: lot.quality,
            cutType: lot.cutType,
            size: lot.size,
            pricePerKg: lot.pricePerKg,
            remainingBags: lot.remainingBags,
            originalBags: lot.originalBags,
          });
        }
      }
    }
    
    return results.sort((a, b) => a.serialNumber - b.serialNumber);
  }

  // Get single transaction by ID
  async getTransactionById(id: number, merchantId: number): Promise<(Transaction & { items: TransactionItem[] }) | undefined> {
    const [txn] = await db.select().from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.merchantId, merchantId)));
    
    if (!txn) return undefined;
    
    const items = await db.select().from(transactionItems)
      .where(eq(transactionItems.transactionId, txn.id));
    
    return { ...txn, items };
  }

  // Update transaction
  async updateTransaction(id: number, merchantId: number, data: Partial<Transaction>): Promise<Transaction | undefined> {
    const [updated] = await db.update(transactions)
      .set(data)
      .where(and(eq(transactions.id, id), eq(transactions.merchantId, merchantId)))
      .returning();
    return updated;
  }

  // Transaction Edit History operations
  async createTransactionEditHistory(data: { transactionId: number; merchantId: number; userId: number; changeSet: any }): Promise<TransactionEditHistory> {
    const [created] = await db.insert(transactionEditHistory).values(data).returning();
    return created;
  }

  async getTransactionEditHistory(transactionId: number, merchantId: number): Promise<(TransactionEditHistory & { userName?: string })[]> {
    const history = await db.select().from(transactionEditHistory)
      .where(and(
        eq(transactionEditHistory.transactionId, transactionId),
        eq(transactionEditHistory.merchantId, merchantId)
      ))
      .orderBy(desc(transactionEditHistory.changedAt));
    
    const result = await Promise.all(history.map(async (h) => {
      let userName: string | undefined;
      if (h.userId) {
        const user = await this.getUser(h.userId);
        userName = user?.name;
      }
      return { ...h, userName };
    }));
    
    return result;
  }

  // Get merchant by ID
  async getMerchantById(id: number): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants)
      .where(eq(merchants.id, id));
    return merchant;
  }

  // Transaction Item operations
  async getTransactionItemById(id: number, merchantId: number): Promise<TransactionItem | undefined> {
    const [item] = await db.select().from(transactionItems)
      .where(and(eq(transactionItems.id, id), eq(transactionItems.merchantId, merchantId)));
    return item;
  }

  async updateTransactionItem(id: number, merchantId: number, data: Partial<TransactionItem>): Promise<TransactionItem | undefined> {
    const [updated] = await db.update(transactionItems)
      .set(data)
      .where(and(eq(transactionItems.id, id), eq(transactionItems.merchantId, merchantId)))
      .returning();
    return updated;
  }

  async deleteTransactionItem(id: number, merchantId: number): Promise<void> {
    await db.delete(transactionItems)
      .where(and(eq(transactionItems.id, id), eq(transactionItems.merchantId, merchantId)));
  }

  async addTransactionItem(item: InsertTransactionItem): Promise<TransactionItem> {
    const [created] = await db.insert(transactionItems).values(item).returning();
    return created;
  }

  // Adjust inventory (for returning bags when items are modified/removed)
  async adjustInventory(lotId: number, breakdownId: number | null, merchantId: number, bagsDelta: number): Promise<void> {
    if (breakdownId) {
      // Bilty cut - adjust breakdown and recalc lot
      const breakdown = await this.getBagBreakdownById(breakdownId, merchantId);
      if (breakdown) {
        const currentRemaining = breakdown.remainingBags ?? breakdown.numberOfBags ?? 0;
        const newRemaining = Math.max(0, currentRemaining + bagsDelta);
        await this.updateBagBreakdown(breakdownId, merchantId, { remainingBags: newRemaining });
      }
      // Recalculate lot total from all breakdowns
      const allBreakdowns = await db.select().from(bagBreakdowns)
        .where(and(eq(bagBreakdowns.lotId, lotId), eq(bagBreakdowns.merchantId, merchantId)));
      const totalRemaining = allBreakdowns
        .filter(b => b.size !== "Wastage")
        .reduce((sum, b) => sum + (b.remainingBags ?? b.numberOfBags ?? 0), 0);
      await this.updateLot(lotId, merchantId, { remainingBags: totalRemaining });
    } else {
      // Gate cut - adjust lot directly
      const lot = await this.getLotById(lotId, merchantId);
      if (lot) {
        const newRemaining = Math.max(0, lot.remainingBags + bagsDelta);
        await this.updateLot(lotId, merchantId, { remainingBags: newRemaining });
      }
    }
  }

  // Cash Entry operations
  async getCashEntriesByMerchant(merchantId: number): Promise<(CashEntry & { allocations: CashEntryAllocation[] })[]> {
    const entries = await db.select().from(cashEntries)
      .where(eq(cashEntries.merchantId, merchantId))
      .orderBy(desc(cashEntries.createdAt));
    
    const result = await Promise.all(entries.map(async (entry) => {
      const allocations = await db.select().from(cashEntryAllocations)
        .where(eq(cashEntryAllocations.cashEntryId, entry.id));
      return { ...entry, allocations };
    }));
    
    return result;
  }

  async createCashEntry(entry: InsertCashEntry): Promise<CashEntry> {
    const [created] = await db.insert(cashEntries).values(entry).returning();
    return created;
  }

  async createCashEntryAllocation(allocation: InsertCashEntryAllocation): Promise<CashEntryAllocation> {
    const [created] = await db.insert(cashEntryAllocations).values(allocation).returning();
    return created;
  }

  async getPartiesWithDue(merchantId: number): Promise<{ partyName: string; partyAddress: string | null; totalDue: number; transactionCount: number }[]> {
    // Get all transactions with party name
    const txns = await db.select().from(transactions)
      .where(eq(transactions.merchantId, merchantId));
    
    // Group by partyName and calculate dues
    const partyMap = new Map<string, { partyAddress: string | null; totalDue: number; transactionCount: number }>();
    
    for (const txn of txns) {
      if (!txn.partyName) continue;
      
      // Calculate revenue from transaction items (more accurate than header)
      const items = await db.select().from(transactionItems)
        .where(eq(transactionItems.transactionId, txn.id));
      
      const itemsRevenue = items.reduce((sum, item) => sum + parseFloat(item.revenue || "0"), 0);
      // Use items revenue if available, otherwise fall back to header revenue
      const revenue = itemsRevenue > 0 ? itemsRevenue : parseFloat(txn.revenue || "0");
      const received = parseFloat(txn.amountReceived || "0");
      const due = Math.max(0, revenue - received);
      
      if (due <= 0) continue; // Only include parties with pending dues
      
      const existing = partyMap.get(txn.partyName);
      if (existing) {
        existing.totalDue += due;
        existing.transactionCount += 1;
      } else {
        partyMap.set(txn.partyName, {
          partyAddress: txn.partyAddress,
          totalDue: due,
          transactionCount: 1,
        });
      }
    }
    
    return Array.from(partyMap.entries()).map(([partyName, data]) => ({
      partyName,
      ...data,
    }));
  }

  async getFarmersWithDue(merchantId: number): Promise<{ farmerName: string; village: string | null; totalDue: number; entryCount: number }[]> {
    // Get stock entries with payment status "due" or "partial" 
    const entries = await db.select().from(stockEntries)
      .where(and(
        eq(stockEntries.merchantId, merchantId),
        or(eq(stockEntries.paymentStatus, "due"), eq(stockEntries.paymentStatus, "partial"))
      ));
    
    // Group by farmerName and calculate total due from lots
    const farmerMap = new Map<string, { village: string | null; totalDue: number; entryCount: number }>();
    
    for (const entry of entries) {
      // Get all lots for this entry and calculate total cost
      const entryLots = await db.select().from(lots)
        .where(eq(lots.stockEntryId, entry.id));
      
      let entryTotalCost = 0;
      let entryAdjustment = 0;
      for (const lot of entryLots) {
        // Get breakdowns to calculate total weight and cost
        const breakdownList = await db.select().from(bagBreakdowns)
          .where(eq(bagBreakdowns.lotId, lot.id));
        
        if (breakdownList.length > 0) {
          // Sum up total amount from breakdowns
          entryTotalCost += breakdownList.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        } else if (lot.pricePerKg) {
          // Estimate from lot's pricePerKg and bags (approx 50kg per bag)
          entryTotalCost += lot.originalBags * 50 * parseFloat(lot.pricePerKg);
        }
        
        // Apply adjustment (debit subtracts, credit adds)
        if (lot.adjustedAmount && lot.adjustedAmountType) {
          const adjustedAmount = parseFloat(lot.adjustedAmount);
          if (lot.adjustedAmountType === "debit") {
            entryAdjustment -= adjustedAmount;
          } else if (lot.adjustedAmountType === "credit") {
            entryAdjustment += adjustedAmount;
          }
        }
      }
      
      // Calculate due by subtracting amount already paid, and apply adjustment
      const amountPaid = parseFloat(entry.amountPaid || "0");
      const adjustedTotal = entryTotalCost + entryAdjustment;
      const entryDue = Math.max(0, adjustedTotal - amountPaid);
      
      if (entryDue <= 0) continue; // Skip fully paid entries
      
      const existing = farmerMap.get(entry.farmerName);
      if (existing) {
        existing.totalDue += entryDue;
        existing.entryCount += 1;
      } else {
        farmerMap.set(entry.farmerName, {
          village: entry.village,
          totalDue: entryDue,
          entryCount: 1,
        });
      }
    }
    
    return Array.from(farmerMap.entries()).map(([farmerName, data]) => ({
      farmerName,
      ...data,
    }));
  }

  async getColdStoresWithDue(merchantId: number): Promise<{ coldStoreName: string; totalDue: number; lotCount: number }[]> {
    // Get all lots with cold store charges that have not been fully paid
    const allLots = await db.select().from(lots)
      .where(eq(lots.merchantId, merchantId));
    
    // Group by coldStoreName and calculate dues
    const coldStoreMap = new Map<string, { totalDue: number; lotCount: number }>();
    
    for (const lot of allLots) {
      const chargesPerBag = parseFloat(lot.coldStoreChargesPerBag || "0");
      const hammaliGradingCharges = parseFloat(lot.hammaliGradingCharges || "0");
      
      // Skip lots with no charges at all
      if (chargesPerBag <= 0 && hammaliGradingCharges <= 0) continue;
      
      // Calculate total cold store charges for this lot (per-bag + hammali/grading)
      const totalCharges = (chargesPerBag * lot.originalBags) + hammaliGradingCharges;
      const paidAmount = parseFloat(lot.coldStorageChargesPaid || "0");
      const due = totalCharges - paidAmount;
      
      if (due <= 0) continue; // Skip fully paid lots
      
      const existing = coldStoreMap.get(lot.coldStoreName);
      if (existing) {
        existing.totalDue += due;
        existing.lotCount += 1;
      } else {
        coldStoreMap.set(lot.coldStoreName, {
          totalDue: due,
          lotCount: 1,
        });
      }
    }
    
    return Array.from(coldStoreMap.entries()).map(([coldStoreName, data]) => ({
      coldStoreName,
      ...data,
    }));
  }

  async getSeedFarmersWithDue(merchantId: number): Promise<{ farmerName: string; village: string | null; totalDue: number; transactionCount: number }[]> {
    // Get all seed transactions for this merchant
    const txns = await db.select().from(seedTransactions)
      .where(eq(seedTransactions.merchantId, merchantId));
    
    // Group by farmer name and calculate total due
    const farmerMap = new Map<string, { village: string | null; totalDue: number; transactionCount: number }>();
    
    for (const txn of txns) {
      const dueToFarmer = parseFloat(txn.totalDueToFarmer || "0");
      
      if (dueToFarmer <= 0) continue; // Skip fully paid
      
      const key = txn.farmerName.toLowerCase();
      const existing = farmerMap.get(key);
      if (existing) {
        existing.totalDue += dueToFarmer;
        existing.transactionCount += 1;
      } else {
        farmerMap.set(key, {
          village: txn.village || null,
          totalDue: dueToFarmer,
          transactionCount: 1,
        });
      }
    }
    
    return Array.from(farmerMap.entries()).map(([key, data]) => {
      // Find original farmer name with proper casing
      const originalTxn = txns.find(t => t.farmerName.toLowerCase() === key);
      return {
        farmerName: originalTxn?.farmerName || key,
        ...data,
      };
    }).sort((a, b) => b.totalDue - a.totalDue);
  }

  async getSeedSuppliersWithDue(merchantId: number): Promise<{ supplierName: string; district: string | null; totalDue: number; entryCount: number }[]> {
    // Get all seed stock entries for this merchant
    const entries = await db.select().from(seedStockEntries)
      .where(eq(seedStockEntries.merchantId, merchantId));
    
    // Get all seed lots to calculate total costs
    const allLots = await db.select().from(seedLots)
      .where(eq(seedLots.merchantId, merchantId));
    
    // Group by supplier name and calculate total due
    const supplierMap = new Map<string, { district: string | null; totalDue: number; entryCount: number }>();
    
    for (const entry of entries) {
      // Calculate total cost for this entry from its lots
      const entryLots = allLots.filter(lot => lot.seedEntryId === entry.id);
      const totalCost = entryLots.reduce((sum, lot) => {
        const bags = lot.originalBags || 0;
        const pricePerBag = parseFloat(lot.pricePerBag || "0");
        return sum + (bags * pricePerBag);
      }, 0);
      
      const amountPaid = parseFloat(entry.amountPaid || "0");
      const dueAmount = totalCost - amountPaid;
      
      if (dueAmount <= 0) continue; // Skip fully paid
      
      const key = entry.supplierName.toLowerCase();
      const existing = supplierMap.get(key);
      if (existing) {
        existing.totalDue += dueAmount;
        existing.entryCount += 1;
      } else {
        supplierMap.set(key, {
          district: entry.district || null,
          totalDue: dueAmount,
          entryCount: 1,
        });
      }
    }
    
    return Array.from(supplierMap.entries()).map(([key, data]) => {
      // Find original supplier name with proper casing
      const originalEntry = entries.find(e => e.supplierName.toLowerCase() === key);
      return {
        supplierName: originalEntry?.supplierName || key,
        ...data,
      };
    }).sort((a, b) => b.totalDue - a.totalDue);
  }

  async getTransactionsWithDueByParty(merchantId: number, partyName: string): Promise<Transaction[]> {
    // Get transactions for this party that still have due amount, ordered by creation date (FIFO)
    const txns = await db.select().from(transactions)
      .where(and(
        eq(transactions.merchantId, merchantId),
        eq(transactions.partyName, partyName)
      ))
      .orderBy(asc(transactions.createdAt));
    
    // Filter to only those with remaining due
    return txns.filter(txn => {
      const revenue = parseFloat(txn.revenue || "0");
      const received = parseFloat(txn.amountReceived || "0");
      return revenue > received;
    });
  }

  async createCashEntryWithFIFO(
    entry: InsertCashEntry,
    applyFIFO: boolean
  ): Promise<CashEntry & { allocations: CashEntryAllocation[]; coldStoreAllocations?: ColdStoreChargeAllocation[] }> {
    // Use a transaction to ensure atomicity of FIFO allocation
    return await db.transaction(async (tx) => {
      // Create the cash entry
      const [createdEntry] = await tx.insert(cashEntries).values(entry).returning();
      
      const allocations: CashEntryAllocation[] = [];
      const coldStoreAllocations: ColdStoreChargeAllocation[] = [];
      
      // If this is an inward payment and has a partyName, apply FIFO to transactions
      if (applyFIFO && entry.direction === "inward" && entry.partyName) {
        let remainingAmount = parseFloat(entry.amount);
        
        // Get transactions with due for this party (FIFO order)
        const txns = await tx.select().from(transactions)
          .where(and(
            eq(transactions.merchantId, entry.merchantId),
            eq(transactions.partyName, entry.partyName)
          ))
          .orderBy(asc(transactions.createdAt));
        
        // Filter to only those with remaining due
        const transactionsWithDue = txns.filter(txn => {
          const revenue = parseFloat(txn.revenue || "0");
          const received = parseFloat(txn.amountReceived || "0");
          return revenue > received;
        });
        
        for (const txn of transactionsWithDue) {
          if (remainingAmount <= 0) break;
          
          const revenue = parseFloat(txn.revenue || "0");
          const currentReceived = parseFloat(txn.amountReceived || "0");
          const due = revenue - currentReceived;
          
          if (due <= 0) continue;
          
          // Calculate how much to apply to this transaction
          const toApply = Math.min(remainingAmount, due);
          
          // Create allocation record within transaction
          const [allocation] = await tx.insert(cashEntryAllocations).values({
            cashEntryId: createdEntry.id,
            transactionId: txn.id,
            merchantId: entry.merchantId,
            appliedAmount: toApply.toString(),
          }).returning();
          
          allocations.push(allocation);
          
          // Update transaction's amountReceived within transaction
          const newReceived = currentReceived + toApply;
          await tx.update(transactions)
            .set({ amountReceived: newReceived.toString() })
            .where(and(eq(transactions.id, txn.id), eq(transactions.merchantId, entry.merchantId)));
          
          remainingAmount -= toApply;
        }
      }
      
      // If this is a farmer payment, apply FIFO to stock entries
      if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "farmer" && entry.farmerName) {
        let remainingAmount = parseFloat(entry.amount);
        
        // Get stock entries for this farmer with due amount (FIFO order by createdAt)
        const farmerEntries = await tx.select().from(stockEntries)
          .where(and(
            eq(stockEntries.merchantId, entry.merchantId),
            eq(stockEntries.farmerName, entry.farmerName),
            or(eq(stockEntries.paymentStatus, "due"), eq(stockEntries.paymentStatus, "partial"))
          ))
          .orderBy(asc(stockEntries.createdAt));
        
        for (const stockEntry of farmerEntries) {
          if (remainingAmount <= 0) break;
          
          // Calculate total cost for this entry from lots and breakdowns
          const entryLots = await tx.select().from(lots)
            .where(eq(lots.stockEntryId, stockEntry.id));
          
          let entryTotalCost = 0;
          for (const lot of entryLots) {
            const breakdownList = await tx.select().from(bagBreakdowns)
              .where(eq(bagBreakdowns.lotId, lot.id));
            
            if (breakdownList.length > 0) {
              entryTotalCost += breakdownList.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
            } else if (lot.pricePerKg) {
              entryTotalCost += lot.originalBags * 50 * parseFloat(lot.pricePerKg);
            }
          }
          
          const currentPaid = parseFloat(stockEntry.amountPaid || "0");
          const due = entryTotalCost - currentPaid;
          
          if (due <= 0) continue;
          
          // Calculate how much to apply to this stock entry
          const toApply = Math.min(remainingAmount, due);
          
          // Update stock entry's amountPaid and paymentStatus
          const newPaid = currentPaid + toApply;
          const newDue = entryTotalCost - newPaid;
          const newStatus = newDue <= 0 ? "paid" : "partial";
          
          await tx.update(stockEntries)
            .set({ 
              amountPaid: newPaid.toString(),
              paymentStatus: newStatus
            })
            .where(and(eq(stockEntries.id, stockEntry.id), eq(stockEntries.merchantId, entry.merchantId)));
          
          remainingAmount -= toApply;
        }
      }
      
      // If this is a cold store charge payment, apply FIFO to lots
      if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "cold_store_charge" && entry.coldStoreName) {
        let remainingAmount = parseFloat(entry.amount);
        
        // Get lots for this cold store with due charges (FIFO order by createdAt)
        const allLots = await tx.select().from(lots)
          .where(and(
            eq(lots.merchantId, entry.merchantId),
            eq(lots.coldStoreName, entry.coldStoreName)
          ))
          .orderBy(asc(lots.createdAt));
        
        // Filter to only those with remaining due
        const lotsWithDue = allLots.filter(lot => {
          const chargesPerBag = parseFloat(lot.coldStoreChargesPerBag || "0");
          if (chargesPerBag <= 0) return false;
          const totalCharges = chargesPerBag * lot.originalBags;
          const paidAmount = parseFloat(lot.coldStorageChargesPaid || "0");
          return totalCharges > paidAmount;
        });
        
        for (const lot of lotsWithDue) {
          if (remainingAmount <= 0) break;
          
          const chargesPerBag = parseFloat(lot.coldStoreChargesPerBag || "0");
          const totalCharges = chargesPerBag * lot.originalBags;
          const currentPaid = parseFloat(lot.coldStorageChargesPaid || "0");
          const due = totalCharges - currentPaid;
          
          if (due <= 0) continue;
          
          // Calculate how much to apply to this lot
          const toApply = Math.min(remainingAmount, due);
          
          // Create allocation record within transaction
          const [allocation] = await tx.insert(coldStoreChargeAllocations).values({
            cashEntryId: createdEntry.id,
            lotId: lot.id,
            merchantId: entry.merchantId,
            appliedAmount: toApply.toString(),
          }).returning();
          
          coldStoreAllocations.push(allocation);
          
          // Update lot's coldStorageChargesPaid within transaction
          const newPaid = currentPaid + toApply;
          await tx.update(lots)
            .set({ coldStorageChargesPaid: newPaid.toString() })
            .where(and(eq(lots.id, lot.id), eq(lots.merchantId, entry.merchantId)));
          
          remainingAmount -= toApply;
        }
      }
      
      return { ...createdEntry, allocations, coldStoreAllocations };
    });
  }

  // Cash Settings operations
  async getCashSettings(merchantId: number, financialYear: string): Promise<CashSettings | undefined> {
    const [settings] = await db.select().from(cashSettings)
      .where(and(eq(cashSettings.merchantId, merchantId), eq(cashSettings.financialYear, financialYear)));
    return settings || undefined;
  }

  async upsertCashSettings(merchantId: number, financialYear: string, data: Partial<InsertCashSettings>): Promise<CashSettings> {
    const existing = await this.getCashSettings(merchantId, financialYear);
    if (existing) {
      const [updated] = await db.update(cashSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(cashSettings.merchantId, merchantId), eq(cashSettings.financialYear, financialYear)))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(cashSettings).values({
        merchantId,
        financialYear,
        ...data,
      }).returning();
      return created;
    }
  }

  // Party operations
  async getPartiesByMerchant(merchantId: number): Promise<Party[]> {
    return await db.select().from(parties)
      .where(eq(parties.merchantId, merchantId))
      .orderBy(asc(parties.name));
  }

  async createParty(party: InsertParty): Promise<Party> {
    const [created] = await db.insert(parties).values(party).returning();
    return created;
  }

  async updateParty(id: number, merchantId: number, data: Partial<Party>): Promise<Party | undefined> {
    const [updated] = await db.update(parties)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(parties.id, id), eq(parties.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async deleteParty(id: number, merchantId: number): Promise<void> {
    await db.delete(parties)
      .where(and(eq(parties.id, id), eq(parties.merchantId, merchantId)));
  }

  // Cash Farmer operations
  async getCashFarmersByMerchant(merchantId: number): Promise<CashFarmer[]> {
    return await db.select().from(cashFarmers)
      .where(eq(cashFarmers.merchantId, merchantId))
      .orderBy(asc(cashFarmers.name));
  }

  async createCashFarmer(farmer: InsertCashFarmer): Promise<CashFarmer> {
    const [created] = await db.insert(cashFarmers).values(farmer).returning();
    return created;
  }

  async updateCashFarmer(id: number, merchantId: number, data: Partial<CashFarmer>): Promise<CashFarmer | undefined> {
    const [updated] = await db.update(cashFarmers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(cashFarmers.id, id), eq(cashFarmers.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async deleteCashFarmer(id: number, merchantId: number): Promise<void> {
    await db.delete(cashFarmers)
      .where(and(eq(cashFarmers.id, id), eq(cashFarmers.merchantId, merchantId)));
  }

  // ===================== SEED STOCK ENTRY OPERATIONS =====================
  
  async getSeedEntriesByMerchant(merchantId: number): Promise<SeedStockEntryWithLots[]> {
    const entries = await db.select().from(seedStockEntries)
      .where(eq(seedStockEntries.merchantId, merchantId))
      .orderBy(desc(seedStockEntries.serialNumber));

    const result = await Promise.all(entries.map(async (entry) => {
      const entryLots = await db.select().from(seedLots)
        .where(and(eq(seedLots.seedEntryId, entry.id), eq(seedLots.merchantId, merchantId)));
      
      return { ...entry, seedLots: entryLots };
    }));

    return result;
  }

  async getSeedEntryById(id: number, merchantId: number): Promise<SeedStockEntryWithLots | undefined> {
    const [entry] = await db.select().from(seedStockEntries)
      .where(and(eq(seedStockEntries.id, id), eq(seedStockEntries.merchantId, merchantId)));
    
    if (!entry) return undefined;

    const entryLots = await db.select().from(seedLots)
      .where(and(eq(seedLots.seedEntryId, entry.id), eq(seedLots.merchantId, merchantId)));

    return { ...entry, seedLots: entryLots };
  }

  async createSeedEntry(entry: InsertSeedStockEntry & { merchantId: number }): Promise<SeedStockEntry> {
    const serialNumber = await this.getNextSeedSerialNumber(entry.merchantId);
    const [created] = await db.insert(seedStockEntries).values({
      ...entry,
      serialNumber,
    }).returning();
    return created;
  }

  async updateSeedEntry(id: number, merchantId: number, data: Partial<SeedStockEntry>): Promise<SeedStockEntry | undefined> {
    const [updated] = await db.update(seedStockEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(seedStockEntries.id, id), eq(seedStockEntries.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async getNextSeedSerialNumber(merchantId: number): Promise<number> {
    const [result] = await db.select({ maxSerial: seedStockEntries.serialNumber })
      .from(seedStockEntries)
      .where(eq(seedStockEntries.merchantId, merchantId))
      .orderBy(desc(seedStockEntries.serialNumber))
      .limit(1);
    
    return (result?.maxSerial || 0) + 1;
  }

  // ===================== SEED LOT OPERATIONS =====================

  async createSeedLot(lot: InsertSeedLot): Promise<SeedLot> {
    const [created] = await db.insert(seedLots).values(lot).returning();
    return created;
  }

  async updateSeedLot(id: number, merchantId: number, data: Partial<SeedLot>): Promise<SeedLot | undefined> {
    const [updated] = await db.update(seedLots)
      .set(data)
      .where(and(eq(seedLots.id, id), eq(seedLots.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async getSeedLotsByEntry(seedEntryId: number, merchantId: number): Promise<SeedLot[]> {
    return await db.select().from(seedLots)
      .where(and(eq(seedLots.seedEntryId, seedEntryId), eq(seedLots.merchantId, merchantId)));
  }

  async getSeedLotById(id: number, merchantId: number): Promise<SeedLot | undefined> {
    const [lot] = await db.select().from(seedLots)
      .where(and(eq(seedLots.id, id), eq(seedLots.merchantId, merchantId)));
    return lot || undefined;
  }

  async deleteSeedLot(id: number, merchantId: number): Promise<void> {
    await db.delete(seedLots)
      .where(and(eq(seedLots.id, id), eq(seedLots.merchantId, merchantId)));
  }

  // ===================== SEED EDIT HISTORY OPERATIONS =====================

  async createSeedEditHistory(seedEntryId: number, merchantId: number, userId: number | null, changeSet: ChangeSet): Promise<SeedStockEntryEditHistory> {
    const [created] = await db.insert(seedStockEntryEditHistory).values({
      seedEntryId,
      merchantId,
      userId,
      changeSet,
    }).returning();
    return created;
  }

  async getSeedEditHistory(seedEntryId: number, merchantId: number): Promise<(SeedStockEntryEditHistory & { userName?: string })[]> {
    const history = await db.select().from(seedStockEntryEditHistory)
      .where(and(
        eq(seedStockEntryEditHistory.seedEntryId, seedEntryId),
        eq(seedStockEntryEditHistory.merchantId, merchantId)
      ))
      .orderBy(desc(seedStockEntryEditHistory.changedAt));
    
    // Collect unique user IDs and batch fetch them
    const userIds = Array.from(new Set(history.map(h => h.userId).filter((id): id is number => id !== null)));
    const userMap = new Map<number, string>();
    
    if (userIds.length > 0) {
      const usersData = await db.select({ id: users.id, name: users.name })
        .from(users)
        .where(sql`${users.id} IN ${userIds}`);
      usersData.forEach(u => userMap.set(u.id, u.name));
    }
    
    return history.map(h => ({
      ...h,
      userName: h.userId ? userMap.get(h.userId) : undefined,
    }));
  }

  // ===================== SEED TRANSACTION OPERATIONS =====================

  async getSeedTransactionsByMerchant(merchantId: number): Promise<SeedTransactionWithItems[]> {
    const txns = await db.select().from(seedTransactions)
      .where(eq(seedTransactions.merchantId, merchantId))
      .orderBy(desc(seedTransactions.transactionNumber));

    const result = await Promise.all(txns.map(async (txn) => {
      const items = await db.select().from(seedTransactionItems)
        .where(eq(seedTransactionItems.seedTransactionId, txn.id));
      return { ...txn, items };
    }));

    return result;
  }

  async getSeedTransactionById(id: number, merchantId: number): Promise<SeedTransactionWithItems | undefined> {
    const [txn] = await db.select().from(seedTransactions)
      .where(and(eq(seedTransactions.id, id), eq(seedTransactions.merchantId, merchantId)));
    
    if (!txn) return undefined;

    const items = await db.select().from(seedTransactionItems)
      .where(eq(seedTransactionItems.seedTransactionId, txn.id));
    
    return { ...txn, items };
  }

  async updateSeedTransaction(
    id: number,
    merchantId: number,
    data: Partial<InsertSeedTransaction>,
    items: Omit<InsertSeedTransactionItem, 'seedTransactionId'>[]
  ): Promise<SeedTransactionWithItems | undefined> {
    // Get existing transaction and items
    const existingTxn = await this.getSeedTransactionById(id, merchantId);
    if (!existingTxn) return undefined;

    // Restore bags from old items to seed lots
    for (const oldItem of existingTxn.items) {
      const seedLot = await this.getSeedLotById(oldItem.seedLotId, merchantId);
      if (seedLot) {
        await this.updateSeedLot(oldItem.seedLotId, merchantId, {
          remainingBags: seedLot.remainingBags + oldItem.bagsMoved,
        });
      }
    }

    // Delete old items
    await db.delete(seedTransactionItems)
      .where(eq(seedTransactionItems.seedTransactionId, id));

    // Update transaction
    const [updatedTxn] = await db.update(seedTransactions)
      .set(data)
      .where(and(eq(seedTransactions.id, id), eq(seedTransactions.merchantId, merchantId)))
      .returning();

    // Create new items and deduct from seed lots
    const createdItems: SeedTransactionItem[] = [];
    for (const item of items) {
      const [createdItem] = await db.insert(seedTransactionItems).values({
        ...item,
        seedTransactionId: id,
      }).returning();
      createdItems.push(createdItem);

      // Deduct from seed lot
      const seedLot = await this.getSeedLotById(item.seedLotId, merchantId);
      if (seedLot) {
        await this.updateSeedLot(item.seedLotId, merchantId, {
          remainingBags: seedLot.remainingBags - item.bagsMoved,
        });
      }
    }

    return { ...updatedTxn, items: createdItems };
  }

  async createSeedTransaction(
    transaction: InsertSeedTransaction & { transactionNumber: number },
    items: Omit<InsertSeedTransactionItem, 'seedTransactionId'>[]
  ): Promise<SeedTransactionWithItems> {
    const [createdTxn] = await db.insert(seedTransactions).values(transaction).returning();
    
    const createdItems: SeedTransactionItem[] = [];
    for (const item of items) {
      const [createdItem] = await db.insert(seedTransactionItems).values({
        ...item,
        seedTransactionId: createdTxn.id,
      }).returning();
      createdItems.push(createdItem);
      
      // Update seed lot remaining bags
      const seedLot = await this.getSeedLotById(item.seedLotId, transaction.merchantId);
      if (seedLot) {
        await this.updateSeedLot(item.seedLotId, transaction.merchantId, {
          remainingBags: seedLot.remainingBags - item.bagsMoved,
        });
      }
    }

    return { ...createdTxn, items: createdItems };
  }

  async getNextSeedTransactionNumber(merchantId: number): Promise<number> {
    const [result] = await db.select({ maxNum: seedTransactions.transactionNumber })
      .from(seedTransactions)
      .where(eq(seedTransactions.merchantId, merchantId))
      .orderBy(desc(seedTransactions.transactionNumber))
      .limit(1);
    
    return (result?.maxNum || 0) + 1;
  }

  async getUnsoldSeedInventory(merchantId: number): Promise<any[]> {
    // Get all seed lots with remaining bags > 0, along with their parent entry info
    const lotsWithRemaining = await db.select().from(seedLots)
      .where(and(eq(seedLots.merchantId, merchantId), gt(seedLots.remainingBags, 0)));

    const result = await Promise.all(lotsWithRemaining.map(async (lot) => {
      const [entry] = await db.select().from(seedStockEntries)
        .where(eq(seedStockEntries.id, lot.seedEntryId));
      
      return {
        ...lot,
        serialNumber: entry?.serialNumber || 0,
        supplierName: entry?.supplierName || '',
      };
    }));

    return result;
  }

  async createSeedTransactionEditHistory(data: { seedTransactionId: number; merchantId: number; userId: number; changeSet: any }): Promise<SeedTransactionEditHistory> {
    const [created] = await db.insert(seedTransactionEditHistory).values(data).returning();
    return created;
  }

  async getSeedTransactionEditHistory(seedTransactionId: number, merchantId: number): Promise<(SeedTransactionEditHistory & { userName?: string })[]> {
    const history = await db.select().from(seedTransactionEditHistory)
      .where(and(
        eq(seedTransactionEditHistory.seedTransactionId, seedTransactionId),
        eq(seedTransactionEditHistory.merchantId, merchantId)
      ))
      .orderBy(desc(seedTransactionEditHistory.changedAt));
    
    const result = await Promise.all(history.map(async (h) => {
      let userName: string | undefined;
      if (h.userId) {
        const user = await this.getUser(h.userId);
        userName = user?.name;
      }
      return { ...h, userName };
    }));

    return result;
  }
}

export const storage = new DatabaseStorage();
