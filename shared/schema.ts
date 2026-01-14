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

// Relations
export const merchantsRelations = relations(merchants, ({ many }) => ({
  users: many(users),
  stockEntries: many(stockEntries),
  lots: many(lots),
  bagBreakdowns: many(bagBreakdowns),
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

// Zod schemas for validation
export const insertMerchantSchema = createInsertSchema(merchants).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertStockEntrySchema = createInsertSchema(stockEntries).omit({ id: true, createdAt: true, updatedAt: true, serialNumber: true });
export const insertLotSchema = createInsertSchema(lots).omit({ id: true, createdAt: true });
export const insertBagBreakdownSchema = createInsertSchema(bagBreakdowns).omit({ id: true, createdAt: true });

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

// Dropdown options
export const DISTRICTS = ["Ujjain", "Shajapur", "Indore", "Dewas", "Agar Malwa"] as const;
export const STATES = ["Madhya Pradesh", "Gujarat"] as const;
export const POTATO_TYPES = ["Jyoti", "Pukhraj", "Lakar", "LR", "Torus", "CS1", "CS3", "Others"] as const;
export const BAG_TYPES = ["Wafer", "Ration", "Seed"] as const;
export const QUALITY_OPTIONS = ["Poor", "Medium", "Good"] as const;
export const CUT_TYPES = ["gate_cut", "bilty_cut"] as const;
export const SIZE_OPTIONS = ["Large", "Medium", "Small", "Wastage"] as const;
export const PAYMENT_STATUS = ["due", "paid"] as const;
