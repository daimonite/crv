/**
 * @file components/SupplierOrdersTable.tsx
 * @description Inbound purchase orders table for supplier accounts.
 *
 * Displays orders from pharmacies with expandable line-item details.
 * Status transitions (pending → approved → confirmed → shipped → delivered)
 * hit the live `orders` table via the `updateOrderStatus` server action.
 * "confirmed" is reached only once the pharmacy's payment completes — the
 * supplier's own action stops at "approved".
 *
 * Order totals are always derived from line items at render time to
 * guarantee consistency — never rely on a pre-stored `total_value` field.
 */
"use client";

import { useState, useMemo, Fragment } from "react";
import { updateOrderStatus, approveOrderForPayment } from "@/lib/actions/supplier";

/** A single inbound purchase order from a pharmacy branch. */
export interface SupplierOrder {
  id: string;
  /** Human-readable order reference (e.g. "ORD-2026-0841") */
  orderRef: string;
  pharmacyName: string;
  branchName: string;
  /** Line items — always use these to compute the order total. */
  products: { name: string; qty: number; unitPrice: number }[];
  /** Currency code, e.g. "TZS" */
  currency: string;
  /** ISO date string of when the order was placed. */
  placedAt: string;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  /** Set once this supplier has approved the order — unlocks payment for the pharmacy. Doesn't change `status`. */
  supplierApprovedAt: string | null;
}

/** Always derive the order total from its line items to guarantee consistency. */
function orderTotal(order: SupplierOrder): number {
  return order.products.reduce((sum, p) => sum + p.qty * p.unitPrice, 0);
}

interface SupplierOrdersTableProps {
  orders: SupplierOrder[];
}

type StatusFilter = "all" | SupplierOrder["status"];

