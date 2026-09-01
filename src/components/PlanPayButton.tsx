"use client";

/**
 * @file components/PlanPayButton.tsx
 * @description Reusable mobile-money checkout button used by the pharmacy
 * billing page and the supplier subscription page. Opens a wallet-number modal,
 * posts to /api/subscription/subscribe (Payme collection), then reloads so the
 * account's subscription state reflects the new (pending or active) status.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Toast from "@/components/Toast";

export interface PayPlan {
  id: string;
  name: string;
  price_monthly_tzs: number;
}

interface PlanPayButtonProps {
  plan: PayPlan;
  audience: "pharmacy" | "supplier";
  /** Pre-filled wallet number (from payment settings), when known. */
  walletHint?: string;
  label?: string;
}

export default function PlanPayButton({ plan, audience, walletHint, label }: PlanPayButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState(walletHint ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const openModal = () => {
    setWallet(walletHint ?? "");
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    const msisdn = wallet.trim();
    if (!/^(0[67]\d{8}|\+255[67]\d{8})$/.test(msisdn)) {
      setError("Enter a valid Tanzanian mobile-money number, e.g. 0712 345 678 or +255712345678.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/subscription/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, audience, msisdn, months: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Payment could not be started.");
        return;
      }
      setOpen(false);
      setToast({
        message: data.message ?? "Payment initiated.",
        type: res.ok && data.reference ? "success" : "info",
      });
      setTimeout(() => router.refresh(), 800);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <button
        onClick={openModal}
        className="w-full px-4 py-2 bg-primary text-on-primary font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-[16px]">smartphone</span>
        {label ?? "Pay now"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => !busy && setOpen(false)} />
          <div className="relative bg-surface-container-lowest border border-outline-variant rounded p-6 w-full max-w-md shadow-xl">
            <h3 className="font-headline-md text-headline-md text-ink-deep mb-1">Pay for {plan.name}</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-5">
              One month subscription — <strong>TZS {Math.round(plan.price_monthly_tzs).toLocaleString()}</strong>. You&apos;ll get a mobile-money prompt to confirm.
            </p>

            <label className="block font-label-md text-label-md text-on-surface-variant mb-1" htmlFor={`wallet-${plan.id}`}>
              Mobile-money / Payme wallet number
            </label>
            <input
              id={`wallet-${plan.id}`}
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="0712 345 678 or +255712345678"
              className="w-full px-3 py-2 bg-surface-base border border-outline-variant rounded text-sm mb-4 focus:outline-none focus:border-primary"
            />

            {error && (
              <p className="mb-4 px-3 py-2 bg-error-container border border-error/20 rounded text-xs text-error">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={busy}
                className="px-4 py-2 bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60 flex items-center gap-2"
              >
                {busy ? (
                  <div className="w-4 h-4 border border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[16px]">smartphone</span>
                )}
                {busy ? "Starting payment…" : "Confirm payment"}
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-4 py-2 border border-outline-variant text-on-surface-variant font-label-md text-label-md"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}