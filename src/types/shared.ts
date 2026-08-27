/**
 * @file src/types/shared.ts
 * @description Canonical type declarations shared across all Cervos apps
 * (web, pharmacy desktop, supplier desktop).
 *
 * This file is the single source of truth for domain types that appear in
 * multiple apps. Desktop apps will migrate here in a future pass; until
 * then, their local type files remain untouched.
 *
 * Convention:
 *  - All database-facing types use `snake_case` fields (matching Supabase).
 *  - UI-only computed fields use `camelCase` (e.g. `catalogId`).
 *  - Nullable DB columns are typed as `T | null`.
 *  - Booleans stored as integers in SQLite are typed as `number` here;
 *    desktop apps cast locally.
 */

// ─── Product ─────────────────────────────────────────────────────────────────

/**
 * Stock status as a discrete label.
 *
 * Pharmacy desktop derives this from batch quantities at render time.
 * Supplier desktop stores it explicitly on the catalog listing.
 */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "discontinued";

/**
 * The shared product master.
 *
 * Canonical source: `products` table in Supabase.
 * Fields marked with [supplier-only] exist on the supplier desktop but not
 * the pharmacy desktop — they will be added to the web app in a future pass.
 *
 * @see cervos-desktop/src/types.ts — pharmacy desktop variant
 * @see cervos-supplier-desktop/src/lib/types.ts — supplier desktop variant
 */
export interface Product {
  /** Primary key (UUID). */
  id: string;
  /** Supplier account UUID that listed this product. Empty for shared masters. */
  supplier_id: string;
  /** Drug / chemical generic name, e.g. "Amoxicillin". */
  generic_name: string;
  /** Manufacturer brand name, e.g. "Amoxil". May be null. */
  brand_name: string;
  /** Human-readable display name (supplier-only). */
  name: string;
  /** Short product description (supplier-only). */
  description: string;
  /** Stock-keeping unit code (supplier-only). */
  sku: string;
  /** EAN/UPC barcode string. */
  barcode: string;
  /** Therapeutic category, e.g. "Antibiotics". */
  category: string;
  /** Pharmaceutical form: Tablet, Capsule, Syrup, etc. */
  formulation: string;
  /** Pharmacy subcategory (supplier-only). */
  subcategory: string;
  /** 1 if prescription required, 0 if OTC. Stored as number for SQLite compat. */
  requires_prescription: number;
  /** Unit sale price in TZS (supplier-only). */
  price: number;
  /** Default wholesale cost price for pharmacy POS. */
  default_cost_price: number;
  /** Default retail sale price for pharmacy POS. */
  default_sale_price: number;
  /** ISO 4217 currency code (supplier-only), defaults to "TZS". */
  currency: string;
  /** Minimum order quantity for marketplace orders (supplier-only). */
  min_order_quantity: number;
  /** Current stock quantity (supplier-only). */
  stock_quantity: number;
  /** Denormalised stock label (supplier-only). Derived by the supplier app. */
  stock_status: StockStatus;
  /** Quantity threshold below which a low-stock alert fires. */
  low_stock_threshold: number;
  /** Quantity threshold below which expiry notifications fire. */
  notify_threshold: number;
  /** Product image URLs (supplier-only). */
  images: string[];
  /** Key-value spec map, e.g. `{ "Pack Size": "30" }` (supplier-only). */
  specifications: Record<string, string>;
  /** Searchable tags (supplier-only). */
  tags: string[];
  /** Whether the listing is visible in the marketplace (supplier-only). */
  is_active: boolean;
  /** Default number of days until expiry for new batches (pharmacy desktop). */
  default_expiry: string | null;
  /** ISO 8601 timestamp of last mutation. */
  updated_at: string;
  /** ISO 8601 creation timestamp (supplier-only). */
  created_at: string;
}

// ─── Order & OrderItem ───────────────────────────────────────────────────────

/**
 * All valid statuses an order can be in, across both buyer and seller views.
 */
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

