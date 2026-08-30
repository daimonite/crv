import { useState, useEffect } from "react";
import { queryDb, executeDb, generateId, nowIso } from "../lib/database";
import { queueForSync, runSyncCycle } from "../lib/sync";
import { PHARMACY_CATEGORIES } from "../lib/branding";
import { useAuthStore } from "../lib/store";
import type { Product, Batch } from "../types";
import BarcodeScanner from "../components/BarcodeScanner";

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => {
      detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
    };
  }
}

export default function Inventory() {
  const { isAdmin, permissions } = useAuthStore()
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [productBatches, setProductBatches] = useState<Batch[]>([]);
  const [productSales, setProductSales] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const prods = await queryDb("SELECT * FROM products ORDER BY generic_name");
    const bats = await queryDb("SELECT * FROM batches");
    setProducts(prods);
    setBatches(bats);
    setIsLoading(false);
  }

  async function loadProductDetails(product: Product) {
    const bats = batches.filter((b) => b.product_id === product.id);
    setProductBatches(bats);
    const salesData = await queryDb(`
      SELECT si.*, s.created_at as sale_date, s.payment_method
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE si.batch_id IN (${bats.map(() => '?').join(',') || 'NULL'})
      ORDER BY s.created_at DESC
      LIMIT 50
    `, bats.map(b => b.id));
    setProductSales(salesData);
  }

  function getStockForProduct(productId: string): number {
    return batches
      .filter((b) => b.product_id === productId)
      .reduce((sum, b) => sum + (b.quantity || 0), 0);
  }

  function getLowStockProducts(): Product[] {
    return products.filter((p) => getStockForProduct(p.id) <= (p.low_stock_threshold || 10));
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.generic_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.includes(searchQuery);
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  function handleProductClick(product: Product) {
    if (isAdmin && permissions.canEditInventory) {
      setEditingProduct(product);
    } else if (permissions.canViewInventoryDetail) {
      loadProductDetails(product);
      setViewingProduct(product);
    } else {
      // Fallback: view-only if no edit permission
      loadProductDetails(product);
      setViewingProduct(product);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline text-2xl font-black text-on-surface">
            Inventory
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {products.length} products Â· {batches.filter((b) => b.quantity > 0).length} batches in stock
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined">add</span>
            Add Product
          </button>
        )}
      </div>

      {getLowStockProducts().length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2 text-amber-800">
            <span className="material-symbols-outlined">warning</span>
            <span className="font-semibold">
              {getLowStockProducts().length} products low on stock
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {getLowStockProducts().slice(0, 5).map((p) => (
              <span
                key={p.id}
                className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full"
              >
                {p.generic_name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or barcode..."
            className="w-full px-4 py-2.5 rounded-lg border border-outline-variant bg-surface-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2.5 rounded-lg border border-outline-variant bg-surface-base focus:outline-none focus:border-primary"
        >
          <option value="">All Categories</option>
          {PHARMACY_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface-base border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-outline-variant/50">
            <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Formulation</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Price</th>
              {isAdmin && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => {
              const stock = getStockForProduct(product.id);
              const cheapestBatch = batches
                .filter((b) => b.product_id === product.id)
                .sort((a, b) => a.cost_price - b.cost_price)[0];
              const mostExpensiveBatch = batches
                .filter((b) => b.product_id === product.id)
                .sort((a, b) => b.sale_price - a.sale_price)[0];

              return (
                <tr
                  key={product.id}
                  className="border-t border-outline-variant hover:bg-outline-variant/30"
                >
                  <td className="px-4 py-3 cursor-pointer" onClick={() => handleProductClick(product)}>
                    <p className="font-medium text-sm">{product.generic_name}</p>
                    {product.brand_name && (
                      <p className="text-xs text-on-surface-variant">
                        {product.brand_name}
                      </p>
                    )}
                    {product.requires_prescription ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-xs rounded mt-1">
                        <span className="material-symbols-outlined text-xs">
                          medical_information
                        </span>
                        Rx
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    {product.category || "Uncategorized"}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    {product.formulation || "â€”"}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">
                    {product.barcode || "â€”"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      stock <= 10 ? "text-error" : "text-on-surface"
                    }`}
                  >
                    {stock}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    TZS {cheapestBatch ? cheapestBatch.cost_price.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    TZS {mostExpensiveBatch ? mostExpensiveBatch.sale_price.toLocaleString() : "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingProduct(product)}
                        className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl">inventory_2</span>
            <p className="mt-2 font-medium">No products found</p>
          </div>
        )}
      </div>

      {viewingProduct && (
        <ProductDetailModal
          product={viewingProduct}
          batches={productBatches}
          sales={productSales}
          onClose={() => {
            setViewingProduct(null);
            setProductBatches([]);
            setProductSales([]);
          }}
        />
      )}

      {(showAddModal || editingProduct) && (
        <ProductModal
          product={editingProduct}
          onClose={() => {
            setShowAddModal(false);
            setEditingProduct(null);
          }}
          onSave={async (productData) => {
            const now = nowIso();
            let productId: string;
            if (editingProduct) {
              productId = editingProduct.id;
              await executeDb(
                `UPDATE products SET generic_name = ?, brand_name = ?, category = ?, formulation = ?, requires_prescription = ?, barcode = ?, default_expiry = ?, default_cost_price = ?, default_sale_price = ?, low_stock_threshold = ?, notify_threshold = ?, updated_at = ? WHERE id = ?`,
                [
                  productData.generic_name,
                  productData.brand_name,
                  productData.category,
                  productData.formulation,
                  productData.requires_prescription ? 1 : 0,
                  productData.barcode,
                  productData.default_expiry || null,
                  productData.default_cost_price || null,
                  productData.default_sale_price || null,
                  productData.low_stock_threshold || 10,
                  productData.notify_threshold || 5,
                  now,
                  editingProduct.id,
                ]
              );
              await queueForSync("products", productId, "update", {
                id: productId,
                generic_name: productData.generic_name,
                brand_name: productData.brand_name,
                category: productData.category,
                formulation: productData.formulation,
                requires_prescription: productData.requires_prescription ? 1 : 0,
                barcode: productData.barcode,
                default_expiry: productData.default_expiry || null,
                default_cost_price: productData.default_cost_price || null,
                default_sale_price: productData.default_sale_price || null,
                low_stock_threshold: productData.low_stock_threshold || 10,
                notify_threshold: productData.notify_threshold || 5,
                updated_at: now,
              });
            } else {
              productId = generateId();
              await executeDb(
                `INSERT INTO products (id, generic_name, brand_name, category, formulation, requires_prescription, barcode, default_expiry, default_cost_price, default_sale_price, low_stock_threshold, notify_threshold, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                  productId,
                  productData.generic_name,
                  productData.brand_name,
                  productData.category,
                  productData.formulation,
                  productData.requires_prescription ? 1 : 0,
                  productData.barcode,
                  productData.default_expiry || null,
                  productData.default_cost_price || null,
                  productData.default_sale_price || null,
                  productData.low_stock_threshold || 10,
                  productData.notify_threshold || 5,
                  now,
                ]
              );
              await queueForSync("products", productId, "insert", {
                id: productId,
                generic_name: productData.generic_name,
                brand_name: productData.brand_name,
                category: productData.category,
                formulation: productData.formulation,
                requires_prescription: productData.requires_prescription ? 1 : 0,
                barcode: productData.barcode,
                default_expiry: productData.default_expiry || null,
                default_cost_price: productData.default_cost_price || null,
                default_sale_price: productData.default_sale_price || null,
                low_stock_threshold: productData.low_stock_threshold || 10,
                notify_threshold: productData.notify_threshold || 5,
                updated_at: now,
              });
            }

            if (productData.quantity > 0) {
              const branchRes = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'");
              const branchId = branchRes.length > 0 ? JSON.parse(branchRes[0].value) : null;
              const batchId = generateId();
              await executeDb(
                `INSERT INTO batches (id, branch_id, product_id, batch_number, quantity, cost_price, sale_price, expiry_date, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
                [
                  batchId,
                  branchId,
                  productId,
                  null,
                  productData.quantity,
                  productData.default_cost_price || 0,
                  productData.default_sale_price || 0,
                  productData.default_expiry || null,
                  now,
                ]
              );
              await queueForSync("batches", batchId, "insert", {
                id: batchId,
                branch_id: branchId,
                product_id: productId,
                batch_number: null,
                quantity: productData.quantity,
                cost_price: productData.default_cost_price || 0,
                sale_price: productData.default_sale_price || 0,
                expiry_date: productData.default_expiry || null,
                sync_version: 1,
                updated_at: now,
              });
            }
            loadData();
            setShowAddModal(false);
            setEditingProduct(null);
            runSyncCycle().catch(() => {});
          }}
        />
      )}
    </div>
  );
}

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  onSave: (data: {
    generic_name: string;
    brand_name: string;
    category: string;
    formulation: string;
    requires_prescription: boolean;
    barcode: string;
    quantity: number;
    default_expiry?: string;
    default_cost_price?: number;
    default_sale_price?: number;
    low_stock_threshold: number;
    notify_threshold: number;
  }) => void;
}

const FORMULATIONS = ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Ointment", "Drops", "Inhaler", "Suppository", "Powder", "Solution", "Suspension", "Gel", "Patch", "Other"]

function ProductModal({ product, onClose, onSave }: ProductModalProps) {
  const [genericName, setGenericName] = useState(product?.generic_name || "");
  const [brandName, setBrandName] = useState(product?.brand_name || "");
  const [category, setCategory] = useState(product?.category || "");
  const [formulation, setFormulation] = useState(product?.formulation || "");
  const [requiresPrescription, setRequiresPrescription] = useState(
    !!product?.requires_prescription
  );
  const [barcode, setBarcode] = useState(product?.barcode || "");
  const [defaultExpiry, setDefaultExpiry] = useState(product?.default_expiry || "");
  const [defaultCostPrice, setDefaultCostPrice] = useState(product?.default_cost_price?.toString() || "");
  const [defaultSalePrice, setDefaultSalePrice] = useState(product?.default_sale_price?.toString() || "");
  const [quantity, setQuantity] = useState(product ? "0" : "1");
  const [lowStockThreshold, setLowStockThreshold] = useState(product?.low_stock_threshold?.toString() || "10");
  const [notifyThreshold, setNotifyThreshold] = useState(product?.notify_threshold?.toString() || "5");
  const [showScanner, setShowScanner] = useState(false);

  const inputClass =
    "w-full px-3 py-2.5 rounded-md border border-outline-variant bg-white text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary";
  const labelClass = "block text-xs font-semibold text-on-surface-variant mb-1";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      generic_name: genericName.trim(),
      brand_name: brandName.trim(),
      category,
      formulation,
      requires_prescription: requiresPrescription,
      barcode: barcode.trim(),
      quantity: parseInt(quantity, 10) || 0,
      default_expiry: defaultExpiry || undefined,
      default_cost_price: defaultCostPrice ? parseFloat(defaultCostPrice) : undefined,
      default_sale_price: defaultSalePrice ? parseFloat(defaultSalePrice) : undefined,
      low_stock_threshold: parseInt(lowStockThreshold, 10) || 10,
      notify_threshold: parseInt(notifyThreshold, 10) || 5,
    });
  }

  function handleBarcodeScanned(scannedBarcode: string) {
    setBarcode(scannedBarcode);
    setShowScanner(false);
  }

  return (
    <>
      {showScanner && (
        <BarcodeScanner onScan={handleBarcodeScanned} onClose={() => setShowScanner(false)} />
      )}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-surface-base rounded-2xl shadow-xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-headline text-xl font-bold text-on-surface">
              {product ? "Edit Product" : "Add Product"}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-outline-variant transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Generic Name *</label>
              <input
                type="text"
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Paracetamol"
                required
              />
            </div>

            <div>
              <label className={labelClass}>Brand Name</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Panadol"
              />
            </div>

            <div>
              <label className={labelClass}>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              >
                <option value="">Select category</option>
                {PHARMACY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Formulation</label>
              <select
                value={formulation}
                onChange={(e) => setFormulation(e.target.value)}
                className={inputClass}
              >
                <option value="">Select formulation</option>
                {FORMULATIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Barcode</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 1234567890123"
                />
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="px-3 py-2.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  title="Scan barcode"
                >
                  <span className="material-symbols-outlined">qr_code_scanner</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className={labelClass}>Default Expiry</label>
                <input
                  type="date"
                  value={defaultExpiry}
                  onChange={(e) => setDefaultExpiry(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Cost/Unit</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={defaultCostPrice}
                  onChange={(e) => setDefaultCostPrice(e.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                />
              </div>
              <div>
              <label className={labelClass}>Sell/Unit</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={defaultSalePrice}
                onChange={(e) => setDefaultSalePrice(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={labelClass}>Stock Qty</label>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Low Stock Threshold</label>
              <input
                type="number"
                min="0"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                className={inputClass}
                placeholder="10"
              />
              <p className="text-xs text-on-surface-variant mt-1">Alert when stock falls below this</p>
            </div>
            <div>
              <label className={labelClass}>Notify Threshold</label>
              <input
                type="number"
                min="0"
                value={notifyThreshold}
                onChange={(e) => setNotifyThreshold(e.target.value)}
                className={inputClass}
                placeholder="5"
              />
              <p className="text-xs text-on-surface-variant mt-1">Urgent alert when stock falls below this</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requires_prescription"
              checked={requiresPrescription}
              onChange={(e) => setRequiresPrescription(e.target.checked)}
              className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
            />
            <label
              htmlFor="requires_prescription"
              className="text-sm text-on-surface"
            >
              Requires prescription
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-md border border-outline-variant text-on-surface font-medium hover:bg-outline-variant/30 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-md bg-primary text-on-primary font-semibold hover:opacity-90 transition-opacity"
            >
              {product ? "Update" : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}

interface ProductDetailModalProps {
  product: Product;
  batches: Batch[];
  sales: any[];
  onClose: () => void;
}

function ProductDetailModal({ product, batches, sales, onClose }: ProductDetailModalProps) {
  const totalStock = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
  const totalSales = sales.reduce((sum, s) => sum + (s.quantity || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-base rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-xl font-bold text-on-surface">
            Product Details
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-outline-variant transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-surface p-4 rounded-xl border border-outline-variant">
            <h3 className="font-semibold text-lg">{product.generic_name}</h3>
            {product.brand_name && (
              <p className="text-sm text-on-surface-variant">{product.brand_name}</p>
            )}
            <div className="flex gap-4 mt-3 text-sm">
              <span className="text-on-surface-variant">Category: <span className="text-on-surface">{product.category || 'N/A'}</span></span>
              <span className="text-on-surface-variant">Barcode: <span className="text-on-surface font-mono">{product.barcode || 'N/A'}</span></span>
            </div>
            {product.requires_prescription ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded mt-2">
                <span className="material-symbols-outlined text-xs">medical_information</span>
                Requires Prescription
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface p-4 rounded-xl border border-outline-variant text-center">
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Total Stock</p>
              <p className={`font-headline text-2xl font-black mt-1 ${totalStock <= 10 ? 'text-error' : 'text-on-surface'}`}>
                {totalStock}
              </p>
            </div>
            <div className="bg-surface p-4 rounded-xl border border-outline-variant text-center">
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Units Sold</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">{totalSales}</p>
            </div>
            <div className="bg-surface p-4 rounded-xl border border-outline-variant text-center">
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Batch Count</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">{batches.length}</p>
            </div>
          </div>

          <div>
            <h3 className="font-headline font-bold text-on-surface mb-3">Batch History</h3>
            <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-outline-variant/50">
                  <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase">
                    <th className="px-4 py-2">Batch ID</th>
                    <th className="px-4 py-2 text-right">Expiry</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Cost</th>
                    <th className="px-4 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">No batches found</td>
                    </tr>
                  ) : (
                    batches.map((batch) => (
                      <tr key={batch.id} className="border-t border-outline-variant">
                        <td className="px-4 py-2 font-mono text-xs">{batch.id.slice(0, 8)}...</td>
                        <td className="px-4 py-2 text-right">{batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'N/A'}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${batch.quantity <= 10 ? 'text-error' : ''}`}>{batch.quantity}</td>
                        <td className="px-4 py-2 text-right">TZS ${batch.cost_price.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">TZS ${batch.sale_price.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {sales.length > 0 && (
            <div>
              <h3 className="font-headline font-bold text-on-surface mb-3">Recent Sales</h3>
              <div className="bg-surface rounded-xl border border-outline-variant overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-outline-variant/50">
                    <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Unit Price</th>
                      <th className="px-4 py-2 text-right">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.slice(0, 10).map((sale, idx) => (
                      <tr key={idx} className="border-t border-outline-variant">
                        <td className="px-4 py-2">{sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : 'N/A'}</td>
                        <td className="px-4 py-2 text-right">{sale.quantity}</td>
                        <td className="px-4 py-2 text-right">TZS ${sale.unit_price.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{sale.payment_method || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
