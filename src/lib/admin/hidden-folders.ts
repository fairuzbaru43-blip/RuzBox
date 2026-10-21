import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function getHiddenFolderPaths() {
  const service = getSupabaseServiceClient();
  const { data, error } = await service.from("hidden_folders").select("path");
  if (error) throw new Error("Could not verify shared hidden-folder visibility. Apply migration 003_shared_terabox.sql.");
  return (data ?? []).map(folder => folder.path as string);
}

export function isPathHidden(path: string, hiddenPaths: string[]) {
  return hiddenPaths.some(hiddenPath => path === hiddenPath || path.startsWith(`${hiddenPath}/`));
}
