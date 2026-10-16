-- O administrador possui implicitamente todos os cargos (líder, ministro, técnico de som).
create or replace function private.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and p.active and (ur.role = r or ur.role = 'admin')
  )
$$;
