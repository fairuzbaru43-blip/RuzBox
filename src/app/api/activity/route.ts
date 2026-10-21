import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ activities: [] });
  const { data, error } = await supabase.from("activity_log").select("id,action,file_name,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8);
  if (error) return NextResponse.json({ error: "Could not read activity history." }, { status: 500 });
  return NextResponse.json({ activities: data ?? [] });
}
