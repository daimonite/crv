import { getAllAccounts } from "@/lib/actions/hq";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HQSidebarServer from "@/components/HQSidebarServer";
import HQAccountsClient from "./HQAccountsClient";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";

export default async function HQAccountsPage() {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const [accountsResult, branchesResult] = await Promise.all([
    getAllAccounts(),
    (async () => {
      const { createServiceClient } = await import("@/lib/supabase/server");
      const supabase = await createServiceClient();
      return supabase
        .from("branches")
        .select("id, name, account_id, subscription_status, unlock_requested_at, manually_unlocked_at")
        .order("created_at", { ascending: false });
    })(),
  ]);

  const { data: accounts, error: accountsError } = accountsResult;
  const { data: branches, error: branchesError } = branchesResult ?? { data: null, error: null };

  return (
    <div className="flex min-h-screen bg-surface-container-lowest">
      <HQSidebarServer />
      <main className="flex-1 ml-64 p-8 pt-12">
        <div className="max-w-6xl">
          <div className="mb-8">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">
              HQ Console
            </p>
            <h1 className="font-headline-lg text-headline-lg text-ink-deep">Accounts</h1>
          </div>

          {accountsError ? (
            <div className="bg-error-container text-on-error-container p-6 rounded">
              <p className="font-body-md">Error loading accounts: {accountsError}</p>
            </div>
          ) : (
            <HQAccountsClient
              accounts={accounts ?? []}
              branches={branches ?? []}
            />
          )}
        </div>
      </main>
    </div>
  );
}
