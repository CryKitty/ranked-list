create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  slug text not null,
  title text not null,
  column_type text not null default 'ranked',
  position integer not null default 0,
  auto_mirror_to_column_id uuid references public.columns (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (board_id, slug)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  title text not null,
  series text,
  image_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.column_entries (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.columns (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  position integer not null default 0,
  mirrored_from_entry_id uuid references public.column_entries (id) on delete set null,
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

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.items enable row level security;
alter table public.column_entries enable row level security;
alter table public.board_states enable row level security;

create policy "profiles are readable by owner" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles are writable by owner" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "owners manage boards" on public.boards
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

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

create policy "owners manage board states" on public.board_states
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
