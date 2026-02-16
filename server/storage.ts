import { 
  users, merchants, stockEntries, lots, bagBreakdowns, stockEntryEditHistory,
  transactions, transactionItems, transactionEditHistory,
  cashEntries, cashEntryAllocations, coldStoreChargeAllocations,
  cashSettings, bankAccounts, parties, cashFarmers, buyers, farmers, farmerEditHistory,
  buyerEditHistory,
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
  type BankAccount, type InsertBankAccount,
  type Party, type InsertParty,
  type CashFarmer, type InsertCashFarmer,
  type Buyer, type InsertBuyer,
  type BuyerEditHistory, type InsertBuyerEditHistory,
  type Farmer, type InsertFarmer, type FarmerEditHistory, type InsertFarmerEditHistory,
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
import { getISTDateString, getISTDateYYYYMMDD, getISTYear, dateDiffInDaysIST } from './ist-utils';
import { eq, and, or, desc, asc, sql, gt, ne, isNull, inArray } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

// Helper function to normalize names for case-insensitive, space-trimmed matching
function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().toLowerCase();
}

// Helper function to format date as YYYYMMDD
function formatDateYYYYMMDD(date?: Date): string {
  if (!date) return getISTDateYYYYMMDD();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function generateUniqueId(prefix: string, dateStr: string, table: any, uniqueIdColumn: any, retryOffset: number = 0): Promise<string> {
  const fullPrefix = `${prefix}${dateStr}`;
  const prefixLength = fullPrefix.length;
  
  const [result] = await db.select({
    maxSeq: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${uniqueIdColumn} FROM ${prefixLength + 1}) AS INTEGER)), 0)`
  })
    .from(table)
    .where(sql`${uniqueIdColumn} LIKE ${fullPrefix + '%'}`);
  
  const nextSequence = (result?.maxSeq || 0) + 1 + retryOffset;
  return `${fullPrefix}${nextSequence}`;
}

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
  countMerchantsByCodePrefix(prefix: string): Promise<number>;
  updateMerchant(id: number, data: Partial<Merchant>): Promise<Merchant | undefined>;
  deleteMerchant(id: number): Promise<void>;
  updateMerchantStatus(id: number, status: string): Promise<Merchant | undefined>;
  factoryResetMerchant(id: number): Promise<void>;
  invalidateMerchantSessions(merchantId: number): Promise<void>;
  
  // Stock Entry operations
  getStockEntriesByMerchant(merchantId: number): Promise<any[]>;
  getStockEntryById(id: number, merchantId: number): Promise<any | undefined>;
  createStockEntry(entry: InsertStockEntry & { merchantId: number; crop?: string }): Promise<StockEntry>;
  updateStockEntry(id: number, merchantId: number, data: Partial<StockEntry>): Promise<StockEntry | undefined>;
  getNextSerialNumber(merchantId: number, crop?: string): Promise<number>;
  
  // Lot operations
  createLot(lot: InsertLot): Promise<Lot>;
  updateLot(id: number, merchantId: number, data: Partial<Lot>): Promise<Lot | undefined>;
  getLotsByStockEntry(stockEntryId: number, merchantId: number): Promise<Lot[]>;
  getLotById(id: number, merchantId: number): Promise<Lot | undefined>;
  getAllLotsByMerchant(merchantId: number): Promise<Lot[]>;
  
  // Bag Breakdown operations
  createBagBreakdown(breakdown: InsertBagBreakdown): Promise<BagBreakdown>;
  updateBagBreakdown(id: number, merchantId: number, data: Partial<BagBreakdown>): Promise<BagBreakdown | undefined>;
  deleteBagBreakdown(id: number, merchantId: number): Promise<void>;
  getBagBreakdownsByLot(lotId: number, merchantId: number): Promise<BagBreakdown[]>;
  getBagBreakdownById(id: number, merchantId: number): Promise<BagBreakdown | undefined>;
  getAllBagBreakdownsByMerchant(merchantId: number): Promise<BagBreakdown[]>;
  
  // Edit History operations
  createEditHistory(stockEntryId: number, merchantId: number, userId: number | null, changeSet: ChangeSet): Promise<StockEntryEditHistory>;
  getEditHistory(stockEntryId: number, merchantId: number): Promise<(StockEntryEditHistory & { userName?: string })[]>;
  
  // Transaction operations
  getTransactionsByMerchant(merchantId: number): Promise<(Transaction & { items: (TransactionItem & { farmerName?: string; farmerVillage?: string })[] })[]>;
  createTransaction(transaction: InsertTransaction & { transactionNumber: number }, items: Omit<InsertTransactionItem, 'transactionId'>[]): Promise<Transaction & { items: TransactionItem[] }>;
  getNextTransactionNumber(merchantId: number, crop?: string): Promise<number>;
  getUnsoldInventory(merchantId: number): Promise<any[]>;
  getUniqueTransporterNames(merchantId: number): Promise<string[]>;
  
  // Cash Entry operations
  getCashEntriesByMerchant(merchantId: number): Promise<(CashEntry & { allocations: CashEntryAllocation[] })[]>;
  countCashEntriesByCodePrefix(merchantId: number, prefix: string): Promise<number>;
  getMaxCashCodeSequence(merchantId: number, prefix: string): Promise<number>;
  createCashEntry(entry: InsertCashEntry): Promise<CashEntry>;
  createCashEntryAllocation(allocation: InsertCashEntryAllocation): Promise<CashEntryAllocation>;
  getPartiesWithDue(merchantId: number): Promise<{ partyName: string; partyAddress: string | null; totalDue: number; transactionCount: number }[]>;
  getFarmersWithDue(merchantId: number): Promise<{ farmerName: string; farmerContact: string | null; village: string | null; totalDue: number; entryCount: number }[]>;
  getTransactionsWithDueByParty(merchantId: number, partyName: string, buyerId?: number | null): Promise<Transaction[]>;
  getColdStoresWithDue(merchantId: number): Promise<{ coldStoreName: string; totalDue: number; lotCount: number }[]>;
  getSeedFarmersWithDue(merchantId: number): Promise<{ farmerName: string; farmerContact: string | null; village: string | null; totalDue: number; transactionCount: number; receivables: number }[]>;
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
  
  // Buyer operations
  getBuyersByMerchant(merchantId: number): Promise<Buyer[]>;
  getBuyerById(id: number, merchantId: number): Promise<Buyer | undefined>;
  getBuyerByName(merchantId: number, name: string): Promise<Buyer | undefined>;
  getMaxBuyerCodeSequence(merchantId: number, prefix: string): Promise<number>;
  createBuyer(buyer: InsertBuyer): Promise<Buyer>;
  updateBuyer(id: number, merchantId: number, data: Partial<Buyer>): Promise<Buyer | undefined>;
  updateBuyerWithPropagation(id: number, merchantId: number, data: { name: string; address: string | null; mandiCode: string | null; contact: string | null }): Promise<{ buyer: Buyer | undefined; transactionsUpdated: number }>;
  deleteBuyer(id: number, merchantId: number): Promise<void>;
  lookupOrCreateBuyer(merchantId: number, buyerData: { name: string; contact?: string | null; address?: string | null; mandiCode?: string | null }): Promise<{ buyerId: number; isNew: boolean }>;
  syncPartiesWithBuyers(merchantId: number): Promise<{ partiesLinked: number; buyersCreated: number }>;
  
  // Buyer Edit History operations
  getBuyerEditHistory(buyerId: number, merchantId: number): Promise<BuyerEditHistory[]>;
  getNextBuyerEditHistorySerialNumber(merchantId: number): Promise<number>;
  createBuyerEditHistory(data: InsertBuyerEditHistory): Promise<BuyerEditHistory>;
  
  // Farmer Ledger operations
  getFarmersByMerchant(merchantId: number): Promise<Farmer[]>;
  getFarmerById(id: number, merchantId: number): Promise<Farmer | undefined>;
  getMaxFarmerCodeSequence(merchantId: number, prefix: string): Promise<number>;
  createFarmer(farmer: InsertFarmer): Promise<Farmer>;
  updateFarmer(id: number, merchantId: number, data: Partial<Farmer>): Promise<Farmer | undefined>;
  getFarmerByCompositeKey(merchantId: number, name: string, contact: string | null, village: string | null): Promise<Farmer | undefined>;
  getFarmerByNameAndContact(merchantId: number, name: string, contact: string | null): Promise<Farmer | undefined>;
  lookupOrCreateFarmer(merchantId: number, farmerData: { name: string; contact?: string | null; village?: string | null; tehsil?: string | null; district?: string | null; state?: string | null }): Promise<{ farmerId: number; isNew: boolean }>;
  
  // Farmer Edit History operations
  getFarmerEditHistory(merchantId: number): Promise<(FarmerEditHistory & { farmerName?: string; userName?: string })[]>;
  getFarmerEditHistoryById(farmerId: number, merchantId: number): Promise<(FarmerEditHistory & { userName?: string })[]>;
  createFarmerEditHistory(data: Omit<InsertFarmerEditHistory, 'serialNumber'>): Promise<FarmerEditHistory>;
  updateFarmerWithPropagation(id: number, merchantId: number, userId: number | null, data: Partial<Farmer>): Promise<{ farmer: Farmer | undefined; changesLogged: number }>;
  mergeFarmers(merchantId: number, userId: number | null, sourceId: number, targetId: number): Promise<{ survivingFarmer: Farmer; mergedCount: number }>;
  
  // Bank Account operations
  getBankAccountsByMerchant(merchantId: number): Promise<BankAccount[]>;
  createBankAccount(account: InsertBankAccount): Promise<BankAccount>;
  updateBankAccount(id: number, merchantId: number, data: Partial<BankAccount>): Promise<BankAccount | undefined>;
  deleteBankAccount(id: number, merchantId: number): Promise<void>;
  
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
  updateSeedTransactionFarmerId(id: number, merchantId: number, farmerId: number): Promise<void>;
  getNextSeedTransactionNumber(merchantId: number): Promise<number>;
  getUnsoldSeedInventory(merchantId: number): Promise<any[]>;
  createSeedTransactionEditHistory(data: { seedTransactionId: number; merchantId: number; userId: number; changeSet: any }): Promise<any>;
  getSeedTransactionEditHistory(seedTransactionId: number, merchantId: number): Promise<any[]>;
  
  createCashEntry(entry: InsertCashEntry, applyFIFO: boolean, userId?: number): Promise<CashEntry & { allocations: CashEntryAllocation[]; coldStoreAllocations?: ColdStoreChargeAllocation[] }>;
  
  // Season Reset operations
  checkRemainingBags(merchantId: number): Promise<{ hasRemaining: boolean; count: number; totalBags: number }>;
  checkSeedRemainingBags(merchantId: number): Promise<{ hasRemaining: boolean; count: number; totalBags: number }>;
  resetSeasonStockEntries(merchantId: number): Promise<void>;
  
  // Cash Entry Reversal operations
  reverseCashEntry(cashEntryId: number, merchantId: number): Promise<CashEntry>;
  
  // Farmer Lookup operations (for auto-fill)
  searchFarmers(merchantId: number, query: string): Promise<{
    farmerName: string;
    farmerContact: string | null;
    village: string | null;
    tehsil: string | null;
    district: string;
    state: string;
    source: 'stock_entry' | 'seed_transaction';
  }[]>;
  
  // Supplier Lookup operations (for auto-fill in seed stock entries)
  searchSuppliers(merchantId: number, query: string): Promise<{
    supplierName: string;
    supplierContact: string | null;
    address: string | null;
    district: string;
    state: string;
  }[]>;
  
  // Cold Store Lookup operations (for autocomplete in lot forms)
  searchColdStores(merchantId: number, query: string): Promise<string[]>;
  
  // Brand name lookup operations (for autocomplete in seed lot forms)
  searchSeedBrands(merchantId: number, query: string): Promise<string[]>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: false 
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

  async countMerchantsByCodePrefix(prefix: string): Promise<number> {
    const result = await db.select().from(merchants)
      .where(sql`${merchants.merchantCode} LIKE ${prefix + '%'}`);
    return result.length;
  }

  async updateMerchant(id: number, data: Partial<Merchant>): Promise<Merchant | undefined> {
    const [updated] = await db.update(merchants).set(data).where(eq(merchants.id, id)).returning();
    return updated || undefined;
  }

  async deleteMerchant(id: number): Promise<void> {
    await db.delete(merchants).where(eq(merchants.id, id));
  }

  async updateMerchantStatus(id: number, status: string): Promise<Merchant | undefined> {
    const [updated] = await db.update(merchants)
      .set({ status })
      .where(eq(merchants.id, id))
      .returning();
    return updated || undefined;
  }

  async factoryResetMerchant(id: number): Promise<void> {
    // Delete all merchant data in proper order (respecting foreign keys)
    // First delete allocations and settlements
    await db.delete(coldStoreChargeAllocations).where(eq(coldStoreChargeAllocations.merchantId, id));
    await db.delete(cashEntryAllocations).where(eq(cashEntryAllocations.merchantId, id));
    
    // Delete edit histories
    await db.delete(stockEntryEditHistory).where(eq(stockEntryEditHistory.merchantId, id));
    await db.delete(transactionEditHistory).where(eq(transactionEditHistory.merchantId, id));
    await db.delete(seedStockEntryEditHistory).where(eq(seedStockEntryEditHistory.merchantId, id));
    await db.delete(seedTransactionEditHistory).where(eq(seedTransactionEditHistory.merchantId, id));
    
    // Delete breakdowns
    await db.delete(bagBreakdowns).where(eq(bagBreakdowns.merchantId, id));
    
    // Delete lots
    await db.delete(lots).where(eq(lots.merchantId, id));
    await db.delete(seedLots).where(eq(seedLots.merchantId, id));
    
    // Delete transaction items
    await db.delete(transactionItems).where(eq(transactionItems.merchantId, id));
    await db.delete(seedTransactionItems).where(eq(seedTransactionItems.merchantId, id));
    
    // Delete main entries
    await db.delete(stockEntries).where(eq(stockEntries.merchantId, id));
    await db.delete(seedStockEntries).where(eq(seedStockEntries.merchantId, id));
    await db.delete(transactions).where(eq(transactions.merchantId, id));
    await db.delete(seedTransactions).where(eq(seedTransactions.merchantId, id));
    
    // Delete cash and party data
    await db.delete(cashEntries).where(eq(cashEntries.merchantId, id));
    await db.delete(cashSettings).where(eq(cashSettings.merchantId, id));
    await db.delete(bankAccounts).where(eq(bankAccounts.merchantId, id));
    await db.delete(parties).where(eq(parties.merchantId, id));
    await db.delete(cashFarmers).where(eq(cashFarmers.merchantId, id));
    await db.delete(buyers).where(eq(buyers.merchantId, id));
    
    // Reset merchant serial numbers by updating them (if tracking exists in merchant record)
    // The merchant record itself remains with status preserved
  }

  async invalidateMerchantSessions(merchantId: number): Promise<void> {
    // Get all users for this merchant
    const merchantUsers = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.merchantId, merchantId));
    
    // Delete sessions for these users from the session store
    // Sessions are stored in a PostgreSQL table, we can delete them directly
    const userIds = merchantUsers.map(u => u.id);
    if (userIds.length > 0) {
      await pool.query(
        `DELETE FROM session WHERE sess::jsonb -> 'passport' -> 'user' IN (${userIds.map(id => `'${id}'`).join(',')})`
      );
    }
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

  async createStockEntry(entry: Omit<InsertStockEntry, 'uniqueId'> & { merchantId: number; crop?: string }): Promise<StockEntry> {
    const crop = entry.crop || "potato";
    const serialNumber = await this.getNextSerialNumber(entry.merchantId, crop);
    // Use purchaseDate for unique ID generation (not current date)
    const purchaseDateForId = entry.purchaseDate ? new Date(entry.purchaseDate) : undefined;
    const dateStr = formatDateYYYYMMDD(purchaseDateForId);
    
    // Retry loop for handling concurrent unique ID collisions
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const uniqueId = await generateUniqueId("HSE", dateStr, stockEntries, stockEntries.uniqueId, attempt);
      try {
        const [created] = await db.insert(stockEntries).values({
          ...entry,
          crop,
          serialNumber,
          uniqueId,
        }).returning();
        return created;
      } catch (error: any) {
        if (error?.code === '23505' && error?.constraint?.includes('unique_id') && attempt < maxRetries - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("Failed to generate unique ID after multiple attempts");
  }

  async updateStockEntry(id: number, merchantId: number, data: Partial<StockEntry>): Promise<StockEntry | undefined> {
    const [updated] = await db.update(stockEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(stockEntries.id, id), eq(stockEntries.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async getNextSerialNumber(merchantId: number, crop: string = "potato"): Promise<number> {
    const currentYear = getISTYear();
    const [result] = await db.select({ maxSerial: stockEntries.serialNumber })
      .from(stockEntries)
      .where(and(
        eq(stockEntries.merchantId, merchantId),
        eq(stockEntries.crop, crop),
        sql`EXTRACT(YEAR FROM ${stockEntries.purchaseDate}) = ${currentYear}`
      ))
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

  async getAllLotsByMerchant(merchantId: number): Promise<Lot[]> {
    return await db.select().from(lots).where(eq(lots.merchantId, merchantId));
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

  async getAllBagBreakdownsByMerchant(merchantId: number): Promise<BagBreakdown[]> {
    return await db.select().from(bagBreakdowns).where(eq(bagBreakdowns.merchantId, merchantId));
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
  async getTransactionsByMerchant(merchantId: number): Promise<(Transaction & { items: (TransactionItem & { farmerName?: string; farmerVillage?: string })[] })[]> {
    const txns = await db.select().from(transactions)
      .where(eq(transactions.merchantId, merchantId))
      .orderBy(desc(transactions.createdAt));
    
    const result = await Promise.all(txns.map(async (txn) => {
      const items = await db.select().from(transactionItems)
        .where(eq(transactionItems.transactionId, txn.id));
      
      // Enrich items with farmer name and village from stock entries (scoped by merchantId for tenant isolation)
      const enrichedItems = await Promise.all(items.map(async (item) => {
        const lot = await db.select().from(lots).where(and(eq(lots.id, item.lotId), eq(lots.merchantId, merchantId))).limit(1);
        if (lot.length > 0) {
          const entry = await db.select().from(stockEntries).where(and(eq(stockEntries.id, lot[0].stockEntryId), eq(stockEntries.merchantId, merchantId))).limit(1);
          if (entry.length > 0) {
            return { ...item, farmerName: entry[0].farmerName, farmerVillage: entry[0].village ?? undefined };
          }
        }
        return { ...item, farmerName: undefined, farmerVillage: undefined };
      }));
      
      return { ...txn, items: enrichedItems };
    }));
    
    return result;
  }

  async createTransaction(
    transaction: Omit<InsertTransaction, 'uniqueId'> & { transactionNumber: number }, 
    items: Omit<InsertTransactionItem, 'transactionId'>[]
  ): Promise<Transaction & { items: TransactionItem[] }> {
    const dateStr = getISTDateYYYYMMDD();
    
    // Retry loop for handling concurrent unique ID collisions
    const maxRetries = 3;
    let created: Transaction | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const uniqueId = await generateUniqueId("HTE", dateStr, transactions, transactions.uniqueId, attempt);
      try {
        const [result] = await db.insert(transactions).values({ ...transaction, uniqueId }).returning();
        created = result;
        break;
      } catch (error: any) {
        if (error?.code === '23505' && error?.constraint?.includes('unique_id') && attempt < maxRetries - 1) {
          continue;
        }
        throw error;
      }
    }
    if (!created) throw new Error("Failed to generate unique ID after multiple attempts");
    
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

  async getNextTransactionNumber(merchantId: number, crop: string = "potato"): Promise<number> {
    const currentYear = getISTYear();
    const [result] = await db.select()
      .from(transactions)
      .where(and(
        eq(transactions.merchantId, merchantId),
        eq(transactions.crop, crop),
        sql`EXTRACT(YEAR FROM ${transactions.createdAt}) = ${currentYear}`
      ))
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
            place: lot.place,
            coldStoreName: lot.coldStoreName,
            farmerName: entry?.farmerName || "",
            farmerVillage: entry?.village || "",
            potatoType: lot.potatoType,
            quality: lot.quality,
            cutType: lot.cutType,
            size: breakdown.size,
            pricePerKg: breakdown.pricePerKg || lot.pricePerKg,
            remainingBags: availableBags,
            originalBags: breakdown.numberOfBags,
            lotOriginalBags: lot.originalBags,
            totalWeight: breakdown.weight || lot.totalWeight || null,
            breakdownWeight: breakdown.weight || null,
          });
        }
      } else {
        // For gate_cut: return single entry for the lot
        if (lot.remainingBags > 0) {
          results.push({
            breakdownId: null,
            lotId: lot.id,
            serialNumber: entry?.serialNumber || 0,
            place: lot.place,
            coldStoreName: lot.coldStoreName,
            farmerName: entry?.farmerName || "",
            farmerVillage: entry?.village || "",
            potatoType: lot.potatoType,
            quality: lot.quality,
            cutType: lot.cutType,
            size: lot.size,
            pricePerKg: lot.pricePerKg,
            remainingBags: lot.remainingBags,
            originalBags: lot.originalBags,
            lotOriginalBags: lot.originalBags,
            totalWeight: lot.totalWeight || null,
            breakdownWeight: null,
          });
        }
      }
    }
    
    return results.sort((a, b) => a.serialNumber - b.serialNumber);
  }

  async getUniqueTransporterNames(merchantId: number): Promise<string[]> {
    const result = await db.selectDistinct({ transporterName: transactions.transporterName })
      .from(transactions)
      .where(and(
        eq(transactions.merchantId, merchantId),
        sql`${transactions.transporterName} IS NOT NULL AND ${transactions.transporterName} != ''`
      ))
      .orderBy(transactions.transporterName);
    
    return result.map(r => r.transporterName).filter((name): name is string => name !== null);
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

  async countCashEntriesByCodePrefix(merchantId: number, prefix: string): Promise<number> {
    const result = await db.select().from(cashEntries)
      .where(and(
        eq(cashEntries.merchantId, merchantId),
        sql`${cashEntries.transactionCode} LIKE ${prefix + '%'}`
      ));
    return result.length;
  }

  async getMaxCashCodeSequence(merchantId: number, prefix: string): Promise<number> {
    const result = await db.select({ transactionCode: cashEntries.transactionCode }).from(cashEntries)
      .where(and(
        eq(cashEntries.merchantId, merchantId),
        sql`${cashEntries.transactionCode} LIKE ${prefix + '%'}`
      ));
    
    let maxSeq = 0;
    for (const row of result) {
      if (row.transactionCode) {
        const seqStr = row.transactionCode.replace(prefix, '');
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    return maxSeq;
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
    const txns = await db.select().from(transactions)
      .where(eq(transactions.merchantId, merchantId));
    
    const getPartyKey = (txn: typeof txns[0]): string | null => {
      if (txn.buyerId) return `id:${txn.buyerId}`;
      const n = normalizeName(txn.partyName);
      if (!n) return null;
      return `name:${n}`;
    };
    
    const partyMap = new Map<string, { displayName: string; partyAddress: string | null; totalDue: number; transactionCount: number }>();
    
    for (const txn of txns) {
      const key = getPartyKey(txn);
      if (!key) continue;
      
      const items = await db.select().from(transactionItems)
        .where(eq(transactionItems.transactionId, txn.id));
      
      const itemsRevenue = items.reduce((sum, item) => sum + parseFloat(item.revenue || "0"), 0);
      const revenue = itemsRevenue > 0 ? itemsRevenue : parseFloat(txn.revenue || "0");
      const received = parseFloat(txn.amountReceived || "0");
      const due = Math.max(0, revenue - received);
      
      if (due <= 0) continue;
      
      const existing = partyMap.get(key);
      if (existing) {
        existing.totalDue += due;
        existing.transactionCount += 1;
      } else {
        partyMap.set(key, {
          displayName: (txn.partyName || "").trim(),
          partyAddress: txn.partyAddress,
          totalDue: due,
          transactionCount: 1,
        });
      }
    }
    
    return Array.from(partyMap.entries()).map(([_, data]) => ({
      partyName: data.displayName,
      partyAddress: data.partyAddress,
      totalDue: data.totalDue,
      transactionCount: data.transactionCount,
    }));
  }

  async getFarmersWithDue(merchantId: number): Promise<{ farmerName: string; farmerContact: string | null; village: string | null; totalDue: number; entryCount: number }[]> {
    // Get stock entries with payment status "due" or "partial" 
    const entries = await db.select().from(stockEntries)
      .where(and(
        eq(stockEntries.merchantId, merchantId),
        or(eq(stockEntries.paymentStatus, "due"), eq(stockEntries.paymentStatus, "partial"))
      ));
    
    // Group by farmerId (primary) or composite key name+contact+village (fallback)
    const farmerMap = new Map<string, { displayName: string; farmerContact: string | null; village: string | null; totalDue: number; entryCount: number }>();
    
    const getFarmerKey = (entry: typeof entries[0]): string | null => {
      if (entry.farmerId) return `id:${entry.farmerId}`;
      const n = normalizeName(entry.farmerName);
      if (!n) return null;
      const c = normalizeName(entry.farmerContact);
      const v = normalizeName(entry.village);
      return `composite:${n}|${c}|${v}`;
    };
    
    for (const entry of entries) {
      const key = getFarmerKey(entry);
      if (!key) continue;
      
      // Get all lots for this entry and calculate total cost
      const entryLots = await db.select().from(lots)
        .where(eq(lots.stockEntryId, entry.id));
      
      let entryTotalCost = 0;
      let entryAdjustment = 0;
      for (const lot of entryLots) {
        const breakdownList = await db.select().from(bagBreakdowns)
          .where(eq(bagBreakdowns.lotId, lot.id));
        
        if (breakdownList.length > 0) {
          entryTotalCost += breakdownList.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        } else if (lot.pricePerKg) {
          entryTotalCost += lot.originalBags * 50 * parseFloat(lot.pricePerKg);
        }
        
        if (lot.adjustedAmount && lot.adjustedAmountType) {
          const adjustedAmount = parseFloat(lot.adjustedAmount);
          if (lot.adjustedAmountType === "debit") {
            entryAdjustment -= adjustedAmount;
          } else if (lot.adjustedAmountType === "credit") {
            entryAdjustment += adjustedAmount;
          }
        }
      }
      
      const amountPaid = parseFloat(entry.amountPaid || "0");
      const adjustedTotal = entryTotalCost + entryAdjustment;
      const entryDue = Math.max(0, adjustedTotal - amountPaid);
      
      if (entryDue <= 0) continue;
      
      const existing = farmerMap.get(key);
      if (existing) {
        existing.totalDue += entryDue;
        existing.entryCount += 1;
        if (!existing.farmerContact && entry.farmerContact) {
          existing.farmerContact = entry.farmerContact;
        }
      } else {
        farmerMap.set(key, {
          displayName: entry.farmerName.trim(),
          farmerContact: entry.farmerContact || null,
          village: entry.village,
          totalDue: entryDue,
          entryCount: 1,
        });
      }
    }
    
    return Array.from(farmerMap.entries()).map(([_, data]) => ({
      farmerName: data.displayName,
      farmerContact: data.farmerContact,
      village: data.village,
      totalDue: data.totalDue,
      entryCount: data.entryCount,
    }));
  }

  async getColdStoresWithDue(merchantId: number): Promise<{ coldStoreName: string; totalDue: number; lotCount: number }[]> {
    // Get all lots with cold store charges that have not been fully paid
    const allLots = await db.select().from(lots)
      .where(eq(lots.merchantId, merchantId));
    
    // Helper to calculate cold store related charges from the charges array
    const getColdStoreChargesFromArray = (charges: unknown): number => {
      if (!Array.isArray(charges)) return 0;
      const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
      return charges
        .filter((c: any) => c && coldStoreTypes.includes(c.type))
        .reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
    };
    
    // Group by normalized coldStoreName (case-insensitive, trimmed) and calculate dues
    const coldStoreMap = new Map<string, { displayName: string; totalDue: number; lotCount: number }>();
    
    for (const lot of allLots) {
      const normalizedName = normalizeName(lot.coldStoreName || "");
      if (!normalizedName) continue;
      
      // Get cold store charges from the charges array
      const totalCharges = getColdStoreChargesFromArray(lot.charges);
      
      // Skip lots with no charges at all
      if (totalCharges <= 0) continue;
      const paidAmount = parseFloat(lot.coldStorageChargesPaid || "0");
      const due = totalCharges - paidAmount;
      
      if (due <= 0) continue; // Skip fully paid lots
      
      const existing = coldStoreMap.get(normalizedName);
      if (existing) {
        existing.totalDue += due;
        existing.lotCount += 1;
      } else {
        coldStoreMap.set(normalizedName, {
          displayName: (lot.coldStoreName || "").trim(), // Keep original casing but trim spaces
          totalDue: due,
          lotCount: 1,
        });
      }
    }
    
    return Array.from(coldStoreMap.entries()).map(([_, data]) => ({
      coldStoreName: data.displayName,
      totalDue: data.totalDue,
      lotCount: data.lotCount,
    }));
  }

  async getSeedFarmersWithDue(merchantId: number): Promise<{ farmerName: string; farmerContact: string | null; village: string | null; totalDue: number; transactionCount: number; receivables: number }[]> {
    // Get all seed transactions for this merchant
    const txns = await db.select().from(seedTransactions)
      .where(eq(seedTransactions.merchantId, merchantId));
    
    // Get all farmers from the farmer ledger for receivable balances
    const allFarmerRecords = await db.select().from(farmers)
      .where(eq(farmers.merchantId, merchantId));
    
    // Note: seed_sale cash entries are already applied via FIFO to reduce totalDueToFarmer,
    // so we don't need to subtract them again here. Just use totalDueToFarmer directly.
    
    // Build farmer map using farmerId (primary) or composite key name+contact+village (fallback)
    const farmerMap = new Map<string, { displayName: string; farmerContact: string | null; village: string | null; totalDue: number; transactionCount: number; receivables: number }>();
    
    const getSeedFarmerKey = (farmerId: number | null | undefined, name: string | null, contact: string | null | undefined, village: string | null | undefined): string | null => {
      if (farmerId) return `id:${farmerId}`;
      const n = normalizeName(name);
      if (!n) return null;
      const c = normalizeName(contact);
      const v = normalizeName(village);
      return `composite:${n}|${c}|${v}`;
    };
    
    for (const txn of txns) {
      const dueToFarmer = parseFloat(txn.totalDueToFarmer || "0");
      
      if (dueToFarmer <= 0) continue;
      
      const key = getSeedFarmerKey(txn.farmerId, txn.farmerName, txn.farmerContact, txn.village);
      if (!key) continue;
      
      const existing = farmerMap.get(key);
      if (existing) {
        existing.totalDue += dueToFarmer;
        existing.transactionCount += 1;
        if (!existing.village && txn.village) {
          existing.village = txn.village;
        }
      } else {
        farmerMap.set(key, {
          displayName: txn.farmerName.trim(),
          farmerContact: txn.farmerContact || null,
          village: txn.village || null,
          totalDue: dueToFarmer,
          transactionCount: 1,
          receivables: 0,
        });
      }
    }
    
    // Add receivables from farmer ledger (pyReceivable with interest from pre-calculated finalAmount)
    for (const farmerRecord of allFarmerRecords) {
      const receivables = parseFloat(farmerRecord.pyReceivableFinalAmount || farmerRecord.pyReceivable || "0");
      if (receivables <= 0) continue;
      
      const key = `id:${farmerRecord.id}`;
      
      const existing = farmerMap.get(key);
      if (existing) {
        existing.receivables += receivables;
        existing.totalDue += receivables;
      } else {
        farmerMap.set(key, {
          displayName: farmerRecord.name.trim(),
          farmerContact: farmerRecord.contact || null,
          village: farmerRecord.village || null,
          totalDue: receivables,
          transactionCount: 0,
          receivables: receivables,
        });
      }
    }
    
    // Return farmers with remaining due (already reduced by FIFO payments)
    return Array.from(farmerMap.entries())
      .filter(([_, data]) => data.totalDue > 0)
      .map(([_, data]) => ({
        farmerName: data.displayName,
        farmerContact: data.farmerContact,
        village: data.village,
        totalDue: data.totalDue,
        transactionCount: data.transactionCount,
        receivables: data.receivables,
      })).sort((a, b) => b.totalDue - a.totalDue);
  }

  async getSeedSuppliersWithDue(merchantId: number): Promise<{ supplierName: string; district: string | null; totalDue: number; entryCount: number }[]> {
    // Get all seed stock entries for this merchant
    const entries = await db.select().from(seedStockEntries)
      .where(eq(seedStockEntries.merchantId, merchantId));
    
    // Get all seed lots to calculate total costs
    const allLots = await db.select().from(seedLots)
      .where(eq(seedLots.merchantId, merchantId));
    
    // Group by normalized supplier name (case-insensitive, trimmed) and calculate total due
    const supplierMap = new Map<string, { displayName: string; district: string | null; totalDue: number; entryCount: number }>();
    
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
      
      const key = normalizeName(entry.supplierName);
      if (!key) continue;
      
      const existing = supplierMap.get(key);
      if (existing) {
        existing.totalDue += dueAmount;
        existing.entryCount += 1;
      } else {
        supplierMap.set(key, {
          displayName: entry.supplierName.trim(), // Keep original casing but trim spaces
          district: entry.district || null,
          totalDue: dueAmount,
          entryCount: 1,
        });
      }
    }
    
    return Array.from(supplierMap.entries()).map(([_, data]) => ({
      supplierName: data.displayName,
      district: data.district,
      totalDue: data.totalDue,
      entryCount: data.entryCount,
    })).sort((a, b) => b.totalDue - a.totalDue);
  }

  async getTransactionsWithDueByParty(merchantId: number, partyName: string, buyerId?: number | null): Promise<Transaction[]> {
    const txns = await db.select().from(transactions)
      .where(eq(transactions.merchantId, merchantId))
      .orderBy(asc(transactions.createdAt));
    
    return txns.filter(txn => {
      const matchesBuyer = buyerId
        ? (txn.buyerId === buyerId)
        : (txn.partyName && normalizeName(txn.partyName) === normalizeName(partyName));
      if (!matchesBuyer) return false;
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
        const entryBuyerId = entry.buyerId || null;
        const normalizedPartyName = normalizeName(entry.partyName);
        
        // Resolve buyerId if not directly available
        let matchedBuyerId = entryBuyerId;
        if (!matchedBuyerId) {
          const allBuyers = await tx.select().from(buyers)
            .where(eq(buyers.merchantId, entry.merchantId));
          const matchedBuyer = allBuyers.find(b => normalizeName(b.name) === normalizedPartyName);
          matchedBuyerId = matchedBuyer?.id || null;
        }
        
        // STEP 1: First reduce buyer's receivableBalance in buyer ledger
        if (matchedBuyerId && remainingAmount > 0) {
          const [matchedBuyer] = await tx.select().from(buyers).where(eq(buyers.id, matchedBuyerId));
          if (matchedBuyer) {
            const currentReceivable = parseFloat(matchedBuyer.receivableBalance || "0");
            if (currentReceivable > 0) {
              const toApply = Math.min(remainingAmount, currentReceivable);
              const newReceivable = currentReceivable - toApply;
              await tx.update(buyers)
                .set({ receivableBalance: newReceivable.toFixed(2), updatedAt: new Date() })
                .where(eq(buyers.id, matchedBuyerId));
              remainingAmount -= toApply;
            }
          }
        }
        
        // STEP 2: Apply remaining to transactions using FIFO (oldest first)
        if (remainingAmount > 0) {
          const txns = await tx.select().from(transactions)
            .where(eq(transactions.merchantId, entry.merchantId))
            .orderBy(asc(transactions.createdAt));
          
          const transactionsWithDue = txns.filter(txn => {
            const matchesBuyer = matchedBuyerId
              ? (txn.buyerId === matchedBuyerId)
              : (txn.partyName && normalizeName(txn.partyName) === normalizedPartyName);
            if (!matchesBuyer) return false;
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
            
            const toApply = Math.min(remainingAmount, due);
            
            const [allocation] = await tx.insert(cashEntryAllocations).values({
              cashEntryId: createdEntry.id,
              transactionId: txn.id,
              merchantId: entry.merchantId,
              appliedAmount: toApply.toString(),
            }).returning();
            
            allocations.push(allocation);
            
            const newReceived = currentReceived + toApply;
            await tx.update(transactions)
              .set({ amountReceived: newReceived.toString() })
              .where(and(eq(transactions.id, txn.id), eq(transactions.merchantId, entry.merchantId)));
            
            remainingAmount -= toApply;
          }
        }
      }
      
      // If this is a seed sale inward payment, apply FIFO to seed transactions (reduce totalDueToFarmer)
      if (applyFIFO && entry.direction === "inward" && entry.revenueType === "seed_sale" && entry.farmerName) {
        let remainingAmount = parseFloat(entry.amount);
        const entryFarmerId = entry.farmerId || null;
        const normalizedFarmerName = normalizeName(entry.farmerName);
        const normalizedFarmerContact = entry.farmerContact ? normalizeName(entry.farmerContact) : null;
        const normalizedFarmerVillage = entry.farmerVillage ? normalizeName(entry.farmerVillage) : null;
        
        const farmerCompositeMatch = (name: string | null, contact: string | null, village: string | null) => {
          if (normalizeName(name) !== normalizedFarmerName) return false;
          if (normalizeName(contact) !== normalizedFarmerContact) return false;
          if (normalizeName(village) !== normalizedFarmerVillage) return false;
          return true;
        };
        
        // Resolve farmerId
        let matchedFarmerId = entryFarmerId;
        if (!matchedFarmerId) {
          const allFarmerRecords = await tx.select().from(farmers)
            .where(eq(farmers.merchantId, entry.merchantId));
          const matchedFarmer = allFarmerRecords.find(f => farmerCompositeMatch(f.name, f.contact, f.village));
          matchedFarmerId = matchedFarmer?.id || null;
        }
        
        // STEP 1: First reduce farmer's pyReceivable in farmer ledger
        // Use pre-calculated finalAmount (principal + accrued simple interest) before deducting
        if (matchedFarmerId && remainingAmount > 0) {
          const [matchedFarmer] = await tx.select().from(farmers).where(eq(farmers.id, matchedFarmerId));
          if (matchedFarmer) {
            const accruedAmount = parseFloat(matchedFarmer.pyReceivableFinalAmount || matchedFarmer.pyReceivable || "0");
            if (accruedAmount > 0) {
              const toApply = Math.min(remainingAmount, accruedAmount);
              const newAccrued = accruedAmount - toApply;
              await tx.update(farmers)
                .set({ 
                  pyReceivable: newAccrued > 0 ? newAccrued.toFixed(2) : "0.00",
                  pyReceivableFinalAmount: newAccrued > 0 ? newAccrued.toFixed(2) : "0.00",
                  receivableEffectiveDate: newAccrued > 0 ? getISTDateString() : null,
                  receivableInterestRate: newAccrued > 0 ? matchedFarmer.receivableInterestRate : "0.00",
                })
                .where(eq(farmers.id, matchedFarmerId));
              remainingAmount -= toApply;
            }
          }
        }
        
        // STEP 2: Apply remaining to seed transactions using FIFO (oldest first)
        if (remainingAmount > 0) {
          const allSeedTxns = await tx.select().from(seedTransactions)
            .where(eq(seedTransactions.merchantId, entry.merchantId))
            .orderBy(asc(seedTransactions.createdAt));
          
          const seedTxnsWithDue = allSeedTxns.filter(txn => {
            const matchesFarmer = matchedFarmerId
              ? (txn.farmerId === matchedFarmerId)
              : farmerCompositeMatch(txn.farmerName, txn.farmerContact || null, txn.village);
            if (!matchesFarmer) return false;
            const totalDue = parseFloat(txn.totalDueToFarmer || "0");
            return totalDue > 0;
          });
          
          for (const seedTxn of seedTxnsWithDue) {
            if (remainingAmount <= 0) break;
            
            const currentDue = parseFloat(seedTxn.totalDueToFarmer || "0");
            
            if (currentDue <= 0) continue;
            
            const toApply = Math.min(remainingAmount, currentDue);
            
            const newDue = currentDue - toApply;
            await tx.update(seedTransactions)
              .set({ totalDueToFarmer: newDue.toString() })
              .where(and(eq(seedTransactions.id, seedTxn.id), eq(seedTransactions.merchantId, entry.merchantId)));
            
            remainingAmount -= toApply;
          }
        }
      }
      
      // If this is a farmer payment, apply FIFO to stock entries
      if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "farmer" && entry.farmerName) {
        let remainingAmount = parseFloat(entry.amount);
        const entryFarmerId = entry.farmerId || null;
        const normalizedFarmerName = normalizeName(entry.farmerName);
        const normalizedFarmerContact = entry.farmerContact ? normalizeName(entry.farmerContact) : null;
        const normalizedFarmerVillage = entry.farmerVillage ? normalizeName(entry.farmerVillage) : null;
        
        const farmerCompositeMatchSE = (name: string | null, contact: string | null, village: string | null) => {
          if (normalizeName(name) !== normalizedFarmerName) return false;
          if (normalizeName(contact) !== normalizedFarmerContact) return false;
          if (normalizeName(village) !== normalizedFarmerVillage) return false;
          return true;
        };
        
        let matchedFarmerId = entryFarmerId;
        if (!matchedFarmerId) {
          const allFarmerRecords = await tx.select().from(farmers)
            .where(eq(farmers.merchantId, entry.merchantId));
          const matchedFarmer = allFarmerRecords.find(f => farmerCompositeMatchSE(f.name, f.contact, f.village));
          matchedFarmerId = matchedFarmer?.id || null;
        }
        
        // Get stock entries with due amount (FIFO order by createdAt)
        const allFarmerEntries = await tx.select().from(stockEntries)
          .where(and(
            eq(stockEntries.merchantId, entry.merchantId),
            or(eq(stockEntries.paymentStatus, "due"), eq(stockEntries.paymentStatus, "partial"))
          ))
          .orderBy(asc(stockEntries.createdAt));
        
        const farmerEntries = allFarmerEntries.filter(se => {
          const matches = matchedFarmerId
            ? (se.farmerId === matchedFarmerId)
            : farmerCompositeMatchSE(se.farmerName, se.farmerContact, se.village);
          return matches;
        });
        
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
        const normalizedColdStoreName = normalizeName(entry.coldStoreName);
        
        // Get all lots for this merchant (FIFO order by createdAt)
        const allLots = await tx.select().from(lots)
          .where(eq(lots.merchantId, entry.merchantId))
          .orderBy(asc(lots.createdAt));
        
        // Helper to calculate cold store related charges from the charges array
        const getColdStoreChargesFromArray = (charges: unknown): number => {
          if (!Array.isArray(charges)) return 0;
          const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
          return charges
            .filter((c: any) => c && coldStoreTypes.includes(c.type))
            .reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
        };
        
        // Filter to only those matching cold store name (case-insensitive, trimmed) with remaining due
        const lotsWithDue = allLots.filter(lot => {
          if (normalizeName(lot.coldStoreName || "") !== normalizedColdStoreName) return false;
          const totalCharges = getColdStoreChargesFromArray(lot.charges);
          // Check if there are any charges
          if (totalCharges <= 0) return false;
          const paidAmount = parseFloat(lot.coldStorageChargesPaid || "0");
          return totalCharges > paidAmount;
        });
        
        for (const lot of lotsWithDue) {
          if (remainingAmount <= 0) break;
          
          const totalCharges = getColdStoreChargesFromArray(lot.charges);
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
      
      // If this is a supplier payment, apply FIFO to seed stock entries
      if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "supplier" && entry.supplierName) {
        let remainingAmount = parseFloat(entry.amount);
        const normalizedSupplierName = normalizeName(entry.supplierName);
        
        // Get all seed stock entries for this merchant (FIFO order by createdAt)
        const allSeedEntries = await tx.select().from(seedStockEntries)
          .where(eq(seedStockEntries.merchantId, entry.merchantId))
          .orderBy(asc(seedStockEntries.createdAt));
        
        // Get all seed lots to calculate total costs
        const allSeedLots = await tx.select().from(seedLots)
          .where(eq(seedLots.merchantId, entry.merchantId));
        
        // Filter to only those matching supplier name (case-insensitive, trimmed) with remaining due
        const entriesWithDue = allSeedEntries.filter(se => {
          if (normalizeName(se.supplierName) !== normalizedSupplierName) return false;
          
          // Calculate total cost for this entry from its lots
          const entryLots = allSeedLots.filter(lot => lot.seedEntryId === se.id);
          const totalCost = entryLots.reduce((sum, lot) => {
            const bags = lot.originalBags || 0;
            const pricePerBag = parseFloat(lot.pricePerBag || "0");
            return sum + (bags * pricePerBag);
          }, 0);
          
          const amountPaid = parseFloat(se.amountPaid || "0");
          return totalCost > amountPaid;
        });
        
        for (const seedEntry of entriesWithDue) {
          if (remainingAmount <= 0) break;
          
          // Calculate total cost for this entry from its lots
          const entryLots = allSeedLots.filter(lot => lot.seedEntryId === seedEntry.id);
          const totalCost = entryLots.reduce((sum, lot) => {
            const bags = lot.originalBags || 0;
            const pricePerBag = parseFloat(lot.pricePerBag || "0");
            return sum + (bags * pricePerBag);
          }, 0);
          
          const currentPaid = parseFloat(seedEntry.amountPaid || "0");
          const due = totalCost - currentPaid;
          
          if (due <= 0) continue;
          
          // Calculate how much to apply to this seed stock entry
          const toApply = Math.min(remainingAmount, due);
          
          // Update seed stock entry's amountPaid and paymentStatus
          const newPaid = currentPaid + toApply;
          const newDue = totalCost - newPaid;
          const newStatus = newDue <= 0 ? "paid" : "partial";
          
          await tx.update(seedStockEntries)
            .set({ 
              amountPaid: newPaid.toString(),
              paymentStatus: newStatus
            })
            .where(and(eq(seedStockEntries.id, seedEntry.id), eq(seedStockEntries.merchantId, entry.merchantId)));
          
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

  // Buyer operations
  async getBuyersByMerchant(merchantId: number): Promise<Buyer[]> {
    return await db.select().from(buyers)
      .where(eq(buyers.merchantId, merchantId))
      .orderBy(buyers.id);
  }

  async getBuyerById(id: number, merchantId: number): Promise<Buyer | undefined> {
    const [buyer] = await db.select().from(buyers)
      .where(and(eq(buyers.id, id), eq(buyers.merchantId, merchantId)));
    return buyer || undefined;
  }

  async getBuyerByName(merchantId: number, name: string): Promise<Buyer | undefined> {
    const normalizedName = normalizeName(name);
    const allBuyers = await db.select().from(buyers)
      .where(eq(buyers.merchantId, merchantId));
    return allBuyers.find(b => normalizeName(b.name) === normalizedName);
  }

  async getMaxBuyerCodeSequence(merchantId: number, prefix: string): Promise<number> {
    const result = await db.select({ buyerCode: buyers.buyerCode }).from(buyers)
      .where(and(
        eq(buyers.merchantId, merchantId),
        sql`${buyers.buyerCode} LIKE ${prefix + '%'}`
      ));
    
    let maxSeq = 0;
    for (const row of result) {
      if (row.buyerCode) {
        const seqStr = row.buyerCode.replace(prefix, '');
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    return maxSeq;
  }

  async createBuyer(buyer: InsertBuyer): Promise<Buyer> {
    const [created] = await db.insert(buyers).values(buyer).returning();
    return created;
  }

  async updateBuyer(id: number, merchantId: number, data: Partial<Buyer>): Promise<Buyer | undefined> {
    const [updated] = await db.update(buyers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(buyers.id, id), eq(buyers.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async updateBuyerWithPropagation(
    id: number,
    merchantId: number,
    data: { name: string; address: string | null; mandiCode: string | null; contact: string | null }
  ): Promise<{ buyer: Buyer | undefined; transactionsUpdated: number }> {
    const [updatedBuyer] = await db.update(buyers)
      .set({ 
        name: data.name,
        address: data.address ?? undefined,
        mandiCode: data.mandiCode ?? undefined,
        contact: data.contact ?? undefined,
        updatedAt: new Date() 
      })
      .where(and(eq(buyers.id, id), eq(buyers.merchantId, merchantId)))
      .returning();

    if (!updatedBuyer) {
      return { buyer: undefined, transactionsUpdated: 0 };
    }

    const result = await db.update(transactions)
      .set({
        partyName: data.name,
        partyAddress: data.address ?? undefined,
      })
      .where(and(
        eq(transactions.merchantId, merchantId),
        eq(transactions.buyerId, id)
      ))
      .returning({ id: transactions.id });

    return { 
      buyer: updatedBuyer, 
      transactionsUpdated: result.length 
    };
  }

  async deleteBuyer(id: number, merchantId: number): Promise<void> {
    await db.delete(buyers)
      .where(and(eq(buyers.id, id), eq(buyers.merchantId, merchantId)));
  }

  async lookupOrCreateBuyer(merchantId: number, buyerData: { name: string; contact?: string | null; address?: string | null; mandiCode?: string | null }): Promise<{ buyerId: number; isNew: boolean }> {
    // Check if buyer exists using name (case-insensitive)
    const existingBuyer = await this.getBuyerByName(merchantId, buyerData.name);
    
    if (existingBuyer) {
      return { buyerId: existingBuyer.id, isNew: false };
    }
    
    // Create new buyer with ID format: BYYYYYMMDD# (with retry for collision handling)
    const dateStr = getISTDateYYYYMMDD();
    const prefix = `BY${dateStr}`;
    
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const maxSeq = await this.getMaxBuyerCodeSequence(merchantId, prefix);
      const buyerCode = `${prefix}${maxSeq + 1 + attempt}`;
      try {
        const newBuyer = await this.createBuyer({
          merchantId,
          buyerCode,
          dateAdded: getISTDateString(),
          name: buyerData.name,
          contact: buyerData.contact || null,
          address: buyerData.address || "",
          mandiCode: buyerData.mandiCode || null,
          negativeFlag: false,
          isActive: true,
        });
        return { buyerId: newBuyer.id, isNew: true };
      } catch (error: any) {
        if (error?.code === '23505' && error?.constraint?.includes('buyer_code') && attempt < maxRetries - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("Failed to generate unique buyer code after multiple attempts");
  }

  async syncPartiesWithBuyers(merchantId: number): Promise<{ partiesLinked: number; buyersCreated: number }> {
    // Get all parties that don't have a buyerId linked
    const unlinkedParties = await db.select().from(parties)
      .where(and(
        eq(parties.merchantId, merchantId),
        isNull(parties.buyerId)
      ));
    
    let partiesLinked = 0;
    let buyersCreated = 0;
    
    for (const party of unlinkedParties) {
      // Use lookupOrCreateBuyer to find or create a buyer
      const { buyerId, isNew } = await this.lookupOrCreateBuyer(merchantId, {
        name: party.name,
        contact: party.contactNumber || null,
        address: party.address || null,
      });
      
      // Link the party to the buyer
      await db.update(parties)
        .set({ buyerId })
        .where(eq(parties.id, party.id));
      
      partiesLinked++;
      if (isNew) {
        buyersCreated++;
      }
    }
    
    return { partiesLinked, buyersCreated };
  }

  // ===================== BUYER EDIT HISTORY OPERATIONS =====================

  async getBuyerEditHistory(buyerId: number, merchantId: number): Promise<BuyerEditHistory[]> {
    return await db.select().from(buyerEditHistory)
      .where(and(
        eq(buyerEditHistory.buyerId, buyerId),
        eq(buyerEditHistory.merchantId, merchantId)
      ))
      .orderBy(desc(buyerEditHistory.changedAt), desc(buyerEditHistory.serialNumber));
  }

  async getNextBuyerEditHistorySerialNumber(merchantId: number): Promise<number> {
    const [result] = await db.select({ maxSerial: sql<number>`COALESCE(MAX(${buyerEditHistory.serialNumber}), 0)` })
      .from(buyerEditHistory)
      .where(eq(buyerEditHistory.merchantId, merchantId));
    return (result?.maxSerial ?? 0) + 1;
  }

  async createBuyerEditHistory(data: InsertBuyerEditHistory): Promise<BuyerEditHistory> {
    const [created] = await db.insert(buyerEditHistory).values(data).returning();
    return created;
  }

  // ===================== FARMER LEDGER OPERATIONS =====================
  
  async getFarmersByMerchant(merchantId: number): Promise<Farmer[]> {
    return await db.select().from(farmers)
      .where(eq(farmers.merchantId, merchantId))
      .orderBy(asc(farmers.isArchived), desc(farmers.dateAdded));
  }

  async getFarmerById(id: number, merchantId: number): Promise<Farmer | undefined> {
    const [farmer] = await db.select().from(farmers).where(and(eq(farmers.id, id), eq(farmers.merchantId, merchantId)));
    return farmer;
  }

  async getMaxFarmerCodeSequence(merchantId: number, prefix: string): Promise<number> {
    const result = await db.select({ farmerCode: farmers.farmerCode }).from(farmers)
      .where(and(
        eq(farmers.merchantId, merchantId),
        sql`${farmers.farmerCode} LIKE ${prefix + '%'}`
      ));
    
    let maxSeq = 0;
    for (const row of result) {
      if (row.farmerCode) {
        const seqStr = row.farmerCode.replace(prefix, '');
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    return maxSeq;
  }

  async createFarmer(farmer: InsertFarmer): Promise<Farmer> {
    const [created] = await db.insert(farmers).values(farmer).returning();
    return created;
  }

  async updateFarmer(id: number, merchantId: number, data: Partial<Farmer>): Promise<Farmer | undefined> {
    const [updated] = await db.update(farmers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(farmers.id, id), eq(farmers.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async getFarmerByCompositeKey(merchantId: number, name: string, contact: string | null, village: string | null): Promise<Farmer | undefined> {
    const normalizedName = normalizeName(name);
    const normalizedContact = contact ? normalizeName(contact) : null;
    const normalizedVillage = village ? normalizeName(village) : null;
    
    const allFarmers = await db.select().from(farmers)
      .where(eq(farmers.merchantId, merchantId));
    
    return allFarmers.find(f => {
      const fName = normalizeName(f.name);
      const fContact = f.contact ? normalizeName(f.contact) : null;
      const fVillage = f.village ? normalizeName(f.village) : null;
      
      return fName === normalizedName && 
             fContact === normalizedContact && 
             fVillage === normalizedVillage;
    });
  }

  async getFarmerByNameAndContact(merchantId: number, name: string, contact: string | null): Promise<Farmer | undefined> {
    const normalizedName = normalizeName(name);
    const normalizedContact = contact ? normalizeName(contact) : null;
    
    const allFarmers = await db.select().from(farmers)
      .where(eq(farmers.merchantId, merchantId));
    
    return allFarmers.find(f => {
      const fName = normalizeName(f.name);
      const fContact = f.contact ? normalizeName(f.contact) : null;
      
      return fName === normalizedName && fContact === normalizedContact;
    });
  }

  async lookupOrCreateFarmer(merchantId: number, farmerData: { name: string; contact?: string | null; village?: string | null; tehsil?: string | null; district?: string | null; state?: string | null }): Promise<{ farmerId: number; isNew: boolean }> {
    // Check if farmer exists using composite key (name + contact + village)
    const existingFarmer = await this.getFarmerByCompositeKey(
      merchantId,
      farmerData.name,
      farmerData.contact || null,
      farmerData.village || null
    );
    
    if (existingFarmer) {
      return { farmerId: existingFarmer.id, isNew: false };
    }
    
    // Create new farmer with retry for collision handling
    const dateStr = getISTDateYYYYMMDD();
    const prefix = `FM${dateStr}`;
    
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const maxSeq = await this.getMaxFarmerCodeSequence(merchantId, prefix);
      const farmerCode = `${prefix}${maxSeq + 1 + attempt}`;
      try {
        const newFarmer = await this.createFarmer({
          merchantId,
          farmerCode,
          dateAdded: getISTDateString(),
          name: farmerData.name,
          contact: farmerData.contact || null,
          village: farmerData.village || null,
          tehsil: farmerData.tehsil || null,
          district: farmerData.district || null,
          state: farmerData.state || null,
          pyPayable: "0",
          pyReceivable: "0",
          negativeFlag: false,
          isArchived: false,
        });
        return { farmerId: newFarmer.id, isNew: true };
      } catch (error: any) {
        if (error?.code === '23505' && error?.constraint?.includes('farmer_code') && attempt < maxRetries - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("Failed to generate unique farmer code after multiple attempts");
  }

  // ===================== FARMER EDIT HISTORY OPERATIONS =====================
  
  async getFarmerEditHistory(merchantId: number): Promise<(FarmerEditHistory & { farmerName?: string; userName?: string })[]> {
    const history = await db.select({
      history: farmerEditHistory,
      farmerName: farmers.name,
      userName: users.username,
    })
    .from(farmerEditHistory)
    .leftJoin(farmers, eq(farmerEditHistory.farmerId, farmers.id))
    .leftJoin(users, eq(farmerEditHistory.changedBy, users.id))
    .where(eq(farmerEditHistory.merchantId, merchantId))
    .orderBy(desc(farmerEditHistory.id));
    
    return history.map(h => ({
      ...h.history,
      farmerName: h.farmerName || undefined,
      userName: h.userName || undefined,
    }));
  }

  async getFarmerEditHistoryById(farmerId: number, merchantId: number): Promise<(FarmerEditHistory & { userName?: string })[]> {
    const history = await db.select({
      history: farmerEditHistory,
      userName: users.username,
    })
    .from(farmerEditHistory)
    .leftJoin(users, eq(farmerEditHistory.changedBy, users.id))
    .where(and(
      eq(farmerEditHistory.farmerId, farmerId),
      eq(farmerEditHistory.merchantId, merchantId)
    ))
    .orderBy(desc(farmerEditHistory.changedAt), desc(farmerEditHistory.serialNumber));
    
    return history.map(h => ({
      ...h.history,
      userName: h.userName || undefined,
    }));
  }

  async createFarmerEditHistory(data: Omit<InsertFarmerEditHistory, 'serialNumber'>): Promise<FarmerEditHistory> {
    // Get next serial number for this merchant
    const [result] = await db.select({ maxSerial: sql<number>`COALESCE(MAX(serial_number), 0)` })
      .from(farmerEditHistory)
      .where(eq(farmerEditHistory.merchantId, data.merchantId));
    const nextSerial = (result?.maxSerial || 0) + 1;
    
    const [created] = await db.insert(farmerEditHistory).values({
      ...data,
      serialNumber: nextSerial,
    }).returning();
    return created;
  }

  async updateFarmerWithPropagation(id: number, merchantId: number, userId: number | null, data: Partial<Farmer>): Promise<{ farmer: Farmer | undefined; changesLogged: number }> {
    // Get current farmer data first
    const [currentFarmer] = await db.select().from(farmers)
      .where(and(eq(farmers.id, id), eq(farmers.merchantId, merchantId)));
    
    if (!currentFarmer) {
      return { farmer: undefined, changesLogged: 0 };
    }
    
    // Track which fields changed
    const changedFields: { fieldName: string; oldValue: string | null; newValue: string | null }[] = [];
    const propagatableFields = ['name', 'contact', 'village', 'tehsil', 'district', 'state'] as const;
    
    for (const field of propagatableFields) {
      if (data[field] !== undefined && data[field] !== currentFarmer[field]) {
        changedFields.push({
          fieldName: field,
          oldValue: currentFarmer[field] || null,
          newValue: data[field] || null,
        });
      }
    }
    
    // Update the farmer record
    const [updatedFarmer] = await db.update(farmers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(farmers.id, id), eq(farmers.merchantId, merchantId)))
      .returning();
    
    if (!updatedFarmer || changedFields.length === 0) {
      return { farmer: updatedFarmer, changesLogged: 0 };
    }
    
    // Log each changed field
    for (const change of changedFields) {
      await this.createFarmerEditHistory({
        merchantId,
        farmerId: id,
        changedBy: userId,
        fieldName: change.fieldName,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }
    
    // Propagate changes to linked records
    // Update stock entries with this farmerId
    for (const change of changedFields) {
      if (change.fieldName === 'name') {
        await db.update(stockEntries)
          .set({ farmerName: change.newValue || '', updatedAt: new Date() })
          .where(and(eq(stockEntries.farmerId, id), eq(stockEntries.merchantId, merchantId)));
      } else if (change.fieldName === 'contact') {
        await db.update(stockEntries)
          .set({ farmerContact: change.newValue, updatedAt: new Date() })
          .where(and(eq(stockEntries.farmerId, id), eq(stockEntries.merchantId, merchantId)));
      } else if (change.fieldName === 'village') {
        await db.update(stockEntries)
          .set({ village: change.newValue, updatedAt: new Date() })
          .where(and(eq(stockEntries.farmerId, id), eq(stockEntries.merchantId, merchantId)));
      } else if (change.fieldName === 'tehsil') {
        await db.update(stockEntries)
          .set({ tehsil: change.newValue, updatedAt: new Date() })
          .where(and(eq(stockEntries.farmerId, id), eq(stockEntries.merchantId, merchantId)));
      } else if (change.fieldName === 'district') {
        await db.update(stockEntries)
          .set({ district: change.newValue || '', updatedAt: new Date() })
          .where(and(eq(stockEntries.farmerId, id), eq(stockEntries.merchantId, merchantId)));
      } else if (change.fieldName === 'state') {
        await db.update(stockEntries)
          .set({ state: change.newValue || '', updatedAt: new Date() })
          .where(and(eq(stockEntries.farmerId, id), eq(stockEntries.merchantId, merchantId)));
      }
    }
    
    // Update seed transactions with this farmerId
    for (const change of changedFields) {
      if (change.fieldName === 'name') {
        await db.update(seedTransactions)
          .set({ farmerName: change.newValue || '' })
          .where(and(eq(seedTransactions.farmerId, id), eq(seedTransactions.merchantId, merchantId)));
      } else if (change.fieldName === 'contact') {
        await db.update(seedTransactions)
          .set({ farmerContact: change.newValue })
          .where(and(eq(seedTransactions.farmerId, id), eq(seedTransactions.merchantId, merchantId)));
      } else if (change.fieldName === 'village') {
        await db.update(seedTransactions)
          .set({ village: change.newValue })
          .where(and(eq(seedTransactions.farmerId, id), eq(seedTransactions.merchantId, merchantId)));
      } else if (change.fieldName === 'tehsil') {
        await db.update(seedTransactions)
          .set({ tehsil: change.newValue })
          .where(and(eq(seedTransactions.farmerId, id), eq(seedTransactions.merchantId, merchantId)));
      } else if (change.fieldName === 'district') {
        await db.update(seedTransactions)
          .set({ district: change.newValue || '' })
          .where(and(eq(seedTransactions.farmerId, id), eq(seedTransactions.merchantId, merchantId)));
      } else if (change.fieldName === 'state') {
        await db.update(seedTransactions)
          .set({ state: change.newValue || '' })
          .where(and(eq(seedTransactions.farmerId, id), eq(seedTransactions.merchantId, merchantId)));
      }
    }
    
    // Update cash farmers with this farmerId
    for (const change of changedFields) {
      if (change.fieldName === 'name') {
        await db.update(cashFarmers)
          .set({ name: change.newValue || '', updatedAt: new Date() })
          .where(and(eq(cashFarmers.farmerId, id), eq(cashFarmers.merchantId, merchantId)));
      } else if (change.fieldName === 'contact') {
        await db.update(cashFarmers)
          .set({ contactNumber: change.newValue, updatedAt: new Date() })
          .where(and(eq(cashFarmers.farmerId, id), eq(cashFarmers.merchantId, merchantId)));
      } else if (change.fieldName === 'village') {
        await db.update(cashFarmers)
          .set({ village: change.newValue, updatedAt: new Date() })
          .where(and(eq(cashFarmers.farmerId, id), eq(cashFarmers.merchantId, merchantId)));
      } else if (change.fieldName === 'tehsil') {
        await db.update(cashFarmers)
          .set({ tehsil: change.newValue, updatedAt: new Date() })
          .where(and(eq(cashFarmers.farmerId, id), eq(cashFarmers.merchantId, merchantId)));
      } else if (change.fieldName === 'district') {
        await db.update(cashFarmers)
          .set({ district: change.newValue, updatedAt: new Date() })
          .where(and(eq(cashFarmers.farmerId, id), eq(cashFarmers.merchantId, merchantId)));
      } else if (change.fieldName === 'state') {
        await db.update(cashFarmers)
          .set({ state: change.newValue, updatedAt: new Date() })
          .where(and(eq(cashFarmers.farmerId, id), eq(cashFarmers.merchantId, merchantId)));
      }
    }
    
    return { farmer: updatedFarmer, changesLogged: changedFields.length };
  }

  async mergeFarmers(merchantId: number, userId: number | null, sourceId: number, targetId: number): Promise<{ survivingFarmer: Farmer; mergedCount: number }> {
    // Ensure sourceId < targetId (lower ID survives)
    const [lowerId, higherId] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];
    
    // Get both farmers
    const [survivingFarmer] = await db.select().from(farmers)
      .where(and(eq(farmers.id, lowerId), eq(farmers.merchantId, merchantId)));
    const [mergingFarmer] = await db.select().from(farmers)
      .where(and(eq(farmers.id, higherId), eq(farmers.merchantId, merchantId)));
    
    if (!survivingFarmer || !mergingFarmer) {
      throw new Error("One or both farmers not found");
    }
    
    let mergedCount = 0;
    
    // Helper for normalized composite key matching
    const normalizeForMatch = (val: string | null | undefined) => (val || "").trim().toLowerCase();
    
    // Move all linked stock entries from merging farmer to surviving farmer (by farmerId)
    const stockByIdResult = await db.update(stockEntries)
      .set({ 
        farmerId: lowerId, 
        farmerName: survivingFarmer.name,
        farmerContact: survivingFarmer.contact,
        village: survivingFarmer.village,
        tehsil: survivingFarmer.tehsil || undefined,
        district: survivingFarmer.district || undefined,
        state: survivingFarmer.state || undefined,
        updatedAt: new Date() 
      })
      .where(and(eq(stockEntries.farmerId, higherId), eq(stockEntries.merchantId, merchantId)))
      .returning();
    mergedCount += stockByIdResult.length;
    
    // ALSO update stock entries by composite key matching (for entries with null farmerId)
    // Match by merging farmer's composite key (name + contact + village)
    const allMerchantStockEntries = await db.select().from(stockEntries)
      .where(and(
        eq(stockEntries.merchantId, merchantId),
        isNull(stockEntries.farmerId)
      ));
    
    for (const entry of allMerchantStockEntries) {
      const entryName = normalizeForMatch(entry.farmerName);
      const entryContact = normalizeForMatch(entry.farmerContact);
      const entryVillage = normalizeForMatch(entry.village);
      
      const mergingName = normalizeForMatch(mergingFarmer.name);
      const mergingContact = normalizeForMatch(mergingFarmer.contact);
      const mergingVillage = normalizeForMatch(mergingFarmer.village);
      
      // Check if this entry matches the merging farmer's composite key
      if (entryName === mergingName && entryContact === mergingContact && entryVillage === mergingVillage) {
        await db.update(stockEntries)
          .set({
            farmerId: lowerId,
            farmerName: survivingFarmer.name,
            farmerContact: survivingFarmer.contact,
            village: survivingFarmer.village,
            tehsil: survivingFarmer.tehsil || undefined,
            district: survivingFarmer.district || undefined,
            state: survivingFarmer.state || undefined,
            updatedAt: new Date()
          })
          .where(eq(stockEntries.id, entry.id));
        mergedCount++;
      }
    }
    
    // Move all linked seed transactions from merging farmer to surviving farmer (by farmerId)
    const seedByIdResult = await db.update(seedTransactions)
      .set({ 
        farmerId: lowerId,
        farmerName: survivingFarmer.name,
        farmerContact: survivingFarmer.contact,
        village: survivingFarmer.village
      })
      .where(and(eq(seedTransactions.farmerId, higherId), eq(seedTransactions.merchantId, merchantId)))
      .returning();
    mergedCount += seedByIdResult.length;
    
    // ALSO update seed transactions by composite key matching (for entries with null farmerId)
    const allMerchantSeedTransactions = await db.select().from(seedTransactions)
      .where(and(
        eq(seedTransactions.merchantId, merchantId),
        isNull(seedTransactions.farmerId)
      ));
    
    for (const txn of allMerchantSeedTransactions) {
      const txnName = normalizeForMatch(txn.farmerName);
      const txnContact = normalizeForMatch(txn.farmerContact);
      const txnVillage = normalizeForMatch(txn.village);
      
      const mergingName = normalizeForMatch(mergingFarmer.name);
      const mergingContact = normalizeForMatch(mergingFarmer.contact);
      const mergingVillage = normalizeForMatch(mergingFarmer.village);
      
      // Check if this transaction matches the merging farmer's composite key
      if (txnName === mergingName && txnContact === mergingContact && txnVillage === mergingVillage) {
        await db.update(seedTransactions)
          .set({
            farmerId: lowerId,
            farmerName: survivingFarmer.name,
            farmerContact: survivingFarmer.contact,
            village: survivingFarmer.village
          })
          .where(eq(seedTransactions.id, txn.id));
        mergedCount++;
      }
    }
    
    // Move all linked cash farmers from merging farmer to surviving farmer
    const cashResult = await db.update(cashFarmers)
      .set({ 
        farmerId: lowerId, 
        name: survivingFarmer.name,
        contactNumber: survivingFarmer.contact,
        village: survivingFarmer.village,
        tehsil: survivingFarmer.tehsil,
        district: survivingFarmer.district,
        state: survivingFarmer.state,
        updatedAt: new Date() 
      })
      .where(and(eq(cashFarmers.farmerId, higherId), eq(cashFarmers.merchantId, merchantId)))
      .returning();
    mergedCount += cashResult.length;
    
    // ALSO update cash farmers by composite key matching (for entries with null farmerId)
    const allMerchantCashFarmers = await db.select().from(cashFarmers)
      .where(and(
        eq(cashFarmers.merchantId, merchantId),
        isNull(cashFarmers.farmerId)
      ));
    
    for (const cf of allMerchantCashFarmers) {
      const cfName = normalizeForMatch(cf.name);
      const cfContact = normalizeForMatch(cf.contactNumber);
      const cfVillage = normalizeForMatch(cf.village);
      
      const mergingName = normalizeForMatch(mergingFarmer.name);
      const mergingContact = normalizeForMatch(mergingFarmer.contact);
      const mergingVillage = normalizeForMatch(mergingFarmer.village);
      
      // Check if this cash farmer matches the merging farmer's composite key
      if (cfName === mergingName && cfContact === mergingContact && cfVillage === mergingVillage) {
        await db.update(cashFarmers)
          .set({
            farmerId: lowerId,
            name: survivingFarmer.name,
            contactNumber: survivingFarmer.contact,
            village: survivingFarmer.village,
            tehsil: survivingFarmer.tehsil,
            district: survivingFarmer.district,
            state: survivingFarmer.state,
            updatedAt: new Date()
          })
          .where(eq(cashFarmers.id, cf.id));
        mergedCount++;
      }
    }
    
    // Aggregate PY balances
    const newPyPayable = (parseFloat(survivingFarmer.pyPayable || "0") + parseFloat(mergingFarmer.pyPayable || "0")).toString();
    const newPyReceivable = (parseFloat(survivingFarmer.pyReceivable || "0") + parseFloat(mergingFarmer.pyReceivable || "0")).toString();
    const newPyReceivableFinal = (parseFloat(survivingFarmer.pyReceivableFinalAmount || survivingFarmer.pyReceivable || "0") + parseFloat(mergingFarmer.pyReceivableFinalAmount || mergingFarmer.pyReceivable || "0")).toString();
    
    // Update surviving farmer with aggregated balances and better details
    const [updatedSurvivor] = await db.update(farmers)
      .set({
        pyPayable: newPyPayable,
        pyReceivable: newPyReceivable,
        pyReceivableFinalAmount: newPyReceivableFinal,
        tehsil: survivingFarmer.tehsil || mergingFarmer.tehsil,
        district: survivingFarmer.district || mergingFarmer.district,
        state: survivingFarmer.state || mergingFarmer.state,
        updatedAt: new Date(),
      })
      .where(and(eq(farmers.id, lowerId), eq(farmers.merchantId, merchantId)))
      .returning();
    
    // Log the merge in edit history with PY balance info
    const mergingPyPayable = parseFloat(mergingFarmer.pyPayable || "0");
    const mergingPyReceivable = parseFloat(mergingFarmer.pyReceivable || "0");
    const pyInfo = mergingPyPayable > 0 || mergingPyReceivable > 0 
      ? ` | PY: ₹${mergingPyPayable.toFixed(0)} payable, ₹${mergingPyReceivable.toFixed(0)} receivable`
      : '';
    
    await this.createFarmerEditHistory({
      merchantId,
      farmerId: lowerId,
      changedBy: userId,
      fieldName: 'merge',
      oldValue: `${mergingFarmer.farmerCode} (${mergingFarmer.name})${pyInfo}`,
      newValue: `${mergedCount} linked records transferred`,
    });
    
    // Delete the merged farmer
    await db.delete(farmers)
      .where(and(eq(farmers.id, higherId), eq(farmers.merchantId, merchantId)));
    
    return { survivingFarmer: updatedSurvivor, mergedCount };
  }

  // ===================== BANK ACCOUNT OPERATIONS =====================
  
  async getBankAccountsByMerchant(merchantId: number): Promise<BankAccount[]> {
    return await db.select().from(bankAccounts)
      .where(eq(bankAccounts.merchantId, merchantId))
      .orderBy(desc(bankAccounts.createdAt));
  }

  async createBankAccount(account: InsertBankAccount): Promise<BankAccount> {
    const [created] = await db.insert(bankAccounts).values(account).returning();
    return created;
  }

  async updateBankAccount(id: number, merchantId: number, data: Partial<BankAccount>): Promise<BankAccount | undefined> {
    const [updated] = await db.update(bankAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.merchantId, merchantId)))
      .returning();
    return updated;
  }

  async deleteBankAccount(id: number, merchantId: number): Promise<void> {
    await db.delete(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.merchantId, merchantId)));
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

  async createSeedEntry(entry: Omit<InsertSeedStockEntry, 'uniqueId'> & { merchantId: number }): Promise<SeedStockEntry> {
    const serialNumber = await this.getNextSeedSerialNumber(entry.merchantId);
    // Use purchaseDate for unique ID generation (not current date)
    const purchaseDateForId = entry.purchaseDate ? new Date(entry.purchaseDate) : undefined;
    const dateStr = formatDateYYYYMMDD(purchaseDateForId);
    
    // Retry loop for handling concurrent unique ID collisions
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const uniqueId = await generateUniqueId("SSE", dateStr, seedStockEntries, seedStockEntries.uniqueId, attempt);
      try {
        const [created] = await db.insert(seedStockEntries).values({
          ...entry,
          serialNumber,
          uniqueId,
        }).returning();
        return created;
      } catch (error: any) {
        if (error?.code === '23505' && error?.constraint?.includes('unique_id') && attempt < maxRetries - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("Failed to generate unique ID after multiple attempts");
  }

  async updateSeedEntry(id: number, merchantId: number, data: Partial<SeedStockEntry>): Promise<SeedStockEntry | undefined> {
    const [updated] = await db.update(seedStockEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(seedStockEntries.id, id), eq(seedStockEntries.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async getNextSeedSerialNumber(merchantId: number): Promise<number> {
    const currentYear = getISTYear();
    const [result] = await db.select({ maxSerial: seedStockEntries.serialNumber })
      .from(seedStockEntries)
      .where(and(
        eq(seedStockEntries.merchantId, merchantId),
        sql`EXTRACT(YEAR FROM ${seedStockEntries.purchaseDate}) = ${currentYear}`
      ))
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

    const allItems = await db.select({
      item: seedTransactionItems,
      supplierName: seedStockEntries.supplierName,
    })
    .from(seedTransactionItems)
    .innerJoin(seedLots, eq(seedTransactionItems.seedLotId, seedLots.id))
    .innerJoin(seedStockEntries, eq(seedLots.seedEntryId, seedStockEntries.id))
    .where(eq(seedTransactionItems.merchantId, merchantId));

    const itemsByTxnId = new Map<number, (typeof allItems[0]["item"] & { supplierName: string })[]>();
    for (const row of allItems) {
      const txnId = row.item.seedTransactionId;
      if (!itemsByTxnId.has(txnId)) itemsByTxnId.set(txnId, []);
      itemsByTxnId.get(txnId)!.push({ ...row.item, supplierName: row.supplierName });
    }

    const farmerIds = txns.map(t => t.farmerId).filter((id): id is number => id != null);
    const linkedFarmers = farmerIds.length > 0
      ? await db.select().from(farmers).where(and(inArray(farmers.id, farmerIds), eq(farmers.merchantId, merchantId)))
      : [];
    const farmerMap = new Map(linkedFarmers.map(f => [f.id, f]));

    const result = txns.map(txn => {
      const linkedFarmer = txn.farmerId ? farmerMap.get(txn.farmerId) || null : null;
      return { 
        ...txn, 
        items: itemsByTxnId.get(txn.id) || [],
        farmerName: linkedFarmer?.name || txn.farmerName,
        farmerContact: linkedFarmer?.contact || txn.farmerContact,
        village: linkedFarmer?.village || txn.village,
        tehsil: linkedFarmer?.tehsil || txn.tehsil,
        district: linkedFarmer?.district || txn.district,
        state: linkedFarmer?.state || txn.state,
      };
    });

    return result;
  }

  async getSeedTransactionById(id: number, merchantId: number): Promise<SeedTransactionWithItems | undefined> {
    const [txn] = await db.select().from(seedTransactions)
      .where(and(eq(seedTransactions.id, id), eq(seedTransactions.merchantId, merchantId)));
    
    if (!txn) return undefined;

    const itemRows = await db.select({
      item: seedTransactionItems,
      supplierName: seedStockEntries.supplierName,
    })
    .from(seedTransactionItems)
    .innerJoin(seedLots, eq(seedTransactionItems.seedLotId, seedLots.id))
    .innerJoin(seedStockEntries, eq(seedLots.seedEntryId, seedStockEntries.id))
    .where(eq(seedTransactionItems.seedTransactionId, txn.id));

    const enrichedItems = itemRows.map(row => ({ ...row.item, supplierName: row.supplierName }));

    let linkedFarmer = null;
    if (txn.farmerId) {
      const [farmer] = await db.select().from(farmers)
        .where(and(eq(farmers.id, txn.farmerId), eq(farmers.merchantId, merchantId)));
      linkedFarmer = farmer || null;
    }
    
    return { 
      ...txn, 
      items: enrichedItems,
      farmerName: linkedFarmer?.name || txn.farmerName,
      farmerContact: linkedFarmer?.contact || txn.farmerContact,
      village: linkedFarmer?.village || txn.village,
      tehsil: linkedFarmer?.tehsil || txn.tehsil,
      district: linkedFarmer?.district || txn.district,
      state: linkedFarmer?.state || txn.state,
    };
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
    for (const item of items) {
      await db.insert(seedTransactionItems).values({
        ...item,
        seedTransactionId: id,
      }).returning();

      const seedLot = await this.getSeedLotById(item.seedLotId, merchantId);
      if (seedLot) {
        await this.updateSeedLot(item.seedLotId, merchantId, {
          remainingBags: seedLot.remainingBags - item.bagsMoved,
        });
      }
    }

    const enrichedResult = await this.getSeedTransactionById(id, merchantId);
    return enrichedResult || { ...updatedTxn, items: [] };
  }

  async updateSeedTransactionFarmerId(id: number, merchantId: number, farmerId: number): Promise<void> {
    await db.update(seedTransactions)
      .set({ farmerId })
      .where(and(eq(seedTransactions.id, id), eq(seedTransactions.merchantId, merchantId)));
  }

  async createSeedTransaction(
    transaction: Omit<InsertSeedTransaction, 'uniqueId'> & { transactionNumber: number },
    items: Omit<InsertSeedTransactionItem, 'seedTransactionId'>[]
  ): Promise<SeedTransactionWithItems> {
    const dateStr = getISTDateYYYYMMDD();
    
    // Retry loop for handling concurrent unique ID collisions
    const maxRetries = 3;
    let createdTxn: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const uniqueId = await generateUniqueId("STE", dateStr, seedTransactions, seedTransactions.uniqueId, attempt);
      try {
        const [result] = await db.insert(seedTransactions).values({ ...transaction, uniqueId }).returning();
        createdTxn = result;
        break;
      } catch (error: any) {
        if (error?.code === '23505' && error?.constraint?.includes('unique_id') && attempt < maxRetries - 1) {
          continue;
        }
        throw error;
      }
    }
    if (!createdTxn) throw new Error("Failed to generate unique ID after multiple attempts");
    
    for (const item of items) {
      await db.insert(seedTransactionItems).values({
        ...item,
        seedTransactionId: createdTxn.id,
      }).returning();
      
      const seedLot = await this.getSeedLotById(item.seedLotId, transaction.merchantId);
      if (seedLot) {
        await this.updateSeedLot(item.seedLotId, transaction.merchantId, {
          remainingBags: seedLot.remainingBags - item.bagsMoved,
        });
      }
    }

    const enrichedResult = await this.getSeedTransactionById(createdTxn.id, transaction.merchantId);
    return enrichedResult || { ...createdTxn, items: [] };
  }

  async getNextSeedTransactionNumber(merchantId: number): Promise<number> {
    const currentYear = getISTYear();
    const [result] = await db.select({ maxNum: seedTransactions.transactionNumber })
      .from(seedTransactions)
      .where(and(
        eq(seedTransactions.merchantId, merchantId),
        sql`EXTRACT(YEAR FROM ${seedTransactions.createdAt}) = ${currentYear}`
      ))
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

  async createCashEntry(
    entry: InsertCashEntry, 
    applyFIFO: boolean, 
    userId?: number
  ): Promise<CashEntry & { allocations: CashEntryAllocation[]; coldStoreAllocations?: ColdStoreChargeAllocation[] }> {
    
    return await db.transaction(async (tx) => {
      const [createdEntry] = await tx.insert(cashEntries).values(entry).returning();
      const allocations: CashEntryAllocation[] = [];
      const coldStoreAllocations: ColdStoreChargeAllocation[] = [];

      // Apply standard FIFO logic
      // Party/Buyer payment FIFO
      if (applyFIFO && entry.direction === "inward" && entry.revenueType === "raw_potato" && entry.partyName) {
        let remainingAmount = parseFloat(entry.amount);
        const entryBuyerId = entry.buyerId || null;
        const normalizedPartyName = normalizeName(entry.partyName);
        
        // Use entry.buyerId directly if available, otherwise find by name
        let matchedBuyerId = entryBuyerId;
        if (!matchedBuyerId) {
          const allBuyers = await tx.select().from(buyers)
            .where(eq(buyers.merchantId, entry.merchantId));
          const matchedBuyer = allBuyers.find(b => normalizeName(b.name) === normalizedPartyName);
          matchedBuyerId = matchedBuyer?.id || null;
        }
        
        // STEP 1: First reduce buyer's receivableBalance in buyer ledger
        if (matchedBuyerId && remainingAmount > 0) {
          const [matchedBuyer] = await tx.select().from(buyers).where(eq(buyers.id, matchedBuyerId));
          if (matchedBuyer) {
            const currentReceivable = parseFloat(matchedBuyer.receivableBalance || "0");
            if (currentReceivable > 0) {
              const toApply = Math.min(remainingAmount, currentReceivable);
              const newReceivable = currentReceivable - toApply;
              await tx.update(buyers)
                .set({ receivableBalance: newReceivable.toFixed(2), updatedAt: new Date() })
                .where(eq(buyers.id, matchedBuyerId));
              remainingAmount -= toApply;
            }
          }
        }
        
        // STEP 2: Apply remaining to transactions FIFO
        if (remainingAmount > 0) {
          const txns = await tx.select().from(transactions)
            .where(eq(transactions.merchantId, entry.merchantId))
            .orderBy(asc(transactions.createdAt));
          
          const transactionsWithDue = txns.filter(txn => {
            const matchesBuyer = matchedBuyerId
              ? (txn.buyerId === matchedBuyerId)
              : (txn.partyName && normalizeName(txn.partyName) === normalizedPartyName);
            if (!matchesBuyer) return false;
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
            
            const toApply = Math.min(remainingAmount, due);
            
            const [allocation] = await tx.insert(cashEntryAllocations).values({
              cashEntryId: createdEntry.id,
              transactionId: txn.id,
              merchantId: entry.merchantId,
              appliedAmount: toApply.toString(),
            }).returning();
            
            allocations.push(allocation);
            
            const newReceived = currentReceived + toApply;
            await tx.update(transactions)
              .set({ amountReceived: newReceived.toString() })
              .where(eq(transactions.id, txn.id));
            
            remainingAmount -= toApply;
          }
        }
      }
      
      // Seed sale FIFO - update totalDueToFarmer on seed transactions
      if (applyFIFO && entry.direction === "inward" && entry.revenueType === "seed_sale" && entry.farmerName) {
        let remainingAmount = parseFloat(entry.amount);
        
        if (remainingAmount > 0) {
          const entryFarmerId = entry.farmerId || null;
          const normalizedFarmerName = normalizeName(entry.farmerName);
          const normalizedFarmerContact = entry.farmerContact ? normalizeName(entry.farmerContact) : null;
          const normalizedFarmerVillage = entry.farmerVillage ? normalizeName(entry.farmerVillage) : null;
          
          const farmerCompositeMatch = (name: string | null, contact: string | null, village: string | null) => {
            if (normalizeName(name) !== normalizedFarmerName) return false;
            if (normalizeName(contact) !== normalizedFarmerContact) return false;
            if (normalizeName(village) !== normalizedFarmerVillage) return false;
            return true;
          };
          
          // Resolve farmerId if not directly available
          let matchedFarmerId = entryFarmerId;
          if (!matchedFarmerId) {
            const allFarmers = await tx.select().from(farmers)
              .where(eq(farmers.merchantId, entry.merchantId));
            const matchedFarmer = allFarmers.find(f => farmerCompositeMatch(f.name, f.contact, f.village));
            matchedFarmerId = matchedFarmer?.id || null;
          }
          
          // STEP 1: First reduce farmer's pyReceivable in farmer ledger
          // Use pre-calculated finalAmount (principal + accrued simple interest) before deducting
          if (matchedFarmerId && remainingAmount > 0) {
            const [matchedFarmer] = await tx.select().from(farmers).where(eq(farmers.id, matchedFarmerId));
            if (matchedFarmer) {
              const accruedAmount = parseFloat(matchedFarmer.pyReceivableFinalAmount || matchedFarmer.pyReceivable || "0");
              if (accruedAmount > 0) {
                const toApply = Math.min(remainingAmount, accruedAmount);
                const newAccrued = accruedAmount - toApply;
                await tx.update(farmers)
                  .set({ 
                    pyReceivable: newAccrued > 0 ? newAccrued.toFixed(2) : "0.00",
                    pyReceivableFinalAmount: newAccrued > 0 ? newAccrued.toFixed(2) : "0.00",
                    receivableEffectiveDate: newAccrued > 0 ? getISTDateString() : null,
                    receivableInterestRate: newAccrued > 0 ? matchedFarmer.receivableInterestRate : "0.00",
                  })
                  .where(eq(farmers.id, matchedFarmerId));
                remainingAmount -= toApply;
              }
            }
          }
          
          // STEP 2: Apply remaining to seed transactions FIFO
          if (remainingAmount > 0) {
            const allSeedTxns = await tx.select().from(seedTransactions)
              .where(eq(seedTransactions.merchantId, entry.merchantId))
              .orderBy(asc(seedTransactions.createdAt));
            
            const seedTxnsWithDue = allSeedTxns.filter(txn => {
              const matchesFarmer = matchedFarmerId
                ? (txn.farmerId === matchedFarmerId)
                : farmerCompositeMatch(txn.farmerName, txn.farmerContact || null, txn.village);
              if (!matchesFarmer) return false;
              const totalDue = parseFloat(txn.totalDueToFarmer || "0");
              return totalDue > 0;
            });
            
            for (const seedTxn of seedTxnsWithDue) {
              if (remainingAmount <= 0) break;
              
              const currentDue = parseFloat(seedTxn.totalDueToFarmer || "0");
              if (currentDue <= 0) continue;
              
              const toApply = Math.min(remainingAmount, currentDue);
              const newDue = currentDue - toApply;
              await tx.update(seedTransactions)
                .set({ totalDueToFarmer: newDue.toString() })
                .where(eq(seedTransactions.id, seedTxn.id));
              
              remainingAmount -= toApply;
            }
          }
        }
      }
      
      // Farmer payment FIFO (for raw potatoes)
      if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "farmer" && entry.farmerName) {
        let remainingAmount = parseFloat(entry.amount);
        
        if (remainingAmount > 0) {
          const entryFarmerId = entry.farmerId || null;
          const normalizedFarmerName = normalizeName(entry.farmerName);
          const normalizedFarmerContact = entry.farmerContact ? normalizeName(entry.farmerContact) : null;
          const normalizedFarmerVillage = entry.farmerVillage ? normalizeName(entry.farmerVillage) : null;
          
          const farmerCompositeMatch = (name: string | null, contact: string | null, village: string | null) => {
            if (normalizeName(name) !== normalizedFarmerName) return false;
            if (normalizeName(contact) !== normalizedFarmerContact) return false;
            if (normalizeName(village) !== normalizedFarmerVillage) return false;
            return true;
          };
          
          // Use entry.farmerId directly if available, otherwise find by composite key
          let matchedFarmerId = entryFarmerId;
          if (!matchedFarmerId) {
            const allFarmers = await tx.select().from(farmers)
              .where(eq(farmers.merchantId, entry.merchantId));
            const matchedFarmer = allFarmers.find(f => farmerCompositeMatch(f.name, f.contact, f.village));
            matchedFarmerId = matchedFarmer?.id || null;
          }
          
          const allFarmerEntries = await tx.select().from(stockEntries)
            .where(and(
              eq(stockEntries.merchantId, entry.merchantId),
              or(eq(stockEntries.paymentStatus, "due"), eq(stockEntries.paymentStatus, "partial"))
            ))
            .orderBy(asc(stockEntries.createdAt));
          
          const farmerEntries = allFarmerEntries.filter(se => {
            const matches = matchedFarmerId
              ? (se.farmerId === matchedFarmerId)
              : farmerCompositeMatch(se.farmerName, se.farmerContact, se.village);
            return matches;
          });
          
          for (const stockEntry of farmerEntries) {
            if (remainingAmount <= 0) break;
            
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
            
            const toApply = Math.min(remainingAmount, due);
            const newPaid = currentPaid + toApply;
            const newDue = entryTotalCost - newPaid;
            const newStatus = newDue <= 0 ? "paid" : "partial";
            
            await tx.update(stockEntries)
              .set({ 
                amountPaid: newPaid.toString(),
                paymentStatus: newStatus
              })
              .where(eq(stockEntries.id, stockEntry.id));
            
            remainingAmount -= toApply;
          }
        }
      }
      
      // Cold store charge FIFO
      if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "cold_store_charge" && entry.coldStoreName) {
        let remainingAmount = parseFloat(entry.amount);
        const normalizedColdStoreName = normalizeName(entry.coldStoreName);
        
        const allLots = await tx.select().from(lots)
          .where(eq(lots.merchantId, entry.merchantId))
          .orderBy(asc(lots.createdAt));
        
        // Helper to calculate cold store related charges from the charges array
        const getColdStoreChargesFromArray = (charges: unknown): number => {
          if (!Array.isArray(charges)) return 0;
          const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
          return charges
            .filter((c: any) => c && coldStoreTypes.includes(c.type))
            .reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
        };
        
        const lotsWithDue = allLots.filter(lot => {
          if (normalizeName(lot.coldStoreName) !== normalizedColdStoreName) return false;
          const totalCharges = getColdStoreChargesFromArray(lot.charges);
          if (totalCharges <= 0) return false;
          const paidAmount = parseFloat(lot.coldStorageChargesPaid || "0");
          return totalCharges > paidAmount;
        });
        
        for (const lot of lotsWithDue) {
          if (remainingAmount <= 0) break;
          
          const totalCharges = getColdStoreChargesFromArray(lot.charges);
          const currentPaid = parseFloat(lot.coldStorageChargesPaid || "0");
          const due = totalCharges - currentPaid;
          
          if (due <= 0) continue;
          
          const toApply = Math.min(remainingAmount, due);
          
          const [allocation] = await tx.insert(coldStoreChargeAllocations).values({
            cashEntryId: createdEntry.id,
            lotId: lot.id,
            merchantId: entry.merchantId,
            appliedAmount: toApply.toString(),
          }).returning();
          
          coldStoreAllocations.push(allocation);
          
          const newPaid = currentPaid + toApply;
          await tx.update(lots)
            .set({ coldStorageChargesPaid: newPaid.toString() })
            .where(eq(lots.id, lot.id));
          
          remainingAmount -= toApply;
        }
      }

      return { ...createdEntry, allocations, coldStoreAllocations };
    });
  }

  // Season Reset operations
  async checkRemainingBags(merchantId: number): Promise<{ hasRemaining: boolean; count: number; totalBags: number }> {
    // Check raw potato lots for remaining bags
    const lotsWithRemaining = await db.select()
      .from(lots)
      .where(and(
        eq(lots.merchantId, merchantId),
        gt(lots.remainingBags, 0)
      ));
    
    const totalBags = lotsWithRemaining.reduce((sum, lot) => sum + lot.remainingBags, 0);
    
    return {
      hasRemaining: lotsWithRemaining.length > 0,
      count: lotsWithRemaining.length,
      totalBags
    };
  }

  async checkSeedRemainingBags(merchantId: number): Promise<{ hasRemaining: boolean; count: number; totalBags: number }> {
    // Check seed lots for remaining bags
    const seedLotsWithRemaining = await db.select()
      .from(seedLots)
      .where(and(
        eq(seedLots.merchantId, merchantId),
        gt(seedLots.remainingBags, 0)
      ));
    
    const totalBags = seedLotsWithRemaining.reduce((sum, lot) => sum + lot.remainingBags, 0);
    
    return {
      hasRemaining: seedLotsWithRemaining.length > 0,
      count: seedLotsWithRemaining.length,
      totalBags
    };
  }

  async resetSeasonStockEntries(merchantId: number): Promise<void> {
    // Delete all raw potato stock entries (cascade deletes lots and bag breakdowns)
    await db.delete(stockEntries)
      .where(eq(stockEntries.merchantId, merchantId));
    
    // Delete all seed stock entries (cascade deletes seed lots)
    await db.delete(seedStockEntries)
      .where(eq(seedStockEntries.merchantId, merchantId));
  }

  async reverseCashEntry(cashEntryId: number, merchantId: number): Promise<CashEntry> {
    return await db.transaction(async (tx) => {
      // 1. Fetch the cash entry
      const [entry] = await tx.select().from(cashEntries)
        .where(and(eq(cashEntries.id, cashEntryId), eq(cashEntries.merchantId, merchantId)));
      
      if (!entry) {
        throw new Error("Cash entry not found");
      }
      
      if (entry.isReversed) {
        throw new Error("Cash entry is already reversed");
      }

      // 2. Get all allocations for this entry
      const entryAllocations = await tx.select().from(cashEntryAllocations)
        .where(eq(cashEntryAllocations.cashEntryId, cashEntryId));
      
      const coldStoreAllocs = await tx.select().from(coldStoreChargeAllocations)
        .where(eq(coldStoreChargeAllocations.cashEntryId, cashEntryId));

      const entryFarmerId = entry.farmerId || null;
      const normalizedFarmerName = entry.farmerName ? normalizeName(entry.farmerName) : null;
      const normalizedFarmerContact = entry.farmerContact ? normalizeName(entry.farmerContact) : null;
      const normalizedFarmerVillage = entry.farmerVillage ? normalizeName(entry.farmerVillage) : null;

      const matchesFarmerForReversal = (
        record: { farmerId?: number | null; farmerName: string; farmerContact?: string | null; village?: string | null }
      ) => {
        if (entryFarmerId) return record.farmerId === entryFarmerId;
        if (normalizeName(record.farmerName) !== normalizedFarmerName) return false;
        if (normalizeName(record.farmerContact) !== normalizedFarmerContact) return false;
        if (normalizeName(record.village) !== normalizedFarmerVillage) return false;
        return true;
      };

      // 4. Reverse allocations based on entry type
      
      // 4a. Reverse party payment allocations (buyer receipts for raw_potato)
      if (entry.direction === "inward" && entry.revenueType === "raw_potato") {
        let totalAllocated = 0;
        for (const alloc of entryAllocations) {
          const [txn] = await tx.select().from(transactions)
            .where(eq(transactions.id, alloc.transactionId));
          
          if (txn) {
            const appliedAmt = parseFloat(alloc.appliedAmount);
            const currentReceived = parseFloat(txn.amountReceived || "0");
            const newReceived = Math.max(0, currentReceived - appliedAmt);
            
            await tx.update(transactions)
              .set({ amountReceived: newReceived.toString() })
              .where(eq(transactions.id, txn.id));
            totalAllocated += appliedAmt;
          }
        }
        
        // Restore receivable: whatever was applied to receivables (total payment - allocations to transactions)
        const totalPayment = parseFloat(entry.amount);
        const receivableReduction = totalPayment - totalAllocated;
        if (receivableReduction > 0) {
          let buyerIdToRestore = entry.buyerId;
          if (!buyerIdToRestore && entry.partyName) {
            const allBuyers = await tx.select().from(buyers).where(eq(buyers.merchantId, merchantId));
            const matchedBuyer = allBuyers.find(b => normalizeName(b.name) === normalizeName(entry.partyName!));
            buyerIdToRestore = matchedBuyer?.id || null;
          }
          if (buyerIdToRestore) {
            const [buyer] = await tx.select().from(buyers).where(eq(buyers.id, buyerIdToRestore));
            if (buyer) {
              const currentReceivable = parseFloat(buyer.receivableBalance || "0");
              await tx.update(buyers)
                .set({ receivableBalance: (currentReceivable + receivableReduction).toFixed(2), updatedAt: new Date() })
                .where(eq(buyers.id, buyerIdToRestore));
            }
          }
        }
      }
      
      // 4b. Reverse seed sale inflow (add back dues to seedTransactions.totalDueToFarmer)
      if (entry.direction === "inward" && entry.revenueType === "seed_sale" && entry.farmerName) {
        const allSeedTxns = await tx.select().from(seedTransactions)
          .where(eq(seedTransactions.merchantId, merchantId))
          .orderBy(asc(seedTransactions.createdAt));
        
        const matchingTxns = allSeedTxns.filter(txn => matchesFarmerForReversal(txn));
        
        let amountToRestore = parseFloat(entry.amount);
        
        // Restore dues in reverse FIFO order (most recent first, distributed across transactions)
        for (const txn of matchingTxns.reverse()) {
          if (amountToRestore <= 0) break;
          
          // Calculate original total due for this transaction to determine max restoreable
          const originalDue = parseFloat(txn.totalRevenue || "0") + parseFloat(txn.transportCharges || "0") + parseFloat(txn.otherCharges || "0");
          const currentDue = parseFloat(txn.totalDueToFarmer || "0");
          
          // Max we can restore is originalDue - currentDue (what was already paid/reduced)
          const alreadyPaid = originalDue - currentDue;
          const toRestore = Math.min(amountToRestore, alreadyPaid);
          
          if (toRestore > 0) {
            const newDue = currentDue + toRestore;
            
            await tx.update(seedTransactions)
              .set({ totalDueToFarmer: newDue.toString() })
              .where(eq(seedTransactions.id, txn.id));
            
            amountToRestore -= toRestore;
          }
        }
        
        // Restore farmer receivable for any amount that was originally applied to pyReceivable
        if (amountToRestore > 0 && entryFarmerId) {
          const [farmer] = await tx.select().from(farmers).where(eq(farmers.id, entryFarmerId));
          if (farmer) {
            const currentPyReceivable = parseFloat(farmer.pyReceivable || "0");
            const currentFinal = parseFloat(farmer.pyReceivableFinalAmount || farmer.pyReceivable || "0");
            await tx.update(farmers)
              .set({ 
                pyReceivable: (currentPyReceivable + amountToRestore).toFixed(2),
                pyReceivableFinalAmount: (currentFinal + amountToRestore).toFixed(2),
              })
              .where(eq(farmers.id, entryFarmerId));
          }
        }
      }
      
      // 4c. Reverse farmer payment (reduces amountPaid on stock entries)
      if (entry.direction === "outflow" && entry.expenseType === "farmer" && entry.farmerName) {
        const farmerStockEntries = await tx.select().from(stockEntries)
          .where(eq(stockEntries.merchantId, merchantId))
          .orderBy(asc(stockEntries.createdAt));
        
        const matchingEntries = farmerStockEntries.filter(se => matchesFarmerForReversal(se));
        
        let amountToReverse = parseFloat(entry.amount);
        
        // Reverse from most recent entries first (reverse FIFO order)
        for (const se of matchingEntries.reverse()) {
          if (amountToReverse <= 0) break;
          
          const currentPaid = parseFloat(se.amountPaid || "0");
          if (currentPaid <= 0) continue;
          
          const toReverse = Math.min(amountToReverse, currentPaid);
          const newPaid = currentPaid - toReverse;
          const newStatus = newPaid <= 0 ? "due" : "partial";
          
          await tx.update(stockEntries)
            .set({ 
              amountPaid: newPaid.toString(),
              paymentStatus: newStatus
            })
            .where(eq(stockEntries.id, se.id));
          
          amountToReverse -= toReverse;
        }
      }
      
      // 4d. Reverse supplier payment (update seedStockEntries)
      if (entry.direction === "outflow" && entry.expenseType === "supplier" && entry.supplierName) {
        const normalizedSupplierName = normalizeName(entry.supplierName);
        
        const allSeedEntries = await tx.select().from(seedStockEntries)
          .where(eq(seedStockEntries.merchantId, merchantId))
          .orderBy(asc(seedStockEntries.createdAt));
        
        const matchingEntries = allSeedEntries.filter(se => 
          normalizeName(se.supplierName) === normalizedSupplierName
        );
        
        let amountToReverse = parseFloat(entry.amount);
        
        // Reverse from most recent entries first
        for (const se of matchingEntries.reverse()) {
          if (amountToReverse <= 0) break;
          
          const currentPaid = parseFloat(se.amountPaid || "0");
          if (currentPaid <= 0) continue;
          
          const toReverse = Math.min(amountToReverse, currentPaid);
          const newPaid = currentPaid - toReverse;
          const newStatus = newPaid <= 0 ? "due" : "partial";
          
          await tx.update(seedStockEntries)
            .set({ 
              amountPaid: newPaid.toString(),
              paymentStatus: newStatus
            })
            .where(eq(seedStockEntries.id, se.id));
          
          amountToReverse -= toReverse;
        }
      }
      
      // 4e. Reverse cold store charge allocations (only for cold_store_charge outflows)
      if (entry.direction === "outflow" && entry.expenseType === "cold_store_charge") {
        for (const alloc of coldStoreAllocs) {
          const [lot] = await tx.select().from(lots)
            .where(eq(lots.id, alloc.lotId));
          
          if (lot) {
            const currentPaid = parseFloat(lot.coldStorageChargesPaid || "0");
            const newPaid = Math.max(0, currentPaid - parseFloat(alloc.appliedAmount));
            
            await tx.update(lots)
              .set({ coldStorageChargesPaid: newPaid.toString() })
              .where(eq(lots.id, lot.id));
          }
        }
      }
      
      // 5. Mark the entry as reversed
      const [reversedEntry] = await tx.update(cashEntries)
        .set({ 
          isReversed: true, 
          reversedAt: new Date() 
        })
        .where(and(eq(cashEntries.id, cashEntryId), eq(cashEntries.merchantId, merchantId)))
        .returning();
      
      return reversedEntry;
    });
  }

  async searchFarmers(merchantId: number, query: string): Promise<{
    farmerName: string;
    farmerContact: string | null;
    village: string | null;
    tehsil: string | null;
    district: string;
    state: string;
    source: 'stock_entry' | 'seed_transaction';
  }[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    // Get farmers from the farmers table (Farmer Ledger - single source of truth)
    const farmerList = await db.select({
      name: farmers.name,
      contact: farmers.contact,
      village: farmers.village,
      tehsil: farmers.tehsil,
      district: farmers.district,
      state: farmers.state,
    })
    .from(farmers)
    .where(eq(farmers.merchantId, merchantId));

    // Filter by query matching any of name, contact, or village
    const results = farmerList.filter(farmer => {
      const nameMatch = farmer.name.toLowerCase().includes(normalizedQuery);
      const contactMatch = farmer.contact?.toLowerCase().includes(normalizedQuery);
      const villageMatch = farmer.village?.toLowerCase().includes(normalizedQuery);
      return nameMatch || contactMatch || villageMatch;
    });

    // Map to expected format and sort by farmer name
    return results
      .map(farmer => ({
        farmerName: farmer.name,
        farmerContact: farmer.contact,
        village: farmer.village,
        tehsil: farmer.tehsil,
        district: farmer.district || "",
        state: farmer.state || "",
        source: 'stock_entry' as const,
      }))
      .sort((a, b) => a.farmerName.localeCompare(b.farmerName));
  }

  async searchSuppliers(merchantId: number, query: string): Promise<{
    supplierName: string;
    supplierContact: string | null;
    address: string | null;
    district: string;
    state: string;
  }[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    // Get suppliers from seed stock entries
    const suppliers = await db.select({
      supplierName: seedStockEntries.supplierName,
      supplierContact: seedStockEntries.supplierContact,
      address: seedStockEntries.address,
      district: seedStockEntries.district,
      state: seedStockEntries.state,
    })
    .from(seedStockEntries)
    .where(eq(seedStockEntries.merchantId, merchantId));

    // Create a map to deduplicate suppliers by composite key (name + contact + address)
    const supplierMap = new Map<string, {
      supplierName: string;
      supplierContact: string | null;
      address: string | null;
      district: string;
      state: string;
    }>();

    for (const supplier of suppliers) {
      const key = `${(supplier.supplierName || '').toLowerCase().trim()}|${(supplier.supplierContact || '').toLowerCase().trim()}|${(supplier.address || '').toLowerCase().trim()}`;
      if (!supplierMap.has(key)) {
        supplierMap.set(key, {
          supplierName: supplier.supplierName,
          supplierContact: supplier.supplierContact,
          address: supplier.address,
          district: supplier.district,
          state: supplier.state,
        });
      }
    }

    // Filter by query matching name, contact, or address
    const results = Array.from(supplierMap.values()).filter(supplier => {
      const nameMatch = supplier.supplierName.toLowerCase().includes(normalizedQuery);
      const contactMatch = supplier.supplierContact?.toLowerCase().includes(normalizedQuery);
      const addressMatch = supplier.address?.toLowerCase().includes(normalizedQuery);
      return nameMatch || contactMatch || addressMatch;
    });

    // Sort by supplier name for consistent ordering
    return results.sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }

  async searchColdStores(merchantId: number, query: string): Promise<string[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    // Get cold store names from raw potato lots
    const rawLots = await db.select({
      coldStoreName: lots.coldStoreName,
    })
    .from(lots)
    .where(eq(lots.merchantId, merchantId));

    // Get cold store names from seed lots
    const seedLotsData = await db.select({
      coldStoreName: seedLots.coldStoreName,
    })
    .from(seedLots)
    .where(eq(seedLots.merchantId, merchantId));

    // Create a set to deduplicate cold store names
    const coldStoreSet = new Set<string>();

    for (const lot of rawLots) {
      if (lot.coldStoreName) {
        coldStoreSet.add(lot.coldStoreName);
      }
    }

    for (const lot of seedLotsData) {
      if (lot.coldStoreName) {
        coldStoreSet.add(lot.coldStoreName);
      }
    }

    // Filter by query and sort alphabetically
    const results = Array.from(coldStoreSet)
      .filter(name => name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.localeCompare(b));

    return results;
  }

  async searchSeedBrands(merchantId: number, query: string): Promise<string[]> {
    const normalizedQuery = query.trim().toLowerCase();

    // Get all brand names from seed lots for this merchant
    const seedLotsData = await db.select({
      brandName: seedLots.brandName,
    })
    .from(seedLots)
    .where(eq(seedLots.merchantId, merchantId));

    // Create a set to deduplicate brand names
    const brandSet = new Set<string>();

    for (const lot of seedLotsData) {
      if (lot.brandName) {
        brandSet.add(lot.brandName);
      }
    }

    // Filter by query (if any) and sort alphabetically
    let results = Array.from(brandSet).sort((a, b) => a.localeCompare(b));
    
    if (normalizedQuery) {
      results = results.filter(name => name.toLowerCase().includes(normalizedQuery));
    }

    return results;
  }
}

export const storage = new DatabaseStorage();
