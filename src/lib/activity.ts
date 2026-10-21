import "server-only";
import { getAuthenticatedUser } from "@/lib/supabase/server";

type ActivityAction = "upload" | "download" | "rename" | "move" | "copy" | "delete" | "connect" | "disconnect";
export async function logActivity(action: ActivityAction, fileName?: string) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return;
  await supabase.from("activity_log").insert({ user_id: user.id, action, file_name: fileName ?? null });
}
