create function public.respond_event(p_event_id uuid, p_status public.response_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_n int;
begin
  if p_status = 'pending' then raise exception 'Resposta inválida'; end if;
  v_member := private.member_id();
  if v_member is null then raise exception 'Seu usuário ainda não está vinculado a um integrante'; end if;
  update public.event_assignments a
     set status = p_status, responded_at = now(),
         decline_reason = case when p_status = 'declined' then p_reason else null end
   where a.event_id = p_event_id and a.member_id = v_member
     and exists (select 1 from public.events e
                 where e.id = a.event_id and e.church_id = private.church_id() and e.status = 'published');
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nenhuma escala publicada encontrada para você neste evento'; end if;
end $$;

create function public.set_tech_info(p_event_id uuid, p_tech_notes text, p_sound_ready boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not (private.has_role('sound_tech') or private.is_leader()) then
    raise exception 'Sem permissão para alterar informações técnicas';
  end if;
  update public.events
     set tech_notes = p_tech_notes, sound_ready = p_sound_ready,
         sound_ready_by = case when p_sound_ready then auth.uid() else null end
   where id = p_event_id and church_id = private.church_id()
     and (status <> 'draft' or private.is_leader());
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Escala não encontrada'; end if;
end $$;
