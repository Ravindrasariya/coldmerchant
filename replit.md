# Vyapar Vriddhi - Potato Trading Management System

## Overview

Vyapar Vriddhi is a multi-tenant potato trading management system designed for merchants to track stock entries, purchases from cold stores, and supply chain management. The application enables merchants to record farmer information, manage lots from different cold stores, track bag breakdowns by size, and monitor payment statuses.

The system follows a B2B utility-focused design approach prioritizing efficiency, clarity, and data accuracy over creative aesthetics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Forms**: React Hook Form with Zod validation
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming (light/dark mode support)
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful JSON API with `/api` prefix
- **Authentication**: Passport.js with local strategy, session-based auth using express-session
- **Password Security**: scrypt hashing with timing-safe comparison

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Session Store**: connect-pg-simple for PostgreSQL session storage
- **Migrations**: Drizzle Kit for schema management

### Multi-Tenant Data Model
The system isolates data by merchant:
- **Merchants**: Top-level tenant entity with name, contact, address
- **Users**: Linked to merchants with role-based access (isSystemAdmin, canEdit, mustChangePassword flags)
- **Stock Entries**: Per-merchant with auto-incrementing serial numbers and globally unique IDs (HSE+YYYYMMDD+sequence)
- **Lots**: Child of stock entries, tracks inventory with flexible field structure:
  - **Place**: Farm Gate or Cold Store (determines conditional field display)
  - **Crop**: Potato, Onion, or Garlic (determines variety/type field visibility; Garlic uses same fields as Onion)
  - **Cold Store Fields**: Name, Lot Number (only visible when Place=Cold Store)
  - **Potato Fields**: Variety (potatoType), Harvest Potato Type (only visible when Crop=Potato)
  - **Delivery Type**: Gate Cut or Full Truck
  - **Expected Cold Charges**: Total amount that feeds into cold store dues
- **Bag Breakdowns**: Granular tracking of bags by size within lots
- **Edit History**: Audit trail of all modifications to stock entries after initial creation

### Globally Unique ID System (Backend Only)
All four record types have globally unique IDs for backend matching purposes (not displayed to users):
- **Stock Entries (Harvest)**: HSE + YYYYMMDD + sequence (e.g., HSE202602011)
- **Transactions (Harvest)**: HTE + YYYYMMDD + sequence (e.g., HTE202602021)
- **Seed Stock Entries**: SSE + YYYYMMDD + sequence (e.g., SSE202602011)
- **Seed Transactions**: STE + YYYYMMDD + sequence (e.g., STE202602011)
- Date is derived from purchaseDate for stock entries, createdAt for transactions
- Unique constraint enforced at database level for data integrity
- **User-facing IDs**: Serial numbers (Sr No:) and Transaction numbers (Tr No:) are displayed to users
- **Separate counters**: Potato, Onion, Garlic, and Seed each have their own serial/transaction number sequences
- Serial numbers reset yearly while uniqueIds remain globally unique

### Cold Store Dues Calculation
Cold store dues are calculated from the `charges` array on each lot:
- Only charge types "Cold Charges" and "Ware House Charges" are included
- FIFO allocation applies payments to oldest outstanding lots first
- Dues are grouped by normalized cold store name (case-insensitive)

### Aadhat Payment (Manual Allocation)
Aadhat (aadhtiya) payments use manual transaction-level allocation instead of FIFO:
- User selects specific pending stock entries and/or PY Payable to allocate payment to
- Each allocation has three fields: Amount (cash), Discount % (auto-calculates rupee value from due), Petty Adjustment (manual rupee amount)
- Total settled per entry = Amount + Discount + Petty (validated to not exceed due)
- Only "Amount" counts as real cash outflow; discount and petty reduce due but aren't cash
- Allocations stored in `aadhat_payment_allocations` table for precise reversal
- Reversals use allocation records to precisely undo each allocation
- Legacy FIFO fallback preserved for backward compatibility with old entries
- API: `GET /api/cash/aadhat-pending-entries/:aadhatDbId` returns pending stock entries with due amounts

