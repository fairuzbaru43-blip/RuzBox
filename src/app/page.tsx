import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function Home() {
  const { user } = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return <Dashboard />;
}
