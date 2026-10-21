import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getHiddenFolderPaths, isPathHidden } from "@/lib/admin/hidden-folders";
import { getTeraboxConnection, teraboxRequest } from "@/lib/terabox/client";
import { assertWithinRoot } from "@/lib/terabox/validation";
import { logActivity } from "@/lib/activity";
import { createTransferTicket } from "@/lib/transfer-ticket";
import { randomUUID } from "node:crypto";
import { getTeraboxRoot } from "@/lib/terabox/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ fsId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!supabase || !user) return NextResponse.json({ error: "Sign in to access this file." }, { status: 401 });
    const { fsId } = await context.params;
    if (!/^\d{1,24}$/.test(fsId)) return NextResponse.json({ error: "Invalid file identifier." }, { status: 400 });
    const { data: row } = await supabase.from("files").select("path,name,size").eq("user_id", user.id).eq("fs_id", fsId).maybeSingle();
    if (!row) return NextResponse.json({ error: "File not found in your RuzBox workspace." }, { status: 404 });
    assertWithinRoot(row.path);
    const hiddenPaths = await getHiddenFolderPaths();
    if (isPathHidden(row.path, hiddenPaths)) return NextResponse.json({ error: "This item is inside a folder hidden in RuzBox." }, { status: 404 });
    const connection = await getTeraboxConnection();
    if (Number(row.size) > 4 * 1024 * 1024 && process.env.NEXT_PUBLIC_TRANSFER_SERVICE_URL && process.env.TRANSFER_SERVICE_SECRET) {
      const operation = request.nextUrl.searchParams.get("download") === "1" ? "download" : "content";
      const ticket = createTransferTicket({ operation, user_id: user.id, fs_id: fsId, file_name: row.name, file_size: Number(row.size), file_path: row.path, root_path: getTeraboxRoot(), access_token: connection.access_token, api_domain: connection.api_domain, upload_domain: connection.upload_domain, expires_at: Date.now() + 180_000, nonce: randomUUID() });
      if (operation === "download") await logActivity("download", row.name);
      const servicePath = operation === "download" ? "/download" : "/content";
      const destination = new URL(servicePath, process.env.NEXT_PUBLIC_TRANSFER_SERVICE_URL);
      destination.searchParams.set("ticket", ticket);
      return NextResponse.redirect(destination, 307);
    }
    const result = await teraboxRequest<Array<{ fs_id: string; dlink?: string }>>(connection, "download", { fidlist: JSON.stringify([fsId]), type: "dlink" });
    const link = (result.dlink as Array<{ fs_id: string; dlink?: string }> | undefined)?.find(item => item.fs_id === fsId)?.dlink;
    if (!link) throw new Error("TeraBox did not provide a download link.");
    const upstreamUrl = new URL(link);
    if (upstreamUrl.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)*terabox\.com$/i.test(upstreamUrl.hostname)) throw new Error("TeraBox returned an unexpected download domain.");
    upstreamUrl.searchParams.set("access_tokens", connection.access_token);
    const headers = new Headers();
    const range = request.headers.get("range");
    if (range) headers.set("range", range);
    const upstream = await fetch(upstreamUrl, { headers, cache: "no-store", signal: AbortSignal.timeout(45_000) });
    if (!upstream.ok && upstream.status !== 206) throw new Error("TeraBox could not stream this file.");
    if (request.nextUrl.searchParams.get("download") === "1") await logActivity("download", row.name);
    const responseHeaders = new Headers();
    responseHeaders.set("content-type", upstream.headers.get("content-type") || "application/octet-stream");
    responseHeaders.set("content-disposition", `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.name)}`);
    responseHeaders.set("cache-control", "private, no-store");
    for (const header of ["content-length", "content-range", "accept-ranges"]) { const value = upstream.headers.get(header); if (value) responseHeaders.set(header, value); }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not stream file." }, { status: 502 });
  }
}
