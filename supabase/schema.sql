create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  client_id text not null unique,
  slug text not null unique,
  title text not null,
  description text,
  position integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  field_definitions jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  public_slug text unique,
  last_published_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.boards
  add column if not exists updated_at timestamptz not null default now();
alter table public.boards
  add column if not exists is_public boolean not null default false;
alter table public.boards
  add column if not exists public_slug text;
alter table public.boards
  add column if not exists last_published_at timestamptz;

create table if not exists public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  client_id text not null,
  slug text not null,
  title text not null,
  description text,
  column_type text not null default 'ranked',
  position integer not null default 0,
  accent text,
  metadata jsonb not null default '{}'::jsonb,
  auto_mirror_to_column_id uuid references public.columns (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (board_id, slug),
  unique (board_id, client_id)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  client_id text not null,
  title text not null,
  series text,
  image_url text,
  image_storage_path text,
  release_year text,
  notes text,
  custom_field_values jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists items_board_client_id_key on public.items (board_id, client_id);

create table if not exists public.column_entries (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.columns (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  client_id text not null unique,
  position integer not null default 0,
  mirrored_from_entry_id uuid references public.column_entries (id) on delete set null,
  mirrored_from_client_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (column_id, item_id)
);

create table if not exists public.board_states (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  columns jsonb not null default '[]'::jsonb,
  cards_by_column jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  board_id uuid not null references public.boards (id) on delete cascade,
  board_client_id text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists board_snapshots_owner_board_created_at_idx
  on public.board_snapshots (owner_id, board_id, created_at desc);

create table if not exists public.pairwise_quiz_progress (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  board_client_id text not null,
  column_client_id text not null,
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, board_client_id, column_client_id)
);

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.items enable row level security;
alter table public.column_entries enable row level security;
alter table public.board_states enable row level security;
alter table public.board_snapshots enable row level security;
alter table public.pairwise_quiz_progress enable row level security;

create policy "profiles are readable by owner" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles are writable by owner" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "owners manage boards" on public.boards
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "public read shared boards" on public.boards
  for select using (is_public = true);

create policy "owners manage columns" on public.columns
  for all using (
    exists (
      select 1
      from public.boards
      where public.boards.id = public.columns.board_id
        and public.boards.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.boards
      where public.boards.id = public.columns.board_id
        and public.boards.owner_id = auth.uid()
    )
  );

create policy "public read shared columns" on public.columns
  for select using (
    exists (
      select 1
      from public.boards
      where public.boards.id = public.columns.board_id
        and public.boards.is_public = true
    )
  );

create policy "owners manage items" on public.items
  for all using (
    exists (
      select 1
      from public.boards
      where public.boards.id = public.items.board_id
        and public.boards.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.boards
      where public.boards.id = public.items.board_id
        and public.boards.owner_id = auth.uid()
    )
  );

create policy "public read shared items" on public.items
  for select using (
    exists (
      select 1
      from public.boards
      where public.boards.id = public.items.board_id
        and public.boards.is_public = true
    )
  );

create policy "owners manage column entries" on public.column_entries
  for all using (
    exists (
      select 1
      from public.columns
      join public.boards on public.boards.id = public.columns.board_id
      where public.columns.id = public.column_entries.column_id
        and public.boards.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.columns
      join public.boards on public.boards.id = public.columns.board_id
      where public.columns.id = public.column_entries.column_id
        and public.boards.owner_id = auth.uid()
    )
  );

create policy "public read shared column entries" on public.column_entries
  for select using (
    exists (
      select 1
      from public.columns
      join public.boards on public.boards.id = public.columns.board_id
      where public.columns.id = public.column_entries.column_id
        and public.boards.is_public = true
    )
  );

create policy "owners manage board states" on public.board_states
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "owners manage board snapshots" on public.board_snapshots
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "owners manage pairwise quiz progress" on public.pairwise_quiz_progress
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('board-artwork', 'board-artwork', true)
on conflict (id) do nothing;

create policy "owners upload artwork" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'board-artwork'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "owners update artwork" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'board-artwork'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'board-artwork'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "owners delete artwork" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'board-artwork'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "public read artwork" on storage.objects
  for select
  to public
  using (bucket_id = 'board-artwork');
