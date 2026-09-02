/**
 * @route /dashboard/network
 * @access Authenticated pharmacy accounts only.
 * @description Pharmacy network map — the account's branch fleet overlaid on a
 * full-width Leaflet map, plus a connected-suppliers panel and a live panel
 * showing pending supplier connection requests so the pharmacy can approve or
 * reject them without needing the desktop app.
 */
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isSubscribedActive } from "@/lib/subscription";
import PharmacySidebar from "@/components/PharmacySidebar";
import NetworkConnectionsClient from "@/components/NetworkConnectionsClient";
import Link from "next/link";
import CervosMap from "@/components/MapClientWrapper";

export default async function NetworkPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/auth?next=/dashboard/network");

  const supabase = await createServiceClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, type, subscription_status, subscription_expires_at, trial_ends_at")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) redirect("/auth?next=/dashboard/network");
  if (account.type !== "pharmacy") redirect("/dashboard");
  if (!isSubscribedActive(account)) redirect("/dashboard/billing");

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, lat, lng, subscription_status, address, last_synced_at")
    .eq("account_id", account.id);

  const branchList = branches ?? [];
  const branchIds = branchList.map((b) => b.id);

  type ConnectionRow = {
    id: string;
    supplier_id: string;
    branch_id: string;
    status: string;
    requested_at: string;
    decided_at: string | null;
    accounts: { name: string } | null;
    branches: { name: string } | null;
  };

  // Fetch connections with joined supplier and branch names in a single query
  const { data: rawConnections } = branchIds.length > 0
    ? await supabase
        .from("branch_supplier_connections")
        .select("id, supplier_id, branch_id, status, requested_at, decided_at, accounts!supplier_id(name), branches(name)")
        .in("branch_id", branchIds)
        .order("requested_at", { ascending: false })
    : { data: [] };

  const connectionList = (rawConnections ?? []) as unknown as ConnectionRow[];

  // Approved suppliers for the sidebar summary
  const approvedSuppliers = [
    ...new Map(
      connectionList
        .filter((c) => c.status === "approved")
        .map((c) => [c.supplier_id, c.accounts?.name ?? "Supplier"] as const)
    ).entries(),
  ];

  const markers = branchList
    .filter((b) => b.lat && b.lng)
    .map((b) => ({
      lat: b.lat as number,
      lng: b.lng as number,
      label: b.name,
      status: b.subscription_status as "online" | "offline" | "grace",
    }));

  const center =
    markers.length > 0
      ? [markers[0].lat, markers[0].lng]
      : [-6.816, 39.2803];

  // Shape connection rows for the client component
  const pendingConnections = connectionList
    .filter((c) => c.status === "pending")
    .map((c) => ({
      id: c.id,
      supplierId: c.supplier_id,
      supplierName: c.accounts?.name ?? "Unknown supplier",
      branchId: c.branch_id,
      branchName: c.branches?.name ?? "Unknown branch",
      status: c.status as "pending" | "approved" | "rejected",
      requestedAt: c.requested_at,
    }));

  return (
    <div className="flex min-h-screen bg-surface">
      <PharmacySidebar branchName={branchList[0]?.name} accountName={account.name} />

      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              Branch network
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">Network Map</h1>
          </div>
          {pendingConnections.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="font-mono text-label-md text-amber-600 uppercase">
                {pendingConnections.length} pending request{pendingConnections.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </header>

        <main className="flex-grow pt-16 flex">
          <div className="flex-1 bg-surface-container-low relative min-h-[calc(100vh-4rem)]">
            {markers.length > 0 ? (
              <CervosMap center={center as [number, number]} zoom={11} markers={markers} className="w-full h-full" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-[64px] text-on-surface-variant/20 mb-4">map</span>
                <p className="font-body-md text-body-md text-on-surface-variant">No branches with locations yet.</p>
                <Link href="/dashboard/branches" className="text-primary font-label-md text-label-md mt-2 hover:underline">
                  Manage branches
                </Link>
              </div>
            )}
          </div>

          {/* Right panel */}
          <aside className="w-80 shrink-0 border-l border-outline-variant bg-surface-base overflow-y-auto flex flex-col">
            {/* Branch count */}
            <div className="px-6 py-5 border-b border-outline-variant">
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs mb-1">
                Your branches
              </p>
              <p className="font-headline-md text-headline-md text-ink-deep">{branchList.length}</p>
            </div>

            {/* Branch list */}
            <div className="divide-y divide-outline-variant/40">
              {branchList.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-on-surface-variant">No branches.</p>
              ) : (
                branchList.map((b) => {
                  const statusColor =
                    b.subscription_status === "active"
                      ? "bg-secondary"
                      : b.subscription_status === "grace"
                      ? "bg-amber-500"
                      : "bg-error";
                  return (
                    <div key={b.id} className="px-6 py-4 flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${statusColor} flex-shrink-0`} />
                      <div className="min-w-0">
                        <p className="font-body-md text-body-md text-ink-deep truncate">{b.name}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                          {b.address ?? `(${typeof b.lat === "number" ? b.lat.toFixed(4) : "—"}, ${typeof b.lng === "number" ? b.lng.toFixed(4) : "—"})`}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pending connection requests — approve / reject inline */}
            <div className="px-6 py-5 border-t border-outline-variant">
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs mb-3">
                Connection requests
              </p>
              <NetworkConnectionsClient initialConnections={pendingConnections} />
            </div>

            {/* Approved suppliers summary */}
            <div className="px-6 py-5 border-t border-outline-variant">
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs mb-3">
                Connected suppliers
              </p>
              {approvedSuppliers.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  No approved supplier connections yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {approvedSuppliers.map(([id, name]) => (
                    <li key={id} className="flex items-center gap-2 text-sm text-ink-deep">
                      <span className="material-symbols-outlined text-[16px] text-primary">inventory_2</span>
                      <span className="truncate">{name}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/dashboard/marketplace"
                className="inline-flex items-center gap-1 mt-4 text-primary font-label-md text-label-md hover:underline"
              >
                Open marketplace <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
