"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordForm() {
  const { t } = useI18n();
  const supabase = createClient();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearFeedback() {
    setSuccess(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setSuccess(false);
    setError(null);

    if (newPassword.length < 8) {
      setError(t("pw.error.minlength"));
      setSaving(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("pw.error.mismatch"));
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(false), 4000);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block font-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">
          {t("pw.current")}
        </label>
        <input
          type="password"
          value={currentPassword}
          onChange={e => { setCurrentPassword(e.target.value); clearFeedback(); }}
          autoComplete="current-password"
          className="w-full max-w-sm px-3 py-2 text-sm border border-outline-variant rounded-md bg-surface text-ink-deep placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </div>

      <div>
        <label className="block font-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">
          {t("pw.new")}
        </label>
        <input
          type="password"
          value={newPassword}
          onChange={e => { setNewPassword(e.target.value); clearFeedback(); }}
          autoComplete="new-password"
          className="w-full max-w-sm px-3 py-2 text-sm border border-outline-variant rounded-md bg-surface text-ink-deep placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </div>

      <div>
        <label className="block font-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">
          {t("pw.confirm")}
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={e => { setConfirmPassword(e.target.value); clearFeedback(); }}
          autoComplete="new-password"
          className="w-full max-w-sm px-3 py-2 text-sm border border-outline-variant rounded-md bg-surface text-ink-deep placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving && (
            <span className="inline-block w-4 h-4 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
          )}
          {saving ? t("pw.saving") : t("pw.save")}
        </button>

        {success && (
          <div className="flex items-center gap-1.5 text-sm text-green-700">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            {t("pw.saved")}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-sm text-error">
            <span className="material-symbols-outlined text-[16px]">error</span>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
