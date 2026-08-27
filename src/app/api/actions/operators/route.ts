import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  createOperator,
  updateOperator,
  deleteOperator,
  resetOperatorPin,
} from "@/lib/actions/operators";

export async function POST(req: NextRequest) {
  const rl = checkRateLimit("operators", 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("auth_user_id", user.id)
    .single();

  if (!account || account.type !== "pharmacy") {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { data: accountBranches } = await supabase
    .from("branches")
    .select("id")
    .eq("account_id", account.id);

  const branchIds = (accountBranches ?? []).map((b) => b.id);

  let isCallerAdmin = true;
  if (branchIds.length > 0) {
    const { data: callerOps } = await supabase
      .from("operators")
      .select("role")
      .in("branch_id", branchIds);

    isCallerAdmin = (callerOps ?? []).some((op) => op.role === "admin");
  }

  const body = await req.json();
  const { action } = body;

  const mutatingActions = ["create", "update", "delete", "resetPin"];
  if (mutatingActions.includes(action) && !isCallerAdmin) {
    return NextResponse.json({ error: "Only admins can manage operators." }, { status: 403 });
  }

  if (action === "create") {
    const { name, pin, role, branch_id } = body;
    const result = await createOperator(account.id, { name, pin, role, branch_id });
    return NextResponse.json(result);
  }

  if (action === "update") {
    const { id, updates } = body;
    const result = await updateOperator(id, account.id, updates);
    return NextResponse.json(result);
  }

  if (action === "delete") {
    const { id } = body;
    const result = await deleteOperator(id, account.id);
    return NextResponse.json(result);
  }

  if (action === "resetPin") {
    const { id, newPin } = body;
    const result = await resetOperatorPin(id, account.id, newPin);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
