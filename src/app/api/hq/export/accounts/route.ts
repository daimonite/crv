/**
 * @route GET /api/hq/export/accounts
 * @access HQ session required
 * @description Returns all accounts as CSV for HQ export
 */
import { NextRequest, NextResponse } from "next/server";
import { isValidHQToken, HQ_COOKIE_NAME } from "@/lib/hq-auth";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { arrayToCSV } from "@/lib/export";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(HQ_COOKIE_NAME)?.value;
  if (!isValidHQToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select(`
      id, name, type, subscription_status, billing_status,
      created_at, suspended_at, subscription_plan,
      download_enabled,
      branches(count)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cols = [
    { key: "id", header: "ID" },
    { key: "name", header: "Account Name" },
    { key: "type", header: "Type" },
    { key: "subscription_status", header: "Subscription Status" },
    { key: "billing_status", header: "Billing Status" },
    { key: "download_enabled", header: "Downloads Enabled" },
    { key: "created_at", header: "Created" },
    { key: "suspended_at", header: "Suspended At" },
  ];

  const csv = arrayToCSV((accounts ?? []) as Record<string, unknown>[], cols);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="accounts-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
