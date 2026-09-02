/**
 * @file components/MarketplaceBrowser.tsx
 * @description Searchable supplier product catalogue for pharmacy users.
 *
 * Allows pharmacy staff to browse available products from verified suppliers,
 * add items to a cart, and place orders directly to suppliers.
 */
"use client";

import { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n/context";

/** A product listing as returned by the supplier product catalogue. */
export interface SupplierProduct {
  id: string;
  supplierName: string;
  productName: string;
  genericName: string;
  category: string;
  packSize: string;
  unitPrice: number;
  currency: string;
  minOrderQty: number;
  stockAvailable: number;
  leadTimeDays: number;
  /** Whether the supplier is verified by Cervos HQ */
  verified: boolean;
  /** The supplying supplier's account ID */
  supplierId: string;
}

interface QuoteItem {
  product: SupplierProduct;
  qty: number;
}

interface MarketplaceBranch {
  id: string;
  name: string;
}

interface MarketplaceBrowserProps {
  /** Full list of available products from all suppliers. */
  products: SupplierProduct[];
  /** All of this pharmacy's branches — the user picks which one is ordering. */
  branches: MarketplaceBranch[];
}

const CATEGORIES: [string, string][] = [
  ["All", "mkt.cat.all"],
  ["Antibiotics", "mkt.cat.antibiotics"],
  ["Analgesics", "mkt.cat.analgesics"],
  ["Antifungals", "mkt.cat.antifungals"],
  ["Antiparasitics", "mkt.cat.antiparasitics"],
  ["Vitamins", "mkt.cat.vitamins"],
  ["Diagnostics", "mkt.cat.diagnostics"],
];

export default function MarketplaceBrowser({ products, branches }: MarketplaceBrowserProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [quote, setQuote] = useState<QuoteItem[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [qtyInputs, setQtyInputs] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [walletMsisdn, setWalletMsisdn] = useState("");
  const [paymentInfo, setPaymentInfo] = useState<string | null>(null);
  const [buyerBranchId, setBuyerBranchId] = useState(branches[0]?.id ?? "");

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.productName.toLowerCase().includes(search.toLowerCase()) ||
        p.genericName.toLowerCase().includes(search.toLowerCase()) ||
        p.supplierName.toLowerCase().includes(search.toLowerCase());
      const matchCat = category === "All" || p.category === category;
      return matchSearch && matchCat;
    });
  }, [products, search, category]);

  function addToQuote(product: SupplierProduct) {
    const qty = qtyInputs[product.id] ?? product.minOrderQty;
    setQuote((prev) => {
      const exists = prev.find((i) => i.product.id === product.id);
      if (exists) return prev.map((i) => i.product.id === product.id ? { ...i, qty } : i);
      return [...prev, { product, qty }];
    });
    setQuoteOpen(true);
  }

  function removeFromQuote(id: string) {
    setQuote((prev) => prev.filter((i) => i.product.id !== id));
  }

  function updateQuoteQty(id: string, qty: number) {
    setQuote((prev) => prev.map((i) => i.product.id === id ? { ...i, qty } : i));
  }

  const totalLines = quote.length;
  const totalValue = quote.reduce((sum, i) => sum + i.product.unitPrice * i.qty, 0);

  return (
    <div className="flex-1 p-8 flex flex-col gap-6 max-w-[1200px] mx-auto w-full relative">
      {/* Filters bar */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex items-center flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[18px]">search</span>
          <input
            type="text"
            placeholder={t("mkt.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-outline-variant bg-surface-container-lowest text-on-surface text-body-sm font-body-md focus:outline-none focus:border-primary-container w-full"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(([cat, key]) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`font-mono text-label-md px-3 py-1.5 border uppercase transition-colors ${
                category === cat
                  ? "bg-primary-container text-on-primary border-primary-container"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {t(key)}
            </button>
          ))}
        </div>
        {quote.length > 0 && (
          <button
            onClick={() => setQuoteOpen(true)}
            className="ml-auto flex items-center gap-2 bg-ink-deep text-white font-mono text-label-md px-4 py-2 hover:opacity-90 transition-opacity uppercase"
          >
            <span className="material-symbols-outlined text-[16px]">request_quote</span>
            {t("mkt.quote").replace("{n}", String(totalLines))}
          </button>
        )}
      </div>

      <div className="font-mono text-label-md text-on-surface-variant">{t("mkt.found").replace("{n}", String(filtered.length))}</div>

      {/* Product grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((p) => {
          const inQuote = quote.some((i) => i.product.id === p.id);
          return (
            <div key={p.id} className="bg-surface-container-lowest border border-outline-variant relative flex flex-col">
              <div className="absolute top-0 right-0 w-4 h-4 border-l border-b border-outline-variant bg-surface" />
              {/* Card header */}
              <div className="p-4 border-b border-outline-variant flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-body-sm text-ink-deep leading-tight">{p.productName}</div>
                    <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">{p.genericName}</div>
                  </div>
                  {p.verified && (
                    <span className="material-symbols-outlined text-[18px] text-primary-container shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                      verified
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="material-symbols-outlined text-[12px] text-on-surface-variant">business</span>
                  <span className="font-mono text-[10px] text-on-surface-variant uppercase">{p.supplierName}</span>
                </div>
              </div>

              {/* Card body */}
              <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="grid grid-cols-2 gap-2 text-body-sm">
                  <div>
                    <div className="font-mono text-[10px] text-on-surface-variant uppercase mb-0.5">{t("mkt.packsize")}</div>
                    <div className="text-on-surface">{p.packSize}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-on-surface-variant uppercase mb-0.5">{t("mkt.category")}</div>
                    <div className="text-on-surface">{p.category}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-on-surface-variant uppercase mb-0.5">{t("mkt.unitprice")}</div>
                    <div className="text-ink-deep font-semibold">{p.currency} {p.unitPrice.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-on-surface-variant uppercase mb-0.5">{t("mkt.minorder")}</div>
                    <div className="text-on-surface">{p.minOrderQty.toLocaleString()} {t("mkt.units")}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${p.stockAvailable > 0 ? "bg-tertiary-container" : "bg-error"}`} />
                  <span className="font-mono text-[10px] text-on-surface-variant uppercase">
                    {p.stockAvailable > 0 ? t("mkt.available").replace("{n}", p.stockAvailable.toLocaleString()) : t("mkt.outofstock")}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-on-surface-variant">
                    {t("mkt.lead").replace("{n}", String(p.leadTimeDays))}
                  </span>
                </div>

                <div className="flex gap-2 mt-auto pt-2 border-t border-outline-variant">
                  <input
                    type="number"
                    min={p.minOrderQty}
                    step={p.minOrderQty}
                    value={qtyInputs[p.id] ?? p.minOrderQty}
                    onChange={(e) => setQtyInputs((q) => ({ ...q, [p.id]: Number(e.target.value) }))}
                    className="flex-1 border border-outline-variant bg-surface px-2 py-1.5 text-body-sm font-body-md text-on-surface focus:outline-none focus:border-primary-container w-0"
                  />
                  <button
                    onClick={() => addToQuote(p)}
                    disabled={p.stockAvailable === 0}
                    className={`font-mono text-label-md px-3 py-1.5 uppercase border transition-colors ${
                      inQuote
                        ? "bg-primary-container text-on-primary border-primary-container"
                        : p.stockAvailable === 0
                        ? "bg-surface-container text-on-surface-variant border-outline-variant cursor-not-allowed"
                        : "bg-ink-deep text-white border-ink-deep hover:opacity-90"
                    }`}
                  >
                    {inQuote ? t("mkt.added") : t("mkt.addtoquote")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-3 py-16 text-center text-on-surface-variant font-body-md">
            {t("mkt.noresults")}
          </div>
        )}
      </div>

      {/* Quote drawer */}
      {quoteOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-ink-deep/40" onClick={() => setQuoteOpen(false)} />
          <div className="w-[420px] bg-surface-container-lowest border-l border-outline-variant flex flex-col h-full overflow-hidden">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center">
              <h2 className="font-headline-md text-headline-md text-ink-deep">{t("mkt.quote.title")}</h2>
              <button onClick={() => setQuoteOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {submitted ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <span className="material-symbols-outlined text-[64px] text-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
                <h3 className="font-headline-md text-headline-md text-ink-deep">{t("mkt.quote.submitted")}</h3>
                {orderRef && (
                  <p className="font-mono text-sm bg-surface-container px-3 py-2 rounded">
                    Order ref: <span className="font-bold">{orderRef}</span>
                  </p>
                )}
                {paymentInfo && (
                  <p className="text-sm p-2 bg-surface-container rounded">{paymentInfo}</p>
                )}
                <p className="text-body-md text-on-surface-variant">{t("mkt.quote.respond")}</p>
                <button
                  onClick={() => { setSubmitted(false); setQuote([]); setQuoteOpen(false); setOrderRef(null); setPaymentInfo(null); }}
                  className="mt-4 font-mono text-label-md border border-outline-variant px-4 py-2 uppercase hover:bg-surface-container transition-colors"
                >
                  {t("mkt.quote.new")}
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {quote.length === 0 && (
                    <div className="py-8 text-center text-on-surface-variant font-body-md">
                      {t("mkt.quote.empty")}
                    </div>
                  )}
                  {quote.map((item) => (
                    <div key={item.product.id} className="border border-outline-variant p-3 bg-surface relative">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <div className="font-semibold text-body-sm text-ink-deep">{item.product.productName}</div>
                          <div className="font-mono text-[10px] text-on-surface-variant">{item.product.supplierName}</div>
                        </div>
                        <button onClick={() => removeFromQuote(item.product.id)} className="text-on-surface-variant hover:text-error">
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center border border-outline-variant">
                          <button
                            onClick={() => updateQuoteQty(item.product.id, Math.max(item.product.minOrderQty, item.qty - item.product.minOrderQty))}
                            className="px-2 py-1 hover:bg-surface-container transition-colors font-mono text-label-md"
                          >−</button>
                          <span className="px-3 font-mono text-label-md text-on-surface">{item.qty}</span>
                          <button
                            onClick={() => updateQuoteQty(item.product.id, item.qty + item.product.minOrderQty)}
                            className="px-2 py-1 hover:bg-surface-container transition-colors font-mono text-label-md"
                          >+</button>
                        </div>
                        <span className="font-mono text-label-md text-on-surface ml-auto">
                          {item.product.currency} {(item.product.unitPrice * item.qty).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {quote.length > 0 && (
                  <div className="p-4 border-t border-outline-variant flex flex-col gap-3">
                    {submitError && (
                      <div className="text-error text-sm p-2 bg-error-container rounded">
                        <p>{submitError}</p>
                        {submitError.includes("Network Map") && (
                          <a
                            href="/dashboard/network"
                            className="inline-flex items-center gap-1 text-primary font-semibold text-xs mt-1.5 underline"
                          >
                            Go to Network Map →
                          </a>
                        )}
                      </div>
                    )}
                    {paymentInfo && (
                      <div className="text-sm p-2 bg-surface-container rounded">
                        {paymentInfo}
                      </div>
                    )}
                    <div className="flex justify-between font-mono text-label-md text-on-surface uppercase">
                      <span>{t("mkt.quote.total")}</span>
                      <span>TZS {totalValue.toLocaleString()}</span>
                    </div>
                    {branches.length > 1 && (
                      <div>
                        <label className="font-mono text-[10px] text-on-surface-variant uppercase">
                          {t("mkt.checkout.branch_label")}
                        </label>
                        <select
                          value={buyerBranchId}
                          onChange={(e) => setBuyerBranchId(e.target.value)}
                          className="mt-1 w-full px-3 py-2 border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary-container"
                        >
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="font-mono text-[10px] text-on-surface-variant uppercase">{t("mkt.checkout.wallet_label")}</label>
                      <input
                        value={walletMsisdn}
                        onChange={(e) => setWalletMsisdn(e.target.value)}
                        placeholder="+255..."
                        className="mt-1 w-full px-3 py-2 border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary-container"
                      />
                      <p className="text-[10px] text-on-surface-variant mt-1">{t("mkt.checkout.escrow_note")}</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (!buyerBranchId) {
                          setSubmitError("No branch configured. Please contact support.");
                          return;
                        }
                        setSubmitting(true);
                        setSubmitError(null);
                        setPaymentInfo(null);
                        // Group items by supplier — checkout is per-supplier (escrow)
                        const bySupplier = new Map<string, typeof quote>();
                        for (const item of quote) {
                          const sid = item.product.supplierId;
                          const list = bySupplier.get(sid) ?? [];
                          list.push(item);
                          bySupplier.set(sid, list);
                        }
                        let hasError = false;
                        let lastRef: string | null = null;
                        let lastPaymentMsg: string | null = null;
                        for (const [, items] of bySupplier) {
                          try {
                            const res = await fetch("/api/marketplace/checkout", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                buyerBranchId,
                                items: items.map(i => ({ catalogId: i.product.id, quantity: i.qty })),
                                msisdn: walletMsisdn.trim() || undefined,
                              }),
                            });
                            const json = await res.json() as { error?: string; orderId?: string; orderRef?: string; message?: string; payment?: { status: string; error?: string; message?: string } };
                            if (!res.ok) {
                              setSubmitError(json.error || `Checkout failed (${res.status})`);
                              hasError = true;
                              break;
                            }
                            if (json.orderRef || json.orderId) lastRef = json.orderRef || `ORD-${(json.orderId as string).slice(0,8).toUpperCase()}`;
                            if (json.payment) {
                              if (json.payment.status === "completed") lastPaymentMsg = "Payment completed.";
                              else if (json.payment.status === "pending") lastPaymentMsg = json.payment.message || "Payment initiated — check your phone for the mobile money prompt.";
                              else if (json.payment.error) lastPaymentMsg = `Payment failed: ${json.payment.error}`;
                            } else if (json.message) {
                              lastPaymentMsg = json.message;
                            }
                          } catch (e) {
                            setSubmitError(e instanceof Error ? e.message : "Checkout failed");
                            hasError = true;
                            break;
                          }
                        }
                        if (lastRef) setOrderRef(lastRef);
                        if (lastPaymentMsg) setPaymentInfo(lastPaymentMsg);
                        setSubmitting(false);
                        if (!hasError) setSubmitted(true);
                      }}
                      disabled={submitting}
                      className="w-full bg-ink-deep text-white font-mono text-label-md py-3 uppercase hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {submitting ? t("common.loading") : t("mkt.checkout.place_order")}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
