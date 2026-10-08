# Status do projeto — Radar de Capacidade

> Documento vivo. **Leia antes de começar qualquer tarefa** (em qualquer máquina) e
> **atualize ao final de cada etapa**: o que foi feito, onde parou e o que vem a seguir.
> Visão de produto e regras: [CLAUDE.md](../CLAUDE.md).

**Última atualização:** 2026-10-09
**Fase atual:** P0 em andamento — sync com o Azure DevOps, front reorganizado para o gestor
(Início com "Precisa de você" + mapa pessoa × semana, Equipe, Sugestões, projeto com Resumo/
Kanban/Cronograma/Equipe/Métricas, Regras de capacidade), motor de capacidade global com
regras do gestor. Ainda fora: agente de IA, cadastro de ausências/feriados pela UI.

---

## 1. Onde paramos

Sessão de 2026-10-09: **motor de análise de fluxo e capacidade em Python** (`services/analytics`,
só backend, ver 2.10), em etapas. **Etapa 1 feita** (migrations + config): `work_item_transicao`
(+ trigger em `evento`), `fluxo_config`/`analise_config`/`devops_relacao_cache`, colunas novas e
Realtime em `sugestao`; esqueleto `uv` (Python 3.12) com ruff/mypy/pytest. **Migrations ainda
não aplicadas**: esta máquina não tinha `.env.local`, `supabase/.env.functions` nem
`supabase login` — rodar `npx supabase login` e `npx supabase db push </dev/null`.
**Etapa 2 feita** (`domain/` puro + testes: 58 testes, 98,8% de cobertura no domínio, golden do
seed com Kauê 117% nas semanas de 05 e 12/10 e Julliano de férias com as tasks 116/117;
fórmulas em [metodologia.md](metodologia.md)). **Etapa 3 feita** (repositórios psycopg, cliente
DevOps só-GET com retry/`Retry-After`, backfill `uv run radar-analytics backfill`; 66 testes).
**Backfill ainda não rodado** (precisa das migrations aplicadas e do `.env` do serviço).
Próximo: etapa 4 (agente + validador + render).

O **backend de sincronização está completo, publicado e validado em produção**, e o
**front já tem login + tabela Backlog (Sprint → Feature → Task) ao vivo**
(na `main`, ver 2.6). Validado com navegador headless: alteração no
DevOps aparece na tela sem refresh, com destaque da linha e toast.
Também aplicadas as proteções de limite de uso (ver seção 5, "Limites de uso").

Sessão de 2026-10-08 (8ª parte): **equipe sugerida para projeto novo sem pessoas**. Motor
`_shared/capacidade/equipe-sugerida.ts` (termos do projeto = tags + skills citadas na descrição +
sinônimos; squad de projeto parecido por semelhança × cobertura × disponibilidade; pessoas
avulsas por encaixe × folga; montagem gulosa só com quem tem ≥ 8h livres e não está
sobrecarregado; termos que ninguém na empresa tem). Front: painel no topo do **Resumo** e na aba
**Equipe** do projeto quando ele está sem equipe (`precisaDeEquipe`: 0 membros, ou 1 e nenhum
item), botão "Sugerir reforço" na aba Equipe de projetos com gente, pendência "Projeto novo sem
equipe" no Início e selo "Sem equipe" em Projetos. Só sugere: o gestor monta o time no DevOps
(link + copiar e-mails). Testado de verdade: `pnpm devops:projeto-novo` criou no DevOps o projeto
fictício **Farol Cargas** (descrição + Tags, time esvaziado via Graph), a sync trouxe e o app
sugeriu o squad do Atlântico Docas e uma montagem de 4 pessoas. Remover com
`pnpm devops:projeto-novo --excluir`.

**Teste E2E completo de todas as funcionalidades foi pedido e interrompido** pelo usuário para
fazer a equipe sugerida — retomar (plano: proteções do back, navegação, DevOps → app ao vivo,
app → DevOps com Atribuir/Kanban, regras, skills/tags, renomear projeto e remover/readicionar
membro, desfazendo tudo).

Sessão de 2026-10-08 (7ª parte): **front reorganizado para o gestor** (pedido: "o gerente não
tem tempo de analisar passo a passo"). Navegação nova — sidebar: **Início** (`/inicio`, nova
home: 4 indicadores clicáveis, "Precisa de você" priorizado com ação de um clique, mapa de
ocupação pessoa × semana e saúde de cada projeto), **Sugestões** (`/analises`, aceita
`?projeto=`), **Equipe** (`/membros`: abas Ocupação [padrão, mapa 4/8/12 semanas] · Skills e
tags · Squads), **Projetos**; **Ajustes › Regras de capacidade** (`/capacidade`, só config:
regras gerais, jornada por pessoa, alertas por projeto). Projeto: **Resumo** (padrão; alertas
com ação, inclusive "parece bem aqui mas está pior no geral"), Kanban (`?resp=` filtra a
pessoa), Cronograma, **Equipe** (Squad + Capacidade fundidos: por squad, projeto × geral,
horas/dia editáveis, popover de alertas), Métricas. Rotas antigas (`/analises`, `/squad`,
`/capacidade` do projeto) redirecionam. A **ficha da pessoa** (drawer) ganhou "Ocupação em
todos os projetos" (próximas 2 semanas, 4 semanas em barras, por projeto, jornada × foco
editáveis). Motor global corrigido: a carga da sprint é distribuída **só nos dias em que a
pessoa está disponível** (antes caía em dias de folga e gerava falso "ausente com tasks").

Sessão de 2026-10-08 (6ª parte): **regras de capacidade do gestor**. Painel **Capacidade**
na sidebar (`/capacidade`): regras gerais (jornada, foco, % de atenção e de sobrecarga) e a
**ocupação geral** de cada pessoa somando todos os projetos (esta semana / 2 / 4 semanas),
com jornada e foco editáveis por pessoa na própria linha. Aba **Capacidade** em cada projeto:
limites próprios do projeto e horas/dia que cada pessoa dedica a ele (sobrepõe a Capacity do
DevOps), com "neste projeto × no geral" lado a lado e aviso quando alguém parece bem no
projeto mas está pior no total. Sem nada definido vale o **padrão de mercado**: 8h × 75% =
6h produtivas/dia, atenção > 80%, sobrecarga > 100%. Tudo ao vivo (Realtime) e usado pelas
sugestões de alocação. Ver 2.3 (`regras.ts`) e a migration `20261008000700`.
**Atenção:** a regra própria do Kauê (8h × 100% de foco) foi criada pelo usuário na tela,
não pelos testes.

