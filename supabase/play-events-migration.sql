create extension if not exists pgcrypto;

create table if not exists public.play_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  public_code text not null unique check (public_code ~ '^[A-Z0-9]{8}$'),
  title text not null check (char_length(title) between 1 and 120),
  play_date date not null,
  starts_at time not null,
  ends_at time,
  location text not null default '',
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'open' check (status in ('open', 'closed', 'finished')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.play_event_attendance (
  event_id uuid not null references public.play_events(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  response text not null default 'going' check (response in ('going', 'maybe', 'cancelled')),
  checked_in_at timestamptz,
  queued_at timestamptz,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

alter table public.room_matches
add column if not exists play_event_id uuid references public.play_events(id) on delete set null;

create index if not exists room_matches_play_event_idx
on public.room_matches (play_event_id, played_at);

create index if not exists play_events_room_date_idx
on public.play_events (room_id, play_date desc, starts_at desc);

create index if not exists play_event_attendance_event_idx
on public.play_event_attendance (event_id, updated_at);

alter table public.play_events enable row level security;
alter table public.play_event_attendance enable row level security;

drop policy if exists "members can read room play events" on public.play_events;
create policy "members can read room play events"
on public.play_events for select
to authenticated
using (
  exists (
    select 1 from public.room_members
    where room_members.room_id = play_events.room_id
      and room_members.user_id = (select auth.uid())
  )
);

drop policy if exists "members can read play attendance" on public.play_event_attendance;
create policy "members can read play attendance"
on public.play_event_attendance for select
to authenticated
using (
  exists (
    select 1
    from public.play_events
    join public.room_members on room_members.room_id = play_events.room_id
    where play_events.id = play_event_attendance.event_id
      and room_members.user_id = (select auth.uid())
  )
);

create or replace function public.create_play_event(
  p_room_id uuid,
  p_title text,
  p_play_date date,
  p_starts_at time,
  p_ends_at time default null,
  p_location text default '',
  p_capacity integer default null
)
returns public.play_events
language plpgsql
security definer
set search_path = public
as $$
declare
  created_event public.play_events;
  code text;
begin
  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  ) then
    raise exception 'Room membership required';
  end if;

  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.play_events where public_code = code);
  end loop;

  insert into public.play_events (
    room_id, public_code, title, play_date, starts_at, ends_at, location, capacity, created_by
  ) values (
    p_room_id, code, trim(p_title), p_play_date, p_starts_at, p_ends_at,
    coalesce(trim(p_location), ''), p_capacity, auth.uid()
  ) returning * into created_event;

  return created_event;
end;
$$;

create or replace function public.get_public_play_event(p_public_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'event', to_jsonb(play_events),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player ->> 'id',
        'name', player ->> 'name'
      ) order by player ->> 'name')
      from jsonb_array_elements(rooms.state -> 'players') player
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(to_jsonb(play_event_attendance) order by play_event_attendance.updated_at)
      from public.play_event_attendance
      where play_event_attendance.event_id = play_events.id
    ), '[]'::jsonb)
  )
  from public.play_events
  join public.rooms on rooms.id = play_events.room_id
  where play_events.public_code = upper(p_public_code);
$$;

create or replace function public.set_public_play_attendance(
  p_public_code text,
  p_player_id text,
  p_response text,
  p_check_in boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event public.play_events;
  target_room public.rooms;
  selected_player jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_response not in ('going', 'maybe', 'cancelled') then raise exception 'Invalid response'; end if;

  select * into target_event
  from public.play_events
  where public_code = upper(p_public_code) and status = 'open'
  for update;
  if target_event.id is null then raise exception 'Event not found or closed'; end if;

  select * into target_room from public.rooms where id = target_event.room_id;
  select player into selected_player
  from jsonb_array_elements(target_room.state -> 'players') player
  where player ->> 'id' = p_player_id;
  if selected_player is null then raise exception 'Player not found'; end if;

  if exists (
    select 1 from public.play_event_attendance
    where event_id = target_event.id
      and player_id = p_player_id
      and user_id <> auth.uid()
  ) and not exists (
    select 1 from public.room_members
    where room_id = target_event.room_id and user_id = auth.uid()
  ) then
    raise exception 'This player is already registered on another device';
  end if;

  if (p_response = 'going' or p_check_in)
    and target_event.capacity is not null
    and not exists (
      select 1 from public.play_event_attendance
      where event_id = target_event.id and player_id = p_player_id and response = 'going'
    )
    and (
      select count(*) from public.play_event_attendance
      where event_id = target_event.id and response = 'going'
    ) >= target_event.capacity
  then
    raise exception 'Event capacity reached';
  end if;

  insert into public.play_event_attendance (
    event_id, player_id, player_name, response, checked_in_at, user_id
  ) values (
    target_event.id,
    p_player_id,
    selected_player ->> 'name',
    case when p_check_in then 'going' else p_response end,
    case when p_check_in then now() else null end,
    auth.uid()
  )
  on conflict (event_id, player_id) do update set
    player_name = excluded.player_name,
    response = excluded.response,
    checked_in_at = case
      when excluded.response = 'cancelled' then null
      when p_check_in then now()
      else play_event_attendance.checked_in_at
    end,
    queued_at = case when excluded.response = 'cancelled' then null else play_event_attendance.queued_at end,
    user_id = auth.uid(),
    updated_at = now();

  return public.get_public_play_event(p_public_code);
end;
$$;

create or replace function public.mark_play_attendance_queued(
  p_room_id uuid,
  p_event_id uuid,
  p_player_id text
)
returns public.play_event_attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_attendance public.play_event_attendance;
begin
  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  ) then
    raise exception 'Room membership required';
  end if;

  update public.play_event_attendance
  set queued_at = now(), updated_at = now()
  where event_id = p_event_id
    and player_id = p_player_id
    and checked_in_at is not null
    and exists (
      select 1 from public.play_events
      where play_events.id = p_event_id and play_events.room_id = p_room_id
    )
  returning * into updated_attendance;

  if updated_attendance.event_id is null then raise exception 'Checked-in player not found'; end if;
  return updated_attendance;
end;
$$;

revoke all on function public.create_play_event(uuid, text, date, time, time, text, integer) from public;
revoke all on function public.get_public_play_event(text) from public;
revoke all on function public.set_public_play_attendance(text, text, text, boolean) from public;
revoke all on function public.mark_play_attendance_queued(uuid, uuid, text) from public;
grant execute on function public.create_play_event(uuid, text, date, time, time, text, integer) to authenticated;
grant execute on function public.get_public_play_event(text) to authenticated;
grant execute on function public.set_public_play_attendance(text, text, text, boolean) to authenticated;
grant execute on function public.mark_play_attendance_queued(uuid, uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.play_events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.play_event_attendance;
exception when duplicate_object then null;
end $$;
