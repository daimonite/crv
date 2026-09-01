"use client";

import { useState, useTransition } from "react";
import { addBranchBatch, adjustBranchBatch } from "@/lib/actions/branch";

interface StockRow {
  id: string;
  product_name: string;
  quantity: number;
  sale_price: number | null;
  cost_price: number | null;
  expiry_date: string | null;
}

interface StockClientProps {
  stock: StockRow[];
  products: { id: string; name: string }[];
}

export default function StockClient({ stock, products }: StockClientProps) {
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    productId: "",
    quantity: "",
    expiryDate: "",
    costPrice: "",
    salePrice: "",
  });

  const today = new Date().toISOString().slice(0, 10);

  function closeNotice() {
    setTimeout(() => setNotice(null), 4000);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.productId || !form.expiryDate) return;
    startTransition(async () => {
      const { error } = await addBranchBatch({
        productId: form.productId,
        quantity: Number(form.quantity),
        expiryDate: form.expiryDate,
        costPrice: Number(form.costPrice) || undefined,
        salePrice: Number(form.salePrice) || undefined,
      });
      if (error) setNotice(error);
      else {
        setNotice("Stock received.");
        setForm({ productId: "", quantity: "", expiryDate: "", costPrice: "", salePrice: "" });
        setShowAdd(false);
      }
      closeNotice();
    });
  }

  function handleAdjust(batchId: string, current: number, direction: 1 | -1) {
    startTransition(async () => {
      const reason = direction > 0 ? "manual stock-in" : prompt("Reason for removing stock:", "damaged / expired / sold");
      if (direction < 0 && !reason) return;
      const { error } = await adjustBranchBatch(batchId, direction * 1, reason ?? "");
      if (error) setNotice(error);
      else setNotice(`${direction > 0 ? "Stock-in" : "Stock-out"} recorded (${current + direction}).`);
      closeNotice();
    });
  }

  return (
    <div className="p-8 max-w-container-max mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-ink-deep mb-1">Inventory</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Batches for this branch, oldest expiry first (FEFO).
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          disabled={isPending}
          className="px-4 py-2.5 rounded-no-notch text-center bg-primary font-label-md text-label-md text-white hover:bg-primary-variant disabled:opacity-60"
        >
          + Receive stock
        </button>
      </div>

      {notice && (
        <div className="mb-4 px-4 py-3 bg-surface-container-low border border-outline-variant rounded text-sm text-ink-deep">
          {notice}
        </div>
      )}

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="mb-6 p-5 bg-surface-base border border-outline-variant rounded custom-notch-sm grid grid-cols-1 md:grid-cols-5 gap-4"
        >
          <div className="md:col-span-2">
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">Product</label>
            <select
              required
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
              className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">Quantity</label>
            <input
              type="number"
              min={1}
              required
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">Expiry</label>
            <input
              type="date"
              min={today}
              required
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">Cost (TSh)</label>
              <input
                type="number"
                min={0}
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">Sale (TSh)</label>
              <input
                type="number"
                min={0}
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="md:col-span-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-no-notch text-center bg-surface border border-outline-variant font-label-md text-label-md text-on-surface-variant disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2.5 rounded-no-notch text-center bg-primary font-label-md text-label-md text-white hover:bg-primary-variant disabled:opacity-60"
            >
              Save batch
            </button>
          </div>
        </form>
      )}

      <div className="bg-surface-base border border-outline-variant rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-label-md text-label-md text-on-surface-variant border-b border-outline-variant uppercase text-xs">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">On hand</th>
              <th className="px-4 py-3">Cost (TSh)</th>
              <th className="px-4 py-3">Sale (TSh)</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3 text-right">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {stock.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">
                  No stock recorded for this branch yet. Receive your first batch above.
                </td>
              </tr>
            )}
            {stock.map((row) => {
              const daysLeft = row.expiry_date
                ? Math.ceil((new Date(row.expiry_date).getTime() - Date.now()) / 86400000)
                : null;
              const expired = daysLeft !== null && daysLeft < 0;
              const low = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
              return (
                <tr key={row.id} className="border-b border-outline-variant/60 last:border-b-0">
                  <td className="px-4 py-3 font-medium">{row.product_name}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${row.quantity <= 0 ? "text-error" : ""}`}>{row.quantity}</span>
                  </td>
                  <td className="px-4 py-3">{row.cost_price?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-3">{row.sale_price?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-3">
                    {row.expiry_date ? (
                      <span className={expired ? "text-error font-medium" : low ? "text-amber-600 font-medium" : undefined}>
                        {new Date(row.expiry_date).toLocaleDateString()}
                        {expired ? " · expired" : low ? ` · ${daysLeft}d` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleAdjust(row.id, row.quantity, -1)}
                        disabled={isPending || row.quantity <= 0}
                        title="Remove 1 (damaged/expired/sold)"
                        className="px-2.5 py-1.5 rounded text-xs bg-surface border border-outline-variant text-on-surface-variant hover:text-error disabled:opacity-40"
                      >
                        −1
                      </button>
                      <button
                        onClick={() => handleAdjust(row.id, row.quantity, 1)}
                        disabled={isPending}
                        title="Add 1 (stock-in)"
                        className="px-2.5 py-1.5 rounded text-xs bg-primary text-white hover:bg-primary-variant disabled:opacity-40"
                      >
                        +1
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}