Sessão de 2026-10-08 (5ª parte): **ciclo de vida de projetos/times/membros**. A sync
agora trata projeto **excluído** no DevOps (arquiva: some do app e da carga global;
restaurado volta com carga completa), **renomeado** (caminhos de sprints e tasks
acompanham, sem perder o vínculo com a sprint), **time excluído** e **membro removido**
(views e a ação "atribuir" ignoram inativos), e lê **descrição + linha "Tags:"** do projeto
(`tags_requeridas`, mostradas no cabeçalho do projeto). Testado no banco com transação
desfeita e **aplicado de verdade no DevOps** com PAT de acesso total: IportJLKN12 →
**Atlântico Docas**, Eu amo a Laryssa → **Rota Certa**, Teste → **Maré Assistente** (com
descrição e tags), **IportJLNK excluído** (lixeira do DevOps) e arquivado no app. Validado
no banco (0 caminhos antigos, 0 tasks sem sprint) e no headless (nomes, tags no cabeçalho,
IportJLNK fora de Projetos/Membros/Análises).

Sessão de 2026-10-08 (4ª parte): **carga global** e **empresa organizada**. As sugestões
agora usam a ocupação da pessoa em **todos os projetos** (`_shared/capacidade/global.ts`:
capacidade única limitada à jornada × tasks de qualquer projeto) — antes cada projeto via
o Kauê com 6h/dia só para ele, como se ele tivesse 24h/dia. E a org de demo foi
reorganizada (`pnpm devops:organizar`): cada pessoa com uma função e um foco, tasks
coerentes, Capacity realista (Kauê 4+2+2+0 = 8h/dia; demais 6h/dia num time só) — ver 2.5
e 2.9.

Sessão de 2026-10-08 (3ª parte): **tela Análises na sidebar** — para cada task sem
responsável, sugere as melhores pessoas do time (encaixe de skills/tags + tempo livre na
sprint, motor determinístico) e o gestor aprova com **Atribuir**, que reatribui no DevOps
com auditoria (ver 2.9). Primeiro fluxo "sugere → aprova → executa" do produto.

Sessão de 2026-10-08 (2ª parte): **skills automáticas** — o banco sugere skills para cada
pessoa a partir das tags das tasks dela (e da Feature pai), sozinho, a cada task nova ou
alterada; o gestor confirma/descarta no perfil (ver 2.7). 38 sugestões geradas na carga
inicial para 7 pessoas.

