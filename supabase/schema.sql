create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

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

create table if not exists public.room_actions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  room_version bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  action jsonb not null,
  created_at timestamptz not null default now(),
  unique (room_id, room_version)
);

create index if not exists room_matches_room_played_idx
on public.room_matches (room_id, played_at desc);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_matches enable row level security;
alter table public.room_actions enable row level security;

create policy "members can read their room"
on public.rooms for select
to authenticated
using (
  exists (
    select 1 from public.room_members
    where room_members.room_id = rooms.id
      and room_members.user_id = (select auth.uid())
  )
);

create policy "members can update their room"
on public.rooms for update
to authenticated
using (
  exists (
    select 1 from public.room_members
    where room_members.room_id = rooms.id
      and room_members.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.room_members
    where room_members.room_id = rooms.id
      and room_members.user_id = (select auth.uid())
  )
);

create policy "users can read their own memberships"
on public.room_members for select
to authenticated
using (user_id = (select auth.uid()));

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

create policy "members can read room actions"
on public.room_actions for select
to authenticated
using (
  exists (
    select 1 from public.room_members
    where room_members.room_id = room_actions.room_id
      and room_members.user_id = (select auth.uid())
  )
);

create or replace function public.submit_room_action(
  p_room_id uuid,
  p_expected_version bigint,
  p_state jsonb,
  p_action jsonb
)
returns setof public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_room public.rooms;
begin
  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  ) then
    raise exception 'Room membership required';
  end if;

  update public.rooms
  set state = p_state,
      version = version + 1,
      updated_at = now()
  where id = p_room_id and version = p_expected_version
  returning * into updated_room;

  if updated_room.id is null then
    return;
  end if;

  insert into public.room_actions (room_id, room_version, user_id, action)
  values (p_room_id, updated_room.version, auth.uid(), p_action);

  return next updated_room;
end;
$$;

revoke all on function public.submit_room_action(uuid, bigint, jsonb, jsonb) from public;
grant execute on function public.submit_room_action(uuid, bigint, jsonb, jsonb) to authenticated;

create or replace function public.create_room(p_code text, p_state jsonb)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  created_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.rooms (code, owner_id, state)
  values (upper(p_code), auth.uid(), p_state)
  returning * into created_room;

  insert into public.room_members (room_id, user_id, role)
  values (created_room.id, auth.uid(), 'owner');

  return created_room;
end;
$$;

create or replace function public.join_room(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  joined_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into joined_room
  from public.rooms
  where code = upper(p_code);

  if joined_room.id is null then
    raise exception 'Room not found';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (joined_room.id, auth.uid(), 'member')
  on conflict (room_id, user_id) do nothing;

  return joined_room;
end;
$$;

revoke all on function public.create_room(text, jsonb) from public;
revoke all on function public.join_room(text) from public;
grant execute on function public.create_room(text, jsonb) to authenticated;
grant execute on function public.join_room(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end $$;
