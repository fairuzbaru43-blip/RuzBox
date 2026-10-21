import "server-only";
import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getSupabaseServiceClient, supabaseServiceConfigured } from "@/lib/supabase/service";
import type { TeraboxConnection } from "./types";

type ApiEnvelope<T> = { errno?: number; show_msg?: string; data?: T } & Record<string, unknown>;
type StoredConnection = { token_ciphertext: string; api_domain: string; upload_domain: string; terabox_user_id: string | null; access_expires_at: string; domain_refreshed_at: string | null };
const SHARED_CONNECTION_ID = "shared";
const refreshInFlight = new Map<string, Promise<TeraboxConnection>>();

export const teraboxConfigured = () => Boolean(process.env.TERABOX_CLIENT_ID && process.env.TERABOX_CLIENT_SECRET && process.env.TERABOX_PRIVATE_SECRET && process.env.TERABOX_ROOT_PATH && process.env.TOKEN_ENCRYPTION_KEY && supabaseServiceConfigured());
export const supabaseConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));

export function getTeraboxRoot() {
  const root = process.env.TERABOX_ROOT_PATH?.trim();
  if (!root || !root.startsWith("/") || root.includes("..")) throw new Error("TERABOX_ROOT_PATH is not configured with the application namespace assigned by TeraBox.");
  return root.endsWith("/") ? root.slice(0, -1) : root;
}

