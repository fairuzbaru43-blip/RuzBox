import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isRuzBoxAdmin } from "@/lib/supabase/server";
import { removeTeraboxConnection } from "@/lib/terabox/client";
import { logActivity } from "@/lib/activity";

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage the shared drive." }, { status: 401 });
  if (!isRuzBoxAdmin(user)) return NextResponse.json({ error: "Only a RuzBox administrator can disconnect the shared drive." }, { status: 403 });
  try {
    await removeTeraboxConnection();
    await logActivity("disconnect");
    return NextResponse.json({ connected: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove the shared TeraBox connection." }, { status: 500 });
  }
}
