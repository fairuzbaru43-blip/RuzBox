import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getHiddenFolderPaths, isPathHidden } from "@/lib/admin/hidden-folders";
import { getTeraboxConnection, teraboxRequest } from "@/lib/terabox/client";
import { assertWithinRoot, safeNameSchema } from "@/lib/terabox/validation";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
const actionSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("rename"), path: z.string().min(1), newName: safeNameSchema }),
  z.object({ operation: z.literal("move"), path: z.string().min(1), destination: z.string().min(1), newName: safeNameSchema.optional() }),
  z.object({ operation: z.literal("copy"), path: z.string().min(1), destination: z.string().min(1), newName: safeNameSchema.optional() }),
  z.object({ operation: z.literal("delete"), path: z.string().min(1) }),
]);

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
    const { supabase, user } = await getAuthenticatedUser();
    if (!supabase || !user) return NextResponse.json({ error: "Sign in to manage files." }, { status: 401 });
    const input = actionSchema.parse(await request.json());
    assertWithinRoot(input.path);
    if ("destination" in input) assertWithinRoot(input.destination);
    const hiddenPaths = await getHiddenFolderPaths();
    if (isPathHidden(input.path, hiddenPaths) || ("destination" in input && isPathHidden(input.destination, hiddenPaths))) {
      return NextResponse.json({ error: "This folder is hidden from the shared RuzBox view." }, { status: 404 });
    }
    const connection = await getTeraboxConnection();
    const opera = input.operation;
    const file = opera === "delete" ? [input.path] : [{ path: input.path, ...(opera === "rename" ? { newname: input.newName } : { dest: input.destination, ...(input.newName ? { newname: input.newName } : {}) }) }];
    const form = new FormData();
    form.set("filelist", JSON.stringify(file));
    const result = await teraboxRequest<unknown>(connection, "filemanager", { opera, async: "0" }, { method: "POST", body: form });
    if (opera === "delete") await supabase.from("files").delete().eq("user_id", user.id).eq("path", input.path);
    await logActivity(opera, input.path.split("/").at(-1));
    return NextResponse.json({ success: true, result: result.info ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The file operation failed.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Sign in") ? 401 : 400 });
  }
}
