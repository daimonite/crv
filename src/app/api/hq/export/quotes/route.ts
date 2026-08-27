/**
 * @route GET /api/hq/export/quotes
 * @access HQ session required
 * @description Returns all quote requests as CSV
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

  const { data: quotes, error } = await supabase
    .from("quote_requests")
    .select(`
      id, company_name, contact_name, email, phone, message,
      status, created_at, expected_branches, current_supplier, annual_volume
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cols = [
    { key: "id", header: "ID" },
    { key: "created_at", header: "Created" },
    { key: "company_name", header: "Company" },
    { key: "contact_name", header: "Contact" },
    { key: "email", header: "Email" },
    { key: "phone", header: "Phone" },
    { key: "status", header: "Status" },
    { key: "expected_branches", header: "Expected Branches" },
    { key: "current_supplier", header: "Current Supplier" },
    { key: "annual_volume", header: "Annual Volume" },
    { key: "message", header: "Message" },
  ];

  const csv = arrayToCSV((quotes ?? []) as Record<string, unknown>[], cols);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="quote-requests-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
