/**
 * @route GET /api/hq/export/branches
 * @access HQ session required
 * @description Returns all branches with coordinates as CSV
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

  const { data: branches, error } = await supabase
    .from("branches")
    .select(`
      id, name, subscription_status, trial_ends_at, grace_ends_at,
      last_synced_at, lat, lng, created_at, accounts(name)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (branches ?? []).map((b: Record<string, unknown>) => ({
    ...b,
    account_name: (b.accounts as { name?: string } | null)?.name ?? "—",
    accounts: undefined,
  }));

  const cols = [
    { key: "id", header: "ID" },
    { key: "name", header: "Branch Name" },
    { key: "account_name", header: "Account" },
    { key: "subscription_status", header: "Status" },
    { key: "lat", header: "Latitude" },
    { key: "lng", header: "Longitude" },
    { key: "last_synced_at", header: "Last Synced" },
    { key: "trial_ends_at", header: "Trial Ends" },
    { key: "grace_ends_at", header: "Grace Ends" },
    { key: "created_at", header: "Created" },
  ];

  const csv = arrayToCSV(rows as Record<string, unknown>[], cols);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="branches-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
