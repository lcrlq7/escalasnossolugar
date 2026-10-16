create function public.admin_set_user_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Apenas administradores podem fazer isso'; end if;
  if p_user = auth.uid() and not p_active then raise exception 'Você não pode desativar a própria conta'; end if;
  update public.profiles set active = p_active
   where id = p_user and church_id = private.church_id();
  if not found then raise exception 'Usuário não encontrado'; end if;
  insert into public.audit_logs(church_id, user_id, action, entity, entity_id, details)
  values (private.church_id(), auth.uid(), case when p_active then 'activate' else 'deactivate' end,
          'profiles', p_user::text, jsonb_build_object('label', (select full_name from public.profiles where id = p_user)));
end $$;

create function public.admin_link_member(p_user uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Apenas administradores podem fazer isso'; end if;
  if not exists (select 1 from public.profiles where id = p_user and church_id = private.church_id()) then
    raise exception 'Usuário não encontrado';
  end if;
  update public.members set profile_id = null where profile_id = p_user and church_id = private.church_id();
  if p_member is not null then
    update public.members set profile_id = p_user
     where id = p_member and church_id = private.church_id();
    if not found then raise exception 'Integrante não encontrado'; end if;
  end if;
end $$;

create function public.admin_create_member_for_user(p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_prof public.profiles;
begin
  if not private.is_admin() then raise exception 'Apenas administradores podem fazer isso'; end if;
  select * into v_prof from public.profiles where id = p_user and church_id = private.church_id();
  if not found then raise exception 'Usuário não encontrado'; end if;
  select id into v_id from public.members where profile_id = p_user;
  if v_id is not null then return v_id; end if;
  insert into public.members(church_id, profile_id, full_name, email, phone)
  values (v_prof.church_id, p_user, v_prof.full_name, v_prof.email, v_prof.phone)
  returning id into v_id;
  return v_id;
end $$;

create function public.event_alerts(p_event_id uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare ev public.events; res jsonb := '[]'::jsonb; r record; v_names text; v_n int;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then return res; end if;

  if not exists (select 1 from public.event_assignments a
                 join public.worship_functions f on f.id = a.function_id
                 where a.event_id = ev.id and f.is_main) then
    res := res || jsonb_build_object('type', 'no_main_minister', 'severity', 'error',
                                     'message', 'A escala está sem ministro principal');
  end if;

  if ev.leader_member_id is null then
    res := res || jsonb_build_object('type', 'no_leader', 'severity', 'warning',
                                     'message', 'Nenhum líder responsável definido');
  end if;

  for r in
    select f.id, f.name from public.worship_functions f
    where f.church_id = ev.church_id and f.is_required and f.active and not f.is_main
      and not exists (select 1 from public.event_assignments a where a.event_id = ev.id and a.function_id = f.id)
  loop
    res := res || jsonb_build_object('type', 'missing_required', 'severity', 'warning',
                                     'message', 'Função obrigatória sem integrante: ' || r.name,
                                     'function_id', r.id);
  end loop;

  for r in
    select distinct on (a.member_id) a.member_id, m.full_name, e2.title as other_title, e2.start_time as other_start
    from public.event_assignments a
    join public.members m on m.id = a.member_id
    join public.event_assignments a2 on a2.member_id = a.member_id and a2.event_id <> a.event_id
    join public.events e2 on e2.id = a2.event_id
    where a.event_id = ev.id and e2.event_date = ev.event_date and e2.status <> 'cancelled'
      and ev.start_time < coalesce(e2.end_time, case when e2.start_time < time '22:00' then e2.start_time + interval '2 hours' else time '23:59:59' end)
      and e2.start_time < coalesce(ev.end_time, case when ev.start_time < time '22:00' then ev.start_time + interval '2 hours' else time '23:59:59' end)
  loop
    res := res || jsonb_build_object('type', 'conflict', 'severity', 'error', 'member_id', r.member_id,
             'message', r.full_name || ' também está escalado(a) em "' || r.other_title || '" às '
                        || to_char(r.other_start, 'HH24:MI') || ' (horário sobreposto)');
  end loop;

  for r in
    select distinct m.id, m.full_name from public.event_assignments a
    join public.members m on m.id = a.member_id
    join public.availability av on av.member_id = a.member_id and av.date = ev.event_date and av.status = 'unavailable'
    where a.event_id = ev.id
  loop
    res := res || jsonb_build_object('type', 'unavailable', 'severity', 'error', 'member_id', r.id,
             'message', r.full_name || ' informou indisponibilidade nesta data');
  end loop;

  select count(distinct a.member_id), string_agg(distinct m.full_name, ', ') into v_n, v_names
  from public.event_assignments a join public.members m on m.id = a.member_id
  where a.event_id = ev.id and a.status = 'declined';
  if v_n > 0 then
    res := res || jsonb_build_object('type', 'declined', 'severity', 'error',
             'message', 'Recusaram a escala: ' || v_names);
  end if;

  select count(distinct a.member_id), string_agg(distinct m.full_name, ', ') into v_n, v_names
  from public.event_assignments a join public.members m on m.id = a.member_id
  where a.event_id = ev.id and a.status = 'pending';
  if v_n > 0 and ev.status = 'published' then
    res := res || jsonb_build_object('type', 'pending', 'severity', 'info',
             'message', 'Ainda não confirmaram: ' || v_names);
  end if;
  return res;
end $$;

create function public.upcoming_event_alerts(p_from date, p_to date)
returns table(event_id uuid, title text, event_date date, start_time time, status public.event_status, alerts jsonb)
language sql stable set search_path = '' as $$
  select e.id, e.title, e.event_date, e.start_time, e.status, a.alerts
  from public.events e
  cross join lateral (select public.event_alerts(e.id) as alerts) a
  where e.event_date between p_from and p_to and e.status in ('draft', 'published')
    and jsonb_array_length(a.alerts) > 0
  order by e.event_date, e.start_time
$$;

create function public.find_similar_songs(p_title text, p_artist text default null)
returns setof public.songs language sql stable set search_path = '' as $$
  select s.* from public.songs s
  where extensions.similarity(s.title, p_title) >= 0.5
    and (p_artist is null or p_artist = '' or s.artist is null
         or extensions.similarity(s.artist, p_artist) >= 0.3)
  order by extensions.similarity(s.title, p_title) desc
  limit 5
$$;

create function public.reorder_setlist_items(p_setlist uuid, p_ids uuid[])
returns void language sql set search_path = '' as $$
  update public.setlist_items i set position = t.ord
  from unnest(p_ids) with ordinality as t(id, ord)
  where i.id = t.id and i.setlist_id = p_setlist
$$;

create function public.get_shared_setlist(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.setlists; ev public.events;
begin
  select * into s from public.setlists where share_token = p_token;
  if not found or s.church_id is distinct from private.church_id() then return null; end if;
  if s.event_id is not null then select * into ev from public.events where id = s.event_id; end if;
  if not private.is_leader() and (s.event_id is null or ev.status = 'draft') then return null; end if;
  return jsonb_build_object(
    'setlist', jsonb_build_object('id', s.id, 'name', s.name, 'theme', s.theme, 'notes', s.notes),
    'event', case when ev.id is null then null else jsonb_build_object(
        'id', ev.id, 'title', ev.title, 'event_date', ev.event_date, 'start_time', ev.start_time,
        'location', ev.location, 'status', ev.status) end,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'kind', i.kind, 'note', i.note,
        'key', coalesce(i.key_override, so.church_key, so.original_key),
        'category', c.name,
        'duration_seconds', coalesce(i.duration_override_seconds, so.duration_seconds),
        'song', case when so.id is null then null else jsonb_build_object(
            'id', so.id, 'title', so.title, 'artist', so.artist, 'cover_url', so.cover_url,
            'youtube_url', so.youtube_url, 'spotify_url', so.spotify_url, 'album', so.album,
            'lyrics', so.lyrics) end
      ) order by i.position), '[]'::jsonb)
      from public.setlist_items i
      left join public.songs so on so.id = i.song_id
      left join public.setlist_categories c on c.id = i.category_id
      where i.setlist_id = s.id)
  );
end $$;

create function public.duplicate_event(p_event_id uuid, p_new_date date)
returns uuid language plpgsql set search_path = '' as $$
declare ev public.events; v_new uuid; v_src_set uuid; v_dst_set uuid;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then raise exception 'Escala não encontrada'; end if;
  insert into public.events(church_id, title, event_type, event_date, start_time, end_time, location,
                            leader_member_id, notes, tech_notes, status)
  values (ev.church_id, ev.title, ev.event_type, p_new_date, ev.start_time, ev.end_time, ev.location,
          ev.leader_member_id, ev.notes, ev.tech_notes, 'draft')
  returning id into v_new;
  insert into public.event_assignments(event_id, member_id, function_id)
  select v_new, member_id, function_id from public.event_assignments where event_id = p_event_id;
  select id into v_src_set from public.setlists where event_id = p_event_id;
  select id into v_dst_set from public.setlists where event_id = v_new;
  if v_src_set is not null and v_dst_set is not null then
    insert into public.setlist_items(setlist_id, position, kind, song_id, category_id, key_override, note, duration_override_seconds)
    select v_dst_set, position, kind, song_id, category_id, key_override, note, duration_override_seconds
    from public.setlist_items where setlist_id = v_src_set;
  end if;
  return v_new;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