/**
 * Valid transitions between order statuses.
 * Enforced server-side by `updateOrderStatus` in supplier actions.
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/**
 * A single line item within an order.
 *
 * The web app's `orders.ts` server action returns this shape from
 * `order_items` joined with `products`.
 */
export interface OrderItem {
  /** Primary key (UUID). */
  id: string;
  /** FK → orders.id */
  order_id: string;
  /** FK → products.id */
  product_id: string;
  /** Human-readable product name snapshot at time of order. */
  product_name: string;
  /** Quantity ordered. */
  quantity: number;
  /** Price per unit at time of order. */
  unit_price: number;
  /** Derived line total (quantity × unit_price). Not stored in DB. */
  total: number;
  /** Joined product row — only present when Supabase select includes products. */
  products?: {
    generic_name: string;
    brand_name: string | null;
  } | null;
}

/**
 * A pharmacy→supplier order header.
 *
 * The web app's simplified shape (from `orders.ts`) omits supplier-desktop
 * fields like `shipping_address` and `tracking_number` which are planned
 * but not yet in the database.
 */
export interface Order {
  /** Primary key (UUID). */
  id: string;
  /** Human-readable order reference, e.g. "ORD-M3K5P2Q". */
  order_number: string;
  /** FK → accounts.id of the buyer pharmacy. */
  account_id: string;
  /** FK → accounts.id of the seller supplier. */
  supplier_id: string;
  /** Display name of the buyer pharmacy / branch. */
  buyer_name: string;
  /** Current fulfilment status. */
  status: OrderStatus;
  /** Line items — only populated on detail views. */
  items: OrderItem[];
  /** Order subtotal before tax/shipping. */
  subtotal: number;
  /** Shipping cost (supplier-desktop only, 0 until implemented). */
  shipping_cost: number;
  /** Tax amount. */
  tax: number;
  /** Grand total including tax and shipping. */
  total: number;
  /** ISO 4217 currency code, defaults to "TZS". */
  currency: string;
  /** Delivery address (supplier-desktop only). */
  shipping_address: string;
  /** Carrier tracking reference, set once shipped. */
  tracking_number: string | null;
  /** Free-text note from the buyer. */
  notes: string | null;
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 last-updated timestamp. */
  updated_at: string;
  /** Joined supplier row — only present when Supabase select includes suppliers. */
  suppliers?: { company_name: string } | null;
}

/**
 * Extended order with line items pre-loaded.
 * Returned by `getOrderDetail` in the web app.
 */
export interface OrderDetail extends Order {
  /** Fully-hydrated line items with product names. */
  order_items: (OrderItem & {
    products: { generic_name: string; brand_name: string | null } | null;
  })[];
}

// ─── Notification ────────────────────────────────────────────────────────────

/**
 * Notification type categories used across the platform.
 */
export type NotificationType = "order" | "quote" | "payment" | "stock" | "system";

/**
 * Notification severity / display variant.
 */
export type NotificationKind = "info" | "warning" | "urgent" | "promo";

/**
 * A single in-app notification.
 *
 * The web app (pharmacy portal) uses `kind` as a display hint.
 * The supplier desktop uses `type` as a domain category.
 * Both shapes are unified here with optional fields for each variant.
 */
export interface Notification {
  /** Primary key (UUID). */
  id: string;
  /** Target user/account UUID. */
  user_id: string;
  /** Domain category (supplier desktop). */
  type: NotificationType;
  /** Display severity hint (pharmacy web). */
  kind: NotificationKind;
  /** Notification heading. */
  title: string;
  /** Body text (web calls this `message`). */
  body: string;
  /** Whether the user has dismissed / read this notification. */
  is_read: boolean;
  /** Optional deep-link route within the app. */
  route: string | null;
  /** Optional action slug for the notification banner. */
  action: string | null;
  /** Whether this notification is admin-only (pharmacy desktop). */
  admin_only: number;
  /** FK → entity that triggered this notification, if any. */
  reference_id: string | null;
  /** ISO 8601 creation timestamp. */
  created_at: string;
}

// ─── Payment ─────────────────────────────────────────────────────────────────

