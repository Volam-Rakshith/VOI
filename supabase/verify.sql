-- ===========================================================================
--  IMPOSTER — project check (READ ONLY)
--
--  Paste this into:  Supabase Dashboard -> SQL Editor -> New query -> Run
--  It changes nothing. It only looks at your project and reports what is
--  there, so you can tell in one glance whether online rooms are ready.
--
--  If anything says MISSING, paste supabase/schema.sql and run it — that file
--  is safe to run as many times as you like, on a brand-new or half-set-up
--  project.
-- ===========================================================================

with checks as (
  select 'tables' as section, 'public.imposter_rooms' as item, 'room rows (one per game)' as detail,
         to_regclass('public.imposter_rooms') is not null as ok
  union all select 'tables', 'public.imposter_words', 'shared word database (optional)',
         to_regclass('public.imposter_words') is not null
  union all select 'security', 'RLS on imposter_rooms', 'row level security enabled',
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.imposter_rooms')), false)
  union all select 'security', 'RLS on imposter_words', 'row level security enabled',
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.imposter_words')), false)
  union all select 'security', 'policy: rooms readable', 'players can read the room',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'imposter_rooms' and policyname = 'rooms readable')
  union all select 'security', 'policy: rooms creatable', 'host can create a room',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'imposter_rooms' and policyname = 'rooms creatable')
  union all select 'security', 'policy: rooms updatable', 'clients can update the room',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'imposter_rooms' and policyname = 'rooms updatable')
  union all select 'security', 'policy: words readable', 'words are public to read',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'imposter_words' and policyname = 'words readable')
  union all select 'security', 'policy: words writable by authenticated', 'only a signed-in user may write words',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'imposter_words' and policyname = 'words writable by authenticated')
  union all select 'functions', 'imposter_patch_room', 'atomic room patch',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'imposter_patch_room')
  union all select 'functions', 'imposter_join_room', 'safe concurrent joins',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'imposter_join_room')
  union all select 'functions', 'imposter_leave_room', 'leave + host migration',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'imposter_leave_room')
  union all select 'functions', 'imposter_set_ready', 'ready toggle',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'imposter_set_ready')
  union all select 'functions', 'imposter_heartbeat', 'presence / drop detection',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'imposter_heartbeat')
  union all select 'functions', 'imposter_set_secrets', 'private roles + words at deal time',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'imposter_set_secrets')
  union all select 'functions', 'imposter_submit_vote', 'ballots that never collide',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'imposter_submit_vote')
  union all select 'functions', 'imposter_terminate_room', 'host closes the room',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'imposter_terminate_room')
  union all select 'functions', 'imposter_sweep_expired', 'housekeeping for old rooms',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'imposter_sweep_expired')
  union all select 'realtime', 'imposter_rooms in supabase_realtime', 'live updates between devices',
         exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'imposter_rooms')
  union all select 'realtime', 'publication supabase_realtime exists', 'Realtime enabled on the project',
         exists (select 1 from pg_publication where pubname = 'supabase_realtime')
),
marker as (
  select coalesce(obj_description(to_regclass('public.imposter_rooms'), 'pg_class'), 'no marker') as version
),
totals as (select count(*) filter (where not ok) as missing, count(*) as total from checks)

select 0 as ord, 'SETUP STATUS' as item,
       case when missing = 0
            then 'complete — ' || total || '/' || total || ' checks passed · schema ' || (select version from marker)
            else missing || ' of ' || total || ' checks FAILED — paste supabase/schema.sql and run it'
       end as result
  from totals
union all
select 1 as ord, section || ' · ' || item as item,
       case when ok then 'ok' else 'MISSING' end as result
  from checks
 order by ord, item;
