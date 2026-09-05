import { searchAuditLog, getAuditActionTypes } from "@/lib/actions/hq";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HQSidebarServer from "@/components/HQSidebarServer";
import HQAuditClient from "./HQAuditClient";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";

export default async function HQAudiPage() {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const [auditResult, actionTypesResult] = await Promise.all([
    searchAuditLog({ limit: 50 }),
    getAuditActionTypes(),
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
            <h1 className="font-headline-lg text-headline-lg text-ink-deep">Audit Log</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              God-mode view of every admin action across the entire network.
            </p>
          </div>

          <HQAuditClient
            initialEntries={auditResult.data ?? []}
            initialTotal={auditResult.total}
            initialError={auditResult.error}
            actionTypes={actionTypesResult.data}
          />
        </div>
      </main>
    </div>
  );
}
