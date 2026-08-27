"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import type { Operator } from "@/lib/actions/operators";
import type { Branch } from "@/lib/actions/branches";

interface OperatorsTableProps {
  operators: Operator[];
  branches: Branch[];
}

type OperatorForm = {
  name: string;
  pin: string;
  role: "admin" | "operator";
  branch_id: string;
};

type ModalState = {
  mode: "add" | "edit" | "reset" | null;
  operator: Operator | null;
};

const EMPTY_FORM: OperatorForm = { name: "", pin: "", role: "operator", branch_id: "" };

export default function OperatorsTable({ operators, branches }: OperatorsTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [modal, setModal] = useState<ModalState>({ mode: null, operator: null });
  const [form, setForm] = useState<OperatorForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = operators.filter((op) => {
    const matchSearch =
      op.name.toLowerCase().includes(search.toLowerCase()) ||
      (op.branch_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || op.role === roleFilter;
    return matchSearch && matchRole;
  });

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, branch_id: branches[0]?.id ?? "" });
    setError(null);
    setModal({ mode: "add", operator: null });
  };

  const openEdit = (op: Operator) => {
    setForm({ name: op.name, pin: "", role: op.role, branch_id: op.branch_id });
    setError(null);
    setModal({ mode: "edit", operator: op });
  };

  const openReset = (op: Operator) => {
    setForm({ name: op.name, pin: "", role: op.role, branch_id: op.branch_id });
    setError(null);
    setModal({ mode: "reset", operator: op });
  };

  const closeModal = () => {
    setModal({ mode: null, operator: null });
    setForm(EMPTY_FORM);
    setError(null);
  };

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (modal.mode === "add") {
      const res = await fetch("/api/actions/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...form }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }
    } else if (modal.mode === "edit" && modal.operator) {
      const updates: Record<string, unknown> = {
        name: form.name,
        role: form.role,
        branch_id: form.branch_id,
      };
      const res = await fetch("/api/actions/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: modal.operator.id, updates }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }
    } else if (modal.mode === "reset" && modal.operator) {
      if (!form.pin || !/^\d{4,8}$/.test(form.pin)) {
        setError("PIN must be 4-8 digits.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/actions/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetPin", id: modal.operator.id, newPin: form.pin }),
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
    if (!confirm("Delete this operator?")) return;
    const res = await fetch("/api/actions/operators", {
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

  const statusColor = (role: string) =>
    role === "admin" ? "bg-primary/10 text-primary" : "bg-surface-container text-on-surface-variant";

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder={t("dash.operators.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2.5 bg-surface-base border border-outline-variant rounded text-sm focus:outline-none focus:border-primary w-64"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2.5 bg-surface-base border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">{t("dash.operators.allRoles")}</option>
            <option value="admin">{t("dash.operators.admin")}</option>
            <option value="operator">{t("dash.operators.operator")}</option>
          </select>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded hover:opacity-90 transition-colors text-sm font-label-md"
        >
          <span className="material-symbols-outlined text-[16px]">person_add</span>
          {t("dash.operators.add")}
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
                {t("dash.operators.name")}
              </th>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.operators.role")}
              </th>
              <th className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.operators.branch")}
              </th>
              <th className="text-right px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                {t("dash.operators.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-on-surface-variant text-sm">
                  {t("dash.operators.noOperators")}
                </td>
              </tr>
            ) : (
              filtered.map((op) => (
                <tr key={op.id} className="hover:bg-surface-container-low/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[16px] text-primary">person</span>
                      </div>
                      <span className="font-body-md text-body-md text-ink-deep">{op.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-label-md ${statusColor(op.role)}`}>
                      {op.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant">
                    {op.branch_name ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(op)}
                        className="p-2 hover:bg-surface-container rounded transition-colors"
                        title={t("dash.operators.edit")}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
                      </button>
                      <button
                        onClick={() => openReset(op)}
                        className="p-2 hover:bg-surface-container rounded transition-colors"
                        title={t("dash.operators.resetPin")}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">pin</span>
                      </button>
                      <button
                        onClick={() => handleDelete(op.id)}
                        className="p-2 hover:bg-error-container rounded transition-colors"
                        title={t("dash.operators.delete")}
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
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-surface-base rounded-lg border border-outline-variant w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-headline-md text-headline-md text-ink-deep mb-6">
              {modal.mode === "add" && t("dash.operators.addTitle")}
              {modal.mode === "edit" && t("dash.operators.editTitle")}
              {modal.mode === "reset" && t("dash.operators.resetPinTitle")}
            </h2>

            <div className="flex flex-col gap-4">
              {modal.mode !== "reset" && (
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">
                    {t("dash.operators.name")}
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {modal.mode === "add" && (
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">
                    {t("dash.operators.pin")}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                    placeholder="4-8 digits"
                    className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {modal.mode === "reset" && (
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">
                    {t("dash.operators.newPin")}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                    placeholder="4-8 digits"
                    className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {modal.mode !== "reset" && (
                <>
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">
                      {t("dash.operators.role")}
                    </label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "operator" })}
                      className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="operator">{t("dash.operators.operator")}</option>
                      <option value="admin">{t("dash.operators.admin")}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">
                      {t("dash.operators.branch")}
                    </label>
                    <select
                      value={form.branch_id}
                      onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                      className="w-full px-4 py-2.5 bg-surface border border-outline-variant rounded text-sm focus:outline-none focus:border-primary"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
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
                disabled={loading}
                className="px-4 py-2.5 bg-primary text-on-primary rounded hover:opacity-90 transition-colors text-sm font-label-md disabled:opacity-50"
              >
                {loading ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
