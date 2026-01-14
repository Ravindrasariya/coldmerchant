import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, date, boolean, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Merchants table - each merchant is isolated
export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactNumber: text("contact_number"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Users table - linked to merchants for multi-tenant access
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  mobileNumber: text("mobile_number"),
  merchantId: integer("merchant_id").references(() => merchants.id),
  isSystemAdmin: boolean("is_system_admin").default(false),
  canEdit: boolean("can_edit").default(true),
  mustChangePassword: boolean("must_change_password").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Stock Entries - main stock entry with farmer info
export const stockEntries = pgTable("stock_entries", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  serialNumber: integer("serial_number").notNull(),
  purchaseDate: date("purchase_date").notNull(),
  farmerName: text("farmer_name").notNull(),
  farmerContact: text("farmer_contact"),
  village: text("village"),
  tehsil: text("tehsil"),
  district: text("district").notNull(),
  state: text("state").notNull(),
  paymentStatus: text("payment_status").default("due"), // due, paid
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Lots - each stock entry can have multiple lots
export const lots = pgTable("lots", {
  id: serial("id").primaryKey(),
  stockEntryId: integer("stock_entry_id").notNull().references(() => stockEntries.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  coldStoreName: text("cold_store_name").notNull(),
  originalBags: integer("original_bags").notNull(),
  potatoType: text("potato_type").notNull(), // Jyoti, Pukhraj, Lakar, LR, Torus, CS1, CS3, Others
  bagType: text("bag_type").notNull(), // Wafer, Ration, Seed
  quality: text("quality").notNull(), // Poor, Medium, Good
  cutType: text("cut_type").notNull(), // gate_cut, bilty_cut
  size: text("size"), // Large, Medium, Small - for gate cut only
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }),
  coldStoreChargesPerBag: decimal("cold_store_charges_per_bag", { precision: 10, scale: 2 }), // charges per bag from cold store
  remainingBags: integer("remaining_bags").notNull(),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Bag Breakdowns - for bilty cut, multiple rows per lot
export const bagBreakdowns = pgTable("bag_breakdowns", {
  id: serial("id").primaryKey(),
  lotId: integer("lot_id").notNull().references(() => lots.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  size: text("size").notNull(), // Large, Medium, Small, Wastage
  numberOfBags: integer("number_of_bags").notNull(),
  remainingBags: integer("remaining_bags"), // tracks remaining per size, initially equals numberOfBags
  weight: decimal("weight", { precision: 10, scale: 2 }),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Stock Entry Edit History - tracks all modifications after initial creation
export const stockEntryEditHistory = pgTable("stock_entry_edit_history", {
  id: serial("id").primaryKey(),
  stockEntryId: integer("stock_entry_id").notNull().references(() => stockEntries.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  userId: integer("user_id").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changeSet: jsonb("change_set").notNull(), // Array of { scope, entityId, label, changes: [{ field, oldValue, newValue }] }
});

// Transactions - "Load A Truck" transactions
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  transactionNumber: integer("transaction_number").notNull(),
  partyName: text("party_name"),
  partyAddress: text("party_address"),
  vehicleNumber: text("vehicle_number"), // optional truck/vehicle number
  advancePayment: decimal("advance_payment", { precision: 12, scale: 2 }), // advance given to driver/transporter
  amountReceived: decimal("amount_received", { precision: 12, scale: 2 }), // payment received from buyer
  transportationCharges: decimal("transportation_charges", { precision: 12, scale: 2 }),
  otherCharges: decimal("other_charges", { precision: 12, scale: 2 }),
  revenue: decimal("revenue", { precision: 12, scale: 2 }),
  totalBags: integer("total_bags").notNull(),
  totalNetWeight: decimal("total_net_weight", { precision: 12, scale: 2 }),
  totalCostOfGoods: decimal("total_cost_of_goods", { precision: 12, scale: 2 }),
  profitLoss: decimal("profit_loss", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transaction Items - each lot selection in a transaction
export const transactionItems = pgTable("transaction_items", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  breakdownId: integer("breakdown_id").references(() => bagBreakdowns.id), // null for gate_cut lots
  serialNumber: integer("serial_number").notNull(), // cached from stock entry
  coldStoreName: text("cold_store_name").notNull(), // cached
  potatoType: text("potato_type"), // cached potato type for display
  size: text("size"), // cached size for display
  bagsMoved: integer("bags_moved").notNull(),
  netWeight: decimal("net_weight", { precision: 12, scale: 2 }),
  pricePerKgSnapshot: decimal("price_per_kg_snapshot", { precision: 10, scale: 2 }),
  costOfGoods: decimal("cost_of_goods", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transaction Edit History - tracks modifications to transactions
export const transactionEditHistory = pgTable("transaction_edit_history", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  userId: integer("user_id").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changeSet: jsonb("change_set").notNull(), // Array of { field, oldValue, newValue }
});

// Cash Entries - for Cash Management (inward and outflow)
export const cashEntries = pgTable("cash_entries", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  direction: text("direction").notNull(), // "inward" or "outflow"
  receiptType: text("receipt_type"), // For inward: "cash_received", "account_received"
  expenseType: text("expense_type"), // For outflow: "salary", "general_expense", "grading", "hammali", "farmer"
  paymentMode: text("payment_mode"), // For outflow: "cash", "account_transfer"
  partyName: text("party_name"), // For inward: buyer name from transactions
  partyVillage: text("party_village"), // For inward: buyer location
  farmerName: text("farmer_name"), // For farmer outflow
  farmerVillage: text("farmer_village"), // For farmer outflow
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  entryDate: date("entry_date").notNull(),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Cash Entry Allocations - tracks which transactions a cash inward was applied to (FIFO)
export const cashEntryAllocations = pgTable("cash_entry_allocations", {
  id: serial("id").primaryKey(),
  cashEntryId: integer("cash_entry_id").notNull().references(() => cashEntries.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  appliedAmount: decimal("applied_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const merchantsRelations = relations(merchants, ({ many }) => ({
  users: many(users),
  stockEntries: many(stockEntries),
  lots: many(lots),
  bagBreakdowns: many(bagBreakdowns),
  transactions: many(transactions),
  transactionItems: many(transactionItems),
  cashEntries: many(cashEntries),
  cashEntryAllocations: many(cashEntryAllocations),
}));

export const usersRelations = relations(users, ({ one }) => ({
  merchant: one(merchants, {
    fields: [users.merchantId],
    references: [merchants.id],
  }),
}));

export const stockEntriesRelations = relations(stockEntries, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [stockEntries.merchantId],
    references: [merchants.id],
  }),
  lots: many(lots),
  editHistory: many(stockEntryEditHistory),
}));

export const stockEntryEditHistoryRelations = relations(stockEntryEditHistory, ({ one }) => ({
  stockEntry: one(stockEntries, {
    fields: [stockEntryEditHistory.stockEntryId],
    references: [stockEntries.id],
  }),
  merchant: one(merchants, {
    fields: [stockEntryEditHistory.merchantId],
    references: [merchants.id],
  }),
  user: one(users, {
    fields: [stockEntryEditHistory.userId],
    references: [users.id],
  }),
}));

export const lotsRelations = relations(lots, ({ one, many }) => ({
  stockEntry: one(stockEntries, {
    fields: [lots.stockEntryId],
    references: [stockEntries.id],
  }),
  merchant: one(merchants, {
    fields: [lots.merchantId],
    references: [merchants.id],
  }),
  bagBreakdowns: many(bagBreakdowns),
}));

export const bagBreakdownsRelations = relations(bagBreakdowns, ({ one }) => ({
  lot: one(lots, {
    fields: [bagBreakdowns.lotId],
    references: [lots.id],
  }),
  merchant: one(merchants, {
    fields: [bagBreakdowns.merchantId],
    references: [merchants.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [transactions.merchantId],
    references: [merchants.id],
  }),
  items: many(transactionItems),
  editHistory: many(transactionEditHistory),
}));

export const transactionItemsRelations = relations(transactionItems, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionItems.transactionId],
    references: [transactions.id],
  }),
  merchant: one(merchants, {
    fields: [transactionItems.merchantId],
    references: [merchants.id],
  }),
  lot: one(lots, {
    fields: [transactionItems.lotId],
    references: [lots.id],
  }),
}));

export const transactionEditHistoryRelations = relations(transactionEditHistory, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionEditHistory.transactionId],
    references: [transactions.id],
  }),
  merchant: one(merchants, {
    fields: [transactionEditHistory.merchantId],
    references: [merchants.id],
  }),
  user: one(users, {
    fields: [transactionEditHistory.userId],
    references: [users.id],
  }),
}));

