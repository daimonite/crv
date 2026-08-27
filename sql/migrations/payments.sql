-- Payme Africa payments table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  supplier_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

  provider TEXT NOT NULL DEFAULT 'payme',
  provider_transaction_id TEXT,
  reference TEXT NOT NULL UNIQUE,

  amount_tzs INTEGER NOT NULL CHECK (amount_tzs > 0),
  currency TEXT NOT NULL DEFAULT 'TZS',
  fee_tzs INTEGER DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired', 'refunded')),

  msisdn TEXT,
  channel TEXT,
  failure_code TEXT,
  failure_reason TEXT,

  idempotency_key TEXT UNIQUE,

  initiated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_account_id ON payments(account_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key);

-- Row Level Security
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access on payments"
  ON payments FOR ALL
  USING (true)
  WITH CHECK (true);

-- Disbursements table (supplier payouts)
CREATE TABLE IF NOT EXISTS disbursements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  supplier_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

  provider TEXT NOT NULL DEFAULT 'payme',
  provider_transaction_id TEXT,
  reference TEXT NOT NULL UNIQUE,

  amount_tzs INTEGER NOT NULL CHECK (amount_tzs > 0),
  channel TEXT NOT NULL DEFAULT 'CASHIN',
  fee_tzs INTEGER DEFAULT 0,
  net_amount_tzs INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  msisdn TEXT,
  bank_code TEXT,
  bank_account TEXT,
  failure_code TEXT,
  failure_reason TEXT,

  initiated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disbursements_account_id ON disbursements(account_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_reference ON disbursements(reference);
CREATE INDEX IF NOT EXISTS idx_disbursements_status ON disbursements(status);

ALTER TABLE disbursements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on disbursements"
  ON disbursements FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disbursements_updated_at
  BEFORE UPDATE ON disbursements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
