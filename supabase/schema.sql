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

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

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
