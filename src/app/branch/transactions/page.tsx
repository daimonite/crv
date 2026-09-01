import { redirect } from "next/navigation";
import { requireBranchOperator, getBranchTransactions } from "@/lib/actions/branch";

export default async function BranchTransactionsPage() {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) redirect("/auth?next=/branch");

  const transactions = await getBranchTransactions();

  return (
    <div className="p-8 max-w-container-max mx-auto w-full">
      <div className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-ink-deep mb-1">Transactions</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Sales and marketplace payments for {session.branch.name}.
        </p>
      </div>

      <div className="bg-surface-base border border-outline-variant rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-label-md text-label-md text-on-surface-variant border-b border-outline-variant uppercase text-xs">
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3 text-right">Amount (TSh)</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                  No transactions yet for this branch.
                </td>
              </tr>
            )}
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-outline-variant/60 last:border-b-0">
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      tx.kind === "sale" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {tx.kind === "sale" ? "POS sale" : "Order payment"}
                  </span>
                </td>
                <td className="px-4 py-3">{tx.description}</td>
                <td className="px-4 py-3 text-on-surface-variant">{tx.operator_name ?? "—"}</td>
                <td className="px-4 py-3 text-on-surface-variant">
                  {new Date(tx.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-bold">{(tx.amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}