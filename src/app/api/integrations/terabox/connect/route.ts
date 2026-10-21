import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exchangeAuthorizationCode, saveTeraboxConnection, teraboxConfigured } from "@/lib/terabox/client";
import { oauthCodeSchema } from "@/lib/terabox/validation";
import { getAuthenticatedUser, isRuzBoxAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Sign in before connecting TeraBox." }, { status: 401 });
    if (!isRuzBoxAdmin(user)) return NextResponse.json({ error: "Only a RuzBox administrator can connect the shared TeraBox drive." }, { status: 403 });
    if (!teraboxConfigured()) return NextResponse.json({ error: "TeraBox credentials, token encryption key, and assigned app folder are required." }, { status: 503 });
    const { code } = z.object({ code: oauthCodeSchema }).parse(await request.json());
    const connection = await exchangeAuthorizationCode(code);
    await saveTeraboxConnection(connection, user.id);
    await logActivity("connect");
    return NextResponse.json({ connected: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect TeraBox.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Sign in") ? 401 : message.startsWith("Only a RuzBox administrator") ? 403 : message.includes("required") ? 503 : 400 });
  }
}
