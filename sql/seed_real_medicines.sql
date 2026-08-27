-- Seed real medicines + stock into Supabase
-- Run this in Supabase Dashboard → SQL Editor (service_role)
-- Idempotent: uses ON CONFLICT DO NOTHING / UPDATE

-- 1) Master products (shared catalog)
INSERT INTO products (id, generic_name, brand_name, category, formulation, requires_prescription, barcode, default_cost_price, default_sale_price, updated_at) VALUES
  ('prod-real-001', 'Amoxicillin 500mg', 'Amoxil', 'Antibiotics', 'Capsule', true, '6001001000011', 3200, 4500, NOW()),
  ('prod-real-002', 'Paracetamol 500mg', 'Panadol', 'Analgesics', 'Tablet', false, '6001001000028', 1200, 2500, NOW()),
  ('prod-real-003', 'Artemether/Lumefantrine 20/120mg', 'Coartem', 'Antimalarials', 'Tablet', true, '6001001000035', 4800, 6800, NOW()),
  ('prod-real-004', 'Metformin 500mg', 'Glucophage', 'Diabetes Care', 'Tablet', true, '6001001000042', 4200, 5900, NOW()),
  ('prod-real-005', 'Amoxicillin/Clavulanate 625mg', 'Augmentin', 'Antibiotics', 'Tablet', true, '6001001000059', 5500, 7800, NOW()),
  ('prod-real-006', 'Cetirizine 10mg', 'Zyrtec', 'Antihistamines', 'Tablet', false, '6001001000066', 900, 1600, NOW()),
  ('prod-real-007', 'Omeprazole 20mg', 'Losec', 'Digestive Health', 'Capsule', false, '6001001000073', 1800, 2800, NOW()),
  ('prod-real-008', 'Salbutamol Inhaler 100mcg', 'Ventolin', 'Respiratory', 'Inhaler', true, '6001001000080', 9500, 12800, NOW()),
  ('prod-real-009', 'ORS Sachet', 'ORASEL', 'Rehydration', 'Powder', false, '6001001000097', 400, 900, NOW()),
  ('prod-real-010', 'Zinc Sulphate 20mg', 'Zindol', 'Supplements', 'Tablet', false, '6001001000103', 600, 1200, NOW()),
  ('prod-real-011', 'Ibuprofen 400mg', 'Brufen', 'Analgesics', 'Tablet', false, '6001001000110', 1100, 2100, NOW()),
  ('prod-real-012', 'Ciprofloxacin 500mg', 'Cipro', 'Antibiotics', 'Tablet', true, '6001001000127', 3800, 5200, NOW()),
  ('prod-real-013', 'Losartan 50mg', 'Cozaar', 'Cardiovascular', 'Tablet', true, '6001001000134', 5600, 7500, NOW()),
  ('prod-real-014', 'Vitamin C 500mg', 'Redoxon', 'Vitamins & Supplements', 'Tablet', false, '6001001000141', 1300, 2200, NOW()),
  ('prod-real-015', 'Metronidazole 400mg', 'Flagyl', 'Antibiotics', 'Tablet', true, '6001001000158', 900, 1700, NOW()),
  ('prod-real-016', 'Dextromethorphan Syrup', 'Benylin', 'Respiratory', 'Syrup', false, '6001001000165', 4500, 6500, NOW()),
  ('prod-real-017', 'Insulin Glargine', 'Lantus', 'Diabetes Care', 'Injection', true, '6001001000172', 28000, 35000, NOW()),
  ('prod-real-018', 'Atorvastatin 20mg', 'Lipitor', 'Cardiovascular', 'Tablet', true, '6001001000189', 6200, 8200, NOW()),
  ('prod-real-019', 'Amlodipine 5mg', 'Norvasc', 'Cardiovascular', 'Tablet', true, '6001001000196', 2400, 3600, NOW()),
  ('prod-real-020', 'Chloroquine 250mg', 'Nivaquine', 'Antimalarials', 'Tablet', false, '6001001000202', 800, 1500, NOW())
ON CONFLICT (id) DO UPDATE SET
  generic_name = EXCLUDED.generic_name,
  brand_name = EXCLUDED.brand_name,
  category = EXCLUDED.category,
  formulation = EXCLUDED.formulation,
  requires_prescription = EXCLUDED.requires_prescription,
  barcode = EXCLUDED.barcode,
  default_cost_price = EXCLUDED.default_cost_price,
  default_sale_price = EXCLUDED.default_sale_price,
  updated_at = NOW();

-- 2) Supplier catalog (stock + pricing) — attaches to first available supplier account
-- If no supplier exists, this will do nothing. Create a supplier at cervos.online/auth (choose Supplier) first.
DO $$
DECLARE
  sup_id UUID;
