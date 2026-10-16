# Verificação de RLS (executada em 16/10/2026)

Rodada em transação revertida (DO block com `RAISE EXCEPTION` no final), simulando usuários via `request.jwt.claims` + `set local role authenticated`:

- 1º usuário cadastrado → ativo e `admin`; 2º → inativo, sem cargo.
- Admin libera usuário, concede cargo e cria escala: permitido.
- Ministro: não se promove a admin, não cria escala, não ativa usuários, não vê rascunhos.
- `respond_event` em escala não publicada: recusado.
- Usuário inativo: vê 0 escalas e 0 integrantes (só o próprio perfil) e não consegue se auto-ativar.
- `anon`: sem acesso às tabelas.
