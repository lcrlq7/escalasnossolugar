-- O ministro responsável (events.leader_member_id) pode montar o repertório da própria escala,
-- mesmo sem cargo de líder.
create or replace function private.leads_setlist(p_setlist uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.setlists s join public.events e on e.id = s.event_id
    where s.id = p_setlist and s.church_id = private.church_id()
      and e.leader_member_id is not null and e.leader_member_id = private.member_id())
$$;

create or replace function private.leads_any_event() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e
    where e.church_id = private.church_id() and e.leader_member_id is not null
      and e.leader_member_id = private.member_id() and e.status <> 'cancelled')
$$;

alter policy items_ins on public.setlist_items
  with check ((select private.is_leader()) or (select private.leads_setlist(setlist_id)));
alter policy items_upd on public.setlist_items
  using ((select private.is_leader()) or (select private.leads_setlist(setlist_id)))
  with check ((select private.is_leader()) or (select private.leads_setlist(setlist_id)));
alter policy items_del on public.setlist_items
  using ((select private.is_leader()) or (select private.leads_setlist(setlist_id)));
alter policy setlists_select on public.setlists
  using (church_id = (select private.church_id())
         and ((select private.is_leader()) or (select private.leads_setlist(id)) or event_id in (select e.id from public.events e)));

create or replace function public.set_item_rehearsed(p_item uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_set uuid;
begin
  select s.event_id, s.id into v_event, v_set from public.setlist_items i join public.setlists s on s.id = i.setlist_id
   where i.id = p_item and s.church_id = private.church_id();
  if not found then raise exception 'Item não encontrado'; end if;
  if not (private.is_leader() or private.leads_setlist(v_set)
          or exists (select 1 from public.event_assignments a where a.event_id = v_event and a.member_id = private.member_id())) then
    raise exception 'Sem permissão';
  end if;
  update public.setlist_items set rehearsed = p_value where id = p_item;
end $$;

revoke all on function private.leads_setlist(uuid), private.leads_any_event() from public, anon;
grant execute on function private.leads_setlist(uuid), private.leads_any_event() to authenticated;

-- usado pelo front para saber se o usuário pode usar o Spotify
create or replace function public.can_plan_playlists() returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_leader() or private.leads_any_event()
$$;
revoke all on function public.can_plan_playlists() from public, anon;
grant execute on function public.can_plan_playlists() to authenticated;
