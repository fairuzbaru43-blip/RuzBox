import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getHiddenFolderPaths, isPathHidden } from "@/lib/admin/hidden-folders";
import { getTeraboxConnection, getTeraboxRoot, teraboxRequest, upsertFileMetadata } from "@/lib/terabox/client";
import { assertWithinRoot } from "@/lib/terabox/validation";
import type { TeraboxFile } from "@/lib/terabox/types";

export const runtime = "nodejs";
const withinRoot = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Sign in to view your files." }, { status: 401 });
    const connection = await getTeraboxConnection();
    const root = getTeraboxRoot();
    const requested = request.nextUrl.searchParams.get("path") ?? root;
    assertWithinRoot(requested);
    const hiddenPaths = await getHiddenFolderPaths();
    if (isPathHidden(requested, hiddenPaths)) return NextResponse.json({ error: "This folder is hidden in RuzBox." }, { status: 404 });
    const key = request.nextUrl.searchParams.get("q")?.trim();
    const result = key
      ? await teraboxRequest<TeraboxFile[]>(connection, "search", { key: key.slice(0, 120), page: "1", num: "100", recursion: "1", order: "time", desc: "1" })
      : await teraboxRequest<TeraboxFile[]>(connection, "list", { path: "1", num: "100", dir: requested, order: "time", desc: "1", web: "1" });
    const raw = (key ? result.list : result.info) as TeraboxFile[] | undefined;
    const files = (raw ?? []).filter(file => typeof file.path === "string" && Number(file.isdir) === 1 && withinRoot(file.path, root) && !isPathHidden(file.path, hiddenPaths)).map(file => ({
      fs_id: String(file.fs_id), path: file.path, name: file.server_filename,
      size: Number(file.size ?? 0), is_dir: true,
      category: file.category ?? null, modified_at: file.server_mtime ? new Date(file.server_mtime * 1000).toISOString() : null,
      md5: file.md5 ?? null, thumbs: file.thumbs ?? null,
    }));
    await upsertFileMetadata(files);
    return NextResponse.json({ files, path: requested, root, hasMore: Boolean(result.has_more) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load files from TeraBox.";
    const status = message.startsWith("Sign in") ? 401 : message.includes("hidden-folder visibility") || message.includes("not configured") || message.includes("not fully configured") || message.startsWith("Set NEXT_PUBLIC_SUPABASE_URL") ? 503 : message.startsWith("The shared TeraBox drive") || message.startsWith("Connect") ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
