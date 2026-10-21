import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isRuzBoxAdmin } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getTeraboxRoot } from "@/lib/terabox/client";
import { assertWithinRoot } from "@/lib/terabox/validation";

export const runtime = "nodejs";
const folderSchema = z.object({ path: z.string().trim().min(1).max(2048), name: z.string().trim().min(1).max(255) });
const pathSchema = z.object({ path: z.string().trim().min(1).max(2048) });

async function getAdminContext() {
  const { user } = await getAuthenticatedUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to manage hidden folders." }, { status: 401 }) };
  if (!isRuzBoxAdmin(user)) return { error: NextResponse.json({ error: "Administrator access is required." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const context = await getAdminContext();
  if ("error" in context) return context.error;
  try {
    const service = getSupabaseServiceClient();
    const { data, error } = await service.from("hidden_folders").select("path,name,created_at").eq("user_id", context.user.id).order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Hidden folders are unavailable. Apply migrations 002_hidden_folders.sql and 003_shared_terabox.sql." }, { status: 503 });
    return NextResponse.json({ folders: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load hidden folders." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const context = await getAdminContext();
  if ("error" in context) return context.error;
  try {
    const input = folderSchema.parse(await request.json());
    const root = getTeraboxRoot();
    assertWithinRoot(input.path);
    if (input.path === root || !input.path.startsWith(`${root}/`)) return NextResponse.json({ error: "Only folders inside the assigned TeraBox app folder can be hidden." }, { status: 400 });
    const service = getSupabaseServiceClient();
    const { error } = await service.from("hidden_folders").insert({ user_id: context.user.id, path: input.path, name: input.name });
    if (error && error.code !== "23505") return NextResponse.json({ error: "Could not save hidden folder. Apply migration 002_hidden_folders.sql and try again." }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid folder details." }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not hide folder." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const context = await getAdminContext();
  if ("error" in context) return context.error;
  try {
    const { path } = pathSchema.parse(await request.json());
    assertWithinRoot(path);
    const service = getSupabaseServiceClient();
    const { error } = await service.from("hidden_folders").delete().eq("user_id", context.user.id).eq("path", path);
    if (error) return NextResponse.json({ error: "Could not restore folder. Apply migration 002_hidden_folders.sql and try again." }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid folder path." }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not restore folder." }, { status: 400 });
  }
}
