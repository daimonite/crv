import type { Sale, SaleItem, Product, Batch } from "../types";

interface ReceiptProps {
  sale: Sale;
  items: SaleItem[];
  products: Product[];
  batches: Batch[];
  pharmacyName: string;
}

export default function Receipt({
  sale,
  items,
  products,
  batches,
  pharmacyName,
}: ReceiptProps) {
  function getProduct(batchId: string): Product | undefined {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) return undefined;
    return products.find((p) => p.id === batch.product_id);
  }

  return (
    <div className="bg-white p-4 rounded-lg text-black text-sm font-mono max-w-xs">
      <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
        <p className="font-bold text-base">{pharmacyName}</p>
        <p className="text-xs text-gray-500">Cervos Pharmacy OS</p>
      </div>

      <div className="border-b border-dashed border-gray-300 pb-2 mb-2">
        <p>Receipt: {sale.id.slice(0, 8).toUpperCase()}</p>
        <p>Date: {new Date(sale.created_at).toLocaleString()}</p>
        <p>Payment: {sale.payment_method?.toUpperCase()}</p>
      </div>

      <div className="space-y-1 border-b border-dashed border-gray-300 pb-2 mb-2">
        {items.map((item) => {
          const product = getProduct(item.batch_id);
          return (
            <div key={item.id} className="flex justify-between">
              <span>
                {product?.generic_name || "Unknown"} x{item.quantity}
              </span>
              <span>TZS {(item.unit_price * item.quantity).toLocaleString()}</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>TZS {(sale.total - sale.tax - sale.discount).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>TZS {sale.tax.toLocaleString()}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span>-TZS {sale.discount.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t border-gray-300 pt-1">
          <span>Total</span>
          <span>TZS {sale.total.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Tender</span>
          <span>TZS {sale.tender.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Change</span>
          <span>TZS {sale.change_due.toLocaleString()}</span>
        </div>
      </div>

      <div className="mt-4 text-center text-xs text-gray-500">
        <p>Thank you for your purchase!</p>
        <p>Powered by Cervos Pharmacy OS</p>
      </div>
    </div>
  );
}