/**
 * @file middleware.ts
 * @description This is the actual Next.js middleware entry point — Next.js
 * only auto-invokes a file literally named `middleware.ts` (or `.js`) at
 * this location. The real logic (session refresh, HQ guard, auth guard, and
 * CORS handling for the desktop app's API calls) lives in `proxy.ts`; this
 * file just wires it up. Before this file existed, none of that logic ever
 * actually ran — proxy.ts's own doc comment says it's "called from
 * middleware.ts", but no such file existed anywhere in the repo, so the
 * function was never invoked at all, regardless of what it does internally.
 *
 * The matcher is duplicated from proxy.ts's own `config.matcher` rather than
 * re-exported, since Next.js statically parses `config` directly out of this
 * entry file at build time — re-exporting it from another module has been
 * unreliable across some Next.js/bundler versions, so this is the safer form.
 */
import { proxy } from "@/proxy";

export const middleware = proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
