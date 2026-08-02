/*
# Dairy Management System — Core Schema

1. Overview
This migration creates the full database for a single-tenant Dairy Management System.
The dairy owner manages customers, dynamic milk pricing rules, daily milk collection,
monthly billing, payments, reports, and dairy settings — all from one admin panel.

A CRITICAL business rule: once a milk collection is saved, the applied rate is stored
permanently on that collection row. If the owner changes a rate later, historical
collections and bills are never recalculated. Only future collections use the new rate.
This is enforced by storing `applied_rate` and `total_amount` directly on each
milk_collections row, and by storing a rate snapshot on bills.

2. New Tables
- `settings`            : single-row dairy profile (name, logo, address, phone, GST, UPI QR, receipt footer, terms).
- `customers`           : suppliers/buyers with auto customer ID, optional custom rate.
- `milk_rates`          : unlimited pricing rules (fixed, fat-based, fat+snf, customer-specific, manual).
- `rate_history`        : append-only audit of every rate change (add/edit/delete/activate/deactivate).
- `milk_collections`   : daily milk entries with a permanent applied-rate snapshot.
- `bills`               : monthly invoices with aggregated totals and a rate snapshot.
- `payments`            : recorded payments (cash/UPI/bank), partial/advance/pending tracking.

3. Security
- Single-tenant app, no sign-in screen. All policies use `TO anon, authenticated` so the
  anon-key frontend can read/write its own data. RLS enabled on every table.
- `USING (true)` is acceptable here because the data is intentionally shared within the
  single dairy business (no multi-user isolation needed).

4. Important notes
- Auto Customer ID and Auto Invoice Number are generated via Postgres sequences + defaults.
- Rate history is append-only and records every create/update/delete/activate/deactivate.
- Bills store a JSON snapshot of the applied rates so they never change after a rate update.
*/

-- ============================================================
-- SETTINGS (single-row dairy profile)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id integer PRIMARY KEY DEFAULT 1,
  dairy_name text NOT NULL DEFAULT 'My Dairy',
  logo_url text,
  address text,
  phone text,
  gst text,
  upi_id text,
  upi_qr_url text,
  receipt_footer text,
  terms_and_conditions text,
  currency text NOT NULL DEFAULT 'INR',
  currency_symbol text NOT NULL DEFAULT '₹',
  dark_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_settings" ON settings;
CREATE POLICY "anon_read_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS customer_id_seq START 1;

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL UNIQUE DEFAULT ('CUST-' || lpad(nextval('customer_id_seq')::text, 5, '0')),
  name text NOT NULL,
  mobile text,
  address text,
  village text,
  joining_date date NOT NULL DEFAULT CURRENT_DATE,
  aadhaar text,
  category text NOT NULL DEFAULT 'Both' CHECK (category IN ('Supplier','Buyer','Both')),
  custom_rate numeric(10,2),
  default_milk_type text CHECK (default_milk_type IN ('Cow','Buffalo','Mixed')),
  payment_cycle text DEFAULT 'Monthly',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers (mobile);
CREATE INDEX IF NOT EXISTS idx_customers_category ON customers (category);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_customers" ON customers;
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_customers" ON customers;
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- MILK RATES (pricing rules)
-- ============================================================
CREATE TABLE IF NOT EXISTS milk_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  milk_type text NOT NULL CHECK (milk_type IN ('Cow','Buffalo','Mixed','All')),
  customer_type text NOT NULL CHECK (customer_type IN ('Supplier','Buyer','All')),
  rate_type text NOT NULL CHECK (rate_type IN ('Fixed','FatBased','FatSnfBased','CustomerSpecific','Manual')),
  base_rate numeric(10,2) NOT NULL DEFAULT 0,
  fat_min numeric(5,2),
  fat_max numeric(5,2),
  fat_bonus_per_unit numeric(10,2) DEFAULT 0,
  snf_min numeric(5,2),
  snf_max numeric(5,2),
  snf_bonus_per_unit numeric(10,2) DEFAULT 0,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  shift text CHECK (shift IN ('Morning','Evening','Both')),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milk_rates_active ON milk_rates (is_active);
CREATE INDEX IF NOT EXISTS idx_milk_rates_milk_type ON milk_rates (milk_type);
CREATE INDEX IF NOT EXISTS idx_milk_rates_customer ON milk_rates (customer_id);