/**
 * Per-account payment method configuration.
 *
 * One row per account in the `payment_settings` table.
 * Pharmacy accounts store POS-accepted methods + mobile money numbers.
 * Supplier accounts store receiving methods for invoices.
 */
export type AcceptedMethod = "cash" | "mobile_money" | "card" | "bank_transfer" | "invoice";

/**
 * Stored payment settings for an account.
 */
export interface PaymentSettings {
  /** Row primary key. Absent on new accounts before first save. */
  id?: string;
  /** FK → accounts.id */
  account_id: string;
  /** Primary method shown at POS checkout / used for marketplace. */
  default_method: AcceptedMethod;
  /** Which methods this account accepts (POS) or offers (supplier). */
  accepted_methods: AcceptedMethod[];
  /** M-Pesa wallet number (10-digit, e.g. 0712345678 or +255712345678). */
  mpesa_number: string | null;
  /** Tigo Pesa wallet number. */
  tigo_number: string | null;
  /** Halopesa wallet number. */
  halopesa_number: string | null;
  /** Airtel Money wallet number. */
  airtel_number: string | null;
  /** Bank name for bank-transfer payments. */
  bank_name: string | null;
  /** Bank account number. */
  bank_account: string | null;
  /** Bank branch name or code. */
  bank_branch: string | null;
  /**
   * Payme Africa wallet phone number.
   * Pharmacy: debited when placing a marketplace order.
   * Supplier: credited when an order is delivered and escrow disburses.
   */
  payme_wallet_number: string | null;
  /** ISO 8601 last-updated timestamp. */
  updated_at?: string;
}

/**
 * Input payload for initiating a Payme Africa collection.
 */
export interface CreatePaymentInput {
  /** Optional FK → orders.id to associate this payment with. */
  order_id?: string;
  /** Amount in Tanzanian Shillings (TZS). */
  amount_tzs: number;
  /** Payer MSISDN (mobile number). */
  msisdn: string;
  /** Human-readable payment reference shown to both parties. */
  reference: string;
  /** Client-generated UUID to prevent duplicate charges. */
  idempotency_key: string;
}

/**
 * A payment record returned by the Payme Africa integration.
 *
 * Maps to the `payments` table in Supabase.
 */
export interface PaymentRecord {
  /** Row primary key (UUID). */
  id: string;
  /** Unique reference string, e.g. "PAY-M3K5P2Q". */
  reference: string;
  /** Payment status: pending | processing | completed | failed. */
  status: string;
  /** Transaction ID returned by Payme Africa, if available. */
  provider_transaction_id: string | null;
  /** Amount in TZS. */
  amount_tzs: number;
}

// ─── Catalogue (Supplier-side) ───────────────────────────────────────────────

/**
 * Catalog listing shape used by the supplier desktop and web portal.
 *
 * This represents a supplier's listing for a product in their catalogue,
 * not the shared product master.
 */
export interface CatalogProduct {
  /** Primary key (UUID) — supplier_catalog row. */
  id: string;
  /** Display name (brand or generic). */
  name: string;
  /** Generic drug name. */
  genericName: string;
  /** Stock-keeping unit code. */
  sku: string;
  /** Therapeutic category. */
  category: string;
  /** Pack size description, e.g. "30 tablets". */
  packSize: string;
  /** Unit price in the listing's currency. */
  unitPrice: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** Current stock quantity. */
  stockQty: number;
  /** Minimum order quantity for this listing. */
  minOrderQty: number;
  /** Listing lifecycle state. */
  status: "active" | "archived" | "draft";
}

/**
 * Marketplace product as seen by pharmacy buyers.
 * Includes supplier identity and lead time.
 */
