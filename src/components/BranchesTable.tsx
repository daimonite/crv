"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import type { Branch } from "@/lib/actions/branches";
import CervosMap from "@/components/MapClientWrapper";

interface BranchesTableProps {
  branches: Branch[];
  accountId: string;
}

type BranchForm = {
  name: string;
  address: string;
  lat: string;
  lng: string;
};

type ModalState = {
  mode: "add" | "edit" | null;
  branch: Branch | null;
};

const EMPTY_FORM: BranchForm = { name: "", address: "", lat: "", lng: "" };

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  grace: "bg-amber-50 text-amber-700",
  inactive: "bg-red-50 text-red-700",
  trial: "bg-blue-50 text-blue-700",
};

export default function BranchesTable({ branches, accountId }: BranchesTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ mode: null, branch: null });
  const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [branchOperators, setBranchOperators] = useState<unknown[]>([]);
  const [branchOrders, setBranchOrders] = useState<unknown[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setModal({ mode: "add", branch: null });
  };

  const openEdit = (branch: Branch) => {
    setForm({
      name: branch.name,
      address: branch.address ?? "",
      lat: branch.lat?.toString() ?? "",
      lng: branch.lng?.toString() ?? "",
    });
    setError(null);
    setModal({ mode: "edit", branch });
  };

  const closeModal = () => {
    setModal({ mode: null, branch: null });
    setForm(EMPTY_FORM);
    setError(null);
  };

  const setLocation = (location: { lat: number; lng: number }) => {
    setForm((current) => ({
      ...current,
      lat: location.lat.toFixed(6),
      lng: location.lng.toFixed(6),
    }));
  };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setError("This device does not support location services. Select the branch location on the map instead.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Location permission was not granted. Select the branch location on the map or enter coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    );
  };

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);

    const payload = {
      name: form.name,
      address: form.address || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
    };

    if (modal.mode === "add") {
      const res = await fetch("/api/actions/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...payload }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }
    } else if (modal.mode === "edit" && modal.branch) {
      const res = await fetch("/api/actions/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: modal.branch.id, updates: payload }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    closeModal();
    router.refresh();
  }, [modal, form, router]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this branch?")) return;
    const res = await fetch("/api/actions/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    router.refresh();
  }, [router]);

  const handleBranchClick = async (branch: Branch) => {
    setSelectedBranch(branch);
    setLoadingDetail(true);
    const [opsRes, ordersRes] = await Promise.all([
      fetch(`/api/actions/branches/operators?branchId=${branch.id}`),
      fetch(`/api/actions/branches/orders?accountId=${accountId}`),
    ]);
    const [opsData, ordersData] = await Promise.all([opsRes.json(), ordersRes.json()]);
    setBranchOperators(opsData.operators ?? []);
    setBranchOrders(ordersRes.ok ? ordersData.orders ?? [] : []);
    setLoadingDetail(false);
  };

  const closeDetail = () => {
    setSelectedBranch(null);
    setBranchOperators([]);
    setBranchOrders([]);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div />
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded hover:opacity-90 transition-colors text-sm font-label-md"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          {t("dash.branches.add")}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-error-container text-error rounded text-sm">{error}</div>
      )}

      <div className="bg-surface-base border border-outline-variant rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-container-low">
            <tr>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.branches.name")}
              </th>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.branches.address")}
              </th>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.branches.location")}
              </th>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.branches.subscription")}
              </th>
              <th className="text-right px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.branches.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {branches.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant text-sm">
                  {t("dash.branches.noBranches")}
                </td>
              </tr>
            ) : (
              branches.map((branch) => (
                <tr
                  key={branch.id}
                  onClick={() => handleBranchClick(branch)}
                  className="hover:bg-surface-container-low/30 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-secondary/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[16px] text-secondary">storefront</span>
                      </div>
                      <span className="font-body-md text-body-md text-ink-deep">{branch.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant">
                    {branch.address ?? "—"}
                  </td>
                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant font-mono text-xs">
                    {branch.lat && branch.lng ? `${branch.lat.toFixed(4)}, ${branch.lng.toFixed(4)}` : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-label-md ${STATUS_COLORS[branch.subscription_status ?? "inactive"] ?? "bg-surface-container text-on-surface-variant"}`}>
                      {branch.subscription_status ?? "inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(branch)}
                        className="p-2 hover:bg-surface-container rounded transition-colors"
                        title={t("dash.branches.edit")}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(branch.id)}
                        className="p-2 hover:bg-error-container rounded transition-colors"
                        title={t("dash.branches.delete")}
                      >
                        <span className="material-symbols-outlined text-[16px] text-error">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal.mode && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-surface-base rounded-lg border border-outline-variant w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-headline-md text-headline-md text-ink-deep mb-6">
              {modal.mode === "add" ? t("dash.branches.addTitle") : t("dash.branches.editTitle")}
            </h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">
                  {t("dash.branches.name")}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">
                  {t("dash.branches.address")}
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">
                    {t("dash.branches.lat")}
                  </label>
                  <input
                    type="text"
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                    placeholder="e.g. -6.816"
                    className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">
                    {t("dash.branches.lng")}
                  </label>
                  <input
                    type="text"
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                    placeholder="e.g. 39.280"
                    className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant">Branch location</p>
                    <p className="text-xs text-on-surface-variant">Click the map to place the branch, or use this device&apos;s location while at the branch.</p>
                  </div>
                  <button
                    type="button"
                    onClick={useDeviceLocation}
                    disabled={locating}
                    className="inline-flex items-center gap-1 rounded border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">my_location</span>
                    {locating ? "Locating…" : "Use device location"}
                  </button>
                </div>
                <div className="h-56 overflow-hidden rounded border border-outline-variant">
                  <CervosMap
                    center={form.lat && form.lng ? [Number(form.lat), Number(form.lng)] : [-6.816, 39.2803]}
                    zoom={form.lat && form.lng ? 15 : 11}
                    markers={form.lat && form.lng ? [{ id: "selected-location", lat: Number(form.lat), lng: Number(form.lng), label: "Selected branch location", status: "online" }] : []}
                    onMapClick={setLocation}
                    className="h-56 w-full"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 px-4 py-3 bg-error-container text-error rounded text-sm">{error}</div>
            )}

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2.5 text-on-surface-variant hover:bg-surface-container rounded transition-colors text-sm font-label-md"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !form.name}
                className="px-4 py-2.5 bg-primary text-on-primary rounded hover:opacity-90 transition-colors text-sm font-label-md disabled:opacity-50"
              >
                {loading ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedBranch && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50" onClick={closeDetail}>
          <div className="bg-surface-base rounded-lg border border-outline-variant w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-headline-md text-headline-md text-ink-deep">
                {selectedBranch.name}
              </h2>
              <button onClick={closeDetail} className="p-1 hover:bg-surface-container rounded">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
              </button>
            </div>

            {loadingDetail ? (
              <div className="text-center py-8 text-on-surface-variant">{t("common.loading")}</div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-1">{t("dash.branches.address")}</p>
                    <p className="text-ink-deep">{selectedBranch.address ?? "—"}</p>
                  </div>
                  <div>
                    <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-1">{t("dash.branches.subscription")}</p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-label-md ${STATUS_COLORS[selectedBranch.subscription_status ?? "inactive"] ?? ""}`}>
                      {selectedBranch.subscription_status ?? "inactive"}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-3">{t("dash.branches.operators")} ({branchOperators.length})</p>
                  {branchOperators.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">{t("dash.operators.noOperators")}</p>
                  ) : (
                    <div className="divide-y divide-outline-variant/30">
                      {(branchOperators as { name: string; role: string }[]).map((op: { name: string; role: string }, i: number) => (
                        <div key={i} className="py-3 flex items-center justify-between">
                          <p className="text-sm text-ink-deep">{op.name}</p>
                          <span className="text-xs text-on-surface-variant capitalize">{op.role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-3">{t("dash.branches.recentOrders")} ({branchOrders.length})</p>
                  {branchOrders.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">{t("dash.orders.noOrders")}</p>
                  ) : (
                    <div className="divide-y divide-outline-variant/30">
                      {(branchOrders as { id: string; total: number; created_at: string }[]).map((order: { id: string; total: number; created_at: string }, i: number) => (
                        <div key={i} className="py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm text-ink-deep font-mono">#{order.id.slice(0, 8).toUpperCase()}</p>
                            <p className="text-xs text-on-surface-variant">{order.created_at ? new Date(order.created_at).toLocaleDateString() : "—"}</p>
                          </div>
                          <p className="text-sm font-medium text-ink-deep">TSh {order.total?.toLocaleString() ?? 0}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
