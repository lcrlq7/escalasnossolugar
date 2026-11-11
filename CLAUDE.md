# Louvor em Escala — notas para quem for mexer no projeto

Sistema de escalas do louvor da Igreja Metodista Nosso Lugar. Interface em português do Brasil; o usuário também escreve em português.

## Stack e onde as coisas ficam
- React 18 + TypeScript (strict) + Vite + Tailwind + TanStack Query + jsPDF. Telas em `src/pages`, componentes em `src/components`, utilidades em `src/lib` (PDF em `src/lib/pdf.ts`).
- Banco e login: Supabase (projeto `nvcglfxxqmbqtewjkidy`). Migrações em `supabase/migrations`, funções de servidor em `supabase/functions`.
- Hospedagem: Vercel. Cada push na branch `main` publica sozinho. O build é estrito (`tsc --noEmit && vite build`): erro de tipo derruba o deploy.
- Repositório: GitHub `lcrlq7/escalasnossolugar`.

## Regras que não podem ser quebradas
- Permissões ficam no banco (RLS e funções em `private.*`), não só na tela. Mudou regra de quem pode o quê? Altere o banco também.
- Ministro responsável / ministro principal só edita o repertório da própria escala (`private.leads_setlist`).
- Confirmação de presença está desativada de propósito; só existe pedido de troca.
- Nunca criar contas com senha previsível nem e-mails falsos. Nunca colocar chaves secretas no código ou no chat.
- Aviso por push usa Database Webhook (tabela `notifications` → função `push-send`). Não recriar como gatilho de banco chamando HTTP.
- CSS: animação com `fill-mode: both` + transform quebra `position: fixed` (usar `backwards`). Campos precisam de fonte ≥ 16px no iPhone para não dar zoom.
- Só o conteúdo rola (`Layout.tsx`); a barra do topo e o menu de baixo ficam fora da área de rolagem.
- Se mudar o script inline de `index.html`, recalcular o sha256 do CSP em `vercel.json`.

## Como trabalhar
- Commits terminam com a linha `Co-Authored-By` da ferramenta usada.
- Depois de enviar, conferir na Vercel se o deploy ficou READY.
