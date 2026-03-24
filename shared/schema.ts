import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, date, boolean, serial, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Merchants table - each merchant is isolated
export const MERCHANT_STATUS = ["active", "inactive", "archived"] as const;

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  merchantCode: text("merchant_code").unique(), // Format: MRYYYYMMDD{seq} - globally unique
  name: text("name").notNull(),
  contactNumber: text("contact_number"),
  address: text("address"),
  receiptHeaderImage: text("receipt_header_image"),
  status: text("status").default("active").notNull(), // active, inactive, archived
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

// Session table - managed by connect-pg-simple for express-session
// This definition ensures drizzle-kit recognizes the table and doesn't try to delete it
export const session = pgTable("session", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// Stock Entries - main stock entry with farmer info
export const stockEntries = pgTable("stock_entries", {
  id: serial("id").primaryKey(),
  uniqueId: text("unique_id"), // HSE + YYYYMMDD + sequence (e.g., HSE202602021)
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  serialNumber: integer("serial_number").notNull(),
  crop: text("crop").default("potato"), // potato, onion, or garlic - for separate serial number sequences
  purchaseDate: date("purchase_date").notNull(),
  place: text("place").default("cold_store"), // farm_gate, cold_store, mandi
  farmerId: integer("farmer_id").references(() => farmers.id), // links to farmer ledger for matching
  farmerName: text("farmer_name").notNull(),
  farmerContact: text("farmer_contact"),
  village: text("village"),
  tehsil: text("tehsil"),
  district: text("district").notNull(),
  state: text("state").notNull(),
  aadhatDbId: integer("aadhat_db_id").references(() => aadhats.id), // links to aadhat ledger for mandi entries
  aadhatName: text("aadhat_name"), // cached aadhtiya name for mandi entries
  paymentStatus: text("payment_status").default("due"), // due, partial, paid
  amountPaid: decimal("amount_paid", { precision: 12, scale: 2 }).default("0"), // amount paid to farmer
  remarks: text("remarks"),
  attachmentImage: text("attachment_image"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Charge types for dynamic charges system
export const CHARGE_TYPES = [
  "Advance",
  "Bag Charges",
  "Cold Charges",
  "Early Pay/Bataw",
  "Freight Charges",
  "Grading Charges",
  "Hammali Charges",
  "Kata Charges",
  "Other Charges",
  "Pesticide Charges",
  "Ware House Charges",
] as const;

// Lots - each stock entry can have multiple lots
export const lots = pgTable("lots", {
  id: serial("id").primaryKey(),
  stockEntryId: integer("stock_entry_id").notNull().references(() => stockEntries.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  place: text("place").default("cold_store"), // farm_gate, cold_store, mandi
  coldStoreName: text("cold_store_name"), // required only for cold_store place (made nullable)
  coldStoreDbId: integer("cold_store_db_id"), // links to cold store ledger
  coldStoreLotNumber: text("cold_store_lot_number"), // lot number at cold store
  crop: text("crop").default("potato"), // potato, onion, garlic
  originalBags: integer("original_bags").notNull(),
  potatoType: text("potato_type"), // Jyoti, Pukhraj, Lakar, LR, Torus, CS1, CS3, Others - variety (potato only, made nullable)
  harvestPotatoType: text("harvest_potato_type"), // Wafer, Ration, Seed - for potato crop only
  bagType: text("bag_type").notNull(), // editable text field now
  quality: text("quality"), // Poor, Medium, Good (made nullable)
  cutType: text("cut_type").notNull(), // gate_cut, bilty_cut (now called Delivery Type in UI)
  size: text("size"), // Large, Medium, Small - for gate cut only
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }),
  totalWeight: decimal("total_weight", { precision: 12, scale: 2 }), // Total weight in kg (optional)
  charges: jsonb("charges"), // Dynamic charges array: [{ type: string, amount: number }]
  mandiCommissionPercent: decimal("mandi_commission_percent", { precision: 6, scale: 2 }), // Mandi commission % on final value
  aadhatCommissionPercent: decimal("aadhat_commission_percent", { precision: 6, scale: 2 }), // Aadhat commission % on final value
  hammaliPerBag: decimal("hammali_per_bag", { precision: 10, scale: 2 }), // Hammali charges per bag for mandi
  mandiExtraCharges: decimal("mandi_extra_charges", { precision: 12, scale: 2 }), // Extra charges total for mandi
  coldStoreChargesPerBag: decimal("cold_store_charges_per_bag", { precision: 10, scale: 2 }), // legacy: charges per bag from cold store
  hammaliGradingCharges: decimal("hammali_grading_charges", { precision: 12, scale: 2 }), // legacy: hammali and grading charges
  coldStorageChargesPaid: decimal("cold_storage_charges_paid", { precision: 12, scale: 2 }).default("0"), // total amount paid towards cold store charges
  earlyPayPercent: decimal("early_pay_percent", { precision: 6, scale: 2 }),
  earlyPayAmount: decimal("early_pay_amount", { precision: 12, scale: 2 }),
  adjustedAmount: decimal("adjusted_amount", { precision: 12, scale: 2 }), // adjustment amount for farmer due (principal if rate is used)
  adjustedAmountFinal: decimal("adjusted_amount_final", { precision: 12, scale: 2 }), // adjustedAmount + accrued simple interest (updated daily by midnight job)
  adjustedAmountType: text("adjusted_amount_type"), // "debit" or "credit"
  adjustedAmountRate: decimal("adjusted_amount_rate", { precision: 6, scale: 2 }), // annual rate % for simple interest
  adjustedAmountEffectiveDate: date("adjusted_amount_effective_date"), // effective date for interest calculation
  adjustedAmountRemark: text("adjusted_amount_remark"), // reason for adjustment
  totalCogs: decimal("total_cogs", { precision: 12, scale: 2 }).default("0"),
  totalCharges: decimal("total_charges", { precision: 12, scale: 2 }),
  netPayable: decimal("net_payable", { precision: 12, scale: 2 }),
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
  costPerBag: decimal("cost_per_bag", { precision: 12, scale: 2 }).default("0"),
  sortOrder: integer("sort_order").default(0),
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
  uniqueId: text("unique_id"), // HTE + YYYYMMDD + sequence (e.g., HTE202602021)
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  transactionNumber: integer("transaction_number").notNull(),
  transactionType: text("transaction_type").default("sale"), // "sale" or "loading"
  crop: text("crop").default("potato"), // potato, onion, or garlic - for separate transaction number sequences
  transporterName: text("transporter_name"), // transporter/driver name for autocomplete history
  driverContact: text("driver_contact"), // driver/transporter contact number
  dateOfLoading: text("date_of_loading"), // date when truck was loaded (YYYY-MM-DD format)
  partyName: text("party_name"),
  partyAddress: text("party_address"),
  vehicleNumber: text("vehicle_number"), // optional truck/vehicle number
  buyerId: integer("buyer_id").references(() => buyers.id), // optional reference to buyer
  advancePayment: decimal("advance_payment", { precision: 12, scale: 2 }), // advance given to driver/transporter
  amountReceived: decimal("amount_received", { precision: 12, scale: 2 }), // payment received from buyer
  transportationCharges: decimal("transportation_charges", { precision: 12, scale: 2 }),
  otherCharges: decimal("other_charges", { precision: 12, scale: 2 }),
  revenue: decimal("revenue", { precision: 12, scale: 2 }),
  remarks: text("remarks"), // optional remarks/notes for the transaction
  totalBags: integer("total_bags").notNull(),
  totalNetWeight: decimal("total_net_weight", { precision: 12, scale: 2 }),
  totalCostOfGoods: decimal("total_cost_of_goods", { precision: 12, scale: 2 }),
  profitLoss: decimal("profit_loss", { precision: 12, scale: 2 }),
  salesCommission: decimal("sales_commission", { precision: 12, scale: 2 }),
  totalMandiCommission: decimal("total_mandi_commission", { precision: 12, scale: 2 }),
  totalAadhatCommission: decimal("total_aadhat_commission", { precision: 12, scale: 2 }),
  totalHammali: decimal("total_hammali", { precision: 12, scale: 2 }),
  totalMandiExtraCharges: decimal("total_mandi_extra_charges", { precision: 12, scale: 2 }),
  tulai: decimal("tulai", { precision: 12, scale: 2 }),
  majduri: decimal("majduri", { precision: 12, scale: 2 }),
  thelaBhada: decimal("thela_bhada", { precision: 12, scale: 2 }),
  palaKarai: decimal("pala_karai", { precision: 12, scale: 2 }),
  bardan: decimal("bardan", { precision: 12, scale: 2 }),
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
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }), // user-entered price/kg for loading mode
  amount: decimal("amount", { precision: 12, scale: 2 }), // pricePerKg * netWeight for loading mode
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

// Cash Entries - for Cash Management (inward, outflow, and transfer)
export const cashEntries = pgTable("cash_entries", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  transactionCode: text("transaction_code"), // Format: CFYYYYMMDD{seq} - unique per merchant
  direction: text("direction").notNull(), // "inward", "outflow", or "transfer"
  receiptType: text("receipt_type"), // For inward: "cash_received", "account_received"
  revenueType: text("revenue_type"), // For inward: "raw_potato", "seed_sale"
  expenseType: text("expense_type"), // For outflow: "salary", "general_expense", "grading", "hammali", "farmer", "cold_store_charge"
  paymentMode: text("payment_mode"), // For outflow: "cash", "account_transfer"
  bankAccountId: integer("bank_account_id"), // Reference to bank account when using account_transfer or account_received
  bankAccountName: text("bank_account_name"), // Stored bank account name for history preservation
  fromAccountType: text("from_account_type"), // For transfer: "cash_in_hand" or "bank_account"
  fromBankAccountId: integer("from_bank_account_id"), // For transfer: source bank account id (if from bank)
  fromBankAccountName: text("from_bank_account_name"), // Stored from bank account name for history preservation
  toAccountType: text("to_account_type"), // For transfer: "cash_in_hand" or "bank_account"
  toBankAccountId: integer("to_bank_account_id"), // For transfer: destination bank account id (if to bank)
  toBankAccountName: text("to_bank_account_name"), // Stored to bank account name for history preservation
  partyName: text("party_name"), // For inward: buyer name from transactions
  partyVillage: text("party_village"), // For inward: buyer location
  buyerId: integer("buyer_id").references(() => buyers.id), // resolved buyer ledger ID for reliable matching
  farmerName: text("farmer_name"), // For farmer outflow or seed sale inward
  farmerVillage: text("farmer_village"), // For farmer outflow or seed sale inward
  farmerContact: text("farmer_contact"), // For farmer composite key matching
  farmerId: integer("farmer_id").references(() => farmers.id), // resolved farmer ledger ID for reliable matching
  coldStoreName: text("cold_store_name"), // For cold store charge payment outflow
  coldStoreDbId: integer("cold_store_db_id"), // links to cold store ledger for cold_store_charge payments
  supplierName: text("supplier_name"), // For supplier outflow (seed stock suppliers)
  aadhatName: text("aadhat_name"), // For aadhtiya outflow
  aadhatDbId: integer("aadhat_db_id").references(() => aadhats.id), // resolved aadhat ledger ID
  sundryPayName: text("sundry_pay_name"), // For sundry pay outflow/inward
  sundryPayDbId: integer("sundry_pay_db_id"), // resolved sundry pay stakeholder ledger ID
  expenseCategory: text("expense_category"), // "revenue" or "capital" for outflow
  capitalAssetName: text("capital_asset_name"), // Asset name for capital expenses
  capitalAssetCategory: text("capital_asset_category"), // Asset category for capital expenses
  capitalAssetId: integer("capital_asset_id"), // Reference to auto-created asset in asset register
  chequeNumber: text("cheque_number"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  entryDate: date("entry_date").notNull(),
  remarks: text("remarks"),
  isReversed: boolean("is_reversed").default(false), // soft delete flag
  reversedAt: timestamp("reversed_at"), // when the entry was reversed
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  merchantTransactionCodeUnique: uniqueIndex("cash_entries_merchant_transaction_code_unique").on(table.merchantId, table.transactionCode),
}));

// Cash Entry Allocations - tracks which transactions a cash inward was applied to (FIFO)
export const cashEntryAllocations = pgTable("cash_entry_allocations", {
  id: serial("id").primaryKey(),
  cashEntryId: integer("cash_entry_id").notNull().references(() => cashEntries.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  appliedAmount: decimal("applied_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Aadhat Payment Allocations - tracks manual allocation of payments to aadhat stock entries
export const aadhatPaymentAllocations = pgTable("aadhat_payment_allocations", {
  id: serial("id").primaryKey(),
  cashEntryId: integer("cash_entry_id").notNull().references(() => cashEntries.id, { onDelete: "cascade" }),
  stockEntryId: integer("stock_entry_id").references(() => stockEntries.id),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  appliedAmount: decimal("applied_amount", { precision: 12, scale: 2 }).notNull(),
  discountPercent: decimal("discount_percent", { precision: 6, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  pettyAdjustment: decimal("petty_adjustment", { precision: 12, scale: 2 }).default("0"),
  isPyPayable: boolean("is_py_payable").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Buyer Payment Allocations - tracks manual allocation of inward payments to buyer transactions
export const buyerPaymentAllocations = pgTable("buyer_payment_allocations", {
  id: serial("id").primaryKey(),
  cashEntryId: integer("cash_entry_id").notNull().references(() => cashEntries.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactions.id),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  appliedAmount: decimal("applied_amount", { precision: 12, scale: 2 }).notNull(),
  pettyAdjustment: decimal("petty_adjustment", { precision: 12, scale: 2 }).default("0"),
  isPyBalance: boolean("is_py_balance").default(false),
  transactionCode: text("transaction_code"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Cold Store Charge Allocations - tracks which lots a cold store payment was applied to
export const coldStoreChargeAllocations = pgTable("cold_store_charge_allocations", {
  id: serial("id").primaryKey(),
  cashEntryId: integer("cash_entry_id").notNull().references(() => cashEntries.id, { onDelete: "cascade" }),
  lotId: integer("lot_id").references(() => lots.id),
  seedLotId: integer("seed_lot_id").references(() => seedLots.id),
  coldStoreId: integer("cold_store_id").references(() => coldStores.id),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  appliedAmount: decimal("applied_amount", { precision: 12, scale: 2 }).notNull(),
  pettyAdjustment: decimal("petty_adjustment", { precision: 12, scale: 2 }).default("0"),
  isPyPayable: boolean("is_py_payable").default(false),
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

// Bank Accounts - multiple accounts per merchant for tracking account transfers
export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  name: text("name").notNull(), // Free text like "Bank X - Acct #1234"
  accountType: text("account_type").notNull(), // "current", "savings", "limit"
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Parties - buyer/party management with pending dues (linked to buyers for Buyer Ledger)
export const parties = pgTable("parties", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  buyerId: integer("buyer_id").references(() => buyers.id), // links to buyer ledger for matching
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
  farmerId: integer("farmer_id").references(() => farmers.id), // links to farmer ledger for matching
  name: text("name").notNull(),
  contactNumber: text("contact_number"),
  village: text("village"),
  tehsil: text("tehsil"),
  district: text("district"),
  state: text("state"),
  pendingDueToBePaid: decimal("pending_due_to_be_paid", { precision: 12, scale: 2 }).default("0"),
  rateOfInterest: decimal("rate_of_interest", { precision: 5, scale: 2 }).default("0"),
  effectiveDate: date("effective_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Buyers - buyer management with tracking for transactions
export const buyers = pgTable("buyers", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  buyerCode: text("buyer_code"), // Format: BYYYYYMMDD{seq} - unique per merchant
  dateAdded: date("date_added").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  mandiCode: text("mandi_code"),
  contact: text("contact"),
  receivableBalance: decimal("receivable_balance", { precision: 12, scale: 2 }).default("0"),
  redFlag: boolean("red_flag").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantBuyerCodeUnique: uniqueIndex("buyers_merchant_buyer_code_unique").on(table.merchantId, table.buyerCode),
}));

// Buyer Edit History - tracks all modifications to buyer records
export const buyerEditHistory = pgTable("buyer_edit_history", {
  id: serial("id").primaryKey(),
  serialNumber: integer("serial_number").notNull(), // auto-incrementing per merchant
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  buyerId: integer("buyer_id").notNull().references(() => buyers.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changedBy: integer("changed_by").references(() => users.id), // userId who made the change
  fieldName: text("field_name").notNull(), // name, address, mandiCode, contact, redFlag
  oldValue: text("old_value"),
  newValue: text("new_value"),
});

// Farmers - farmer ledger for tracking dues across harvest and seed modules
export const farmers = pgTable("farmers", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  farmerCode: text("farmer_code"), // Format: FMYYYYMMDD{seq} - unique per merchant, never reassigned
  dateAdded: date("date_added").notNull(),
  name: text("name").notNull(), // Composite key part 1
  contact: text("contact"), // Composite key part 2 (phone number)
  village: text("village"), // Composite key part 3
  tehsil: text("tehsil"),
  district: text("district"),
  state: text("state"),
  pyPayable: decimal("py_payable", { precision: 12, scale: 2 }).default("0"), // Previous year payable (owed to farmer)
  pyReceivable: decimal("py_receivable", { precision: 12, scale: 2 }).default("0"), // Previous year receivable (owed by farmer) - synced from Cash Settings, reduced by payments
  pyReceivableFinalAmount: decimal("py_receivable_final_amount", { precision: 12, scale: 2 }).default("0"), // pyReceivable + all accrued simple interest ever (cumulative, updated daily by midnight job)
  remainingReceivable: decimal("remaining_receivable", { precision: 12, scale: 2 }).default("0"), // pyReceivableFinalAmount - total payments made (what's actually still owed)
  receivableInterestRate: decimal("receivable_interest_rate", { precision: 5, scale: 2 }).default("0"),
  receivableEffectiveDate: date("receivable_effective_date"),
  redFlag: boolean("red_flag").default(false),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantFarmerCodeUnique: uniqueIndex("farmers_merchant_farmer_code_unique").on(table.merchantId, table.farmerCode),
}));

// Farmer Edit History - tracks all modifications to farmer records
export const farmerEditHistory = pgTable("farmer_edit_history", {
  id: serial("id").primaryKey(),
  serialNumber: integer("serial_number").notNull(), // auto-incrementing per merchant
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  farmerId: integer("farmer_id").notNull().references(() => farmers.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changedBy: integer("changed_by").references(() => users.id), // userId who made the change
  fieldName: text("field_name").notNull(), // name, contact, village, tehsil, district, state
  oldValue: text("old_value"),
  newValue: text("new_value"),
});

// ===================== SEED MANAGEMENT TABLES =====================

// Seed Stock Entries - supplier info for seed purchases
export const seedStockEntries = pgTable("seed_stock_entries", {
  id: serial("id").primaryKey(),
  uniqueId: text("unique_id"), // SSE + YYYYMMDD + sequence (e.g., SSE202602021)
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
  coldStoreDbId: integer("cold_store_db_id"), // links to cold store ledger
  originalBags: integer("original_bags").notNull(),
  potatoType: text("potato_type").notNull(), // Jyoti, Pukhraj, Lakar, CS1, CS3, Torus, LR
  bagType: text("bag_type").notNull(), // Wafer, Ration
  brandName: text("brand_name"), // Brand name for seed
  size: text("size").notNull(), // Small, Medium, Large
  pricePerBag: decimal("price_per_bag", { precision: 10, scale: 2 }).notNull(),
  coldStoreChargesPerBag: decimal("cold_store_charges_per_bag", { precision: 10, scale: 2 }),
  coldStoreChargesPaid: decimal("cold_store_charges_paid", { precision: 12, scale: 2 }).default("0"),
  hammaliCharges: decimal("hammali_charges", { precision: 12, scale: 2 }),
  gradingCharges: decimal("grading_charges", { precision: 12, scale: 2 }),
  transportCharges: decimal("transport_charges", { precision: 12, scale: 2 }),
  totalCharges: decimal("total_charges", { precision: 12, scale: 2 }),
  netPayable: decimal("net_payable", { precision: 12, scale: 2 }),
  avgCostPerBag: decimal("avg_cost_per_bag", { precision: 10, scale: 2 }),
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
  uniqueId: text("unique_id"), // STE + YYYYMMDD + sequence (e.g., STE202602021)
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  transactionNumber: integer("transaction_number").notNull(),
  farmerId: integer("farmer_id").references(() => farmers.id), // links to farmer ledger for matching
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
  adjustmentType: text("adjustment_type"), // "debit" or "credit"
  adjustmentAmount: decimal("adjustment_amount", { precision: 12, scale: 2 }), // principal for interest calculation
  adjustmentAmountFinal: decimal("adjustment_amount_final", { precision: 12, scale: 2 }), // adjustmentAmount + accrued simple interest (updated daily by midnight job)
  adjustmentRate: decimal("adjustment_rate", { precision: 6, scale: 2 }), // annual rate % for simple interest
  adjustmentEffectiveDate: date("adjustment_effective_date"), // effective date for interest calculation
  adjustmentReason: text("adjustment_reason"), // reason for adjustment
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
  bankAccounts: many(bankAccounts),
  parties: many(parties),
  cashFarmers: many(cashFarmers),
  seedStockEntries: many(seedStockEntries),
  seedLots: many(seedLots),
  seedTransactions: many(seedTransactions),
  seedTransactionItems: many(seedTransactionItems),

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

export const bankAccountsRelations = relations(bankAccounts, ({ one }) => ({
  merchant: one(merchants, {
    fields: [bankAccounts.merchantId],
    references: [merchants.id],
  }),
}));

export const partiesRelations = relations(parties, ({ one }) => ({
  merchant: one(merchants, {
    fields: [parties.merchantId],
    references: [merchants.id],
  }),
  buyer: one(buyers, {
    fields: [parties.buyerId],
    references: [buyers.id],
  }),
}));

export const cashFarmersRelations = relations(cashFarmers, ({ one }) => ({
  merchant: one(merchants, {
    fields: [cashFarmers.merchantId],
    references: [merchants.id],
  }),
}));

export const buyersRelations = relations(buyers, ({ one }) => ({
  merchant: one(merchants, {
    fields: [buyers.merchantId],
    references: [merchants.id],
  }),
}));

export const farmersRelations = relations(farmers, ({ one }) => ({
  merchant: one(merchants, {
    fields: [farmers.merchantId],
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
export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPartySchema = createInsertSchema(parties).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCashFarmerSchema = createInsertSchema(cashFarmers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBuyerSchema = createInsertSchema(buyers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBuyerEditHistorySchema = createInsertSchema(buyerEditHistory).omit({ id: true, changedAt: true });
export const insertFarmerSchema = createInsertSchema(farmers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFarmerEditHistorySchema = createInsertSchema(farmerEditHistory).omit({ id: true, changedAt: true });

// Aadhat Ledger
export const aadhats = pgTable("aadhats", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  aadhatId: text("aadhat_id"),
  dateAdded: date("date_added").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  contact: text("contact"),
  pyPayable: decimal("py_payable", { precision: 12, scale: 2 }).default("0"),
  redFlag: boolean("red_flag").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantAadhatIdUnique: uniqueIndex("aadhats_merchant_aadhat_id_unique").on(table.merchantId, table.aadhatId),
}));

export const aadhatEditHistory = pgTable("aadhat_edit_history", {
  id: serial("id").primaryKey(),
  serialNumber: integer("serial_number").notNull(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  aadhatId: integer("aadhat_id").notNull().references(() => aadhats.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changedBy: integer("changed_by").references(() => users.id),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
});

export const aadhatsRelations = relations(aadhats, ({ one }) => ({
  merchant: one(merchants, {
    fields: [aadhats.merchantId],
    references: [merchants.id],
  }),
}));

export const insertAadhatSchema = createInsertSchema(aadhats).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAadhatEditHistorySchema = createInsertSchema(aadhatEditHistory).omit({ id: true, changedAt: true });

export const sundryPayStakeholders = pgTable("sundry_pay_stakeholders", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  sundryPayId: text("sundry_pay_id"),
  dateAdded: date("date_added").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  contact: text("contact"),
  pyReceivable: decimal("py_receivable", { precision: 12, scale: 2 }).default("0"),
  redFlag: boolean("red_flag").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantSundryPayIdUnique: uniqueIndex("sundry_pay_merchant_sundry_pay_id_unique").on(table.merchantId, table.sundryPayId),
}));

export const sundryPayEditHistory = pgTable("sundry_pay_edit_history", {
  id: serial("id").primaryKey(),
  serialNumber: integer("serial_number").notNull(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  sundryPayStakeholderId: integer("sundry_pay_stakeholder_id").notNull().references(() => sundryPayStakeholders.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changedBy: integer("changed_by").references(() => users.id),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
});

export const sundryPayStakeholdersRelations = relations(sundryPayStakeholders, ({ one }) => ({
  merchant: one(merchants, {
    fields: [sundryPayStakeholders.merchantId],
    references: [merchants.id],
  }),
}));

export const insertSundryPayStakeholderSchema = createInsertSchema(sundryPayStakeholders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSundryPayEditHistorySchema = createInsertSchema(sundryPayEditHistory).omit({ id: true, changedAt: true });

// Seed schemas
export const insertSeedStockEntrySchema = createInsertSchema(seedStockEntries).omit({ id: true, createdAt: true, updatedAt: true, serialNumber: true });
export const insertSeedLotSchema = createInsertSchema(seedLots).omit({ id: true, createdAt: true });
export const insertSeedStockEntryEditHistorySchema = createInsertSchema(seedStockEntryEditHistory).omit({ id: true, changedAt: true });
export const insertSeedTransactionSchema = createInsertSchema(seedTransactions).omit({ id: true, createdAt: true, transactionNumber: true });
export const insertSeedTransactionItemSchema = createInsertSchema(seedTransactionItems).omit({ id: true, createdAt: true });
export const insertSeedTransactionEditHistorySchema = createInsertSchema(seedTransactionEditHistory).omit({ id: true, changedAt: true });

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

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;

export type Party = typeof parties.$inferSelect;
export type InsertParty = z.infer<typeof insertPartySchema>;

export type CashFarmer = typeof cashFarmers.$inferSelect;
export type InsertCashFarmer = z.infer<typeof insertCashFarmerSchema>;

export type Buyer = typeof buyers.$inferSelect;
export type InsertBuyer = z.infer<typeof insertBuyerSchema>;

export type BuyerEditHistory = typeof buyerEditHistory.$inferSelect;
export type InsertBuyerEditHistory = z.infer<typeof insertBuyerEditHistorySchema>;

export type Farmer = typeof farmers.$inferSelect;
export type InsertFarmer = z.infer<typeof insertFarmerSchema>;

export type FarmerEditHistory = typeof farmerEditHistory.$inferSelect;
export type InsertFarmerEditHistory = z.infer<typeof insertFarmerEditHistorySchema>;

export type Aadhat = typeof aadhats.$inferSelect;
export type InsertAadhat = z.infer<typeof insertAadhatSchema>;

export type AadhatEditHistory = typeof aadhatEditHistory.$inferSelect;
export type InsertAadhatEditHistory = z.infer<typeof insertAadhatEditHistorySchema>;

export type SundryPayStakeholder = typeof sundryPayStakeholders.$inferSelect;
export type InsertSundryPayStakeholder = z.infer<typeof insertSundryPayStakeholderSchema>;

export type SundryPayEditHistory = typeof sundryPayEditHistory.$inferSelect;
export type InsertSundryPayEditHistory = z.infer<typeof insertSundryPayEditHistorySchema>;

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
  coldStoreName: z.string().optional(),
  coldStoreDbId: z.coerce.number().optional(),
});

export type ChargeEntry = z.infer<typeof chargeEntrySchema>;

export const lotFormSchema = z.object({
  place: z.enum(["farm_gate", "cold_store", "mandi"]).default("cold_store"),
  coldStoreName: z.string().optional(),
  coldStoreDbId: z.coerce.number().optional(),
  coldStoreLotNumber: z.string().optional(),
  crop: z.enum(["potato", "onion", "garlic"]).default("potato"),
  originalBags: z.coerce.number().min(1, "Original bags must be at least 1"),
  potatoType: z.string().optional(),
  harvestPotatoType: z.string().optional(),
  bagType: z.string().optional().default(""),
  quality: z.string().optional().default(""),
  cutType: z.enum(["gate_cut", "bilty_cut"]),
  size: z.string().optional(),
  pricePerKg: z.coerce.number().optional(),
  totalWeight: z.coerce.number().optional(),
  charges: z.preprocess(
    (val) => {
      if (!Array.isArray(val)) return val;
      return val.filter((c: any) => c && c.type !== "Early Pay/Bataw" && ((c.type && String(c.type).trim() !== "") || (c.amount && Number(c.amount) > 0)));
    },
    z.array(chargeEntrySchema).optional()
  ),
  mandiCommissionPercent: z.coerce.number().optional(),
  aadhatCommissionPercent: z.coerce.number().optional(),
  hammaliPerBag: z.coerce.number().optional(),
  mandiExtraCharges: z.coerce.number().optional(),
  earlyPayPercent: z.coerce.number().optional().nullable(),
  adjustedAmount: z.coerce.number().optional(),
  adjustedAmountType: z.enum(["debit", "credit"]).optional(),
  adjustedAmountRate: z.coerce.number().optional(),
  adjustedAmountEffectiveDate: z.string().optional(),
  adjustedAmountRemark: z.string().optional(),
  remarks: z.string().optional(),
  bagBreakdowns: z.array(bagBreakdownFormSchema).optional(),
}).superRefine((data, ctx) => {
  if (data.place === "cold_store") {
    if (!data.coldStoreName || data.coldStoreName.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cold store name is required", path: ["coldStoreName"] });
    }
  }
});

export const stockEntryFormSchema = z.object({
  purchaseDate: z.string().min(1, "Purchase date is required"),
  place: z.enum(["farm_gate", "cold_store", "mandi"]).default("cold_store"),
  farmerName: z.string().optional().default(""),
  farmerContact: z.string().optional().default(""),
  village: z.string().optional().default(""),
  tehsil: z.string().optional().default(""),
  district: z.string().optional().default(""),
  state: z.string().optional().default(""),
  aadhatDbId: z.coerce.number().optional(),
  aadhatName: z.string().optional(),
  remarks: z.string().optional(),
  lots: z.array(lotFormSchema).min(1, "At least one lot is required"),
}).superRefine((data, ctx) => {
  if (data.place === "mandi") {
    if (!data.aadhatName || data.aadhatName.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Aadhtiya name is required", path: ["aadhatName"] });
    }
  } else {
    if (!data.farmerName || data.farmerName.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Farmer name is required", path: ["farmerName"] });
    }
    if (!data.farmerContact || !/^\d{10}$/.test(data.farmerContact)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter valid 10-digit number", path: ["farmerContact"] });
    }
    if (!data.village || data.village.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Village name is required", path: ["village"] });
    }
    if (!data.tehsil || data.tehsil.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tehsil is required", path: ["tehsil"] });
    }
    if (!data.district || data.district.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "District is required", path: ["district"] });
    }
    if (!data.state || data.state.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "State is required", path: ["state"] });
    }
  }
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
export const PLACE_OPTIONS = ["farm_gate", "cold_store", "mandi"] as const;
export const CROP_OPTIONS = ["potato", "onion", "garlic"] as const;
export type CropType = typeof CROP_OPTIONS[number];
export const POTATO_TYPES = ["Jyoti", "Pukhraj", "Lakar", "LR", "Torus", "CS1", "CS3", "Others"] as const;
export const HARVEST_POTATO_TYPES = ["Wafer", "Ration", "Seed"] as const; // Potato type for harvest entries
export const SEED_POTATO_TYPES = ["Jyoti", "Pukhraj", "Lakar", "CS1", "CS3", "Torus", "LR"] as const;
export const BAG_TYPES = ["Wafer", "Ration", "Seed"] as const;
export const SEED_BAG_TYPES = ["Wafer", "Ration"] as const;
export const BAG_TYPE_SUGGESTIONS = ["Jute", "Shakti", "PP", "HDPE", "Net"] as const;

export const QUALITY_OPTIONS = ["Poor", "Medium", "Good"] as const;
export const CUT_TYPES = ["gate_cut", "bilty_cut"] as const; // Delivery Types
export const SIZE_OPTIONS = ["Large", "Medium", "Small", "Wastage"] as const;
export const SEED_SIZE_OPTIONS = ["Small", "Medium", "Large"] as const;
export const PAYMENT_STATUS = ["due", "paid"] as const;

// Cash Management Options
export const RECEIPT_TYPES = ["cash_received", "account_received", "cheque_received"] as const;
export const EXPENSE_TYPES = ["aadhtiya", "bag_charges", "capital_expense", "cold_store_charge", "farmer", "farmer_advance", "farmer_freight", "farmer_others", "general_expense", "grading", "hammali", "kata_charges", "pesticide_charges", "salary", "sundry_pay", "supplier", "transport_freight", "warehouse_charges"] as const;
export const PAYMENT_MODES = ["cash", "account_transfer", "cheque"] as const;
export const CASH_DIRECTIONS = ["inward", "outflow"] as const;

// Seed form schemas for frontend
export const seedLotFormSchema = z.object({
  coldStoreName: z.string().min(1, "Cold store name is required"),
  coldStoreDbId: z.coerce.number().optional(),
  originalBags: z.coerce.number().min(1, "Original bags must be at least 1"),
  potatoType: z.string().min(1, "Potato type is required"),
  bagType: z.string().optional().default(""),
  brandName: z.string().optional(),
  size: z.string().min(1, "Size is required"),
  pricePerBag: z.coerce.number().min(0, "Price per bag must be positive"),
  coldStoreChargesPerBag: z.coerce.number().optional(),
  remarks: z.string().optional(),
});

export const seedStockEntryFormSchema = z.object({
  purchaseDate: z.string().min(1, "Purchase date is required"),
  supplierName: z.string().min(1, "Supplier name is required"),
  supplierContact: z.string().regex(/^\d{10}$/, "Enter valid 10-digit number"),
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
  coldStoreDbId: z.coerce.number().optional().nullable(),
  originalBags: z.coerce.number().min(1).optional(),
  remainingBags: z.coerce.number().min(0).optional(),
  potatoType: z.string().min(1).optional(),
  bagType: z.string().optional(),
  brandName: z.string().optional(),
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
  farmerContact: z.string().regex(/^\d{10}$/, "Enter valid 10-digit number").optional().or(z.literal("")),
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

// Extended type for seed transaction with items (enriched with supplier info from join)
export type SeedTransactionItemEnriched = SeedTransactionItem & { supplierName: string };
export type SeedTransactionWithItems = SeedTransaction & {
  items: SeedTransactionItemEnriched[];
};

// ==================== Books: Assets ====================
export const ASSET_CATEGORIES = ["vehicle", "building", "equipment", "furniture", "computer", "plant_machinery", "electrical_fittings", "other"] as const;
export const ASSET_DEPRECIATION_RATES: Record<string, number> = {
  vehicle: 15,
  building: 10,
  equipment: 15,
  furniture: 10,
  computer: 40,
  plant_machinery: 15,
  electrical_fittings: 10,
  other: 10,
};

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  purchaseDate: date("purchase_date").notNull(),
  purchaseCost: decimal("purchase_cost", { precision: 14, scale: 2 }).notNull(),
  salvageValue: decimal("salvage_value", { precision: 14, scale: 2 }).default("0"),
  usefulLifeYears: integer("useful_life_years"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const assetDepreciationLog = pgTable("asset_depreciation_log", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  financialYear: text("financial_year").notNull(),
  openingValue: decimal("opening_value", { precision: 14, scale: 2 }).notNull(),
  depreciationAmount: decimal("depreciation_amount", { precision: 14, scale: 2 }).notNull(),
  closingValue: decimal("closing_value", { precision: 14, scale: 2 }).notNull(),
  depreciationRate: decimal("depreciation_rate", { precision: 6, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export const insertAssetDepreciationLogSchema = createInsertSchema(assetDepreciationLog).omit({ id: true, createdAt: true });
export type InsertAssetDepreciationLog = z.infer<typeof insertAssetDepreciationLogSchema>;
export type AssetDepreciationLog = typeof assetDepreciationLog.$inferSelect;

// ==================== Books: Liabilities ====================
export const LIABILITY_CATEGORIES = ["bank_loan", "personal_loan", "vehicle_loan", "other"] as const;
export const LIABILITY_TYPES = ["long_term", "short_term"] as const;

export const liabilities = pgTable("liabilities", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  lenderName: text("lender_name"),
  principalAmount: decimal("principal_amount", { precision: 14, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 6, scale: 2 }).default("0"),
  startDate: date("start_date").notNull(),
  tenureMonths: integer("tenure_months"),
  type: text("type").notNull().default("short_term"),
  remarks: text("remarks"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const liabilityPayments = pgTable("liability_payments", {
  id: serial("id").primaryKey(),
  liabilityId: integer("liability_id").notNull().references(() => liabilities.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  paymentDate: date("payment_date").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  principalPortion: decimal("principal_portion", { precision: 14, scale: 2 }).default("0"),
  interestPortion: decimal("interest_portion", { precision: 14, scale: 2 }).default("0"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLiabilitySchema = createInsertSchema(liabilities).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLiability = z.infer<typeof insertLiabilitySchema>;
export type Liability = typeof liabilities.$inferSelect;

export const insertLiabilityPaymentSchema = createInsertSchema(liabilityPayments).omit({ id: true, createdAt: true });
export type InsertLiabilityPayment = z.infer<typeof insertLiabilityPaymentSchema>;
export type LiabilityPayment = typeof liabilityPayments.$inferSelect;

// ==================== Demo Videos ====================
export const demoVideos = pgTable("demo_videos", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  caption: text("caption").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertDemoVideoSchema = createInsertSchema(demoVideos).omit({
  id: true,
  uploadedAt: true,
});

export type InsertDemoVideo = z.infer<typeof insertDemoVideoSchema>;
export type DemoVideo = typeof demoVideos.$inferSelect;

export const insertAadhatPaymentAllocationSchema = createInsertSchema(aadhatPaymentAllocations).omit({
  id: true,
  createdAt: true,
});

export type InsertAadhatPaymentAllocation = z.infer<typeof insertAadhatPaymentAllocationSchema>;
export type AadhatPaymentAllocation = typeof aadhatPaymentAllocations.$inferSelect;

export const insertBuyerPaymentAllocationSchema = createInsertSchema(buyerPaymentAllocations).omit({
  id: true,
  createdAt: true,
});

export type InsertBuyerPaymentAllocation = z.infer<typeof insertBuyerPaymentAllocationSchema>;
export type BuyerPaymentAllocation = typeof buyerPaymentAllocations.$inferSelect;

// ==================== Cold Store Ledger ====================
export const coldStores = pgTable("cold_stores", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  coldStoreId: text("cold_store_id"),
  dateAdded: date("date_added").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  contact: text("contact"),
  pyPayable: decimal("py_payable", { precision: 12, scale: 2 }).default("0"),
  originalPyPayable: decimal("original_py_payable", { precision: 12, scale: 2 }).default("0"),
  redFlag: boolean("red_flag").default(false),
  isActive: boolean("is_active").default(true),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  ifscCode: text("ifsc_code"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  merchantColdStoreIdUnique: uniqueIndex("cold_stores_merchant_cold_store_id_unique").on(table.merchantId, table.coldStoreId),
}));

export const coldStoreEditHistory = pgTable("cold_store_edit_history", {
  id: serial("id").primaryKey(),
  serialNumber: integer("serial_number").notNull(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id),
  coldStoreId: integer("cold_store_id").notNull().references(() => coldStores.id),
  changedAt: timestamp("changed_at").defaultNow(),
  changedBy: integer("changed_by").references(() => users.id),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
});

export const coldStoresRelations = relations(coldStores, ({ one }) => ({
  merchant: one(merchants, {
    fields: [coldStores.merchantId],
    references: [merchants.id],
  }),
}));

export const insertColdStoreSchema = createInsertSchema(coldStores).omit({ id: true, createdAt: true, updatedAt: true });
export const insertColdStoreEditHistorySchema = createInsertSchema(coldStoreEditHistory).omit({ id: true, changedAt: true });

export type ColdStore = typeof coldStores.$inferSelect;
export type InsertColdStore = z.infer<typeof insertColdStoreSchema>;

export type ColdStoreEditHistory = typeof coldStoreEditHistory.$inferSelect;
export type InsertColdStoreEditHistory = z.infer<typeof insertColdStoreEditHistorySchema>;
