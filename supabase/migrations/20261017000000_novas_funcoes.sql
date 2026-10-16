-- Novas funções: push, trocas de escala, sugestão de equipe, lembretes, ensaio, cifras, frequência, escalas recorrentes.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- ---------- segredos internos (só service role) ----------
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- ---------- push ----------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_sel on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_ins on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_del on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
create index on public.push_subscriptions(user_id);

alter table public.notifications add column if not exists push_sent_at timestamptz;

create or replace function public.get_vapid_public_key() returns text
language sql stable security definer set search_path = public as $$
  select value from public.app_secrets where key = 'vapid_public'
$$;
revoke all on function public.get_vapid_public_key() from public, anon;
grant execute on function public.get_vapid_public_key() to authenticated;

-- O envio de push é disparado por um Database Webhook (tabela notifications, INSERT -> função push-send),
-- configurado no painel do Supabase.

-- ---------- lembretes na véspera ----------
alter table public.event_assignments add column if not exists reminder_sent_at timestamptz;

create or replace function private.queue_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_user uuid;
begin
  for r in
    select a.id, a.status, e.id as event_id, e.church_id, e.title, e.event_date, e.start_time, a.member_id, f.name as fname
    from public.event_assignments a
    join public.events e on e.id = a.event_id
    join public.worship_functions f on f.id = a.function_id
    where e.status = 'published' and a.status <> 'declined' and a.reminder_sent_at is null
      and e.event_date = ((now() at time zone 'America/Sao_Paulo')::date + 1)
  loop
    select profile_id into v_user from public.members where id = r.member_id;
    if v_user is not null then
      perform private.notify(v_user, r.church_id, 'reminder',
        case when r.status = 'pending' then 'Confirme sua presença amanhã' else 'Lembrete: você serve amanhã' end,
        r.title || ' · ' || to_char(r.start_time, 'HH24:MI') || ' · ' || r.fname,
        '/escalas/' || r.event_id);
      n := n + 1;
    end if;
    update public.event_assignments set reminder_sent_at = now() where id = r.id;
  end loop;
  return n;
end $$;
revoke all on function private.queue_reminders() from public, anon, authenticated;
-- todo dia às 09:00 de Brasília (12:00 UTC)
select cron.schedule('lembretes-escala', '0 12 * * *', $$select private.queue_reminders()$$);

