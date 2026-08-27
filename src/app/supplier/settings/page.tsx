/**
 * @route /supplier/settings
 * @access Authenticated supplier accounts only.
 *         Pharmacy accounts are redirected to /dashboard.
 * @renders Payment receiving configuration for supplier disbursements + marketplace wallet.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupplierSidebar from "@/components/SupplierSidebar";
import PaymentSettingsForm from "@/components/PaymentSettingsForm";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { getPaymentSettings } from "@/lib/actions/payments";
import { getT } from "@/lib/i18n/server";

export default async function SupplierSettingsPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/supplier/settings");

  const { data: account } = await supabase
    .from("accounts")
    .select("name, type")
    .eq("auth_user_id", user.id)
    .single();

  // Enforce supplier-only access
  if (account?.type !== "supplier") redirect("/dashboard");

  // Fetch existing payment settings (null if not yet configured)
  const { settings, accountId } = await getPaymentSettings();

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <h1 className="font-headline-md text-headline-md text-ink-deep">{t("sup.settings.title")}</h1>
        </header>

        <main className="pt-16 flex-1 px-8 py-8">
          <div className="max-w-2xl">
            {/* Section header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-secondary text-[20px]">account_balance_wallet</span>
                <h2 className="font-headline-md text-lg font-semibold text-ink-deep">{t("sup.settings.payment_settings")}</h2>
              </div>
              <p className="font-body-md text-sm text-on-surface-variant">
                {t("sup.settings.payment_desc")}
              </p>
            </div>

            {accountId ? (
              <PaymentSettingsForm
                accountType="supplier"
                accountId={accountId}
                initial={settings}
              />
            ) : (
              <div className="flex items-center gap-3 p-4 bg-error-container/20 border border-error/20 rounded-lg text-sm text-error">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <span>{t("sup.settings.load_error")}</span>
              </div>
            )}

            {/* Change Password section */}
            <div className="mt-12 mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-secondary text-[20px]">lock</span>
                <h2 className="font-headline-md text-lg font-semibold text-ink-deep">{t("dash.settings.changepw")}</h2>
              </div>
              <p className="font-body-md text-sm text-on-surface-variant">
                {t("dash.settings.changepw.body")}
              </p>
            </div>

            <ChangePasswordForm />
          </div>
        </main>
      </div>
    </div>
  );
}
