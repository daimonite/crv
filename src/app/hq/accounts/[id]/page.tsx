/**
 * @route /hq/accounts/[id]
 * @access HQ operators only — validated via hq_sess cookie.
 * @description Server component that fetches the full drill-down for one
 *   account (profile, branches, operators, tickets, sales, orders, activity)
 *   and passes it to the interactive client component.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";
import HQSidebarServer from "@/components/HQSidebarServer";
import { getAccountDetail } from "@/lib/actions/hq";
import HQAccountDetailClient from "./HQAccountDetailClient";

export default async function HQAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const { id } = await params;
  const result = await getAccountDetail(id);

  return (
    <div className="flex min-h-screen bg-surface-container-lowest">
      <HQSidebarServer />
      <main className="flex-1 ml-64 p-8 pt-12">
        <div className="max-w-6xl">
          <Link
            href="/hq/accounts"
            className="inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline mb-4"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Accounts
          </Link>

          <div className="mb-8">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">
              HQ Console
            </p>
            <h1 className="font-headline-lg text-headline-lg text-ink-deep">Account Detail</h1>
          </div>

          <HQAccountDetailClient
            detail={result.data}
            error={result.error}
          />
        </div>
      </main>
    </div>
  );
}
