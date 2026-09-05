import { getSupplierInvites } from "@/lib/actions/hq";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HQSidebarServer from "@/components/HQSidebarServer";
import HQInvitesClient from "./HQInvitesClient";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";

export default async function HQInvitesPage() {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const { data: invites, error } = await getSupplierInvites();

  return (
    <div className="flex min-h-screen bg-surface-container-lowest">
      <HQSidebarServer />
      <main className="flex-1 ml-64 p-8 pt-12">
        <div className="max-w-6xl">
          <div className="mb-8">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">
              HQ Console
            </p>
            <h1 className="font-headline-lg text-headline-lg text-ink-deep">
              Supplier Invites
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              Manage supplier invite links and track acceptance status.
            </p>
          </div>

          {error ? (
            <div className="bg-error-container text-on-error-container p-6 rounded">
              <p className="font-body-md">Error loading invites: {error}</p>
            </div>
          ) : (
            <HQInvitesClient />
          )}
        </div>
      </main>
    </div>
  );
}
