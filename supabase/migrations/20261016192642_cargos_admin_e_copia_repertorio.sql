-- Cargos: administradores gerenciam diretamente (RLS) e um gatilho protege invariantes
create policy user_roles_admin_ins on public.user_roles for insert to authenticated
  with check ((select private.is_admin())
              and user_id in (select p.id from public.profiles p where p.church_id = (select private.church_id())));
create policy user_roles_admin_del on public.user_roles for delete to authenticated
  using ((select private.is_admin())
         and user_id in (select p.id from public.profiles p where p.church_id = (select private.church_id())));
grant insert, delete on public.user_roles to authenticated;

create function private.user_roles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_church uuid; v_admins int; v_name text;
begin
  if tg_op = 'DELETE' then
    select church_id, full_name into v_church, v_name from public.profiles where id = old.user_id;
    if old.role = 'admin' then
      select count(*) into v_admins from public.user_roles ur join public.profiles p on p.id = ur.user_id
       where ur.role = 'admin' and p.active and p.church_id = v_church and ur.user_id <> old.user_id;
      if v_admins < 1 and exists (select 1 from public.profiles where id = old.user_id) then
        raise exception 'É necessário manter ao menos um administrador ativo';
      end if;
    end if;
    insert into public.audit_logs(church_id, user_id, action, entity, entity_id, details)
    values (v_church, auth.uid(), 'role_removed', 'user_roles', old.user_id::text,
            jsonb_build_object('label', v_name, 'role', old.role));
    return old;
  else
    select church_id, full_name into v_church, v_name from public.profiles where id = new.user_id;
    insert into public.audit_logs(church_id, user_id, action, entity, entity_id, details)
    values (v_church, auth.uid(), 'role_added', 'user_roles', new.user_id::text,
            jsonb_build_object('label', v_name, 'role', new.role));
    return new;
  end if;
end $$;
create trigger user_roles_guard_trg after insert or delete on public.user_roles
  for each row execute function private.user_roles_guard();

-- Copiar repertório: cria um novo ou acrescenta itens ao final de um existente
create function public.duplicate_setlist(p_source uuid, p_target uuid default null,
                                         p_name text default null, p_template boolean default false)
returns uuid language plpgsql set search_path = '' as $$
declare v_target uuid := p_target; v_church uuid; v_name text; v_base int := 0;
begin
  select church_id, name into v_church, v_name from public.setlists where id = p_source;
  if v_church is null then raise exception 'Repertório não encontrado'; end if;
  if v_target is null then
    insert into public.setlists(church_id, name, is_template)
    values (v_church, coalesce(p_name, v_name || ' (cópia)'), p_template) returning id into v_target;
  else
    select coalesce(max(position), 0) into v_base from public.setlist_items where setlist_id = v_target;
  end if;
  insert into public.setlist_items(setlist_id, position, kind, song_id, category_id, key_override, note, duration_override_seconds)
  select v_target, v_base + position, kind, song_id, category_id, key_override, note, duration_override_seconds
  from public.setlist_items where setlist_id = p_source;
  return v_target;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
