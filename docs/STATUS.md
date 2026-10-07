# Status do projeto — Radar de Capacidade

> Documento vivo. **Leia antes de começar qualquer tarefa** (em qualquer máquina) e
> **atualize ao final de cada etapa**: o que foi feito, onde parou e o que vem a seguir.
> Visão de produto e regras: [CLAUDE.md](../CLAUDE.md).

**Última atualização:** 2026-10-07
**Fase atual:** Fundação — sincronização com o Azure DevOps + front com Realtime,
abas Backlog/Membros, skills/tags editáveis e dark mode.
Fora do escopo desta fase: IA, motor de capacidade, heatmap, sugestões e executor
(a arquitetura já está preparada para recebê-los).

---

## 1. Onde paramos

O **backend de sincronização está completo, publicado e validado em produção**, e o
**front já tem login + tabela Backlog (Sprint → Feature → Task) ao vivo**
(na `main`, ver 2.6). Validado com navegador headless: alteração no
DevOps aparece na tela sem refresh, com destaque da linha e toast.
Também aplicadas as proteções de limite de uso (ver seção 5, "Limites de uso").

Nesta sessão: nova **aba Membros** (skills + tags de função, editáveis pelo gestor,
persistidas no Supabase — ver 2.7), **dark mode** em todo o app e **login redesenhado**
com painel de marca (ver 2.6). Validado com navegador headless, luz e escuro.

