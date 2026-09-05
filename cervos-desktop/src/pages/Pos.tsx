import { useState, useEffect, useRef } from "react";
import { queryDb, executeDb, generateId, nowIso } from "../lib/database";
import { queueForSync, processSyncQueue, checkSubscriptionBlocked } from "../lib/sync";
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

interface CartItem {
  batch: Batch;
  product: Product;
  quantity: number;
  unit_price: number;
}

interface CompletedSale {
  receiptNumber: string;
  total: number;
  tender: number;
  change: number;
  paymentMethod: string;
  createdAt: string;
}

const PAYMENT_METHODS = ["cash", "card", "mobile_money", "insurance"];

export default function Pos() {
  const { currentOperator } = useAuthStore()
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [tenderAmount, setTenderAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState(10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const prods = await queryDb("SELECT * FROM products");
    const bats = await queryDb("SELECT * FROM batches WHERE quantity > 0");
    const taxSetting = await queryDb("SELECT value FROM app_settings WHERE key = 'tax_rate'");
    if (taxSetting.length > 0) {
      const configuredRate = Number(JSON.parse(taxSetting[0].value));
      if (Number.isFinite(configuredRate) && configuredRate >= 0) setTaxRate(configuredRate);
    }
    setProducts(prods);
    setBatches(bats);
  }

  function findProductByBarcode(barcodeStr: string): { product: Product; batch: Batch } | null {
    if (!barcodeStr.trim()) return null;

    const productByBarcode = products.find((p) => p.barcode === barcodeStr);
    if (productByBarcode) {
      const batch = batches.find((b) => b.product_id === productByBarcode.id);
      if (batch) return { product: productByBarcode, batch };
    }

    const batchById = batches.find((b) => b.id === barcodeStr);
    if (batchById) {
      const product = products.find((p) => p.id === batchById.product_id);
      if (product) return { product, batch: batchById };
    }

    return null;
  }

  function addToCart(item: CartItem) {
    setCart((prev) => {
      const existing = prev.find(
        (c) => c.batch.id === item.batch.id
      );
      if (existing) {
        if (existing.quantity >= item.batch.quantity) return prev;
        return prev.map((c) =>
          c.batch.id === item.batch.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, item];
    });
  }

  function handleBarcodeScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const found = findProductByBarcode(barcode);
    if (found) {
      addToCart({
        batch: found.batch,
        product: found.product,
        quantity: 1,
        unit_price: found.batch.sale_price,
      });
    }
    setBarcode("");
  }

  function handleSearchBarcode() {
    if (!searchQuery) return;
    const found = findProductByBarcode(searchQuery);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const productByName = products.find((product) =>
      [product.generic_name, product.brand_name, product.barcode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    );
    const namedBatch = productByName && batches.find((batch) => batch.product_id === productByName.id);
    if (found) {
      addToCart({
        batch: found.batch,
        product: found.product,
        quantity: 1,
        unit_price: found.batch.sale_price,
      });
    } else if (productByName && namedBatch) {
      addToCart({ batch: namedBatch, product: productByName, quantity: 1, unit_price: namedBatch.sale_price });
    }
    setSearchQuery("");
  }

  function handleBarcodeScanned(scannedBarcode: string) {
    const found = findProductByBarcode(scannedBarcode);
    if (found) {
      addToCart({
        batch: found.batch,
        product: found.product,
        quantity: 1,
        unit_price: found.batch.sale_price,
      });
    }
    setShowScanner(false);
  }

  function updateQuantity(batchId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.batch.id === batchId
            ? { ...item, quantity: Math.min(item.batch.quantity, Math.max(0, item.quantity + delta)) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  const availableItems = batches
    .filter((batch) => batch.quantity > 0)
    .map((batch) => ({ batch, product: products.find((product) => product.id === batch.product_id) }))
    .filter((item): item is { batch: Batch; product: Product } => Boolean(item.product))

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const matchingItems = normalizedSearch
    ? availableItems.filter(({ product }) =>
        [product.generic_name, product.brand_name, product.barcode]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch))
      )
    : availableItems

  function addAvailableItem(item: { batch: Batch; product: Product }) {
    addToCart({ batch: item.batch, product: item.product, quantity: 1, unit_price: item.batch.sale_price })
    setSearchQuery('')
  }

  function removeFromCart(batchId: string) {
    setCart((prev) => prev.filter((item) => item.batch.id !== batchId));
  }

  function getSubtotal(): number {
    return cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  }

  function getTax(): number {
    return getSubtotal() * (taxRate / 100);
  }

  function getTotal(): number {
    return getSubtotal() + getTax() - parseFloat(discount || "0");
  }

  function getChange(): number {
    const tender = parseFloat(tenderAmount || "0");
    return Math.max(0, tender - getTotal());
  }

  async function processSale() {
    if (cart.length === 0 || isProcessing) return;

    setSaleError(null);

    const block = await checkSubscriptionBlocked();
    if (block.blocked) {
      alert(`Cannot process sale: ${block.reason || "subscription blocked"}`);
      return;
    }

    setIsProcessing(true);
    try {
      const branchResult = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
      const branchId = branchResult.length > 0 ? JSON.parse(branchResult[0].value) : null
      if (!branchId) throw new Error('No pharmacy branch is linked to this POS. Link the branch in Settings before recording a sale.')
      if (!currentOperator) throw new Error('No operator is signed in. Sign in again before recording a sale.')

      const saleId = generateId();
      const receiptId = generateId();
      const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;
      const now = nowIso();
      const total = getTotal();
      const tender = parseFloat(tenderAmount || "0") || total;

      await executeDb(
        `INSERT INTO sales (id, branch_id, operator_id, total, discount, tax, tender, change_due, payment_method, payment_ref, created_at, synced)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          saleId,
          branchId,
          currentOperator?.id || null,
          total,
          parseFloat(discount || "0"),
          getTax(),
          tender,
          getChange(),
          paymentMethod,
          null,
          now,
          0,
        ]
      );

      for (const item of cart) {
        const saleItemId = generateId();
        await executeDb(
          `INSERT INTO sale_items (id, sale_id, batch_id, quantity, unit_price) VALUES (?,?,?,?,?)`,
          [saleItemId, saleId, item.batch.id, item.quantity, item.unit_price]
        );
        await executeDb(
          `UPDATE batches SET quantity = quantity - ?, updated_at = ? WHERE id = ?`,
          [item.quantity, nowIso(), item.batch.id]
        );
      }

      await executeDb(
        `INSERT INTO receipts (id, sale_id, receipt_number, created_at) VALUES (?,?,?,?)`,
        [receiptId, saleId, receiptNumber, now]
      );

      await queueForSync("sales", saleId, "insert", {
        id: saleId,
        branch_id: branchId,
        operator_id: currentOperator?.id || null,
        total,
        discount: parseFloat(discount || "0"),
        tax: getTax(),
        tender,
        change_due: getChange(),
        payment_method: paymentMethod,
        created_at: now,
      });

      for (const item of cart) {
        await queueForSync("sale_items", `${saleId}-${item.batch.id}`, "insert", {
          id: `${saleId}-${item.batch.id}`,
          sale_id: saleId,
          batch_id: item.batch.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        });
      }

      setCart([]);
      setTenderAmount("");
      setDiscount("0");
      loadData();
      setCompletedSale({
        receiptNumber,
        total,
        tender,
        change: getChange(),
        paymentMethod,
        createdAt: now,
      });

      processSyncQueue().catch(console.error);
    } catch (err) {
      console.error("Sale processing failed:", err);
      setSaleError(err instanceof Error ? err.message : 'Sale could not be saved. No receipt was generated.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <>
      {showScanner && (
        <BarcodeScanner onScan={handleBarcodeScanned} onClose={() => setShowScanner(false)} />
      )}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface-base p-6 shadow-xl">
            <div className="text-center">
              <span className="material-symbols-outlined text-5xl text-secondary">check_circle</span>
              <h2 className="mt-2 font-headline text-2xl font-bold">Sale completed</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Transaction receipt</p>
            </div>
            <div className="mt-6 space-y-3 rounded-xl bg-surface p-4 text-sm">
              <div className="flex justify-between"><span className="text-on-surface-variant">Receipt</span><span className="font-mono font-semibold">{completedSale.receiptNumber}</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant">Date</span><span>{new Date(completedSale.createdAt).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant">Payment</span><span>{completedSale.paymentMethod.replace('_', ' ').toUpperCase()}</span></div>
              <div className="flex justify-between border-t border-outline-variant pt-3 text-lg font-bold"><span>Total</span><span>TZS {completedSale.total.toLocaleString()}</span></div>
              {completedSale.tender > 0 && <div className="flex justify-between"><span className="text-on-surface-variant">Change</span><span>TZS {completedSale.change.toLocaleString()}</span></div>}
            </div>
            <button type="button" onClick={() => setCompletedSale(null)} className="mt-6 w-full rounded-lg bg-primary py-3 font-semibold text-white">Done</button>
          </div>
        </div>
      )}
      <div className="flex h-full">
        <div className="flex-1 flex flex-col p-6">
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <div className="flex gap-2">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={handleBarcodeScan}
                placeholder="Scan barcode or type manually..."
                className="flex-1 px-4 py-3 rounded-lg border border-outline-variant bg-surface-base text-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <button
                onClick={() => setShowScanner(true)}
                className="px-4 py-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title="Scan barcode"
                type="button"
              >
                <span className="material-symbols-outlined">qr_code_scanner</span>
              </button>
            </div>
          </div>
          <div className="w-64 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchBarcode()}
              placeholder="Search products..."
              className="w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {normalizedSearch && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-outline-variant bg-surface-base shadow-lg">
                {matchingItems.length > 0 ? matchingItems.slice(0, 6).map((item) => (
                  <button
                    key={item.batch.id}
                    type="button"
                    onClick={() => addAvailableItem(item)}
                    className="w-full px-3 py-2 text-left hover:bg-primary/10 border-b border-outline-variant last:border-b-0"
                  >
                    <span className="block text-sm font-medium">{item.product.generic_name}</span>
                    <span className="block text-xs text-on-surface-variant">
                      {item.product.brand_name || 'Generic'} · TZS {item.batch.sale_price.toLocaleString()} · {item.batch.quantity} in stock
                    </span>
                  </button>
                )) : (
                  <p className="px-3 py-3 text-sm text-on-surface-variant">No in-stock products match your search.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-surface-base border border-outline-variant rounded-xl">
          {cart.length === 0 ? (
            <div className="h-full overflow-y-auto p-5">
              <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant">
                <span className="material-symbols-outlined text-5xl">point_of_sale</span>
                <p className="mt-2 text-lg font-medium">Choose products to start a sale</p>
                <p className="text-sm">Search by name or barcode, scan an item, or select from available inventory.</p>
              </div>
              {matchingItems.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {matchingItems.map((item) => (
                    <button
                      key={item.batch.id}
                      type="button"
                      onClick={() => addAvailableItem(item)}
                      className="rounded-xl border border-outline-variant p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <p className="font-semibold text-on-surface">{item.product.generic_name}</p>
                      <p className="text-sm text-on-surface-variant">{item.product.brand_name || 'Generic'}</p>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-semibold text-primary">TZS {item.batch.sale_price.toLocaleString()}</span>
                        <span className="text-on-surface-variant">{item.batch.quantity} in stock</span>
                      </div>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                        <span className="material-symbols-outlined text-base">add_shopping_cart</span>
                        Add to cart
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-on-surface-variant">
                  <p className="font-medium">No saleable stock is available.</p>
                  <p className="mt-1 text-sm">Add a product with a stock quantity greater than zero in Inventory before making a sale.</p>
                </div>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-outline-variant/50 sticky top-0">
                <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-center">Qty</th>
                  <th className="px-4 py-3 text-right">Subtotal</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <tr key={item.batch.id} className="border-t border-outline-variant">
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm">{item.product.generic_name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {item.product.brand_name || "Generic"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      TZS {item.unit_price.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.batch.id, -1)}
                          className="w-8 h-8 rounded-full bg-outline-variant hover:bg-primary hover:text-white transition-colors flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-medium">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.batch.id, 1)}
                          className="w-8 h-8 rounded-full bg-outline-variant hover:bg-primary hover:text-white transition-colors flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      TZS {(item.unit_price * item.quantity).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => removeFromCart(item.batch.id)}
                        className="p-1 rounded hover:bg-error/10 text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-xl">
                          delete
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="w-80 bg-surface-base border-l border-outline-variant p-6 flex flex-col">
        <h2 className="font-headline text-lg font-bold text-on-surface mb-4">
          Payment
        </h2>
        {saleError && <div className="mb-4 rounded-lg border border-error/20 bg-error/10 p-3 text-sm text-error">{saleError}</div>}

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm focus:outline-none focus:border-primary"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method.replace("_", " ").toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
              Discount (TZS)
            </label>
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
              Amount Tendered (TZS)
            </label>
            <input
              type="number"
              value={tenderAmount}
              onChange={(e) => setTenderAmount(e.target.value)}
              min="0"
              step="0.01"
              placeholder={getTotal().toLocaleString()}
              className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="border-t border-outline-variant pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Subtotal</span>
            <span>TZS {getSubtotal().toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Tax ({taxRate}%)</span>
            <span>TZS {getTax().toLocaleString()}</span>
          </div>
          {parseFloat(discount || "0") > 0 && (
            <div className="flex justify-between text-sm text-secondary">
              <span>Discount</span>
              <span>-TZS {parseFloat(discount || "0").toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-headline text-xl font-black">
            <span>Total</span>
            <span>TZS {getTotal().toLocaleString()}</span>
          </div>
          {parseFloat(tenderAmount || "0") > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Change</span>
              <span className="text-secondary font-semibold">
                TZS {getChange().toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4">
          <button
            onClick={processSale}
            disabled={cart.length === 0 || isProcessing}
            className="w-full py-4 rounded-xl bg-primary text-on-primary font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <span className="material-symbols-outlined animate-spin">
                  progress_activity
                </span>
                Processing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">check_circle</span>
                Complete Sale
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
