/**
 * @file proxy.ts (middleware)
 * @description Next.js middleware for route protection and session refresh.
 *
 * Exported as `proxy()` and called from `middleware.ts` on every non-static request.
 *
 * Responsibilities:
 *  1. Refresh the Supabase auth session on every request (required by @supabase/ssr)
 *  2. HQ Guard — validates `hq_sess` cookie for /hq/* routes; redirects to /hq if invalid
 *  3. Auth Guard — redirects unauthenticated users away from protected routes to /auth
 *  4. Post-auth redirect — sends already-authenticated users from /auth to their portal
 *
 * Protected route prefixes: /dashboard, /download, /supplier
 * Public exceptions:        /supplier/quote (public lead-gen form — no auth required)
 * HQ-guarded prefix:        /hq (uses HMAC session, not Supabase user)
 *
 * IMPORTANT: Do NOT add logic between `createServerClient` and `supabase.auth.getUser()`.
 * The @supabase/ssr docs require these to be adjacent for correct cookie propagation.
 *
 * @see lib/hq-auth.ts — HQ session token helpers
 * @see app/auth/callback/route.ts — Supabase OAuth/email code exchange
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

/** In mock mode the "session" is the `mock_user` cookie; `none` = signed out, otherwise signed in. */
function mockUserFromRequest(request: NextRequest) {
  const role = request.cookies.get("mock_user")?.value;
  if (role === "none") return null;
  return { user_metadata: { account_type: role === "supplier" ? "supplier" : "pharmacy" } };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The desktop POS app calls these API routes from a Tauri webview (different origin).
  // Browsers require explicit CORS headers and OPTIONS preflight response.
  const isCorsRoute =
    pathname.startsWith("/api/marketplace") ||
    pathname.startsWith("/api/subscription");

  if (isCorsRoute) {
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  }

  let supabaseResponse = NextResponse.next({ request });

  // Build a custom fetch that will be aborted after TIMEOUT_MS to prevent
  // hanging requests from blocking the entire page render when Supabase is
  // unreachable (e.g. IPv6 stall, network outage, paused project).
  const TIMEOUT_MS = 3000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const timedFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: controller.signal });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timedFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabaseResponse.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  // Refresh session — do NOT add logic between createServerClient and getUser.
  // On network failure the race resolves to null (treat as signed-out) so
  // protected routes redirect to /auth instead of hanging for 26 s.
  let user: { user_metadata?: Record<string, unknown> } | null = null;
  if (IS_MOCK) {
    user = mockUserFromRequest(request);
  } else {
    try {
      const result = await supabase.auth.getUser();
      user = result.data.user;
    } catch {
      // Network error (AbortError, fetch failed, etc.) — treat as signed-out.
      user = null;
    } finally {
      clearTimeout(timeoutId);
    }
  }


  // HQ guard — validates derived session token, not the raw secret
  if (pathname.startsWith("/hq")) {
    const hqToken = request.cookies.get(HQ_COOKIE_NAME)?.value;
    if (!isValidHQToken(hqToken)) {
      if (pathname !== "/hq") {
        const url = request.nextUrl.clone();
        url.pathname = "/hq";
        return NextResponse.redirect(url);
      }
    }
  }

  // Auth-required routes
  // /supplier/quote is the PUBLIC lead-gen form — do not protect it
  // /download is a public product page — no account needed to download the endpoint app.
  // After installing, the desktop app guides users to link to an admin account.
  // /branch is the operator web portal — identity enforced in src/app/branch/layout.tsx
  const protectedPrefixes = ["/dashboard", "/supplier", "/branch"];
  const publicExceptions  = ["/supplier/quote"];
  const isProtected =
    protectedPrefixes.some((p) => pathname.startsWith(p)) &&
    !publicExceptions.some((ex) => pathname === ex || pathname.startsWith(ex + "/"));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth page
  if (pathname === "/auth" && user) {
    const url = request.nextUrl.clone();
    const accountType = user.user_metadata?.account_type ?? "pharmacy";
    url.pathname = accountType === "supplier" ? "/supplier" : "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
