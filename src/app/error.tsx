"use client";

import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-[28px] text-error">error_outline</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-ink-deep mb-3">Something went wrong</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-2">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-on-surface-variant/60 mb-6">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={reset}
            className="bg-primary text-on-primary font-label-md text-label-md px-6 py-2.5 rounded hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/"
            className="border border-outline-variant text-on-surface-variant font-label-md text-label-md px-6 py-2.5 rounded hover:bg-surface-container transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