**Fluxo de git atual:** por decisão do usuário, trabalho consolidado direto na `main`
(a branch `feat/front-backlog` / PR #1 foi integrada por fast-forward e apagada).

**Latência medida:** ~9 s do salvar no DevOps até a tela. Desses, **~8 s são o próprio
Azure DevOps demorando para disparar o Service Hook** (`System.ChangedDate` →
`evento.recebido_em`); nosso pipeline (webhook → rebusca → upsert → Realtime) leva ~1 s.
A meta de < 5 s depende do atraso do DevOps, que não controlamos.

Situação do backend verificada em 2026-10-07 ~03:47 UTC:

| Verificação | Resultado |
|---|---|
| Sync completa (`mode=full`) | concluída 03:40 UTC — 29 work items, 4 pessoas, 12 capacidades |
| Webhooks recebidos | 29 eventos, todos `processado`, nenhum erro |
| Cron de reconciliação (5 min) | `succeeded`, resposta HTTP 200 da function |
| `sync_state` | `fase=concluido`, `ultima_reconciliacao_ok=true` |
| Testes (Vitest) | 20/20 passando |
| `tsc --noEmit` e `deno check` | sem erros |
| Histórico de migrations remoto | reparado (`migration repair`); `db push` funciona |

**Próximo passo imediato:** aba Sprints, página de Sync, ESLint no front, CI/CD (seção 4).

---

## 2. O que já foi feito

### 2.1 Infra / ambiente
- Supabase na nuvem: projeto **`wswcksxvsqhmxxawgwmq`** (org "JLNK"). CLI linkada.
- Azure DevOps de demo: org `https://dev.azure.com/JLNK`, projeto **`IportJLKN12`**.
- Monorepo pnpm (`pnpm-workspace.yaml` → `apps/*`), TS strict, Vitest na raiz.

### 2.2 Banco (`supabase/migrations`)
| Migration | Conteúdo |
|---|---|
| `20261007000000_schema_inicial.sql` | Schema completo + RPCs + views + RLS + Realtime |
| `20261007000100_fix_upsert_temp_table.sql` | `upsert_work_items` aceita várias chamadas na mesma transação |
| `20261007000200_cron_reconcile.sql` | pg_cron a cada 5 min → pg_net → `devops-sync` (reconcile), segredos no Vault |
| `20261007000300_retencao_eventos.sql` | pg_cron diário apaga eventos resolvidos com mais de 30 dias |
| `20261007000400_membros_skills_tags.sql` | `funcao_tag` + `pessoa_funcao_tag` (catálogo de tags de função) + policies de escrita pro gestor em `skill_tag`/`funcao_tag`/`pessoa_funcao_tag` + view `v_membros` |

- **Tabelas:** projeto, time, pessoa, time_membro, sprint, capacidade_sprint, dias_off,
  ausencia, feriado, skill_tag, funcao_tag, pessoa_funcao_tag, work_item, sugestao,
  evento, sync_state. (`feature` é uma **view** sobre `work_item` com `tipo='Feature'`.)
- **Skills e tags de função:** `skill_tag` (já existia, pensada pro CLAUDE.md §4) agora
  também recebe escrita direto do front (`origem='gestor'`); `funcao_tag` é o catálogo
  novo de tags de papel/função (nome único, editável/renomeável — afeta todo mundo que
  usa a tag) e `pessoa_funcao_tag` é a associação N:N com pessoa. View `v_membros`
  agrega pessoa + time (+ projeto_id) + skills/tags como jsonb, uma linha por pessoa×time.
- **work_item** guarda tudo do DevOps: devops_id (PK), rev, tipo, estado, parent_devops_id,
  feature_devops_id (ancestral resolvido), area/iteration path, horas (estimada, restante,
  concluída), start/finish/target date, tags `text[]`, changed_date, `fields` (jsonb bruto),
  `deleted_at` (soft delete).
- **Idempotência no banco:** `upsert_work_items` só grava se `rev` > salvo;
  `soft_delete_work_item(id, rev)` idem. Eventos duplicados e fora de ordem são seguros.
- **Hierarquia genérica:** `recompute_hierarquia` resolve a Feature ancestral mais próxima
  (funciona com User Story no meio e com filho chegando antes do pai).
  Triggers vinculam work_item ↔ sprint pelo iteration_path.
- **Views:** `feature`, `v_backlog` (linhas planas Sprint → Feature → Item, com
  `sem_estimativa`), `v_membros` (pessoa × time, skills/tags em jsonb). Todas
  `security_invoker`.
- **Segurança:** RLS em todas as tabelas; `select` para `authenticated`; escrita via
  service_role (RPCs com `execute` revogado de anon/authenticated) — **exceção:**
  `skill_tag`, `funcao_tag` e `pessoa_funcao_tag` também aceitam escrita direta de
  `authenticated` (dados locais, não tocam o DevOps; ver seção 5, "Permissões").
- **Realtime:** work_item, sprint, time_membro, capacidade_sprint, evento, sync_state.
- **Vault:** `radar_project_url` e `radar_sync_secret` (criados manualmente, não versionados).
- Teste SQL de idempotência: `supabase/tests/idempotencia_rev.sql` (`pnpm db:test`, roda com rollback).

### 2.3 Código compartilhado (`supabase/functions/_shared`) — puro, sem runtime
- `azdo/client.ts`: fetch puro, api-version 7.1, retry exponencial + `Retry-After`, `chunk()`.
- `azdo/types.ts`: tipos da API do DevOps.
- `mappers/workItem.ts`, `team.ts`, `webhook.ts`, `paths.ts`: tolerantes a campos ausentes;
  pai via `System.Parent` ou relação `Hierarchy-Reverse`.
- `log.ts`: log estruturado (JSON) com `devops_id` em cada linha.
- `db.types.ts`: gerado por `pnpm db:types`.
- Testes: `azdo/client.test.ts`, `mappers/mappers.test.ts` + fixtures reais em `__fixtures__/`.

### 2.4 Edge Functions (deploy feito, ambas `--no-verify-jwt`)
- **`devops-webhook`**: basic auth (WEBHOOK_BASIC_USER/PASS) → grava evento bruto
  (chave de idempotência única) → responde 200 → `EdgeRuntime.waitUntil` rebusca o item
  na API e chama o upsert. Delete = soft delete. Retorna 500 se não conseguir gravar
  (o DevOps reenvia; a reconciliação cobre o resto).
- **`devops-sync`**: `POST { mode: "full" | "reconcile", restart?: boolean }`.
  Autoriza por `x-sync-secret` (cron) ou JWT de usuário logado (front).
  - `full`: fases `meta` (projetos, times, membros, iterações, capacidade, days off) →
    `itens` (WIQL + workitemsbatch em lotes de 200, cursor `lastId`) → `sweep`
    (soft delete do que sumiu) → `concluido`. Orçamento de 110 s por chamada; se
    `done=false`, chamar de novo (retoma pelo `sync_state`).
  - `reconcile`: WIQL `ChangedDate > cursor` (timePrecision) + refresh de meta +
    reprocessa eventos com erro.
  - Lease por projeto (`acquire/release_sync_lease`) evita execuções concorrentes.
- Runtime em `supabase/functions/_lib` (`context.ts`, `sync.ts`).

### 2.5 Scripts (`scripts/`, rodam com tsx + `.env.local` + `supabase/.env.functions`)
- `pnpm devops:seed [--reset]`: completa o projeto IportJLKN12 (responsáveis por skill,
  Kauê ~117% na Sprint 1, capacidade 6h/dia, férias na Sprint 2, feriado na Sprint 3,
  cadeia Feature → User Story → Task, task sem estimativa). Idempotente.
- `pnpm devops:hooks [create|list|delete]`: gerencia subscriptions de Service Hooks. Idempotente.
- `pnpm devops:latency <id>`: mede latência DevOps → banco e restaura o valor original.
- `pnpm demo:user`: cria o usuário de demo no Supabase Auth (Admin API, service_role só local).
  Lê `DEMO_EMAIL`/`DEMO_PASSWORD` do `.env.local`; sem senha, gera e imprime uma.
  Usuário atual: `demo@radar-capacidade.dev` (senha no `.env.local` da máquina original).

### 2.6 Front (`apps/web`)
- Vite 8 + React 19 + TS strict + TanStack Router (rotas em código, `src/router.tsx`) +
  TanStack Query + Tailwind v4 (`@tailwindcss/vite`, tema em `src/index.css`) + supabase-js
  tipado com `@shared/db.types`. Componentes base estilo shadcn em `src/components/ui`
  (button, input, badge) — escritos à mão, sem a CLI do shadcn.
- Aliases: `@/` → `apps/web/src`, `@shared/` → `supabase/functions/_shared`.
- Rotas: `/login`, `/` (redireciona ao 1º projeto), `/projetos/$projetoId` (Backlog).
  Guard de sessão no `beforeLoad` da rota `app`.
- **Sidebar**: projetos, indicador "Ao vivo / Conectando / Desconectado" (status do canal
  Realtime), "Última reconciliação há X" (sync_state), e-mail + sair.
- **Backlog** (`src/routes/projeto.tsx`): KPIs (sprints, features, itens, horas restantes,
  sem estimativa), busca (título, responsável, tag, `#id`), expandir/recolher, tabela
  Sprint (status atual/futura/encerrada + datas + totais) → Feature → itens em árvore
  (User Story intermediária aninha as Tasks). Colunas: estado, responsável, horas
  estimada/restante/concluída, tags; badge "sem estimativa". `#id` abre o item no DevOps
  se `VITE_AZDO_ORG_URL` estiver definido.
- Agrupamento puro e testado em `src/lib/backlog.ts` (+ `backlog.test.ts`, roda no Vitest da raiz).
- **Realtime** (`src/lib/realtime.tsx`): canal único em work_item, sprint e sync_state →
  invalida queries, destaca a linha ~2 s (`.row-flash`), toast (sonner) agrupando rajadas;
  ao reconectar, invalida tudo.
- `apps/web/.env.example`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AZDO_ORG_URL`.
- Rodar: `pnpm dev` na raiz → http://localhost:5173
- **Rotas**: `/projetos/$projetoId` é rota-mãe (`routes/projeto-layout.tsx`, header)
  com o Backlog como index (`routes/projeto.tsx`). Membros é uma seção própria na
  sidebar (grupo "Equipe"): `/membros` (todos) e `/membros?visao=projeto` (por projeto).
- **Dark mode**: `lib/theme.tsx` (`ThemeProvider`/`useTheme`, classe `.dark` no
  `<html>`, persistido em `localStorage["tema"]`, cai pro `prefers-color-scheme` sem
  preferência salva; script inline em `index.html` evita flash no load). Toggle
  (ícone sol/lua) na sidebar, ao lado do e-mail do usuário. Todos os componentes e
  páginas existentes ganharam pares `dark:` (sem variáveis CSS novas, mesmo estilo
  utilitário já usado no projeto).
- **Paleta de marca**: `--color-brand-*` trocou de teal para uma rampa slate-índigo
  ancorada em `#4C516D` (`index.css`), propaga pra botão primário, badges tone="teal",
  link ativo da sidebar e login.
- **Login redesenhado**: card dividido — painel esquerdo (`PainelMarca` em
  `routes/login.tsx`, visível em telas ≥ lg) com a `Logo` existente ampliada, headline
  e tagline sobre gradiente da marca; painel direito com o formulário (mesmo fluxo de
  auth de antes), ambos com dark mode.

### 2.7 Membros, skills e tags

Seção **Membros** (`routes/membros.tsx`), item "Membros" no grupo "Equipe" da sidebar,
com duas visões no seletor do topo:
- **Todos**: grade de cards (avatar, e-mail, projetos, skills, tags) + painel lateral
  "Skills da equipe" (ranking com barras, clique filtra) e "Tags de função" (com
  contagem de uso, clique filtra). KPIs: membros, projetos com equipe, skills
  diferentes, membros sem skills nem tags.
- **Por projeto**: uma seção por projeto (ícone, nº de membros, times, pilha de
  avatares, atalho pro Backlog) com tabela Membro | Time | Skills | Tags.
- Filtros: busca (nome, e-mail, skill, tag), projeto (só na visão Todos), skill, tag.

- **Dados**: membros vêm de `time_membro`/`time` (já sincronizados do DevOps, sem
  mudança na integração) via a view `v_membros` (consulta única, todos os projetos);
  `agruparMembros` junta as linhas pessoa × time em uma entrada por pessoa com a
  lista de projetos e times.
- **Skills**: texto livre por pessoa, gravado em `skill_tag` (tabela que já existia,
  pensada no CLAUDE.md §4 pra isso — só ganhou policy de escrita pro gestor). Adicionar
  usa `<datalist>` com as skills já cadastradas em qualquer pessoa (autocomplete sem
  travar em lista fixa). Remover é por chip (`×`).
- **Tags de função**: catálogo novo (`funcao_tag`), **não hardcoded** — o gestor cria
  quantas quiser pelo próprio card do membro ou pelo botão "Gerenciar tags" (lista
  todas as tags, permite renomear — afeta todo mundo que usa — e excluir). Associação
  N:N em `pessoa_funcao_tag`. Cor do chip é determinística por hash do nome da tag
  (mesmo truque já usado pro avatar em `lib/utils.ts`), sem coluna de cor no banco.
- **Filtros**: nome, skill, tag — acima da grade de cards.
- **Perfil do membro**: clique no card/linha abre um painel lateral (fecha com Esc)
  com nome, e-mail (`unique_name`), projetos/times e os editores: skills com
  autocomplete, tags existentes como botões "clique para atribuir" e criação de tag
  nova (se o nome já existir, reaproveita a tag em vez de duplicar). Erros viram toast.
- **Gerenciar tags**: modal com todas as tags, nº de membros usando cada uma,
  renomear inline e excluir com confirmação.
- **Realtime**: `skill_tag`/`funcao_tag`/`pessoa_funcao_tag` entraram na publicação
  (`realtime.tsx` invalida `membros`/`funcao_tags`/`skills_catalogo` nessas mudanças,
  mesmo padrão de debounce do resto do app).
- **Permissões**: ver seção 5 — sem RBAC ainda, escrita liberada pra qualquer
  `authenticated`.
- **Principais arquivos**: `supabase/migrations/20261007000400_membros_skills_tags.sql`,
  `apps/web/src/routes/membros.tsx`, `apps/web/src/routes/projeto-layout.tsx`,
  `apps/web/src/lib/queries.ts` (hooks `useMembros`/`useSkillsCatalogo`/`useFuncaoTags`
  + mutations), `apps/web/src/lib/utils.ts` (helpers de avatar/nome extraídos de
  `projeto.tsx`, agora compartilhados).

---

## 3. Configuração local (por máquina)

Arquivos **não versionados** que precisam existir:

- `.env.local`: `AZDO_ORG_URL`, `AZDO_PROJECTS`, `AZDO_PAT`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `supabase/.env.functions` (também enviados com `supabase secrets set --env-file`):
  `AZDO_ORG_URL`, `AZDO_PAT`, `AZDO_PROJECTS`, `WEBHOOK_BASIC_USER`, `WEBHOOK_BASIC_PASS`,
  `SYNC_SECRET`

Setup em máquina nova:
```bash
pnpm install
npx supabase login
npx supabase link --project-ref wswcksxvsqhmxxawgwmq
# criar os dois arquivos .env acima (pedir valores ao time; nunca commitar)
pnpm test && pnpm typecheck
```

Comandos úteis: `pnpm db:types`, `pnpm db:test`, `pnpm functions:deploy`,
`npx supabase db push` (novas migrations), `npx supabase migration list --linked`.

---

## 4. O que falta (em ordem)

- [x] **Usuário de demo** no Supabase Auth (`pnpm demo:user`)
- [ ] **Front `apps/web`**: React 19 + Vite + TanStack Router/Query + Tailwind v4 + shadcn/ui
  - [x] Login (Supabase Auth)
  - [x] Sidebar com projetos, indicador "ao vivo" (status do canal Realtime), horário da última sync
  - [x] **Backlog** em tabela Sprint → Feature → Task via `v_backlog`
  - [x] Seção **Membros** na sidebar (todos / por projeto, skills + tags, ver 2.7)
  - [ ] Aba/página **Sprints** (datas, status, capacidade por sprint — depende do
        motor de capacidade do P0, ainda não construído)
  - [x] Realtime `postgres_changes` → invalida queries + destaque ~2s + toast
  - [ ] Página **Sync**: últimos eventos, status da reconciliação, botão de sync completa
  - [x] Alias para importar `supabase/functions/_shared` no front; `apps/web/.env.example`
  - [x] Dark mode (toggle + persistência) e paleta de marca em `#4C516D`
  - [x] Login redesenhado (card dividido, painel de marca)
  - [ ] ESLint no front (o CI pede lint)
  - [ ] Code-split do bundle (build avisa chunk > 500 kB)
- [ ] **`deno test`** nas functions (hoje só Vitest cobre `_shared`)
- [ ] **CI/CD** `.github/`: `ci.yml` (pnpm cache, typecheck, lint, Vitest, deno test, build),
      `deploy-supabase.yml` (db push + functions deploy na main), gitleaks,
      `pull_request_template.md`, CODEOWNERS
- [ ] **Vercel** para o front (preview por PR, produção na main)
- [ ] **README**: escopos do PAT, link do Supabase, migrations, deploy (lembrar
      `--no-verify-jwt`), Vault/cron, Service Hooks pela UI, rodar o front, "Como contribuir"
- [ ] Validar o critério de pronto pelo app: alterar task no DevOps → aparece em < 5 s sem
      refresh; desligar subscription, alterar coisas, reconciliação corrige sozinha

### Depois da fundação (P0/P1 do CLAUDE.md)
Cadastro de ausências/feriados, motor de capacidade em `_shared` (puro), heatmap,
alertas, agente de IA, caixa de sugestões, executor.

---

## 5. Decisões e armadilhas conhecidas

- Migrations foram aplicadas inicialmente via `db query` e depois marcadas com
  `supabase migration repair --status applied`. **Daqui em diante, use só `supabase db push`.**
- Ao rodar comandos `supabase` no Windows/Git Bash, passe `</dev/null` para evitar prompt travado.
- Esta máquina Windows **não tem Python**; heredocs grandes com JSX no Git Bash quebraram —
  prefira a ferramenta de escrita de arquivos.
- Validação visual do front: `puppeteer-core` (instalado só no scratchpad, não no repo) com
  o Chrome local em headless, logando com o usuário de demo.
- **`AZDO_PROJECTS` limita quais projetos sincronizam.** Vazio = todos os projetos da
  org. Estava `IportJLKN12` no segredo das Edge Functions, por isso projetos novos
  criados no DevOps (`IportJLNK`, `Teste`) nunca chegavam ao banco. O código já trata
  projeto novo sozinho (o reconcile do cron faz a full na primeira vez), basta tirar o
  filtro: `npx supabase secrets unset AZDO_PROJECTS --project-ref wswcksxvsqhmxxawgwmq`.
  Os Service Hooks (webhooks) são criados por projeto: depois de liberar, rodar
  `pnpm devops:hooks create` para os projetos novos (sem eles, mudanças chegam pelo
  cron em até 5 min).
- **Permissões (Membros/skills/tags):** o app ainda não tem um segundo papel de usuário
  — todo `authenticated` é tratado como gestor. Por isso `skill_tag`, `funcao_tag` e
  `pessoa_funcao_tag` aceitam escrita de qualquer usuário logado, igual ao padrão de
  leitura já usado nas outras tabelas. Quando existir um usuário "somente leitura",
  essas policies precisam virar `select`-only pra esse papel.
- Nomes de responsáveis podem vir em CAIXA ALTA do DevOps; o front normaliza só na exibição.
- Free tier: wall clock de 150 s nas Edge Functions → orçamento de 110 s no `devops-sync`.

### Limites de uso (MVP no free tier)
Folga grande para poucos projetos/usuários: ~8,6 mil execuções/mês do cron (limite 500 mil),
~20 GETs leves ao DevOps por reconciliação (limite 200 TSTU/5 min por PAT), 1 conexão
Realtime por aba (limite 200), banco em ~13 MB (limite 500 MB). Proteções aplicadas:
- Upsert só grava se `rev` maior; meta (sprints/times/capacidade) só grava se mudou →
  reconciliação sem mudanças não gera escrita nem mensagens Realtime.
- Front junta rajadas de eventos Realtime em 1 refetch por query a cada 500 ms
  (`JANELA_INVALIDACAO_MS` em `realtime.tsx`).
- Reconcile relê capacidade/days off só da sprint atual e futuras (`sprintsAtivas` em
  `_shared/mappers/team.ts`); a sync completa relê todas.
- Retenção: job `radar-retencao-eventos` (diário 03:17 UTC) apaga eventos `processado`/
  `ignorado` com mais de 30 dias (migration `20261007000300`). Erros ficam.
- Atenção: projeto free do Supabase pausa após ~7 dias sem uso — abrir o painel antes da demo.
- Edição em massa no DevOps gera rajada de webhooks; retry + reconciliação cobrem throttling.
- Delete no DevOps vira soft delete (`deleted_at`); restore limpa `deleted_at` se rev ≥ salvo.
- Hierarquia do projeto de demo: Sprint → Feature → (User Story) → Task.
- A confirmar com a iPORT: campos de horas usados, datas próprias nas tasks, Epic, padrão de tags.

---

## 6. Histórico de sessões

| Data | O que aconteceu |
|---|---|
| 2026-10-07 | Backend de sync construído, publicado e validado (full, webhook, cron, latência). Sessão interrompida após o teste de latência. Na retomada: `.gitignore` reforçado, script inexistente `devops:inspect` removido do `package.json`, CLAUDE.md trazido para a raiz com a seção 8, histórico de migrations reparado, este STATUS.md criado e primeiros commits feitos. Repositório privado criado: github.com/KaueMarini/radar-capacidade. |
| 2026-10-07 | Front inicial (branch `feat/front-backlog`): login, sidebar ao vivo, tabela Backlog Sprint → Feature → Task com Realtime (destaque + toast); `pnpm demo:user`. Validado com Chrome headless; latência medida ~9 s (8 s são do DevOps). |
| 2026-10-07 | Branch do front consolidada na `main` (fast-forward, PR #1 marcado como merged, branch apagada). Proteções de limite: debounce de invalidação no front, capacidade só de sprints ativas no reconcile, retenção de 30 dias na tabela evento. Migration aplicada via `db push`, `devops-sync` republicada, reconcile e teste ao vivo validados. |
| 2026-10-07 | Máquina nova (`npx supabase login` + `link` nesta sessão). Nova aba **Membros**: migration `20261007000400` (`funcao_tag`, `pessoa_funcao_tag`, view `v_membros`, policies de escrita pro gestor), hooks/mutations em `queries.ts`, UI completa em `membros.tsx` (filtros, cards, painel de skills/tags, modal "Gerenciar tags"), Realtime estendido. **Dark mode** (`lib/theme.tsx`, toggle na sidebar, pares `dark:` em todos os componentes). Paleta de marca trocada pra slate-índigo (`#4C516D`). **Login redesenhado** (card dividido + painel de marca). Validado: `pnpm typecheck`/`test`/`build` limpos, navegação headless (login → Backlog → Membros, claro e escuro), adicionar skill + criar/associar tag + reload confirmando persistência no Supabase (depois removidos, eram só do teste), sem erros de console. |
| 2026-10-07 | Membros saiu da aba do projeto e virou seção própria na sidebar, com visões "Todos" (cards + ranking de skills/tags) e "Por projeto" (tabela por projeto); painel do membro e modal de tags refeitos (animação, Esc, confirmação de exclusão, toasts). Rampa da marca completada (200/300/400/800). Diagnóstico: projetos novos não sincronizavam por causa do segredo `AZDO_PROJECTS=IportJLKN12` (ver seção 5) — remoção do segredo pendente de aprovação do usuário. |