export const cashEntriesRelations = relations(cashEntries, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [cashEntries.merchantId],
    references: [merchants.id],
  }),
  allocations: many(cashEntryAllocations),
}));

export const cashEntryAllocationsRelations = relations(cashEntryAllocations, ({ one }) => ({
  cashEntry: one(cashEntries, {
    fields: [cashEntryAllocations.cashEntryId],
    references: [cashEntries.id],
  }),
  transaction: one(transactions, {
    fields: [cashEntryAllocations.transactionId],
    references: [transactions.id],
  }),
  merchant: one(merchants, {
    fields: [cashEntryAllocations.merchantId],
    references: [merchants.id],
  }),
}));

// Zod schemas for validation
export const insertMerchantSchema = createInsertSchema(merchants).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertStockEntrySchema = createInsertSchema(stockEntries).omit({ id: true, createdAt: true, updatedAt: true, serialNumber: true });
export const insertLotSchema = createInsertSchema(lots).omit({ id: true, createdAt: true });
export const insertBagBreakdownSchema = createInsertSchema(bagBreakdowns).omit({ id: true, createdAt: true });
export const insertStockEntryEditHistorySchema = createInsertSchema(stockEntryEditHistory).omit({ id: true, changedAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true, transactionNumber: true });
export const insertTransactionItemSchema = createInsertSchema(transactionItems).omit({ id: true, createdAt: true });
export const insertTransactionEditHistorySchema = createInsertSchema(transactionEditHistory).omit({ id: true, changedAt: true });
export const insertCashEntrySchema = createInsertSchema(cashEntries).omit({ id: true, createdAt: true });
export const insertCashEntryAllocationSchema = createInsertSchema(cashEntryAllocations).omit({ id: true, createdAt: true });

