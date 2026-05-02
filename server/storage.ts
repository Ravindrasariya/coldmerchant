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
  type Aadhat, type InsertAadhat, type AadhatEditHistory, type InsertAadhatEditHistory,
  aadhats, aadhatEditHistory,
  sundryPayStakeholders, sundryPayEditHistory,
  type SundryPayStakeholder, type InsertSundryPayStakeholder,
  type SundryPayEditHistory, type InsertSundryPayEditHistory,
  type SeedStockEntry, type InsertSeedStockEntry,
  type SeedLot, type InsertSeedLot,
  type SeedStockEntryWithLots,
  type SeedStockEntryEditHistory,
  type SeedTransaction, type InsertSeedTransaction,
  type SeedTransactionItem, type InsertSeedTransactionItem,
  type SeedTransactionWithItems,
  type SeedTransactionEditHistory,
  demoVideos, type DemoVideo, type InsertDemoVideo,
  aadhatPaymentAllocations, type AadhatPaymentAllocation,
  buyerPaymentAllocations, type BuyerPaymentAllocation, type InsertBuyerPaymentAllocation,
  assets, type Asset, type InsertAsset,
  assetDepreciationLog, type AssetDepreciationLog, type InsertAssetDepreciationLog,
  liabilities, type Liability, type InsertLiability,
  liabilityPayments, type LiabilityPayment, type InsertLiabilityPayment,
  coldStores, coldStoreEditHistory,
  type ColdStore, type InsertColdStore,
  type ColdStoreEditHistory as ColdStoreEditHistoryType, type InsertColdStoreEditHistory
} from "@shared/schema";
import { db } from "./db";
import { getISTDateString, getISTDateYYYYMMDD, getISTYear, dateDiffInDaysIST } from './ist-utils';
import { eq, and, or, desc, asc, sql, gt, ne, isNull, isNotNull, inArray } from "drizzle-orm";
import { computeNetWeight } from "@shared/utils";
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

// Thrown when the database-level unique constraint on
// (merchant_id, serial_number, year(purchase_date)) for stock_entries is
// violated. Routes catch this to surface a friendly 409 response.
export class DuplicateSerialNumberError extends Error {
  constructor(public serialNumber: number, public year: number) {
    super(`Sr# ${serialNumber} is already used in ${year}.`);
    this.name = 'DuplicateSerialNumberError';
  }
}

