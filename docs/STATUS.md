# Status do projeto — Radar de Capacidade

> Documento vivo. **Leia antes de começar qualquer tarefa** (em qualquer máquina) e
> **atualize ao final de cada etapa**: o que foi feito, onde parou e o que vem a seguir.
> Visão de produto e regras: [CLAUDE.md](../CLAUDE.md).

**Última atualização:** 2026-10-07
**Fase atual:** Fundação — sincronização com o Azure DevOps + front básico com Realtime.
Fora do escopo desta fase: IA, motor de capacidade, heatmap, sugestões e executor
(a arquitetura já está preparada para recebê-los).

---

## 1. Onde paramos

O **backend de sincronização está completo, publicado e validado em produção**.
A última ação antes da pausa foi o teste de latência ponta a ponta
(`pnpm devops:latency 29`), que terminou com sucesso e restaurou o valor original
da task (RemainingWork de #29 voltou a 6).

Situação verificada em 2026-10-07 ~03:47 UTC:

| Verificação | Resultado |
|---|---|
| Sync completa (`mode=full`) | concluída 03:40 UTC — 29 work items, 4 pessoas, 12 capacidades |
| Webhooks recebidos | 29 eventos, todos `processado`, nenhum erro |
| Cron de reconciliação (5 min) | `succeeded`, resposta HTTP 200 da function |
| `sync_state` | `fase=concluido`, `ultima_reconciliacao_ok=true` |
| Testes (Vitest) | 20/20 passando |
| `tsc --noEmit` e `deno check` | sem erros |
| Histórico de migrations remoto | reparado (`migration repair`); `db push` funciona |

**Próximo passo imediato:** criar o front em `apps/web` (seção 4).

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

- **Tabelas:** projeto, time, pessoa, time_membro, sprint, capacidade_sprint, dias_off,
  ausencia, feriado, skill_tag, work_item, sugestao, evento, sync_state.
  (`feature` é uma **view** sobre `work_item` com `tipo='Feature'`.)
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
  `sem_estimativa`). Ambas `security_invoker`.
- **Segurança:** RLS em todas as tabelas; `select` para `authenticated`; escrita só via
  service_role (RPCs com `execute` revogado de anon/authenticated).
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

- [ ] **Usuário de demo** no Supabase Auth (e-mail/senha), via script, sem senha no repo
      (`auth.users` está vazio hoje).
- [ ] **Front `apps/web`**: React 19 + Vite + TanStack Router/Query + Tailwind v4 + shadcn/ui
  - [ ] Login (Supabase Auth)
  - [ ] Sidebar com projetos, indicador "ao vivo" (status do canal Realtime), horário da última sync
  - [ ] Projeto → abas **Membros** (por time + capacidade por sprint), **Sprints**
        (datas, status atual/futura/passada), **Backlog** em árvore via `v_backlog`
        (responsável, estado, horas, tags, badge "sem estimativa")
  - [ ] Realtime `postgres_changes` → invalida queries + destaque ~2s + toast
        ("Task #123 atualizada no DevOps")
  - [ ] Página **Sync**: últimos eventos, status da reconciliação, botão de sync completa
  - [ ] Alias para importar `supabase/functions/_shared` no front; `apps/web/.env.example`
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
- Free tier: wall clock de 150 s nas Edge Functions → orçamento de 110 s no `devops-sync`.
- Delete no DevOps vira soft delete (`deleted_at`); restore limpa `deleted_at` se rev ≥ salvo.
- Hierarquia do projeto de demo: Sprint → Feature → (User Story) → Task.
- A confirmar com a iPORT: campos de horas usados, datas próprias nas tasks, Epic, padrão de tags.

---

## 6. Histórico de sessões

| Data | O que aconteceu |
|---|---|
| 2026-10-07 | Backend de sync construído, publicado e validado (full, webhook, cron, latência). Sessão interrompida após o teste de latência. Na retomada: `.gitignore` reforçado, script inexistente `devops:inspect` removido do `package.json`, CLAUDE.md trazido para a raiz com a seção 8, histórico de migrations reparado, este STATUS.md criado e primeiros commits feitos. |
