# Louvor em Escala

Sistema web para organizar o ministério de louvor da **Igreja Metodista — Nosso Lugar**: escalas, banco de músicas, repertórios, disponibilidade, confirmações, calendário, histórico e relatórios.

**Stack:** React 18 + TypeScript + Vite, Tailwind CSS, Supabase (Auth, Postgres com RLS, Edge Functions), TanStack Query, FullCalendar, dnd-kit, Recharts, jsPDF.
Interface em português do Brasil (DD/MM/AAAA, 24 h), tema escuro (padrão) e claro, responsiva.

## Estrutura

```
src/                       aplicação React
  pages/                   telas (Dashboard, Escalas, Músicas, Repertórios, Relatórios…)
  components/              UI, editor de repertório, montagem automática, modo palco
  lib/                     supabase, regras de repertório, PDF, utilidades
supabase/migrations/       scripts SQL (schema, RLS, funções) — aplicar em ordem
supabase/functions/music-search/   função de servidor para pesquisa externa de músicas
public/brand/              logos da igreja
```

## Como rodar

```bash
npm install
cp .env.example .env      # preencha as duas variáveis
npm run dev
```

Variáveis (só valores públicos vão ao navegador):

| Variável | Onde achar |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | mesma tela (chave *publishable*/anon). **Nunca** use a `service_role` no front-end. |

## Configurar o Supabase

1. Crie o projeto e aplique, **em ordem**, os arquivos de `supabase/migrations/` (SQL Editor ou `supabase db push`).
2. Publique a função de busca: `supabase functions deploy music-search`.
3. **Authentication → URL Configuration:** defina *Site URL* com o endereço do site (Vercel) e inclua em *Redirect URLs* `https://SEU-SITE/redefinir-senha` — necessário para a recuperação de senha.
4. **Authentication → Providers → Email:** decida se exige confirmação de e-mail. O sistema funciona nos dois modos.
5. **Primeiro acesso:** a **primeira pessoa que se cadastrar vira administradora**. Os demais cadastros ficam “aguardando liberação” até um administrador liberar o acesso e definir cargos em *Configurações → Usuários*.

### Pesquisa de músicas (opcional)

Segredos ficam só no Supabase (`supabase secrets set ...`), nunca no front-end:

- iTunes/Apple Music: funciona **sem chave** (capa, artista, álbum, duração).
- YouTube: `YOUTUBE_API_KEY` (YouTube Data API v3). Sem a chave, cole o link do vídeo na busca — o título é lido via oEmbed.
- Spotify: `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`.

### Criar playlist no Spotify (opcional)

Funções `spotify` e `spotify-callback`. Crie um app em developer.spotify.com/dashboard com o Redirect URI
`https://SEU-PROJETO.supabase.co/functions/v1/spotify-callback`, cadastre `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` nos Secrets e, em *User Management* do app, os e-mails de quem vai usar (modo de desenvolvimento). Em seguida, no repertório: **Criar playlist → Conectar Spotify**. Os tokens ficam na tabela `music_connections`, sem acesso pelo navegador. Sem essa configuração, o botão mostra o aviso e oferece “Copiar links”. A criação no YouTube usa um link `watch_videos` (sem login); a criação direta via YouTube Data API **não está implementada**.

*Configurações → Integrações* testa o estado de cada fonte. Dados que a fonte não fornece (tom, BPM, letra) ficam em branco para preenchimento manual — nada é inventado.

## Deploy (Vercel)

Importe o repositório, framework *Vite*, e defina as duas variáveis de ambiente acima. O `vercel.json` já faz o redirecionamento de rotas (SPA).

## Segurança

- RLS ativa em todas as tabelas; funções auxiliares ficam em schema não exposto (`private`).
- Cargos: `admin`, `leader` (líder), `minister`, `sound_tech` (técnico de som). Integrantes só alteram a **própria** confirmação (RPC `respond_event`); o técnico só altera observações técnicas e “som pronto”.
- Nenhum segredo no código. Links de repertório exigem login e autorização.

## O que está pronto × o que depende de serviço externo

**Pronto (usa só Supabase):** login/cadastro/recuperação de senha com aprovação por administrador; cargos e vínculo usuário↔integrante; integrantes e funções; escalas (rascunho, publicação com verificação de pendências, duplicar, cancelar, concluir); confirmar/recusar presença; alertas (função obrigatória vazia, conflito de horário, indisponibilidade, repertório vazio, falta de som); disponibilidade individual e matriz da equipe; banco de músicas (busca, favoritos, tags, arquivar, detecção de duplicadas, sugestões de integrantes); repertórios com arrastar-e-soltar, tom por culto, itens especiais, modelos, copiar de outro culto, link interno; **montagem automática** (sugestão editável, nunca publicada sozinha); modo palco; exportação em PDF; calendário; histórico e registro de atividades; relatórios; notificações internas; configurações; tema claro/escuro.

**Depende de configuração externa:**
- Busca no YouTube/Spotify → chaves de API (item acima). Sem elas, iTunes e colagem de links continuam funcionando.
- Recuperação de senha e confirmação de e-mail → URLs e e-mail configurados no painel do Supabase (o envio usa o serviço de e-mail do Supabase, com limites no plano gratuito).
- Notificações **por e-mail/WhatsApp/push do celular**: **não implementadas** — existem apenas notificações dentro do sistema.

**Limitações conhecidas:** a montagem automática é uma heurística (pontuação por tema, categoria, BPM, tons confortáveis e tempo desde o último uso), não inteligência artificial; o tom/BPM só aparecem se cadastrados.

## Testes

`npm run typecheck` verifica os tipos. As regras de acesso foram conferidas com consultas SQL simulando cada cargo (resumo em `supabase/tests/rls_smoke.md`). Teste manual sugerido: cadastrar o 1º usuário (admin), criar funções/integrantes, criar e publicar uma escala, confirmar presença com outro usuário.
