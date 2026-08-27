import { Suspense } from "react";
import RecoveryForm from "./RecoveryForm";

export default function RecoveryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <RecoveryForm />
    </Suspense>
  );
}
