"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/context";

export default function RecoveryForm() {
  const { t } = useI18n();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const urlError = searchParams.get("error");

    let cancelled = false;
    let timeoutError: string | null = null;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setChecking(false);
        setExchanging(false);
        setError(timeoutError || urlError || t("auth.confirm.expired"));
      }
    }, 10000);

    (async () => {
      if (!code && !tokenHash) {
        // No valid link — show the expired/invalid message instead of spinning
        if (!cancelled) {
          setError(urlError ? `error: ${urlError}` : t("auth.confirm.expired"));
          setChecking(false);
        }
        clearTimeout(timeout);
        return;
      }

      if (code) {
        setExchanging(true);
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
        if (codeError) {
          if (!cancelled) { setError(codeError.message); setChecking(false); setExchanging(false); }
          clearTimeout(timeout);
          return;
        }
      } else if (tokenHash) {
        setExchanging(true);
        const { error: hashError } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        if (hashError) {
          if (!cancelled) { setError(hashError.message); setChecking(false); setExchanging(false); }
          clearTimeout(timeout);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setHasSession(!!data.session);
        setChecking(false);
        setExchanging(false);
      }
      clearTimeout(timeout);
    })();

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [searchParams, supabase, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (newPassword.length < 8) {
        setError(t("auth.recover.short"));
        return;
      }
      if (newPassword !== confirmPassword) {
        setError(t("auth.recover.mismatch"));
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setDone(true);
      setTimeout(() => {
        window.location.href = "/auth";
      }, 2500);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full h-12 px-4 bg-surface-base/60 border border-ink-deep/20 rounded-none text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50";

  return (
    <div className="min-h-screen flex flex-col font-body-md relative overflow-hidden bg-surface">
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-8 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[28px]">local_pharmacy</span>
          <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">Cervos</span>
        </Link>
      </header>

      <main className="flex-grow flex items-center justify-center p-4 relative z-10 pt-24 pb-16">
        <div className="w-full max-w-[440px] relative">
          <div className="hud-panel absolute inset-0" />
          <div className="hud-border" />
          <div className="relative z-10 p-8 md:p-10">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[26px] text-primary">key</span>
              </div>
              <h1 className="font-headline-md text-headline-md text-ink-deep mb-1">{t("auth.recover.title")}</h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{t("auth.recover.body")}</p>
            </div>

            {checking || exchanging ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : done ? (
              <div className="text-center py-4">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[22px] text-green-600">check_circle</span>
                  <p className="font-body-md text-body-md text-on-surface-variant">{t("auth.recover.updated")}</p>
                </div>
              </div>
            ) : !hasSession ? (
              <div className="text-center py-4">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[22px] text-error">error</span>
                  <h2 className="font-headline-md text-headline-md text-ink-deep">{t("auth.reset.title")}</h2>
                </div>
                <p className="font-body-sm text-body-sm text-error mb-6">
                  {error || t("auth.confirm.expired")}
                </p>
                <Link
                  href="/auth"
                  className="inline-flex items-center justify-center w-full h-12 bg-primary text-on-primary rounded-none font-label-md font-bold hover:bg-primary/90 transition-all"
                >
                  {t("auth.back_to_signin")}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setError(null); }}
                  placeholder={t("auth.recover.new")}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className={inputCls}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
                  placeholder={t("auth.recover.confirm")}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className={inputCls}
                />
                {error && (
                  <p className="text-error font-body-sm text-body-sm flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full h-12 bg-primary text-on-primary rounded-none font-label-md font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {saving ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    t("auth.recover.submit")
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