### Supplier Payment FIFO
When paying a supplier:
- Payments are allocated to oldest seed stock entries first (by createdAt)
- Each entry's due = total cost (bags × pricePerBag) - amountPaid
- Payment updates amountPaid and paymentStatus on each seed stock entry

### Edit History System
- All modifications to stock entries after initial creation are automatically recorded
- Tracks changes at entry, lot, and breakdown levels
- Records: field name, old value, new value, timestamp, and user who made the change
- Structural changes (adding/deleting breakdowns) are also tracked
- History is displayed in a collapsible section at the bottom of the edit dialog
- Session persistence set to 30 days for seamless user experience

### Admin System
- **System Admin**: Special user type (isSystemAdmin=true) with no merchantId, can access /admin panel
- **Merchant Management**: Admin can create/edit/delete merchants via /api/admin/merchants
- **User Management**: Admin can create/edit/delete users, reset passwords, set view/edit permissions
- **Default Password**: New users created with password "password123" and mustChangePassword=true
- **First Login**: Users with mustChangePassword flag are prompted to set a new password on first login

### Cash Settings / Ledger Decoupled Architecture
- **Cash Settings** = Input-only form. Stores original amounts (pendingDues for buyers, pendingDueToBePaid for farmers)
- **Ledger fields** = Source of truth for running balances:
  - `buyer.receivableBalance`: Tracks buyer's receivable, reduced by payments
  - `farmer.pyReceivable`: Original principal amount (never changes after initial set)
  - `farmer.pyReceivableFinalAmount`: Cumulative amount = original principal + all accrued interest (never reduced by payments)
  - `farmer.remainingReceivable`: Actual amount owed = pyReceivableFinalAmount - payments made (this is the source of truth for dues)
  - `farmer.receivableInterestRate` + `receivableEffectiveDate`: Interest accrued daily on remainingReceivable
- **Simple Interest Model**: Daily interest = remainingReceivable × rate / (365 × 100), added to both pyReceivableFinalAmount and remainingReceivable at midnight IST
- **Delta-based sync**: Cash Settings create/update/delete apply deltas to all three fields (pyReceivable, pyReceivableFinalAmount, remainingReceivable) together
  - CREATE: Adds new amount to all three ledger balance fields
  - UPDATE: Applies (newAmount - oldAmount) delta to all three fields
  - DELETE: Subtracts deleted amount from all three fields (min 0)
  - Balance reaching 0 clears interest rate and effective date
- **Payment FIFO**: STEP 1 reduce only remainingReceivable (pyReceivable and pyReceivableFinalAmount stay unchanged), STEP 2 FIFO to transactions/seed transactions
- **Reversals**: Restore transaction allocations first, then add back to remainingReceivable only

### Buyer Management System
- **Buyers Table**: Stores buyer information per merchant with fields: name, address, mandiCode, contact, redFlag, isActive, receivableBalance
- **API Routes**: Full CRUD operations at /api/buyers with Zod validation using insertBuyerSchema
- **UI Pattern**: Editable table rows with localRows state management:
  - `localRows = null`: Displaying server data (no edits)
  - `localRows = [...]`: User has unsaved local edits
