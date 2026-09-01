/**
 * @file components/PaymentSettingsForm.tsx
 * @description Shared client component for payment method configuration.
 *
 * Used by both the pharmacy (/dashboard/settings) and supplier (/supplier/settings) portals.
 * Parameterised by `accountType`:
 *   - "pharmacy" — shows POS accepted-method toggles (cash default, mobile money, card,
 *     bank transfer, invoice/credit) plus mobile money number fields and bank details.
 *   - "supplier" — shows receiving-method toggles (mobile money disbursement, bank for
 *     invoices) without the cash/card POS section.
 * Both account types show the Payme Africa marketplace wallet section.
 *
 * Loading state: uses useState(false) per the React 18 quirk documented in memory
 * (startTransition cannot wrap async functions in React 18).
 */
"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { savePaymentSettings, type AcceptedMethod, type PaymentSettings } from "@/lib/actions/payments";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  accountType: "pharmacy" | "supplier";
  accountId: string;
  initial: PaymentSettings | null;
}

// ─── Method definitions ───────────────────────────────────────────────────────

const PHARMACY_METHODS: { value: AcceptedMethod; labelKey: string; descKey: string; icon: string }[] = [
  { value: "cash",          labelKey: "pay.m.cash",          descKey: "pay.m.cash.desc",          icon: "payments" },
  { value: "mobile_money",  labelKey: "pay.m.mobile_money",  descKey: "pay.m.mobile_money.desc",  icon: "smartphone" },
  { value: "card",          labelKey: "pay.m.card",          descKey: "pay.m.card.desc",          icon: "credit_card" },
  { value: "bank_transfer", labelKey: "pay.m.bank_transfer", descKey: "pay.m.bank_transfer.desc", icon: "account_balance" },
  { value: "invoice",       labelKey: "pay.m.invoice",       descKey: "pay.m.invoice.desc",       icon: "receipt_long" },
];

const SUPPLIER_METHODS: { value: AcceptedMethod; labelKey: string; descKey: string; icon: string }[] = [
  { value: "mobile_money",  labelKey: "pay.m.mobile_money_disb", descKey: "pay.m.mobile_money_disb.desc", icon: "smartphone" },
  { value: "bank_transfer", labelKey: "pay.m.bank_transfer",     descKey: "pay.m.bank_transfer.desc",     icon: "account_balance" },
  { value: "invoice",       labelKey: "pay.m.invoice_sup",       descKey: "pay.m.invoice_sup.desc",       icon: "receipt_long" },
];

const MOBILE_PROVIDERS = [
  { key: "mpesa_number"    as const, label: "M-Pesa",      placeholder: "0712 345 678" },
  { key: "tigo_number"     as const, label: "Tigo Pesa",   placeholder: "0652 345 678" },
  { key: "halopesa_number" as const, label: "Halopesa",    placeholder: "0621 345 678" },
  { key: "airtel_number"   as const, label: "Airtel Money", placeholder: "0682 345 678" },
];

// ─── Default initial state ────────────────────────────────────────────────────