Sessão de 2026-10-08: **Membros ganhou a visão "Squads"** (substitui a tabela "Por
projeto"): um bloco por projeto com um card por squad (time do DevOps) mostrando a
utilização da sprint atual pelo motor, carga de cada pessoa e skills do squad — ver 2.7.
**Todos os 4 projetos do DevOps foram populados** (`pnpm devops:popular`, ver 2.5) e
**ganharam webhooks**. Hierarquia generalizada para o processo Basic (Epic como
requisito, migration `20261008000000`).

Sessão anterior: **cada projeto ganhou 5 telas** (Kanban, Cronograma, Squad, Métricas,
Análises — ver 2.8), a navegação foi refeita para escalar a muitos projetos (página
Projetos com busca/paginação no banco + recentes na sidebar), o **Kanban muda o estado
no Azure DevOps** ao arrastar (Edge Function `devops-acoes`, com auditoria em `acao`) e
entrou o **motor de capacidade** puro em `_shared/capacidade/motor.ts`.

Antes disso: seção **Membros** (skills + tags de função, editáveis pelo gestor,
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

**Próximo passo imediato:** cadastro de ausências/feriados pela UI (alimenta o motor),
webhooks dos projetos novos (ver seção 5), página de Sync, ESLint, CI/CD (seção 4).

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
| `20261007000500_projetos_kanban.sql` | `pg_trgm` + índice GIN em `projeto.nome` (busca), view `v_projeto_resumo` (lista paginada: itens, features, membros, sprint atual, última sync), `v_membros` ganha `projeto_nome`, tabela `acao` (auditoria de ações no DevOps), `sync_origem` aceita `app` |
| `20261008000300_analises_alocacao.sql` | `v_backlog` ganha `feature_tags`; view `v_sem_dono_resumo` (tasks abertas sem dono por projeto) |
| `20261008000100_skills_automaticas.sql` | `skill_tag` ganha origem `tasks`, `evidencias`, `horas`, `rejeitada`, `atualizado_em`; `unaccent`; `skill_chave`; `recalcular_skills`; triggers por comando em `work_item`; `v_membros.skills` com origem/confirmada/rejeitada/evidencias; carga inicial |
| `20261008000200_skills_grafia_unica.sql` | sugestão nova usa a grafia mais comum da skill no time; normaliza as existentes |
| `20261008000000_hierarquia_epic_basic.sql` | `feature_ancestral` prefere Feature e cai para Epic (processo Basic: Epic → Task); `v_backlog` mostra Epic sem filhos como requisito vazio; recalcula todos os itens |
| `20261007000400_membros_skills_tags.sql` | `funcao_tag` + `pessoa_funcao_tag` (catálogo de tags de função) + policies de escrita pro gestor em `skill_tag`/`funcao_tag`/`pessoa_funcao_tag` + view `v_membros` |

- **Tabelas:** projeto, time, pessoa, time_membro, sprint, capacidade_sprint, dias_off,
  ausencia, feriado, skill_tag, funcao_tag, pessoa_funcao_tag, work_item, sugestao,
  evento, sync_state. (`feature` é uma **view** sobre `work_item` com `tipo='Feature'`.)
- **`acao`**: toda escrita que o app faz no DevOps (hoje: mover estado no Kanban) — tipo,
  devops_id, antes/depois (jsonb), status `aplicada`/`erro`, erro, usuario_id/email,
  criado_em. Só a Edge Function grava (service_role); front só lê.
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
- `kanban.ts`: colunas por **categoria** de estado do processo (Proposed/InProgress/
  Resolved/Completed), `estadoDestino` (1º estado do tipo na categoria), `categoriaDe`
  (usa os metadados do processo; sem eles, nomes conhecidos). Features/Epics fora.
- `capacidade/regras.ts` (2026-10-08): regras do gestor em cascata e `PADRAO_MERCADO`
  (8h, 75% de foco, atenção 80%, sobrecarga 100%). Horas produtivas = jornada × foco
  (pessoa → geral); limites = projeto (só nas telas do projeto) → geral. Tabelas:
  `regra_capacidade` (linha única), `regra_capacidade_pessoa`, `regra_capacidade_projeto`,
  `alocacao_projeto` (escrita por autenticado, `atualizado_por` via trigger, no Realtime).
  `pessoa.horas_semana_base` **não é mais usado** pelos motores.
- `capacidade/motor.ts`: **motor de capacidade** (sem IA). Por pessoa × sprint:
  capacidade/dia = alocação do gestor no projeto → Capacity do DevOps (soma dos times) →
  horas produtivas da pessoa; × dias úteis − feriados − days off (da pessoa e do time); carga =
  horas restantes (ou estimado − concluído) das tasks abertas, ignorando pais com filhos;
  status pelos limites (`statusDe(carga, cap, limites)`); `sem-capacidade` se tem carga e
  0 h. Cada célula traz `origemCapacidade` (gestor/devops/padrao) e os `limites` usados.
  `global.ts`: por dia, soma por projeto (alocação do gestor ou Capacity), teto nas horas
  produtivas. Testes: motor 12, global 10, regras 4.
- `log.ts`: log estruturado (JSON) com `devops_id` em cada linha.
- `db.types.ts`: gerado por `pnpm db:types`.
- Testes: `azdo/client.test.ts`, `mappers/mappers.test.ts` + fixtures reais em `__fixtures__/`.

### 2.4 Edge Functions (deploy feito, todas `--no-verify-jwt`)
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
- **`devops-acoes`** (escreve no DevOps, exige JWT de usuário logado):
  - `POST { acao: "estados", projeto_id }` → estados de cada tipo do projeto com categoria
    (`_apis/wit/workitemtypes/{tipo}/states`).
  - `POST { acao: "mover", devops_id, categoria }` → recusa Feature/Epic, escolhe o estado
    destino pelo processo, faz JSON Patch em `System.State`, grava a nova revisão no banco
    na hora (`upsertWorkItems`, origem `app`) e registra em `acao` (aplicada ou erro).
    PAT precisa de **Work Items (Read & Write)** — já tem (testado).
  - `POST { acao: "atribuir", devops_id, pessoa_id, motivo? }` (2026-10-08) → recusa
    Feature/Epic, exige que a pessoa esteja num time do projeto (o DevOps não aceita outro
    responsável), faz JSON Patch em `System.AssignedTo` com o `unique_name`, grava a revisão
    na hora e registra em `acao` (tipo `atribuir`, antes/depois + `motivo` com encaixe,
    skills que bateram e utilização antes/depois). Usado pela tela Análises.
- Runtime em `supabase/functions/_lib` (`context.ts`, `sync.ts`).

### 2.5 Scripts (`scripts/`, rodam com tsx + `.env.local` + `supabase/.env.functions`)
- `pnpm devops:seed [--reset]`: completa o projeto IportJLKN12 (responsáveis por skill,
  Kauê ~117% na Sprint 1, capacidade 6h/dia, férias na Sprint 2, feriado na Sprint 3,
  cadeia Feature → User Story → Task, task sem estimativa). Idempotente.
- `pnpm devops:hooks [create|list|delete]`: gerencia subscriptions de Service Hooks. Idempotente.
- `pnpm devops:latency <id>`: mede latência DevOps → banco e restaura o valor original.
- `pnpm devops:projeto-novo [--dry] [--excluir]` (2026-10-08): cria o projeto fictício "Farol
  Cargas" sem pessoas (tira o criador do time via Graph) para demonstrar a equipe sugerida.
- `pnpm devops:projetos [--dry] [--excluir]` (2026-10-08): nomes fictícios + descrição com
  linha `Tags:` por projeto (contexto para o agente), chaveado por ID. Planejado:
  IportJLKN12 → **Atlântico Docas**, Eu amo a Laryssa → **Rota Certa**, Teste →
  **Maré Assistente**; `--excluir` exclui o IportJLNK (lixeira do DevOps, 28 dias).
  Exige PAT com *Project and Team (Read, write & manage)*. **Rodado em 2026-10-08**
  (idempotente: rodar de novo só confirma "já está certo").
  Os scripts `devops-popular`, `devops-organizar` e `devops-seed` passaram a usar o **ID**
  do projeto (renomear não quebra; `SEED_PROJETO` sobrescreve o do seed).
- `pnpm devops:organizar [--dry]` (2026-10-08): organiza a org como empresa. `PERFIL`
  (função + skills principais por pessoa), `ALOCACAO` (h/dia por projeto; padrão 6) e
  `RESPONSAVEIS` (devops_id → pessoa; `null` = deixar sem dono). Ajusta Capacity no DevOps
  (Sprint 1..3), reatribui só tasks **abertas** (fechadas = histórico), limpa tags de teste
  e grava no app as funções (`funcao_tag`) e skills confirmadas (`origem='gestor'`, ou
  confirma a sugerida). Idempotente (2ª rodada = 0 mudanças). Atenção: no DevOps, `add`
  em `System.Tags` **acrescenta**; para remover tag use `replace` com a lista final.
  Times hoje: Kauê = Tech Lead (IportJLNK 4h, IportJLKN12 2h, Eu amo a Laryssa 2h,
  Teste 0h); IportJLKN12 = Laryssa (Front-end), Nicolas (Back-end), Julliano (Dados & BI);
  Eu amo a Laryssa = Abner (Mobile, ~90% na Sprint 1 de propósito), Sebastião (Back-end),
  Aaron (QA); Teste = Abigail (Copilot Studio), Alexsandro (Power Platform), Arão
  (Dados & BI), Thabata (QA), Valeria (Conteúdo & UX), Wallace (Infra & Segurança).
  Sem dono de propósito: Teste #54/#57/#59 (para a demo das sugestões) e o que o IportJLNK
  não comporta (só o Kauê no time — precisa de gente adicionada pela UI do DevOps).
- `pnpm devops:popular [--reset] [--projeto "Nome"]`: popula **todos** os projetos (menos
  IportJLKN12, que é do `devops:seed`) com Sprint 1..3 datadas (associadas ao time),
  capacidade 6h/dia por membro, 5 requisitos por tema (Feature; **Epic** no processo
  Basic) e 4–6 tasks cada, com tags, horas (algumas sem estimativa), estado (algumas
  Active/Closed na Sprint 1) e responsável escolhido entre quem **já está no time**
  (sem ninguém compatível, fica sem dono). Temas em `TEMAS` (Teste = bot Copilot Studio,
  Eu amo a Laryssa = app do motorista, IportJLNK = fiscal/faturamento). Idempotente
  (procura pelo título), tag `seed-popular`; `--reset` manda os itens para a lixeira.
  Rodado em 2026-10-08: 82 itens criados (15 requisitos + 67 tasks).
- `pnpm demo:user`: cria o usuário de demo no Supabase Auth (Admin API, service_role só local).
  Lê `DEMO_EMAIL`/`DEMO_PASSWORD` do `.env.local`; sem senha, gera e imprime uma.
  Usuário atual: `demo@radar-capacidade.dev` (senha no `.env.local` da máquina original;
  em 2026-10-08 o `DEMO_PASSWORD` desta máquina já não batia — a senha foi trocada em
  outra sessão). Para testes automáticos existe um usuário separado,
  `qa-headless@radar-capacidade.dev` (`QA_EMAIL`/`QA_PASSWORD` no `.env.local`), criado
  com o mesmo script (`DEMO_EMAIL=... DEMO_PASSWORD=... pnpm demo:user`) para não mexer na
  senha do usuário de demo.

### 2.6 Front (`apps/web`)
- Vite 8 + React 19 + TS strict + TanStack Router (rotas em código, `src/router.tsx`) +
  TanStack Query + Tailwind v4 (`@tailwindcss/vite`, tema em `src/index.css`) + supabase-js
  tipado com `@shared/db.types`. Componentes base estilo shadcn em `src/components/ui`
  (button, input, badge) — escritos à mão, sem a CLI do shadcn.
- Aliases: `@/` → `apps/web/src`, `@shared/` → `supabase/functions/_shared`.
- Rotas (2026-10-08, reorganização): `/login`, `/` → `/inicio`, `/inicio`, `/analises`
  (Sugestões, `?projeto=`), `/membros` (Equipe, `?visao=skills|squads`; sem visao = Ocupação),
  `/projetos` (`?q=`, `?p=`), `/capacidade` (Regras), `/projetos/$projetoId/{resumo|kanban|
  cronograma|equipe|metricas}` (index → `resumo`; `kanban?resp=&sprint=`; `analises`→resumo,
  `squad`/`capacidade`→equipe). Guard de sessão no `beforeLoad` da rota `app`.
- Peças compartilhadas: `lib/ocupacao.ts` (semanas, `useOcupacaoEquipe` — uma consulta
  global para Início/Equipe), `lib/membros.ts` (`agruparMembros`), `components/mapa-ocupacao.tsx`
  (heatmap pessoa × semana, ordenado por risco), `components/ocupacao-membro.tsx` (seção da
  ficha), `_shared/capacidade/atencao.ts` ("Precisa de você", testado).
- **Sidebar**: Início, Sugestões (badge de tasks sem dono), Equipe, Projetos, **Recentes** (5 últimos projetos abertos, guardados no
  navegador em `lib/recentes.ts`) — a lista completa de projetos saiu da sidebar, indicador "Ao vivo / Conectando / Desconectado" (status do canal
  Realtime), "Última reconciliação há X" (sync_state), e-mail + sair.
- **Backlog** (`src/routes/projeto/lista.tsx`, hoje é a visão "Lista" do Kanban): KPIs (sprints, features, itens, horas restantes,
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
- **Squads** (`routes/membros-squads.tsx`, URL `?visao=squads`; o antigo `?visao=projeto`
  redireciona para cá): substituiu a tabela "Por projeto". Grade de blocos por projeto
  (projeto com 1 squad ocupa 1 coluna, até 3 por linha; com 2+ squads ocupa a linha
  toda). Cabeçalho do projeto: marca, nº de squads/pessoas, sprint atual, status de carga
  do projeto, "N sem dono", link para a aba Squad. **Card do squad** (= time do DevOps;
  o time padrão "<Projeto> Team" aparece como "Squad principal"): faixa de cor estável
  pelo nome, % de utilização na sprint atual + horas carga/capacidade/livres + barra,
  aviso quando alguém está sobrecarregado mesmo com o squad ok, lista de pessoas com
  mini-medidor e % (clique abre o painel de skills/tags), skills do squad (×N pessoas).
  Card tracejado "Fora dos squads" para quem tem task mas não está em time. Números do
  motor via `useCapacidadeProjeto` (iguais aos das abas Squad/Análises) + agregação pura
  `resumirSquad` em `_shared/capacidade/squads.ts` (testada). **Escala:** cada bloco só
  busca dados quando chega perto da tela (`IntersectionObserver`, `QuandoVisivel`).
- Filtros: busca (nome, e-mail, skill, tag), projeto (só na visão Todos), skill, tag.

- **Dados**: membros vêm de `time_membro`/`time` (já sincronizados do DevOps, sem
  mudança na integração) via a view `v_membros` (consulta única, todos os projetos);
  `agruparMembros` junta as linhas pessoa × time em uma entrada por pessoa com a
  lista de projetos e times.
- **Skills**: texto livre por pessoa, gravado em `skill_tag` (tabela que já existia,
  pensada no CLAUDE.md §4 pra isso — só ganhou policy de escrita pro gestor). Adicionar
  usa `<datalist>` com as skills já cadastradas em qualquer pessoa (autocomplete sem
  travar em lista fixa). Remover é por chip (`×`).
- **Skills automáticas (2026-10-08)** — migrations `20261008000100` e `20261008000200`:
  - `recalcular_skills(pessoas[])` (SQL, sem IA): evidência = tags da task + tags da
    Feature/Epic pai, em tasks atribuídas à pessoa (abertas e fechadas), ignorando tags
    `seed-*`. Variações viram a mesma skill (`skill_chave`: minúsculas, sem acento, sem
    hífen/espaço → "back-end" = "backend"), e a grafia exibida é a mais usada no time.
    Com **2+ tasks** vira sugestão: `origem='tasks'`, `confirmada=false`, `confianca` =
    min(1, n/5), `evidencias` (nº de tasks) e `horas`.
  - **Automático por trigger** em `work_item` (por comando, com transition tables): ao
    inserir ou mudar responsável, tags, tipo, Feature pai, exclusão ou horas, recalcula as
    pessoas afetadas (antes e depois); tag mudando na Feature recalcula quem tem task
    embaixo. Vale para webhook, reconcile, sync completa e Kanban. Sugestão que perde a
    evidência some; confirmadas e skills do gestor ficam (com `evidencias` atualizado).
  - **Descartar** = `rejeitada=true` (a linha fica para a inferência não sugerir de novo).
    No app: chips sugeridos tracejados com ✨; no perfil, bloco "Sugeridas pelas tasks"
    (nº de tasks, ✓ confirmar, × descartar, "Confirmar todas") e "Descartadas" com
    restaurar; aviso no topo de Membros com o total pendente. Digitar uma skill já
    sugerida confirma ela. Front lê o jsonb via `lib/skills.ts` (`lerSkills`, testado);
    `Membro`/`PessoaProjeto` ganharam `skillsInfo`.
  - **Tags de função continuam manuais** (função não se deduz das tasks).
  - Sinônimos de palavras diferentes ("realtime" × "tempo-real") e leitura do descritivo /
    descrição da Feature ficam para o agente de IA (P1).
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
  `apps/web/src/routes/membros.tsx`,
  `apps/web/src/lib/queries.ts` (hooks `useMembros`/`useSkillsCatalogo`/`useFuncaoTags`
  + mutations), `apps/web/src/lib/utils.ts` (helpers de avatar/nome extraídos de
  `projeto.tsx`, agora compartilhados).

### 2.9 Análises — sugestões de alocação (sidebar, `/analises`)

- **O quê**: lista as tasks abertas **sem responsável** de todos os projetos e, para cada
  uma, as 3 melhores pessoas do time do projeto, com botão **Atribuir** (gestor aprova →
  reatribui no DevOps via `devops-acoes` `atribuir`, auditado em `acao`). Badge na sidebar
  com o total pendente.
- **Ocupação global (2026-10-08)**: a folga de cada candidato vem de
  `_shared/capacidade/global.ts` (`cargaGlobal`, 7 testes), não do motor por projeto.
  Por dia útil do período (datas da sprint da task): capacidade = soma da Capacity da
  pessoa em **todos os times** que cobrem o dia, **limitada à jornada**
  (`horas_semana_base/5`); sem Capacity em nenhum time, a jornada. Folga pessoal zera o dia,
  folga de time tira só a parcela daquele time, feriado zera. Carga = tasks abertas da
  pessoa em **qualquer projeto**, proporcional aos dias úteis da sprint da task que caem no
  período. Front: `lib/carga-global.ts` (`useCargaGlobal(ids)`: busca sprints, Capacity,
  folgas, feriados e `v_backlog` só das pessoas candidatas; cache por período). A tela
  mostra "Ocupação em todos os projetos (X h de capacidade): Projeto A 36h · Projeto B 10h"
  e avisa quando o time do projeto tem uma pessoa só. As abas Squad/Análises **do projeto**
  continuam mostrando a alocação dentro do projeto (motor por projeto).
- **Motor** (puro, sem IA): `_shared/capacidade/recomendacao.ts` (`recomendarAlocacao`,
  9 testes). Score = 65% **encaixe** (tags da task + tags da Feature pai × skills da
  pessoa: confirmada = 1, sugerida pelas tasks = 0,5–0,8 conforme evidência, tag de função
  = 0,5; tags `seed-*` ignoradas; mesma normalização do banco, `chaveSkill`) + 35% **folga**
  (horas livres na sprint da task depois de recebê-la, células do motor de capacidade).
  Multiplicador por status depois: limite ×0,85, sobrecarga ×0,5, sem capacidade ×0 (vai
  para o fim). Task sem tags → decide pela folga. Task sem estimativa → não pesa na carga
  (sinalizada). Task sem sprint datada → usa a sprint atual. **Distribuição sequencial**:
  tasks ordenadas por sprint mais próxima e horas desc; a carga da melhor opção de cada
  task já conta para as seguintes (não empilha tudo em uma pessoa).
- **Tela** (`routes/analises.tsx`): KPIs (tasks sem dono, horas, projetos), busca e filtro
  de projeto, bloco por projeto carregado sob demanda (`components/quando-visivel.tsx`,
  extraído da visão Squads). Cada task: #id (abre no DevOps), feature, sprint, horas, tags
  consideradas; melhor opção destacada com rótulo de encaixe (alto/médio/baixo/nenhuma
  skill em comum), chips das skills que bateram (confirmada verde, sugerida tracejada,
  função violeta), impacto "37% → 52% em Sprint 1 · 22h livres depois" e status; "Ver
  outras opções". Popover "Como a sugestão é calculada".
- **Dados**: `v_sem_dono_resumo` (projetos com pendência, aproximação por nome de estado)
  escolhe os blocos; a lista exata vem de `useCapacidadeProjeto().semResponsavel` (estados
  reais do processo). `v_backlog` ganhou `feature_tags` (migration `20261008000300`).
- **Validado**: Chrome headless claro/escuro sem erros; clique real em Atribuir na #38 →
  DevOps com Kauê, registro em `acao` com motivo, task saiu da lista; depois desfeito.

### 2.8 Projetos e telas do projeto (pensado para muitos projetos)

- **Página Projetos** (`routes/projetos.tsx`): busca por nome com debounce (URL `?q=`),
  paginação de 20 no banco (`range` + `count: exact`, URL `?p=`), nunca carrega todos.
  Lê `v_projeto_resumo` (itens, features, membros, sprint atual, última sync). Busca
  usa índice trigram. "Acessados recentemente" no topo.
- **Layout do projeto** (`routes/projeto/layout.tsx`): breadcrumb, nome, processo,
  sprint atual, descrição, "Abrir no DevOps" e as 5 abas. Registra o projeto nos recentes.
- **Kanban** (`projeto/kanban.tsx`, aba padrão): colunas A fazer / Em andamento /
  Resolvido (só se o processo usa) / Concluído. Filtros: sprint (padrão = atual, na URL),
  busca, responsável (inclui "sem responsável"), tipos (Task, User Story, Bug...).
  Card: tipo, #id (abre no DevOps), estado, título, feature, tags, responsável, horas,
  "sem estimativa". **Arrastar** muda o estado no DevOps: card move na hora (otimista,
  com spinner), toast de sucesso ou volta + toast de erro; colunas sem estado válido
  para o tipo ficam apagadas durante o arrasto. Alternância **Quadro / Lista** (Lista =
  tabela de backlog antiga).
- **Cronograma** (`projeto/cronograma.tsx`): Gantt — eixo semanal, linha de hoje, faixa
  por sprint (atual destacada) e, sob a sprint onde começa, cada feature como barra da
  1ª à última sprint com itens; preenchimento = % concluído (horas; sem horas, itens).
  Tooltip com datas, itens e horas.
- **Squad** (`projeto/squad.tsx`): pessoas por time do DevOps (+ "com tasks, fora dos
  times"), skills/tags e medidor de carga na sprint escolhida; KPIs de capacidade e
  carga; clique abre o mesmo painel de skills/tags da seção Membros.
- **Métricas** (`projeto/metricas.tsx`): KPIs (itens, % concluído, horas restantes, sem
  estimativa), itens por estado (barra 100%), horas por sprint (colunas empilhadas
  concluídas/restantes, eixo único, tooltip), horas restantes por responsável e
  progresso por feature (tabela).
- **Análises** (`projeto/analises.tsx`): mapa de utilização pessoa × sprint (status com
  ícone + texto, tooltip com horas), "Precisa de atenção" (sobrecarga, no limite, sem
  capacidade, tasks sem dono), detalhe da sprint (dias úteis, capacidade, carga, livre,
  utilização) e "Quem pode absorver trabalho" (horas livres até 85% + skills/tags).
- **Dados**: `lib/capacidade-projeto.ts` junta sprints, `v_backlog`, membros,
  `capacidade_sprint`, `dias_off`, `feriado` e estados do processo e roda o motor —
  Squad e Análises mostram os mesmos números. Realtime agora também escuta
  `capacidade_sprint` e `time_membro`.
- **Gráficos**: paleta categórica de referência (skill dataviz) em `index.css`
  (`--viz-1..4`, `--status-*`, com versão `.dark`); status nunca só por cor.
- **Componentes novos**: `components/avatar.tsx` (Avatar, MarcaProjeto),
  `components/ui/card.tsx` (Card, CardTitulo, Stat), `components/carga.tsx` (medidor e
  status de carga).
- **Validado** (Chrome headless, claro e escuro): todas as telas sem erro de console;
  Kanban movendo a task #10 New → Active (DevOps, banco com origem `app` e registro em
  `acao` conferidos) e de volta para New; Análises reproduz o cenário do seed (Kauê
  117% na Sprint 1). 35 testes, typecheck e build limpos.

### 2.10 Serviço de análise de fluxo e capacidade (`services/analytics`, Python)

- **O quê**: lê o banco, calcula fluxo + capacidade de forma determinística, pede ao LLM só a
  escolha de uma ação candidata + texto, valida e grava `sugestao` **pendente**. Nunca escreve
  no DevOps (PAT só leitura). Plano: domain → repositórios → agente → API/disparo → deploy.
- **Stack**: Python 3.12 via `uv` (`uv sync`, `uv run pytest`), FastAPI, Pydantic v2,
  psycopg 3, httpx, structlog, ruff + mypy --strict + pytest/hypothesis.
  Arredondamento e tolerâncias só em `numeros.py`. Configuração por env (`config.py`).
- **Domínio** (`domain/`, puro, datas por parâmetro — fórmulas em `docs/metodologia.md`):
  `capacidade.py` (porta a cascata de `regras.ts`/`global.ts`, mas por **semana**; fallback de
  horas "sistema"; conflito com ausência), `fluxo.py` (waiting time com reentrada, cycle/lead/
  aging × p85, WIP pessoa/coluna), `pareto.py` (6 causas, vitais ≥ 80%), `priorizacao.py`
  (esforço × impacto com referências fixas), `candidatos.py` (reatribuir/mover_sprint/pausar
  simulados no motor; só Tasks), `anonimizacao.py`, `analise.py` (junta tudo por projeto).
  Testes: `tests/unit`, `tests/property` (hypothesis), `tests/golden` (cenário do seed;
  `UPDATE_GOLDEN=1` regenera `seed_esperado.json`).
- **Repositórios** (`repositories/`): `snapshot.py` (SQL de leitura: projeto + carga global das
  pessoas dele, mesmo recorte de `lib/carga-global.ts`; `criado_em` real vem da transição de
  criação do backfill), `escrita.py` (sugestão idempotente por `hash_payload`, transições,
  cache de dependências), `mapeamento.py` (linha → modelo, puro e testado), `db.py` (pool com
  `prepare_threshold=None` por causa do pooler do Supabase). `tests/integracao` roda o SQL de
  verdade quando há `SUPABASE_DB_URL`.
- **DevOps** (`devops/client.py`): só `GET` (`/updates` paginado, `workitems?$expand=relations`
  para dependências). PAT do serviço = **Work Items (Read)**. `backfill.py` + CLI
  `radar-analytics backfill [--projeto ID] [--limite N]`.
- **Migrations** (2026-10-09, **pendentes de `db push`**):
  - `20261009000000_work_item_transicao`: histórico de `System.State`/`System.BoardColumn`
    (único por item+campo+rev). Trigger `after insert` em `evento` extrai `oldValue/newValue`
    do Service Hook (origem `evento`); backfill pelo serviço via `/updates` (origem `backfill`).
    Erro no trigger vira `warning`, nunca derruba o webhook.
  - `20261009000100_fluxo_config`: `fluxo_config` (projeto × coluna: espera/ativa, SLA em horas
    úteis, WIP coluna; coluna `*` = WIP por pessoa) com defaults Code Review 24h, Homologação
    48h, WIP pessoa 3, semeado para projetos atuais e novos (trigger); `analise_config` (tags/
    campo de bloqueio, campo de horas da carga, fallback de horas, percentil); 
    `devops_relacao_cache` (dependências lidas pelo serviço).
  - `20261009000200_sugestao_analytics`: `sugestao` ganha `projeto_id`, `origem`, `markdown`,
    `acao` (`{tipo, work_item_id, de_pessoa_id, para_pessoa_id|para_sprint_id}`),
    `impacto_antes/depois`, `versao_prompt`, `hash_payload` (único entre pendentes),
    `usou_fallback`; **entra no Realtime** (antes não estava).

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
  - [x] Página **Projetos** com busca/paginação no banco + recentes na sidebar (2.8)
  - [x] Telas do projeto: **Kanban** (move estado no DevOps), **Cronograma**, **Squad**,
        **Métricas**, **Análises** (2.8)
  - [x] **Motor de capacidade** puro + mapa de utilização + alertas de sobrecarga
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

### Próximos (P0/P1 do CLAUDE.md)
Cadastro de ausências/feriados pela UI (hoje o motor usa days off do DevOps e a tabela
`feriado`, vazia), utilização por **semana** (hoje é por sprint), agente de IA (explicar
e priorizar as sugestões da tela Análises, ler descritivo/Feature, sinônimos de skills),
sugestões proativas por evento (webhook → sugestão na caixa), sugestões de **realocação**
de quem está sobrecarregado (mesmo motor `recomendarAlocacao`, partindo de tasks com dono)
e mover task de sprint. O executor de "atribuir" já existe (`devops-acoes`).

---

## 5. Decisões e armadilhas conhecidas

- Migrations foram aplicadas inicialmente via `db query` e depois marcadas com
  `supabase migration repair --status applied`. **Daqui em diante, use só `supabase db push`.**
- Ao rodar comandos `supabase` no Windows/Git Bash, passe `</dev/null` para evitar prompt travado.
- Esta máquina Windows **não tem Python**; heredocs grandes com JSX no Git Bash quebraram —
  prefira a ferramenta de escrita de arquivos.
- Validação visual do front: `puppeteer-core` (instalado só no scratchpad, não no repo) com
  o Chrome local em headless, logando com o usuário de demo.
- **`AZDO_PROJECTS` limita quais projetos sincronizam** (vazio = todos). Filtra por **nome
  ou ID** — use **ID**, porque nome quebra ao renomear o projeto. Hoje está **comentado**
  em `.env.local` e `supabase/.env.functions` e **não existe** nos segredos: cuidado, o
  `secrets set --env-file` envia o arquivo inteiro (em 2026-10-08 isso recolocou o filtro
  antigo por engano e o reconcile parou de ver os projetos renomeados; corrigido com
  `secrets unset AZDO_PROJECTS`). Estava
  `IportJLKN12` no segredo das Edge Functions e barrava projetos novos; **foi removido**
  (2026-10-07) e `IportJLNK`, `Teste` e `Eu amo a Laryssa` foram importados. Projeto novo
  no DevOps aparece em até 5 min (cron do reconcile faz a full na 1ª vez).
- **Webhooks: os 4 projetos têm** (criados em 2026-10-08, 4 eventos cada). Projeto novo
  precisa rodar `pnpm devops:hooks create` (sem `AZDO_PROJECTS`, cobre todos).
- **Ciclo de vida (migrations `20261008000400`–`0600`)**: `projeto.deleted_at`;
  `arquivar_projeto` (projeto + work items + sprints em soft delete, membros inativos);
  `renomear_paths_projeto` (troca o prefixo `Antigo\` → `Novo\` nas **sprints primeiro** e
  depois nos work items — na ordem inversa o trigger de sprint desvinculava as tasks);
  views `v_projeto_resumo` (+ coluna `tags`), `v_membros` e `v_sem_dono_resumo` ignoram
  projetos arquivados e membros `ativo=false`; `projeto` no Realtime. `syncProjetos`:
  detecta renomeação, arquiva quem sumiu da lista da org (lista vazia = falha, nunca
  arquiva tudo), reativa restaurados apagando o `sync_state` (força carga completa).
  `syncMeta`: apaga times que sumiram (cascata em membros/capacidade/folgas).
  `devops-acoes atribuir` exige membro ativo. Mapper `_shared/mappers/projeto.ts`
  (`lerDescricaoProjeto`: linha `Tags: a, b` → `tags_requeridas`, testado).
- **PAT — escopos necessários** para tudo funcionar: Work Items (Read, write & manage),
  Project and Team (Read, write & manage), Service Hooks (Read, write & manage) e, para
  criar squads com pessoas, Graph (Read & manage). **O PAT atual (2026-10-08) tem acesso
  total.** Trocar em `.env.local` **e** `supabase/.env.functions` + `npx supabase
  secrets set --env-file supabase/.env.functions`.
- **Squads novos no DevOps exigem Graph API**: o PAT atual **não** tem escopo de Graph
  (`vssps.../_apis/graph` → 401), então o sistema não consegue criar times nem colocar
  pessoas neles. Criar squads pela UI do DevOps (Project settings → Teams) funciona: a
  sync traz em até 5 min e a visão Squads se ajusta. Para automatizar, gerar PAT com
  **Graph (Read & manage)** + **Project and Team (Read, write & manage)**.
- **Processo Basic** (IportJLNK): não tem Feature; o requisito é o **Epic** (Epic → Task).
  Estados da Task no Basic: To Do / Doing / Done.
- **Kanban escreve no DevOps** por gesto explícito do gestor (decisão do usuário): vale
  para qualquer tipo exceto Feature/Epic (regra do CLAUDE.md: Features nunca mudam).
  Toda tentativa fica em `acao`. Sugestões da IA continuam exigindo aprovação.
- **Recentes** ficam no `localStorage` do navegador (conveniência por pessoa, não é dado
  do sistema).
- **Utilização é por sprint**, não por semana ainda (o CLAUDE.md fala em semana).
- **Escala**: listas de projetos sempre paginadas no banco. A seção Membros ainda
  carrega todos os vínculos pessoa × time de uma vez — paginar quando crescer.
- **Permissões (Membros/skills/tags):** o app ainda não tem um segundo papel de usuário
  — todo `authenticated` é tratado como gestor. Por isso `skill_tag`, `funcao_tag` e
  `pessoa_funcao_tag` aceitam escrita de qualquer usuário logado, igual ao padrão de
  leitura já usado nas outras tabelas. Quando existir um usuário "somente leitura",
  essas policies precisam virar `select`-only pra esse papel.
- Nomes de responsáveis podem vir em CAIXA ALTA do DevOps; o front normaliza só na exibição.
- Free tier: wall clock de 150 s nas Edge Functions → orçamento de 110 s no `devops-sync`.

### A confirmar (serviço de análise)
Tudo abaixo está configurável em `analise_config`/`fluxo_config`, sem suposição fixa no código:
- Campo de horas da carga: hoje `restante` (RemainingWork); alternativas `estimada_menos_concluida`
  e `estimada`. Fallback para task sem estimativa: 4h (por tag em `horas_fallback_por_tag`).
- Nomes das colunas de espera do board (`Code Review`, `Homologação` são palpites) e se os
  times usam colunas de board ou só estados. **A sync não lê `System.BoardColumn`**; o
  histórico vem dos eventos e do backfill.
- Como marcam bloqueio: tag (`bloqueado`, `blocked`, `impedimento`) ou campo
  (`Microsoft.VSTS.CMMI.Blocked`, só no processo CMMI).
- Se usam links de dependência (`System.LinkTypes.Dependency`).

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
| 2026-10-07 | Usuário removeu `AZDO_PROJECTS`; 3 projetos novos importados (um deles disparado na hora via `devops-sync`). Navegação refeita para muitos projetos: página Projetos (busca trigram + paginação no banco, `v_projeto_resumo`), recentes na sidebar. Cada projeto com 5 telas: **Kanban** (arrastar muda o estado no DevOps via nova Edge Function `devops-acoes`, auditoria na nova tabela `acao`), **Cronograma** (Gantt), **Squad**, **Métricas**, **Análises** (mapa de utilização + alertas). **Motor de capacidade** puro em `_shared/capacidade/motor.ts` com 9 testes. Migration `20261007000500` aplicada, `devops-acoes` publicada. Validado no Chrome headless (claro/escuro) e com um movimento real no DevOps (#10 New → Active → New). |
| 2026-10-08 | Membros: visão **Squads** (cards por squad dentro de cada projeto, carga da sprint atual pelo motor, mini-medidor por pessoa, skills do squad, carregamento sob demanda) no lugar da tabela "Por projeto"; `resumirSquad` em `_shared/capacidade/squads.ts` (+ testes). Migration `20261008000000` (Epic como requisito no Basic) aplicada. `pnpm devops:popular` criou 82 itens nos 3 projetos sem dados (sprints datadas, capacidade, requisitos, tasks) e o reconcile trouxe tudo; webhooks criados para os 3 projetos. PAT sem Graph API → squads novos só pela UI do DevOps. Usuário `qa-headless` criado para testes (senha de demo local estava desatualizada). Validado: 39 testes, typecheck, build e Chrome headless claro/escuro sem erros. |
| 2026-10-08 | **Skills automáticas** a partir das tasks (migrations `20261008000100`/`0200`: `recalcular_skills` + triggers em `work_item`, sugestão até o gestor confirmar, descarte que não volta, grafia única). Front: chips sugeridos, revisão no perfil, aviso de pendentes. Validado: teste SQL com rollback (sugere / descartada não volta / some sem evidência) e ponta a ponta real — tag `kotlin` em 2 tasks do Aaron no DevOps apareceu como sugestão no perfil em 8,6 s sem refresh; confirmar/descartar conferidos no banco; tudo desfeito. 42 testes, typecheck limpos. Time do projeto Teste ganhou 6 pessoas no DevOps (13 membros no total). |
| 2026-10-08 | **Análises** na sidebar: sugestões de responsável para tasks sem dono (motor `recomendarAlocacao` em `_shared/capacidade/recomendacao.ts`, 9 testes: encaixe de skills/tags + folga na sprint, penalidades por carga, distribuição sequencial), botão **Atribuir** → nova ação `atribuir` em `devops-acoes` (publicada) com auditoria e motivo em `acao`. Migration `20261008000300` (`feature_tags` na `v_backlog`, `v_sem_dono_resumo`). `QuandoVisivel` virou componente compartilhado. Validado: 51 testes, typecheck, build, Chrome headless claro/escuro e atribuição real da #38 (DevOps + auditoria conferidos, depois desfeita). |
| 2026-10-08 | **Carga global** nas sugestões (`_shared/capacidade/global.ts` + `lib/carga-global.ts`): capacidade única por pessoa limitada à jornada × tasks em todos os projetos — corrige o Kauê sendo sugerido para tudo (cada projeto o via com 6h/dia exclusivas). **Org reorganizada** com `pnpm devops:organizar` (120 mudanças: Capacity realista, tasks pelo foco de cada pessoa, 10 funções e skills confirmadas no app); descoberto que `add` em `System.Tags` acrescenta (usar `replace`). Resultado validado no headless: Teste #57→Abigail, #54→Arão, #59→Valeria; IportJLNK → Kauê com ocupação real (46h de 80h) e aviso de time com 1 pessoa. 58 testes, typecheck e build limpos. |
| 2026-10-08 | **Ciclo de vida**: sync trata projeto excluído (arquiva), renomeado (paths de sprints e tasks; bug de desvínculo da sprint achado no teste e corrigido em `20261008000600`), time excluído e membro removido (views e `atribuir` ignoram inativos); descrição + `Tags:` do projeto viram `tags_requeridas` e aparecem no cabeçalho; `projeto` no Realtime. Functions `devops-sync`/`webhook`/`acoes` republicadas. Testes SQL com rollback dos 4 cenários (Kauê cai de 126h para 22h abertas e de 10 para 7 skills inferidas ao arquivar o IportJLNK). Scripts por ID. `pnpm devops:projetos` pronto, **bloqueado por 401** (PAT sem Project and Team). 60 testes, typecheck e build limpos. |
| 2026-10-08 | PAT novo com acesso total (local + segredos das functions). `pnpm devops:projetos --excluir` aplicado: 3 projetos renomeados para nomes fictícios com descrição + `Tags:`, IportJLNK excluído no DevOps. Reconcile refletiu tudo (arquivamento, renomeação de caminhos sem perder sprint, tags). Achado: `secrets set --env-file` recolocou `AZDO_PROJECTS=IportJLKN12` (filtro por nome → 0 projetos após renomear); removido do segredo e comentado nos arquivos locais. Validado no banco e no headless. |
| 2026-10-08 | **Regras de capacidade do gestor**: migration `20261008000700` (4 tabelas + trigger `atualizado_por` + Realtime), `_shared/capacidade/regras.ts` (cascata + padrão de mercado), motores por projeto e global recebem regras, alocações e limites (`origemCapacidade` substitui `capacidadePadrao`). Front: painel `/capacidade` (regras gerais + ocupação geral por pessoa editável) e aba `/projetos/$id/capacidade` (limites do projeto + horas/dia por pessoa, projeto × geral). Telas antigas sem 85% fixo. 70 testes, typecheck e build limpos; headless (claro/escuro) editando e desfazendo jornada e alocação, Análises conferida. |
| 2026-10-08 | **Front reorganizado para o gestor**: Início (pendências priorizadas + mapa pessoa × semana + saúde dos projetos), Equipe com abas (Ocupação/Skills/Squads), ficha da pessoa com ocupação e jornada, projeto com Resumo (padrão) e Equipe (Squad + Capacidade), Regras de capacidade só com configuração, Kanban `?resp=`, Sugestões `?projeto=`, redirects das rotas antigas. `atencao.ts` (4 testes); motor global distribui a carga nos dias disponíveis da pessoa (2 testes). 76 testes, typecheck e build limpos; tour headless claro/escuro em todas as telas sem erros de console. |
| 2026-10-08 | **Equipe sugerida** para projeto sem pessoas: motor `equipe-sugerida.ts` (9 testes), painel no Resumo/Equipe do projeto, "Sugerir reforço", pendência no Início (`atencao.ts` ganhou `sem-equipe`), selo em Projetos. Projeto real "Farol Cargas" criado no DevOps por `pnpm devops:projeto-novo`, sincronizado, com webhooks; headless claro/escuro sem erros. 86 testes, typecheck e build limpos. |
