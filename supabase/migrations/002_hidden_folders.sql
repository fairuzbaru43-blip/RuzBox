create table if not exists public.hidden_folders (
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null check (length(path) between 1 and 2048),
  name text not null check (length(name) between 1 and 255),
  created_at timestamptz not null default now(),
  primary key (user_id, path)
);

create or replace function public.is_ruzbox_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'ruzbox_role' = 'admin', false);
$$;

alter table public.hidden_folders enable row level security;

create policy "RuzBox admins can read their own hidden folders"
  on public.hidden_folders for select to authenticated
  using (auth.uid() = user_id and public.is_ruzbox_admin());

create policy "RuzBox admins can hide their own folders"
  on public.hidden_folders for insert to authenticated
  with check (auth.uid() = user_id and public.is_ruzbox_admin());

create policy "RuzBox admins can restore their own hidden folders"
  on public.hidden_folders for delete to authenticated
  using (auth.uid() = user_id and public.is_ruzbox_admin());

grant select, insert, delete on public.hidden_folders to authenticated;
grant execute on function public.is_ruzbox_admin() to authenticated;
