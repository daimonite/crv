/**
 * @route /hq/intelligence
 * @access HQ operators only — validated via hq_sess cookie.
 * @description Server component that fetches the intelligence overview
 *   (top-line totals, period stats, quote funnel, support breakdown, recent
 *   activity) plus the demographics breakdown, then hands both to the client
 *   component for period switching.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";
import HQSidebarServer from "@/components/HQSidebarServer";
import { getIntelligenceOverview, getDemographicsBreakdown, getSyncHealthMetrics, getEngagementMetrics, getNetworkHealthMetrics, getRevenueMetrics, getHourlyActivityStats, getBranchIntelligenceMetrics, getMarketIntelligence, getLogisticsIntelligence, getUserActivityMetrics } from "@/lib/actions/hq";
import HQIntelligenceClient from "./HQIntelligenceClient";

export default async function HQIntelligencePage() {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const [overviewResult, demographicsResult, syncHealthResult, engagementResult, networkHealthResult, revenueResult, hourlyResult, branchIntelligenceResult, marketResult, logisticsResult, userActivityResult] = await Promise.all([
    getIntelligenceOverview(30),
    getDemographicsBreakdown(),
    getSyncHealthMetrics(30),
    getEngagementMetrics(),
    getNetworkHealthMetrics(),
    getRevenueMetrics(30),
    getHourlyActivityStats(24),
    getBranchIntelligenceMetrics(30),
    getMarketIntelligence(30),
    getLogisticsIntelligence(30),
    getUserActivityMetrics(30),
  ]);

  return (
    <div className="flex min-h-screen bg-surface-container-lowest">
      <HQSidebarServer />
      <main className="flex-1 ml-64 p-8 pt-12">
        <div className="max-w-6xl">
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">
                HQ Console
              </p>
              <h1 className="font-headline-lg text-headline-lg text-ink-deep">Intelligence</h1>
            </div>
            <div className="flex gap-2">
              <a href="/api/hq/export/accounts" className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-surface-base rounded font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-all">
                <span className="material-symbols-outlined text-[16px]">download</span>
                Accounts CSV
              </a>
              <a href="/api/hq/export/branches" className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-surface-base rounded font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-all">
                <span className="material-symbols-outlined text-[16px]">download</span>
                Branches CSV
              </a>
              <a href="/api/hq/export/payments" className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-surface-base rounded font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-all">
                <span className="material-symbols-outlined text-[16px]">download</span>
                Payments CSV
              </a>
              <a href="/api/hq/export/tickets" className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-surface-base rounded font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-all">
                <span className="material-symbols-outlined text-[16px]">download</span>
                Tickets CSV
              </a>
              <a href="/api/hq/export/quotes" className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-surface-base rounded font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-all">
                <span className="material-symbols-outlined text-[16px]">download</span>
                Quotes CSV
              </a>
              <a href="/api/hq/export/news" className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-surface-base rounded font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-all">
                <span className="material-symbols-outlined text-[16px]">download</span>
                News CSV
              </a>
            </div>
          </div>

          <HQIntelligenceClient
            overview={overviewResult.data}
            overviewError={overviewResult.error}
            demographics={demographicsResult.data}
            demographicsError={demographicsResult.error}
            syncHealth={syncHealthResult.data}
            syncHealthError={syncHealthResult.error}
            engagement={engagementResult.data}
            engagementError={engagementResult.error}
            networkHealth={networkHealthResult.data}
            networkHealthError={networkHealthResult.error}
            revenue={revenueResult.data}
            revenueError={revenueResult.error}
            hourlyActivity={hourlyResult.data}
            hourlyActivityError={hourlyResult.error}
            branchIntelligence={branchIntelligenceResult.data}
            branchIntelligenceError={branchIntelligenceResult.error}
            marketIntelligence={marketResult.data}
            marketIntelligenceError={marketResult.error}
            logisticsIntelligence={logisticsResult.data}
            logisticsIntelligenceError={logisticsResult.error}
            userActivity={userActivityResult.data}
            userActivityError={userActivityResult.error}
          />
        </div>
      </main>
    </div>
  );
}
