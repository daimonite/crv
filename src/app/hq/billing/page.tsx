/**
 * @route /hq/billing
 * @access HQ operators only — validated via hq_sess cookie.
 * @description Server component for the HQ Billing & Subscription management page.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";
import HQSidebarServer from "@/components/HQSidebarServer";
import {
  getBillingOverview,
  getBillingAccounts,
  getSubscriptionPlans,
  getAllBillingPayments,
} from "@/lib/actions/hq";
import HQBillingClient from "./HQBillingClient";

export default async function HQBillingPage() {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const [overviewResult, accountsResult, plansResult, paymentsResult] = await Promise.all([
    getBillingOverview(),
    getBillingAccounts(),
    getSubscriptionPlans(),
    getAllBillingPayments(),
  ]);

  return (
    <div className="flex min-h-screen bg-surface-container-lowest">
      <HQSidebarServer />
      <main className="flex-1 ml-64 p-8 pt-12">
        <div className="max-w-7xl">
          <div className="mb-8">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">
              HQ Console
            </p>
            <h1 className="font-headline-lg text-headline-lg text-ink-deep">Billing &amp; Subscriptions</h1>
          </div>

          <HQBillingClient
            overview={overviewResult.data}
            overviewError={overviewResult.error}
            accounts={accountsResult.data}
            accountsError={accountsResult.error}
            plans={plansResult.data}
            plansError={plansResult.error}
            payments={paymentsResult.data}
            paymentsError={paymentsResult.error}
          />
        </div>
      </main>
    </div>
  );
}
