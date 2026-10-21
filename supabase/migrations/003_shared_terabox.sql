-- One administrator-managed TeraBox connection is shared by authenticated RuzBox users.
-- A Supabase secret key (or legacy service-role key) is required by server routes and must never be exposed to the browser.
create table if not exists public.terabox_shared_connection (
  id text primary key default 'shared' check (id = 'shared'),
  created_by uuid references auth.users(id) on delete set null,
  token_ciphertext text not null,
  api_domain text not null,
  upload_domain text not null,
  terabox_user_id text,
  access_expires_at timestamptz not null,
  domain_refreshed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.terabox_shared_connection enable row level security;
revoke all on public.terabox_shared_connection from anon, authenticated;
grant all on public.terabox_shared_connection to service_role;

-- Retire direct access to the former per-user token table. Existing rows are retained,
-- but the application no longer reads or writes them.
revoke all on public.terabox_connections from anon, authenticated;

-- Hidden folders apply to the shared drive for every RuzBox user. Only server routes
-- using the service role read or write these rows; administrator checks stay in the API.
revoke all on public.hidden_folders from anon, authenticated;
grant all on public.hidden_folders to service_role;
