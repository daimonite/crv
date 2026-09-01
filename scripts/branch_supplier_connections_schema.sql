-- Cervos: Branch <-> Supplier connection approvals
-- Run this in Supabase Dashboard > SQL Editor.
-- Model: browsing the marketplace stays open to everyone (no visibility gating).
-- Placing an order requires an APPROVED connection between the buyer branch and
-- the supplier. Supplier sends the request; the branch's POS Admin approves it
-- from the desktop POS (Marketplace > Connection Requests).

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

-- Reads/writes for this table go through the service-role client in API routes
-- (same pattern already used by /api/marketplace/*), which bypasses RLS after the
-- route itself checks the caller owns the branch or supplier account. So RLS here
-- is a defense-in-depth backstop, not the primary authorization layer:
DROP POLICY IF EXISTS "branch_supplier_connections_service_only" ON branch_supplier_connections;
CREATE POLICY "branch_supplier_connections_service_only" ON branch_supplier_connections
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