- **Delete Preservation**: Delete operations preserve unsaved edits on other rows
- **Receivables Column**: Displays receivables from buyer.receivableBalance (ledger field, not Cash Settings)
- **Party-Buyer Linking**: When creating managed parties in Cash Management, buyers are auto-created/linked using lookupOrCreateBuyer function (case-insensitive name matching, auto-generates BYYYYYMMDD# codes for new buyers)
- **Accessible via**: User dropdown menu > "Buyers" link

### Farmer Ledger System
- **Farmers Table**: Stores farmer records with unique ID (FMYYYYMMDD#), composite key (name + contact + village), PY balances, flags
- **Composite Key Matching**: Farmers are identified by normalized (case-insensitive, trimmed) combination of name + phone + village
- **Auto-Sync**: POST /api/farmers/sync generates farmer records from existing stock entries and seed transactions
- **Farmer Edit with Propagation**: PATCH /api/farmers/:id/details updates farmer and propagates changes to all linked stockEntries, seedTransactions, cashFarmers
- **Seed Transaction Farmer Fields**: Read-only in edit dialog; managed via Farmer Ledger only. API returns linked farmer's current details when farmerId exists.
- **farmerId Linking**: Farmer sync links farmerId to existing stock entries and seed transactions. Dues calculation uses farmerId for matching (primary) with composite key fallback for legacy data.
- **Farmer Edit History**: All edits tracked in farmerEditHistory table with auto-incrementing serialNumber, sorted by date desc then serialNumber desc
- **Farmer Merge**: When editing a farmer to match existing composite key, system offers to merge:
  - Keeps farmer with lower ID
  - Transfers all linked records (stockEntries, seedTransactions, cashFarmers)
  - Aggregates pyPayable and pyReceivable balances
  - Aggregates remainingReceivable balances
  - Deletes higher ID farmer
- **Due Calculations**:
  - PY Receivable: farmer.remainingReceivable (actual amount owed after payments and interest)
  - Harvest Due: Sum of totalDueToFarmer from matching stock entries
  - Seed Due: Sum of totalDueFromFarmer from matching seed transactions
  - Net Due = Harvest Due - PY Receivable - Seed Due
- **Receivables Integration**: Managed farmers from Cash Settings with pendingDueToBePaid are combined into PY Receivable column and appear in Seed farmer dropdown
- **PY Balances**: Previous year payable/receivable are editable inline with blur-based commits
- **Red Flag & Archive**: Toggle controls per farmer; archived farmers shown at bottom with toggle to show/hide
- **Red Flag in Auto-fill**: Red-flagged farmers/buyers appear in suggestion dropdowns with orange warning badges instead of being hidden
- **Farmer IDs Never Reassigned**: Unique farmer codes (FMYYYYMMDD#) are permanent and never recycled
- **Accessible via**: User dropdown menu > "Farmer Ledger" link

### Cash Tab Filters
- **Filter Order**: Direction → Expense Category → Buyer Name → Expense Type → Farmer Name → Supplier Name → Month → Year → Remarks
- **Direction Filter**: All / Inward Cash / Expense / Transfer
- **Expense Category Filter**: All / Revenue Expense / Capital Expense — selecting either restricts to outflow entries only; changing resets Expense Type filter
- **Expense Type Dropdown**: Options conditioned by Expense Category — capital shows asset categories (vehicle, building, plant_machinery, etc.) and filters by `capitalAssetCategory`; revenue hides `capital_expense`; all shows all expense types
- **Buyer Name**: Renamed from "Party Name" in filter UI, view details dialog, and CSV headers
- **Supplier Name Filter**: Filters by unique supplier names from entries
- **All filters use AND conditions; CSV export respects active filters**

### Key Design Patterns
- Shared schema in `/shared/schema.ts` used by both client and server
- Form schemas defined with Zod and validated on both ends
- Protected routes with authentication middleware (requireAuth, requireMerchant, requireSystemAdmin)
- Merchant ID scoping on all data operations for tenant isolation
- No public registration - admin must onboard all merchants and users

## External Dependencies

### Database
- PostgreSQL database (connection via DATABASE_URL environment variable)
- Session storage in PostgreSQL via connect-pg-simple

### Authentication
- SESSION_SECRET environment variable required for session encryption

### Frontend Libraries
- Radix UI primitives for accessible components
- Embla Carousel for carousel functionality
- date-fns for date manipulation
- Lucide React for icons

### Books (Financial Statements)
The Books feature provides simplified accounting views:
- **Asset Register**: CRUD for fixed assets (vehicles, buildings, equipment, furniture, computers, plant & machinery, electrical fittings, other) with per-FY depreciation calculation using standard Indian rates (WDV method). Depreciation logs stored in `asset_depreciation_log` table.
- **Capital Expense**: Cash Tab outflow form has Revenue/Capital toggle. Capital expenses auto-create assets in the Asset Register with linked `capitalAssetId` in `cash_entries`. Reversal of a capital expense deletes the linked asset and its depreciation logs. New `cash_entries` columns: `expense_category`, `capital_asset_name`, `capital_asset_category`, `capital_asset_id`. CSV export includes these fields.
- **Liability Register**: CRUD for loans/debts with payment tracking. Each liability has category, lender, principal, interest rate, type (long/short term). Payments recorded with principal/interest split.
- **Balance Sheet**: Auto-generated for selected FY. Assets = Fixed (after depreciation) + Current (cash, bank with positive balances only, buyer receivables, farmer receivables from netDue<0, unsold harvest stock value, unsold seed stock value). Liabilities = Long-term + Short-term + Farmer payables (netDue>0) + Supplier payables (seed supplier dues) + Aadhtiya payables (mandi stock dues + pyPayable) + Limit account overdrafts (negative bank balances). Owner's Equity = Assets - Liabilities. Farmer receivables/payables are computed from netDue = harvestDue - pyReceivable - seedDue per farmer. Inventory values calculated from remaining bags × cost (harvest: weightPerBag × pricePerKg; seed: avgCostPerBag including all charges).
- **Profit & Loss**: Auto-generated for selected FY using accrual-based accounting. Revenue recognized from actual sale transactions (harvest `transactions.revenue` as raw_potato; seed `seed_transactions.totalRevenue` as seed_sale), not from cash receipts. Other revenue types (commission, other) still come from cash entries. Expenses include: Cost of Goods Sold (COGS) from sale transactions (harvest `totalCostOfGoods` + `transportationCharges` + `otherCharges`; seed `totalCost` + `transportCharges` + `otherCharges`), operating expenses from cash outflows (excluding `capital_expense`, `aadhtiya`, `supplier`, and `raw_potato`/`seed_sale` revenue types which are all transaction-based), depreciation, and loan interest. Both revenue and COGS are transaction-based — cash received/paid is irrelevant for P&L recognition.
- **COGS per bag (proportionate lot cost)**: When loading a truck, COGS uses proportionate stock register cost per bag instead of `netWeight × pricePerKg`. Formula varies by purchase type:
  - **Per-breakdown cost model**: `cost_per_bag` is stored on `bag_breakdowns` table (not `lots`). Each breakdown row gets its own cost based on its `totalAmount / numberOfBags` plus proportionate share of charges.
  - **Cold Store**: `cpb = (totalAmount / bags) + (coldStoreCharges / actualSellableBags)`
  - **Farm Gate**: `cpb = (totalAmount / bags) + (coldStoreCharges / actualSellableBags) + (farmerDeductions / actualSellableBags)`
  - **Mandi**: `cpb = (totalAmount / bags) + totalAmount*(mandiPct+aadhatPct)/100 / bags + hammaliPerBag`
  - **Wastage rows**: `cpb = totalAmount / bags` if totalAmount exists, else 0. No charges added.
  - `total_cogs` stored on `lots` table = Σ(costPerBag × numberOfBags) across all breakdowns
  - Computed by `storage.computeBreakdownCosts(lot, breakdowns)` → `{ breakdownCosts: Map<id|null, cpb>, totalCogs }`
  - `recomputeHarvestLotCharges` writes per-breakdown `costPerBag` and lot `totalCogs` on create/update
  - Backfill runs on server startup for breakdowns with incorrect values
  - CSV export includes Total COGS column (no Cost/Bag column)
- All financial reports are derived (computed on the fly), never stored.
- FY selector allows viewing any year (Indian FY: April–March).
- Tables: `assets`, `asset_depreciation_log`, `liabilities`, `liability_payments`

### Demo Videos
- multer for video file uploads (disk storage in uploads/ directory)
- Admin uploads/manages videos via /api/admin/demo-videos endpoints
- All authenticated users can view videos via "Demo Videos" tab
- Video streaming with HTTP Range request support for seeking
- 200MB file size limit per video

### Build & Development
- Vite for frontend bundling with HMR
- esbuild for server bundling in production
- TSX for TypeScript execution in development