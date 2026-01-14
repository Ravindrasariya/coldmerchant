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
- **Stock Entries**: Per-merchant with auto-incrementing serial numbers
- **Lots**: Child of stock entries, tracks cold store inventory
- **Bag Breakdowns**: Granular tracking of bags by size within lots
- **Edit History**: Audit trail of all modifications to stock entries after initial creation

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