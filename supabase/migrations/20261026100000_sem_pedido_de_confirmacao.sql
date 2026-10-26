-- A confirmação de presença foi desativada na interface (fica só o pedido de troca).
-- Remove o "Confirme sua presença" dos textos das notificações e do lembrete.
do $$
declare r record; def text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%Confirme sua presença%'
  loop
    def := pg_get_functiondef(r.oid);
    def := replace(def, '. Confirme sua presença.', '.');
    def := replace(def, 'case when r.status = ''pending'' then ''Confirme sua presença amanhã'' else ''Lembrete: você serve amanhã'' end', '''Lembrete: você serve amanhã''');
    execute def;
  end loop;
end $$;
