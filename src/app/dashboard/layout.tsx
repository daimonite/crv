/**
 * @file dashboard/layout.tsx
 * @description Server layout for the pharmacy dashboard. Gates dashboard
 *   access based on account subscription_status so locked/suspended accounts
 *   cannot reach any /dashboard/* page.
 */
import { createClient } from "@/lib/supabase/server";
import SubscriptionGate from "@/components/SubscriptionGate";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let subscription_status: "trial" | "active" | "grace" | "locked" | "suspended" = "active";

  if (user) {
    const { data: account } = await supabase
      .from("accounts")
      .select("subscription_status")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (account?.subscription_status) {
      subscription_status = account.subscription_status;
    }
  }

  return (
    <SubscriptionGate subscription_status={subscription_status}>
      {children}
    </SubscriptionGate>
  );
}
