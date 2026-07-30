create table if not exists public.room_actions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  room_version bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  action jsonb not null,
  created_at timestamptz not null default now(),
  unique (room_id, room_version)
);

alter table public.room_actions enable row level security;

drop policy if exists "members can read room actions" on public.room_actions;
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
  set state = p_state, version = version + 1, updated_at = now()
  where id = p_room_id and version = p_expected_version
  returning * into updated_room;

  if updated_room.id is null then return; end if;

  insert into public.room_actions (room_id, room_version, user_id, action)
  values (p_room_id, updated_room.version, auth.uid(), p_action);
  return next updated_room;
end;
$$;

revoke all on function public.submit_room_action(uuid, bigint, jsonb, jsonb) from public;
grant execute on function public.submit_room_action(uuid, bigint, jsonb, jsonb) to authenticated;
