"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import type { Order } from "@/lib/actions/orders";

interface OrdersTableProps {
  orders: Order[];
}

type StatusFilter = "all" | "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  processing: "bg-purple-50 text-purple-700",
  shipped: "bg-cyan-50 text-cyan-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
};

export default function OrdersTable({ orders }: OrdersTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetail, setOrderDetail] = useState<unknown>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const filtered = orders.filter((o) => {
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const created = o.created_at?.split("T")[0] ?? "";
    const matchDateFrom = !dateFrom || created >= dateFrom;
    const matchDateTo = !dateTo || created <= dateTo;
    return matchStatus && matchDateFrom && matchDateTo;
  });

  const handleRowClick = async (order: Order) => {
    setSelectedOrder(order);
    setLoadingDetail(true);
    const res = await fetch(`/api/actions/orders?orderId=${order.id}`);
    const data = await res.json();
    setOrderDetail(data);
    setLoadingDetail(false);
  };

  const closeDetail = () => {
    setSelectedOrder(null);
    setOrderDetail(null);
  };

  const exportCsv = () => {
    const headers = ["Order Number", "Date", "Supplier", "Total", "Status"];
    const rows = filtered.map((o) => [
      o.id,
      o.created_at?.split("T")[0] ?? "",
      (o.suppliers as unknown as { company_name: string } | null)?.company_name ?? "—",
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
                <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant text-sm">
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
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant">
                    {(order.suppliers as unknown as { company_name: string } | null)?.company_name ?? "—"}
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
                {t("dash.orders.orderDetails")} #{selectedOrder.id.slice(0, 8).toUpperCase()}
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
                      {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-1">{t("dash.orders.status")}</p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-label-md ${STATUS_COLORS[selectedOrder.status] ?? ""}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-1">{t("dash.orders.supplier")}</p>
                    <p className="text-ink-deep">{(selectedOrder.suppliers as unknown as { company_name: string } | null)?.company_name ?? "—"}</p>
                  </div>
                </div>

                <div>
                  <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-3">{t("dash.orders.items")}</p>
                  {Array.isArray((orderDetail as { order_items?: unknown[] }).order_items) && (
                    <div className="divide-y divide-outline-variant/30">
                      {((orderDetail as { order_items: { quantity: number; unit_price: number; products: { generic_name: string } | null }[] }).order_items).map((item: { quantity: number; unit_price: number; products: { generic_name: string } | null }, i: number) => (
                        <div key={i} className="py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm text-ink-deep">{item.products?.generic_name ?? "—"}</p>
                            <p className="text-xs text-on-surface-variant">{item.quantity} × TSh {item.unit_price.toLocaleString()}</p>
                          </div>
                          <p className="text-sm font-medium text-ink-deep">
                            TSh {(item.quantity * item.unit_price).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-outline-variant pt-4 flex items-center justify-between">
                  <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider">{t("dash.orders.total")}</p>
                  <p className="font-headline-md text-headline-md text-primary">
                    TSh {typeof selectedOrder.total === "number" ? selectedOrder.total.toLocaleString() : "0"}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
