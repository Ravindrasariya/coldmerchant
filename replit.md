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
  - **Crop**: Potato or Onion (determines variety/type field visibility)
  - **Cold Store Fields**: Name, Lot Number (only visible when Place=Cold Store)
  - **Potato Fields**: Variety (potatoType), Harvest Potato Type (only visible when Crop=Potato)
  - **Delivery Type**: Gate Cut or Full Truck
  - **Expected Cold Charges**: Total amount that feeds into cold store dues
- **Bag Breakdowns**: Granular tracking of bags by size within lots
- **Edit History**: Audit trail of all modifications to stock entries after initial creation

### Globally Unique ID System
All four record types have globally unique IDs with date-based patterns:
- **Stock Entries (Harvest)**: HSE + YYYYMMDD + sequence (e.g., HSE202602011, HSE202602012)
- **Transactions (Harvest)**: HTE + YYYYMMDD + sequence (e.g., HTE202602021)
- **Seed Stock Entries**: SSE + YYYYMMDD + sequence (e.g., SSE202602011)
- **Seed Transactions**: STE + YYYYMMDD + sequence (e.g., STE202602011)
- Date is derived from purchaseDate for stock entries, createdAt for transactions
- Unique constraint enforced at database level for data integrity
- Serial numbers reset yearly while uniqueIds remain globally unique

### Cold Store Dues Calculation
Cold store dues are calculated from the `charges` array on each lot:
- Only charge types "Cold Charges" and "Ware House Charges" are included
- FIFO allocation applies payments to oldest outstanding lots first
- Dues are grouped by normalized cold store name (case-insensitive)

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

### Buyer Management System
- **Buyers Table**: Stores buyer information per merchant with fields: name, address, mandiCode, contact, negativeFlag, isActive
- **API Routes**: Full CRUD operations at /api/buyers with Zod validation using insertBuyerSchema
- **UI Pattern**: Editable table rows with localRows state management:
  - `localRows = null`: Displaying server data (no edits)
  - `localRows = [...]`: User has unsaved local edits
- **Delete Preservation**: Delete operations preserve unsaved edits on other rows
- **Receivables Column**: Displays receivables from linked Cash Management parties (pendingDueToBePaid)
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
  - Deletes higher ID farmer
- **Due Calculations**:
  - PY Receivable: Combined pyReceivable + receivables from managed cash farmers (pendingDueToBePaid)
  - Harvest Due: Sum of totalDueToFarmer from matching stock entries
  - Seed Due: Sum of totalDueFromFarmer from matching seed transactions
  - Net Due = PY Receivable + Harvest Due - Seed Due - Receivables
- **Receivables Integration**: Managed farmers from Cash Settings with pendingDueToBePaid are combined into PY Receivable column and appear in Seed farmer dropdown
- **PY Balances**: Previous year payable/receivable are editable inline with blur-based commits
- **Negative Flag & Archive**: Toggle controls per farmer; archived farmers shown at bottom with toggle to show/hide
- **Farmer IDs Never Reassigned**: Unique farmer codes (FMYYYYMMDD#) are permanent and never recycled
- **Accessible via**: User dropdown menu > "Farmer Ledger" link

### Cross-Module Farmer Settlement System
- **Purpose**: Automatically offset payments between Raw Potato dues (merchant owes farmer) and Seed Transaction dues (farmer owes merchant)
- **Farmer Identity Matching**: Uses composite key of normalized name (case-insensitive, trimmed) + optional village + optional contact
- **Settlement Directions**:
  - `raw_to_seed`: When paying farmer for raw potatoes, auto-offset their seed purchase dues
  - `seed_to_raw`: When receiving seed sale payment, auto-offset raw potato dues owed to farmer
- **Audit Trail**: `farmerSettlements` table stores affected stock entry IDs and seed transaction IDs as JSON arrays
- **UI**: Shows preview cards in Cash Management with separate enable/disable toggles for inward and outflow forms
- **FIFO Allocation**: Settlement amounts are applied in order to oldest outstanding dues first

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

### Build & Development
- Vite for frontend bundling with HMR
- esbuild for server bundling in production
- TSX for TypeScript execution in development