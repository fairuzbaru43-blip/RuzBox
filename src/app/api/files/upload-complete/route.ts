import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getHiddenFolderPaths, isPathHidden } from "@/lib/admin/hidden-folders";
import { assertWithinRoot, safeNameSchema } from "@/lib/terabox/validation";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in to complete the upload." }, { status: 401 });
  try {
    const input = z.object({ name: safeNameSchema, path: z.string().min(1).max(2048) }).parse(await request.json());
    assertWithinRoot(input.path);
    if (isPathHidden(input.path, await getHiddenFolderPaths())) return NextResponse.json({ error: "This folder is hidden from the shared RuzBox view." }, { status: 404 });
    if (input.path.split("/").at(-1) !== input.name) return NextResponse.json({ error: "File path does not match its name." }, { status: 400 });
    await logActivity("upload", input.name);
    return NextResponse.json({ recorded: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Upload completion failed." }, { status: 400 }); }
}
