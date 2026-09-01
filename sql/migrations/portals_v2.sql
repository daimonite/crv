-- ═══════════════════════════════════════════════════════════════════════
-- Cervos v1 — Web Portals v2
-- Supplier subscriptions (plans by connected pharmacies, from 5,000 TZS/mo),
-- pharmacy plans keyed to connected suppliers + branches, operator branch
-- portal web access, and Payme wallet rollups.
--
-- Run this once in Supabase Dashboard → SQL Editor. Idempotent — safe to
-- re-run in any environment (dev/staging/prod).
-- ═══════════════════════════════════════════════════════════════════════

-- Ensure the updated_at helper exists even if payments.sql has not run.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Branch ↔ Supplier connection approvals (required by marketplace checkout)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branch_supplier_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  UNIQUE(branch_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_supplier_connections_branch ON branch_supplier_connections(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_supplier_connections_supplier ON branch_supplier_connections(supplier_id);

ALTER TABLE branch_supplier_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branch_supplier_connections_service_only" ON branch_supplier_connections;
CREATE POLICY "branch_supplier_connections_service_only" ON branch_supplier_connections
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ───────────────────────────────────────────────────────────────────────
-- 2. Subscription plans — supplier + pharmacy audiences
--    pharmacy plans cap: max_branches, max_operators, max_suppliers
--    supplier plans cap: max_connected_pharmacies
-- ───────────────────────────────────────────────────────────────────────
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'pharmacy';
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_suppliers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_connected_pharmacies INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_subscription_plans_audience ON subscription_plans(audience);

-- Existing single plan row ("Mikumi (Standard)") → audit as the pharmacy Solo tier.
UPDATE subscription_plans
SET audience = 'pharmacy',
    max_branches = 1,
    max_operators = 5,
    max_suppliers = 3,
    price_monthly_tzs = 10000,
    price_annual_tzs = 100000,
    features = ARRAY['1 pharmacy branch', '3 connected suppliers', '5 operators', 'Marketplace ordering + escrow payments', 'Branch network map']
WHERE audience = 'pharmacy' AND name = 'Mikumi (Standard)';

-- Pharmacy plans (keyed to branches + connected suppliers)
INSERT INTO subscription_plans (name, audience, price_monthly_tzs, price_annual_tzs, max_branches, max_operators, max_suppliers, max_connected_pharmacies, features)
SELECT v.name, 'pharmacy', v.price_m, v.price_y, v.branches, v.operators, v.suppliers, 0, v.features
FROM (VALUES
  ('Mikumi (Standard)', 10000, 100000, 1,  5,   3,  ARRAY['1 pharmacy branch','3 connected suppliers','5 operators','Marketplace ordering + escrow payments','Branch network map']),
  ('Serengeti (Growth)', 25000, 250000, 3,  15,  10, ARRAY['Up to 3 pharmacy branches','Up to 10 connected suppliers','15 operators','Marketplace ordering + escrow payments','Branch network map','HQ support']),
  ('Kilimanjaro (Premium)', 60000, 600000, 10, 40,  25, ARRAY['Up to 10 pharmacy branches','Up to 25 connected suppliers','40 operators','Marketplace ordering + escrow payments','Branch network map','Priority HQ support','Analytics & reports'])
) AS v(name, price_m, price_y, branches, operators, suppliers, features)
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans p WHERE p.audience = 'pharmacy' AND p.name = v.name);

-- Supplier plans (priced by connected pharmacies, start at 5,000 TZS/mo)
INSERT INTO subscription_plans (name, audience, price_monthly_tzs, price_annual_tzs, max_branches, max_operators, max_suppliers, max_connected_pharmacies, features)
SELECT v.name, 'supplier', v.price_m, v.price_y, 0, 0, 0, v.pharmacies, v.features
FROM (VALUES
  ('Mwanzo (Starter)', 5000, 50000,  3,     ARRAY['Up to 3 connected pharmacies','Order notifications','Transaction history','Marketplace storefront']),
  ('Biashara (Growth)', 15000, 150000, 15,   ARRAY['Up to 15 connected pharmacies','Order notifications','Transaction history','Marketplace storefront','Priority support']),
  ('Taifa (Enterprise)', 40000, 400000, 999999, ARRAY['Unlimited connected pharmacies','Order notifications','Transaction history','Marketplace storefront','Priority support','Dedicated account manager'])
) AS v(name, price_m, price_y, pharmacies, features)
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans p WHERE p.audience = 'supplier' AND p.name = v.name);

-- ───────────────────────────────────────────────────────────────────────
-- 3. Accounts — Payme wallet rollup (also mirrored on payment_settings)
-- ───────────────────────────────────────────────────────────────────────
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS payme_wallet_number TEXT;

-- ───────────────────────────────────────────────────────────────────────
-- 4. Operators — web (branch portal) access
--    auth_user_id links the operator to a Supabase Auth login; when set,
--    the operator can sign into the /branch portal and see only their branch.
-- ───────────────────────────────────────────────────────────────────────
ALTER TABLE operators ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS web_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_operators_auth_user_id ON operators(auth_user_id);

create unique index if not exists operators_auth_user_id_key on public.operators (auth_user_id)
  where auth_user_id is not null;

-- ───────────────────────────────────────────────────────────────────────
-- 5. Subscription payments ledger (Payme collections for Cervopharma Org)
--    One row per subscription renewal; activated by the Payme webhook.
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  audience TEXT NOT NULL DEFAULT 'pharmacy',
  amount_tzs INTEGER NOT NULL CHECK (amount_tzs > 0),
  reference TEXT NOT NULL UNIQUE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  provider_transaction_id TEXT,
  months INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'confirmed', 'failed', 'expired')),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_account_id ON subscription_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_reference ON subscription_payments(reference);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status ON subscription_payments(status);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_payments_service_only" ON subscription_payments;
CREATE POLICY "subscription_payments_service_only" ON subscription_payments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_subscription_payments_updated_at ON subscription_payments;
CREATE TRIGGER update_subscription_payments_updated_at
  BEFORE UPDATE ON subscription_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();