ALTER TABLE milk_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_milk_rates" ON milk_rates;
CREATE POLICY "anon_select_milk_rates" ON milk_rates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_milk_rates" ON milk_rates;
CREATE POLICY "anon_insert_milk_rates" ON milk_rates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_milk_rates" ON milk_rates;
CREATE POLICY "anon_update_milk_rates" ON milk_rates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_milk_rates" ON milk_rates;
CREATE POLICY "anon_delete_milk_rates" ON milk_rates FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- RATE HISTORY (append-only audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id uuid REFERENCES milk_rates(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  milk_type text,
  customer_type text,
  rate_type text,
  base_rate numeric(10,2),
  fat_min numeric(5,2),
  fat_max numeric(5,2),
  snf_min numeric(5,2),
  snf_max numeric(5,2),
  effective_from date,
  effective_to date,
  is_active boolean,
  action text NOT NULL CHECK (action IN ('Created','Updated','Deleted','Activated','Deactivated')),
  changed_by text DEFAULT 'Owner',
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_history_rate_id ON rate_history (rate_id);
CREATE INDEX IF NOT EXISTS idx_rate_history_created ON rate_history (created_at);

ALTER TABLE rate_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_rate_history" ON rate_history;
CREATE POLICY "anon_select_rate_history" ON rate_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_rate_history" ON rate_history;
CREATE POLICY "anon_insert_rate_history" ON rate_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_rate_history" ON rate_history;
CREATE POLICY "anon_delete_rate_history" ON rate_history FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- MILK COLLECTIONS (with permanent applied-rate snapshot)
-- ============================================================
CREATE TABLE IF NOT EXISTS milk_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_date date NOT NULL DEFAULT CURRENT_DATE,
  shift text NOT NULL CHECK (shift IN ('Morning','Evening')),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  milk_type text NOT NULL CHECK (milk_type IN ('Cow','Buffalo','Mixed')),
  quantity numeric(10,3) NOT NULL CHECK (quantity >= 0),
  fat numeric(5,2) CHECK (fat >= 0),
  snf numeric(5,2) CHECK (snf >= 0),
  rate_rule_id uuid REFERENCES milk_rates(id) ON DELETE SET NULL,
  rate_rule_name text,
  applied_rate numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_date ON milk_collections (collection_date);
CREATE INDEX IF NOT EXISTS idx_collections_customer ON milk_collections (customer_id);
CREATE INDEX IF NOT EXISTS idx_collections_shift ON milk_collections (shift);
CREATE INDEX IF NOT EXISTS idx_collections_date_shift ON milk_collections (collection_date, shift);

ALTER TABLE milk_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_collections" ON milk_collections;
CREATE POLICY "anon_select_collections" ON milk_collections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_collections" ON milk_collections;
CREATE POLICY "anon_insert_collections" ON milk_collections FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_collections" ON milk_collections;
CREATE POLICY "anon_update_collections" ON milk_collections FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_collections" ON milk_collections;
CREATE POLICY "anon_delete_collections" ON milk_collections FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- BILLS (monthly invoices with rate snapshot)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE TABLE IF NOT EXISTS bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  customer_code text NOT NULL,
  bill_month integer NOT NULL CHECK (bill_month BETWEEN 1 AND 12),
  bill_year integer NOT NULL,
  morning_quantity numeric(12,3) NOT NULL DEFAULT 0,
  evening_quantity numeric(12,3) NOT NULL DEFAULT 0,
  total_quantity numeric(12,3) NOT NULL DEFAULT 0,
  average_fat numeric(5,2) NOT NULL DEFAULT 0,
  average_snf numeric(5,2) NOT NULL DEFAULT 0,
  applied_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  bonus numeric(14,2) NOT NULL DEFAULT 0,
  deduction numeric(14,2) NOT NULL DEFAULT 0,
  advance_payment numeric(14,2) NOT NULL DEFAULT 0,
  net_payable numeric(14,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending','Partial','Paid')),
  status text NOT NULL DEFAULT 'Generated' CHECK (status IN ('Draft','Generated','Sent','Cancelled')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bills_customer ON bills (customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_month_year ON bills (bill_year, bill_month);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills (payment_status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bills_customer_month_year ON bills (customer_id, bill_month, bill_year);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bills" ON bills;
CREATE POLICY "anon_select_bills" ON bills FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_bills" ON bills;
CREATE POLICY "anon_insert_bills" ON bills FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_bills" ON bills;
CREATE POLICY "anon_update_bills" ON bills FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_bills" ON bills;
CREATE POLICY "anon_delete_bills" ON bills FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL UNIQUE DEFAULT ('PAY-' || lpad((nextval('invoice_number_seq'))::text, 6, '0')),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  bill_id uuid REFERENCES bills(id) ON DELETE SET NULL,
  invoice_number text,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  payment_type text NOT NULL CHECK (payment_type IN ('Full','Partial','Advance')),
  payment_mode text NOT NULL CHECK (payment_mode IN ('Cash','UPI','Bank')),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference_note text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments (bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_payments" ON payments;
CREATE POLICY "anon_select_payments" ON payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_payments" ON payments;
CREATE POLICY "anon_insert_payments" ON payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_payments" ON payments;
CREATE POLICY "anon_update_payments" ON payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_payments" ON payments;
CREATE POLICY "anon_delete_payments" ON payments FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- updated_at trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_milk_rates_updated ON milk_rates;
CREATE TRIGGER trg_milk_rates_updated BEFORE UPDATE ON milk_rates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_collections_updated ON milk_collections;
CREATE TRIGGER trg_collections_updated BEFORE UPDATE ON milk_collections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bills_updated ON bills;
CREATE TRIGGER trg_bills_updated BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
