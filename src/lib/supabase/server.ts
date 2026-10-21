import "server-only";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  const cookieMethods: CookieMethodsServer = {
    getAll: () => cookieStore.getAll(),
    setAll(values) {
      try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
      catch { /* Server components cannot write cookies; route handlers can. */ }
    },
  };
  return createServerClient(url, key, {
    cookies: cookieMethods,
  });
}

export async function getAuthenticatedUser() {
  const supabase = await getSupabaseServer();
  if (!supabase) return { supabase: null, user: null };
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Admin role is set in trusted Supabase app_metadata, never user-editable metadata. */
export function isRuzBoxAdmin(user: { app_metadata?: Record<string, unknown> } | null | undefined) {
  return user?.app_metadata?.ruzbox_role === "admin";
}
