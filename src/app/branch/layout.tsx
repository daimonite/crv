/**
 * @route /branch/* (layout)
 * @access Web-enabled branch operators only (provisioned from /dashboard/operators).
 * @description Enforces the operator session; renders the branch portal shell.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import BranchSidebar from "@/components/BranchSidebar";
import { requireBranchOperator } from "@/lib/actions/branch";

export const metadata: Metadata = {
  title: "Branch Portal — Cervos",
};

export default async function BranchLayout({ children }: { children: React.ReactNode }) {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) redirect("/auth?next=/branch");

  return (
    <div className="flex min-h-screen bg-surface">
      <BranchSidebar branchName={session.branch.name} pharmacyName={session.account.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {session.branch.name}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">
              Branch Portal
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
            <span className="w-2 h-2 rounded-full bg-secondary block" />
            Signed in as {session.operator.name}
          </div>
        </header>
        <main className="flex-grow pt-16">{children}</main>
      </div>
    </div>
  );
}