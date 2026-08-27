"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-[28px] text-on-surface-variant">search_off</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-ink-deep mb-3">Page Not Found</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-2">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center mt-6">
          <Link
            href="/"
            className="bg-primary text-on-primary font-label-md text-label-md px-6 py-2.5 rounded hover:opacity-90 transition-opacity"
          >
            Go home
          </Link>
          <Link
            href="/support"
            className="border border-outline-variant text-on-surface-variant font-label-md text-label-md px-6 py-2.5 rounded hover:bg-surface-container transition-colors"
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}
