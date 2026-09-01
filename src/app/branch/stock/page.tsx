import { redirect } from "next/navigation";
import StockClient from "./StockClient";
import { requireBranchOperator, getBranchInventory, getBranchProducts } from "@/lib/actions/branch";

export default async function BranchStockPage() {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) redirect("/auth?next=/branch");

  const [stock, products] = await Promise.all([getBranchInventory(), getBranchProducts()]);

  const rows = stock.map((b) => ({
    id: b.id,
    product_name: [b.product_generic, b.product_brand].filter(Boolean).join(" — ") || "Product",
    quantity: b.quantity,
    sale_price: b.sale_price,
    cost_price: b.cost_price,
    expiry_date: b.expiry_date,
  }));

  return <StockClient stock={rows} products={products} />;
}