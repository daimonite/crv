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
      const entityName = data.session.user.user_metadata?.entity_name ?? null;
      const inviteToken = data.session.user.user_metadata?.invite_token;
      const isRecovery = data.session.user.email_confirmed_at !== null && next?.includes("recovery");

      if (searchParams.get("type") === "recovery" || next?.startsWith("/auth/recovery")) {
        return NextResponse.redirect(`${origin}/auth/recovery`);
      }

      // Ensure an `accounts` row exists for this user. In production this is
      // normally created by a Supabase DB trigger on auth.users insert (see
      // src/lib/actions/auth.ts), but that trigger lives outside this repo
      // and isn't guaranteed to be configured on every environment. Without
      // an accounts row, every dashboard/marketplace/POS-linking query that
      // looks up `accounts` by `auth_user_id` fails silently, producing a
      // blank dashboard for the new user. This is a defensive, idempotent
      // fallback: create the row here if the trigger hasn't already done it.
      const serviceClientForAccount = await createServiceClient();
      const { data: existingAccount } = await serviceClientForAccount
        .from("accounts")
        .select("id")
        .eq("auth_user_id", data.session.user.id)
        .maybeSingle();

      if (!existingAccount) {
        const { error: createAccountError } = await serviceClientForAccount
          .from("accounts")
          .insert({
            auth_user_id: data.session.user.id,
            name: entityName || data.session.user.email,
            type: accountType,
            email: data.session.user.email,
          });

        if (createAccountError && createAccountError.code !== "23505") {
          // 23505 = unique violation, meaning a concurrent request (or the
          // DB trigger) already created it — safe to ignore. Anything else
          // is unexpected; log it so a blank dashboard is diagnosable.
          console.error("[auth/callback] failed to create accounts row:", createAccountError.message);
        }
      }

      const redirectTo = accountType === "supplier" ? "/supplier" : next;

      if (inviteToken && accountType === "supplier") {
        const { data: account } = await serviceClientForAccount
          .from("accounts")
          .select("id")
          .eq("auth_user_id", data.session.user.id)
          .single();

        if (account) {
          const { data: invite } = await serviceClientForAccount
            .from("supplier_invites")
            .select("id, status, token_expires_at")
            .eq("invite_token", inviteToken)
            .maybeSingle();

          if (invite && invite.status === "pending" && new Date(invite.token_expires_at) > new Date()) {
            const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
            await serviceClientForAccount
              .from("supplier_invites")
              .update({
                status: "accepted",
                supplier_account_id: account.id,
                accepted_at: new Date().toISOString(),
              })
              .eq("id", invite.id);

            await serviceClientForAccount
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
