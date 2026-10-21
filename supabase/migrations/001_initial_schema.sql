create extension if not exists pgcrypto;

create table if not exists public.terabox_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_ciphertext text not null,
  api_domain text not null,
  upload_domain text not null,
  terabox_user_id text,
  access_expires_at timestamptz not null,
  domain_refreshed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fs_id text not null,
  path text not null,
  name text not null,
  size bigint not null default 0 check (size >= 0),
  is_dir boolean not null default false,
  category integer,
  modified_at timestamptz,
  md5 text,
  updated_at timestamptz not null default now(),
  unique (user_id, fs_id),
  unique (user_id, path)
);
create index if not exists files_user_path_idx on public.files(user_id, path);
create index if not exists files_user_modified_idx on public.files(user_id, modified_at desc);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('upload','download','rename','move','copy','delete','connect','disconnect')),
  file_name text,
  created_at timestamptz not null default now()
);
create index if not exists activity_user_created_idx on public.activity_log(user_id, created_at desc);

alter table public.terabox_connections enable row level security;
alter table public.files enable row level security;
alter table public.activity_log enable row level security;

create policy "Users can manage their own TeraBox connection" on public.terabox_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own file metadata" on public.files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can read their own activity" on public.activity_log
  for select using (auth.uid() = user_id);
create policy "Users can write their own activity" on public.activity_log
  for insert with check (auth.uid() = user_id);

grant select, insert, update, delete on public.files to authenticated;
grant select, insert, update, delete on public.terabox_connections to authenticated;
grant select, insert on public.activity_log to authenticated;
