# Design Guidelines for Vyapar Vriddhi

## Design Approach

**Selected Approach:** Design System - Business Productivity Focus

**Justification:** This is a utility-focused, data-intensive business management application where efficiency, clarity, and accuracy are paramount. The design should prioritize form usability, data readability, and workflow efficiency over decorative elements.

**Core Principles:**
- Clarity over creativity - users need to enter data quickly and accurately
- Consistency across all forms and tables
- Minimal visual distractions from business tasks
- Professional, trustworthy aesthetic appropriate for B2B context

---

## Typography

**Font Families:**
- Primary: Inter (via Google Fonts) - Excellent readability for forms and data tables
- Monospace: JetBrains Mono - For serial numbers, bill numbers, and numeric data

**Hierarchy:**
- Page Titles: text-2xl font-semibold
- Section Headers: text-lg font-medium
- Form Labels: text-sm font-medium
- Input Text: text-base
- Table Headers: text-sm font-semibold uppercase tracking-wide
- Table Data: text-sm
- Helper Text: text-xs text-gray-600

---

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-4, p-6, p-8
- Section spacing: mb-6, mb-8
- Form field gaps: gap-4, gap-6
- Table cell padding: px-4 py-3

**Container Strategy:**
- Main content area: max-w-7xl mx-auto px-6
- Forms: max-w-4xl for single-column, max-w-6xl for multi-column layouts
- Tables: Full width within container with horizontal scroll on overflow

**Grid Layouts:**
- Form fields: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
- Multi-lot entries: Stack vertically with clear visual separation

---

## Component Library

### Forms & Inputs

**Text Inputs:**
- Clean, bordered style with focus states
- Clear label positioning above input
- Validation states (error, success) with inline messaging
- Consistent height (h-10) across all input types

**Dropdowns/Selects:**
- Native select styling enhanced with clear arrow indicators
- Searchable for long lists (Districts, Cold Store Names)
- Group related options (Districts by State)

**Conditional Fields:**
- Bilty Cut → Final Bags breakdown appears with smooth transition
- Clear visual hierarchy showing parent-child relationships
- "Add Row" button prominently placed for multi-row entries

**Action Buttons:**
- Primary (Save): Solid, prominent positioning
- Secondary (Cancel): Outlined or ghost style
- Destructive (Delete row): Red accent, icon + text
- Add More (Lot/Row): Plus icon with clear label

### Data Tables (Stock Register)

**Table Structure:**
- Fixed header row with sorting indicators
- Alternating row background for readability
- Sticky header on scroll for long lists
- Right-aligned numeric columns (quantities, prices)
- Action column (Edit, Print) pinned to right

**Search & Filters:**
- Prominent search bar at table top
- Filter chips for: Payment Status, Quality, Unsold, Cold Store
- Clear filter indicators showing active selections

### Cards & Sections

**Lot Cards (in Stock Entry):**
- Bordered container with subtle shadow
- Sequential numbering clearly visible
- Remove/Delete option for additional lots
- Consistent internal padding (p-6)

**Information Display:**
- Key-value pairs in two-column layout
- Bill preview before print with all transaction details
- Auto-generated numbers (Serial #, Bill #) highlighted distinctly

---

## Navigation & Tabs

**Tab Navigation:**
- Horizontal tab bar with clear active state
- Tabs: Stock Entry | Stock Register
- Full-width underline for active tab
- Consistent spacing between tabs (px-6)

**User Context Indicator:**
- Merchant name and user name visible in header
- Clear visual indication of which merchant's data is being viewed

---

## Special Features

**Multi-Row Entry (Bilty Cut breakdown):**
- Each row in bordered container
- Clear column headers: Size | # Bags | Weight | Price/kg | Total
- Running total displayed prominently
- Validation: Sum equals original bags count

**Edit Mode (Stock Register):**
- In-line editing with clear save/cancel per row
- Visual distinction between view and edit states
- Preserve all data visibility during editing

**Print Layout (Bills):**
- Clean, professional invoice format
- Merchant branding area at top
- Clear line items with totals
- All relevant transaction metadata (Serial #, Date, Farmer details)

---

## Accessibility & Consistency

- All form fields have associated labels (not placeholder-only)
- Error messages appear consistently below fields
- Required field indicators (* asterisk)
- Keyboard navigation fully supported for forms
- Focus indicators clearly visible
- Touch-friendly sizing (min h-10 for interactive elements)

---

## Images

**No hero images required** - This is a business productivity application focused on data entry and management, not marketing appeal.

**Icon Usage:**
- Use Lucide React icons (via CDN or npm)
- Icons for: Add, Edit, Delete, Print, Search, Filter
- Icon size: 16-20px alongside text, 24px for standalone buttons
- Consistent stroke-width across all icons

---

## Visual Rhythm

- Consistent card/section spacing: mb-8
- Form sections separated with mb-6
- Input groups: gap-4
- Maintain generous whitespace in forms to reduce cognitive load
- Table rows: py-3 for comfortable scanning