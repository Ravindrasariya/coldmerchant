import { 
  users, merchants, stockEntries, lots, bagBreakdowns, stockEntryEditHistory,
  transactions, transactionItems,
  type User, type InsertUser, type Merchant, type InsertMerchant,
  type StockEntry, type InsertStockEntry, type Lot, type InsertLot,
  type BagBreakdown, type InsertBagBreakdown,
  type StockEntryEditHistory, type InsertStockEntryEditHistory, type ChangeSet,
  type Transaction, type InsertTransaction,
  type TransactionItem, type InsertTransactionItem
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
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
      
      // Decrement remaining bags on the lot
      const lot = await this.getLotById(item.lotId, item.merchantId);
      if (lot) {
        const newRemaining = Math.max(0, lot.remainingBags - item.bagsMoved);
        await this.updateLot(item.lotId, item.merchantId, { remainingBags: newRemaining });
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
    
    const result = await Promise.all(unsoldLots.map(async (lot) => {
      const [entry] = await db.select().from(stockEntries)
        .where(eq(stockEntries.id, lot.stockEntryId));
      
      const breakdowns = await db.select().from(bagBreakdowns)
        .where(eq(bagBreakdowns.lotId, lot.id));
      
      // Calculate available bags excluding wastage
      let availableBags = lot.remainingBags;
      if (breakdowns.length > 0) {
        // For bilty_cut: sum remainingBags from non-wastage breakdowns
        availableBags = breakdowns
          .filter(b => b.size !== "Wastage")
          .reduce((sum, b) => sum + (b.remainingBags || b.numberOfBags || 0), 0);
      }
      
      return {
        lotId: lot.id,
        serialNumber: entry?.serialNumber || 0,
        coldStoreName: lot.coldStoreName,
        farmerName: entry?.farmerName || "",
        potatoType: lot.potatoType,
        quality: lot.quality,
        cutType: lot.cutType,
        size: lot.size,
        pricePerKg: lot.pricePerKg,
        remainingBags: availableBags,
        originalBags: lot.originalBags,
        bagBreakdowns: breakdowns,
      };
    }));
    
    // Filter out lots with no available (non-wastage) bags
    return result.filter(r => r.remainingBags > 0).sort((a, b) => a.serialNumber - b.serialNumber);
  }
}

export const storage = new DatabaseStorage();
