"use client";

import { useState, useEffect, useCallback } from "react";

interface BranchResult {
  id: string;
  name: string;
  pharmacyName: string;
}

interface ConnectionRow {
  id: string;
  branchId: string;
  branchName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  decidedAt: string | null;
}

export default function SupplierConnectionsClient() {
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<BranchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/connections");
      const json = (await res.json()) as { connections?: ConnectionRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
      setConnections(json.connections ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load connection requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/marketplace/branches?search=${encodeURIComponent(search.trim())}`);
        const json = (await res.json()) as { branches?: BranchResult[]; error?: string };
        setResults(json.branches ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  async function sendRequest(branchId: string) {
    setSending(branchId);
    try {
      const res = await fetch("/api/marketplace/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setSearch("");
      setResults([]);
      loadConnections();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to send connection request");
    } finally {
      setSending(null);
    }
  }

  const connectedBranchIds = new Set(connections.filter((c) => c.status !== "rejected").map((c) => c.branchId));

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
          Request a branch connection
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pharmacy branch by name..."
          className="mt-1 w-full px-4 py-2.5 rounded-lg border border-outline-variant bg-surface-base focus:outline-none focus:border-primary"
        />
        {searching && <p className="text-xs text-on-surface-variant mt-1">Searching...</p>}
        {results.length > 0 && (
          <div className="mt-2 border border-outline-variant rounded-lg divide-y divide-outline-variant bg-surface-base">
            {results.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-on-surface-variant">{b.pharmacyName}</p>
                </div>
                <button
                  onClick={() => sendRequest(b.id)}
                  disabled={sending === b.id || connectedBranchIds.has(b.id)}
                  className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {connectedBranchIds.has(b.id) ? "Requested" : sending === b.id ? "Sending..." : "Send request"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadConnections} className="ml-4 px-3 py-1 rounded bg-error text-white text-xs font-semibold">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading...</p>
      ) : connections.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No connection requests sent yet.</p>
      ) : (
        <div className="bg-surface-base border border-outline-variant rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-outline-variant/50">
              <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase">
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Requested</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id} className="border-t border-outline-variant">
                  <td className="px-4 py-3 text-sm font-medium">{c.branchName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        c.status === "approved"
                          ? "bg-green-600/20 text-green-700"
                          : c.status === "rejected"
                          ? "bg-error/20 text-error"
                          : "bg-amber-600/20 text-amber-700"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    {new Date(c.requestedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
