-- Funções com número de vagas (Vocal = 3) e lista enxuta: sem "Ministro de apoio", "Backing vocal" nem "Técnico de som".
alter table public.worship_functions add column if not exists slots smallint not null default 1 check (slots between 1 and 12);
update public.worship_functions set slots = 3 where name = 'Vocal';
update public.worship_functions set active = false where name in ('Ministro de apoio', 'Backing vocal', 'Técnico de som');
-- suggest_team passou a preencher até "slots" pessoas por função (ver função aplicada no banco).
