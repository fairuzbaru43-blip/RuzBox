import { NextResponse } from "next/server";
import { getAuthenticatedUser, isRuzBoxAdmin } from "@/lib/supabase/server";
import { getSupabaseServiceClient, supabaseServiceConfigured } from "@/lib/supabase/service";
import { supabaseConfigured, teraboxConfigured } from "@/lib/terabox/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  const base = { configured: supabaseConfigured(), teraboxConfigured: teraboxConfigured() };
  if (!supabase || !user) return NextResponse.json({ authenticated: false, isAdmin: false, ...base, connected: false }, { headers: { "cache-control": "no-store" } });
  let connected = false;
  if (supabaseServiceConfigured()) {
    const service = getSupabaseServiceClient();
    const { data } = await service.from("terabox_shared_connection").select("id").eq("id", "shared").maybeSingle();
    connected = Boolean(data);
  }
  return NextResponse.json({ authenticated: true, isAdmin: isRuzBoxAdmin(user), email: user.email ?? null, ...base, connected }, { headers: { "cache-control": "no-store" } });
}
