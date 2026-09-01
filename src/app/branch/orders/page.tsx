import { redirect } from "next/navigation";
import Link from "next/link";
import { requireBranchOperator, getBranchOrders } from "@/lib/actions/branch";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending payment",
  confirmed: "Processing",
  shipped: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-sky-100 text-sky-700",
  shipped: "bg-violet-100 text-violet-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-surface-container text-on-surface-variant",
};

export default async function BranchOrdersPage() {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) redirect("/auth?next=/branch");

  const orders = await getBranchOrders();

  return (
    <div className="p-8 max-w-container-max mx-auto w-full">
      <div className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-ink-deep mb-1">Orders</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Marketplace orders placed by this branch.
        </p>
      </div>

      <div className="space-y-3">
        {orders.length === 0 && (
          <div className="p-8 text-center bg-surface-base border border-outline-variant rounded text-on-surface-variant">
            No orders yet. Orders placed from the pharmacy dashboard for this branch will appear here.
          </div>
        )}
        {orders.map((order) => (
          <div key={order.id} className="bg-surface-base border border-outline-variant rounded p-5 custom-notch-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-label-md text-on-surface-variant">{order.order_reference}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[order.status] ?? "bg-surface-container text-on-surface-variant"}`}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <div className="font-headline-md font-bold text-ink-deep">
                TSh {order.total.toLocaleString()}
              </div>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-1">
              Supplier: {order.supplier_name ?? "—"} · Placed {order.placed_at ? new Date(order.placed_at).toLocaleString() : "—"}
            </p>
            <ul className="flex flex-wrap gap-2 mt-1">
              {order.items.map((item, i) => (
                <li key={i} className="px-2.5 py-1 bg-surface-container-low rounded text-xs">
                  {item.product_name} × {item.quantity} — TSh {(item.unit_price).toLocaleString()}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Link
                href="/dashboard/orders"
                className="font-label-md text-label-md text-primary hover:underline"
              >
                View in pharmacy dashboard →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}