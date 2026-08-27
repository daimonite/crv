/**
 * @route GET /api/hq/export/tickets
 * @access HQ session required
 * @description Returns all support tickets as CSV
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

  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select(`
      id, subject, message, category, status, source,
      contact_email, internal_note, created_at, updated_at,
      accounts(name)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (tickets ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    account_name: (t.accounts as { name?: string } | null)?.name ?? "—",
    accounts: undefined,
  }));

  const cols = [
    { key: "id", header: "ID" },
    { key: "created_at", header: "Created" },
    { key: "subject", header: "Subject" },
    { key: "category", header: "Category" },
    { key: "status", header: "Status" },
    { key: "source", header: "Source" },
    { key: "contact_email", header: "Contact Email" },
    { key: "account_name", header: "Account" },
    { key: "message", header: "Message" },
    { key: "internal_note", header: "Internal Note" },
    { key: "updated_at", header: "Last Updated" },
  ];

  const csv = arrayToCSV(rows as Record<string, unknown>[], cols);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="support-tickets-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
