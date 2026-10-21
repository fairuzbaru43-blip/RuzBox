import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getHiddenFolderPaths, isPathHidden } from "@/lib/admin/hidden-folders";
import { getTeraboxConnection, getTeraboxRoot, teraboxRequest, upsertFileMetadata } from "@/lib/terabox/client";
import { assertWithinRoot, getChildPath } from "@/lib/terabox/validation";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
    const connection = await getTeraboxConnection();
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = String(formData.get("path") || getTeraboxRoot());
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "Empty files are not supported by this upload flow." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "This Vercel upload route supports files up to 4 MB. Configure a separate streaming transfer service for larger files." }, { status: 413 });
    assertWithinRoot(folder);
    if (isPathHidden(folder, await getHiddenFolderPaths())) return NextResponse.json({ error: "This folder is hidden from the shared RuzBox view." }, { status: 404 });
    const path = getChildPath(folder, file.name);
    const bytes = Buffer.from(await file.arrayBuffer());
    const md5 = createHash("md5").update(bytes).digest("hex");
    const blockList = JSON.stringify([md5]);
    const pre = new FormData();
    pre.set("path", path); pre.set("autoinit", "1"); pre.set("block_list", blockList);
    const preResult = await teraboxRequest<{ uploadid?: string; return_type?: number }>(connection, "precreate", {}, { method: "POST", body: pre });
    const topLevelUploadId = preResult.uploadid;
    const uploadId = typeof topLevelUploadId === "string" ? topLevelUploadId : preResult.data?.uploadid;
    if (typeof uploadId !== "string" || !uploadId) throw new Error("TeraBox did not return an upload ID.");
    const uploadUrl = new URL("/rest/2.0/pcs/superfile2", connection.upload_domain);
    for (const [key, value] of Object.entries({ method: "upload", app_id: "250528", path, uploadid: uploadId, partseq: "0", access_tokens: connection.access_token })) uploadUrl.searchParams.set(key, value);
    const chunk = new FormData();
    chunk.set("file", new Blob([bytes], { type: file.type || "application/octet-stream" }), file.name);
    const uploaded = await fetch(uploadUrl, { method: "POST", body: chunk, cache: "no-store", signal: AbortSignal.timeout(45_000) });
    const uploadBody = await uploaded.json().catch(() => null) as { errno?: number; show_msg?: string } | null;
    if (!uploaded.ok || !uploadBody || (uploadBody.errno && uploadBody.errno !== 0)) throw new Error(uploadBody?.show_msg || "TeraBox file-part upload failed.");
    const create = new FormData();
    create.set("path", path); create.set("size", String(file.size)); create.set("uploadid", uploadId); create.set("block_list", blockList); create.set("rtype", "1");
    const created = await teraboxRequest<{ fs_id?: string | number; category?: number; path?: string; server_filename?: string; size?: number; mtime?: number }>(connection, "create", {}, { method: "POST", body: create });
    const item = (created as unknown as { fs_id?: string | number; category?: number; path?: string; server_filename?: string; size?: number; mtime?: number }).fs_id ? created as unknown as { fs_id: string | number; category?: number; path?: string; server_filename?: string; size?: number; mtime?: number } : created.data as { fs_id: string | number; category?: number; path?: string; server_filename?: string; size?: number; mtime?: number } | undefined;
    if (!item?.fs_id) throw new Error("TeraBox did not confirm file creation.");
    await upsertFileMetadata([{ fs_id: String(item.fs_id), path: item.path || path, name: item.server_filename || file.name, size: Number(item.size ?? file.size), is_dir: false, category: item.category ?? null, modified_at: item.mtime ? new Date(item.mtime * 1000).toISOString() : new Date().toISOString(), md5 }]);
    await logActivity("upload", file.name);
    return NextResponse.json({ uploaded: true, path: item.path || path });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = message.startsWith("Sign in") ? 401 : message.includes("up to 4 MB") ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
