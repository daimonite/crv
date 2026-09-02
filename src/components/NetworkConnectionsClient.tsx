"use client";

/**
 * @file components/NetworkConnectionsClient.tsx
 * @description Client component rendered inside /dashboard/network that lists
 * pending supplier connection requests per branch and lets the pharmacy
 * approve or reject them inline (via PATCH /api/marketplace/connections).
 * Approved connections are removed from the pending list; a success message
 * is shown briefly before they disappear.
 */
import { useState } from "react";

interface PendingConnection {
  id: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  branchName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
}

interface Props {
  initialConnections: PendingConnection[];
}

export default function NetworkConnectionsClient({ initialConnections }: Props) {
  const [connections, setConnections] = useState<PendingConnection[]>(initialConnections);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  async function decide(connectionId: string, status: "approved" | "rejected") {
    setDeciding(connectionId);
    try {
      const res = await fetch("/api/marketplace/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, status }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);

      const conn = connections.find((c) => c.id === connectionId);
      const verb = status === "approved" ? "Approved" : "Rejected";
      setFlash({ id: connectionId, msg: `${verb}: ${conn?.supplierName ?? "supplier"}`, ok: status === "approved" });

      // Remove from the pending list after a short delay
      setTimeout(() => {
        setConnections((prev) => prev.filter((c) => c.id !== connectionId));
        setFlash(null);
      }, 1800);
    } catch (e) {
      setFlash({ id: connectionId, msg: e instanceof Error ? e.message : "Action failed", ok: false });
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setDeciding(null);
    }
  }

  if (connections.length === 0) {
    return (
      <p className="text-sm text-on-surface-variant">
        No pending connection requests.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {connections.map((c) => {
        const isFlashing = flash?.id === c.id;
        const isBusy = deciding === c.id;
        return (
          <div
            key={c.id}
            className={`rounded border p-3 transition-colors ${
              isFlashing
                ? flash?.ok
                  ? "border-secondary/40 bg-secondary/5"
                  : "border-error/40 bg-error/5"
                : "border-outline-variant bg-surface-container-low"
            }`}
          >
            <p className="font-body-sm text-body-sm text-ink-deep font-medium truncate">
              {c.supplierName}
            </p>
            <p className="font-body-sm text-[11px] text-on-surface-variant truncate mb-2">
              → {c.branchName} · {new Date(c.requestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </p>

            {isFlashing ? (
              <p className={`text-xs font-label-md ${flash?.ok ? "text-secondary" : "text-error"}`}>
                {flash?.msg}
              </p>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => decide(c.id, "approved")}
                  disabled={isBusy}
                  className="flex-1 px-2 py-1.5 bg-primary text-on-primary font-label-md text-xs disabled:opacity-50 flex items-center justify-center gap-1 hover:opacity-90 transition-opacity"
                >
                  {isBusy ? (
                    <span className="w-3 h-3 border border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  )}
                  Approve
                </button>
                <button
                  onClick={() => decide(c.id, "rejected")}
                  disabled={isBusy}
                  className="flex-1 px-2 py-1.5 border border-outline-variant text-on-surface-variant font-label-md text-xs disabled:opacity-50 hover:bg-surface-container transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
