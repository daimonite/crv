"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import type { Order } from "@/lib/actions/orders";

interface OrdersTableProps {
  orders: Order[];
}

type StatusFilter = "all" | "pending" | "approved" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-purple-50 text-purple-700",
  confirmed: "bg-blue-50 text-blue-700",
  processing: "bg-purple-50 text-purple-700",
  shipped: "bg-cyan-50 text-cyan-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
};

interface OrderLineItem {
  id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  stock_available: number | null;
}

interface OrderHistoryEntry {
  key: string;
  label: string;
  at: string | null;
}

interface OrderReceipt {
  payment: { reference: string; status: string; transactionId: string | null; amountTzs: number; completedAt: string | null } | null;
  disbursement: { reference: string; status: string; completedAt: string | null } | null;
}

export default function OrdersTable({ orders }: OrdersTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetail, setOrderDetail] = useState<{ order_items: OrderLineItem[]; history?: OrderHistoryEntry[]; receipt?: OrderReceipt } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [payWallet, setPayWallet] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payMessage, setPayMessage] = useState<string | null>(null);

  const filtered = orders.filter((o) => {
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const created = o.placed_at?.split("T")[0] ?? "";
    const matchDateFrom = !dateFrom || created >= dateFrom;
    const matchDateTo = !dateTo || created <= dateTo;
    return matchStatus && matchDateFrom && matchDateTo;
  });

  const handleRowClick = async (order: Order) => {
    setSelectedOrder(order);
    setLoadingDetail(true);
    setPayMessage(null);
    setPayError(null);
    setPayWallet("");
    try {
      const res = await fetch(`/api/actions/orders?orderId=${order.id}`);
      const data = await res.json();
      setOrderDetail(data);
    } catch {
      setOrderDetail(null);
    }
    setLoadingDetail(false);
  };

  const closeDetail = () => {
    setSelectedOrder(null);
    setOrderDetail(null);
  };

  const payOrder = async () => {
    if (!selectedOrder) return;
    const msisdn = payWallet.trim();
    if (!/^(0[67]\d{8}|\+255[67]\d{8})$/.test(msisdn)) {
      setPayError("Enter a valid mobile-money number, e.g. 0712 345 678 or +255712345678.");
      return;
    }
    setPayBusy(true);
    setPayError(null);
    setPayMessage(null);
    try {
      const res = await fetch("/api/marketplace/pay-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedOrder.id, msisdn }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error ?? "Payment could not be started.");
      } else {
        setPayMessage(data.payment?.message ?? "Payment initiated.");
        if (data.payment?.status === "completed") {
          setTimeout(() => router.refresh(), 800);
        }
      }
    } catch {
      setPayError("Network error — try again.");
    }
    setPayBusy(false);
  };

  const exportCsv = () => {
    const headers = ["Order Number", "Date", "Branch", "Supplier", "Total", "Status"];
    const rows = filtered.map((o) => [
      o.order_reference ?? o.id,
      o.placed_at?.split("T")[0] ?? "",
      o.branch_name ?? "—",
      o.supplier_name ?? "—",
      o.total?.toFixed(2) ?? "0.00",
      o.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-4 py-2.5 bg-surface-base border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">{t("dash.orders.allStatuses")}</option>
            <option value="pending">{t("dash.orders.status.pending")}</option>
            <option value="approved">Approved</option>
            <option value="confirmed">{t("dash.orders.status.confirmed")}</option>
            <option value="processing">{t("dash.orders.status.processing")}</option>
            <option value="shipped">{t("dash.orders.status.shipped")}</option>
            <option value="delivered">{t("dash.orders.status.delivered")}</option>
            <option value="cancelled">{t("dash.orders.status.cancelled")}</option>
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant font-label-md">{t("dash.orders.from")}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 bg-surface-base border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
            />
            <span className="text-xs text-on-surface-variant font-label-md">{t("dash.orders.to")}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 bg-surface-base border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-2.5 bg-surface-base border border-outline-variant text-on-surface-variant rounded hover:bg-surface-container transition-colors text-sm font-label-md"
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          {t("dash.orders.export")}
        </button>
      </div>

      <div className="bg-surface-base border border-outline-variant rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-container-low">
            <tr>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.orders.orderNumber")}
              </th>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.orders.date")}
              </th>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                Branch
              </th>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.orders.supplier")}
              </th>
              <th className="text-right px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.orders.total")}
              </th>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.orders.status")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant text-sm">
                  {t("dash.orders.noOrders")}
                </td>
              </tr>
            ) : (
              filtered.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => handleRowClick(order)}
                  className="hover:bg-surface-container-low/30 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-primary">
                      {order.order_reference ?? `#${order.id.slice(0, 8).toUpperCase()}`}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant">
                    {order.placed_at ? new Date(order.placed_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant">
                    {order.branch_name ?? "—"}
                  </td>
                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant">
                    {order.supplier_name ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-right font-body-md text-body-md">
                    {typeof order.total === "number" ? `TSh ${order.total.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-label-md ${STATUS_COLORS[order.status] ?? ""}`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50" onClick={closeDetail}>
          <div className="bg-surface-base rounded-lg border border-outline-variant w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-headline-md text-headline-md text-ink-deep">
                {t("dash.orders.orderDetails")} {selectedOrder.order_reference ?? selectedOrder.id.slice(0, 8).toUpperCase()}
              </h2>
              <button onClick={closeDetail} className="p-1 hover:bg-surface-container rounded">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
              </button>
            </div>

            {loadingDetail ? (
              <div className="text-center py-8 text-on-surface-variant">{t("common.loading")}</div>
            ) : orderDetail ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-1">{t("dash.orders.date")}</p>
                    <p className="text-ink-deep">
                      {selectedOrder.placed_at ? new Date(selectedOrder.placed_at).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-1">{t("dash.orders.status")}</p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-label-md ${STATUS_COLORS[selectedOrder.status] ?? ""}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                  <div>
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-1">Branch</p>
                    <p className="text-ink-deep">{selectedOrder.branch_name ?? "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-1">{t("dash.orders.supplier")}</p>
                    <p className="text-ink-deep">{selectedOrder.supplier_name ?? "—"}</p>
                  </div>
                </div>

                <div>
                  <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-3">{t("dash.orders.items")}</p>
                  {Array.isArray(orderDetail.order_items) && orderDetail.order_items.length > 0 ? (
                    <div className="divide-y divide-outline-variant/30">
                      {orderDetail.order_items.map((item, i) => (
                        <div key={item.id || i} className="py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm text-ink-deep">{item.product_name ?? "—"}</p>
                            <p className="text-xs text-on-surface-variant">
                              {item.quantity} × TSh {item.unit_price.toLocaleString()}
                              {typeof item.stock_available === "number" && (
                                <span className="ml-2 text-on-surface-variant/70">· {item.stock_available.toLocaleString()} in stock at supplier</span>
                              )}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-ink-deep">
                            TSh {(item.quantity * item.unit_price).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant">No items.</p>
                  )}
                </div>

                <div className="border-t border-outline-variant pt-4 flex items-center justify-between">
                  <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider">{t("dash.orders.total")}</p>
                  <p className="font-headline-md text-headline-md text-primary">
                    TSh {typeof selectedOrder.total === "number" ? selectedOrder.total.toLocaleString() : "0"}
                  </p>
                </div>

                {Array.isArray(orderDetail.history) && orderDetail.history.length > 0 && (
                  <div className="border-t border-outline-variant pt-4">
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-2">Order history</p>
                    <div className="flex flex-col gap-1.5">
                      {orderDetail.history.map((h) => (
                        <div key={h.key} className="flex items-center justify-between text-xs">
                          <span className={h.at ? "text-ink-deep" : "text-on-surface-variant/50"}>{h.label}</span>
                          <span className={h.at ? "text-on-surface-variant" : "text-on-surface-variant/50"}>
                            {h.at ? new Date(h.at).toLocaleString() : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedOrder.status === "pending" && selectedOrder.supplier_approved_at && (
                  <div className="border-t border-outline-variant pt-4">
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-2">
                      Pay order via mobile money
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={payWallet}
                        onChange={(e) => setPayWallet(e.target.value)}
                        placeholder="0712 345 678 or +255712345678"
                        className="flex-1 px-3 py-2 bg-surface-base border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={payOrder}
                        disabled={payBusy}
                        className="px-4 py-2 bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60 flex items-center gap-1"
                      >
                        {payBusy ? (
                          <div className="w-4 h-4 border border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined text-[16px]">smartphone</span>
                        )}
                        Pay
                      </button>
                    </div>
                    {payError && <p className="mt-2 text-xs text-error">{payError}</p>}
                    {payMessage && <p className="mt-2 text-xs text-success">{payMessage}</p>}
                  </div>
                )}
                {selectedOrder.status === "pending" && !selectedOrder.supplier_approved_at && (
                  <div className="border-t border-outline-variant pt-4">
                    <p className="text-sm text-on-surface-variant flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">hourglass_top</span>
                      Waiting on the supplier to approve this order before you can pay.
                    </p>
                  </div>
                )}

                {orderDetail.receipt?.payment && (
                  <div className="border-t border-outline-variant pt-4">
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-2">Receipt</p>
                    <div className="flex flex-col gap-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-on-surface-variant">Payment reference</span>
                        <span className="text-ink-deep font-mono">{orderDetail.receipt.payment.reference}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-on-surface-variant">Status</span>
                        <span className="text-ink-deep capitalize">{orderDetail.receipt.payment.status}</span>
                      </div>
                      {orderDetail.receipt.payment.transactionId && (
                        <div className="flex items-center justify-between">
                          <span className="text-on-surface-variant">Transaction ID</span>
                          <span className="text-ink-deep font-mono">{orderDetail.receipt.payment.transactionId}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-on-surface-variant">Amount</span>
                        <span className="text-ink-deep">TSh {orderDetail.receipt.payment.amountTzs.toLocaleString()}</span>
                      </div>
                      {orderDetail.receipt.payment.completedAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-on-surface-variant">Paid at</span>
                          <span className="text-ink-deep">{new Date(orderDetail.receipt.payment.completedAt).toLocaleString()}</span>
                        </div>
                      )}
                      {orderDetail.receipt.disbursement && (
                        <div className="flex items-center justify-between pt-1 border-t border-outline-variant/30 mt-1">
                          <span className="text-on-surface-variant">Supplier payout</span>
                          <span className="text-ink-deep capitalize">{orderDetail.receipt.disbursement.status}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}