-- ---------- trocas de escala ----------
create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  assignment_id uuid not null references public.event_assignments(id) on delete cascade,
  from_member_id uuid not null references public.members(id) on delete cascade,
  to_member_id uuid not null references public.members(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','approved','denied','cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.swap_requests(event_id);
create index on public.swap_requests(to_member_id);
alter table public.swap_requests enable row level security;
create policy swap_sel on public.swap_requests for select to authenticated using (
  church_id = (select private.church_id()) and (
    (select private.is_leader()) or from_member_id = (select private.member_id()) or to_member_id = (select private.member_id())));

create or replace function private.user_of_member(p_member uuid) returns uuid
language sql stable security definer set search_path = public as $$ select profile_id from public.members where id = p_member $$;
revoke all on function private.user_of_member(uuid) from public, anon, authenticated;

create or replace function public.request_swap(p_assignment uuid, p_to_member uuid, p_message text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.event_assignments; ev public.events; me uuid := private.member_id(); v_id uuid; v_name text;
begin
  if me is null then raise exception 'Seu usuário não está vinculado a um integrante'; end if;
  select * into a from public.event_assignments where id = p_assignment;
  if not found or a.member_id <> me then raise exception 'Você só pode pedir troca da sua própria escala'; end if;
  select * into ev from public.events where id = a.event_id and church_id = private.church_id();
  if not found or ev.status <> 'published' then raise exception 'A escala precisa estar publicada'; end if;
  if ev.event_date < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Este culto já passou'; end if;
  if p_to_member = me then raise exception 'Escolha outra pessoa'; end if;
  if not exists (select 1 from public.members where id = p_to_member and active and church_id = ev.church_id) then raise exception 'Integrante inválido'; end if;
  if exists (select 1 from public.event_assignments where event_id = a.event_id and member_id = p_to_member) then raise exception 'Essa pessoa já está nesta escala'; end if;
  if exists (select 1 from public.swap_requests where assignment_id = p_assignment and status in ('pending','accepted')) then raise exception 'Já existe um pedido de troca em andamento'; end if;
  insert into public.swap_requests(church_id, event_id, assignment_id, from_member_id, to_member_id, message)
  values (ev.church_id, ev.id, p_assignment, me, p_to_member, nullif(left(p_message, 300), '')) returning id into v_id;
  select full_name into v_name from public.members where id = me;
  perform private.notify(private.user_of_member(p_to_member), ev.church_id, 'swap_request', 'Pedido de troca de escala',
    v_name || ' pediu para você assumir "' || ev.title || '" em ' || to_char(ev.event_date, 'DD/MM'), '/');
  return v_id;
end $$;

create or replace function public.respond_swap(p_swap uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s public.swap_requests; ev public.events; me uuid := private.member_id(); v_to text; l record;
begin
  select * into s from public.swap_requests where id = p_swap and church_id = private.church_id();
  if not found or s.to_member_id <> me then raise exception 'Pedido não encontrado'; end if;
  if s.status <> 'pending' then raise exception 'Este pedido já foi respondido'; end if;
  select * into ev from public.events where id = s.event_id;
  select full_name into v_to from public.members where id = me;
  update public.swap_requests set status = case when p_accept then 'accepted' else 'rejected' end, resolved_at = case when p_accept then null else now() end where id = p_swap;
  perform private.notify(private.user_of_member(s.from_member_id), s.church_id, 'swap_response',
    case when p_accept then 'Troca aceita (aguardando o líder)' else 'Troca recusada' end,
    v_to || case when p_accept then ' aceitou assumir ' else ' não pode assumir ' end || '"' || ev.title || '"', '/');
  if p_accept then
    for l in select distinct ur.user_id from public.user_roles ur join public.profiles p on p.id = ur.user_id
             where ur.role in ('admin','leader') and p.active and p.church_id = s.church_id loop
      perform private.notify(l.user_id, s.church_id, 'swap_approval', 'Troca de escala para aprovar',
        'Troca em "' || ev.title || '" em ' || to_char(ev.event_date, 'DD/MM') || ' aguarda sua aprovação', '/');
    end loop;
  end if;
end $$;

create or replace function public.approve_swap(p_swap uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s public.swap_requests; ev public.events;
begin
  if not private.is_leader() then raise exception 'Apenas líderes podem aprovar trocas'; end if;
  select * into s from public.swap_requests where id = p_swap and church_id = private.church_id();
  if not found then raise exception 'Pedido não encontrado'; end if;
  if s.status <> 'accepted' then raise exception 'O colega ainda não aceitou este pedido'; end if;
  select * into ev from public.events where id = s.event_id;
  if p_approve then
    if exists (select 1 from public.event_assignments where event_id = s.event_id and member_id = s.to_member_id) then
      raise exception 'Essa pessoa já está nesta escala';
    end if;
    update public.event_assignments set member_id = s.to_member_id, status = 'confirmed', responded_at = now(), decline_reason = null, reminder_sent_at = null
     where id = s.assignment_id and member_id = s.from_member_id;
    if not found then raise exception 'A escala original mudou; cancele este pedido'; end if;
  end if;
  update public.swap_requests set status = case when p_approve then 'approved' else 'denied' end, resolved_at = now() where id = p_swap;
  perform private.notify(private.user_of_member(s.from_member_id), s.church_id, 'swap_result',
    case when p_approve then 'Troca aprovada' else 'Troca não aprovada' end, '"' || ev.title || '" em ' || to_char(ev.event_date, 'DD/MM'), '/escalas/' || ev.id);
  perform private.notify(private.user_of_member(s.to_member_id), s.church_id, 'swap_result',
    case when p_approve then 'Você assumiu uma escala' else 'Troca não aprovada' end, '"' || ev.title || '" em ' || to_char(ev.event_date, 'DD/MM'), '/escalas/' || ev.id);
end $$;

create or replace function public.cancel_swap(p_swap uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.swap_requests set status = 'cancelled', resolved_at = now()
   where id = p_swap and church_id = private.church_id() and status in ('pending','accepted')
     and (from_member_id = private.member_id() or private.is_leader());
  if not found then raise exception 'Pedido não encontrado'; end if;
end $$;
revoke all on function public.request_swap(uuid, uuid, text), public.respond_swap(uuid, boolean), public.approve_swap(uuid, boolean), public.cancel_swap(uuid) from public, anon;
grant execute on function public.request_swap(uuid, uuid, text), public.respond_swap(uuid, boolean), public.approve_swap(uuid, boolean), public.cancel_swap(uuid) to authenticated;

-- ---------- sugestão de equipe ----------
create or replace function public.suggest_team(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev public.events; f record; pick record; res jsonb := '[]'::jsonb; used uuid[] := '{}';
begin
  if not private.is_leader() then raise exception 'Apenas líderes'; end if;
  select * into ev from public.events where id = p_event and church_id = private.church_id();
  if not found then raise exception 'Escala não encontrada'; end if;
  select coalesce(array_agg(member_id), '{}') into used from public.event_assignments where event_id = p_event;
  for f in select * from public.worship_functions wf
           where wf.church_id = ev.church_id and wf.active
             and not exists (select 1 from public.event_assignments a where a.event_id = p_event and a.function_id = wf.id)
           order by wf.is_main desc, wf.is_required desc, wf.sort_order loop
    select m.id, m.full_name,
           (select count(*) from public.event_assignments a2 join public.events e2 on e2.id = a2.event_id
             where a2.member_id = m.id and e2.status in ('published','completed') and e2.event_date between ev.event_date - 30 and ev.event_date) as recent,
           (select max(e3.event_date) from public.event_assignments a3 join public.events e3 on e3.id = a3.event_id
             where a3.member_id = m.id and e3.status in ('published','completed') and e3.event_date < ev.event_date) as last_served
      into pick
      from public.members m
      join public.member_functions mf on mf.member_id = m.id and mf.function_id = f.id
     where m.church_id = ev.church_id and m.active and not (m.id = any(used))
       and not exists (select 1 from public.availability av where av.member_id = m.id and av.date = ev.event_date and av.status = 'unavailable')
       and not exists (
         select 1 from public.event_assignments a4 join public.events e4 on e4.id = a4.event_id
          where a4.member_id = m.id and e4.id <> ev.id and e4.event_date = ev.event_date and e4.status <> 'cancelled'
            and ev.start_time < coalesce(e4.end_time, e4.start_time + interval '2 hours') and e4.start_time < coalesce(ev.end_time, ev.start_time + interval '2 hours'))
     order by recent asc, last_served asc nulls first, m.full_name
     limit 1;
    if pick.id is not null then
      used := used || pick.id;
      res := res || jsonb_build_object('function_id', f.id, 'function_name', f.name, 'member_id', pick.id, 'member_name', pick.full_name,
        'reason', case when pick.last_served is null then 'ainda não serviu' else 'serviu há ' || (ev.event_date - pick.last_served) || ' dias' end
                  || ', ' || pick.recent || ' escala(s) nos últimos 30 dias');
    end if;
  end loop;
  return res;
end $$;
revoke all on function public.suggest_team(uuid) from public, anon;
grant execute on function public.suggest_team(uuid) to authenticated;

-- ---------- ensaio e cifras ----------
alter table public.setlist_items add column if not exists rehearsed boolean not null default false;
alter table public.songs add column if not exists chord_chart text;

create or replace function public.set_item_rehearsed(p_item uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_event uuid;
begin
  select s.event_id into v_event from public.setlist_items i join public.setlists s on s.id = i.setlist_id
   where i.id = p_item and s.church_id = private.church_id();
  if not found then raise exception 'Item não encontrado'; end if;
  if not (private.is_leader() or exists (select 1 from public.event_assignments a where a.event_id = v_event and a.member_id = private.member_id())) then
    raise exception 'Sem permissão';
  end if;
  update public.setlist_items set rehearsed = p_value where id = p_item;
end $$;
revoke all on function public.set_item_rehearsed(uuid, boolean) from public, anon;
grant execute on function public.set_item_rehearsed(uuid, boolean) to authenticated;

-- ---------- frequência ----------
create or replace function public.attendance_report(p_from date, p_to date) returns table (
  member_id uuid, full_name text, total int, confirmed int, declined int, pending int, last_served date, last_30 int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_leader() then raise exception 'Apenas líderes'; end if;
  return query
  select m.id, m.full_name,
         count(x.aid)::int, count(x.aid) filter (where x.st = 'confirmed')::int, count(x.aid) filter (where x.st = 'declined')::int,
         count(x.aid) filter (where x.st = 'pending')::int,
         max(x.d) filter (where x.d <= (now() at time zone 'America/Sao_Paulo')::date),
         count(x.aid) filter (where x.d >= (now() at time zone 'America/Sao_Paulo')::date - 30 and x.d <= (now() at time zone 'America/Sao_Paulo')::date)::int
    from public.members m
    left join (select a.id as aid, a.member_id as mid, a.status::text as st, e.event_date as d
                 from public.event_assignments a join public.events e on e.id = a.event_id
                where e.status in ('published','completed') and e.event_date between p_from and p_to) x on x.mid = m.id
   where m.church_id = private.church_id() and m.active
   group by m.id, m.full_name
   order by 3 desc, m.full_name;
end $$;
revoke all on function public.attendance_report(date, date) from public, anon;
grant execute on function public.attendance_report(date, date) to authenticated;

-- ---------- escalas recorrentes ----------
create or replace function public.create_recurring_events(p_schedule uuid, p_from date, p_weeks int, p_copy_from uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare sc public.service_schedules; d date; n int := 0; v_new uuid; v_leader uuid;
begin
  if not private.is_leader() then raise exception 'Apenas líderes'; end if;
  if p_weeks < 1 or p_weeks > 26 then raise exception 'Escolha entre 1 e 26 semanas'; end if;
  select * into sc from public.service_schedules where id = p_schedule and church_id = private.church_id();
  if not found then raise exception 'Horário não encontrado'; end if;
  if p_copy_from is not null then
    select leader_member_id into v_leader from public.events where id = p_copy_from and church_id = private.church_id();
    if not found then p_copy_from := null; end if;
  end if;
  d := p_from + ((sc.weekday - extract(dow from p_from)::int + 7) % 7);
  for i in 1..p_weeks loop
    if not exists (select 1 from public.events e where e.church_id = sc.church_id and e.event_date = d and e.start_time = sc.start_time and e.event_type = sc.event_type and e.status <> 'cancelled') then
      insert into public.events(church_id, title, event_type, event_date, start_time, end_time, location, leader_member_id, status)
      values (sc.church_id, sc.name, sc.event_type, d, sc.start_time, sc.end_time, sc.location, v_leader, 'draft') returning id into v_new;
      if p_copy_from is not null then
        insert into public.event_assignments(event_id, member_id, function_id)
        select v_new, a.member_id, a.function_id from public.event_assignments a join public.members m on m.id = a.member_id and m.active where a.event_id = p_copy_from;
      end if;
      n := n + 1;
    end if;
    d := d + 7;
  end loop;
  return n;
end $$;
revoke all on function public.create_recurring_events(uuid, date, int, uuid) from public, anon;
grant execute on function public.create_recurring_events(uuid, date, int, uuid) to authenticated;