// Types
export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type StockEntry = typeof stockEntries.$inferSelect;
export type InsertStockEntry = z.infer<typeof insertStockEntrySchema>;

export type Lot = typeof lots.$inferSelect;
export type InsertLot = z.infer<typeof insertLotSchema>;

export type BagBreakdown = typeof bagBreakdowns.$inferSelect;
export type InsertBagBreakdown = z.infer<typeof insertBagBreakdownSchema>;

export type StockEntryEditHistory = typeof stockEntryEditHistory.$inferSelect;
export type InsertStockEntryEditHistory = z.infer<typeof insertStockEntryEditHistorySchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type TransactionItem = typeof transactionItems.$inferSelect;
export type InsertTransactionItem = z.infer<typeof insertTransactionItemSchema>;

export type TransactionEditHistory = typeof transactionEditHistory.$inferSelect;
export type InsertTransactionEditHistory = z.infer<typeof insertTransactionEditHistorySchema>;

export type CashEntry = typeof cashEntries.$inferSelect;
export type InsertCashEntry = z.infer<typeof insertCashEntrySchema>;

export type CashEntryAllocation = typeof cashEntryAllocations.$inferSelect;
export type InsertCashEntryAllocation = z.infer<typeof insertCashEntryAllocationSchema>;

// Change types for edit history
export type FieldChange = {
  field: string;
  oldValue: string | number | null;
  newValue: string | number | null;
};

