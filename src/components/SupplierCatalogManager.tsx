/**
 * @file components/SupplierCatalogManager.tsx
 * @description Product catalogue CRUD UI for supplier accounts.
 *
 * Allows suppliers to view, filter, add, edit, and archive their product listings.
 * Every mutation (save, status change) hits real Supabase via the server actions
 * in `lib/actions/supplier.ts` — no mock writes.
 *
 * Status lifecycle: draft → active → archived
 */
"use client";

import { useState, useMemo } from "react";
import { saveCatalogProduct, setCatalogProductStatus } from "@/lib/actions/supplier";
import { useI18n } from "@/lib/i18n/context";

/** A product in the supplier's catalogue. */
export interface CatalogProduct {
  id: string;
  name: string;
  genericName: string;
  /** Supplier's internal SKU code */
  sku: string;
  category: string;
  packSize: string;
  unitPrice: number;
  currency: string;
  stockQty: number;
  minOrderQty: number;
  /** Lifecycle status. draft = not yet published, archived = delisted. */
  status: "active" | "archived" | "draft";
}

interface SupplierCatalogManagerProps {
  /** Initial product list fetched server-side and passed as props. */
  initialProducts: CatalogProduct[];
}

type StatusFilter = "all" | "active" | "archived" | "draft";

function StatusBadge({ status }: { status: CatalogProduct["status"] }) {
  const map = {
    active: "border-tertiary-container text-tertiary bg-[#dcfce7]",
    archived: "border-outline-variant text-on-surface-variant bg-surface-container",
    draft: "border-[#b45309] text-[#b45309] bg-[#fef3c7]",
  };
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-label-md px-2 py-0.5 border uppercase ${map[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full block ${
        status === "active" ? "bg-tertiary-container" :
        status === "archived" ? "bg-outline-variant" : "bg-[#b45309]"
      }`} />
      {status}
    </span>
  );
}

export default function SupplierCatalogManager({ initialProducts }: SupplierCatalogManagerProps) {
  const { t } = useI18n();
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<CatalogProduct | null>(null);
  const [formData, setFormData] = useState<Partial<CatalogProduct>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.genericName.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [products, statusFilter, search]);

  function openAdd() {
    setFormData({ status: "draft", currency: "TZS", minOrderQty: 100 });
    setEditTarget(null);
    setShowAddModal(true);
  }

  function openEdit(product: CatalogProduct) {
    setFormData({ ...product });
    setEditTarget(product);
    setShowAddModal(true);
  }

  async function toggleArchive(id: string) {
    const target = products.find((p) => p.id === id);
    if (!target) return;
    const next = target.status === "archived" ? "active" : "archived";
    setError(null);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, status: next } : p)));
    const result = await setCatalogProductStatus(id, next);
    if (result.error) {
      setError(result.error);
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, status: target.status } : p)));
    }
  }

  async function handleSave() {
    if (!formData.name?.trim()) {
      setError(t("sup.catalog.product_name_required"));
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: formData.name ?? "",
      genericName: formData.genericName ?? "",
      sku: formData.sku ?? "",
      category: formData.category ?? "Other",
      packSize: formData.packSize ?? "",
      unitPrice: formData.unitPrice ?? 0,
      currency: formData.currency ?? "TZS",
      stockQty: formData.stockQty ?? 0,
      minOrderQty: formData.minOrderQty ?? 100,
      status: (formData.status ?? "draft") as CatalogProduct["status"],
    };
    const result = await saveCatalogProduct({ id: editTarget?.id, ...payload });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    const savedId = result.id ?? editTarget?.id;
    const newProduct: CatalogProduct = {
      id: savedId ?? `local-${Date.now()}`,
      ...payload,
    };
    if (editTarget) {
      setProducts((prev) => prev.map((p) => (p.id === editTarget.id ? newProduct : p)));
    } else {
      setProducts((prev) => [newProduct, ...prev]);
    }
    setSaving(false);
    setShowAddModal(false);
  }

  const counts = { active: 0, archived: 0, draft: 0 };
  products.forEach((p) => { counts[p.status]++; });

  return (
    <div className="flex-1 p-8 flex flex-col gap-6 max-w-[1200px] mx-auto w-full">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-6">
        {(["active", "draft", "archived"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`text-left border p-4 relative transition-colors ${
              statusFilter === s
                ? "bg-primary-container text-on-primary border-primary-container"
                : "bg-surface-container-lowest border-outline-variant hover:bg-surface-container"
            }`}
          >
            <div className="absolute top-0 right-0 w-4 h-4 border-l border-b border-current opacity-30" />
            <p className="font-mono text-label-md uppercase mb-1 opacity-70">{s} products</p>
            <p className="text-headline-md font-headline-md">{counts[s]}</p>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex items-center flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[18px]">search</span>
          <input
            type="text"
            placeholder={t("sup.catalog.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-outline-variant bg-surface-container-lowest text-on-surface text-body-sm font-body-md focus:outline-none focus:border-primary-container w-full"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "active", "draft", "archived"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`font-mono text-label-md px-3 py-1.5 border uppercase transition-colors ${
                statusFilter === f
                  ? "bg-ink-deep text-white border-ink-deep"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={openAdd}
          className="ml-auto flex items-center gap-2 bg-ink-deep text-white font-mono text-label-md px-4 py-2 hover:opacity-90 transition-opacity uppercase"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          {t("sup.catalog.add_product")}
        </button>
      </div>

      {error && (
        <div className="border border-error bg-error-container text-error px-4 py-2 font-body-sm text-body-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface-container-lowest border border-outline-variant overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container border-b border-outline-variant">
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">{t("sup.catalog.product")}</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">{t("sup.catalog.sku")}</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">{t("sup.catalog.pack_size")}</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">{t("sup.catalog.unit_price")}</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">{t("sup.catalog.stock")}</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">{t("sup.catalog.status")}</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase text-right">{t("sup.catalog.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant font-body-md">
                  {t("sup.catalog.no_products")}
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-outline-variant hover:bg-surface-container-low transition-colors">
                <td className="px-4 py-3">
                  <div className="font-semibold text-body-sm text-ink-deep">{p.name}</div>
                  <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">{p.genericName} · {p.category}</div>
                </td>
                <td className="px-4 py-3 font-mono text-label-md text-on-surface">{p.sku}</td>
                <td className="px-4 py-3 text-body-sm text-on-surface">{p.packSize}</td>
                <td className="px-4 py-3 font-mono text-label-md text-on-surface tabular-nums">
                  {p.currency} {p.unitPrice.toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-label-md text-on-surface tabular-nums">
                  {p.stockQty.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEdit(p)}
                    className="font-mono text-label-md text-primary-container border border-primary-container px-2 py-1 hover:bg-surface-container-high transition-colors uppercase"
                  >
                    {t("sup.catalog.edit")}
                  </button>
                  <button
                    onClick={() => toggleArchive(p.id)}
                    className="font-mono text-label-md text-on-surface-variant border border-outline-variant px-2 py-1 hover:bg-surface-container transition-colors uppercase"
                  >
                    {p.status === "archived" ? t("sup.catalog.restore") : t("sup.catalog.archive")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-deep/40">
          <div className="bg-surface-container-lowest border border-outline-variant w-full max-w-lg mx-4 relative">
            <div className="absolute top-0 right-0 w-5 h-5 border-l border-b border-outline-variant" />
            <div className="p-6 border-b border-outline-variant flex justify-between items-center">
              <h2 className="font-headline-md text-headline-md text-ink-deep">
                {editTarget ? t("sup.catalog.edit_product_title") : t("sup.catalog.add_product_title")}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
              {[
                ["name", "Product Name", "text"],
                ["genericName", "Generic Name", "text"],
                ["sku", "SKU", "text"],
                ["category", "Category", "text"],
                ["packSize", "Pack Size (e.g. 500mg × 100 tabs)", "text"],
                ["unitPrice", "Unit Price (TZS)", "number"],
                ["stockQty", "Stock Qty", "number"],
                ["minOrderQty", "Min Order Qty", "number"],
              ].map(([field, label, type]) => (
                <div key={field} className="flex flex-col gap-1">
                  <label className="font-mono text-label-md text-on-surface-variant uppercase">{label}</label>
                  <input
                    type={type}
                    value={(formData as Record<string, unknown>)[field] as string ?? ""}
                    onChange={(e) => setFormData((f) => ({ ...f, [field]: type === "number" ? Number(e.target.value) : e.target.value }))}
                    className="border border-outline-variant bg-surface px-3 py-2 text-body-sm font-body-md text-on-surface focus:outline-none focus:border-primary-container"
                  />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="font-mono text-label-md text-on-surface-variant uppercase">Status</label>
                <select
                  value={formData.status ?? "draft"}
                  onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value as CatalogProduct["status"] }))}
                  className="border border-outline-variant bg-surface px-3 py-2 text-body-sm font-body-md text-on-surface focus:outline-none focus:border-primary-container"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant flex gap-3 justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="font-mono text-label-md border border-outline-variant px-4 py-2 uppercase hover:bg-surface-container transition-colors"
              >
                {t("sup.catalog.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="font-mono text-label-md bg-ink-deep text-white px-6 py-2 uppercase hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? t("sup.catalog.saving") : editTarget ? t("sup.catalog.save_changes") : t("sup.catalog.add_product")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