function safeDomain(value: string) {
  const host = value.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^(?:[a-z0-9-]+\.)*terabox\.com$/i.test(host)) throw new Error("TeraBox returned an unexpected API domain.");
  return `https://${host}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !body) throw new Error("TeraBox did not return a valid response.");
  if (typeof body.errno === "number" && body.errno !== 0) throw new Error(body.show_msg || `TeraBox returned error ${body.errno}.`);
  return body;
}

async function getTokenDomains(accessToken: string) {
  const form = new FormData();
  form.set("access_token", accessToken);
  const info = await api<{ api_domain: string; upload_domain: string; user_id?: number }>("https://www.terabox.com/oauth/tokeninfo", { method: "POST", body: form });
  if (!info.data?.api_domain || !info.data.upload_domain) throw new Error("TeraBox did not return both authorized API domains.");
  return { api_domain: safeDomain(info.data.api_domain), upload_domain: safeDomain(info.data.upload_domain), terabox_user_id: String(info.data.user_id ?? "") };
}

export async function exchangeAuthorizationCode(code: string) {
  const clientId = process.env.TERABOX_CLIENT_ID!;
  const clientSecret = process.env.TERABOX_CLIENT_SECRET!;
  const privateSecret = process.env.TERABOX_PRIVATE_SECRET!;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = createHash("md5").update(`${clientId}_${timestamp}_${clientSecret}_${privateSecret}`).digest("hex");
  const body = new FormData();
  for (const [name, value] of Object.entries({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, timestamp, sign })) body.set(name, value);
  const result = await api<{ access_token: string; refresh_token: string; expires_in: number }>("https://www.terabox.com/oauth/gettoken", { method: "POST", body });
  if (!result.data?.access_token || !result.data.refresh_token) throw new Error("TeraBox authorization did not return token data.");
  const domains = await getTokenDomains(result.data.access_token);
  return {
    tokens: { access_token: result.data.access_token, refresh_token: result.data.refresh_token, expires_at: Date.now() + Math.min(result.data.expires_in || 172800, 172800) * 1000 },
    ...domains,
  };
}

export async function saveTeraboxConnection(input: Awaited<ReturnType<typeof exchangeAuthorizationCode>>, createdBy: string) {
  const service = getSupabaseServiceClient();
  const { error } = await service.from("terabox_shared_connection").upsert({
    id: SHARED_CONNECTION_ID,
    created_by: createdBy,
    token_ciphertext: encryptSecret(JSON.stringify(input.tokens)),
    api_domain: input.api_domain,
    upload_domain: input.upload_domain,
    terabox_user_id: input.terabox_user_id || null,
    domain_refreshed_at: new Date().toISOString(),
    access_expires_at: new Date(input.tokens.expires_at).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error("Could not save the encrypted shared TeraBox connection. Apply migration 003_shared_terabox.sql.");
}

export async function removeTeraboxConnection() {
  const service = getSupabaseServiceClient();
  const { error } = await service.from("terabox_shared_connection").delete().eq("id", SHARED_CONNECTION_ID);
  if (error) throw new Error("Could not remove the shared TeraBox connection.");
}

async function refreshConnection(service: ReturnType<typeof getSupabaseServiceClient>, row: StoredConnection) {
  const tokens = JSON.parse(decryptSecret(row.token_ciphertext)) as { access_token: string; refresh_token: string };
  const clientId = process.env.TERABOX_CLIENT_ID!;
  const clientSecret = process.env.TERABOX_CLIENT_SECRET!;
  const privateSecret = process.env.TERABOX_PRIVATE_SECRET!;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = createHash("md5").update(`${clientId}_${timestamp}_${clientSecret}_${privateSecret}`).digest("hex");
  const body = new FormData();
  for (const [name, value] of Object.entries({ client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refresh_token, timestamp, sign })) body.set(name, value);
  const result = await api<{ access_token: string; refresh_token: string; expires_in: number }>("https://www.terabox.com/oauth/refreshtoken", { method: "POST", body });
  if (!result.data?.access_token || !result.data.refresh_token) throw new Error("TeraBox token refresh failed. Reconnect your account in Settings.");
  const next = { access_token: result.data.access_token, refresh_token: result.data.refresh_token, expires_at: Date.now() + (result.data.expires_in || 172800) * 1000 };
  const domains = await getTokenDomains(next.access_token);
  const { error } = await service.from("terabox_shared_connection").update({
    token_ciphertext: encryptSecret(JSON.stringify(next)),
    access_expires_at: new Date(next.expires_at).toISOString(),
    api_domain: domains.api_domain,
    upload_domain: domains.upload_domain,
    terabox_user_id: domains.terabox_user_id || row.terabox_user_id,
    domain_refreshed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", SHARED_CONNECTION_ID);
  if (error) throw new Error("Could not store the rotated shared TeraBox token. Ask the RuzBox administrator to reconnect.");
  return { ...next, ...domains, terabox_user_id: domains.terabox_user_id || row.terabox_user_id || undefined };
}

export async function getTeraboxConnection() {
  const { user } = await getAuthenticatedUser();
  if (!user) throw new Error("Sign in to RuzBox to access shared folders.");
  if (!teraboxConfigured()) throw new Error("The shared TeraBox connection is not fully configured. Check the server environment and Supabase secret or service-role key.");
  const service = getSupabaseServiceClient();
  const { data, error } = await service.from("terabox_shared_connection").select("token_ciphertext,api_domain,upload_domain,terabox_user_id,access_expires_at,domain_refreshed_at").eq("id", SHARED_CONNECTION_ID).maybeSingle();
  if (error) throw new Error("Could not read the shared TeraBox connection. Apply migration 003_shared_terabox.sql.");
  if (!data) throw new Error("The shared TeraBox drive has not been connected by a RuzBox administrator.");
  const row = data as StoredConnection;
  const encrypted = JSON.parse(decryptSecret(row.token_ciphertext)) as { access_token: string; refresh_token: string; expires_at?: number };
  const expiresAt = encrypted.expires_at ?? new Date(row.access_expires_at).getTime();
  if (expiresAt < Date.now() + 90_000) {
    const existing = refreshInFlight.get(SHARED_CONNECTION_ID);
    if (existing) return existing;
    const job = refreshConnection(service, row);
    refreshInFlight.set(SHARED_CONNECTION_ID, job);
    try { return await job; } finally { refreshInFlight.delete(SHARED_CONNECTION_ID); }
  }
  let domains = { api_domain: safeDomain(row.api_domain), upload_domain: safeDomain(row.upload_domain), terabox_user_id: row.terabox_user_id ?? undefined };
  const domainsRefreshedAt = row.domain_refreshed_at ? new Date(row.domain_refreshed_at).getTime() : 0;
  if (Date.now() - domainsRefreshedAt > 50 * 60 * 1000) {
    const freshDomains = await getTokenDomains(encrypted.access_token);
    const { error: domainError } = await service.from("terabox_shared_connection").update({ api_domain: freshDomains.api_domain, upload_domain: freshDomains.upload_domain, terabox_user_id: freshDomains.terabox_user_id || row.terabox_user_id, domain_refreshed_at: new Date().toISOString() }).eq("id", SHARED_CONNECTION_ID);
    if (domainError) throw new Error("Could not cache refreshed TeraBox API domains.");
    domains = { ...freshDomains, terabox_user_id: freshDomains.terabox_user_id || row.terabox_user_id || undefined };
  }
  return { ...encrypted, expires_at: expiresAt, ...domains } satisfies TeraboxConnection;
}

export async function teraboxRequest<T>(connection: TeraboxConnection, endpoint: string, params: Record<string, string>, init?: RequestInit) {
  const url = new URL(`/openapi/api/${endpoint}`, connection.api_domain);
  url.searchParams.set("access_tokens", connection.access_token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return api<T>(url.toString(), init);
}

export async function upsertFileMetadata(files: Array<{ fs_id: string; path: string; name: string; size: number; is_dir: boolean; category: number | null; modified_at: string | null; md5: string | null }>) {
  if (!files.length) return;
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return;
  const { error } = await supabase.from("files").upsert(files.map(file => ({ ...file, user_id: user.id, updated_at: new Date().toISOString() })), { onConflict: "user_id,fs_id" });
  if (error) throw new Error("Could not synchronize file metadata with Supabase.");
}
