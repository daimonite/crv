import { getAllQuoteRequests } from "@/lib/actions/hq";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HQSidebarServer from "@/components/HQSidebarServer";
import HQQuotesClient from "./HQQuotesClient";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";

export default async function HQQuotesPage() {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const { data: quotes, error } = await getAllQuoteRequests();

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
                Quote Requests
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Inbound supplier quote requests from the public supplier page.
              </p>
            </div>
            <a
              href="/api/hq/export/quotes"
              className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-surface-base rounded font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Export CSV
            </a>
          </div>

          {error ? (
            <div className="bg-error-container text-on-error-container p-6 rounded">
              <p className="font-body-md">Error loading quotes: {error}</p>
            </div>
          ) : (
            <HQQuotesClient quotes={quotes ?? []} />
          )}
        </div>
      </main>
    </div>
  );
}
