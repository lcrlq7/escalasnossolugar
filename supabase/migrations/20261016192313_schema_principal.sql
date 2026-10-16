create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.app_role as enum ('admin', 'leader', 'minister', 'sound_tech');
create type public.event_status as enum ('draft', 'published', 'completed', 'cancelled');
create type public.response_status as enum ('pending', 'confirmed', 'declined');
create type public.availability_status as enum ('available', 'unavailable');
create type public.setlist_item_kind as enum ('song', 'note', 'prayer', 'transition');

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  system_name text not null default 'Louvor em Escala',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  church_id uuid references public.churches(id) on delete set null,
  full_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_church_idx on public.profiles(church_id);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index members_church_idx on public.members(church_id);

create table public.worship_functions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  name text not null,
  is_required boolean not null default false,
  is_main boolean not null default false,
  is_instrument boolean not null default true,
  sort_order int not null default 0,
  active boolean not null default true,
  unique (church_id, name)
);

create table public.member_functions (
  member_id uuid not null references public.members(id) on delete cascade,
  function_id uuid not null references public.worship_functions(id) on delete cascade,
  primary key (member_id, function_id)
);

create table public.service_schedules (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  name text not null,
  event_type text not null default 'sunday_service',
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time,
  location text,
  active boolean not null default true
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  title text not null,
  event_type text not null default 'sunday_service'
    check (event_type in ('sunday_service','thursday_service','rehearsal','vigil','conference','custom')),
  event_date date not null,
  start_time time not null,
  end_time time,
  location text,
  leader_member_id uuid references public.members(id) on delete set null,
  notes text,
  tech_notes text,
  sound_ready boolean not null default false,
  sound_ready_by uuid references public.profiles(id) on delete set null,
  status public.event_status not null default 'draft',
  published_at timestamptz,
  cancel_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);
create index events_church_date_idx on public.events(church_id, event_date);

create table public.event_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  function_id uuid not null references public.worship_functions(id) on delete restrict,
  status public.response_status not null default 'pending',
  responded_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now(),
  unique (event_id, member_id, function_id)
);
create index event_assignments_event_idx on public.event_assignments(event_id);
create index event_assignments_member_idx on public.event_assignments(member_id);
create index event_assignments_function_idx on public.event_assignments(function_id);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  status public.availability_status not null,
  note text,
  created_at timestamptz not null default now(),
  unique (member_id, date)
);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  title text not null,
  artist text,
  cover_url text,
  original_key text,
  church_key text,
  bpm int check (bpm is null or bpm between 20 and 300),
  duration_seconds int check (duration_seconds is null or duration_seconds > 0),
  lyrics text,
  youtube_url text,
  spotify_url text,
  album text,
  tags text[] not null default '{}',
  notes text,
  is_habitual boolean not null default false,
  archived boolean not null default false,
  source text not null default 'manual',
  dedupe_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index songs_dedupe_idx on public.songs(church_id, dedupe_key);
create index songs_title_trgm_idx on public.songs using gin (title extensions.gin_trgm_ops);

create table public.song_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  primary key (user_id, song_id)
);
create index song_favorites_song_idx on public.song_favorites(song_id);

create table public.song_suggestions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  suggested_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null,
  artist text,
  link text,
  note text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now()
);
create index song_suggestions_church_idx on public.song_suggestions(church_id);
create index song_suggestions_user_idx on public.song_suggestions(suggested_by);

create table public.setlist_categories (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (church_id, name)
);

