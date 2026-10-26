-- Quem está na função principal (Ministro principal) da escala também monta o repertório e cria a playlist,
-- além do "líder responsável" do evento.
create or replace function private.leads_setlist(p_setlist uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.setlists s join public.events e on e.id = s.event_id
    where s.id = p_setlist and s.church_id = private.church_id()
      and private.member_id() is not null
      and (e.leader_member_id = private.member_id()
           or exists (select 1 from public.event_assignments a join public.worship_functions wf on wf.id = a.function_id
                       where a.event_id = e.id and a.member_id = private.member_id() and wf.is_main)))
$$;

create or replace function private.leads_any_event() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.member_id() is not null and exists (
    select 1 from public.events e
    where e.church_id = private.church_id() and e.status <> 'cancelled'
      and (e.leader_member_id = private.member_id()
           or exists (select 1 from public.event_assignments a join public.worship_functions wf on wf.id = a.function_id
                       where a.event_id = e.id and a.member_id = private.member_id() and wf.is_main)))
$$;
