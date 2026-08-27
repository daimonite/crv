/**
 * @file hq/accounts/[id]/HQAccountDetailClient.tsx
 * @description Interactive client component for the HQ account drill-down.
 *   Provides HQ granular controls: profile editing, suspension, branch
 *   subscription management, and operator management. Every action calls a
 *   service-role server action and then reloads to reflect fresh data.
 */
"use client";

import { useState } from "react";
import {
  updateAccountProfile,
  suspendAccount,
  unsuspendAccount,
  lockBranch,
  extendBranchTrial,
  resetBranchSubscription,
  addOperator,
  removeOperator,
  setOperatorRole,
  type AccountDetail,
} from "@/lib/actions/hq";
import Toast from "@/components/Toast";

interface Props {
  detail: AccountDetail | null;
  error: string | null;
}

const SUB_STATUS_COLORS: Record<string, string> = {
  trial: "bg-primary/10 text-primary",
  active: "bg-secondary/10 text-secondary",
  payment_due: "bg-amber-100 text-amber-700",
  grace: "bg-amber-100 text-amber-700",
  locked: "bg-error-container text-error",
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  open: "bg-error-container text-error",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-secondary/10 text-secondary",
};

const OPERATOR_ROLES = ["cashier", "pharmacist_in_charge", "owner"] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function HQAccountDetailClient({ detail, error }: Props) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    requiredWord: string;
    action: () => Promise<{ error: string | null }>;
    success: string;
  } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const [form, setForm] = useState({
    name: detail?.account?.name ?? "",
    billing_status: detail?.account?.billing_status ?? "",
    contact_name: detail?.profile?.contact_name ?? "",
    phone: detail?.profile?.phone ?? "",
    region: detail?.profile?.region ?? "",
    role: detail?.profile?.role ?? "",
    tech_comfort: detail?.profile?.tech_comfort ?? "",
    goals: (detail?.profile?.goals ?? []).join(", "),
  });

  // ── Operator modal state ──────────────────────────────────────────────
  const [opModal, setOpModal] = useState<{ branchId: string; branchName: string } | null>(null);
  const [opName, setOpName] = useState("");
  const [opPin, setOpPin] = useState("");
  const [opRole, setOpRole] = useState("cashier");

  function showToast(message: string, type: "success" | "error" | "info") {
    setToast({ message, type });
  }

  async function run(id: string, fn: () => Promise<{ error: string | null }>, success: string) {
    setBusy(id);
    try {
      const result = await fn();
      if (result.error) {
        showToast(result.error, "error");
      } else {
        showToast(success, "success");
        window.location.reload();
      }
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="bg-error-container text-on-error-container p-6 rounded">
        <p className="font-body-md">Error loading account: {error}</p>
      </div>
    );
  }

  if (!detail || !detail.account) {
    return (
      <div className="bg-surface-base border border-outline-variant p-10 text-center rounded">
        <p className="font-body-md text-on-surface-variant">Account not found.</p>
      </div>
    );
  }

  const acct = detail.account;
  const profile = detail.profile;

  async function handleSaveProfile() {
    const result = await updateAccountProfile(acct.id, {
      name: form.name,
      billing_status: form.billing_status || undefined,
      contact_name: form.contact_name,
      phone: form.phone,
      region: form.region,
      role: form.role,
      tech_comfort: form.tech_comfort,
      goals: form.goals.split(",").map((g) => g.trim()).filter(Boolean),
    });
    if (result.error) {
      showToast(result.error, "error");
    } else {
      setEditOpen(false);
      showToast("Account updated.", "success");
      window.location.reload();
    }
  }

  function handleSuspend() {
    const reason = suspendReason.trim();
    if (!reason) {
      showToast("Add a suspension reason first.", "error");
      return;
    }
    setConfirmText("");
    setConfirmModal({
      title: "Suspend account",
      message: `This will suspend "${acct.name}" and block all sign-in and desktop sync. Reason: ${reason}`,
      requiredWord: "CONFIRM",
      action: () => suspendAccount(acct.id, reason),
      success: "Account suspended.",
    });
  }

  async function handleConfirm() {
    if (!confirmModal) return;
    const { action, success } = confirmModal;
    const title = confirmModal.title;
    setConfirmModal(null);
    setConfirmText("");
    await run(title, action, success);
  }

  async function handleAddOperator() {
    if (!opModal) return;
    const result = await addOperator(opModal.branchId, opName, opPin, opRole);
    if (result.error) {
      showToast(result.error, "error");
    } else {
      showToast("Operator added.", "success");
      setOpModal(null);
      setOpName("");
      setOpPin("");
      setOpRole("cashier");
      window.location.reload();
    }
  }

  return (
    <>
      {/* Header / identity */}
      <div className="bg-surface-base border border-outline-variant rounded p-6 mb-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-3">
              <h2 className="font-headline-md text-headline-md text-ink-deep">{acct.name}</h2>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-label-md capitalize ${
                acct.type === "pharmacy" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
              }`}>
                {acct.type}
              </span>
              {acct.verified && (
                <span className="inline-flex items-center gap-1 text-xs font-label-md text-secondary">
                  <span className="material-symbols-outlined text-[14px]">verified</span> Verified
                </span>
              )}
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Created {formatDate(acct.created_at)}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-label-md ${SUB_STATUS_COLORS[acct.subscription_status ?? ""] ?? "bg-surface-container text-on-surface-variant"}`}>
                {acct.subscription_status ?? "no subscription"}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-label-md ${
                acct.billing_status === "active" ? "bg-secondary/10 text-secondary" : "bg-error-container text-error"
              }`}>
                billing: {acct.billing_status}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-label-md ${
                acct.download_enabled ? "bg-secondary/10 text-secondary" : "bg-surface-container text-on-surface-variant"
              }`}>
                download: {acct.download_enabled ? "enabled" : "disabled"}
              </span>
              {acct.suspended_at && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-label-md bg-error-container text-error">
                  <span className="material-symbols-outlined text-[12px]">block</span> suspended
                </span>
              )}
            </div>
          </div>

          {/* Suspension control */}
          <div className="w-full md:w-72 border border-outline-variant/40 rounded p-4">
            {acct.suspended_at ? (
              <>
                <p className="font-label-md text-label-md text-error mb-1">Suspended</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-3">
                  {acct.suspension_reason || "No reason recorded"} — {formatDate(acct.suspended_at)}
                </p>
                <button
                  onClick={() => {
                    setConfirmText("");
                    setConfirmModal({
                      title: "Reinstate account",
                      message: `This will reinstate "${acct.name}" and restore access for all branches.`,
                      requiredWord: "UNLOCK",
                      action: () => unsuspendAccount(acct.id),
                      success: "Account reinstated.",
                    });
                  }}
                  disabled={busy === "unsuspend"}
                  className="w-full px-4 py-2 bg-secondary text-on-secondary font-label-md text-label-md disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {busy === "unsuspend" ? <Spinner /> : <span className="material-symbols-outlined text-[16px]">lock_open</span>}
                  Reinstate account
                </button>
              </>
            ) : (
              <>
                <p className="font-label-md text-label-md text-on-surface mb-1">Suspend account</p>
                <textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Reason (blocks sign-in + desktop sync)"
                  rows={2}
                  className="w-full text-sm border border-outline-variant bg-surface-container-low px-3 py-2 focus:outline-none focus:border-primary mb-2"
                />
                <button
                  onClick={handleSuspend}
                  disabled={busy === "suspend"}
                  className="w-full px-4 py-2 bg-error text-on-error font-label-md text-label-md disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {busy === "suspend" ? <Spinner /> : <span className="material-symbols-outlined text-[16px]">block</span>}
                  Suspend account
                </button>
              </>
            )}
          </div>

          {/* Supplier Controls — subscription, download, verified */}
          {acct.type === "supplier" && (
            <div className="w-full md:w-72 border border-outline-variant/40 rounded p-4">
              <p className="font-label-md text-label-md text-on-surface mb-3">Supplier Controls</p>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">Subscription Status</span>
                  <select
                    value={acct.subscription_status ?? "trial"}
                    onChange={async (e) => {
                      await run("sub-status", () => updateAccountProfile(acct.id, { subscription_status: e.target.value }), `Status → ${e.target.value}`);
                    }}
                    disabled={busy !== null}
                    className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-60"
                  >
                    {["trial", "active", "payment_due", "grace", "locked"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">Desktop Download</span>
                  <button
                    onClick={async () => {
                      await run("dl-toggle", () => updateAccountProfile(acct.id, { download_enabled: !acct.download_enabled }), acct.download_enabled ? "Download disabled" : "Download enabled");
                    }}
                    disabled={busy !== null}
                    className={`w-11 h-6 rounded-full transition-all flex items-center ${acct.download_enabled ? "bg-secondary justify-end" : "bg-surface-container justify-start"}`}
                    style={{ padding: "2px" }}
                  >
                    <div className="w-5 h-5 rounded-full bg-white shadow-sm transition-all" />
                  </button>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">Verified Badge</span>
                  <button
                    onClick={async () => {
                      await run("verified-toggle", () => updateAccountProfile(acct.id, { verified: !acct.verified }), acct.verified ? "Verified removed" : "Verified granted");
                    }}
                    disabled={busy !== null}
                    className={`w-11 h-6 rounded-full transition-all flex items-center ${acct.verified ? "bg-secondary justify-end" : "bg-surface-container justify-start"}`}
                    style={{ padding: "2px" }}
                  >
                    <div className="w-5 h-5 rounded-full bg-white shadow-sm transition-all" />
                  </button>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Profile */}
        <div className="lg:col-span-1 bg-surface-base border border-outline-variant rounded p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Profile</p>
            {!editOpen && (
              <button
                onClick={() => setEditOpen(true)}
                className="text-primary font-label-md text-label-md text-sm hover:underline"
              >
                Edit
              </button>
            )}
          </div>

          {editOpen ? (
            <div className="flex flex-col gap-3">
              {[
                { label: "Contact name", key: "contact_name" as const },
                { label: "Phone", key: "phone" as const },
                { label: "Region", key: "region" as const },
                { label: "Role", key: "role" as const },
                { label: "Tech comfort", key: "tech_comfort" as const },
              ].map((f) => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">
                    {f.label}
                  </span>
                  <input
                    value={form[f.key]}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                <span className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">
                  Goals (comma separated)
                </span>
                <input
                  value={form.goals}
                  onChange={(e) => setForm((p) => ({ ...p, goals: e.target.value }))}
                  className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </label>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleSaveProfile}
                  disabled={busy === "save-profile"}
                  className="flex-1 px-4 py-2 bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
                >
                  {busy === "save-profile" ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditOpen(false)}
                  className="px-4 py-2 border border-outline-variant text-on-surface-variant font-label-md text-label-md"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <dl className="flex flex-col gap-2.5">
              {[
                ["Contact", profile?.contact_name],
                ["Phone", profile?.phone],
                ["Region", profile?.region],
                ["Role", profile?.role],
                ["Tech comfort", profile?.tech_comfort],
                ["Onboarding", profile?.onboarding_completed_at ? formatDate(profile.onboarding_completed_at) : "not completed"],
                ["Last active", profile?.last_active_at ? formatDate(profile.last_active_at) : "never"],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4">
                  <dt className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider shrink-0">
                    {label}
                  </dt>
                  <dd className="font-body-sm text-body-sm text-on-surface text-right">
                    {value || "—"}
                  </dd>
                </div>
              ))}
              {profile?.goals && profile.goals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {profile.goals.map((g) => (
                    <span key={g} className="text-xs px-2 py-0.5 bg-secondary/10 text-secondary rounded-full font-label-md">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </dl>
          )}
        </div>

        {/* Sales + tickets summary */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-base border border-outline-variant rounded p-5">
              <p className="font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">Total sales</p>
              <p className="font-headline-md text-headline-md text-ink-deep mt-1">{detail.sales.count.toLocaleString()}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded p-5">
              <p className="font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">Revenue</p>
              <p className="font-headline-md text-headline-md text-ink-deep mt-1">
                TZS {Math.round(detail.sales.revenue).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Support tickets */}
          <div className="bg-surface-base border border-outline-variant rounded p-6">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-4">
              Support tickets ({detail.tickets.length})
            </p>
            {detail.tickets.length === 0 ? (
              <p className="font-body-md text-on-surface-variant">No tickets.</p>
            ) : (
              <ul className="divide-y divide-outline-variant/30">
                {detail.tickets.slice(0, 5).map((t) => (
                  <li key={t.id} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-body-md text-body-md text-ink-deep truncate">{t.subject}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {t.category} · {formatDate(t.created_at)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-label-md ${
                      TICKET_STATUS_COLORS[t.status] ?? "bg-surface-container text-on-surface-variant"
                    }`}>
                      {t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Supplier orders */}
          {detail.orders.length > 0 && (
            <div className="bg-surface-base border border-outline-variant rounded p-6">
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-4">
                Supplier orders ({detail.orders.length})
              </p>
              <ul className="divide-y divide-outline-variant/30">
                {detail.orders.map((o) => (
                  <li key={o.id} className="py-3 flex items-center gap-3">
                    <span className="font-mono text-sm text-ink-deep">{o.order_reference}</span>
                    <span className="flex-1 text-sm text-on-surface-variant">{formatDate(o.placed_at)}</span>
                    <span className="text-sm font-medium text-ink-deep">
                      {o.amount != null ? `TZS ${Math.round(o.amount).toLocaleString()}` : "—"}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-label-md capitalize ${
                      o.status === "delivered" ? "bg-secondary/10 text-secondary" :
                      o.status === "cancelled" ? "bg-error-container text-error" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {o.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Branches */}
      <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-3">
        Branches ({detail.branches.length})
      </p>
      {detail.branches.length === 0 ? (
        <div className="bg-surface-base border border-outline-variant rounded p-8 text-center mb-8">
          <p className="font-body-md text-on-surface-variant">No branches for this account.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 mb-8">
          {detail.branches.map((b) => {
            const locked = b.subscription_status === "locked";
            return (
              <div key={b.id} className="bg-surface-base border border-outline-variant rounded overflow-hidden">
                <div className="px-6 py-4 border-b border-outline-variant/40 flex flex-wrap items-center gap-3">
                  <h3 className="font-headline-sm text-headline-sm text-ink-deep flex-1 min-w-[160px]">{b.name}</h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-label-md ${
                    SUB_STATUS_COLORS[b.subscription_status] ?? "bg-surface-container text-on-surface-variant"
                  }`}>
                    {b.subscription_status}
                  </span>
                  {b.locked_manually_at && (
                    <span className="text-xs text-error font-label-md inline-flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">lock</span> manual lock
                    </span>
                  )}
                  <span className="text-xs text-on-surface-variant">
                    {b.installCount} install{b.installCount === 1 ? "" : "s"} · last sync {formatDate(b.last_synced_at)}
                  </span>
                </div>

                <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Subscription stamps */}
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-1">
                      Subscription
                    </p>
                    <span className="text-on-surface">Trial ends: <span className="font-mono text-xs">{formatDate(b.trial_ends_at)}</span></span>
                    <span className="text-on-surface">Payment due: <span className="font-mono text-xs">{formatDate(b.payment_due_at)}</span></span>
                    <span className="text-on-surface">Grace ends: <span className="font-mono text-xs">{formatDate(b.grace_ends_at)}</span></span>
                    {b.unlock_requested_at && (
                      <span className="text-amber-700">Unlock requested: <span className="font-mono text-xs">{formatDate(b.unlock_requested_at)}</span></span>
                    )}
                    {b.manually_unlocked_at && (
                      <span className="text-secondary">Manual unlock: <span className="font-mono text-xs">{formatDate(b.manually_unlocked_at)}</span></span>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex flex-col gap-2 md:col-span-1">
                    <p className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">Controls</p>
                    {locked ? (
                      <button
                        onClick={() => {
                          setConfirmText("");
                          setConfirmModal({
                            title: "Unlock branch",
                            message: `This will reset branch "${b.name}" to active and restore access for all users.`,
                            requiredWord: "UNLOCK",
                            action: () => resetBranchSubscription(b.id),
                            success: "Branch reset to active.",
                          });
                        }}
                        disabled={busy === `unlock-${b.id}`}
                        className="px-3 py-2 bg-secondary text-on-secondary font-label-md text-label-md text-sm disabled:opacity-60 flex items-center gap-2"
                      >
                        {busy === `unlock-${b.id}` ? <Spinner /> : <span className="material-symbols-outlined text-[14px]">lock_open</span>}
                        Reset to active
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setConfirmText("");
                          setConfirmModal({
                            title: "Lock branch",
                            message: `This will lock branch "${b.name}" and prevent all access until manually unlocked.`,
                            requiredWord: "CONFIRM",
                            action: () => lockBranch(b.id),
                            success: "Branch locked.",
                          });
                        }}
                        disabled={busy === `lock-${b.id}`}
                        className="px-3 py-2 border border-error text-error font-label-md text-label-md text-sm disabled:opacity-60 flex items-center gap-2"
                      >
                        {busy === `lock-${b.id}` ? <Spinner /> : <span className="material-symbols-outlined text-[14px]">lock</span>}
                        Lock branch
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setConfirmText("");
                        setConfirmModal({
                          title: "Extend trial",
                          message: `This will extend the trial for branch "${b.name}" by 7 days.`,
                          requiredWord: "CONFIRM",
                          action: () => extendBranchTrial(b.id, 7),
                          success: "Trial extended by 7 days.",
                        });
                      }}
                      disabled={busy === `trial-${b.id}`}
                      className="px-3 py-2 border border-outline-variant text-on-surface font-label-md text-label-md text-sm disabled:opacity-60"
                    >
                      {busy === `trial-${b.id}` ? "Extending…" : "Extend trial +7 days"}
                    </button>
                  </div>

                  {/* Operators */}
                  <div className="md:col-span-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">
                        Operators ({b.operators.length})
                      </p>
                      <button
                        onClick={() => setOpModal({ branchId: b.id, branchName: b.name })}
                        className="text-primary font-label-md text-label-md text-sm hover:underline"
                      >
                        + Add
                      </button>
                    </div>
                    {b.operators.length === 0 ? (
                      <p className="text-sm text-on-surface-variant">No operators.</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {b.operators.map((o) => (
                          <li key={o.id} className="flex items-center gap-2 text-sm">
                            <span className="flex-1 min-w-0 truncate text-on-surface">{o.name}</span>
                            <select
                              value={o.role}
                              onChange={(e) => run(`role-${o.id}`, () => setOperatorRole(o.id, e.target.value), "Role updated.")}
                              disabled={busy === `role-${o.id}`}
                              className="text-xs border border-outline-variant bg-surface-container-low px-1 py-0.5"
                            >
                              {OPERATOR_ROLES.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                setConfirmText("");
                                setConfirmModal({
                                  title: "Remove operator",
                                  message: `This will remove operator "${o.name}" from branch "${b.name}".`,
                                  requiredWord: "CONFIRM",
                                  action: () => removeOperator(o.id),
                                  success: "Operator removed.",
                                });
                              }}
                              disabled={busy === `delop-${o.id}`}
                              title="Remove operator"
                              className="text-error hover:opacity-70 disabled:opacity-40"
                            >
                              <span className="material-symbols-outlined text-[14px]">person_remove</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent activity */}
      {detail.recentActivity.length > 0 && (
        <>
          <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-3">
            Recent activity
          </p>
          <div className="bg-surface-base border border-outline-variant rounded overflow-hidden mb-8">
            <ul className="divide-y divide-outline-variant/30">
              {detail.recentActivity.map((a) => (
                <li key={a.id} className="px-6 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-body-md text-body-md text-ink-deep">{a.action}</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {a.branchName} · by {a.actor}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-on-surface-variant">{formatDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Add operator modal */}
      {opModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-surface-base border border-outline-variant p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline-sm text-headline-sm text-ink-deep">Add operator</h3>
              <button onClick={() => setOpModal(null)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">Branch: {opModal.branchName}</p>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">Name</span>
                <input
                  value={opName}
                  onChange={(e) => setOpName(e.target.value)}
                  className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">PIN (4-8 digits)</span>
                <input
                  value={opPin}
                  onChange={(e) => setOpPin(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">Role</span>
                <select
                  value={opRole}
                  onChange={(e) => setOpRole(e.target.value)}
                  className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  {OPERATOR_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={handleAddOperator}
                disabled={busy === "add-op"}
                className="mt-1 px-4 py-2 bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
              >
                {busy === "add-op" ? "Adding…" : "Add operator"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-surface-base border border-outline-variant p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline-sm text-headline-sm text-ink-deep">{confirmModal.title}</h3>
              <button onClick={() => { setConfirmModal(null); setConfirmText(""); }} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">{confirmModal.message}</p>
            <label className="flex flex-col gap-1 mb-4">
              <span className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider">
                Type <span className="font-bold text-error">{confirmModal.requiredWord}</span> to proceed
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
                className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={confirmText !== confirmModal.requiredWord || busy !== null}
                className="flex-1 px-4 py-2 bg-error text-on-error font-label-md text-label-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy !== null ? "Processing…" : "Confirm"}
              </button>
              <button
                onClick={() => { setConfirmModal(null); setConfirmText(""); }}
                className="px-4 py-2 border border-outline-variant text-on-surface-variant font-label-md text-label-md"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />;
}
