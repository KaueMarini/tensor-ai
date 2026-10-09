# Radar de Capacidade

> Hackathon iPORT Solutions. *"Os outros mostram o problema. O nosso avisa antes, diz quem é a
> melhor pessoa para resolver e resolve com um clique."*

O Radar lê o **Azure DevOps** (projetos, sprints, features, tasks, times e capacidade) e responde
à pergunta do gestor: **qual a disponibilidade real da minha equipe agora, e quando ela já
está no limite?** Um agente de IA acompanha as mudanças e propõe ações (reatribuir task,
aliviar quem está sobrecarregado, montar equipe para projeto novo). O gestor aprova e o
Radar aplica direto no DevOps, com auditoria.

Visão de produto e regras: [CLAUDE.md](CLAUDE.md). Estado atual e histórico:
[docs/STATUS.md](docs/STATUS.md).

## O que tem

| Área | O que faz |
|---|---|
| **Início** | Prioridades do dia, sugestões do agente, mapa pessoa × semana (todos os projetos somados), saúde de cada projeto |
| **Sugestões** | Caixa do agente (Aprovar / Ignorar) e sugestão de responsável para tasks sem dono |
| **Equipe** | Ocupação (semanas a 2 anos), skills e tags (inferidas das tasks), squads; ficha da pessoa |
| **Projetos** | Resumo, Kanban (arrastar muda o estado no DevOps), Cronograma, Equipe (projeto × geral), Métricas; equipe sugerida para projeto novo sem pessoas |
| **Agenda** | Sprints, feriados, ausências (descontam da capacidade) |
| **Regras de capacidade** | Jornada, foco, limites de alerta (geral, por pessoa, por projeto); sem nada definido vale o padrão de mercado |

## Arquitetura

```
Azure DevOps ──Service Hooks──► devops-webhook ─┐
             ◄──REST (PAT)──── devops-sync ─────┼──► Postgres (Supabase) ──Realtime──► apps/web
                               (cron 5 min)     │        │
                                                │        └─ trigger/cron (pg_net) ─► agente ──► Claude
             ◄── devops-acoes (aprovar, mover, atribuir; auditado em `acao`) ◄── gestor
```

- **Supabase**: Postgres + RLS, Auth, Realtime, Edge Functions (Deno), pg_cron, pg_net, Vault.
- **Edge Functions** (`supabase/functions`): `devops-sync` (completa/reconciliação),
  `devops-webhook` (Service Hooks), `devops-acoes` (escrita no DevOps, só com JWT do gestor),
  `agente` (IA).
- **Motores determinísticos** em `supabase/functions/_shared/capacidade` (TypeScript puro,
  usados pelo front **e** pelo agente, então os números são sempre iguais): capacidade, carga
  global, regras, recomendação de responsável, equipe sugerida, prioridades.
- **Agente de IA** (`supabase/functions/agente`): o motor calcula as ações candidatas com todos
  os números; o Claude só prioriza e explica, recebendo **pseudônimos** (LGPD). Um validador
  rejeita qualquer número ou pessoa que não esteja nos fatos e cai num texto por template.
  Nada é aplicado sem aprovação.
- **Front** (`apps/web`): React 19, Vite, TypeScript strict, TanStack Router/Query, Tailwind v4.
- **Serviço Python** (`services/analytics`): métricas de fluxo (tempo de ciclo, Pareto) para
  evoluir o agente. Ainda não publicado ([docs/deploy-analytics.md](docs/deploy-analytics.md)).

## Rodar localmente

Requisitos: Node 22, pnpm 9, [Supabase CLI](https://supabase.com/docs/guides/cli) (`npx supabase`),
Deno 2 (só para checar as functions).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # URL e anon key do Supabase
pnpm dev                                        # http://localhost:5173
```

Para scripts e deploy, crie também (nunca commitar; peça os valores ao time):

| Arquivo | Variáveis |
|---|---|
| `.env.local` | `AZDO_ORG_URL`, `AZDO_PAT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `DEMO_EMAIL`/`DEMO_PASSWORD` |
| `supabase/.env.functions` | `AZDO_ORG_URL`, `AZDO_PAT`, `WEBHOOK_BASIC_USER`, `WEBHOOK_BASIC_PASS`, `SYNC_SECRET`, `ANALYTICS_SHARED_SECRET`, `ANTHROPIC_API_KEY`, `LLM_MODEL` |

### PAT do Azure DevOps

| Escopo | Para quê |
|---|---|
| Work Items: Read, write & manage | sync, Kanban, atribuir/aprovar sugestões |
| Project and Team: Read, write & manage | ler times/capacidade; scripts de projeto (renomear, criar) |
| Service Hooks: Read, write & manage | criar os webhooks (`pnpm devops:hooks create`) |
| Graph: Read & manage | opcional: scripts que montam times |

### Chave do Claude (agente de IA)

console.anthropic.com → Settings → API Keys → *Create Key*. Coloque em
`supabase/.env.functions` como `ANTHROPIC_API_KEY=...` e rode
`npx supabase secrets set --env-file supabase/.env.functions`. Sem a chave, o agente funciona
com textos por template.

## Banco e deploy

```bash
npx supabase login && npx supabase link --project-ref wswcksxvsqhmxxawgwmq
npx supabase db push                     # migrations novas
pnpm db:types                            # tipos gerados para o front e as functions
npx supabase secrets set --env-file supabase/.env.functions
pnpm functions:deploy                    # sempre com --no-verify-jwt (a autorização é feita em cada função)
pnpm devops:hooks create                 # Service Hooks em todos os projetos
```

Uma vez por ambiente, no SQL editor (não versionado, contém segredos): Vault com
`radar_project_url`/`radar_sync_secret` (cron de reconciliação) e `radar_analytics_url` (URL da function
`agente`) / `radar_analytics_secret` (= `ANALYTICS_SHARED_SECRET`), que ligam o gatilho de
eventos e o cron de 15 min ao agente.

## Qualidade

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm functions:check
```

O CI (`.github/workflows/ci.yml`) roda tudo isso em cada push/PR, além do **gitleaks** contra
segredos no histórico.

## Scripts úteis

| Comando | O que faz |
|---|---|
| `pnpm devops:projetos [--dry] [--excluir]` | nomes fictícios + descrição/Tags dos projetos de demo |
| `pnpm devops:projeto-novo [--excluir]` | cria "Farol Cargas" sem pessoas (demo da equipe sugerida) |
| `pnpm devops:popular` / `devops:organizar` | popula e organiza a org de demo |
| `pnpm devops:latency <id>` | mede a latência DevOps → banco |
| `pnpm demo:user` | cria o usuário de demo |

## Contribuindo

Conventional Commits com descrição em pt-BR (`feat(web): ...`, `fix(sync): ...`), commits
pequenos, nada de segredos no repositório. Antes de começar, leia
[docs/STATUS.md](docs/STATUS.md); ao terminar, atualize-o.