function StatusBadge({ status }: { status: SupplierOrder["status"] }) {
  const styles: Record<SupplierOrder["status"], string> = {
    pending: "border-[#b45309] text-[#b45309] bg-[#fef3c7]",
    confirmed: "border-primary-container text-primary-container bg-surface-container",
    shipped: "border-[#0891b2] text-[#0891b2] bg-[#ecfeff]",
    delivered: "border-tertiary-container text-tertiary bg-[#dcfce7]",
    cancelled: "border-error text-error bg-error-container",
  };
  const dots: Record<SupplierOrder["status"], string> = {
    pending: "bg-[#b45309]",
    confirmed: "bg-primary-container",
    shipped: "bg-[#0891b2]",
    delivered: "bg-tertiary-container",
    cancelled: "bg-error",
  };
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-label-md px-2 py-0.5 border uppercase ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full block ${dots[status]}`} />
      {status}
    </span>
  );
}

export default function SupplierOrdersTable({ orders }: SupplierOrdersTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [localOrders, setLocalOrders] = useState<SupplierOrder[]>(orders);

  const filtered = useMemo(() => {
    return localOrders.filter((o) => {
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      const matchSearch =
        o.orderRef.toLowerCase().includes(search.toLowerCase()) ||
        o.pharmacyName.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [localOrders, statusFilter, search]);

  function updateStatus(id: string, newStatus: SupplierOrder["status"]) {
    const prev = localOrders.find((o) => o.id === id);
    setLocalOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: newStatus } : o));
    void updateOrderStatus(id, newStatus).then((result) => {
      if (result.error && prev) {
        setLocalOrders((prevOrders) =>
          prevOrders.map((o) => (o.id === id ? { ...o, status: prev.status } : o))
        );
      }
    });
  }

  const [approving, setApproving] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  function approveOrder(id: string) {
    setApproveError(null);
    setApproving(id);
    void approveOrderForPayment(id).then((result) => {
      setApproving(null);
      if (result.error) {
        setApproveError(result.error);
        return;
      }
      setLocalOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, supplierApprovedAt: new Date().toISOString() } : o))
      );
    });
  }

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 };
    localOrders.forEach((o) => { c[o.status]++; });
    return c;
  }, [localOrders]);

  const totalRevenue = localOrders
    .filter((o) => o.status === "delivered")
    .reduce((s, o) => s + orderTotal(o), 0);

  const STATUSES: SupplierOrder["status"][] = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

  return (
    <div className="flex-1 p-8 flex flex-col gap-6 max-w-[1200px] mx-auto w-full">
      {approveError && (
        <div className="p-3 bg-error-container border border-error text-error text-sm">{approveError}</div>
      )}
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bg-surface-container-lowest border border-outline-variant p-4 relative">
          <div className="absolute top-0 right-0 w-4 h-4 border-l border-b border-outline-variant" />
          <p className="font-mono text-label-md text-on-surface-variant uppercase mb-1">Total Orders</p>
          <p className="text-headline-md font-headline-md text-ink-deep">{localOrders.length}</p>
        </div>
        <div className="bg-[#fef3c7] border border-[#b45309] p-4 relative">
          <div className="absolute top-0 right-0 w-4 h-4 border-l border-b border-[#b45309]" />
          <p className="font-mono text-label-md text-[#92400e] uppercase mb-1">Pending</p>
          <p className="text-headline-md font-headline-md text-[#b45309]">{statusCounts.pending}</p>
        </div>
        <div className="bg-surface-container border border-primary-container p-4 relative">
          <div className="absolute top-0 right-0 w-4 h-4 border-l border-b border-primary-container" />
          <p className="font-mono text-label-md text-on-surface-variant uppercase mb-1">In Transit</p>
          <p className="text-headline-md font-headline-md text-primary-container">{statusCounts.shipped}</p>
        </div>
        <div className="bg-[#dcfce7] border border-tertiary-container p-4 relative">
          <div className="absolute top-0 right-0 w-4 h-4 border-l border-b border-tertiary-container" />
          <p className="font-mono text-label-md text-tertiary uppercase mb-1">Revenue Delivered</p>
          <p className="text-headline-md font-headline-md text-tertiary">TZS {totalRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex items-center flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[18px]">search</span>
          <input
            type="text"
            placeholder="Search order ref or pharmacy..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-outline-variant bg-surface-container-lowest text-on-surface text-body-sm font-body-md focus:outline-none focus:border-primary-container w-full"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={`font-mono text-label-md px-3 py-1.5 border uppercase transition-colors ${
              statusFilter === "all"
                ? "bg-ink-deep text-white border-ink-deep"
                : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            All ({localOrders.length})
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`font-mono text-label-md px-3 py-1.5 border uppercase transition-colors ${
                statusFilter === s
                  ? "bg-ink-deep text-white border-ink-deep"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {s} ({statusCounts[s]})
            </button>
          ))}
        </div>
      </div>

      {/* Orders table */}
      <div className="bg-surface-container-lowest border border-outline-variant overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container border-b border-outline-variant">
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">Order Ref</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">Pharmacy</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">Products</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">Value</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">Placed</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase">Status</th>
              <th className="px-4 py-3 font-mono text-label-md text-on-surface-variant uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant font-body-md">
                  No orders match your filters.
                </td>
              </tr>
            )}
            {filtered.map((order) => (
              <Fragment key={order.id}>
                <tr
                  className="border-b border-outline-variant hover:bg-surface-container-low transition-colors cursor-pointer"
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  <td className="px-4 py-3 font-mono text-label-md text-ink-deep">{order.orderRef}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-body-sm text-ink-deep">{order.pharmacyName}</div>
                    <div className="font-mono text-[10px] text-on-surface-variant">{order.branchName}</div>
                  </td>
                  <td className="px-4 py-3 text-body-sm text-on-surface">{order.products.length} line{order.products.length !== 1 ? "s" : ""}</td>
                  <td className="px-4 py-3 font-mono text-label-md text-on-surface tabular-nums">
                    {order.currency} {orderTotal(order).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-label-md text-on-surface">
                    {new Date(order.placedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {order.status === "pending" && !order.supplierApprovedAt && (
                        <button
                          onClick={() => approveOrder(order.id)}
                          disabled={approving === order.id}
                          className="font-mono text-label-md text-primary-container border border-primary-container px-2 py-1 hover:bg-surface-container-high transition-colors uppercase disabled:opacity-60"
                        >
                          {approving === order.id ? "Approving…" : "Approve"}
                        </button>
                      )}
                      {order.status === "pending" && order.supplierApprovedAt && (
                        <span className="font-mono text-label-md text-on-surface-variant px-2 py-1 uppercase">
                          Awaiting payment
                        </span>
                      )}
                      {order.status === "pending" && (
                        <button
                          onClick={() => updateStatus(order.id, "cancelled")}
                          className="font-mono text-label-md text-error border border-error px-2 py-1 hover:bg-error-container transition-colors uppercase"
                        >
                          Reject
                        </button>
                      )}
                      {order.status === "confirmed" && (
                        <button
                          onClick={() => updateStatus(order.id, "shipped")}
                          className="font-mono text-label-md text-[#0891b2] border border-[#0891b2] px-2 py-1 hover:bg-[#ecfeff] transition-colors uppercase"
                        >
                          Ship
                        </button>
                      )}
                      {order.status === "shipped" && (
                        <button
                          onClick={() => updateStatus(order.id, "delivered")}
                          className="font-mono text-label-md text-tertiary border border-tertiary-container px-2 py-1 hover:bg-[#dcfce7] transition-colors uppercase"
                        >
                          Delivered
                        </button>
                      )}
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                        {expanded === order.id ? "expand_less" : "expand_more"}
                      </span>
                    </div>
                  </td>
                </tr>
                {expanded === order.id && (
                  <tr key={`${order.id}-expanded`} className="border-b border-outline-variant bg-surface-container-low">
                    <td colSpan={7} className="px-8 py-4">
                      <div className="font-mono text-label-md text-on-surface-variant uppercase mb-2">Order Lines</div>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr>
                            <th className="pb-2 font-mono text-[10px] text-on-surface-variant uppercase pr-8">Product</th>
                            <th className="pb-2 font-mono text-[10px] text-on-surface-variant uppercase pr-8">Qty</th>
                            <th className="pb-2 font-mono text-[10px] text-on-surface-variant uppercase pr-8">Unit Price</th>
                            <th className="pb-2 font-mono text-[10px] text-on-surface-variant uppercase">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.products.map((line, i) => (
                            <tr key={i} className="border-t border-outline-variant">
                              <td className="py-2 pr-8 text-body-sm text-ink-deep">{line.name}</td>
                              <td className="py-2 pr-8 font-mono text-label-md text-on-surface tabular-nums">{line.qty.toLocaleString()}</td>
                              <td className="py-2 pr-8 font-mono text-label-md text-on-surface tabular-nums">
                                {order.currency} {line.unitPrice.toLocaleString()}
                              </td>
                              <td className="py-2 font-mono text-label-md text-on-surface tabular-nums">
                                {order.currency} {(line.qty * line.unitPrice).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
