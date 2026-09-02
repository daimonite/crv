/**
 * @file lib/supabase/server.ts
 * @description Server-side Supabase client factories for use in Server Components,
 * server actions, and Route Handlers.
 *
 * Two clients are provided:
 *  - `createClient()` — anon-role client; respects RLS. Use for all user-facing queries.
 *  - `createServiceClient()` — service-role client; BYPASSES RLS. Use ONLY in trusted
 *    HQ server actions where you need to read/write across all user accounts.
 *
 * Both clients propagate session cookies using `@supabase/ssr` so that auth
 * sessions established in the browser are accessible server-side without an
 * extra round-trip.
 *
 * When `NEXT_PUBLIC_MOCK_MODE=true`, both factories instead return the in-memory
 * mock client from `lib/mock/supabase.ts` so the entire app runs with zero
 * external dependencies. In mock mode the "signed-in" user is controlled by the
 * `mock_user` cookie: `pharmacy` (default), `supplier`, or `none` (signed out).
 *
 * Import pattern (in server components / server actions):
 * ```ts
 * import { createClient } from "@/lib/supabase/server";
 * const supabase = await createClient();
 * ```
 *
 * @environment NEXT_PUBLIC_SUPABASE_URL       — Supabase project URL
 * @environment NEXT_PUBLIC_SUPABASE_ANON_KEY  — Public anon/API key
 * @environment SUPABASE_SERVICE_ROLE_KEY      — Service role key (keep SECRET, server-only)
 * @environment NEXT_PUBLIC_MOCK_MODE          — "true" to run on the in-memory mock backend
 */

import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { createMockSupabase, mockUserForType } from "@/lib/mock/supabase";

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

/** Type of the real clients; the mock is cast to this so callers need no changes. */
type SupabaseServerClient = SupabaseClient;

/**
 * Builds the cookie adapter required by `@supabase/ssr` for server contexts.
 * The `setAll` catch block is intentional — Server Components cannot set cookies
 * after rendering begins, so write failures are silently ignored.
 *
 * @param cookieStore - The awaited `cookies()` store from `next/headers`
 * @returns CookieMethodsServer adapter for createServerClient
 */
function cookieMethods(cookieStore: Awaited<ReturnType<typeof cookies>>): CookieMethodsServer {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set(name, value, options as any)
        );
      } catch {
        // Called from a Server Component — cookie writes are a no-op here.
        // Route Handlers and Server Actions can write cookies successfully.
      }
    },
  };
}

/**
 * Returns a mock client wired to the `mock_user` cookie so role-switching works
 * server-side. `none` simulates a signed-out user (drives the auth redirects).
 */
function mockServerClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const readRole = (): "pharmacy" | "supplier" | "none" => {
    const value = cookieStore.get("mock_user")?.value;
    if (value === "supplier") return "supplier";
    if (value === "none") return "none";
    return "pharmacy";
  };
  return createMockSupabase({
    resolveUser: () => {
      const role = readRole();
      return role === "none" ? null : mockUserForType(role);
    },
    onSignIn: (role) => {
      try {
        cookieStore.set("mock_user", role, { path: "/" });
      } catch {
        // Server Component context — ignore
      }
    },
    onSignOut: () => {
      try {
        cookieStore.delete("mock_user");
      } catch {
        // Server Component context — ignore
      }
    },
  });
}

/**
 * Creates an anon-role Supabase client for server-side use.
 * Respects Row Level Security — queries are scoped to the authenticated user.
 *
 * Use this in:
 * - Server Components that load user-specific data
 * - Server Actions called by authenticated users (pharmacy, supplier portals)
 * - Route Handlers (auth callbacks, webhooks that don't need elevated access)
 *
 * @returns Authenticated server client (anon role + cookie session)
 */
export async function createClient(): Promise<SupabaseServerClient> {
  const cookieStore = await cookies();
  if (IS_MOCK) return mockServerClient(cookieStore) as unknown as SupabaseServerClient;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods(cookieStore) }
  );
}

/**
 * Creates a service-role Supabase client for privileged server-side use.
 * BYPASSES Row Level Security — can read and write any row in any table.
 *
 * ⚠️ ONLY use this in HQ server actions (`lib/actions/hq.ts`) that have already
 * validated the HQ session cookie via `assertHQAuth()`. Never expose this client
 * to user-facing code or return its raw output to the browser.
 *
 * IMPORTANT: This is built with the plain `@supabase/supabase-js` client, not
 * `@supabase/ssr`'s `createServerClient`. `@supabase/ssr` is designed to read
 * the caller's session cookies, and when a session is present it substitutes
 * that user's session token for the `Authorization` header regardless of which
 * key you pass in — the service-role key only ends up used as the `apikey`
 * header. That means Postgres still sees the request as the logged-in user,
 * not `service_role`, so RLS policies scoped to `service_role` reject it (this
 * is the cause of "new row violates row-level security policy" errors even
 * with a valid service key). Using the plain client here means no cookies are
 * read at all — the service-role key is the only credential in play, and
 * `supabase.auth.getUser()` will NOT work on this client (no session exists).
 * Callers that need the caller's identity must resolve it separately via
 * `createClient()` and pass the resulting user id in.
 *
 * @returns Service-role client (bypasses RLS, no user session)
 */
export async function createServiceClient(): Promise<SupabaseServerClient> {
  if (IS_MOCK) {
    const cookieStore = await cookies();
    return mockServerClient(cookieStore) as unknown as SupabaseServerClient;
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Creates a service-role client explicitly configured for Auth admin operations
 * (e.g. `auth.admin.createUser`, `auth.admin.deleteUser`) used when provisioning
 * web-login operator accounts for the /branch portal.
 *
 * Same cookie-free construction as `createServiceClient()` above, and for the
 * same reason: cookie-bound clients silently swap the service-role
 * Authorization header for the caller's own session token when one exists.
 * Session persistence is disabled so the admin token is never minted into a
 * browser cookie. NEVER expose this client to client components.
 */
export async function createAdminClient(): Promise<SupabaseServerClient> {
  if (IS_MOCK) {
    const cookieStore = await cookies();
    return mockServerClient(cookieStore) as unknown as SupabaseServerClient;
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
