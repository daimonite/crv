"use client";

import { useState, useMemo } from "react";
import CervosMap, { MarkerData } from "@/components/CervosMap";
import type { BranchRow } from "./page";
import { arrayToCSV, downloadCSV } from "@/lib/export";

interface Props {
  branches: BranchRow[];
}

function formatDate(ds: string | null): string {
  if (!ds) return "—";
  const d = new Date(ds);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "bg-primary/10", text: "text-primary", label: "Active" },
    trial: { bg: "bg-blue-100", text: "text-blue-700", label: "Trial" },
    grace: { bg: "bg-amber-100", text: "text-amber-700", label: "Grace" },
    locked: { bg: "bg-error/10", text: "text-error", label: "Locked" },
    offline: { bg: "bg-error/10", text: "text-error", label: "Offline" },
    online: { bg: "bg-primary/10", text: "text-primary", label: "Online" },
  };
  const s = map[status] ?? { bg: "bg-gray-100", text: "text-gray-700", label: status };
  return (
    <span className={`font-label-md text-label-md px-2 py-0.5 rounded ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

export default function NetworkMapClient({ branches }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<BranchRow | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    return branches.filter((b) => {
      const q = search.toLowerCase();
      const acctName = (b.accounts as { name?: string } | null)?.name ?? "";
      const matchesSearch =
        !search ||
        b.name.toLowerCase().includes(q) ||
        acctName.toLowerCase().includes(q);
      const matchesStatus = filterStatus === "all" || b.subscription_status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [branches, search, filterStatus]);

  const markers: MarkerData[] = filtered.map((b) => ({
    id: b.id,
    lat: b.lat!,
    lng: b.lng!,
    label: b.name,
    status: b.subscription_status === "grace"
      ? "grace"
      : b.subscription_status === "locked" || b.subscription_status === "offline"
      ? "offline"
      : "online",
    accountName: (b.accounts as { name?: string } | null)?.name,
    lastSync: formatDate(b.last_synced_at),
    detail: b.trial_ends_at
      ? `Trial ends: ${new Date(b.trial_ends_at).toLocaleDateString("en-GB")}`
      : b.grace_ends_at
      ? `Grace ends: ${new Date(b.grace_ends_at).toLocaleDateString("en-GB")}`
      : null,
  }));

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: branches.length, online: 0, grace: 0, locked: 0 };
    for (const b of branches) {
      if (b.subscription_status === "grace") counts.grace++;
      else if (b.subscription_status === "locked" || b.subscription_status === "offline") counts.locked++;
      else counts.online++;
    }
    return counts;
  }, [branches]);

  const handleExport = () => {
    const cols = [
      { key: "name" as keyof BranchRow, header: "Branch Name" },
      { key: "subscription_status" as keyof BranchRow, header: "Status" },
      { key: "last_synced_at" as keyof BranchRow, header: "Last Synced" },
      { key: "trial_ends_at" as keyof BranchRow, header: "Trial Ends" },
      { key: "grace_ends_at" as keyof BranchRow, header: "Grace Ends" },
    ];
    const rows = filtered.map((b) => ({
      ...b,
      accounts: (b.accounts as { name?: string } | null)?.name ?? "—",
    }));
    const csv = arrayToCSV(rows as unknown as Record<string, unknown>[], cols as never);
    downloadCSV(csv, `network-branches-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const statusOptions = [
    { value: "all", label: `All (${statusCounts.all})` },
    { value: "online", label: `Online (${statusCounts.online})` },
    { value: "grace", label: `Grace (${statusCounts.grace})` },
    { value: "locked", label: `Locked (${statusCounts.locked})` },
  ];

  return (
    <div className="max-w-7xl w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">HQ Console</p>
          <h1 className="font-headline-lg text-headline-lg text-ink-deep">Network Map</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            {filtered.length} branch{filtered.length !== 1 ? "es" : ""} with live coordinates
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-surface-base border border-outline-variant rounded font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Export CSV
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 mb-4">
        {statusOptions.map((o) => (
          <button
            key={o.value}
            onClick={() => setFilterStatus(o.value)}
            className={`px-3 py-1.5 rounded-full font-label-md text-label-md transition-all ${
              filterStatus === o.value
                ? "bg-primary text-on-primary"
                : "bg-surface-base border border-outline-variant text-on-surface-variant hover:border-primary"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Map + Sidebar */}
      <div className="flex gap-0 rounded-xl overflow-hidden border border-outline-variant shadow-sm" style={{ height: "580px" }}>
        {/* Sidebar */}
        <div className="w-80 flex-shrink-0 bg-surface-base border-r border-outline-variant flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-outline-variant/50">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search branches…"
                className="w-full pl-9 pr-3 py-2 bg-surface-container-low border border-outline-variant rounded text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Branch list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">location_off</span>
                <p className="font-body-sm text-on-surface-variant">No branches found</p>
              </div>
            ) : (
              filtered.map((b) => {
                const acct = b.accounts as { name?: string } | null;
                const isSelected = selected?.id === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelected(isSelected ? null : b)}
                    className={`w-full text-left p-3 border-b border-outline-variant/30 hover:bg-surface-container-low transition-colors ${
                      isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className={`font-body-md text-body-md font-medium truncate ${isSelected ? "text-primary" : "text-ink-deep"}`}>
                        {b.name}
                      </p>
                      <StatusBadge status={b.subscription_status} />
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant truncate">{acct?.name ?? "—"}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        b.subscription_status === "grace" ? "bg-amber-500" :
                        b.subscription_status === "locked" || b.subscription_status === "offline" ? "bg-error" : "bg-emerald-500"
                      }`} />
                      <span className="font-label-md text-label-md text-on-surface-variant text-xs">
                        {formatDate(b.last_synced_at)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {filtered.length > 0 ? (
            <CervosMap
              markers={markers}
              center={[filtered[0].lat!, filtered[0].lng!]}
              zoom={11}
              selectedId={selected?.id ?? null}
              onMarkerClick={(m) => {
                const b = filtered.find((br) => br.id === m.id);
                if (b) setSelected(b);
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-surface-container-low">
              <p className="font-body-md text-on-surface-variant">No branches match your filters.</p>
            </div>
          )}

          {/* Selected branch detail panel */}
          {selected && (
            <div className="absolute top-3 right-3 w-72 bg-surface-base border border-outline-variant rounded-lg shadow-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-headline-md text-headline-md text-ink-deep">{selected.name}</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{(selected.accounts as { name?: string } | null)?.name}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-on-surface-variant">Status</span>
                  <StatusBadge status={selected.subscription_status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-on-surface-variant">Last Sync</span>
                  <span className="font-body-sm text-body-sm text-on-surface">{formatDate(selected.last_synced_at)}</span>
                </div>
                {selected.trial_ends_at && (
                  <div className="flex items-center justify-between">
                    <span className="font-label-md text-label-md text-on-surface-variant">Trial Ends</span>
                    <span className="font-body-sm text-body-sm text-on-surface">
                      {new Date(selected.trial_ends_at).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                )}
                {selected.grace_ends_at && (
                  <div className="flex items-center justify-between">
                    <span className="font-label-md text-label-md text-on-surface-variant">Grace Ends</span>
                    <span className="font-body-sm text-body-sm text-amber-600">
                      {new Date(selected.grace_ends_at).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-on-surface-variant">Location</span>
                  <span className="font-body-sm text-body-sm text-on-surface">
                    {selected.lat?.toFixed(4)}, {selected.lng?.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-6 mt-3">
        {[
          { colour: "bg-primary", label: "Online / Active" },
          { colour: "bg-amber-500", label: "Grace Period" },
          { colour: "bg-error", label: "Offline / Locked" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${l.colour}`} />
            <span className="font-label-md text-label-md text-on-surface-variant text-xs">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