export type ChangeItem = {
  scope: 'entry' | 'lot' | 'breakdown';
  entityId?: number;
  label: string;
  changes: FieldChange[];
};

export type ChangeSet = ChangeItem[];

// Extended types for frontend use
export const bagBreakdownFormSchema = z.object({
  size: z.string().min(1, "Size is required"),
  numberOfBags: z.coerce.number().min(0, "Number of bags must be positive"),
  weight: z.coerce.number().optional(),
  pricePerKg: z.coerce.number().optional(),
});

export const lotFormSchema = z.object({
  coldStoreName: z.string().min(1, "Cold store name is required"),
  originalBags: z.coerce.number().min(1, "Original bags must be at least 1"),
  potatoType: z.string().min(1, "Potato type is required"),
  bagType: z.string().min(1, "Bag type is required"),
  quality: z.string().min(1, "Quality is required"),
  cutType: z.enum(["gate_cut", "bilty_cut"]),
  size: z.string().optional(),
  pricePerKg: z.coerce.number().optional(),
  coldStoreChargesPerBag: z.coerce.number().optional(), // charges per bag from cold store
  remarks: z.string().optional(),
  bagBreakdowns: z.array(bagBreakdownFormSchema).optional(),
});

export const stockEntryFormSchema = z.object({
  purchaseDate: z.string().min(1, "Purchase date is required"),
  farmerName: z.string().min(1, "Farmer name is required"),
  farmerContact: z.string().optional(),
  village: z.string().optional(),
  tehsil: z.string().optional(),
  district: z.string().min(1, "District is required"),
  state: z.string().min(1, "State is required"),
  remarks: z.string().optional(),
  lots: z.array(lotFormSchema).min(1, "At least one lot is required"),
});

export type BagBreakdownForm = z.infer<typeof bagBreakdownFormSchema>;
export type LotForm = z.infer<typeof lotFormSchema>;
export type StockEntryForm = z.infer<typeof stockEntryFormSchema>;

// Transaction form schemas for frontend
export const transactionItemFormSchema = z.object({
  lotId: z.coerce.number().min(1, "Lot is required"),
  bagsMoved: z.coerce.number().min(1, "Number of bags is required"),
  netWeight: z.coerce.number().optional(),
});

export const transactionFormSchema = z.object({
  partyName: z.string().optional(),
  advancePayment: z.coerce.number().optional(),
  transportationCharges: z.coerce.number().optional(),
  otherCharges: z.coerce.number().optional(),
  revenue: z.coerce.number().optional(),
  items: z.array(transactionItemFormSchema).min(1, "At least one lot is required"),
});

export type TransactionItemForm = z.infer<typeof transactionItemFormSchema>;
export type TransactionForm = z.infer<typeof transactionFormSchema>;

// Dropdown options
export const DISTRICTS = ["Ujjain", "Shajapur", "Indore", "Dewas", "Agar Malwa"] as const;
export const STATES = ["Madhya Pradesh", "Gujarat"] as const;
export const POTATO_TYPES = ["Jyoti", "Pukhraj", "Lakar", "LR", "Torus", "CS1", "CS3", "Others"] as const;
export const BAG_TYPES = ["Wafer", "Ration", "Seed"] as const;
export const QUALITY_OPTIONS = ["Poor", "Medium", "Good"] as const;
export const CUT_TYPES = ["gate_cut", "bilty_cut"] as const;
export const SIZE_OPTIONS = ["Large", "Medium", "Small", "Wastage"] as const;
export const PAYMENT_STATUS = ["due", "paid"] as const;

// Cash Management Options
export const RECEIPT_TYPES = ["cash_received", "account_received"] as const;
export const EXPENSE_TYPES = ["salary", "general_expense", "grading", "hammali", "farmer"] as const;
export const PAYMENT_MODES = ["cash", "account_transfer"] as const;
export const CASH_DIRECTIONS = ["inward", "outflow"] as const;
