/**
 * @route GET /api/hq/export/payments
 * @access HQ session required
 * @description Returns all billing payments as CSV
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

  const { data: payments, error } = await supabase
    .from("billing_payments")
    .select(`
      id, account_id, amount_tzs, reference, note, status,
      created_at, accounts(name), hq_admins(name)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (payments ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    account_name: (p.accounts as { name?: string } | null)?.name ?? "—",
    recorded_by: (p.hq_admins as { name?: string } | null)?.name ?? "—",
    accounts: undefined,
    hq_admins: undefined,
  }));

  const cols = [
    { key: "id", header: "ID" },
    { key: "created_at", header: "Date" },
    { key: "account_name", header: "Account" },
    { key: "amount_tzs", header: "Amount (TZS)" },
    { key: "reference", header: "Reference" },
    { key: "status", header: "Status" },
    { key: "note", header: "Note" },
    { key: "recorded_by", header: "Recorded By" },
  ];

  const csv = arrayToCSV(rows as Record<string, unknown>[], cols);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payments-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
