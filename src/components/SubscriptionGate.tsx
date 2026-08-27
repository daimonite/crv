/**
 * @file components/SubscriptionGate.tsx
 * @description Gates dashboard access based on account subscription_status.
 *   Locked/suspended accounts see a blocking screen; grace-period accounts
 *   see a dismissible warning banner; trial/active accounts pass through.
 */
import Link from "next/link";

type SubscriptionStatus = "trial" | "active" | "grace" | "locked" | "suspended";

function LockScreen({ status }: { status: SubscriptionStatus }) {
  const isSuspended = status === "suspended";

  return (
    <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-surface-base border border-outline-variant rounded p-8 text-center">
        <span className="material-symbols-outlined text-[48px] text-error block mb-4">
          {isSuspended ? "block" : "lock"}
        </span>
        <h1 className="font-headline-md text-headline-md text-ink-deep mb-2">
          {isSuspended ? "Account Suspended" : "Account Locked"}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">
          {isSuspended
            ? "This account has been suspended. Please contact support or update your billing information to regain access."
            : "This account is locked due to subscription issues. Please update your billing information to regain access."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-on-primary font-label-md text-label-md"
          >
            <span className="material-symbols-outlined text-[16px]">credit_card</span>
            View Billing
          </Link>
          <Link
            href="/support"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-surface-base border border-outline-variant text-on-surface font-label-md text-label-md"
          >
            <span className="material-symbols-outlined text-[16px]">support_agent</span>
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}

function GraceBanner() {
  return (
    <div className="bg-secondary-container border-b border-secondary px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-[20px] text-on-secondary-container">
          warning
        </span>
        <p className="font-body-sm text-body-sm text-on-secondary-container">
          <strong>Subscription notice:</strong> Your payment is overdue. Update billing to avoid service interruption.
        </p>
      </div>
      <Link
        href="/dashboard/billing"
        className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-secondary text-on-secondary font-label-sm text-label-sm rounded-full"
      >
        <span className="material-symbols-outlined text-[14px]">credit_card</span>
        Update Billing
      </Link>
    </div>
  );
}

export default function SubscriptionGate({
  children,
  subscription_status,
}: {
  children: React.ReactNode;
  subscription_status: SubscriptionStatus;
}) {
  if (subscription_status === "locked" || subscription_status === "suspended") {
    return <LockScreen status={subscription_status} />;
  }

  if (subscription_status === "grace") {
    return (
      <>
        <GraceBanner />
        {children}
      </>
    );
  }

  return <>{children}</>;
}
