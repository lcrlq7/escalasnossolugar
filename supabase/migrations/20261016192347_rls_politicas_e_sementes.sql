-- Habilita RLS em todas as tabelas
alter table public.churches enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.members enable row level security;
alter table public.worship_functions enable row level security;
alter table public.member_functions enable row level security;
alter table public.service_schedules enable row level security;
alter table public.events enable row level security;
alter table public.event_assignments enable row level security;
alter table public.availability enable row level security;
alter table public.songs enable row level security;
alter table public.song_favorites enable row level security;
alter table public.song_suggestions enable row level security;
alter table public.setlist_categories enable row level security;
alter table public.setlists enable row level security;
alter table public.setlist_items enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_logs enable row level security;

-- churches
create policy churches_select on public.churches for select to authenticated
  using (id = (select private.church_id()));
create policy churches_update on public.churches for update to authenticated
  using (id = (select private.church_id()) and (select private.is_admin()))
  with check (id = (select private.church_id()) and (select private.is_admin()));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or church_id = (select private.church_id()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles (escrita somente via RPC administrativa)
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid())
         or user_id in (select p.id from public.profiles p where p.church_id = (select private.church_id())));

-- members
create policy members_select on public.members for select to authenticated
  using (church_id = (select private.church_id()));
create policy members_insert on public.members for insert to authenticated
  with check (church_id = (select private.church_id()) and (select private.is_admin()));
create policy members_update on public.members for update to authenticated
  using (church_id = (select private.church_id()) and (select private.is_admin()))
  with check (church_id = (select private.church_id()) and (select private.is_admin()));
create policy members_delete on public.members for delete to authenticated
  using (church_id = (select private.church_id()) and (select private.is_admin()));

-- worship_functions
create policy functions_select on public.worship_functions for select to authenticated
  using (church_id = (select private.church_id()));
create policy functions_write_ins on public.worship_functions for insert to authenticated
  with check (church_id = (select private.church_id()) and (select private.is_admin()));
create policy functions_write_upd on public.worship_functions for update to authenticated
  using (church_id = (select private.church_id()) and (select private.is_admin()))
  with check (church_id = (select private.church_id()) and (select private.is_admin()));
create policy functions_write_del on public.worship_functions for delete to authenticated
  using (church_id = (select private.church_id()) and (select private.is_admin()));

-- member_functions
create policy member_functions_select on public.member_functions for select to authenticated
  using (member_id in (select m.id from public.members m));
create policy member_functions_ins on public.member_functions for insert to authenticated
  with check ((select private.is_admin()) and member_id in (select m.id from public.members m));
create policy member_functions_del on public.member_functions for delete to authenticated
  using ((select private.is_admin()) and member_id in (select m.id from public.members m));

-- service_schedules
create policy schedules_select on public.service_schedules for select to authenticated
  using (church_id = (select private.church_id()));
create policy schedules_ins on public.service_schedules for insert to authenticated
  with check (church_id = (select private.church_id()) and (select private.is_admin()));
create policy schedules_upd on public.service_schedules for update to authenticated
  using (church_id = (select private.church_id()) and (select private.is_admin()))
  with check (church_id = (select private.church_id()) and (select private.is_admin()));
create policy schedules_del on public.service_schedules for delete to authenticated
  using (church_id = (select private.church_id()) and (select private.is_admin()));

-- events: rascunhos só para líderes/admin
create policy events_select on public.events for select to authenticated
  using (church_id = (select private.church_id()) and (status <> 'draft' or (select private.is_leader())));
create policy events_ins on public.events for insert to authenticated
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy events_upd on public.events for update to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()))
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy events_del on public.events for delete to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()));

-- event_assignments (herda a visibilidade do culto)
create policy assignments_select on public.event_assignments for select to authenticated
  using (event_id in (select e.id from public.events e));
create policy assignments_ins on public.event_assignments for insert to authenticated
  with check ((select private.is_leader()) and event_id in (select e.id from public.events e)
              and member_id in (select m.id from public.members m where m.active));
create policy assignments_upd on public.event_assignments for update to authenticated
  using ((select private.is_leader()) and event_id in (select e.id from public.events e))
  with check ((select private.is_leader()) and event_id in (select e.id from public.events e));
create policy assignments_del on public.event_assignments for delete to authenticated
  using ((select private.is_leader()) and event_id in (select e.id from public.events e));

-- availability
create policy availability_select on public.availability for select to authenticated
  using (member_id = (select private.member_id())
         or ((select private.is_leader()) and member_id in (select m.id from public.members m)));
create policy availability_ins on public.availability for insert to authenticated
  with check (member_id = (select private.member_id())
              or ((select private.is_leader()) and member_id in (select m.id from public.members m)));
create policy availability_upd on public.availability for update to authenticated
  using (member_id = (select private.member_id())
         or ((select private.is_leader()) and member_id in (select m.id from public.members m)))
  with check (member_id = (select private.member_id())
              or ((select private.is_leader()) and member_id in (select m.id from public.members m)));