function isStockSerialYearUniqueViolation(error: any): boolean {
  return (
    error?.code === '23505' &&
    typeof error?.constraint === 'string' &&
    error.constraint === 'stock_entries_merchant_serial_year_unique'
  );
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
  createStockEntry(entry: InsertStockEntry & { merchantId: number; crop?: string; serialNumber?: number }): Promise<StockEntry>;
  updateStockEntry(id: number, merchantId: number, data: Partial<StockEntry>): Promise<StockEntry | undefined>;
  updateStockEntryImage(id: number, merchantId: number, filename: string | null): Promise<void>;
  getNextSerialNumber(merchantId: number, crop?: string): Promise<number>;
  getNextSerialNumberForYear(merchantId: number, year: number): Promise<number>;
  isSerialNumberTakenForYear(merchantId: number, serialNumber: number, year: number, excludeEntryId: number | null): Promise<boolean>;
  updateStockEntrySerialNumber(id: number, merchantId: number, newSerial: number): Promise<void>;
  
  // Lot operations
  createLot(lot: InsertLot): Promise<Lot>;
  updateLot(id: number, merchantId: number, data: Partial<Lot>): Promise<Lot | undefined>;
  getLotsByStockEntry(stockEntryId: number, merchantId: number): Promise<Lot[]>;
  getLotById(id: number, merchantId: number): Promise<Lot | undefined>;
  getAllLotsByMerchant(merchantId: number): Promise<Lot[]>;
  getAllSeedLotsByMerchant(merchantId: number): Promise<SeedLot[]>;
  getColdStoreChargeAllocationsByMerchant(merchantId: number): Promise<ColdStoreChargeAllocation[]>;
  
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
  createCashEntryAllocation(allocation: InsertCashEntryAllocation): Promise<CashEntryAllocation>;
  getPartiesWithDue(merchantId: number): Promise<{ partyName: string; partyAddress: string | null; totalDue: number; transactionCount: number }[]>;
  getFarmersWithDue(merchantId: number): Promise<{ farmerId: number | null; farmerName: string; farmerContact: string | null; village: string | null; totalDue: number; entryCount: number }[]>;
  getTransactionsWithDueByParty(merchantId: number, partyName: string, buyerId?: number | null): Promise<Transaction[]>;
  getColdStoresWithDue(merchantId: number): Promise<{ coldStoreName: string; coldStoreDbId: number | null; totalDue: number; lotCount: number }[]>;
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
  updateBuyerWithPropagation(id: number, merchantId: number, data: { name: string; address: string | null; mandiCode: string | null; contact: string | null }): Promise<{ buyer: Buyer | undefined; transactionsUpdated: number; partiesUpdated: number; cashEntriesUpdated: number }>;
  deleteBuyer(id: number, merchantId: number): Promise<void>;
  lookupOrCreateBuyer(merchantId: number, buyerData: { name: string; contact?: string | null; address?: string | null; mandiCode?: string | null }): Promise<{ buyerId: number; isNew: boolean }>;
  syncPartiesWithBuyers(merchantId: number): Promise<{ partiesLinked: number; buyersCreated: number }>;
  
  getBuyerByCompositeKey(merchantId: number, name: string, contact: string | null): Promise<Buyer | undefined>;
  mergeBuyers(merchantId: number, userId: number | null, sourceId: number, targetId: number): Promise<{ survivingBuyer: Buyer; mergedCount: number }>;
  
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
  
  // Aadhat Ledger operations
  getAadhatsByMerchant(merchantId: number): Promise<Aadhat[]>;
  getAadhatById(id: number, merchantId: number): Promise<Aadhat | undefined>;
  getMaxAadhatCodeSequence(merchantId: number, prefix: string): Promise<number>;
  createAadhat(aadhat: InsertAadhat): Promise<Aadhat>;
  updateAadhat(id: number, merchantId: number, data: Partial<Aadhat>): Promise<Aadhat | undefined>;
  getAadhatByCompositeKey(merchantId: number, name: string, contact: string | null): Promise<Aadhat | undefined>;
  mergeAadhats(merchantId: number, userId: number | null, sourceId: number, targetId: number): Promise<{ survivingAadhat: Aadhat; mergedCount: number }>;
  updateAadhatWithPropagation(id: number, merchantId: number, data: { name: string; address: string | null; contact: string | null }): Promise<{ aadhat: Aadhat | undefined; stockEntriesUpdated: number; cashEntriesUpdated: number }>;

  // Aadhat Edit History operations
  getAadhatEditHistory(aadhatId: number, merchantId: number): Promise<AadhatEditHistory[]>;
  getNextAadhatEditHistorySerialNumber(merchantId: number): Promise<number>;
  createAadhatEditHistory(data: InsertAadhatEditHistory): Promise<AadhatEditHistory>;

  // Sundry Pay Ledger operations
  getSundryPayByMerchant(merchantId: number): Promise<SundryPayStakeholder[]>;
  getSundryPayById(id: number, merchantId: number): Promise<SundryPayStakeholder | undefined>;
  getMaxSundryPayCodeSequence(merchantId: number, prefix: string): Promise<number>;
  createSundryPay(data: InsertSundryPayStakeholder): Promise<SundryPayStakeholder>;
  updateSundryPay(id: number, merchantId: number, data: Partial<SundryPayStakeholder>): Promise<SundryPayStakeholder | undefined>;
  getSundryPayByCompositeKey(merchantId: number, name: string, contact: string | null): Promise<SundryPayStakeholder | undefined>;
  updateSundryPayWithPropagation(id: number, merchantId: number, data: { name: string; address: string | null; contact: string | null }): Promise<{ stakeholder: SundryPayStakeholder | undefined; cashEntriesUpdated: number }>;
  getSundryPayEditHistory(stakeholderId: number, merchantId: number): Promise<SundryPayEditHistory[]>;
  getNextSundryPayEditHistorySerialNumber(merchantId: number): Promise<number>;
  createSundryPayEditHistory(data: InsertSundryPayEditHistory): Promise<SundryPayEditHistory>;

  // Cold Store Ledger operations
  getColdStoresByMerchant(merchantId: number): Promise<ColdStore[]>;
  getColdStoreById(id: number, merchantId: number): Promise<ColdStore | undefined>;
  getMaxColdStoreCodeSequence(merchantId: number, prefix: string): Promise<number>;
  createColdStore(coldStore: InsertColdStore): Promise<ColdStore>;
  updateColdStore(id: number, merchantId: number, data: Partial<ColdStore>): Promise<ColdStore | undefined>;
  getColdStoreByCompositeKey(merchantId: number, name: string): Promise<ColdStore | undefined>;
  mergeColdStores(merchantId: number, userId: number | null, sourceId: number, targetId: number): Promise<{ survivingColdStore: ColdStore; mergedCount: number }>;
  updateColdStoreWithPropagation(id: number, merchantId: number, data: { name: string; address: string | null; contact: string | null }): Promise<{ coldStore: ColdStore | undefined; lotsUpdated: number; seedLotsUpdated: number; cashEntriesUpdated: number }>;
  getColdStoreEditHistory(coldStoreId: number, merchantId: number): Promise<ColdStoreEditHistoryType[]>;
  getNextColdStoreEditHistorySerialNumber(merchantId: number): Promise<number>;
  createColdStoreEditHistory(data: InsertColdStoreEditHistory): Promise<ColdStoreEditHistoryType>;

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
  
  createCashEntry(entry: InsertCashEntry, applyFIFO: boolean, userId?: number, aadhatAllocations?: Array<{ stockEntryId?: number; isPyPayable?: boolean; amount: number; discountPercent: number; discountAmount: number; pettyAdjustment: number }>, buyerAllocations?: Array<{ transactionId?: number; isPyBalance?: boolean; amount: number; pettyAdjustment: number; transactionCode?: string }>, coldStoreAllocationsInput?: Array<{ lotId?: number; seedLotId?: number; isPyPayable?: boolean; amount: number; pettyAdjustment: number }>): Promise<CashEntry & { allocations: CashEntryAllocation[]; coldStoreAllocations?: ColdStoreChargeAllocation[] }>;
  
  // Season Reset operations
  checkRemainingBags(merchantId: number): Promise<{ hasRemaining: boolean; count: number; totalBags: number }>;
  checkSeedRemainingBags(merchantId: number): Promise<{ hasRemaining: boolean; count: number; totalBags: number }>;
  resetSeasonStockEntries(merchantId: number): Promise<void>;
  
  updateCashEntry(id: number, merchantId: number, data: Partial<CashEntry>): Promise<CashEntry | undefined>;
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
    redFlag: boolean | null;
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
  getDistinctVillages(merchantId: number): Promise<string[]>;
  getDistinctTehsils(merchantId: number): Promise<string[]>;
  searchColdStores(merchantId: number, query: string): Promise<{ id: number; name: string }[]>;
  
  // Brand name lookup operations (for autocomplete in seed lot forms)
  searchSeedBrands(merchantId: number, query: string): Promise<string[]>;

  // Demo Videos operations
  getDemoVideos(): Promise<DemoVideo[]>;
  getDemoVideoById(id: number): Promise<DemoVideo | undefined>;
  createDemoVideo(data: InsertDemoVideo): Promise<DemoVideo>;
  updateDemoVideoCaption(id: number, caption: string): Promise<DemoVideo | undefined>;
  deleteDemoVideo(id: number): Promise<void>;

  // Books: Asset operations
  getAssets(merchantId: number): Promise<Asset[]>;
  getAssetById(id: number, merchantId: number): Promise<Asset | undefined>;
  createAsset(data: InsertAsset): Promise<Asset>;
  updateAsset(id: number, merchantId: number, data: Partial<Asset>): Promise<Asset | undefined>;
  deleteAsset(id: number, merchantId: number): Promise<void>;
  getDepreciationLogs(merchantId: number, assetId?: number, financialYear?: string): Promise<AssetDepreciationLog[]>;
  createDepreciationLog(data: InsertAssetDepreciationLog): Promise<AssetDepreciationLog>;

  // Books: Liability operations
  getLiabilities(merchantId: number): Promise<Liability[]>;
  getLiabilityById(id: number, merchantId: number): Promise<Liability | undefined>;
  createLiability(data: InsertLiability): Promise<Liability>;
  updateLiability(id: number, merchantId: number, data: Partial<Liability>): Promise<Liability | undefined>;
  deleteLiability(id: number, merchantId: number): Promise<void>;
  getLiabilityPayments(liabilityId: number, merchantId: number): Promise<LiabilityPayment[]>;
  createLiabilityPayment(data: InsertLiabilityPayment): Promise<LiabilityPayment>;
  deleteLiabilityPayment(id: number, merchantId: number): Promise<void>;
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
    // Delete all merchant data in FK-safe order (children before parents)
    
    // 1. Asset & liability leaf tables
    await db.delete(assetDepreciationLog).where(eq(assetDepreciationLog.merchantId, id));
    await db.delete(liabilityPayments).where(eq(liabilityPayments.merchantId, id));
    
    // 2. Cash entry allocations (reference cash_entries, transactions, lots, stock_entries)
    await db.delete(aadhatPaymentAllocations).where(eq(aadhatPaymentAllocations.merchantId, id));
    await db.delete(buyerPaymentAllocations).where(eq(buyerPaymentAllocations.merchantId, id));
    await db.delete(cashEntryAllocations).where(eq(cashEntryAllocations.merchantId, id));
    await db.delete(coldStoreChargeAllocations).where(eq(coldStoreChargeAllocations.merchantId, id));
    
    // 3. All edit histories (reference main tables and users)
    await db.delete(aadhatEditHistory).where(eq(aadhatEditHistory.merchantId, id));
    await db.delete(buyerEditHistory).where(eq(buyerEditHistory.merchantId, id));
    await db.delete(farmerEditHistory).where(eq(farmerEditHistory.merchantId, id));
    await db.delete(stockEntryEditHistory).where(eq(stockEntryEditHistory.merchantId, id));
    await db.delete(transactionEditHistory).where(eq(transactionEditHistory.merchantId, id));
    await db.delete(seedStockEntryEditHistory).where(eq(seedStockEntryEditHistory.merchantId, id));
    await db.delete(seedTransactionEditHistory).where(eq(seedTransactionEditHistory.merchantId, id));
    
    // 4. Transaction items (reference transactions, lots, bag_breakdowns, seed_lots)
    await db.delete(transactionItems).where(eq(transactionItems.merchantId, id));
    await db.delete(seedTransactionItems).where(eq(seedTransactionItems.merchantId, id));
    
    // 5. Bag breakdowns (reference lots)
    await db.delete(bagBreakdowns).where(eq(bagBreakdowns.merchantId, id));
    
    // 6. Lots (reference stock_entries, seed_stock_entries)
    await db.delete(lots).where(eq(lots.merchantId, id));
    await db.delete(seedLots).where(eq(seedLots.merchantId, id));
    
    // 7. Transactions (reference buyers, farmers)
    await db.delete(transactions).where(eq(transactions.merchantId, id));
    await db.delete(seedTransactions).where(eq(seedTransactions.merchantId, id));
    
    // 8. Stock entries (reference farmers, aadhats)
    await db.delete(stockEntries).where(eq(stockEntries.merchantId, id));
    await db.delete(seedStockEntries).where(eq(seedStockEntries.merchantId, id));
    
    // 9. Cash entries (reference farmers, buyers, aadhats)
    await db.delete(cashEntries).where(eq(cashEntries.merchantId, id));
    
    // 10. Junction/reference tables (reference buyers, farmers)
    await db.delete(cashFarmers).where(eq(cashFarmers.merchantId, id));
    await db.delete(parties).where(eq(parties.merchantId, id));
    
    // 11. Core entity tables
    await db.delete(assets).where(eq(assets.merchantId, id));
    await db.delete(liabilities).where(eq(liabilities.merchantId, id));
    await db.delete(buyers).where(eq(buyers.merchantId, id));
    await db.delete(farmers).where(eq(farmers.merchantId, id));
    await db.delete(aadhats).where(eq(aadhats.merchantId, id));
    
    // 12. Settings
    await db.delete(cashSettings).where(eq(cashSettings.merchantId, id));
    await db.delete(bankAccounts).where(eq(bankAccounts.merchantId, id));
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
          .where(and(eq(bagBreakdowns.lotId, lot.id), eq(bagBreakdowns.merchantId, merchantId)))
          .orderBy(asc(bagBreakdowns.sortOrder), asc(bagBreakdowns.id));
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
        .where(and(eq(bagBreakdowns.lotId, lot.id), eq(bagBreakdowns.merchantId, merchantId)))
        .orderBy(asc(bagBreakdowns.sortOrder), asc(bagBreakdowns.id));
      return { ...lot, bagBreakdowns: breakdowns };
    }));

    return { ...entry, lots: lotsWithBreakdowns };
  }

  async createStockEntry(entry: Omit<InsertStockEntry, 'uniqueId'> & { merchantId: number; crop?: string; serialNumber?: number }): Promise<StockEntry> {
    const crop = entry.crop || "potato";
    const { serialNumber: providedSerial, ...entryRest } = entry;
    // Auto-assigned Sr# is scoped per merchant + per calendar year of
    // purchase_date (matches the "next serial" preview shown on the form).
    // Fall back to current IST year only if purchaseDate is missing.
    const autoYear = entry.purchaseDate
      ? new Date(entry.purchaseDate).getFullYear()
      : getISTYear();
    // Use purchaseDate for unique ID generation (not current date)
    const purchaseDateForId = entry.purchaseDate ? new Date(entry.purchaseDate) : undefined;
    const dateStr = formatDateYYYYMMDD(purchaseDateForId);

    // Retry loop handles BOTH:
    //   1. Concurrent unique_id collisions (sequence race), and
    //   2. Concurrent (merchant, serial, year) collisions when Sr# is
    //      auto-assigned — the DB-level unique index now blocks these so we
    //      recompute the next serial and try again.
    // When the caller explicitly provided a Sr#, a DB-level conflict is
    // surfaced as DuplicateSerialNumberError instead of being retried.
    const maxRetries = 5;
    let serialNumber = providedSerial != null
      ? providedSerial
      : await this.getNextSerialNumberForYear(entry.merchantId, autoYear);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const uniqueId = await generateUniqueId("HSE", dateStr, stockEntries, stockEntries.uniqueId, attempt);
      try {
        const [created] = await db.insert(stockEntries).values({
          ...entryRest,
          crop,
          serialNumber,
          uniqueId,
        }).returning();
        return created;
      } catch (error: any) {
        if (isStockSerialYearUniqueViolation(error)) {
          if (providedSerial != null) {
            // Explicit user override lost a race against another insert.
            throw new DuplicateSerialNumberError(serialNumber, autoYear);
          }
          if (attempt < maxRetries - 1) {
            // Auto-assigned: recompute next serial and try again.
            serialNumber = await this.getNextSerialNumberForYear(entry.merchantId, autoYear);
            continue;
          }
          throw new DuplicateSerialNumberError(serialNumber, autoYear);
        }
        if (error?.code === '23505' && error?.constraint?.includes('unique_id') && attempt < maxRetries - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("Failed to insert stock entry after multiple attempts");
  }

  async updateStockEntry(id: number, merchantId: number, data: Partial<StockEntry>): Promise<StockEntry | undefined> {
    const [updated] = await db.update(stockEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(stockEntries.id, id), eq(stockEntries.merchantId, merchantId)))
      .returning();
    return updated || undefined;
  }

  async updateStockEntryImage(id: number, merchantId: number, filename: string | null): Promise<void> {
    await db.update(stockEntries)
      .set({ attachmentImage: filename, updatedAt: new Date() })
      .where(and(eq(stockEntries.id, id), eq(stockEntries.merchantId, merchantId)));
  }

  async getNextSerialNumber(merchantId: number, crop?: string): Promise<number> {
    const currentYear = getISTYear();
    const [result] = await db.select({ maxSerial: stockEntries.serialNumber })
      .from(stockEntries)
      .where(and(
        eq(stockEntries.merchantId, merchantId),
        sql`EXTRACT(YEAR FROM ${stockEntries.purchaseDate}) = ${currentYear}`
      ))
      .orderBy(desc(stockEntries.serialNumber))
      .limit(1);
    
    return (result?.maxSerial || 0) + 1;
  }

  async getNextSerialNumberForYear(merchantId: number, year: number): Promise<number> {
    const [result] = await db.select({ maxSerial: stockEntries.serialNumber })
      .from(stockEntries)
      .where(and(
        eq(stockEntries.merchantId, merchantId),
        sql`EXTRACT(YEAR FROM ${stockEntries.purchaseDate}) = ${year}`
      ))
      .orderBy(desc(stockEntries.serialNumber))
      .limit(1);

    return (result?.maxSerial || 0) + 1;
  }

  async isSerialNumberTakenForYear(merchantId: number, serialNumber: number, year: number, excludeEntryId: number | null): Promise<boolean> {
    const conditions = [
      eq(stockEntries.merchantId, merchantId),
      eq(stockEntries.serialNumber, serialNumber),
      sql`EXTRACT(YEAR FROM ${stockEntries.purchaseDate}) = ${year}`,
    ];
    if (excludeEntryId !== null) {
      conditions.push(ne(stockEntries.id, excludeEntryId));
    }

    const [match] = await db.select({ id: stockEntries.id })
      .from(stockEntries)
      .where(and(...conditions))
      .limit(1);

    return !!match;
  }

  async updateStockEntrySerialNumber(id: number, merchantId: number, newSerial: number): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await tx.update(stockEntries)
          .set({ serialNumber: newSerial, updatedAt: new Date() })
          .where(and(eq(stockEntries.id, id), eq(stockEntries.merchantId, merchantId)));

        // Cascade: transaction_items.serial_number is a cached snapshot of stock_entries.serial_number
        await tx.update(transactionItems)
          .set({ serialNumber: newSerial })
          .where(and(
            eq(transactionItems.merchantId, merchantId),
            inArray(
              transactionItems.lotId,
              tx.select({ id: lots.id })
                .from(lots)
                .where(and(eq(lots.stockEntryId, id), eq(lots.merchantId, merchantId)))
            )
          ));
      });
    } catch (error: any) {
      if (isStockSerialYearUniqueViolation(error)) {
        // Look up the year from the existing entry so the friendly message
        // matches the application-level guard wording.
        const [existing] = await db.select({ purchaseDate: stockEntries.purchaseDate })
          .from(stockEntries)
          .where(and(eq(stockEntries.id, id), eq(stockEntries.merchantId, merchantId)));
        const year = existing?.purchaseDate
          ? new Date(existing.purchaseDate).getFullYear()
          : getISTYear();
        throw new DuplicateSerialNumberError(newSerial, year);
      }
      throw error;
    }
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

  async getAllSeedLotsByMerchant(merchantId: number): Promise<SeedLot[]> {
    return await db.select().from(seedLots).where(eq(seedLots.merchantId, merchantId));
  }

  async getColdStoreChargeAllocationsByMerchant(merchantId: number): Promise<ColdStoreChargeAllocation[]> {
    return await db.select().from(coldStoreChargeAllocations).where(eq(coldStoreChargeAllocations.merchantId, merchantId));
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
      .where(and(eq(bagBreakdowns.lotId, lotId), eq(bagBreakdowns.merchantId, merchantId)))
      .orderBy(asc(bagBreakdowns.sortOrder), asc(bagBreakdowns.id));
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
            return { ...item, place: lot[0].place, farmerName: entry[0].farmerName, farmerVillage: entry[0].village ?? undefined };
          }
          return { ...item, place: lot[0].place, farmerName: undefined, farmerVillage: undefined };
        }
        return { ...item, place: undefined, farmerName: undefined, farmerVillage: undefined };
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

  async getNextTransactionNumber(merchantId: number, crop?: string): Promise<number> {
    const currentYear = getISTYear();
    const [result] = await db.select()
      .from(transactions)
      .where(and(
        eq(transactions.merchantId, merchantId),
        sql`EXTRACT(YEAR FROM ${transactions.createdAt}) = ${currentYear}`
      ))
      .orderBy(desc(transactions.transactionNumber))
      .limit(1);
    
    return result ? result.transactionNumber + 1 : 1;
  }

  computeProportionateNetWeight(lot: any, breakdowns: any[], breakdownId: number | null, bagsMoved: number): number {
    if (breakdownId) {
      const bd = breakdowns.find((b: any) => b.id === breakdownId);
      if (bd) {
        const weight = bd.weight ? parseFloat(bd.weight) : (lot.totalWeight ? parseFloat(lot.totalWeight) : 0);
        const bags = bd.numberOfBags || 0;
        const netWeight = computeNetWeight(weight, bags, lot.place);
        return bags > 0 ? (bagsMoved / bags) * netWeight : 0;
      }
    }
    const weight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
    const bags = lot.originalBags || 0;
    const netWeight = computeNetWeight(weight, bags, lot.place);
    return bags > 0 ? (bagsMoved / bags) * netWeight : 0;
  }

  computeBreakdownCosts(lot: any, breakdowns: any[]): { breakdownCosts: Map<number | null, number>, totalCogs: number } {
    const result = new Map<number | null, number>();
    if (lot.originalBags <= 0) return { breakdownCosts: result, totalCogs: 0 };

    const place = lot.place || "cold_store";
    const wastageBags = breakdowns
      .filter((bd: any) => bd.size === "Wastage")
      .reduce((sum: number, bd: any) => sum + (bd.numberOfBags || 0), 0);
    const actualSellableBags = lot.originalBags - wastageBags;

    const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
    const coldStoreCharges = (lot.charges || [])
      .filter((c: any) => c && coldStoreTypes.includes(c.type))
      .reduce((sum: number, c: any) => sum + (parseFloat(String(c.amount)) || 0), 0);

    const sellableBreakdowns = breakdowns.filter((bd: any) => bd.size !== "Wastage");
    const hasBreakdownData = sellableBreakdowns.some((bd: any) => {
      const w = bd.weight ? parseFloat(bd.weight) : 0;
      const p = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
      return w > 0 && p > 0;
    });

    if (hasBreakdownData && breakdowns.length > 0) {
      const mandiPct = lot.mandiCommissionPercent ? parseFloat(lot.mandiCommissionPercent) : 0;
      const aadhatPct = lot.aadhatCommissionPercent ? parseFloat(lot.aadhatCommissionPercent) : 0;
      const hammaliRate = lot.hammaliPerBag ? parseFloat(lot.hammaliPerBag) : 0;

      let totalCogs = 0;
      for (const bd of breakdowns) {
        const bags = bd.numberOfBags || 0;
        if (bags <= 0) { result.set(bd.id, 0); continue; }

        const weight = bd.weight ? parseFloat(bd.weight) : 0;
        const price = bd.pricePerKg ? parseFloat(bd.pricePerKg) : 0;
        const netWeight = computeNetWeight(weight, bags, place);
        const rowTotal = (netWeight > 0 && price > 0) ? netWeight * price : 0;
        const isWastage = bd.size === "Wastage";

        let cpb: number;
        if (isWastage) {
          cpb = rowTotal > 0 ? rowTotal / bags : 0;
        } else if (place === "mandi") {
          const rowCharges = rowTotal * (mandiPct + aadhatPct) / 100;
          cpb = (rowTotal / bags) + (rowCharges / bags) + hammaliRate;
        } else if (place === "farm_gate") {
          const coldShare = actualSellableBags > 0 ? coldStoreCharges / actualSellableBags : 0;
          cpb = (rowTotal / bags) + coldShare;
        } else {
          cpb = rowTotal / bags;
        }
        result.set(bd.id, cpb);
        totalCogs += cpb * bags;
      }
      return { breakdownCosts: result, totalCogs };
    } else {
      const lotTotalWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
      const price = lot.pricePerKg ? parseFloat(lot.pricePerKg) : 0;
      const netWeight = computeNetWeight(lotTotalWeight, lot.originalBags, place);
      const totalPayable = (netWeight > 0 && price > 0) ? netWeight * price : 0;

      let cpb: number;
      if (place === "farm_gate") {
        cpb = actualSellableBags > 0 ? (totalPayable + coldStoreCharges) / actualSellableBags : 0;
      } else if (place === "mandi") {
        const lotNp = lot.netPayable ? parseFloat(lot.netPayable) : totalPayable;
        cpb = actualSellableBags > 0 ? lotNp / actualSellableBags : 0;
      } else {
        cpb = actualSellableBags > 0 ? totalPayable / actualSellableBags : 0;
      }
      result.set(null, cpb);
      return { breakdownCosts: result, totalCogs: cpb * Math.max(actualSellableBags, 0) };
    }
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
      
      const { breakdownCosts } = this.computeBreakdownCosts(lot, breakdowns);
      
      const mandiCharges = {
        mandiCommissionPercent: lot.mandiCommissionPercent || null,
        aadhatCommissionPercent: lot.aadhatCommissionPercent || null,
        hammaliPerBag: lot.hammaliPerBag || null,
        mandiExtraCharges: lot.mandiExtraCharges || null,
      };

      if (breakdowns.length > 0) {
        for (const breakdown of breakdowns) {
          if (breakdown.size === "Wastage") continue;
          
          const availableBags = breakdown.remainingBags ?? breakdown.numberOfBags ?? 0;
          if (availableBags <= 0) continue;
          
          const bdWeight = breakdown.weight ? parseFloat(breakdown.weight) : (lot.totalWeight ? parseFloat(lot.totalWeight) : 0);
          const bdBags = breakdown.numberOfBags || 0;
          const bdNetWeight = computeNetWeight(bdWeight, bdBags, lot.place);
          results.push({
            breakdownId: breakdown.id,
            lotId: lot.id,
            serialNumber: entry?.serialNumber || 0,
            crop: lot.crop || "potato",
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
            netWeight: bdNetWeight,
            breakdownWeight: breakdown.weight || null,
            costPerBag: breakdownCosts.get(breakdown.id) || 0,
            ...mandiCharges,
          });
        }
      } else {
        if (lot.remainingBags > 0) {
          const lotWeight = lot.totalWeight ? parseFloat(lot.totalWeight) : 0;
          const lotBags = lot.originalBags || 0;
          const lotNetWeight = computeNetWeight(lotWeight, lotBags, lot.place);
          results.push({
            breakdownId: null,
            lotId: lot.id,
            serialNumber: entry?.serialNumber || 0,
            crop: lot.crop || "potato",
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
            netWeight: lotNetWeight,
            breakdownWeight: null,
            costPerBag: breakdownCosts.get(null) || 0,
            ...mandiCharges,
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
    
    const enrichedItems = await Promise.all(items.map(async (item) => {
      const lot = await db.select().from(lots).where(and(eq(lots.id, item.lotId), eq(lots.merchantId, merchantId))).limit(1);
      let lotSourceWeight = 0;
      let lotSourceBags = 0;
      if (lot.length > 0) {
        if (item.breakdownId) {
          const [bd] = await db.select().from(bagBreakdowns).where(and(eq(bagBreakdowns.id, item.breakdownId), eq(bagBreakdowns.merchantId, merchantId))).limit(1);
          if (bd) {
            lotSourceWeight = bd.weight ? parseFloat(bd.weight) : (lot[0].totalWeight ? parseFloat(lot[0].totalWeight) : 0);
            lotSourceBags = bd.numberOfBags || 0;
          }
        }
        if (lotSourceBags === 0) {
          lotSourceWeight = lot[0].totalWeight ? parseFloat(lot[0].totalWeight) : 0;
          lotSourceBags = lot[0].originalBags || 0;
        }
      }
      return {
        ...item,
        place: lot.length > 0 ? lot[0].place : undefined,
        lotSourceWeight,
        lotSourceBags,
        mandiCommissionPercent: lot.length > 0 ? (lot[0].mandiCommissionPercent || null) : null,
        aadhatCommissionPercent: lot.length > 0 ? (lot[0].aadhatCommissionPercent || null) : null,
        hammaliPerBag: lot.length > 0 ? (lot[0].hammaliPerBag || null) : null,
        mandiExtraCharges: lot.length > 0 ? (lot[0].mandiExtraCharges || null) : null,
        lotOriginalBags: lot.length > 0 ? (lot[0].originalBags || 0) : 0,
      };
    }));
    
    return { ...txn, items: enrichedItems };
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
        const maxBags = breakdown.numberOfBags ?? currentRemaining;
        const newRemaining = Math.min(maxBags, Math.max(0, currentRemaining + bagsDelta));
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
        const newRemaining = Math.min(lot.originalBags, Math.max(0, lot.remainingBags + bagsDelta));
        await this.updateLot(lotId, merchantId, { remainingBags: newRemaining });
      }
    }
  }

  // Cash Entry operations
  async getCashEntriesByMerchant(merchantId: number): Promise<(CashEntry & { allocations: CashEntryAllocation[]; aadhatAllocations: any[]; buyerAllocations: any[]; coldStoreAllocations: any[] })[]> {
    const entries = await db.select().from(cashEntries)
      .where(eq(cashEntries.merchantId, merchantId))
      .orderBy(desc(cashEntries.createdAt));
    
    const allAadhatAllocs = entries.length > 0
      ? await db.select({
          id: aadhatPaymentAllocations.id,
          cashEntryId: aadhatPaymentAllocations.cashEntryId,
          stockEntryId: aadhatPaymentAllocations.stockEntryId,
          appliedAmount: aadhatPaymentAllocations.appliedAmount,
          discountPercent: aadhatPaymentAllocations.discountPercent,
          discountAmount: aadhatPaymentAllocations.discountAmount,
          pettyAdjustment: aadhatPaymentAllocations.pettyAdjustment,
          isPyPayable: aadhatPaymentAllocations.isPyPayable,
          serialNumber: stockEntries.serialNumber,
        })
        .from(aadhatPaymentAllocations)
        .leftJoin(stockEntries, eq(aadhatPaymentAllocations.stockEntryId, stockEntries.id))
        .where(eq(aadhatPaymentAllocations.merchantId, merchantId))
      : [];

    const allBuyerAllocs = entries.length > 0
      ? await db.select().from(buyerPaymentAllocations)
          .where(eq(buyerPaymentAllocations.merchantId, merchantId))
      : [];

    const allColdStoreAllocs = entries.length > 0
      ? await db.select({
          id: coldStoreChargeAllocations.id,
          cashEntryId: coldStoreChargeAllocations.cashEntryId,
          lotId: coldStoreChargeAllocations.lotId,
          seedLotId: coldStoreChargeAllocations.seedLotId,
          coldStoreId: coldStoreChargeAllocations.coldStoreId,
          appliedAmount: coldStoreChargeAllocations.appliedAmount,
          pettyAdjustment: coldStoreChargeAllocations.pettyAdjustment,
          isPyPayable: coldStoreChargeAllocations.isPyPayable,
        })
        .from(coldStoreChargeAllocations)
        .where(eq(coldStoreChargeAllocations.merchantId, merchantId))
      : [];

    const aadhatAllocsByEntry = new Map<number, any[]>();
    for (const alloc of allAadhatAllocs) {
      const list = aadhatAllocsByEntry.get(alloc.cashEntryId) || [];
      list.push(alloc);
      aadhatAllocsByEntry.set(alloc.cashEntryId, list);
    }

    const buyerAllocsByEntry = new Map<number, any[]>();
    for (const alloc of allBuyerAllocs) {
      const list = buyerAllocsByEntry.get(alloc.cashEntryId) || [];
      list.push(alloc);
      buyerAllocsByEntry.set(alloc.cashEntryId, list);
    }

    const coldStoreAllocsByEntry = new Map<number, any[]>();
    for (const alloc of allColdStoreAllocs) {
      const list = coldStoreAllocsByEntry.get(alloc.cashEntryId) || [];
      list.push(alloc);
      coldStoreAllocsByEntry.set(alloc.cashEntryId, list);
    }

    const result = await Promise.all(entries.map(async (entry) => {
      const allocations = await db.select().from(cashEntryAllocations)
        .where(eq(cashEntryAllocations.cashEntryId, entry.id));
      const aadhatAllocations = aadhatAllocsByEntry.get(entry.id) || [];
      const buyerAllocations = buyerAllocsByEntry.get(entry.id) || [];
      const coldStoreAllocations = coldStoreAllocsByEntry.get(entry.id) || [];
      return { ...entry, allocations, aadhatAllocations, buyerAllocations, coldStoreAllocations };
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

  async getFarmersWithDue(merchantId: number): Promise<{ farmerId: number | null; farmerName: string; farmerContact: string | null; village: string | null; totalDue: number; entryCount: number }[]> {
    // Get stock entries with payment status "due" or "partial" 
    const entries = await db.select().from(stockEntries)
      .where(and(
        eq(stockEntries.merchantId, merchantId),
        or(eq(stockEntries.paymentStatus, "due"), eq(stockEntries.paymentStatus, "partial"))
      ));
    
    // Group by farmerId (primary) or composite key name+contact+village (fallback)
    const farmerMap = new Map<string, { farmerId: number | null; displayName: string; farmerContact: string | null; village: string | null; totalDue: number; entryCount: number }>();
    
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
          farmerId: entry.farmerId || null,
          displayName: entry.farmerName.trim(),
          farmerContact: entry.farmerContact || null,
          village: entry.village,
          totalDue: entryDue,
          entryCount: 1,
        });
      }
    }
    
    return Array.from(farmerMap.entries()).map(([_, data]) => ({
      farmerId: data.farmerId,
      farmerName: data.displayName,
      farmerContact: data.farmerContact,
      village: data.village,
      totalDue: data.totalDue,
      entryCount: data.entryCount,
    }));
  }

  async getColdStoresWithDue(merchantId: number): Promise<{ coldStoreName: string; coldStoreDbId: number | null; totalDue: number; lotCount: number }[]> {
    const [allHarvestLots, allSeedLots, allColdStores, allAllocations, allCashEntries] = await Promise.all([
      db.select().from(lots).where(eq(lots.merchantId, merchantId)),
      db.select().from(seedLots).where(eq(seedLots.merchantId, merchantId)),
      db.select().from(coldStores).where(eq(coldStores.merchantId, merchantId)),
      db.select().from(coldStoreChargeAllocations).where(eq(coldStoreChargeAllocations.merchantId, merchantId)),
      db.select({ id: cashEntries.id, isReversed: cashEntries.isReversed }).from(cashEntries).where(eq(cashEntries.merchantId, merchantId)),
    ]);
    
    const reversedEntryIds = new Set(allCashEntries.filter(e => e.isReversed).map(e => e.id));
    
    const farmGatePaidMap = new Map<string, number>();
    for (const alloc of allAllocations) {
      if (reversedEntryIds.has(alloc.cashEntryId)) continue;
      if (alloc.lotId && alloc.coldStoreId) {
        const key = `${alloc.lotId}-${alloc.coldStoreId}`;
        farmGatePaidMap.set(key, (farmGatePaidMap.get(key) || 0) + parseFloat(alloc.appliedAmount || "0"));
      }
    }
    
    const getColdStoreChargesFromArray = (charges: unknown): number => {
      if (!Array.isArray(charges)) return 0;
      const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
      return charges
        .filter((c: any) => c && coldStoreTypes.includes(c.type))
        .reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
    };
    
    const coldStoreMap = new Map<number, { displayName: string; coldStoreDbId: number; totalDue: number; lotCount: number }>();
    
    const csNameMap = new Map<number, string>();
    for (const cs of allColdStores) {
      csNameMap.set(cs.id, cs.name);
      coldStoreMap.set(cs.id, { displayName: cs.name, coldStoreDbId: cs.id, totalDue: parseFloat(cs.pyPayable || "0"), lotCount: 0 });
    }
    
    for (const lot of allHarvestLots) {
      if (lot.coldStoreDbId) {
        const totalCharges = getColdStoreChargesFromArray(lot.charges);
        if (totalCharges <= 0) continue;
        const paidAmount = parseFloat(lot.coldStorageChargesPaid || "0");
        const due = totalCharges - paidAmount;
        if (due <= 0) continue;
        const existing = coldStoreMap.get(lot.coldStoreDbId);
        if (existing) {
          existing.totalDue += due;
          existing.lotCount += 1;
        }
      } else if (lot.place === "farm_gate" && Array.isArray(lot.charges)) {
        const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
        const csChargeMap = new Map<number, number>();
        for (const charge of lot.charges as any[]) {
          if (!charge || !coldStoreTypes.includes(charge.type) || !charge.coldStoreDbId) continue;
          const chargeAmount = parseFloat(charge.amount) || 0;
          if (chargeAmount <= 0) continue;
          csChargeMap.set(charge.coldStoreDbId, (csChargeMap.get(charge.coldStoreDbId) || 0) + chargeAmount);
        }
        for (const [csId, totalCharge] of csChargeMap) {
          const paidKey = `${lot.id}-${csId}`;
          const paidAmount = farmGatePaidMap.get(paidKey) || 0;
          const due = totalCharge - paidAmount;
          if (due <= 0) continue;
          const existing = coldStoreMap.get(csId);
          if (existing) {
            existing.totalDue += due;
            existing.lotCount += 1;
          }
        }
      }
    }
    
    for (const sLot of allSeedLots) {
      if (!sLot.coldStoreDbId) continue;
      const chargesPerBag = parseFloat(sLot.coldStoreChargesPerBag || "0");
      const totalCharges = chargesPerBag * (sLot.originalBags || 0);
      if (totalCharges <= 0) continue;
      const paidAmount = parseFloat(sLot.coldStoreChargesPaid || "0");
      const due = totalCharges - paidAmount;
      if (due <= 0) continue;
      const existing = coldStoreMap.get(sLot.coldStoreDbId);
      if (existing) {
        existing.totalDue += due;
        existing.lotCount += 1;
      }
    }
    
    return Array.from(coldStoreMap.values())
      .filter(data => data.totalDue > 0)
      .map(data => ({
        coldStoreName: data.displayName,
        coldStoreDbId: data.coldStoreDbId,
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
    
    // Add receivables from farmer ledger (remainingReceivable = finalAmount minus payments)
    for (const farmerRecord of allFarmerRecords) {
      const receivables = parseFloat(farmerRecord.remainingReceivable || "0");
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
        
        // STEP 1: First reduce farmer's remainingReceivable in farmer ledger
        // Only remainingReceivable is reduced by payments (pyReceivable and pyReceivableFinalAmount stay unchanged)
        if (matchedFarmerId && remainingAmount > 0) {
          const [matchedFarmer] = await tx.select().from(farmers).where(eq(farmers.id, matchedFarmerId));
          if (matchedFarmer) {
            const currentRemaining = parseFloat(matchedFarmer.remainingReceivable || "0");
            if (currentRemaining > 0) {
              const toApply = Math.min(remainingAmount, currentRemaining);
              const newRemaining = currentRemaining - toApply;
              await tx.update(farmers)
                .set({ 
                  remainingReceivable: newRemaining > 0 ? newRemaining.toFixed(2) : "0.00",
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
      if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "cold_store_charge" && (entry.coldStoreDbId || entry.coldStoreName)) {
        let remainingAmount = parseFloat(entry.amount);

        if (remainingAmount > 0 && entry.coldStoreDbId) {
          const [coldStoreRecord] = await tx.select().from(coldStores)
            .where(and(eq(coldStores.id, entry.coldStoreDbId), eq(coldStores.merchantId, entry.merchantId)));

          if (coldStoreRecord) {
            const currentPyPayable = parseFloat(coldStoreRecord.pyPayable || "0");
            if (currentPyPayable > 0) {
              const toApplyPy = Math.min(remainingAmount, currentPyPayable);

              const [pyAllocation] = await tx.insert(coldStoreChargeAllocations).values({
                cashEntryId: createdEntry.id,
                coldStoreId: coldStoreRecord.id,
                merchantId: entry.merchantId,
                appliedAmount: toApplyPy.toString(),
              }).returning();

              coldStoreAllocations.push(pyAllocation);

              const newPyPayable = currentPyPayable - toApplyPy;
              await tx.update(coldStores)
                .set({ pyPayable: newPyPayable.toFixed(2), updatedAt: new Date() })
                .where(eq(coldStores.id, coldStoreRecord.id));

              remainingAmount -= toApplyPy;
            }
          }
        }
        
        const allLots = await tx.select().from(lots)
          .where(eq(lots.merchantId, entry.merchantId))
          .orderBy(asc(lots.createdAt));
        
        const getColdStoreChargesFromArray = (charges: unknown): number => {
          if (!Array.isArray(charges)) return 0;
          const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
          return charges
            .filter((c: any) => c && coldStoreTypes.includes(c.type))
            .reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
        };
        
        const getColdStoreChargesForCS = (charges: unknown, coldStoreDbId: number | null): number => {
          if (!Array.isArray(charges)) return 0;
          const coldStoreTypes = ["Cold Charges", "Ware House Charges"];
          return charges
            .filter((c: any) => c && coldStoreTypes.includes(c.type) && c.coldStoreDbId === coldStoreDbId)
            .reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
        };

        const existingAllocations = await tx.select().from(coldStoreChargeAllocations)
          .where(eq(coldStoreChargeAllocations.merchantId, entry.merchantId));
        const existingCashEntries = await tx.select({ id: cashEntries.id, isReversed: cashEntries.isReversed })
          .from(cashEntries).where(eq(cashEntries.merchantId, entry.merchantId));
        const reversedIds = new Set(existingCashEntries.filter(e => e.isReversed).map(e => e.id));
        const farmGatePaidMap = new Map<string, number>();
        for (const alloc of existingAllocations) {
          if (reversedIds.has(alloc.cashEntryId)) continue;
          if (alloc.lotId && alloc.coldStoreId) {
            const key = `${alloc.lotId}-${alloc.coldStoreId}`;
            farmGatePaidMap.set(key, (farmGatePaidMap.get(key) || 0) + parseFloat(alloc.appliedAmount || "0"));
          }
        }

        const lotsWithDue = allLots.filter(lot => {
          if (lot.coldStoreDbId) {
            if (lot.coldStoreDbId !== entry.coldStoreDbId) return false;
            const totalCharges = getColdStoreChargesFromArray(lot.charges);
            if (totalCharges <= 0) return false;
            const paidAmount = parseFloat(lot.coldStorageChargesPaid || "0");
            return totalCharges > paidAmount;
          } else if (lot.place === "farm_gate" && entry.coldStoreDbId) {
            const csCharges = getColdStoreChargesForCS(lot.charges, entry.coldStoreDbId);
            if (csCharges <= 0) return false;
            const paidKey = `${lot.id}-${entry.coldStoreDbId}`;
            const paid = farmGatePaidMap.get(paidKey) || 0;
            return csCharges > paid;
          }
          return false;
        });
        
        for (const lot of lotsWithDue) {
          if (remainingAmount <= 0) break;
          
          let due: number;
          if (lot.coldStoreDbId) {
            const totalCharges = getColdStoreChargesFromArray(lot.charges);
            const currentPaid = parseFloat(lot.coldStorageChargesPaid || "0");
            due = totalCharges - currentPaid;
          } else {
            const csCharges = getColdStoreChargesForCS(lot.charges, entry.coldStoreDbId || null);
            const paidKey = `${lot.id}-${entry.coldStoreDbId}`;
            const paid = farmGatePaidMap.get(paidKey) || 0;
            due = csCharges - paid;
          }
          
          if (due <= 0) continue;
          
          const toApply = Math.min(remainingAmount, due);
          
          const [allocation] = await tx.insert(coldStoreChargeAllocations).values({
            cashEntryId: createdEntry.id,
            lotId: lot.id,
            coldStoreId: lot.coldStoreDbId ? undefined : (entry.coldStoreDbId || undefined),
            merchantId: entry.merchantId,
            appliedAmount: toApply.toString(),
          }).returning();
          
          coldStoreAllocations.push(allocation);
          
          if (lot.coldStoreDbId) {
            const currentPaid = parseFloat(lot.coldStorageChargesPaid || "0");
            const newPaid = currentPaid + toApply;
            await tx.update(lots)
              .set({ coldStorageChargesPaid: newPaid.toString() })
              .where(and(eq(lots.id, lot.id), eq(lots.merchantId, entry.merchantId)));
          }
          
          remainingAmount -= toApply;
        }

        if (remainingAmount > 0) {
          const allSeedLotsForCS = await tx.select().from(seedLots)
            .where(eq(seedLots.merchantId, entry.merchantId))
            .orderBy(asc(seedLots.createdAt));

          const seedLotsWithDue = allSeedLotsForCS.filter(sLot => {
            if (!sLot.coldStoreDbId || sLot.coldStoreDbId !== entry.coldStoreDbId) return false;
            const chargesPerBag = parseFloat(sLot.coldStoreChargesPerBag || "0");
            const totalCharges = chargesPerBag * (sLot.originalBags || 0);
            if (totalCharges <= 0) return false;
            const paidAmount = parseFloat(sLot.coldStoreChargesPaid || "0");
            return totalCharges > paidAmount;
          });

          for (const sLot of seedLotsWithDue) {
            if (remainingAmount <= 0) break;

            const chargesPerBag = parseFloat(sLot.coldStoreChargesPerBag || "0");
            const totalCharges = chargesPerBag * (sLot.originalBags || 0);
            const currentPaid = parseFloat(sLot.coldStoreChargesPaid || "0");
            const due = totalCharges - currentPaid;

            if (due <= 0) continue;

            const toApply = Math.min(remainingAmount, due);

            const [allocation] = await tx.insert(coldStoreChargeAllocations).values({
              cashEntryId: createdEntry.id,
              seedLotId: sLot.id,
              merchantId: entry.merchantId,
              appliedAmount: toApply.toString(),
            }).returning();

            coldStoreAllocations.push(allocation);

            const newPaid = currentPaid + toApply;
            await tx.update(seedLots)
              .set({ coldStoreChargesPaid: newPaid.toString() })
              .where(eq(seedLots.id, sLot.id));

            remainingAmount -= toApply;
          }
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

      // If this is an aadhtiya payment, reduce pyPayable on the matched aadhat record (FIFO: pyPayable first)
      if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "aadhtiya" && entry.aadhatDbId) {
        let remainingAmount = parseFloat(entry.amount);
        
        const [aadhat] = await tx.select().from(aadhats)
          .where(and(eq(aadhats.id, entry.aadhatDbId), eq(aadhats.merchantId, entry.merchantId)));
        
        if (aadhat) {
          const currentPyPayable = parseFloat(aadhat.pyPayable || "0");
          const toDeduct = Math.min(remainingAmount, currentPyPayable);
          
          if (toDeduct > 0) {
            const newPyPayable = Math.max(0, currentPyPayable - toDeduct);
            await tx.update(aadhats)
              .set({ pyPayable: newPyPayable.toFixed(2), updatedAt: new Date() })
              .where(eq(aadhats.id, aadhat.id));
            remainingAmount -= toDeduct;
          }
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
  ): Promise<{ buyer: Buyer | undefined; transactionsUpdated: number; partiesUpdated: number; cashEntriesUpdated: number }> {
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
      return { buyer: undefined, transactionsUpdated: 0, partiesUpdated: 0, cashEntriesUpdated: 0 };
    }

    const txResult = await db.update(transactions)
      .set({
        partyName: data.name,
        partyAddress: data.address ?? undefined,
      })
      .where(and(
        eq(transactions.merchantId, merchantId),
        eq(transactions.buyerId, id)
      ))
      .returning({ id: transactions.id });

    const partyResult = await db.update(parties)
      .set({
        name: data.name,
        address: data.address ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(
        eq(parties.merchantId, merchantId),
        eq(parties.buyerId, id)
      ))
      .returning({ id: parties.id });

    const cashResult = await db.update(cashEntries)
      .set({
        partyName: data.name,
      })
      .where(and(
        eq(cashEntries.merchantId, merchantId),
        eq(cashEntries.buyerId, id)
      ))
      .returning({ id: cashEntries.id });

    return { 
      buyer: updatedBuyer, 
      transactionsUpdated: txResult.length,
      partiesUpdated: partyResult.length,
      cashEntriesUpdated: cashResult.length,
    };
  }

  async deleteBuyer(id: number, merchantId: number): Promise<void> {
    await db.delete(buyers)
      .where(and(eq(buyers.id, id), eq(buyers.merchantId, merchantId)));
  }

  async getBuyerByCompositeKey(merchantId: number, name: string, contact: string | null): Promise<Buyer | undefined> {
    const normalizedName = normalizeName(name);
    const normalizedContact = contact ? normalizeName(contact) : null;
    
    const allBuyers = await db.select().from(buyers)
      .where(eq(buyers.merchantId, merchantId));
    
    return allBuyers.find(b => {
      const bName = normalizeName(b.name);
      const bContact = b.contact ? normalizeName(b.contact) : null;
      if (bName !== normalizedName) return false;
      if (normalizedContact && bContact) return bContact === normalizedContact;
      return true;
    });
  }

  async mergeBuyers(merchantId: number, userId: number | null, sourceId: number, targetId: number): Promise<{ survivingBuyer: Buyer; mergedCount: number }> {
    const [lowerId, higherId] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];
    
    const [survivingBuyer] = await db.select().from(buyers)
      .where(and(eq(buyers.id, lowerId), eq(buyers.merchantId, merchantId)));
    const [mergingBuyer] = await db.select().from(buyers)
      .where(and(eq(buyers.id, higherId), eq(buyers.merchantId, merchantId)));
    
    if (!survivingBuyer || !mergingBuyer) {
      throw new Error("One or both buyers not found");
    }
    
    let mergedCount = 0;
    const normalizeForMatch = (val: string | null | undefined) => (val || "").trim().toLowerCase();
    
    const txResult = await db.update(transactions)
      .set({
        buyerId: lowerId,
        partyName: survivingBuyer.name,
        partyAddress: survivingBuyer.address,
      })
      .where(and(eq(transactions.buyerId, higherId), eq(transactions.merchantId, merchantId)))
      .returning();
    mergedCount += txResult.length;
    
    const orphanTxns = await db.select().from(transactions)
      .where(and(
        eq(transactions.merchantId, merchantId),
        isNull(transactions.buyerId)
      ));
    
    for (const txn of orphanTxns) {
      const txnName = normalizeForMatch(txn.partyName);
      const mergingName = normalizeForMatch(mergingBuyer.name);
      if (txnName === mergingName) {
        await db.update(transactions)
          .set({
            buyerId: lowerId,
            partyName: survivingBuyer.name,
            partyAddress: survivingBuyer.address,
          })
          .where(eq(transactions.id, txn.id));
        mergedCount++;
      }
    }
    
    const partyResult = await db.update(parties)
      .set({
        buyerId: lowerId,
        name: survivingBuyer.name,
        address: survivingBuyer.address,
        updatedAt: new Date(),
      })
      .where(and(eq(parties.buyerId, higherId), eq(parties.merchantId, merchantId)))
      .returning();
    mergedCount += partyResult.length;
    
    const orphanParties = await db.select().from(parties)
      .where(and(
        eq(parties.merchantId, merchantId),
        isNull(parties.buyerId)
      ));
    
    for (const p of orphanParties) {
      const pName = normalizeForMatch(p.name);
      const mergingName = normalizeForMatch(mergingBuyer.name);
      if (pName === mergingName) {
        await db.update(parties)
          .set({
            buyerId: lowerId,
            name: survivingBuyer.name,
            address: survivingBuyer.address,
            updatedAt: new Date(),
          })
          .where(eq(parties.id, p.id));
        mergedCount++;
      }
    }
    
    const cashResult = await db.update(cashEntries)
      .set({ buyerId: lowerId })
      .where(and(eq(cashEntries.buyerId, higherId), eq(cashEntries.merchantId, merchantId)))
      .returning();
    mergedCount += cashResult.length;
    
    const newReceivable = (parseFloat(survivingBuyer.receivableBalance || "0") + parseFloat(mergingBuyer.receivableBalance || "0")).toString();
    
    const [updatedSurvivor] = await db.update(buyers)
      .set({
        receivableBalance: newReceivable,
        address: survivingBuyer.address || mergingBuyer.address,
        mandiCode: survivingBuyer.mandiCode || mergingBuyer.mandiCode,
        contact: survivingBuyer.contact || mergingBuyer.contact,
        updatedAt: new Date(),
      })
      .where(and(eq(buyers.id, lowerId), eq(buyers.merchantId, merchantId)))
      .returning();
    
    const nextSerial = await this.getNextBuyerEditHistorySerialNumber(merchantId);
    await this.createBuyerEditHistory({
      serialNumber: nextSerial,
      merchantId,
      buyerId: lowerId,
      changedBy: userId,
      fieldName: 'merge',
      oldValue: `${mergingBuyer.buyerCode} (${mergingBuyer.name})`,
      newValue: `${mergedCount} linked records transferred`,
    });
    
    await db.update(buyerEditHistory)
      .set({ buyerId: lowerId })
      .where(and(eq(buyerEditHistory.buyerId, higherId), eq(buyerEditHistory.merchantId, merchantId)));

    await db.delete(buyers)
      .where(and(eq(buyers.id, higherId), eq(buyers.merchantId, merchantId)));
    
    return { survivingBuyer: updatedSurvivor, mergedCount };
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
          redFlag: false,
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
          redFlag: false,
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
    const newRemaining = (parseFloat(survivingFarmer.remainingReceivable || "0") + parseFloat(mergingFarmer.remainingReceivable || "0")).toString();
    
    // Update surviving farmer with aggregated balances and better details
    const [updatedSurvivor] = await db.update(farmers)
      .set({
        pyPayable: newPyPayable,
        pyReceivable: newPyReceivable,
        pyReceivableFinalAmount: newPyReceivableFinal,
        remainingReceivable: newRemaining,
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
    
    await db.update(farmerEditHistory)
      .set({ farmerId: lowerId })
      .where(and(eq(farmerEditHistory.farmerId, higherId), eq(farmerEditHistory.merchantId, merchantId)));

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
        avgCostPerBag: lot.avgCostPerBag || "0",
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
    userId?: number,
    aadhatAllocationsInput?: Array<{ stockEntryId?: number; isPyPayable?: boolean; amount: number; discountPercent: number; discountAmount: number; pettyAdjustment: number }>,
    buyerAllocationsInput?: Array<{ transactionId?: number; isPyBalance?: boolean; amount: number; pettyAdjustment: number; transactionCode?: string }>,
    coldStoreAllocationsInput?: Array<{ lotId?: number; seedLotId?: number; isPyPayable?: boolean; amount: number; pettyAdjustment: number }>
  ): Promise<CashEntry & { allocations: CashEntryAllocation[]; coldStoreAllocations?: ColdStoreChargeAllocation[] }> {
    
    return await db.transaction(async (tx) => {
      const [createdEntry] = await tx.insert(cashEntries).values(entry).returning();
      const allocations: CashEntryAllocation[] = [];
      const coldStoreAllocations: ColdStoreChargeAllocation[] = [];

      // Buyer payment - manual allocation (replaces FIFO)
      if (entry.direction === "inward" && entry.revenueType === "raw_potato" && buyerAllocationsInput && buyerAllocationsInput.length > 0) {
        const entryBuyerId = entry.buyerId || null;
        for (const alloc of buyerAllocationsInput) {
          const appliedAmount = alloc.amount || 0;
          const pettyAdj = alloc.pettyAdjustment || 0;

          if (alloc.isPyBalance) {
            let actualApplied = appliedAmount;
            if (entryBuyerId) {
              const [buyerRow] = await tx.select().from(buyers).where(eq(buyers.id, entryBuyerId));
              if (buyerRow) {
                const currentReceivable = parseFloat(buyerRow.receivableBalance || "0");
                const totalSettled = appliedAmount + pettyAdj;
                if (totalSettled > currentReceivable + 0.01) {
                  throw new Error(`PY allocation (₹${totalSettled}) exceeds receivable balance (₹${currentReceivable})`);
                }
                actualApplied = Math.min(appliedAmount, currentReceivable);
                const newReceivable = Math.max(0, currentReceivable - actualApplied - pettyAdj);
                await tx.update(buyers)
                  .set({ receivableBalance: newReceivable.toFixed(2), updatedAt: new Date() })
                  .where(eq(buyers.id, entryBuyerId));
              }
            }
            await tx.insert(buyerPaymentAllocations).values({
              cashEntryId: createdEntry.id,
              transactionId: null,
              merchantId: entry.merchantId,
              appliedAmount: appliedAmount.toString(),
              pettyAdjustment: pettyAdj.toString(),
              isPyBalance: true,
              transactionCode: "PY Balance",
            });
          } else if (alloc.transactionId) {
            const [txnRow] = await tx.select().from(transactions).where(
              and(eq(transactions.id, alloc.transactionId), eq(transactions.merchantId, entry.merchantId))
            );
            if (!txnRow) {
              throw new Error(`Transaction ${alloc.transactionId} not found or does not belong to this merchant`);
            }
            const currentReceived = parseFloat(txnRow.amountReceived || "0");
            const txnRevenue = parseFloat(txnRow.revenue || "0");
            const dueAmount = txnRevenue - currentReceived;
            const totalSettled = appliedAmount + pettyAdj;
            if (totalSettled > dueAmount + 0.01) {
              throw new Error(`Allocation (₹${totalSettled}) exceeds due amount (₹${dueAmount.toFixed(2)}) for transaction #${txnRow.transactionNumber}`);
            }
            const newReceived = currentReceived + totalSettled;
            await tx.update(transactions)
              .set({ amountReceived: newReceived.toString() })
              .where(and(eq(transactions.id, alloc.transactionId), eq(transactions.merchantId, entry.merchantId)));
            await tx.insert(buyerPaymentAllocations).values({
              cashEntryId: createdEntry.id,
              transactionId: alloc.transactionId,
              merchantId: entry.merchantId,
              appliedAmount: appliedAmount.toString(),
              pettyAdjustment: pettyAdj.toString(),
              isPyBalance: false,
              transactionCode: txnRow ? `Tnx #${txnRow.transactionNumber}` : (alloc.transactionCode || null),
            });
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
          
          // STEP 1: First reduce farmer's remainingReceivable in farmer ledger
          // Only remainingReceivable is reduced by payments (pyReceivable and pyReceivableFinalAmount stay unchanged)
          if (matchedFarmerId && remainingAmount > 0) {
            const [matchedFarmer] = await tx.select().from(farmers).where(eq(farmers.id, matchedFarmerId));
            if (matchedFarmer) {
              const currentRemaining = parseFloat(matchedFarmer.remainingReceivable || "0");
              if (currentRemaining > 0) {
                const toApply = Math.min(remainingAmount, currentRemaining);
                const newRemaining = currentRemaining - toApply;
                await tx.update(farmers)
                  .set({ 
                    remainingReceivable: newRemaining > 0 ? newRemaining.toFixed(2) : "0.00",
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
      
      // Cold store charge FIFO (priority: PY Payable → Harvest Lots → Seed Lots)
      if (entry.direction === "outflow" && entry.expenseType === "cold_store_charge" && entry.coldStoreDbId && coldStoreAllocationsInput && coldStoreAllocationsInput.length > 0) {
        for (const alloc of coldStoreAllocationsInput) {
          const totalSettled = (alloc.amount || 0) + (alloc.pettyAdjustment || 0);

          if (alloc.isPyPayable) {
            const [csRecord] = await tx.select().from(coldStores)
              .where(and(eq(coldStores.id, entry.coldStoreDbId!), eq(coldStores.merchantId, entry.merchantId)));

            if (csRecord) {
              const currentPyPayable = parseFloat(csRecord.pyPayable || "0");
              if (totalSettled > currentPyPayable + 0.01) {
                throw new Error(`PY Payable allocation ₹${totalSettled.toFixed(2)} exceeds current PY payable ₹${currentPyPayable.toFixed(2)}`);
              }
              const newPyPayable = Math.max(0, currentPyPayable - totalSettled);
              await tx.update(coldStores)
                .set({ pyPayable: newPyPayable.toFixed(2), updatedAt: new Date() })
                .where(eq(coldStores.id, csRecord.id));
            }

            const [pyAllocation] = await tx.insert(coldStoreChargeAllocations).values({
              cashEntryId: createdEntry.id,
              coldStoreId: entry.coldStoreDbId,
              merchantId: entry.merchantId,
              appliedAmount: (alloc.amount || 0).toFixed(2),
              pettyAdjustment: (alloc.pettyAdjustment || 0).toFixed(2),
              isPyPayable: true,
            }).returning();
            coldStoreAllocations.push(pyAllocation);

          } else if (alloc.lotId) {
            const [lot] = await tx.select().from(lots)
              .where(and(eq(lots.id, alloc.lotId), eq(lots.merchantId, entry.merchantId)));
            if (!lot) throw new Error(`Lot ${alloc.lotId} not found`);

            const getColdStoreCharges = (charges: unknown, csId?: number): number => {
              if (!Array.isArray(charges)) return 0;
              const types = ["Cold Charges", "Ware House Charges"];
              return charges
                .filter((c: Record<string, unknown>) => c && types.includes(c.type as string) && (!csId || c.coldStoreDbId === csId))
                .reduce((sum: number, c: Record<string, unknown>) => sum + (parseFloat(String(c.amount)) || 0), 0);
            };

            let totalCharges: number;
            if (lot.coldStoreDbId) {
              totalCharges = getColdStoreCharges(lot.charges);
            } else {
              totalCharges = getColdStoreCharges(lot.charges, entry.coldStoreDbId!);
            }
            const currentPaid = parseFloat(lot.coldStorageChargesPaid || "0");
            const due = totalCharges - currentPaid;
            if (totalSettled > due + 0.01) {
              throw new Error(`Allocation ₹${totalSettled.toFixed(2)} exceeds due ₹${due.toFixed(2)} for lot ${alloc.lotId}`);
            }

            const [allocation] = await tx.insert(coldStoreChargeAllocations).values({
              cashEntryId: createdEntry.id,
              lotId: alloc.lotId,
              coldStoreId: lot.coldStoreDbId ? undefined : (entry.coldStoreDbId || undefined),
              merchantId: entry.merchantId,
              appliedAmount: (alloc.amount || 0).toFixed(2),
              pettyAdjustment: (alloc.pettyAdjustment || 0).toFixed(2),
              isPyPayable: false,
            }).returning();
            coldStoreAllocations.push(allocation);

            if (lot.coldStoreDbId) {
              const newPaid = currentPaid + totalSettled;
              await tx.update(lots)
                .set({ coldStorageChargesPaid: newPaid.toFixed(2) })
                .where(eq(lots.id, lot.id));
            }

          } else if (alloc.seedLotId) {
            const [sLot] = await tx.select().from(seedLots)
              .where(and(eq(seedLots.id, alloc.seedLotId), eq(seedLots.merchantId, entry.merchantId)));
            if (!sLot) throw new Error(`Seed lot ${alloc.seedLotId} not found`);

            const chargesPerBag = parseFloat(sLot.coldStoreChargesPerBag || "0");
            const totalCharges = chargesPerBag * (sLot.originalBags || 0);
            const currentPaid = parseFloat(sLot.coldStoreChargesPaid || "0");
            const due = totalCharges - currentPaid;
            if (totalSettled > due + 0.01) {
              throw new Error(`Allocation ₹${totalSettled.toFixed(2)} exceeds due ₹${due.toFixed(2)} for seed lot ${alloc.seedLotId}`);
            }

            const [allocation] = await tx.insert(coldStoreChargeAllocations).values({
              cashEntryId: createdEntry.id,
              seedLotId: alloc.seedLotId,
              merchantId: entry.merchantId,
              appliedAmount: (alloc.amount || 0).toFixed(2),
              pettyAdjustment: (alloc.pettyAdjustment || 0).toFixed(2),
              isPyPayable: false,
            }).returning();
            coldStoreAllocations.push(allocation);

            const newPaid = currentPaid + totalSettled;
            await tx.update(seedLots)
              .set({ coldStoreChargesPaid: newPaid.toFixed(2) })
              .where(eq(seedLots.id, sLot.id));
          }
        }
      }

      // Supplier payment FIFO - update seed stock entries amountPaid
      if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "supplier" && entry.supplierName) {
        let remainingAmount = parseFloat(entry.amount);
        const normalizedSupplierName = normalizeName(entry.supplierName);
        
        const allSeedEntries = await tx.select().from(seedStockEntries)
          .where(eq(seedStockEntries.merchantId, entry.merchantId))
          .orderBy(asc(seedStockEntries.createdAt));
        
        const allSeedLots = await tx.select().from(seedLots)
          .where(eq(seedLots.merchantId, entry.merchantId));
        
        const entriesWithDue = allSeedEntries.filter(se => {
          if (normalizeName(se.supplierName) !== normalizedSupplierName) return false;
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
          
          const entryLots = allSeedLots.filter(lot => lot.seedEntryId === seedEntry.id);
          const totalCost = entryLots.reduce((sum, lot) => {
            const bags = lot.originalBags || 0;
            const pricePerBag = parseFloat(lot.pricePerBag || "0");
            return sum + (bags * pricePerBag);
          }, 0);
          
          const currentPaid = parseFloat(seedEntry.amountPaid || "0");
          const due = totalCost - currentPaid;
          
          if (due <= 0) continue;
          
          const toApply = Math.min(remainingAmount, due);
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

      // If this is an aadhtiya payment with manual allocations, apply them precisely
      if (entry.direction === "outflow" && entry.expenseType === "aadhtiya" && entry.aadhatDbId && aadhatAllocationsInput && aadhatAllocationsInput.length > 0) {
        for (const alloc of aadhatAllocationsInput) {
          const totalSettled = (alloc.amount || 0) + (alloc.discountAmount || 0) + (alloc.pettyAdjustment || 0);
          
          if (alloc.isPyPayable) {
            const [aadhat] = await tx.select().from(aadhats)
              .where(and(eq(aadhats.id, entry.aadhatDbId!), eq(aadhats.merchantId, entry.merchantId)));
            
            if (aadhat) {
              const currentPyPayable = parseFloat(aadhat.pyPayable || "0");
              if (totalSettled > currentPyPayable + 0.01) {
                throw new Error(`PY Payable allocation ₹${totalSettled.toFixed(2)} exceeds current PY payable ₹${currentPyPayable.toFixed(2)}`);
              }
              const newPyPayable = Math.max(0, currentPyPayable - totalSettled);
              await tx.update(aadhats)
                .set({ pyPayable: newPyPayable.toFixed(2), updatedAt: new Date() })
                .where(eq(aadhats.id, aadhat.id));
            }
            
            await tx.insert(aadhatPaymentAllocations).values({
              cashEntryId: createdEntry.id,
              stockEntryId: null,
              merchantId: entry.merchantId,
              appliedAmount: (alloc.amount || 0).toFixed(2),
              discountPercent: (alloc.discountPercent || 0).toFixed(2),
              discountAmount: (alloc.discountAmount || 0).toFixed(2),
              pettyAdjustment: (alloc.pettyAdjustment || 0).toFixed(2),
              isPyPayable: true,
            });
          } else if (alloc.stockEntryId) {
            const [se] = await tx.select().from(stockEntries)
              .where(and(
                eq(stockEntries.id, alloc.stockEntryId),
                eq(stockEntries.merchantId, entry.merchantId),
                eq(stockEntries.aadhatDbId, entry.aadhatDbId!)
              ));
            
            if (!se) {
              throw new Error(`Stock entry ${alloc.stockEntryId} does not belong to aadhat ${entry.aadhatDbId} or does not exist`);
            }

            const entryLots = await tx.select().from(lots)
              .where(eq(lots.stockEntryId, se.id));
            
            let entryNetPayable = 0;
            for (const lot of entryLots) {
              entryNetPayable += parseFloat(lot.netPayable || "0");
            }
            
            const currentPaid = parseFloat(se.amountPaid || "0");
            const due = entryNetPayable - currentPaid;
            if (totalSettled > due + 0.01) {
              throw new Error(`Allocation total ₹${totalSettled.toFixed(2)} exceeds due ₹${due.toFixed(2)} for stock entry ${alloc.stockEntryId}`);
            }
            
            const newPaid = currentPaid + totalSettled;
            const newDue = entryNetPayable - newPaid;
            const newStatus = newDue <= 0.01 ? "paid" : "partial";
            
            await tx.update(stockEntries)
              .set({ 
                amountPaid: newPaid.toFixed(2),
                paymentStatus: newStatus
              })
              .where(eq(stockEntries.id, se.id));
            
            await tx.insert(aadhatPaymentAllocations).values({
              cashEntryId: createdEntry.id,
              stockEntryId: alloc.stockEntryId,
              merchantId: entry.merchantId,
              appliedAmount: (alloc.amount || 0).toFixed(2),
              discountPercent: (alloc.discountPercent || 0).toFixed(2),
              discountAmount: (alloc.discountAmount || 0).toFixed(2),
              pettyAdjustment: (alloc.pettyAdjustment || 0).toFixed(2),
              isPyPayable: false,
            });
          }
        }
      }
      // Fallback: legacy FIFO for aadhtiya without manual allocations
      else if (applyFIFO && entry.direction === "outflow" && entry.expenseType === "aadhtiya" && entry.aadhatDbId) {
        let remainingAmount = parseFloat(entry.amount);
        
        const [aadhat] = await tx.select().from(aadhats)
          .where(and(eq(aadhats.id, entry.aadhatDbId), eq(aadhats.merchantId, entry.merchantId)));
        
        if (aadhat) {
          const currentPyPayable = parseFloat(aadhat.pyPayable || "0");
          const toDeduct = Math.min(remainingAmount, currentPyPayable);
          
          if (toDeduct > 0) {
            const newPyPayable = Math.max(0, currentPyPayable - toDeduct);
            await tx.update(aadhats)
              .set({ pyPayable: newPyPayable.toFixed(2), updatedAt: new Date() })
              .where(eq(aadhats.id, aadhat.id));
            remainingAmount -= toDeduct;
          }
        }
        
        if (remainingAmount > 0) {
          const aadhatStockEntries = await tx.select().from(stockEntries)
            .where(and(
              eq(stockEntries.merchantId, entry.merchantId),
              eq(stockEntries.aadhatDbId, entry.aadhatDbId),
              or(eq(stockEntries.paymentStatus, "due"), eq(stockEntries.paymentStatus, "partial"))
            ))
            .orderBy(asc(stockEntries.createdAt));
          
          for (const se of aadhatStockEntries) {
            if (remainingAmount <= 0) break;
            
            const entryLots = await tx.select().from(lots)
              .where(eq(lots.stockEntryId, se.id));
            
            let entryNetPayable = 0;
            for (const lot of entryLots) {
              entryNetPayable += parseFloat(lot.netPayable || "0");
            }
            
            const currentPaid = parseFloat(se.amountPaid || "0");
            const due = entryNetPayable - currentPaid;
            
            if (due <= 0) continue;
            
            const toApply = Math.min(remainingAmount, due);
            const newPaid = currentPaid + toApply;
            const newDue = entryNetPayable - newPaid;
            const newStatus = newDue <= 0 ? "paid" : "partial";
            
            await tx.update(stockEntries)
              .set({ 
                amountPaid: newPaid.toString(),
                paymentStatus: newStatus
              })
              .where(eq(stockEntries.id, se.id));
            
            remainingAmount -= toApply;
          }
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

  async updateCashEntry(id: number, merchantId: number, data: Partial<CashEntry>): Promise<CashEntry | undefined> {
    const [updated] = await db.update(cashEntries).set(data).where(and(eq(cashEntries.id, id), eq(cashEntries.merchantId, merchantId))).returning();
    return updated;
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
      
      // 4a. Reverse party payment allocations (buyer receipts for raw_potato) using buyer_payment_allocations
      if (entry.direction === "inward" && entry.revenueType === "raw_potato") {
        const buyerAllocs = await tx.select().from(buyerPaymentAllocations)
          .where(eq(buyerPaymentAllocations.cashEntryId, cashEntryId));
        
        if (buyerAllocs.length > 0) {
          for (const alloc of buyerAllocs) {
            const appliedAmt = parseFloat(alloc.appliedAmount || "0");
            const pettyAdj = parseFloat(alloc.pettyAdjustment || "0");
            const totalSettled = appliedAmt + pettyAdj;

            if (alloc.isPyBalance) {
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
                    .set({ receivableBalance: (currentReceivable + appliedAmt + pettyAdj).toFixed(2), updatedAt: new Date() })
                    .where(eq(buyers.id, buyerIdToRestore));
                }
              }
            } else if (alloc.transactionId) {
              const [txn] = await tx.select().from(transactions)
                .where(and(eq(transactions.id, alloc.transactionId), eq(transactions.merchantId, merchantId)));
              if (txn) {
                const currentReceived = parseFloat(txn.amountReceived || "0");
                const newReceived = Math.max(0, currentReceived - totalSettled);
                await tx.update(transactions)
                  .set({ amountReceived: newReceived.toString() })
                  .where(and(eq(transactions.id, txn.id), eq(transactions.merchantId, merchantId)));
              }
            }
          }
        } else {
          // Legacy fallback: reverse old FIFO-era cash_entry_allocations for pre-manual-allocation entries
          const legacyAllocs = entryAllocations.filter(a => a.transactionId !== null);
          let totalLegacyAllocated = 0;
          for (const alloc of legacyAllocs) {
            if (alloc.transactionId) {
              const allocAmt = parseFloat(alloc.appliedAmount || "0");
              totalLegacyAllocated += allocAmt;
              const [txn] = await tx.select().from(transactions)
                .where(and(eq(transactions.id, alloc.transactionId), eq(transactions.merchantId, merchantId)));
              if (txn) {
                const currentReceived = parseFloat(txn.amountReceived || "0");
                const newReceived = Math.max(0, currentReceived - allocAmt);
                await tx.update(transactions)
                  .set({ amountReceived: newReceived.toString() })
                  .where(and(eq(transactions.id, txn.id), eq(transactions.merchantId, merchantId)));
              }
            }
          }
          // Restore buyer receivableBalance for portion applied to PY (unallocated remainder)
          const totalPayment = parseFloat(entry.amount || "0");
          const receivableReduction = totalPayment - totalLegacyAllocated;
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
        
        // Restore farmer receivable for any amount that was originally applied to remainingReceivable
        if (amountToRestore > 0 && entryFarmerId) {
          const [farmer] = await tx.select().from(farmers).where(eq(farmers.id, entryFarmerId));
          if (farmer) {
            const currentRemaining = parseFloat(farmer.remainingReceivable || "0");
            await tx.update(farmers)
              .set({ 
                remainingReceivable: (currentRemaining + amountToRestore).toFixed(2),
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
      
      // 4e. Reverse aadhtiya payment using allocation records if available, else legacy reversal
      if (entry.direction === "outflow" && entry.expenseType === "aadhtiya" && entry.aadhatDbId) {
        const aadhatAllocs = await tx.select().from(aadhatPaymentAllocations)
          .where(and(
            eq(aadhatPaymentAllocations.cashEntryId, cashEntryId),
            eq(aadhatPaymentAllocations.merchantId, merchantId)
          ));
        
        if (aadhatAllocs.length > 0) {
          for (const alloc of aadhatAllocs) {
            const totalSettled = parseFloat(alloc.appliedAmount || "0") + parseFloat(alloc.discountAmount || "0") + parseFloat(alloc.pettyAdjustment || "0");
            
            if (alloc.isPyPayable) {
              const [aadhat] = await tx.select().from(aadhats)
                .where(and(eq(aadhats.id, entry.aadhatDbId!), eq(aadhats.merchantId, merchantId)));
              
              if (aadhat) {
                const currentPyPayable = parseFloat(aadhat.pyPayable || "0");
                const newPyPayable = currentPyPayable + totalSettled;
                await tx.update(aadhats)
                  .set({ pyPayable: newPyPayable.toFixed(2), updatedAt: new Date() })
                  .where(eq(aadhats.id, aadhat.id));
              }
            } else if (alloc.stockEntryId) {
              const [se] = await tx.select().from(stockEntries)
                .where(eq(stockEntries.id, alloc.stockEntryId));
              
              if (se) {
                const currentPaid = parseFloat(se.amountPaid || "0");
                const newPaid = Math.max(0, currentPaid - totalSettled);
                const newStatus = newPaid <= 0 ? "due" : "partial";
                
                await tx.update(stockEntries)
                  .set({ 
                    amountPaid: newPaid.toFixed(2),
                    paymentStatus: newStatus
                  })
                  .where(eq(stockEntries.id, alloc.stockEntryId));
              }
            }
          }
        } else {
          let amountToReverse = parseFloat(entry.amount);
          
          const aadhatStockEntries = await tx.select().from(stockEntries)
            .where(and(
              eq(stockEntries.merchantId, merchantId),
              eq(stockEntries.aadhatDbId, entry.aadhatDbId)
            ))
            .orderBy(asc(stockEntries.createdAt));
          
          for (const se of aadhatStockEntries.reverse()) {
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
          
          if (amountToReverse > 0) {
            const [aadhat] = await tx.select().from(aadhats)
              .where(and(eq(aadhats.id, entry.aadhatDbId), eq(aadhats.merchantId, merchantId)));
            
            if (aadhat) {
              const currentPyPayable = parseFloat(aadhat.pyPayable || "0");
              const newPyPayable = currentPyPayable + amountToReverse;
              
              await tx.update(aadhats)
                .set({ pyPayable: newPyPayable.toFixed(2), updatedAt: new Date() })
                .where(eq(aadhats.id, aadhat.id));
            }
          }
        }
      }

      // 4f. Reverse cold store charge allocations (only for cold_store_charge outflows)
      if (entry.direction === "outflow" && entry.expenseType === "cold_store_charge") {
        for (const alloc of coldStoreAllocs) {
          if (alloc.coldStoreId && !alloc.lotId && !alloc.seedLotId) {
            const [cs] = await tx.select().from(coldStores)
              .where(eq(coldStores.id, alloc.coldStoreId));
            
            if (cs) {
              const currentPy = parseFloat(cs.pyPayable || "0");
              const newPy = currentPy + parseFloat(alloc.appliedAmount);
              
              await tx.update(coldStores)
                .set({ pyPayable: newPy.toFixed(2), updatedAt: new Date() })
                .where(eq(coldStores.id, cs.id));
            }
          } else if (alloc.lotId) {
            const [lot] = await tx.select().from(lots)
              .where(eq(lots.id, alloc.lotId));
            
            if (lot) {
              const currentPaid = parseFloat(lot.coldStorageChargesPaid || "0");
              const newPaid = Math.max(0, currentPaid - parseFloat(alloc.appliedAmount));
              
              await tx.update(lots)
                .set({ coldStorageChargesPaid: newPaid.toString() })
                .where(eq(lots.id, lot.id));
            }
          } else if (alloc.seedLotId) {
            const [sLot] = await tx.select().from(seedLots)
              .where(eq(seedLots.id, alloc.seedLotId));
            
            if (sLot) {
              const currentPaid = parseFloat(sLot.coldStoreChargesPaid || "0");
              const newPaid = Math.max(0, currentPaid - parseFloat(alloc.appliedAmount));
              
              await tx.update(seedLots)
                .set({ coldStoreChargesPaid: newPaid.toString() })
                .where(eq(seedLots.id, sLot.id));
            }
          }
        }
      }
      
      // 4g. Delete linked capital asset and its depreciation logs (for capital expense reversals)
      if (entry.capitalAssetId) {
        await tx.delete(assetDepreciationLog).where(eq(assetDepreciationLog.assetId, entry.capitalAssetId));
        await tx.delete(assets).where(and(eq(assets.id, entry.capitalAssetId), eq(assets.merchantId, merchantId)));
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
    redFlag: boolean | null;
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
      redFlag: farmers.redFlag,
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
        redFlag: farmer.redFlag,
        source: 'stock_entry' as const,
      }))
      .sort((a, b) => a.farmerName.localeCompare(b.farmerName));
  }

  async getDistinctVillages(merchantId: number): Promise<string[]> {
    const results = await db.selectDistinct({ village: farmers.village })
      .from(farmers)
      .where(and(eq(farmers.merchantId, merchantId), isNotNull(farmers.village)));
    return results
      .map(r => r.village!)
      .filter(v => v.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
  }

  async getDistinctTehsils(merchantId: number): Promise<string[]> {
    const results = await db.selectDistinct({ tehsil: farmers.tehsil })
      .from(farmers)
      .where(and(eq(farmers.merchantId, merchantId), isNotNull(farmers.tehsil)));
    return results
      .map(r => r.tehsil!)
      .filter(v => v.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
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

  async searchColdStores(merchantId: number, query: string): Promise<{ id: number; name: string }[]> {
    const normalizedQuery = query.trim().toLowerCase();
    
    const allColdStores = await db.select()
      .from(coldStores)
      .where(and(eq(coldStores.merchantId, merchantId), eq(coldStores.isActive, true)));
    
    if (!normalizedQuery) {
      return allColdStores.map(cs => ({ id: cs.id, name: cs.name }));
    }
    
    return allColdStores
      .filter(cs => cs.name.toLowerCase().includes(normalizedQuery))
      .map(cs => ({ id: cs.id, name: cs.name }));
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

  // Aadhat Ledger operations
  async getAadhatsByMerchant(merchantId: number): Promise<Aadhat[]> {
    return await db.select().from(aadhats).where(eq(aadhats.merchantId, merchantId)).orderBy(desc(aadhats.createdAt));
  }

  async getAadhatById(id: number, merchantId: number): Promise<Aadhat | undefined> {
    const [aadhat] = await db.select().from(aadhats).where(and(eq(aadhats.id, id), eq(aadhats.merchantId, merchantId)));
    return aadhat;
  }

  async getMaxAadhatCodeSequence(merchantId: number, prefix: string): Promise<number> {
    const result = await db.select({ aadhatId: aadhats.aadhatId })
      .from(aadhats)
      .where(and(
        eq(aadhats.merchantId, merchantId),
        sql`${aadhats.aadhatId} LIKE ${prefix + '%'}`
      ));
    let maxSeq = 0;
    for (const row of result) {
      if (row.aadhatId) {
        const seq = parseInt(row.aadhatId.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    return maxSeq;
  }

  async createAadhat(aadhat: InsertAadhat): Promise<Aadhat> {
    const [created] = await db.insert(aadhats).values(aadhat).returning();
    return created;
  }

  async updateAadhat(id: number, merchantId: number, data: Partial<Aadhat>): Promise<Aadhat | undefined> {
    const [updated] = await db.update(aadhats)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(aadhats.id, id), eq(aadhats.merchantId, merchantId)))
      .returning();
    return updated;
  }

  async getAadhatByCompositeKey(merchantId: number, name: string, contact: string | null): Promise<Aadhat | undefined> {
    const normalizedName = normalizeName(name);
    const normalizedContact = contact ? normalizeName(contact) : null;
    
    const allAadhats = await db.select().from(aadhats)
      .where(eq(aadhats.merchantId, merchantId));
    
    return allAadhats.find(a => {
      const aName = normalizeName(a.name);
      const aContact = a.contact ? normalizeName(a.contact) : null;
      if (aName !== normalizedName) return false;
      if (normalizedContact && aContact) return aContact === normalizedContact;
      return true;
    });
  }

  async updateAadhatWithPropagation(
    id: number,
    merchantId: number,
    data: { name: string; address: string | null; contact: string | null }
  ): Promise<{ aadhat: Aadhat | undefined; stockEntriesUpdated: number; cashEntriesUpdated: number }> {
    const [updatedAadhat] = await db.update(aadhats)
      .set({
        name: data.name,
        address: data.address ?? undefined,
        contact: data.contact ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(aadhats.id, id), eq(aadhats.merchantId, merchantId)))
      .returning();

    if (!updatedAadhat) {
      return { aadhat: undefined, stockEntriesUpdated: 0, cashEntriesUpdated: 0 };
    }

    const stockResult = await db.update(stockEntries)
      .set({ aadhatName: data.name, updatedAt: new Date() })
      .where(and(
        eq(stockEntries.merchantId, merchantId),
        eq(stockEntries.aadhatDbId, id)
      ))
      .returning({ id: stockEntries.id });

    const cashResult = await db.update(cashEntries)
      .set({ aadhatName: data.name })
      .where(and(
        eq(cashEntries.merchantId, merchantId),
        eq(cashEntries.aadhatDbId, id)
      ))
      .returning({ id: cashEntries.id });

    return {
      aadhat: updatedAadhat,
      stockEntriesUpdated: stockResult.length,
      cashEntriesUpdated: cashResult.length,
    };
  }

  async mergeAadhats(merchantId: number, userId: number | null, sourceId: number, targetId: number): Promise<{ survivingAadhat: Aadhat; mergedCount: number }> {
    const [lowerId, higherId] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];
    
    const [survivingAadhat] = await db.select().from(aadhats)
      .where(and(eq(aadhats.id, lowerId), eq(aadhats.merchantId, merchantId)));
    const [mergingAadhat] = await db.select().from(aadhats)
      .where(and(eq(aadhats.id, higherId), eq(aadhats.merchantId, merchantId)));
    
    if (!survivingAadhat || !mergingAadhat) {
      throw new Error("One or both aadhats not found");
    }
    
    let mergedCount = 0;
    const normalizeForMatch = (val: string | null | undefined) => (val || "").trim().toLowerCase();
    
    const stockByIdResult = await db.update(stockEntries)
      .set({
        aadhatDbId: lowerId,
        aadhatName: survivingAadhat.name,
        updatedAt: new Date(),
      })
      .where(and(eq(stockEntries.aadhatDbId, higherId), eq(stockEntries.merchantId, merchantId)))
      .returning();
    mergedCount += stockByIdResult.length;
    
    const orphanStockEntries = await db.select().from(stockEntries)
      .where(and(
        eq(stockEntries.merchantId, merchantId),
        isNull(stockEntries.aadhatDbId)
      ));
    
    for (const entry of orphanStockEntries) {
      const entryName = normalizeForMatch(entry.aadhatName);
      const mergingName = normalizeForMatch(mergingAadhat.name);
      if (entryName === mergingName) {
        await db.update(stockEntries)
          .set({
            aadhatDbId: lowerId,
            aadhatName: survivingAadhat.name,
            updatedAt: new Date(),
          })
          .where(eq(stockEntries.id, entry.id));
        mergedCount++;
      }
    }
    
    const cashByIdResult = await db.update(cashEntries)
      .set({
        aadhatDbId: lowerId,
        aadhatName: survivingAadhat.name,
      })
      .where(and(eq(cashEntries.aadhatDbId, higherId), eq(cashEntries.merchantId, merchantId)))
      .returning();
    mergedCount += cashByIdResult.length;
    
    const orphanCash = await db.select().from(cashEntries)
      .where(and(
        eq(cashEntries.merchantId, merchantId),
        isNull(cashEntries.aadhatDbId)
      ));
    
    for (const ce of orphanCash) {
      const ceName = normalizeForMatch(ce.aadhatName);
      const mergingName = normalizeForMatch(mergingAadhat.name);
      if (ceName === mergingName) {
        await db.update(cashEntries)
          .set({
            aadhatDbId: lowerId,
            aadhatName: survivingAadhat.name,
          })
          .where(eq(cashEntries.id, ce.id));
        mergedCount++;
      }
    }
    
    const newPyPayable = (parseFloat(survivingAadhat.pyPayable || "0") + parseFloat(mergingAadhat.pyPayable || "0")).toString();
    
    const [updatedSurvivor] = await db.update(aadhats)
      .set({
        pyPayable: newPyPayable,
        address: survivingAadhat.address || mergingAadhat.address,
        contact: survivingAadhat.contact || mergingAadhat.contact,
        updatedAt: new Date(),
      })
      .where(and(eq(aadhats.id, lowerId), eq(aadhats.merchantId, merchantId)))
      .returning();
    
    const nextSerial = await this.getNextAadhatEditHistorySerialNumber(merchantId);
    const mergingPyPayable = parseFloat(mergingAadhat.pyPayable || "0");
    const pyInfo = mergingPyPayable > 0 ? ` | PY: ₹${mergingPyPayable.toFixed(0)} payable` : '';
    
    await this.createAadhatEditHistory({
      serialNumber: nextSerial,
      merchantId,
      aadhatId: lowerId,
      changedBy: userId,
      fieldName: 'merge',
      oldValue: `${mergingAadhat.aadhatId} (${mergingAadhat.name})${pyInfo}`,
      newValue: `${mergedCount} linked records transferred`,
    });
    
    await db.update(aadhatEditHistory)
      .set({ aadhatId: lowerId })
      .where(and(eq(aadhatEditHistory.aadhatId, higherId), eq(aadhatEditHistory.merchantId, merchantId)));

    await db.delete(aadhats)
      .where(and(eq(aadhats.id, higherId), eq(aadhats.merchantId, merchantId)));
    
    return { survivingAadhat: updatedSurvivor, mergedCount };
  }

  // Aadhat Edit History operations
  async getAadhatEditHistory(aadhatId: number, merchantId: number): Promise<AadhatEditHistory[]> {
    return await db.select()
      .from(aadhatEditHistory)
      .where(and(
        eq(aadhatEditHistory.aadhatId, aadhatId),
        eq(aadhatEditHistory.merchantId, merchantId)
      ))
      .orderBy(desc(aadhatEditHistory.changedAt));
  }

  async getNextAadhatEditHistorySerialNumber(merchantId: number): Promise<number> {
    const [result] = await db.select({ maxSerial: sql<number>`COALESCE(MAX(${aadhatEditHistory.serialNumber}), 0)` })
      .from(aadhatEditHistory)
      .where(eq(aadhatEditHistory.merchantId, merchantId));
    return (result?.maxSerial || 0) + 1;
  }

  async createAadhatEditHistory(data: InsertAadhatEditHistory): Promise<AadhatEditHistory> {
    const [created] = await db.insert(aadhatEditHistory).values(data).returning();
    return created;
  }

  async getSundryPayByMerchant(merchantId: number): Promise<SundryPayStakeholder[]> {
    return await db.select().from(sundryPayStakeholders).where(eq(sundryPayStakeholders.merchantId, merchantId)).orderBy(desc(sundryPayStakeholders.createdAt));
  }

  async getSundryPayById(id: number, merchantId: number): Promise<SundryPayStakeholder | undefined> {
    const [stakeholder] = await db.select().from(sundryPayStakeholders).where(and(eq(sundryPayStakeholders.id, id), eq(sundryPayStakeholders.merchantId, merchantId)));
    return stakeholder;
  }

  async getMaxSundryPayCodeSequence(merchantId: number, prefix: string): Promise<number> {
    const result = await db.select({ sundryPayId: sundryPayStakeholders.sundryPayId })
      .from(sundryPayStakeholders)
      .where(and(
        eq(sundryPayStakeholders.merchantId, merchantId),
        sql`${sundryPayStakeholders.sundryPayId} LIKE ${prefix + '%'}`
      ));
    let maxSeq = 0;
    for (const row of result) {
      if (row.sundryPayId) {
        const seq = parseInt(row.sundryPayId.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    return maxSeq;
  }

  async createSundryPay(data: InsertSundryPayStakeholder): Promise<SundryPayStakeholder> {
    const [created] = await db.insert(sundryPayStakeholders).values(data).returning();
    return created;
  }

  async updateSundryPay(id: number, merchantId: number, data: Partial<SundryPayStakeholder>): Promise<SundryPayStakeholder | undefined> {
    const [updated] = await db.update(sundryPayStakeholders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(sundryPayStakeholders.id, id), eq(sundryPayStakeholders.merchantId, merchantId)))
      .returning();
    return updated;
  }

  async getSundryPayByCompositeKey(merchantId: number, name: string, contact: string | null): Promise<SundryPayStakeholder | undefined> {
    const normalizedName = normalizeName(name);
    const normalizedContact = contact ? normalizeName(contact) : null;
    const all = await db.select().from(sundryPayStakeholders)
      .where(eq(sundryPayStakeholders.merchantId, merchantId));
    return all.find(s => {
      const sName = normalizeName(s.name);
      const sContact = s.contact ? normalizeName(s.contact) : null;
      if (sName !== normalizedName) return false;
      if (normalizedContact && sContact) return sContact === normalizedContact;
      return true;
    });
  }

  async updateSundryPayWithPropagation(
    id: number,
    merchantId: number,
    data: { name: string; address: string | null; contact: string | null }
  ): Promise<{ stakeholder: SundryPayStakeholder | undefined; cashEntriesUpdated: number }> {
    const [updated] = await db.update(sundryPayStakeholders)
      .set({
        name: data.name,
        address: data.address ?? undefined,
        contact: data.contact ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(sundryPayStakeholders.id, id), eq(sundryPayStakeholders.merchantId, merchantId)))
      .returning();

    if (!updated) {
      return { stakeholder: undefined, cashEntriesUpdated: 0 };
    }

    const cashResult = await db.update(cashEntries)
      .set({ sundryPayName: data.name })
      .where(and(
        eq(cashEntries.merchantId, merchantId),
        eq(cashEntries.sundryPayDbId, id)
      ))
      .returning({ id: cashEntries.id });

    return { stakeholder: updated, cashEntriesUpdated: cashResult.length };
  }

  async getSundryPayEditHistory(stakeholderId: number, merchantId: number): Promise<SundryPayEditHistory[]> {
    return await db.select()
      .from(sundryPayEditHistory)
      .where(and(
        eq(sundryPayEditHistory.sundryPayStakeholderId, stakeholderId),
        eq(sundryPayEditHistory.merchantId, merchantId)
      ))
      .orderBy(desc(sundryPayEditHistory.changedAt));
  }

  async getNextSundryPayEditHistorySerialNumber(merchantId: number): Promise<number> {
    const [result] = await db.select({ maxSerial: sql<number>`COALESCE(MAX(${sundryPayEditHistory.serialNumber}), 0)` })
      .from(sundryPayEditHistory)
      .where(eq(sundryPayEditHistory.merchantId, merchantId));
    return (result?.maxSerial || 0) + 1;
  }

  async createSundryPayEditHistory(data: InsertSundryPayEditHistory): Promise<SundryPayEditHistory> {
    const [created] = await db.insert(sundryPayEditHistory).values(data).returning();
    return created;
  }

  async getDemoVideos(): Promise<DemoVideo[]> {
    return db.select().from(demoVideos).orderBy(desc(demoVideos.uploadedAt));
  }

  async getDemoVideoById(id: number): Promise<DemoVideo | undefined> {
    const [video] = await db.select().from(demoVideos).where(eq(demoVideos.id, id));
    return video;
  }

  async createDemoVideo(data: InsertDemoVideo): Promise<DemoVideo> {
    const [created] = await db.insert(demoVideos).values(data).returning();
    return created;
  }

  async updateDemoVideoCaption(id: number, caption: string): Promise<DemoVideo | undefined> {
    const [updated] = await db.update(demoVideos).set({ caption }).where(eq(demoVideos.id, id)).returning();
    return updated;
  }

  async deleteDemoVideo(id: number): Promise<void> {
    await db.delete(demoVideos).where(eq(demoVideos.id, id));
  }

  async getAssets(merchantId: number): Promise<Asset[]> {
    return db.select().from(assets).where(eq(assets.merchantId, merchantId)).orderBy(desc(assets.createdAt));
  }

  async getAssetById(id: number, merchantId: number): Promise<Asset | undefined> {
    const [asset] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.merchantId, merchantId)));
    return asset;
  }

  async createAsset(data: InsertAsset): Promise<Asset> {
    const [created] = await db.insert(assets).values(data).returning();
    return created;
  }

  async updateAsset(id: number, merchantId: number, data: Partial<Asset>): Promise<Asset | undefined> {
    const [updated] = await db.update(assets).set({ ...data, updatedAt: new Date() }).where(and(eq(assets.id, id), eq(assets.merchantId, merchantId))).returning();
    return updated;
  }

  async deleteAsset(id: number, merchantId: number): Promise<void> {
    await db.delete(assets).where(and(eq(assets.id, id), eq(assets.merchantId, merchantId)));
  }

  async getDepreciationLogs(merchantId: number, assetId?: number, financialYear?: string): Promise<AssetDepreciationLog[]> {
    const conditions = [eq(assetDepreciationLog.merchantId, merchantId)];
    if (assetId) conditions.push(eq(assetDepreciationLog.assetId, assetId));
    if (financialYear) conditions.push(eq(assetDepreciationLog.financialYear, financialYear));
    return db.select().from(assetDepreciationLog).where(and(...conditions)).orderBy(desc(assetDepreciationLog.financialYear));
  }

  async createDepreciationLog(data: InsertAssetDepreciationLog): Promise<AssetDepreciationLog> {
    const [created] = await db.insert(assetDepreciationLog).values(data).returning();
    return created;
  }

  async getLiabilities(merchantId: number): Promise<Liability[]> {
    return db.select().from(liabilities).where(eq(liabilities.merchantId, merchantId)).orderBy(desc(liabilities.createdAt));
  }

  async getLiabilityById(id: number, merchantId: number): Promise<Liability | undefined> {
    const [liability] = await db.select().from(liabilities).where(and(eq(liabilities.id, id), eq(liabilities.merchantId, merchantId)));
    return liability;
  }

  async createLiability(data: InsertLiability): Promise<Liability> {
    const [created] = await db.insert(liabilities).values(data).returning();
    return created;
  }

  async updateLiability(id: number, merchantId: number, data: Partial<Liability>): Promise<Liability | undefined> {
    const [updated] = await db.update(liabilities).set({ ...data, updatedAt: new Date() }).where(and(eq(liabilities.id, id), eq(liabilities.merchantId, merchantId))).returning();
    return updated;
  }

  async deleteLiability(id: number, merchantId: number): Promise<void> {
    await db.delete(liabilities).where(and(eq(liabilities.id, id), eq(liabilities.merchantId, merchantId)));
  }

  async getLiabilityPayments(liabilityId: number, merchantId: number): Promise<LiabilityPayment[]> {
    return db.select().from(liabilityPayments).where(and(eq(liabilityPayments.liabilityId, liabilityId), eq(liabilityPayments.merchantId, merchantId))).orderBy(desc(liabilityPayments.paymentDate));
  }

  async createLiabilityPayment(data: InsertLiabilityPayment): Promise<LiabilityPayment> {
    const [created] = await db.insert(liabilityPayments).values(data).returning();
    return created;
  }

  async deleteLiabilityPayment(id: number, merchantId: number): Promise<void> {
    await db.delete(liabilityPayments).where(and(eq(liabilityPayments.id, id), eq(liabilityPayments.merchantId, merchantId)));
  }

  async getColdStoresByMerchant(merchantId: number): Promise<ColdStore[]> {
    return await db.select().from(coldStores).where(eq(coldStores.merchantId, merchantId)).orderBy(desc(coldStores.createdAt));
  }

  async getColdStoreById(id: number, merchantId: number): Promise<ColdStore | undefined> {
    const [cs] = await db.select().from(coldStores).where(and(eq(coldStores.id, id), eq(coldStores.merchantId, merchantId)));
    return cs;
  }

  async getMaxColdStoreCodeSequence(merchantId: number, prefix: string): Promise<number> {
    const result = await db.select({ coldStoreId: coldStores.coldStoreId })
      .from(coldStores)
      .where(and(
        eq(coldStores.merchantId, merchantId),
        sql`${coldStores.coldStoreId} LIKE ${prefix + '%'}`
      ));
    let maxSeq = 0;
    for (const row of result) {
      if (row.coldStoreId) {
        const seq = parseInt(row.coldStoreId.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    return maxSeq;
  }

  async createColdStore(coldStore: InsertColdStore): Promise<ColdStore> {
    const [created] = await db.insert(coldStores).values(coldStore).returning();
    return created;
  }

  async updateColdStore(id: number, merchantId: number, data: Partial<ColdStore>): Promise<ColdStore | undefined> {
    const [updated] = await db.update(coldStores)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(coldStores.id, id), eq(coldStores.merchantId, merchantId)))
      .returning();
    return updated;
  }

  async getColdStoreByCompositeKey(merchantId: number, name: string): Promise<ColdStore | undefined> {
    const normalizedName = normalizeName(name);
    const allCS = await db.select().from(coldStores)
      .where(eq(coldStores.merchantId, merchantId));
    return allCS.find(cs => normalizeName(cs.name) === normalizedName);
  }

  async updateColdStoreWithPropagation(
    id: number,
    merchantId: number,
    data: { name: string; address: string | null; contact: string | null }
  ): Promise<{ coldStore: ColdStore | undefined; lotsUpdated: number; seedLotsUpdated: number; cashEntriesUpdated: number }> {
    const [updatedCS] = await db.update(coldStores)
      .set({
        name: data.name,
        address: data.address ?? undefined,
        contact: data.contact ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(coldStores.id, id), eq(coldStores.merchantId, merchantId)))
      .returning();

    if (!updatedCS) {
      return { coldStore: undefined, lotsUpdated: 0, seedLotsUpdated: 0, cashEntriesUpdated: 0 };
    }

    const lotsResult = await db.update(lots)
      .set({ coldStoreName: data.name })
      .where(and(eq(lots.merchantId, merchantId), eq(lots.coldStoreDbId, id)))
      .returning({ id: lots.id });

    const seedLotsResult = await db.update(seedLots)
      .set({ coldStoreName: data.name })
      .where(and(eq(seedLots.merchantId, merchantId), eq(seedLots.coldStoreDbId, id)))
      .returning({ id: seedLots.id });

    const cashResult = await db.update(cashEntries)
      .set({ coldStoreName: data.name })
      .where(and(eq(cashEntries.merchantId, merchantId), eq(cashEntries.coldStoreDbId, id)))
      .returning({ id: cashEntries.id });

    return {
      coldStore: updatedCS,
      lotsUpdated: lotsResult.length,
      seedLotsUpdated: seedLotsResult.length,
      cashEntriesUpdated: cashResult.length,
    };
  }

  async mergeColdStores(merchantId: number, userId: number | null, sourceId: number, targetId: number): Promise<{ survivingColdStore: ColdStore; mergedCount: number }> {
    const [lowerId, higherId] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];

    const [survivingCS] = await db.select().from(coldStores)
      .where(and(eq(coldStores.id, lowerId), eq(coldStores.merchantId, merchantId)));
    const [mergingCS] = await db.select().from(coldStores)
      .where(and(eq(coldStores.id, higherId), eq(coldStores.merchantId, merchantId)));

    if (!survivingCS || !mergingCS) {
      throw new Error("One or both cold stores not found");
    }

    let mergedCount = 0;

    const lotsResult = await db.update(lots)
      .set({ coldStoreDbId: lowerId, coldStoreName: survivingCS.name })
      .where(and(eq(lots.coldStoreDbId, higherId), eq(lots.merchantId, merchantId)))
      .returning();
    mergedCount += lotsResult.length;

    const seedLotsResult = await db.update(seedLots)
      .set({ coldStoreDbId: lowerId, coldStoreName: survivingCS.name })
      .where(and(eq(seedLots.coldStoreDbId, higherId), eq(seedLots.merchantId, merchantId)))
      .returning();
    mergedCount += seedLotsResult.length;

    const cashResult = await db.update(cashEntries)
      .set({ coldStoreDbId: lowerId, coldStoreName: survivingCS.name })
      .where(and(eq(cashEntries.coldStoreDbId, higherId), eq(cashEntries.merchantId, merchantId)))
      .returning();
    mergedCount += cashResult.length;

    const allocResult = await db.update(coldStoreChargeAllocations)
      .set({})
      .where(and(
        sql`${coldStoreChargeAllocations.lotId} IN (SELECT id FROM lots WHERE cold_store_db_id = ${lowerId} AND merchant_id = ${merchantId})`,
        eq(coldStoreChargeAllocations.merchantId, merchantId)
      ))
      .returning();

    const newPyPayable = (parseFloat(survivingCS.pyPayable || "0") + parseFloat(mergingCS.pyPayable || "0")).toString();

    const [updatedSurvivor] = await db.update(coldStores)
      .set({
        pyPayable: newPyPayable,
        address: survivingCS.address || mergingCS.address,
        contact: survivingCS.contact || mergingCS.contact,
        bankName: survivingCS.bankName || mergingCS.bankName,
        bankAccountNumber: survivingCS.bankAccountNumber || mergingCS.bankAccountNumber,
        ifscCode: survivingCS.ifscCode || mergingCS.ifscCode,
        updatedAt: new Date(),
      })
      .where(and(eq(coldStores.id, lowerId), eq(coldStores.merchantId, merchantId)))
      .returning();

    const nextSerial = await this.getNextColdStoreEditHistorySerialNumber(merchantId);
    const mergingPyPayable = parseFloat(mergingCS.pyPayable || "0");
    const pyInfo = mergingPyPayable > 0 ? ` | PY: ₹${mergingPyPayable.toFixed(0)} payable` : '';

    await this.createColdStoreEditHistory({
      serialNumber: nextSerial,
      merchantId,
      coldStoreId: lowerId,
      changedBy: userId,
      fieldName: 'merge',
      oldValue: `${mergingCS.coldStoreId} (${mergingCS.name})${pyInfo}`,
      newValue: `${mergedCount} linked records transferred`,
    });

    await db.update(coldStoreEditHistory)
      .set({ coldStoreId: lowerId })
      .where(and(eq(coldStoreEditHistory.coldStoreId, higherId), eq(coldStoreEditHistory.merchantId, merchantId)));

    await db.delete(coldStores)
      .where(and(eq(coldStores.id, higherId), eq(coldStores.merchantId, merchantId)));

    return { survivingColdStore: updatedSurvivor, mergedCount };
  }

  async getColdStoreEditHistory(coldStoreId: number, merchantId: number): Promise<ColdStoreEditHistoryType[]> {
    return await db.select()
      .from(coldStoreEditHistory)
      .where(and(
        eq(coldStoreEditHistory.coldStoreId, coldStoreId),
        eq(coldStoreEditHistory.merchantId, merchantId)
      ))
      .orderBy(desc(coldStoreEditHistory.changedAt));
  }

  async getNextColdStoreEditHistorySerialNumber(merchantId: number): Promise<number> {
    const [result] = await db.select({ maxSerial: sql<number>`COALESCE(MAX(${coldStoreEditHistory.serialNumber}), 0)` })
      .from(coldStoreEditHistory)
      .where(eq(coldStoreEditHistory.merchantId, merchantId));
    return (result?.maxSerial || 0) + 1;
  }

  async createColdStoreEditHistory(data: InsertColdStoreEditHistory): Promise<ColdStoreEditHistoryType> {
    const [created] = await db.insert(coldStoreEditHistory).values(data).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