create table public.setlists (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  name text not null,
  event_id uuid unique references public.events(id) on delete cascade,
  is_template boolean not null default false,
  is_favorite boolean not null default false,
  theme text,
  notes text,
  share_token uuid not null default gen_random_uuid() unique,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index setlists_church_idx on public.setlists(church_id);

create table public.setlist_items (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references public.setlists(id) on delete cascade,
  position int not null default 0,
  kind public.setlist_item_kind not null default 'song',
  song_id uuid references public.songs(id) on delete restrict,
  category_id uuid references public.setlist_categories(id) on delete set null,
  key_override text,
  note text,
  duration_override_seconds int,
  created_at timestamptz not null default now(),
  check (kind <> 'song' or song_id is not null)
);
create index setlist_items_setlist_idx on public.setlist_items(setlist_id, position);
create index setlist_items_song_idx on public.setlist_items(song_id);
create index setlist_items_category_idx on public.setlist_items(category_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  church_id uuid references public.churches(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  title text not null,
  body text,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index announcements_church_idx on public.announcements(church_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  church_id uuid references public.churches(id) on delete cascade,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_church_idx on public.audit_logs(church_id, created_at desc);

create index events_leader_idx on public.events(leader_member_id);
create index service_schedules_church_idx on public.service_schedules(church_id);
create index worship_functions_church_idx on public.worship_functions(church_id);
create index setlist_categories_church_idx on public.setlist_categories(church_id);
create index member_functions_function_idx on public.member_functions(function_id);

create function private.church_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.church_id from public.profiles p where p.id = auth.uid() and p.active
$$;

create function private.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = r and p.active
  )
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select private.has_role('admin') $$;

create function private.is_leader() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('admin') or private.has_role('leader')
$$;

create function private.member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  join public.profiles p on p.id = m.profile_id
  where m.profile_id = auth.uid() and m.active and p.active
$$;

create function private.notify(p_user uuid, p_church uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id, church_id, type, title, body, link)
  values (p_user, p_church, p_type, p_title, p_body, p_link)
$$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger setlists_touch before update on public.setlists
  for each row execute function private.touch_updated_at();

create function private.songs_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.dedupe_key :=
    regexp_replace(lower(extensions.unaccent(coalesce(new.title, ''))), '[^a-z0-9]+', '', 'g')
    || '|' ||
    regexp_replace(lower(extensions.unaccent(coalesce(new.artist, ''))), '[^a-z0-9]+', '', 'g');
  new.updated_at := now();
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger songs_before_trg before insert or update on public.songs
  for each row execute function private.songs_before();

create function private.events_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
  else
    new.updated_by := auth.uid();
    if new.status = 'published' and old.status is distinct from 'published' then
      new.published_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger events_before_trg before insert or update on public.events
  for each row execute function private.events_before();

create function private.events_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.setlists(church_id, name, event_id, created_by)
  values (new.church_id, new.title, new.id, new.created_by);
  return new;
end $$;
create trigger events_after_insert_trg after insert on public.events
  for each row execute function private.events_after_insert();

create function private.events_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    insert into public.notifications(user_id, church_id, type, title, body, link)
    select distinct m.profile_id, new.church_id, 'assignment',
           'Você foi escalado: ' || new.title,
           to_char(new.event_date, 'DD/MM/YYYY') || ' às ' || to_char(new.start_time, 'HH24:MI') || '. Confirme sua presença.',
           '/escalas/' || new.id
    from public.event_assignments a join public.members m on m.id = a.member_id
    where a.event_id = new.id and m.profile_id is not null;
  elsif new.status = 'cancelled' and old.status = 'published' then
    insert into public.notifications(user_id, church_id, type, title, body, link)
    select distinct m.profile_id, new.church_id, 'cancel', 'Escala cancelada: ' || new.title,
           to_char(new.event_date, 'DD/MM/YYYY') || ' às ' || to_char(new.start_time, 'HH24:MI'),
           '/escalas/' || new.id
    from public.event_assignments a join public.members m on m.id = a.member_id
    where a.event_id = new.id and m.profile_id is not null;
  elsif new.status = 'published' and old.status = 'published'
        and (new.event_date <> old.event_date or new.start_time <> old.start_time) then
    insert into public.notifications(user_id, church_id, type, title, body, link)
    select distinct m.profile_id, new.church_id, 'change', 'Escala alterada: ' || new.title,
           'Novo horário: ' || to_char(new.event_date, 'DD/MM/YYYY') || ' às ' || to_char(new.start_time, 'HH24:MI'),
           '/escalas/' || new.id
    from public.event_assignments a join public.members m on m.id = a.member_id
    where a.event_id = new.id and m.profile_id is not null;
  end if;
  return new;
end $$;
create trigger events_after_update_trg after update on public.events
  for each row execute function private.events_after_update();

create function private.assignments_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ev public.events; mp uuid;
begin
  select * into ev from public.events where id = new.event_id;
  select profile_id into mp from public.members where id = new.member_id;
  if ev.status = 'published' and mp is not null then
    perform private.notify(mp, ev.church_id, 'assignment', 'Você foi escalado: ' || ev.title,
      to_char(ev.event_date, 'DD/MM/YYYY') || ' às ' || to_char(ev.start_time, 'HH24:MI') || '. Confirme sua presença.',
      '/escalas/' || ev.id);
  end if;
  return new;
end $$;
create trigger assignments_after_insert_trg after insert on public.event_assignments
  for each row execute function private.assignments_after_insert();

create function private.assignments_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ev public.events; mname text;
begin
  if new.status = 'declined' and old.status is distinct from 'declined' then
    select * into ev from public.events where id = new.event_id;
    select full_name into mname from public.members where id = new.member_id;
    insert into public.notifications(user_id, church_id, type, title, body, link)
    select distinct ur.user_id, ev.church_id, 'decline', mname || ' recusou a escala',
           ev.title || ' — ' || to_char(ev.event_date, 'DD/MM/YYYY') || '. Reorganize a equipe.',
           '/escalas/' || ev.id
    from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.role in ('admin', 'leader') and p.active and p.church_id = ev.church_id;
  end if;
  return new;
end $$;
create trigger assignments_after_update_trg after update on public.event_assignments
  for each row execute function private.assignments_after_update();

create function private.touch_event_from_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  v_event := coalesce(new.event_id, old.event_id);
  update public.events set updated_at = now(), updated_by = auth.uid() where id = v_event;
  return coalesce(new, old);
end $$;
create trigger assignments_touch_event after insert or delete on public.event_assignments
  for each row execute function private.touch_event_from_assignment();

create function private.touch_event_from_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_setlist uuid;
begin
  v_setlist := coalesce(new.setlist_id, old.setlist_id);
  update public.events set updated_at = now(), updated_by = auth.uid()
  where id = (select event_id from public.setlists where id = v_setlist);
  return coalesce(new, old);
end $$;
create trigger setlist_items_touch_event after insert or update or delete on public.setlist_items
  for each row execute function private.touch_event_from_item();

create function private.suggestions_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(user_id, church_id, type, title, body, link)
  select distinct ur.user_id, new.church_id, 'suggestion', 'Nova sugestão de música',
         new.title || coalesce(' — ' || new.artist, ''), '/musicas?aba=sugestoes'
  from public.user_roles ur join public.profiles p on p.id = ur.user_id
  where ur.role in ('admin', 'leader') and p.active and p.church_id = new.church_id;
  return new;
end $$;
create trigger suggestions_after_insert_trg after insert on public.song_suggestions
  for each row execute function private.suggestions_after_insert();

create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_old jsonb; v_changed jsonb := '[]'::jsonb;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    select coalesce(jsonb_agg(k), '[]'::jsonb) into v_changed
    from jsonb_object_keys(v_row) as k
    where (v_row -> k) is distinct from (v_old -> k) and k not in ('updated_at', 'updated_by');
    if v_changed = '[]'::jsonb then return new; end if;
  end if;
  insert into public.audit_logs(church_id, user_id, action, entity, entity_id, details)
  values (nullif(v_row ->> 'church_id', '')::uuid, auth.uid(), lower(tg_op), tg_table_name, v_row ->> 'id',
          jsonb_build_object('label', coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'full_name'),
                             'changed', v_changed));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger audit_events after insert or update or delete on public.events
  for each row execute function private.audit_row();
create trigger audit_songs after insert or update or delete on public.songs
  for each row execute function private.audit_row();
create trigger audit_members after insert or update or delete on public.members
  for each row execute function private.audit_row();
create trigger audit_functions after insert or update or delete on public.worship_functions
  for each row execute function private.audit_row();
create trigger audit_schedules after insert or update or delete on public.service_schedules
  for each row execute function private.audit_row();
create trigger audit_churches after update on public.churches
  for each row execute function private.audit_row();

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_church uuid; v_first boolean; v_name text;
begin
  select id into v_church from public.churches order by created_at limit 1;
  select not exists (select 1 from public.user_roles where role = 'admin') into v_first;
  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
  insert into public.profiles(id, church_id, full_name, email, active)
  values (new.id, v_church, v_name, new.email, v_first);
  if v_first then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
    insert into public.members(church_id, profile_id, full_name, email)
    values (v_church, new.id, v_name, new.email);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
