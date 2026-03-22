-- Create sundry_pay_stakeholders table
CREATE TABLE IF NOT EXISTS sundry_pay_stakeholders (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  sundry_pay_id TEXT,
  date_added DATE NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  contact TEXT,
  py_receivable DECIMAL(12,2) DEFAULT '0',
  red_flag BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sundry_pay_merchant_sundry_pay_id_unique
ON sundry_pay_stakeholders (merchant_id, sundry_pay_id);

-- Create sundry_pay_edit_history table
CREATE TABLE IF NOT EXISTS sundry_pay_edit_history (
  id SERIAL PRIMARY KEY,
  serial_number INTEGER NOT NULL,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  sundry_pay_stakeholder_id INTEGER NOT NULL REFERENCES sundry_pay_stakeholders(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  changed_by INTEGER REFERENCES users(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);

-- Add sundry pay columns to cash_entries
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS sundry_pay_name TEXT;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS sundry_pay_db_id INTEGER;
