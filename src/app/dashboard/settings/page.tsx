/**
 * @route /dashboard/settings
 * @access Authenticated pharmacy accounts only.
 *         Supplier accounts are redirected to /supplier.
 * @renders Payment method configuration for pharmacy POS + marketplace wallet.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PharmacySidebar from "@/components/PharmacySidebar";
import PaymentSettingsForm from "@/components/PaymentSettingsForm";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { getPaymentSettings } from "@/lib/actions/payments";
import { getT } from "@/lib/i18n/server";

export default async function SettingsPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/dashboard/settings");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, type, download_enabled")
    .eq("auth_user_id", user.id)
    .single();

  // Enforce pharmacy-only access — supplier users are redirected to their own portal
  if (account?.type !== "pharmacy") redirect("/supplier");

  const { data: branches } = await supabase
    .from("branches")
    .select("name")
    .eq("account_id", account?.id ?? "")
    .limit(1);

  // Fetch existing payment settings (null if not yet configured)
  const { settings, accountId } = await getPaymentSettings();

  return (
    <div className="flex min-h-screen bg-surface">
      <PharmacySidebar
        branchName={branches?.[0]?.name}
        accountName={account?.name}
      />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <h1 className="font-headline-md text-headline-md text-ink-deep">{t("dash.settings.title")}</h1>
        </header>

        <main className="pt-16 flex-1 px-8 py-8">
          <div className="max-w-2xl">
            {/* Section header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
                <h2 className="font-headline-md text-lg font-semibold text-ink-deep">{t("dash.settings.payments")}</h2>
              </div>
              <p className="font-body-md text-sm text-on-surface-variant">
                {t("dash.settings.payments.body")}
              </p>
            </div>

            {accountId ? (
              <PaymentSettingsForm
                accountType="pharmacy"
                accountId={accountId}
                initial={settings}
              />
            ) : (
              <div className="flex items-center gap-3 p-4 bg-error-container/20 border border-error/20 rounded-lg text-sm text-error">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <span>{t("dash.settings.loaderror")}</span>
              </div>
            )}

            {/* Change Password section */}
            <div className="mt-12 mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary text-[20px]">lock</span>
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
