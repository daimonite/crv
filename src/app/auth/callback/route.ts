import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      const accountType = data.session.user.user_metadata?.account_type ?? "pharmacy";
      const inviteToken = data.session.user.user_metadata?.invite_token;
      const isRecovery = data.session.user.email_confirmed_at !== null && next?.includes("recovery");

      if (searchParams.get("type") === "recovery" || next?.startsWith("/auth/recovery")) {
        return NextResponse.redirect(`${origin}/auth/recovery`);
      }

      const redirectTo = accountType === "supplier" ? "/supplier" : next;

      if (inviteToken && accountType === "supplier") {
        const serviceClient = await createServiceClient();
        const { data: account } = await serviceClient
          .from("accounts")
          .select("id")
          .eq("auth_user_id", data.session.user.id)
          .single();

        if (account) {
          const { data: invite } = await serviceClient
            .from("supplier_invites")
            .select("id, status, token_expires_at")
            .eq("invite_token", inviteToken)
            .maybeSingle();

          if (invite && invite.status === "pending" && new Date(invite.token_expires_at) > new Date()) {
            const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
            await serviceClient
              .from("supplier_invites")
              .update({
                status: "accepted",
                supplier_account_id: account.id,
                accepted_at: new Date().toISOString(),
              })
              .eq("id", invite.id);

            await serviceClient
              .from("accounts")
              .update({
                download_enabled: false,
                subscription_status: "trial",
                trial_ends_at: trialEndsAt,
                invite_token: inviteToken,
              })
              .eq("id", account.id);
          }
        }
      }

      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=confirmation_failed`);
}
