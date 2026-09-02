-- Order approval gate + inventory receipt + branch-claim support.
-- All three changes are additive/nullable — safe to run on the existing
-- orders, order_line_items, and branches tables without touching their
-- current constraints.

-- 1. Marks when the supplier approved a pending order. NULL = not yet
--    approved. The pharmacy can only pay (via /api/marketplace/checkout or
--    /api/marketplace/pay-order) once this is set.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_approved_at TIMESTAMPTZ;

-- 2. Links each order line back to the master product row, so a delivered
--    order can be turned into a real inventory batch (see updateOrderStatus
--    in src/lib/actions/supplier.ts). Existing rows will have NULL here —
--    that's fine, they predate this feature and were never auto-received
--    into inventory anyway.
ALTER TABLE order_line_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- 3. Marks a branch as claimed by a specific desktop POS install. NULL means
--    no device has activated this branch yet, so it's available to link.
--    Enforced with a conditional UPDATE (`.is('pos_activated_at', null)`) at
--    claim time so two devices racing to claim the same branch can't both
--    win — see claimBranch() in cervos-desktop/src/lib/sync.ts.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS pos_activated_at TIMESTAMPTZ;
