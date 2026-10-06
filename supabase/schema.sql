-- ===========================================================================
--  IMPOSTER — by VR DEVELOPMENTS
--  Supabase schema for ONLINE ROOMS + optional shared word database.
--
--  Run this in:  Supabase Dashboard → SQL Editor → New query → Run
--
--  SCHEMA VERSION 1.0.5
--  The version is also written into the database, so supabase/verify.sql can
--  tell you which file was applied. Safe to run MORE THAN ONCE, and safe on a
--  partially set-up project: nothing is dropped and no room data is touched.
--
--  Design notes
--  ------------
--  * ONE row per room keeps realtime simple: clients subscribe to changes on a
--    single row and get the whole public game document.
--  * `room`    = PUBLIC state  (players, phase, votes, results) — never secrets.
--  * `secrets` = PRIVATE state (each player's role + word, keyed by player id).
--                Also holds `__roles__` written only by the host at game start so
--                the host can tally after a refresh.
--  * Write functions below make every mutation atomic, so two people joining
--    (or voting) at the same instant can never overwrite each other.
--
--  ⚠️ SECURITY HONESTY: the anon key ships in the browser. These policies stop
--  accidental data loss and keep secrets out of the public document — they do
--  NOT stop a determined player from inspecting the raw row. Do not use this
--  table for anything that needs real confidentiality, and never store personal
--  data in it.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.imposter_rooms (
  code         text primary key,
  status       text        not null default 'lobby',
  host_id      text,
  player_count integer     not null default 0,
  room         jsonb       not null default '{}'::jsonb,
  secrets      jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '3 hours'),
  constraint imposter_rooms_code_len  check (char_length(code) = 4),
  constraint imposter_rooms_status_ok check (status in ('lobby','playing','ended','terminated'))
);

-- Which file was applied last. supabase/verify.sql reads this back.
comment on table public.imposter_rooms is 'IMPOSTER schema v1.0.5 — safe to re-run';

create index if not exists imposter_rooms_updated_idx on public.imposter_rooms (updated_at desc);
create index if not exists imposter_rooms_status_idx  on public.imposter_rooms (status);

