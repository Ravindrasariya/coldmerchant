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
  paymentStatus: text("payment_status").default("due"), // due, partial, paid
  amountPaid: decimal("amount_paid", { precision: 12, scale: 2 }).default("0"), // amount paid to farmer
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Charge types for dynamic charges system
export const CHARGE_TYPES = [
  "Advance",
  "Bag Charges",
  "Cold Charges",
  "Freight Charges",
  "Grading Charges",
  "Hammali Charges",
  "Kata Charges",
  "Other Charges",
  "Ware House Charges",
] as const;

// Lots - each stock entry can have multiple lots
export const lots = pgTable("lots", {
  id: serial("id").primaryKey(),
  stockEntryId: integer("stock_entry_id").notNull().references(() => stockEntries.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  place: text("place").default("cold_store"), // farm_gate, cold_store
  coldStoreName: text("cold_store_name"), // required only for cold_store place (made nullable)
  coldStoreLotNumber: text("cold_store_lot_number"), // lot number at cold store
  crop: text("crop").default("potato"), // potato, onion
  originalBags: integer("original_bags").notNull(),
  potatoType: text("potato_type"), // Jyoti, Pukhraj, Lakar, LR, Torus, CS1, CS3, Others - variety (potato only, made nullable)
  harvestPotatoType: text("harvest_potato_type"), // Wafer, Ration, Seed - for potato crop only
  bagType: text("bag_type").notNull(), // editable text field now
  quality: text("quality").notNull(), // Poor, Medium, Good
  cutType: text("cut_type").notNull(), // gate_cut, bilty_cut (now called Delivery Type in UI)
  size: text("size"), // Large, Medium, Small - for gate cut only
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }),
  charges: jsonb("charges"), // Dynamic charges array: [{ type: string, amount: number }]
  expectedColdCharges: decimal("expected_cold_charges", { precision: 12, scale: 2 }), // legacy: total expected cold storage charges
  coldStoreChargesPerBag: decimal("cold_store_charges_per_bag", { precision: 10, scale: 2 }), // legacy: charges per bag from cold store
  hammaliGradingCharges: decimal("hammali_grading_charges", { precision: 12, scale: 2 }), // legacy: hammali and grading charges
  coldStorageChargesPaid: decimal("cold_storage_charges_paid", { precision: 12, scale: 2 }).default("0"), // total amount paid towards cold store charges
  adjustedAmount: decimal("adjusted_amount", { precision: 12, scale: 2 }), // adjustment amount for farmer due
  adjustedAmountType: text("adjusted_amount_type"), // "debit" or "credit"
  adjustedAmountRemark: text("adjusted_amount_remark"), // reason for adjustment
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
  revenue: decimal("revenue", { precision: 12, scale: 2 }), // per-item revenue for P&L calculation
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
  revenueType: text("revenue_type"), // For inward: "raw_potato", "seed_sale"
  expenseType: text("expense_type"), // For outflow: "salary", "general_expense", "grading", "hammali", "farmer", "cold_store_charge"
  paymentMode: text("payment_mode"), // For outflow: "cash", "account_transfer"
  partyName: text("party_name"), // For inward: buyer name from transactions
  partyVillage: text("party_village"), // For inward: buyer location
  farmerName: text("farmer_name"), // For farmer outflow or seed sale inward
  farmerVillage: text("farmer_village"), // For farmer outflow or seed sale inward
  coldStoreName: text("cold_store_name"), // For cold store charge payment outflow
  supplierName: text("supplier_name"), // For supplier outflow (seed stock suppliers)
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  entryDate: date("entry_date").notNull(),
  remarks: text("remarks"),
  isReversed: boolean("is_reversed").default(false), // soft delete flag
  reversedAt: timestamp("reversed_at"), // when the entry was reversed
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

// Cold Store Charge Allocations - tracks which lots a cold store payment was applied to (FIFO)
export const coldStoreChargeAllocations = pgTable("cold_store_charge_allocations", {
  id: serial("id").primaryKey(),
  cashEntryId: integer("cash_entry_id").notNull().references(() => cashEntries.id, { onDelete: "cascade" }),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  appliedAmount: decimal("applied_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Cash Settings - opening balances for each financial year
export const cashSettings = pgTable("cash_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  financialYear: text("financial_year").notNull(), // e.g., "2024-25"
  openingCashInHand: decimal("opening_cash_in_hand", { precision: 12, scale: 2 }).default("0"),
  openingCashInAccount: decimal("opening_cash_in_account", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Parties - buyer/party management with pending dues
export const parties = pgTable("parties", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  name: text("name").notNull(),
  contactNumber: text("contact_number"),
  address: text("address"),
  pendingDues: decimal("pending_dues", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Cash Farmers - farmer management for cash payments with pending dues
export const cashFarmers = pgTable("cash_farmers", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  name: text("name").notNull(),
  contactNumber: text("contact_number"),
  address: text("address"),
  pendingDueToBePaid: decimal("pending_due_to_be_paid", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ===================== SEED MANAGEMENT TABLES =====================

// Seed Stock Entries - supplier info for seed purchases
export const seedStockEntries = pgTable("seed_stock_entries", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  serialNumber: integer("serial_number").notNull(),
  purchaseDate: date("purchase_date").notNull(),
  supplierName: text("supplier_name").notNull(),
  supplierContact: text("supplier_contact"),
  address: text("address"),
  district: text("district").notNull(),
  state: text("state").notNull(),
  paymentStatus: text("payment_status").default("due"), // due, partial, paid
  amountPaid: decimal("amount_paid", { precision: 12, scale: 2 }).default("0"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Seed Lots - each seed stock entry can have multiple lots
export const seedLots = pgTable("seed_lots", {
  id: serial("id").primaryKey(),
  seedEntryId: integer("seed_entry_id").notNull().references(() => seedStockEntries.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  coldStoreName: text("cold_store_name").notNull(),
  originalBags: integer("original_bags").notNull(),
  potatoType: text("potato_type").notNull(), // Jyoti, Pukhraj, Lakar, CS1, CS3, Torus, LR
  bagType: text("bag_type").notNull(), // Wafer, Ration
  size: text("size").notNull(), // Small, Medium, Large
  pricePerBag: decimal("price_per_bag", { precision: 10, scale: 2 }).notNull(),
  coldStoreChargesPerBag: decimal("cold_store_charges_per_bag", { precision: 10, scale: 2 }),
  coldStoreChargesPaid: decimal("cold_store_charges_paid", { precision: 12, scale: 2 }).default("0"),
  hammaliCharges: decimal("hammali_charges", { precision: 12, scale: 2 }),
  gradingCharges: decimal("grading_charges", { precision: 12, scale: 2 }),
  transportCharges: decimal("transport_charges", { precision: 12, scale: 2 }),
  remainingBags: integer("remaining_bags").notNull(),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Seed Stock Entry Edit History - tracks all modifications after initial creation
export const seedStockEntryEditHistory = pgTable("seed_stock_entry_edit_history", {
  id: serial("id").primaryKey(),
  seedEntryId: integer("seed_entry_id").notNull().references(() => seedStockEntries.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  userId: integer("user_id").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changeSet: jsonb("change_set").notNull(), // Array of { scope, entityId, label, changes: [{ field, oldValue, newValue }] }
});

// Seed Transactions - "Load a Seed Truck" transactions
export const seedTransactions = pgTable("seed_transactions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  transactionNumber: integer("transaction_number").notNull(),
  farmerName: text("farmer_name").notNull(),
  farmerContact: text("farmer_contact"),
  village: text("village"),
  tehsil: text("tehsil"),
  district: text("district").notNull(),
  state: text("state").notNull(),
  vehicleNumber: text("vehicle_number"),
  transportCharges: decimal("transport_charges", { precision: 12, scale: 2 }),
  otherCharges: decimal("other_charges", { precision: 12, scale: 2 }),
  otherChargesRemarks: text("other_charges_remarks"),
  totalBags: integer("total_bags").notNull(),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }), // cost of goods from seed lots
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }), // revenue from sale
  totalProfitLoss: decimal("total_profit_loss", { precision: 12, scale: 2 }),
  totalDueToFarmer: decimal("total_due_to_farmer", { precision: 12, scale: 2 }), // Revenue + Transport + Other charges
  createdAt: timestamp("created_at").defaultNow(),
});

// Seed Transaction Items - each seed lot selection in a transaction
export const seedTransactionItems = pgTable("seed_transaction_items", {
  id: serial("id").primaryKey(),
  seedTransactionId: integer("seed_transaction_id").notNull().references(() => seedTransactions.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  seedLotId: integer("seed_lot_id").notNull().references(() => seedLots.id),
  serialNumber: integer("serial_number").notNull(), // cached from seed stock entry
  coldStoreName: text("cold_store_name").notNull(), // cached
  potatoType: text("potato_type").notNull(), // cached
  size: text("size").notNull(), // cached
  bagType: text("bag_type").notNull(), // cached
  bagsMoved: integer("bags_moved").notNull(),
  pricePerBag: decimal("price_per_bag", { precision: 10, scale: 2 }).notNull(), // sale price per bag
  costPerBag: decimal("cost_per_bag", { precision: 10, scale: 2 }).notNull(), // purchase cost from seed lot
  revenue: decimal("revenue", { precision: 12, scale: 2 }).notNull(), // bags * pricePerBag
  cost: decimal("cost", { precision: 12, scale: 2 }).notNull(), // bags * costPerBag
  profitLoss: decimal("profit_loss", { precision: 12, scale: 2 }).notNull(), // revenue - cost
  createdAt: timestamp("created_at").defaultNow(),
});

// Seed Transaction Edit History - tracks modifications to seed transactions
export const seedTransactionEditHistory = pgTable("seed_transaction_edit_history", {
  id: serial("id").primaryKey(),
  seedTransactionId: integer("seed_transaction_id").notNull().references(() => seedTransactions.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  userId: integer("user_id").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changeSet: jsonb("change_set").notNull(), // Array of { field, oldValue, newValue }
});

// Farmer Settlements - tracks cross-module adjustments between raw potato and seed transactions
export const farmerSettlements = pgTable("farmer_settlements", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  userId: integer("user_id").references(() => users.id),
  settlementDirection: text("settlement_direction").notNull(), // "raw_to_seed" (paying farmer, offset seed dues) or "seed_to_raw" (receiving seed payment, offset raw potato dues)
  settledAmount: decimal("settled_amount", { precision: 12, scale: 2 }).notNull(),
  // Farmer identity for matching
  farmerName: text("farmer_name").notNull(),
  farmerVillage: text("farmer_village"),
  farmerContact: text("farmer_contact"),
  // Source entries affected (can be multiple, stored as JSON array of IDs)
  rawPotatoStockEntryIds: jsonb("raw_potato_stock_entry_ids"), // IDs of stock entries affected
  seedTransactionIds: jsonb("seed_transaction_ids"), // IDs of seed transactions affected
  // Related cash entry if this was triggered by a payment
  cashEntryId: integer("cash_entry_id").references(() => cashEntries.id),
  remarks: text("remarks"),
  settledAt: timestamp("settled_at").defaultNow(),
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
  coldStoreChargeAllocations: many(coldStoreChargeAllocations),
  cashSettings: many(cashSettings),
  parties: many(parties),
  cashFarmers: many(cashFarmers),
  seedStockEntries: many(seedStockEntries),
  seedLots: many(seedLots),
  seedTransactions: many(seedTransactions),
  seedTransactionItems: many(seedTransactionItems),
  farmerSettlements: many(farmerSettlements),
}));

// Seed Stock Entries Relations
export const seedStockEntriesRelations = relations(seedStockEntries, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [seedStockEntries.merchantId],
    references: [merchants.id],
  }),
  seedLots: many(seedLots),
  editHistory: many(seedStockEntryEditHistory),
}));

// Seed Stock Entry Edit History Relations
export const seedStockEntryEditHistoryRelations = relations(seedStockEntryEditHistory, ({ one }) => ({
  seedEntry: one(seedStockEntries, {
    fields: [seedStockEntryEditHistory.seedEntryId],
    references: [seedStockEntries.id],
  }),
  merchant: one(merchants, {
    fields: [seedStockEntryEditHistory.merchantId],
    references: [merchants.id],
  }),
  user: one(users, {
    fields: [seedStockEntryEditHistory.userId],
    references: [users.id],
  }),
}));

// Seed Lots Relations
export const seedLotsRelations = relations(seedLots, ({ one, many }) => ({
  seedEntry: one(seedStockEntries, {
    fields: [seedLots.seedEntryId],
    references: [seedStockEntries.id],
  }),
  merchant: one(merchants, {
    fields: [seedLots.merchantId],
    references: [merchants.id],
  }),
  seedTransactionItems: many(seedTransactionItems),
}));

// Seed Transaction Relations
export const seedTransactionsRelations = relations(seedTransactions, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [seedTransactions.merchantId],
    references: [merchants.id],
  }),
  items: many(seedTransactionItems),
  editHistory: many(seedTransactionEditHistory),
}));

// Seed Transaction Edit History Relations
export const seedTransactionEditHistoryRelations = relations(seedTransactionEditHistory, ({ one }) => ({
  seedTransaction: one(seedTransactions, {
    fields: [seedTransactionEditHistory.seedTransactionId],
    references: [seedTransactions.id],
  }),
  merchant: one(merchants, {
    fields: [seedTransactionEditHistory.merchantId],
    references: [merchants.id],
  }),
  user: one(users, {
    fields: [seedTransactionEditHistory.userId],
    references: [users.id],
  }),
}));

// Seed Transaction Items Relations
export const seedTransactionItemsRelations = relations(seedTransactionItems, ({ one }) => ({
  seedTransaction: one(seedTransactions, {
    fields: [seedTransactionItems.seedTransactionId],
    references: [seedTransactions.id],
  }),
  merchant: one(merchants, {
    fields: [seedTransactionItems.merchantId],
    references: [merchants.id],
  }),
  seedLot: one(seedLots, {
    fields: [seedTransactionItems.seedLotId],
    references: [seedLots.id],
  }),
}));

export const cashSettingsRelations = relations(cashSettings, ({ one }) => ({
  merchant: one(merchants, {
    fields: [cashSettings.merchantId],
    references: [merchants.id],
  }),
}));

export const partiesRelations = relations(parties, ({ one }) => ({
  merchant: one(merchants, {
    fields: [parties.merchantId],
    references: [merchants.id],
  }),
}));

export const cashFarmersRelations = relations(cashFarmers, ({ one }) => ({
  merchant: one(merchants, {
    fields: [cashFarmers.merchantId],
    references: [merchants.id],
  }),
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

export const coldStoreChargeAllocationsRelations = relations(coldStoreChargeAllocations, ({ one }) => ({
  cashEntry: one(cashEntries, {
    fields: [coldStoreChargeAllocations.cashEntryId],
    references: [cashEntries.id],
  }),
  lot: one(lots, {
    fields: [coldStoreChargeAllocations.lotId],
    references: [lots.id],
  }),
  merchant: one(merchants, {
    fields: [coldStoreChargeAllocations.merchantId],
    references: [merchants.id],
  }),
}));

export const farmerSettlementsRelations = relations(farmerSettlements, ({ one }) => ({
  merchant: one(merchants, {
    fields: [farmerSettlements.merchantId],
    references: [merchants.id],
  }),
  user: one(users, {
    fields: [farmerSettlements.userId],
    references: [users.id],
  }),
  cashEntry: one(cashEntries, {
    fields: [farmerSettlements.cashEntryId],
    references: [cashEntries.id],
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
export const insertColdStoreChargeAllocationSchema = createInsertSchema(coldStoreChargeAllocations).omit({ id: true, createdAt: true });
export const insertCashSettingsSchema = createInsertSchema(cashSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPartySchema = createInsertSchema(parties).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCashFarmerSchema = createInsertSchema(cashFarmers).omit({ id: true, createdAt: true, updatedAt: true });

// Seed schemas
export const insertSeedStockEntrySchema = createInsertSchema(seedStockEntries).omit({ id: true, createdAt: true, updatedAt: true, serialNumber: true });
export const insertSeedLotSchema = createInsertSchema(seedLots).omit({ id: true, createdAt: true });
export const insertSeedStockEntryEditHistorySchema = createInsertSchema(seedStockEntryEditHistory).omit({ id: true, changedAt: true });
export const insertSeedTransactionSchema = createInsertSchema(seedTransactions).omit({ id: true, createdAt: true, transactionNumber: true });
export const insertSeedTransactionItemSchema = createInsertSchema(seedTransactionItems).omit({ id: true, createdAt: true });
export const insertSeedTransactionEditHistorySchema = createInsertSchema(seedTransactionEditHistory).omit({ id: true, changedAt: true });

// Farmer settlement schema
export const insertFarmerSettlementSchema = createInsertSchema(farmerSettlements).omit({ id: true, settledAt: true });

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

export type ColdStoreChargeAllocation = typeof coldStoreChargeAllocations.$inferSelect;
export type InsertColdStoreChargeAllocation = z.infer<typeof insertColdStoreChargeAllocationSchema>;

export type CashSettings = typeof cashSettings.$inferSelect;
export type InsertCashSettings = z.infer<typeof insertCashSettingsSchema>;

export type Party = typeof parties.$inferSelect;
export type InsertParty = z.infer<typeof insertPartySchema>;

export type CashFarmer = typeof cashFarmers.$inferSelect;
export type InsertCashFarmer = z.infer<typeof insertCashFarmerSchema>;

export type SeedStockEntry = typeof seedStockEntries.$inferSelect;
export type InsertSeedStockEntry = z.infer<typeof insertSeedStockEntrySchema>;

export type SeedLot = typeof seedLots.$inferSelect;
export type InsertSeedLot = z.infer<typeof insertSeedLotSchema>;

export type SeedStockEntryEditHistory = typeof seedStockEntryEditHistory.$inferSelect;
export type InsertSeedStockEntryEditHistory = z.infer<typeof insertSeedStockEntryEditHistorySchema>;

export type SeedTransaction = typeof seedTransactions.$inferSelect;
export type InsertSeedTransaction = z.infer<typeof insertSeedTransactionSchema>;

export type SeedTransactionItem = typeof seedTransactionItems.$inferSelect;
export type InsertSeedTransactionItem = z.infer<typeof insertSeedTransactionItemSchema>;

export type SeedTransactionEditHistory = typeof seedTransactionEditHistory.$inferSelect;
export type InsertSeedTransactionEditHistory = z.infer<typeof insertSeedTransactionEditHistorySchema>;

export type FarmerSettlement = typeof farmerSettlements.$inferSelect;
export type InsertFarmerSettlement = z.infer<typeof insertFarmerSettlementSchema>;

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

// Schema for individual charge entry
export const chargeEntrySchema = z.object({
  type: z.string().min(1, "Charge type is required"),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
});

export type ChargeEntry = z.infer<typeof chargeEntrySchema>;

export const lotFormSchema = z.object({
  place: z.enum(["farm_gate", "cold_store"]).default("cold_store"),
  coldStoreName: z.string().optional(), // required only for cold_store place
  coldStoreLotNumber: z.string().optional(), // lot number at cold store
  crop: z.enum(["potato", "onion"]).default("potato"),
  originalBags: z.coerce.number().min(1, "Original bags must be at least 1"),
  potatoType: z.string().optional(), // variety - required only for potato crop
  harvestPotatoType: z.string().optional(), // Wafer, Ration, Seed - for potato crop only
  bagType: z.string().min(1, "Bag type is required"), // editable text field
  quality: z.string().min(1, "Quality is required"),
  cutType: z.enum(["gate_cut", "bilty_cut"]), // now called Delivery Type in UI
  size: z.string().optional(),
  pricePerKg: z.coerce.number().optional(),
  charges: z.array(chargeEntrySchema).optional(), // Dynamic charges array
  adjustedAmount: z.coerce.number().optional(), // adjustment amount for farmer due
  adjustedAmountType: z.enum(["debit", "credit"]).optional(), // debit or credit
  adjustedAmountRemark: z.string().optional(), // reason for adjustment
  remarks: z.string().optional(),
  bagBreakdowns: z.array(bagBreakdownFormSchema).optional(),
});

export const stockEntryFormSchema = z.object({
  purchaseDate: z.string().min(1, "Purchase date is required"),
  farmerName: z.string().min(1, "Farmer name is required"),
  farmerContact: z.string().min(1, "Contact number is required"),
  village: z.string().min(1, "Village name is required"),
  tehsil: z.string().min(1, "Tehsil is required"),
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
export const SEED_DISTRICTS = ["Ujjain", "Agar Malwa", "Shajapur", "Dewas", "Indore", "Ratlam", "Rajgarh", "Other"] as const;
export const STATES = ["Madhya Pradesh", "Gujarat"] as const;
export const PLACE_OPTIONS = ["farm_gate", "cold_store"] as const;
export const CROP_OPTIONS = ["potato", "onion"] as const;
export const POTATO_TYPES = ["Jyoti", "Pukhraj", "Lakar", "LR", "Torus", "CS1", "CS3", "Others"] as const;
export const HARVEST_POTATO_TYPES = ["Wafer", "Ration", "Seed"] as const; // Potato type for harvest entries
export const SEED_POTATO_TYPES = ["Jyoti", "Pukhraj", "Lakar", "CS1", "CS3", "Torus", "LR"] as const;
export const BAG_TYPES = ["Wafer", "Ration", "Seed"] as const;
export const SEED_BAG_TYPES = ["Wafer", "Ration"] as const;
export const QUALITY_OPTIONS = ["Poor", "Medium", "Good"] as const;
export const CUT_TYPES = ["gate_cut", "bilty_cut"] as const; // Delivery Types
export const SIZE_OPTIONS = ["Large", "Medium", "Small", "Wastage"] as const;
export const SEED_SIZE_OPTIONS = ["Small", "Medium", "Large"] as const;
export const PAYMENT_STATUS = ["due", "paid"] as const;

// Cash Management Options
export const RECEIPT_TYPES = ["cash_received", "account_received"] as const;
export const EXPENSE_TYPES = ["salary", "general_expense", "grading", "hammali", "farmer", "cold_store_charge", "supplier"] as const;
export const PAYMENT_MODES = ["cash", "account_transfer"] as const;
export const CASH_DIRECTIONS = ["inward", "outflow"] as const;

// Seed form schemas for frontend
export const seedLotFormSchema = z.object({
  coldStoreName: z.string().min(1, "Cold store name is required"),
  originalBags: z.coerce.number().min(1, "Original bags must be at least 1"),
  potatoType: z.string().min(1, "Potato type is required"),
  bagType: z.string().min(1, "Bag type is required"),
  size: z.string().min(1, "Size is required"),
  pricePerBag: z.coerce.number().min(0, "Price per bag must be positive"),
  coldStoreChargesPerBag: z.coerce.number().optional(),
  remarks: z.string().optional(),
});

export const seedStockEntryFormSchema = z.object({
  purchaseDate: z.string().min(1, "Purchase date is required"),
  supplierName: z.string().min(1, "Supplier name is required"),
  supplierContact: z.string().min(1, "Contact number is required"),
  address: z.string().min(1, "Address is required"),
  district: z.string().min(1, "District is required"),
  state: z.string().min(1, "State is required"),
  remarks: z.string().optional(),
  seedLots: z.array(seedLotFormSchema).min(1, "At least one seed lot is required"),
});

export type SeedLotForm = z.infer<typeof seedLotFormSchema>;
export type SeedStockEntryForm = z.infer<typeof seedStockEntryFormSchema>;

// Seed update schema for PATCH endpoint
export const seedLotUpdateSchema = z.object({
  id: z.number(),
  coldStoreName: z.string().min(1).optional(),
  originalBags: z.coerce.number().min(1).optional(),
  remainingBags: z.coerce.number().min(0).optional(),
  potatoType: z.string().min(1).optional(),
  bagType: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
  pricePerBag: z.coerce.number().min(0).optional(),
  coldStoreChargesPerBag: z.coerce.number().optional(),
  coldStoreChargesPaid: z.coerce.number().optional(),
  hammaliCharges: z.coerce.number().optional(),
  gradingCharges: z.coerce.number().optional(),
  transportCharges: z.coerce.number().optional(),
  remarks: z.string().optional(),
});

export const seedStockEntryUpdateSchema = z.object({
  paymentStatus: z.enum(PAYMENT_STATUS).optional(),
  amountPaid: z.coerce.number().optional(),
  remarks: z.string().optional(),
  seedLots: z.array(seedLotUpdateSchema).optional(),
});

export type SeedLotUpdate = z.infer<typeof seedLotUpdateSchema>;
export type SeedStockEntryUpdate = z.infer<typeof seedStockEntryUpdateSchema>;

// Extended type for seed entry with lots
export type SeedStockEntryWithLots = SeedStockEntry & {
  seedLots: SeedLot[];
};

// Seed Transaction form schemas for frontend
export const seedTransactionItemFormSchema = z.object({
  seedLotId: z.coerce.number().min(1, "Seed lot is required"),
  bagsMoved: z.coerce.number().min(1, "Number of bags is required"),
  pricePerBag: z.coerce.number().min(0, "Price per bag must be positive"),
});

export const seedTransactionFormSchema = z.object({
  farmerName: z.string().min(1, "Farmer name is required"),
  farmerContact: z.string().optional(),
  village: z.string().optional(),
  tehsil: z.string().optional(),
  district: z.string().min(1, "District is required"),
  state: z.string().min(1, "State is required"),
  vehicleNumber: z.string().optional(),
  transportCharges: z.coerce.number().optional(),
  otherCharges: z.coerce.number().optional(),
  otherChargesRemarks: z.string().optional(),
  items: z.array(seedTransactionItemFormSchema).min(1, "At least one seed lot is required"),
});

export type SeedTransactionItemForm = z.infer<typeof seedTransactionItemFormSchema>;
export type SeedTransactionForm = z.infer<typeof seedTransactionFormSchema>;

// Extended type for seed transaction with items
export type SeedTransactionWithItems = SeedTransaction & {
  items: SeedTransactionItem[];
};
