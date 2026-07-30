create table if not exists public.room_matches (
  id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  round integer not null check (round > 0),
  court_id integer not null check (court_id > 0),
  team_a jsonb not null,
  team_b jsonb not null,
  libero_a text,
  libero_b text,
  winner text not null check (winner in ('A', 'B')),
  played_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists room_matches_room_played_idx
on public.room_matches (room_id, played_at desc);

alter table public.room_matches enable row level security;

drop policy if exists "members can read room matches" on public.room_matches;
create policy "members can read room matches"
on public.room_matches for select
to authenticated
using (
  exists (
    select 1 from public.room_members
    where room_members.room_id = room_matches.room_id
      and room_members.user_id = (select auth.uid())
  )
);

drop policy if exists "members can insert room matches" on public.room_matches;
create policy "members can insert room matches"
on public.room_matches for insert
to authenticated
with check (
  exists (
    select 1 from public.room_members
    where room_members.room_id = room_matches.room_id
      and room_members.user_id = (select auth.uid())
  )
);

drop policy if exists "members can update room matches" on public.room_matches;
create policy "members can update room matches"
on public.room_matches for update
to authenticated
using (
  exists (
    select 1 from public.room_members
    where room_members.room_id = room_matches.room_id
      and room_members.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.room_members
    where room_members.room_id = room_matches.room_id
      and room_members.user_id = (select auth.uid())
  )
);
