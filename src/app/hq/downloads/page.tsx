/**
 * @route /hq/downloads
 * @access HQ session required (HMAC cookie `hq_sess`)
 * @description Download management — upload installer releases, mark as current,
 * and delete old releases. Data is stored in Supabase Storage (`app-releases` bucket)
 * and the `app_releases` table.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";
import HQSidebarServer from "@/components/HQSidebarServer";
import HQDownloadsClient from "./HQDownloadsClient";
import { getAllReleases } from "@/lib/actions/hq";

export default async function HQDownloadsPage() {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const { data: releases, error } = await getAllReleases();

  return (
    <div className="flex min-h-screen bg-surface-container-lowest">
      <HQSidebarServer />
      <main className="flex-1 ml-64 p-8 pt-12">
        <div className="max-w-6xl">
          <div className="mb-8">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">
              HQ Console
            </p>
            <h1 className="font-headline-lg text-headline-lg text-ink-deep">Downloads</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              Upload installer releases and manage which version is served to pharmacies.
            </p>
          </div>

          {error ? (
            <div className="bg-error-container text-on-error-container p-6 rounded mb-8">
              <p className="font-body-md">Error loading releases: {error}</p>
            </div>
          ) : null}

          <HQDownloadsClient releases={releases ?? []} />
        </div>
      </main>
    </div>
  );
}