create table if not exists public.imposter_words (
  id         text primary key default 'default',
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.imposter_words is 'IMPOSTER schema v1.0.5 — shared word database';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.imposter_rooms enable row level security;
alter table public.imposter_words enable row level security;

-- Rooms: anyone holding the anon key may read/create/update room rows. This is
-- a party game with no accounts, so writes are open by design — but the secret
-- word lives in `secrets`, not in `room`, which is what keeps gameplay fair.
drop policy if exists "rooms readable"  on public.imposter_rooms;
create policy "rooms readable" on public.imposter_rooms for select using (true);

drop policy if exists "rooms creatable" on public.imposter_rooms;
create policy "rooms creatable" on public.imposter_rooms for insert with check (true);

drop policy if exists "rooms updatable" on public.imposter_rooms;
create policy "rooms updatable" on public.imposter_rooms for update using (true) with check (true);

-- Shared words: publicly readable, writable ONLY by a signed-in user.
-- (Client-side admin passwords are convenience only — this is the real gate.)
drop policy if exists "words readable" on public.imposter_words;
create policy "words readable" on public.imposter_words for select using (true);

drop policy if exists "words writable by authenticated" on public.imposter_words;
create policy "words writable by authenticated" on public.imposter_words
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Atomic room helpers
-- ---------------------------------------------------------------------------

-- Shallow-merge a patch into the public room document.
create or replace function public.imposter_patch_room(p_code text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room jsonb;
begin
  update public.imposter_rooms
     set room       = coalesce(room, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb),
         status     = coalesce(p_patch->>'status', status),
         updated_at = now(),
         expires_at = greatest(expires_at, now() + interval '30 minutes')
   where code = upper(p_code)
  returning room into v_room;
  return v_room;
end;
$$;

-- Add (or reconnect) a player without clobbering concurrent joins.
-- Returns { room, playerId, rejoined } or { error, message }.
create or replace function public.imposter_join_room(p_code text, p_name text, p_player_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.imposter_rooms;
  v_room     jsonb;
  v_players  jsonb;
  v_player   jsonb;
  v_rejoined boolean := false;
  v_clean    text := left(btrim(coalesce(p_name, '')), 16);
begin
  select * into v_row from public.imposter_rooms where code = upper(p_code) for update;
  if not found then
    return jsonb_build_object('error', 'NOT_FOUND', 'message', 'Room not found');
  end if;
  if v_row.status = 'terminated' then
    return jsonb_build_object('error', 'TERMINATED', 'message', 'Room closed');
  end if;
  if v_row.expires_at < now() then
    return jsonb_build_object('error', 'EXPIRED', 'message', 'Room expired');
  end if;
  if v_clean = '' then
    return jsonb_build_object('error', 'INVALID_NAME', 'message', 'Invalid name');
  end if;

  v_players := coalesce(v_row.room->'players', '[]'::jsonb);

  -- 1. rejoin by stored id
  if p_player_id is not null then
    select elem into v_player from jsonb_array_elements(v_players) elem where elem->>'id' = p_player_id limit 1;
    if v_player is not null then
      v_rejoined := true;
      v_player := v_player || jsonb_build_object('name', v_clean, 'online', true, 'lastSeen', (extract(epoch from now())*1000)::bigint);
      select jsonb_agg(case when elem->>'id' = p_player_id then v_player else elem end)
        into v_players from jsonb_array_elements(v_players) elem;
    end if;
  end if;

  -- 2. reconnect by name (same person after a refresh)
  if not v_rejoined then
    select elem into v_player from jsonb_array_elements(v_players) elem
      where lower(elem->>'name') = lower(v_clean) limit 1;
    if v_player is not null and (v_row.status <> 'lobby' or (v_player->>'online')::boolean is not false) then
      v_rejoined := true;
      select jsonb_agg(case when elem->>'id' = v_player->>'id'
                            then elem || jsonb_build_object('online', true, 'lastSeen', (extract(epoch from now())*1000)::bigint)
                            else elem end)
        into v_players from jsonb_array_elements(v_players) elem;
    elsif v_player is not null then
      return jsonb_build_object('error', 'NAME_TAKEN', 'message', 'That name is already in this room');
    end if;
  end if;

  -- 3. brand new player
  if not v_rejoined then
    if v_row.status <> 'lobby' then
      return jsonb_build_object('error', 'STARTED', 'message', 'Game in progress');
    end if;
    if jsonb_array_length(v_players) >= 20 then
      return jsonb_build_object('error', 'FULL', 'message', 'Room is full');
    end if;
    v_player := jsonb_build_object(
      'id', 'pl_' || replace(gen_random_uuid()::text, '-', ''),
      'name', v_clean,
      'isHost', false,
      'ready', false,
      'online', true,
      'joinedAt', (extract(epoch from now())*1000)::bigint,
      'lastSeen', (extract(epoch from now())*1000)::bigint,
      'score', 0
    );
    v_players := v_players || jsonb_build_array(v_player);
  end if;

  update public.imposter_rooms
     set room         = jsonb_set(coalesce(room, '{}'::jsonb), '{players}', v_players, true),
         player_count = jsonb_array_length(v_players),
         updated_at   = now(),
         expires_at   = now() + interval '3 hours'
   where code = upper(p_code)
  returning room into v_room;

  -- Return the room as it is AFTER the update: v_row is the pre-update snapshot,
  -- so sending it back would omit the player who just joined.
  return jsonb_build_object('room', coalesce(v_room, v_row.room), 'playerId', v_player->>'id', 'rejoined', v_rejoined);
end;
$$;

-- Leave / drop a player; hands the host role to the longest-standing survivor.
create or replace function public.imposter_leave_room(p_code text, p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.imposter_rooms;
  v_players jsonb;
  v_leaving jsonb;
  v_next    jsonb;
begin
  select * into v_row from public.imposter_rooms where code = upper(p_code) for update;
  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  v_players := coalesce(v_row.room->'players', '[]'::jsonb);
  select elem into v_leaving from jsonb_array_elements(v_players) elem where elem->>'id' = p_player_id limit 1;

  select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_players
    from jsonb_array_elements(v_players) elem where elem->>'id' <> p_player_id;

  if v_leaving is not null and coalesce((v_leaving->>'isHost')::boolean, false) then
    if jsonb_array_length(v_players) = 0 then
      update public.imposter_rooms
         set status = 'terminated', player_count = 0, updated_at = now()
       where code = upper(p_code);
      return jsonb_build_object('room', (select room from public.imposter_rooms where code = upper(p_code)));
    end if;
    select elem into v_next from jsonb_array_elements(v_players) elem
      order by (elem->>'joinedAt')::bigint asc limit 1;
    select jsonb_agg(case when elem->>'id' = v_next->>'id'
                          then elem || jsonb_build_object('isHost', true, 'ready', true)
                          else elem end)
      into v_players from jsonb_array_elements(v_players) elem;
    update public.imposter_rooms
       set room = jsonb_set(room, '{players}', v_players, true)
                    || jsonb_build_object('hostId', v_next->>'id'),
           player_count = jsonb_array_length(v_players),
           host_id = v_next->>'id',
           updated_at = now()
     where code = upper(p_code)
    returning room into v_row.room;
    return jsonb_build_object('room', v_row.room);
  end if;

  update public.imposter_rooms
     set room = jsonb_set(coalesce(room, '{}'::jsonb), '{players}', v_players, true),
         player_count = jsonb_array_length(v_players),
         updated_at = now()
   where code = upper(p_code)
  returning room into v_row.room;

  return jsonb_build_object('room', v_row.room);
end;
$$;

create or replace function public.imposter_set_ready(p_code text, p_player_id text, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_players jsonb;
begin
  update public.imposter_rooms r
     set room = jsonb_set(
           r.room,
           '{players}',
           (select jsonb_agg(
              case when elem->>'id' = p_player_id and coalesce((elem->>'isHost')::boolean,false) = false
                   then elem || jsonb_build_object('ready', coalesce(p_ready,false),
                                                  'lastSeen', (extract(epoch from now())*1000)::bigint)
                   else elem end)
              from jsonb_array_elements(r.room->'players') elem),
           true),
         updated_at = now()
   where r.code = upper(p_code)
  returning r.room->'players' into v_players;
  return jsonb_build_object('players', v_players);
end;
$$;

create or replace function public.imposter_heartbeat(p_code text, p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.imposter_rooms r
     set room = jsonb_set(
           r.room,
           '{players}',
           (select jsonb_agg(
              case when elem->>'id' = p_player_id
                   then elem || jsonb_build_object('online', true, 'lastSeen', (extract(epoch from now())*1000)::bigint)
                   else elem end)
              from jsonb_array_elements(r.room->'players') elem),
           true),
         updated_at = now()
   where r.code = upper(p_code);
  return jsonb_build_object('ok', true);
end;
$$;

-- Host writes the private role/word payloads and moves the room to "playing".
create or replace function public.imposter_set_secrets(p_code text, p_secrets jsonb, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room jsonb;
begin
  update public.imposter_rooms
     set secrets    = coalesce(p_secrets, '{}'::jsonb),
         room       = coalesce(room, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb),
         status     = coalesce(p_patch->>'status', status),
         updated_at = now(),
         expires_at = now() + interval '3 hours'
   where code = upper(p_code)
  returning room into v_room;
  return v_room;
end;
$$;

-- Votes are merged per player so simultaneous ballots never collide.
create or replace function public.imposter_submit_vote(p_code text, p_player_id text, p_target_id text, p_round int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room jsonb;
begin
  update public.imposter_rooms r
     set room = jsonb_set(
           jsonb_set(
             r.room,
             '{game,votes}',
             coalesce(r.room->'game'->'votes', '{}'::jsonb) || jsonb_build_object(p_player_id, p_target_id),
             true),
           '{game,submitted}',
           coalesce(r.room->'game'->'submitted', '[]'::jsonb) || to_jsonb(p_player_id),
           true),
         updated_at = now()
   where r.code = upper(p_code)
     and (r.room->'game'->>'round')::int = p_round
  returning room into v_room;
  return v_room;
end;
$$;

create or replace function public.imposter_terminate_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.imposter_rooms
     set status = 'terminated', updated_at = now()
   where code = upper(p_code);
  return jsonb_build_object('ok', true);
end;
$$;

-- Optional housekeeping: schedule with pg_cron if you have it.
create or replace function public.imposter_sweep_expired()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with gone as (
    update public.imposter_rooms
       set status = 'terminated', updated_at = now()
     where status <> 'terminated'
       and updated_at < now() - interval '3 hours'
    returning 1
  )
  select count(*) into v_count from gone;
  return v_count;
end;
$$;

-- Grant execution to the public API roles.
grant execute on function public.imposter_patch_room(text, jsonb)                to anon, authenticated;
grant execute on function public.imposter_join_room(text, text, text)            to anon, authenticated;
grant execute on function public.imposter_leave_room(text, text)                 to anon, authenticated;
grant execute on function public.imposter_set_ready(text, text, boolean)         to anon, authenticated;
grant execute on function public.imposter_heartbeat(text, text)                  to anon, authenticated;
grant execute on function public.imposter_set_secrets(text, jsonb, jsonb)        to anon, authenticated;
grant execute on function public.imposter_submit_vote(text, text, text, integer) to anon, authenticated;
grant execute on function public.imposter_terminate_room(text)                   to anon, authenticated;

-- Table privileges. Supabase grants these to anon/authenticated on new tables in
-- `public` by default; stating them here means a project with customised default
-- privileges still works, and row access stays governed by the policies above.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.imposter_rooms to anon, authenticated;
grant select on public.imposter_words to anon, authenticated;
grant insert, update, delete on public.imposter_words to authenticated;

-- Make sure realtime streams room changes to subscribed clients.
-- Guarded so this whole file can be re-run safely at any time.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'imposter_rooms'
  ) then
    alter publication supabase_realtime add table public.imposter_rooms;
    raise notice 'Realtime: imposter_rooms added to supabase_realtime.';
  else
    raise notice 'Realtime: imposter_rooms is already streamed.';
  end if;
exception
  when undefined_object then
    raise notice 'Realtime: publication supabase_realtime not found — enable it under Database -> Replication.';
end $$;
