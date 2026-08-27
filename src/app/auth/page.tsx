"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/Toast";
import { useI18n } from "@/lib/i18n/context";

type Tab = "signin" | "signup" | "reset";
type AccountType = "pharmacy" | "supplier";

function RedirectLoader({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[200] bg-surface-base/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">{message}</p>
    </div>
  );
}

function ConfirmScreen({ email, onBack, t }: { email: string; onBack: () => void; t: (k: string) => string }) {
  return (
    <div className="flex flex-col items-center text-center py-4">
      <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-[32px] text-secondary">mark_email_read</span>
      </div>
      <h2 className="font-headline-md text-headline-md text-ink-deep mb-2">{t("auth.confirm.title")}</h2>
      <p className="font-body-md text-body-md text-on-surface-variant mb-1">{t("auth.confirm.body")}</p>
      <p className="font-body-md text-body-md text-primary font-semibold mb-6 break-all">{email}</p>
      <p className="font-body-sm text-body-sm text-on-surface-variant mb-8 max-w-xs">{t("auth.confirm.note")}</p>
      <button onClick={onBack} className="font-label-md text-label-md text-primary hover:underline flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        {t("auth.back_to_signin")}
      </button>
    </div>
  );
}

function InviteBanner({ companyName, t }: { companyName: string; t: (k: string) => string }) {
  return (
    <div className="bg-secondary/10 border border-secondary/20 p-4 mb-6 rounded">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[18px] text-secondary">mail</span>
        <span className="font-label-md text-label-md text-secondary font-medium">{t("auth.invite.title")}</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {t("auth.invite.body").replace("{company}", companyName)}
      </p>
    </div>
  );
}

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, setLang, t } = useI18n();

  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "signup" ? "signup" : "signin");
  const [accountType, setAccountType] = useState<AccountType>(
    searchParams.get("type") === "supplier" ? "supplier" : "pharmacy"
  );
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null);

  const inviteToken = searchParams.get("invite_token");
  const [inviteData, setInviteData] = useState<{ companyName: string; token: string } | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);

  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siShowPw, setSiShowPw] = useState(false);

  const [suFullName, setSuFullName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suEntity, setSuEntity] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suShowPw, setSuShowPw] = useState(false);

  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    if (inviteToken) {
      fetchInviteDetails(inviteToken);
    }
  }, [inviteToken]);

  async function fetchInviteDetails(token: string) {
    setLoadingInvite(true);
    try {
      const res = await fetch(`/api/invite/lookup?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.error) {
        setToast({ message: data.error, type: "error" });
      } else if (data.data) {
        setInviteData({ companyName: data.data.companyName, token });
        setAccountType("supplier");
        setTab("signup");
      }
      } catch {
        setToast({ message: t("auth.fetch_error"), type: "error" });
      } finally {
      setLoadingInvite(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("error") === "confirmation_failed") {
      setToast({ message: t("auth.confirm.expired"), type: "error" });
    }
  }, [searchParams, t]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email: siEmail, password: siPassword });
      if (error) { setToast({ message: error.message, type: "error" }); return; }
      setRedirecting(true);
      const next = searchParams.get("next");
      const acctType = data.user?.user_metadata?.account_type ?? "pharmacy";
      router.replace(next ?? (acctType === "supplier" ? "/supplier" : "/dashboard"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: suEmail,
        password: suPassword,
        options: {
          data: {
            full_name: suFullName,
            phone: suPhone,
            account_type: accountType,
            entity_name: inviteData?.companyName || suEntity,
            invite_token: inviteData?.token || null,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          email_confirm: true,
        } as any,
      });
      if (error) { setToast({ message: error.message, type: "error" }); return; }
      if (data.user && !data.session) { setConfirmEmail(suEmail); return; }
      setRedirecting(true);
      router.replace(accountType === "supplier" ? "/supplier" : "/dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      });
      if (error) { setToast({ message: error.message, type: "error" }); return; }
      setToast({ message: t("auth.reset.sent"), type: "success" });
      setResetEmail("");
      setTimeout(() => setTab("signin"), 3500);
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full h-12 px-4 bg-surface-base/60 border border-ink-deep/20 rounded-none text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50";
  const btnCls = "w-full h-12 bg-primary text-on-primary rounded-none font-label-md font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all gaming-snap disabled:opacity-60";

  return (
    <div className="min-h-screen flex flex-col font-body-md relative overflow-hidden">
      {redirecting && <RedirectLoader message={t("common.loading")} />}

      <div className="fixed inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: "url('/pharmacist-1.png')", filter: "blur(10px)", transform: "scale(1.1)" }} />
      <div className="fixed inset-0 z-0 bg-surface/80" />

      <div className="fixed bottom-[-8%] left-[-8%] w-[500px] h-[500px] opacity-[0.06] pointer-events-none z-0">
        <Image src="/logo.png" alt="" fill sizes="500px" className="object-contain" style={{ mixBlendMode: "multiply" }} />
      </div>

      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-8 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 relative">
            <Image src="/logo.png" alt="Cervos" fill sizes="32px" className="object-contain" style={{ mixBlendMode: "multiply" }} />
          </div>
          <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">Cervos</span>
        </Link>
        <div className="flex bg-surface-base/70 backdrop-blur-sm rounded border border-ink-deep/10 p-0.5">
          {(["EN", "SW"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={`px-3 py-1 text-xs font-label-md rounded transition-colors ${lang === l ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-primary"}`}>{l}</button>
          ))}
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center lg:justify-end lg:pr-24 p-4 relative z-10 pt-24 pb-16">
        <div className="relative w-full max-w-[460px]">
          <div className="hud-panel absolute inset-0" />
          <div className="hud-border" />
          <div className="hud-notch-line" />

          <div className="relative z-10 p-8 md:p-10">
            {loadingInvite ? (
              <div className="flex flex-col items-center py-12">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                <p className="font-body-sm text-on-surface-variant">{t("auth.validating_invite")}</p>
              </div>
            ) : confirmEmail ? (
              <ConfirmScreen email={confirmEmail} onBack={() => { setConfirmEmail(null); setTab("signin"); }} t={t} />
            ) : (
              <>
                <div className="flex mb-8 border-b border-ink-deep/10">
                  {([["signin", t("auth.signin")], ["signup", t("auth.signup")]] as [Tab, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)} className={`flex-1 pb-3 font-bold text-base transition-all border-b-2 ${tab === key ? "text-primary border-primary" : "text-on-surface-variant border-transparent hover:text-primary"}`}>{label}</button>
                  ))}
                </div>

                {tab === "signin" && (
                  <form onSubmit={handleSignIn} className="flex flex-col gap-4">
                    <input type="email" value={siEmail} onChange={e => setSiEmail(e.target.value)} placeholder={t("auth.email")} required className={inputCls} />
                    <div className="relative">
                      <input type={siShowPw ? "text" : "password"} value={siPassword} onChange={e => setSiPassword(e.target.value)} placeholder={t("auth.password")} required className={inputCls + " pr-12"} />
                      <button type="button" onClick={() => setSiShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface">
                        <span className="material-symbols-outlined text-[20px]">{siShowPw ? "visibility_off" : "visibility"}</span>
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => setTab("reset")} className="font-label-md text-label-md text-primary hover:underline">{t("auth.forgot")}</button>
                    </div>
                    <button type="submit" disabled={loading} className={btnCls + " mt-1"}>
                      {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t("auth.signin")} <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>}
                    </button>
                    <p className="text-center font-body-sm text-body-sm text-on-surface-variant">
                      {t("auth.noaccount")}{" "}
                      <button type="button" onClick={() => setTab("signup")} className="text-primary hover:underline font-semibold">{t("auth.signup")}</button>
                    </p>
                  </form>
                )}

                {tab === "signup" && (
                  <form onSubmit={handleSignUp} className="flex flex-col gap-3">
                    {inviteData && <InviteBanner companyName={inviteData.companyName} t={t} />}
                    <div className="flex gap-2">
                      {(["pharmacy", "supplier"] as AccountType[]).map(type => (
                        <button key={type} type="button" onClick={() => setAccountType(type)} className={`flex-1 py-2.5 font-label-md text-label-md rounded flex items-center justify-center gap-2 transition-all ${accountType === type ? "bg-primary text-on-primary" : "border border-ink-deep/20 text-on-surface-variant hover:border-primary hover:text-primary"}`} disabled={!!inviteData}>
                          <span className="material-symbols-outlined text-[15px]">{type === "pharmacy" ? "local_pharmacy" : "local_shipping"}</span>
                          {type === "pharmacy" ? t("auth.pharmacy") : t("auth.supplier")}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={suFullName} onChange={e => setSuFullName(e.target.value)} placeholder={t("auth.fullname")} required className={inputCls} />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="email" value={suEmail} onChange={e => setSuEmail(e.target.value)} placeholder={t("auth.email")} required className={inputCls} />
                      <input type="tel" value={suPhone} onChange={e => setSuPhone(e.target.value)} placeholder={t("auth.phone")} className={inputCls} />
                    </div>
                    <input
                      type="text"
                      value={inviteData?.companyName || suEntity}
                      onChange={e => setSuEntity(e.target.value)}
                      placeholder={accountType === "pharmacy" ? t("auth.pharmacyname") : t("auth.companyname")}
                      required
                      className={inputCls}
                      disabled={!!inviteData}
                    />
                    <div className="relative">
                      <input type={suShowPw ? "text" : "password"} value={suPassword} onChange={e => setSuPassword(e.target.value)} placeholder={t("auth.createpw")} required minLength={8} className={inputCls + " pr-12"} />
                      <button type="button" onClick={() => setSuShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface">
                        <span className="material-symbols-outlined text-[20px]">{suShowPw ? "visibility_off" : "visibility"}</span>
                      </button>
                    </div>
                    {suPassword && (
                      <div className="flex gap-1 -mt-1">
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${suPassword.length >= (i + 1) * 3 ? suPassword.length >= 12 ? "bg-secondary" : suPassword.length >= 8 ? "bg-amber-400" : "bg-error" : "bg-outline-variant/30"}`} />
                        ))}
                      </div>
                    )}
                    <button type="submit" disabled={loading} className={btnCls}>
                      {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t("auth.createaccount")} <span className="material-symbols-outlined text-[18px]">domain_add</span></>}
                    </button>
                    <p className="text-center font-body-sm text-body-sm text-on-surface-variant">
                      {t("auth.haveaccount")}{" "}
                      <button type="button" onClick={() => setTab("signin")} className="text-primary hover:underline font-semibold">{t("auth.signin")}</button>
                    </p>
                  </form>
                )}

                {tab === "reset" && (
                  <form onSubmit={handlePasswordReset} className="flex flex-col gap-4">
                    <div className="text-center mb-2">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-[24px] text-primary">lock_reset</span>
                      </div>
                      <h2 className="font-headline-md text-headline-md text-ink-deep mb-1">{t("auth.reset.title")}</h2>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{t("auth.reset.body")}</p>
                    </div>
                    <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder={t("auth.email")} required className={inputCls} />
                    <button type="submit" disabled={loading} className={btnCls}>
                      {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t("auth.reset.send_link")} <span className="material-symbols-outlined text-[18px]">send</span></>}
                    </button>
                    <button type="button" onClick={() => setTab("signin")} className="text-center font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span> {t("auth.back_to_signin")}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="w-full py-5 px-8 flex flex-col md:flex-row justify-between items-center gap-3 font-label-md text-label-md text-on-surface-variant relative z-10 border-t border-ink-deep/10 bg-surface-base/30 backdrop-blur-sm">
        <p>© {new Date().getFullYear()} Cervos · hq@cervos.online</p>
        <div className="flex gap-6">
          <Link href="/terms" className="hover:text-primary transition-colors">{t("auth.terms")}</Link>
          <Link href="/privacy" className="hover:text-primary transition-colors">{t("auth.privacy")}</Link>
          <Link href="/support" className="hover:text-primary transition-colors">{t("auth.support_link")}</Link>
        </div>
      </footer>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <AuthForm />
    </Suspense>
  );
}
