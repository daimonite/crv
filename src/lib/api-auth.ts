/**
 * @file lib/api-auth.ts
 * @description Route-Handler auth helper: resolves the Supabase Auth user from
 * a request's cookie session or a Bearer token.
 */
import { NextRequest } from "next/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function getUserFromRequest(request: NextRequest) {
  try {
    const cookieClient = await createClient();
    const { data: { user } } = await cookieClient.auth.getUser();
    if (user) return user;
  } catch { /* fallback to bearer */ }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const bearerClient = createAnonClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await bearerClient.auth.getUser();
    if (user) return user;
  }
  return null;
}