function buildDefaults(accountId: string, accountType: "pharmacy" | "supplier", initial: PaymentSettings | null): PaymentSettings {
  if (initial) return initial;
  return {
    account_id:          accountId,
    default_method:      accountType === "pharmacy" ? "cash" : "mobile_money",
    accepted_methods:    accountType === "pharmacy" ? ["cash"] : ["mobile_money"],
    mpesa_number:        null,
    tigo_number:         null,
    halopesa_number:     null,
    airtel_number:       null,
    bank_name:           null,
    bank_account:        null,
    bank_branch:         null,
    payme_wallet_number: null,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentSettingsForm({ accountType, accountId, initial }: Props) {
  const { t } = useI18n();
  const defaults = buildDefaults(accountId, accountType, initial);

  const [acceptedMethods, setAcceptedMethods] = useState<AcceptedMethod[]>(defaults.accepted_methods);
  const [defaultMethod,   setDefaultMethod]   = useState<AcceptedMethod>(defaults.default_method);
  const [mpesa,           setMpesa]           = useState(defaults.mpesa_number ?? "");
  const [tigo,            setTigo]            = useState(defaults.tigo_number ?? "");
  const [halopesa,        setHalopesa]        = useState(defaults.halopesa_number ?? "");
  const [airtel,          setAirtel]          = useState(defaults.airtel_number ?? "");
  const [bankName,        setBankName]        = useState(defaults.bank_name ?? "");
  const [bankAccount,     setBankAccount]     = useState(defaults.bank_account ?? "");
  const [bankBranch,      setBankBranch]      = useState(defaults.bank_branch ?? "");
  const [paymeWallet,     setPaymeWallet]     = useState(defaults.payme_wallet_number ?? "");

  const [saving,          setSaving]          = useState(false);
  const [success,         setSuccess]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const methods = accountType === "pharmacy" ? PHARMACY_METHODS : SUPPLIER_METHODS;
  const hasMobileMoney = acceptedMethods.includes("mobile_money");
  const hasBankTransfer = acceptedMethods.includes("bank_transfer");

  // ── Toggle a method on/off ──────────────────────────────────────────────────
  function toggleMethod(method: AcceptedMethod) {
    setAcceptedMethods(prev => {
      const isOn = prev.includes(method);
      // Cash is always on for pharmacies
      if (accountType === "pharmacy" && method === "cash" && isOn) return prev;
      if (isOn) {
        const next = prev.filter(m => m !== method);
        // If we just removed the default, reset default
        if (defaultMethod === method) {
          setDefaultMethod(next[0] ?? (accountType === "pharmacy" ? "cash" : "mobile_money"));
        }
        return next;
      }
      return [...prev, method];
    });
    setSuccess(false);
    setError(null);
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      const result = await savePaymentSettings({
        default_method:      defaultMethod,
        accepted_methods:    acceptedMethods,
        mpesa_number:        mpesa || null,
        tigo_number:         tigo || null,
        halopesa_number:     halopesa || null,
        airtel_number:       airtel || null,
        bank_name:           bankName || null,
        bank_account:        bankAccount || null,
        bank_branch:         bankBranch || null,
        payme_wallet_number: paymeWallet || null,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 4000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl w-full space-y-8">

      {/* ── Method toggles ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="font-headline-md text-base font-semibold text-ink-deep mb-1">
          {accountType === "pharmacy" ? t("pay.title.accepted") : t("pay.title.receiving")}
        </h2>
        <p className="font-body-md text-sm text-on-surface-variant mb-4">
          {accountType === "pharmacy" ? t("pay.body.accepted") : t("pay.body.receiving")}
        </p>
        <div className="space-y-2">
          {methods.map(m => {
            const isOn = acceptedMethods.includes(m.value);
            const isForced = accountType === "pharmacy" && m.value === "cash" && isOn;
            return (
              <div
                key={m.value}
                className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                  isOn ? "border-primary/40 bg-primary/5" : "border-outline-variant bg-surface"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined text-[20px] ${isOn ? "text-primary" : "text-on-surface-variant"}`}>
                    {m.icon}
                  </span>
                  <div>
                    <p className={`font-body-md text-sm font-medium ${isOn ? "text-ink-deep" : "text-on-surface-variant"}`}>
                      {t(m.labelKey)}
                      {isForced && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider font-label-md text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                          {t("pay.alwayson")}
                        </span>
                      )}
                    </p>
                    <p className="font-body-md text-xs text-on-surface-variant">{t(m.descKey)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isForced}
                  onClick={() => toggleMethod(m.value)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                    isOn ? "bg-primary border-primary" : "bg-outline-variant border-outline-variant"
                  } ${isForced ? "opacity-60 cursor-not-allowed" : ""}`}
                  aria-pressed={isOn}
                  aria-label={`${isOn ? "Disable" : "Enable"} ${t(m.labelKey)}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                      isOn ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Default method selector ─────────────────────────────────────────── */}
      {acceptedMethods.length > 1 && (
        <section>
          <h2 className="font-headline-md text-base font-semibold text-ink-deep mb-1">
            {t("pay.default")}
          </h2>
          <p className="font-body-md text-sm text-on-surface-variant mb-3">
            {accountType === "pharmacy" ? t("pay.default.pharmacy") : t("pay.default.supplier")}
          </p>
          <div className="flex flex-wrap gap-2">
            {acceptedMethods.map(m => {
              const def = methods.find(x => x.value === m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setDefaultMethod(m); setSuccess(false); setError(null); }}
                  className={`px-3 py-1.5 text-sm rounded-full border font-body-md transition-colors ${
                    defaultMethod === m
                      ? "bg-primary text-on-primary border-primary"
                      : "bg-surface text-on-surface-variant border-outline-variant hover:border-primary/50"
                  }`}
                >
                  {def ? t(def.labelKey) : m}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Mobile money numbers ─────────────────────────────────────────────── */}
      {hasMobileMoney && (
        <section>
          <h2 className="font-headline-md text-base font-semibold text-ink-deep mb-1">
            {t("pay.momo.title")}
          </h2>
          <p className="font-body-md text-sm text-on-surface-variant mb-4">
            {accountType === "pharmacy" ? t("pay.momo.pharmacy") : t("pay.momo.supplier")}{" "}
            {t("pay.momo.blank")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MOBILE_PROVIDERS.map(p => {
              const stateMap: Record<typeof p.key, [string, (v: string) => void]> = {
                mpesa_number:    [mpesa,    setMpesa],
                tigo_number:     [tigo,     setTigo],
                halopesa_number: [halopesa, setHalopesa],
                airtel_number:   [airtel,   setAirtel],
              };
              const [val, setter] = stateMap[p.key];
              return (
                <div key={p.key}>
                  <label className="block font-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">
                    {p.label}
                  </label>
                  <input
                    type="tel"
                    value={val}
                    onChange={e => { setter(e.target.value); setSuccess(false); setError(null); }}
                    placeholder={p.placeholder}
                    className="w-full px-3 py-2 text-sm border border-outline-variant rounded-md bg-surface text-ink-deep placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Bank account details ─────────────────────────────────────────────── */}
      {hasBankTransfer && (
        <section>
          <h2 className="font-headline-md text-base font-semibold text-ink-deep mb-1">
            {t("pay.bank.title")}
          </h2>
          <p className="font-body-md text-sm text-on-surface-variant mb-4">
            {accountType === "pharmacy" ? t("pay.bank.pharmacy") : t("pay.bank.supplier")}
          </p>
          <div className="space-y-3">
            <div>
              <label className="block font-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">
                {t("pay.bank.name")}
              </label>
              <input
                type="text"
                value={bankName}
                onChange={e => { setBankName(e.target.value); setSuccess(false); setError(null); }}
                placeholder={t("pay.bank.name.placeholder")}
                className="w-full px-3 py-2 text-sm border border-outline-variant rounded-md bg-surface text-ink-deep placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">
                  {t("pay.bank.account")}
                </label>
                <input
                  type="text"
                  value={bankAccount}
                  onChange={e => { setBankAccount(e.target.value); setSuccess(false); setError(null); }}
                  placeholder={t("pay.bank.account.placeholder")}
                  className="w-full px-3 py-2 text-sm border border-outline-variant rounded-md bg-surface text-ink-deep placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">
                  {t("pay.bank.branch")}
                </label>
                <input
                  type="text"
                  value={bankBranch}
                  onChange={e => { setBankBranch(e.target.value); setSuccess(false); setError(null); }}
                  placeholder={t("pay.bank.branch.placeholder")}
                  className="w-full px-3 py-2 text-sm border border-outline-variant rounded-md bg-surface text-ink-deep placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Payme Africa marketplace wallet ─────────────────────────────────── */}
      <section className="border border-secondary/30 rounded-lg p-5 bg-secondary/5">
        <div className="flex items-start gap-3 mb-3">
          <span className="material-symbols-outlined text-secondary text-[22px] mt-0.5">account_balance_wallet</span>
          <div>
            <h2 className="font-headline-md text-base font-semibold text-ink-deep">{t("pay.wallet.title")}</h2>
            <p className="font-body-md text-sm text-on-surface-variant">
              {accountType === "pharmacy" ? t("pay.wallet.pharmacy") : t("pay.wallet.supplier")}
            </p>
          </div>
        </div>
        <div>
          <label className="block font-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">
            {t("pay.wallet.number")}
          </label>
          <input
            type="tel"
            value={paymeWallet}
            onChange={e => { setPaymeWallet(e.target.value); setSuccess(false); setError(null); }}
            placeholder="0712 345 678"
            className="w-full max-w-xs px-3 py-2 text-sm border border-secondary/40 rounded-md bg-surface text-ink-deep placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:border-secondary"
          />
          <p className="font-body-md text-xs text-on-surface-variant mt-1.5">
            {t("pay.wallet.note")}
          </p>
        </div>
      </section>

      {/* ── Save bar ─────────────────────────────────────────────────────────── */}
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
          {saving ? t("pay.saving") : t("pay.save")}
        </button>

        {success && (
          <div className="flex items-center gap-1.5 text-sm text-green-700">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            {t("pay.saved")}
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
