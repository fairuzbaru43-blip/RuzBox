import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getHiddenFolderPaths, isPathHidden } from "@/lib/admin/hidden-folders";
import { getTeraboxConnection, getTeraboxRoot } from "@/lib/terabox/client";
import { assertWithinRoot, getChildPath, safeNameSchema } from "@/lib/terabox/validation";
import { createTransferTicket } from "@/lib/transfer-ticket";

export const runtime = "nodejs";
const requestSchema = z.object({ name: safeNameSchema, size: z.number().int().positive().max(20 * 1024 * 1024 * 1024), path: z.string().min(1).max(2048) });
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
    if (!process.env.NEXT_PUBLIC_TRANSFER_SERVICE_URL || !process.env.TRANSFER_SERVICE_SECRET) return NextResponse.json({ error: "Large-file streaming is not configured. Set up the RuzBox transfer service." }, { status: 503 });
    const { name, size, path: folder } = requestSchema.parse(await request.json());
    assertWithinRoot(folder);
    if (isPathHidden(folder, await getHiddenFolderPaths())) return NextResponse.json({ error: "This folder is hidden from the shared RuzBox view." }, { status: 404 });
    const path = getChildPath(folder, name);
    const connection = await getTeraboxConnection();
    const ticket = createTransferTicket({
      operation: "upload", user_id: user.id, file_name: name, file_size: size, file_path: path, root_path: getTeraboxRoot(),
      access_token: connection.access_token, api_domain: connection.api_domain, upload_domain: connection.upload_domain,
      expires_at: Date.now() + 180_000, nonce: randomUUID(),
    });
    return NextResponse.json({ ticket, transferUrl: `${process.env.NEXT_PUBLIC_TRANSFER_SERVICE_URL.replace(/\/$/, "")}/upload` }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the large-file upload.";
    const status = message.startsWith("Sign in") ? 401 : message.includes("not configured") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
