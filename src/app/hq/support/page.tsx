/**
 * @route /hq/support
 * @access HQ session required (HMAC cookie `hq_sess`)
 * @description Support ticket management — lists all submitted support tickets
 * with filter tabs (All / Open / In Progress / Resolved), expand-to-detail,
 * status change, and internal note capture.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";
import HQSidebarServer from "@/components/HQSidebarServer";
import HQSupportClient from "./HQSupportClient";
import { getSupportTickets } from "@/lib/actions/support";

export default async function HQSupportPage() {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const { data: tickets, error } = await getSupportTickets();

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
              <h1 className="font-headline-lg text-headline-lg text-ink-deep">
                Support Tickets
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Questions and requests submitted via the public support page.
              </p>
            </div>
            <a
              href="/api/hq/export/tickets"
              className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-surface-base rounded font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Export CSV
            </a>
          </div>

          {error ? (
            <div className="bg-error-container text-on-error-container p-6 rounded">
              <p className="font-body-md">Error loading tickets: {error}</p>
            </div>
          ) : (
            <HQSupportClient tickets={tickets ?? []} />
          )}
        </div>
      </main>
    </div>
  );
}