export interface MarketplaceProduct {
  /** supplier_catalog row ID. */
  id: string;
  /** FK → accounts.id of the supplier. */
  supplierId: string;
  /** Supplier display name. */
  supplierName: string;
  /** Product display name. */
  productName: string;
  /** Generic drug name. */
  genericName: string;
  /** Therapeutic category. */
  category: string;
  /** Pack size description. */
  packSize: string;
  /** Unit price. */
  unitPrice: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** Minimum order quantity. */
  minOrderQty: number;
  /** Units available to ship. */
  stockAvailable: number;
  /** Estimated days from order to delivery. */
  leadTimeDays: number;
  /** Whether the supplier has been verified by Cervos HQ. */
  verified: boolean;
}

// ─── Alert ───────────────────────────────────────────────────────────────────

/**
 * Alert severity levels.
 */
export type AlertSeverity = "critical" | "warning" | "info";

/**
 * Alert categories for filtering / grouping.
 */
export type AlertCategory = "expiry" | "stock" | "sync" | "subscription" | "branch";

/**
 * A pharmacy dashboard alert.
 *
 * Generated client-side from batch / branch / subscription data.
 */
export interface PharmacyAlert {
  /** Stable unique ID, e.g. "pharm-expired". */
  id: string;
  /** How urgently the user should act. */
  severity: AlertSeverity;
  /** What domain this alert concerns. */
  category: AlertCategory;
  /** Short heading, e.g. "3 batches expiring within 7 days". */
  title: string;
  /** Longer description with actionable detail. */
  description: string;
  /** Number of affected items (batches, branches, etc.). */
  count: number;
  /** Branch UUID if the alert is branch-specific. */
  branchId?: string;
  /** Branch display name if applicable. */
  branchName?: string;
  /** Deep-link route to the relevant dashboard page. */
  route: string;
  /** ISO 8601 timestamp when the alert was generated. */
  createdAt: string;
}

// ─── Subscription ────────────────────────────────────────────────────────────

/**
 * Account subscription status.
 */
export type SubscriptionStatus = "active" | "inactive" | "trial" | "past_due" | "locked" | "grace";

/**
 * Subscription tier / plan level.
 */
export type SubscriptionTier = "free" | "starter" | "professional" | "enterprise";

// ─── Utility helpers ─────────────────────────────────────────────────────────

/** Default currency code used across the platform. */
export const DEFAULT_CURRENCY = "TZS";

/**
 * Formats a numeric amount as a display-ready currency string.
 *
 * @example
 * formatCurrency(1250000)       // "TZS 1,250,000"
 * formatCurrency(42.5, "USD")   // "$42.50"
 *
 * @param amount  - The numeric value to format
 * @param currency - ISO 4217 code (defaults to "TZS")
 * @param locale   - BCP 47 locale string (defaults to "en-TZ")
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  locale: string = "en-TZ",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === DEFAULT_CURRENCY ? 0 : 2,
    maximumFractionDigits: currency === DEFAULT_CURRENCY ? 0 : 2,
  }).format(amount);
}

/**
 * derives a StockStatus label from a numeric quantity and thresholds.
 *
 * @param quantity       - Current stock on hand
 * @param lowThreshold   - Below this → low_stock
 * @param notifyThreshold - Below this (and above lowThreshold) → trigger notification
 * @returns The computed stock status
 */
export function deriveStockStatus(
  quantity: number,
  lowThreshold: number = 10,
  _notifyThreshold: number = 5,
): StockStatus {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= lowThreshold) return "low_stock";
  return "in_stock";
}

// ─── Reference constants ─────────────────────────────────────────────────────

/** Canonical pharmacy product categories. */
export const PHARMACY_CATEGORIES = [
  "Analgesics",
  "Antibiotics",
  "Antivirals",
  "Antifungals",
  "Antihistamines",
  "Cardiovascular",
  "Diabetes Care",
  "Digestive Health",
  "Eye Care",
  "Mental Health",
  "Respiratory",
  "Skin Care",
  "Vitamins & Supplements",
  "Other",
] as const;

/** Canonical pharmaceutical formulation types. */
export const FORMULATIONS = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Cream",
  "Ointment",
  "Drops",
  "Inhaler",
  "Suppository",
  "Powder",
  "Solution",
  "Suspension",
  "Gel",
  "Patch",
  "Other",
] as const;