create policy availability_del on public.availability for delete to authenticated
  using (member_id = (select private.member_id())
         or ((select private.is_leader()) and member_id in (select m.id from public.members m)));

-- songs
create policy songs_select on public.songs for select to authenticated
  using (church_id = (select private.church_id()));
create policy songs_ins on public.songs for insert to authenticated
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy songs_upd on public.songs for update to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()))
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy songs_del on public.songs for delete to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()));

-- song_favorites (pessoais)
create policy favorites_select on public.song_favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorites_ins on public.song_favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and song_id in (select s.id from public.songs s));
create policy favorites_del on public.song_favorites for delete to authenticated
  using (user_id = (select auth.uid()));

-- song_suggestions
create policy suggestions_select on public.song_suggestions for select to authenticated
  using (church_id = (select private.church_id())
         and (suggested_by = (select auth.uid()) or (select private.is_leader())));
create policy suggestions_ins on public.song_suggestions for insert to authenticated
  with check (church_id = (select private.church_id()) and suggested_by = (select auth.uid()));
create policy suggestions_upd on public.song_suggestions for update to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()))
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy suggestions_del on public.song_suggestions for delete to authenticated
  using (church_id = (select private.church_id())
         and (suggested_by = (select auth.uid()) or (select private.is_leader())));

-- setlist_categories
create policy categories_select on public.setlist_categories for select to authenticated
  using (church_id = (select private.church_id()));
create policy categories_ins on public.setlist_categories for insert to authenticated
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy categories_upd on public.setlist_categories for update to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()))
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy categories_del on public.setlist_categories for delete to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()));

-- setlists
create policy setlists_select on public.setlists for select to authenticated
  using (church_id = (select private.church_id())
         and ((select private.is_leader()) or event_id in (select e.id from public.events e)));
create policy setlists_ins on public.setlists for insert to authenticated
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy setlists_upd on public.setlists for update to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()))
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy setlists_del on public.setlists for delete to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()));

-- setlist_items
create policy items_select on public.setlist_items for select to authenticated
  using (setlist_id in (select s.id from public.setlists s));
create policy items_ins on public.setlist_items for insert to authenticated
  with check ((select private.is_leader()) and setlist_id in (select s.id from public.setlists s));
create policy items_upd on public.setlist_items for update to authenticated
  using ((select private.is_leader()) and setlist_id in (select s.id from public.setlists s))
  with check ((select private.is_leader()) and setlist_id in (select s.id from public.setlists s));
create policy items_del on public.setlist_items for delete to authenticated
  using ((select private.is_leader()) and setlist_id in (select s.id from public.setlists s));

-- notifications
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- announcements
create policy announcements_select on public.announcements for select to authenticated
  using (church_id = (select private.church_id())
         and ((select private.is_leader())
              or (active and (expires_at is null or expires_at > now()))));
create policy announcements_ins on public.announcements for insert to authenticated
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy announcements_upd on public.announcements for update to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()))
  with check (church_id = (select private.church_id()) and (select private.is_leader()));
create policy announcements_del on public.announcements for delete to authenticated
  using (church_id = (select private.church_id()) and (select private.is_leader()));

-- audit_logs: somente admin lê; ninguém escreve diretamente
create policy audit_select on public.audit_logs for select to authenticated
  using (church_id = (select private.church_id()) and (select private.is_admin()));

-- Privilégios: anon não acessa nada; usuários autenticados passam por RLS
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke insert, update, delete on public.user_roles from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke insert on public.notifications from authenticated;
revoke insert, delete on public.churches from authenticated;
alter table public.churches alter column id set default gen_random_uuid();
grant update (name, system_name) on public.churches to authenticated;
revoke update on public.churches from authenticated;
grant update (name, system_name) on public.churches to authenticated;

-- Dados iniciais de configuração (não são dados de demonstração)
insert into public.churches(name, system_name) values ('Igreja Metodista — Nosso Lugar', 'Louvor em Escala');

insert into public.worship_functions(church_id, name, is_required, is_main, is_instrument, sort_order)
select c.id, f.name, f.req, f.main, f.instr, f.ord
from public.churches c,
(values
  ('Ministro principal', true,  true,  false, 1),
  ('Ministro de apoio',  false, false, false, 2),
  ('Vocal',              false, false, false, 3),
  ('Backing vocal',      false, false, false, 4),
  ('Violão',             false, false, true,  5),
  ('Guitarra',           false, false, true,  6),
  ('Baixo',              false, false, true,  7),
  ('Teclado',            false, false, true,  8),
  ('Bateria',            false, false, true,  9),
  ('Percussão',          false, false, true,  10),
  ('Técnico de som',     false, false, false, 11)
) as f(name, req, main, instr, ord);

insert into public.setlist_categories(church_id, name, sort_order)
select c.id, k.name, k.ord from public.churches c,
(values ('Abertura',1),('Celebração',2),('Adoração',3),('Ministração',4),('Encerramento',5)) as k(name, ord);