BEGIN
  SELECT id INTO sup_id FROM accounts WHERE type = 'supplier' LIMIT 1;
  IF sup_id IS NULL THEN
    RAISE NOTICE 'No supplier account found — create one at cervos.online/auth (Supplier) then re-run this seed.';
    RETURN;
  END IF;

  INSERT INTO supplier_catalog (id, supplier_id, product_id, price, currency, min_order_qty, stock_qty, pack_size, lead_time_days, status, sku, updated_at) VALUES
    ('sc-real-001', sup_id, 'prod-real-001', 4500, 'TZS', 50, 600, '10x10 caps', 2, 'active', 'MED-AMOX-500', NOW()),
    ('sc-real-002', sup_id, 'prod-real-002', 2500, 'TZS', 100, 1200, '10x10 tabs', 1, 'active', 'MED-PARA-500', NOW()),
    ('sc-real-003', sup_id, 'prod-real-003', 6800, 'TZS', 30, 400, '24 tabs', 2, 'active', 'MED-COART-6x4', NOW()),
    ('sc-real-004', sup_id, 'prod-real-004', 5900, 'TZS', 40, 350, '60 tabs', 3, 'active', 'MED-MET-500', NOW()),
    ('sc-real-005', sup_id, 'prod-real-005', 7800, 'TZS', 30, 250, '14 tabs', 2, 'active', 'MED-AUG-625', NOW()),
    ('sc-real-006', sup_id, 'prod-real-006', 1600, 'TZS', 60, 500, '10 tabs', 2, 'active', 'MED-CET-10', NOW()),
    ('sc-real-007', sup_id, 'prod-real-007', 2800, 'TZS', 40, 300, '14 caps', 2, 'active', 'MED-OME-20', NOW()),
    ('sc-real-008', sup_id, 'prod-real-008', 12800, 'TZS', 10, 80, '200 dose', 3, 'active', 'MED-SALB-INH', NOW()),
    ('sc-real-009', sup_id, 'prod-real-009', 900, 'TZS', 200, 2000, '1 sachet', 1, 'active', 'MED-ORS-1', NOW()),
    ('sc-real-010', sup_id, 'prod-real-010', 1200, 'TZS', 80, 600, '10 tabs', 2, 'active', 'MED-ZINC-20', NOW()),
    ('sc-real-011', sup_id, 'prod-real-011', 2100, 'TZS', 50, 700, '10 tabs', 1, 'active', 'MED-IBU-400', NOW()),
    ('sc-real-012', sup_id, 'prod-real-012', 5200, 'TZS', 40, 280, '10 tabs', 2, 'active', 'MED-CIP-500', NOW()),
    ('sc-real-013', sup_id, 'prod-real-013', 7500, 'TZS', 30, 200, '30 tabs', 3, 'active', 'MED-LOS-50', NOW()),
    ('sc-real-014', sup_id, 'prod-real-014', 2200, 'TZS', 50, 800, '15 tabs', 1, 'active', 'MED-VITC-500', NOW()),
    ('sc-real-015', sup_id, 'prod-real-015', 1700, 'TZS', 60, 450, '10 tabs', 2, 'active', 'MED-FLAG-400', NOW()),
    ('sc-real-016', sup_id, 'prod-real-016', 6500, 'TZS', 20, 150, '100ml', 2, 'active', 'MED-BENY-100', NOW()),
    ('sc-real-017', sup_id, 'prod-real-017', 35000, 'TZS', 5, 40, '1 vial', 4, 'active', 'MED-LANT-1', NOW()),
    ('sc-real-018', sup_id, 'prod-real-018', 8200, 'TZS', 30, 180, '30 tabs', 3, 'active', 'MED-LIPI-20', NOW()),
    ('sc-real-019', sup_id, 'prod-real-019', 3600, 'TZS', 40, 320, '30 tabs', 2, 'active', 'MED-NORV-5', NOW()),
    ('sc-real-020', sup_id, 'prod-real-020', 1500, 'TZS', 80, 900, '10 tabs', 1, 'active', 'MED-NIVA-250', NOW())
  ON CONFLICT (id) DO UPDATE SET
    price = EXCLUDED.price,
    stock_qty = EXCLUDED.stock_qty,
    status = EXCLUDED.status,
    updated_at = NOW();

  RAISE NOTICE 'Seeded 20 medicines for supplier %', sup_id;
END $$;

-- Verify
SELECT 'products' as table, count(*) FROM products WHERE id LIKE 'prod-real-%'
UNION ALL
SELECT 'catalog (active)' as table, count(*) FROM supplier_catalog WHERE status = 'active';
