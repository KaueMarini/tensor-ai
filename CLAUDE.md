# Radar de Capacidade — Hackathon iPORT Solutions

> Contexto do projeto para o Claude Code. Leia este arquivo antes de qualquer tarefa.

## 1. O desafio (proposto pela iPORT)

A iPORT gerencia o trabalho dos times no **Azure DevOps**. O DevOps mostra bem
**o que** precisa ser feito (work items), **onde** (projetos/iterações) e **quando**
(sprints/prazos), mas não responde bem à pergunta do gestor:

> **Qual a disponibilidade real da minha equipe agora, e quando ela já está no limite?**

Pergunta de negócio do desafio: *como ajudar um gestor a tomar uma decisão de alocação
antes de virar um problema?*

Requisitos citados pela iPORT:
1. **Sincronizar**: projetos, work items, iterações e capacidade
2. **Entender pessoas**: capacidade semanal, ausências e calendário
3. **Visualizar**: timeline por pessoa, atividade e período
4. **Realocar**: drag-and-drop para mudar pessoa/período
5. **Identificar**: heatmap de utilização e sobrecarga
6. **Alertar**: conflitos, ausências, feriados e sobreposição

Regra deles: a aplicação **não substitui** o Azure DevOps; usa os dados existentes.
Lema: "Pensem grande. Simplifiquem. Criem algo que alguém realmente usaria."

## 1.1 Estrutura atual no Azure DevOps da iPORT

Hierarquia usada hoje pelos times:

```
Sprint (iteração)
 └── Feature (requisito)
      └── Task (com tags e descritivo)
```

- **Sprint**: é a iteração do DevOps (`System.IterationPath`). Define o período
  (início/fim) em que o trabalho acontece. É a unidade de tempo que o motor de
  capacidade usa para distribuir horas por semana.
- **Feature**: representa um requisito. Agrupa as tasks relacionadas e dá o contexto
  de negócio (o "para quê" daquele trabalho).
- **Task**: unidade real de trabalho e de alocação. Tem responsável, horas, **tags**
  e **descritivo**. É aqui que acontece a reatribuição e a medição de carga.

### Implicações para o sistema
- **Carga e capacidade são calculadas no nível de Task.** Feature e Sprint servem
  para agrupar, filtrar e dar contexto, não somam horas próprias.
- **Datas da task vêm da sprint** quando a task não tiver data própria: as horas
  são distribuídas pelos dias úteis da sprint (descontando feriados e ausências).
- **Tags de skills das pessoas são inferidas a partir das tasks** que cada pessoa
  já executou: tags da task + descritivo da task + título/descrição da Feature pai.
- **Sugestões de realocação operam sobre Tasks** (reatribuir responsável ou mover
  para outra sprint). Features e Sprints não são alteradas pelo executor.
- **Feature nova sem tasks atribuídas** é um bom gatilho para o agente sugerir
  quem tem skill e folga para pegar o requisito.
- A sincronização precisa trazer o vínculo pai/filho (relação
  `System.LinkTypes.Hierarchy-Reverse`) para saber a qual Feature cada Task pertence.
- **Fallback de horas**: task sem estimativa recebe horas padrão (configuráveis por
  tipo/tag), marcadas na interface como "estimativa do sistema".

### A confirmar com a iPORT
- Quais campos de horas as tasks usam de fato (`Original Estimate`,
  `Remaining Work`, `Completed Work`) e se são preenchidos de forma consistente.
- Se tasks têm datas próprias ou dependem só da sprint.
- Se existe nível acima de Feature (Epic) em algum projeto.
- Padrão das tags (lista fixa ou livre).

## 2. Nossa proposta (o que vai além)

Em uma frase: **um sistema que monitora o Azure DevOps, entende a carga e as habilidades
de cada pessoa, sugere proativamente a melhor divisão do trabalho e, com a aprovação do
gestor, executa a mudança direto no DevOps.**

Pitch curto: *"Os outros mostram o problema. O nosso avisa antes, diz quem é a melhor
pessoa pra resolver e resolve com um clique."*

### O que o sistema faz
1. **Mostra a equipe**: heatmap pessoa × semana (livre / no limite / sobrecarregado),
   já descontando férias, feriados e ausências.
2. **Conhece cada pessoa**: tags de habilidade por pessoa (ex: `copilot-studio`,
   `front-end`, `integracao-fiscal`), **populadas pela IA** a partir do histórico de
   tasks de cada um (tags + descritivo + Feature pai). O gestor só confirma ou ajusta.
3. **Avisa antes do problema**: quando algo muda no DevOps (task nova, feature nova,
   reatribuição, ausência), o sistema avalia e gera uma sugestão.
   Ex: "A Elisa vai a 138% na semana 45, mover 'Testes de regressão' (14h) para o Fábio?"
   Ex: "Surgiu uma feature de Copilot Studio. Kauê tem essa skill e está com 45% de carga."
4. **Executa com um clique**: o gestor aprova e a ação é aplicada no Azure DevOps.
5. **Chat com o agente**: o gestor pede em linguagem natural ("quem pode pegar 16h de
   front-end semana que vem?", "cria uma task de 8h pro Bruno na sprint 45").

### Diferenciais
- **Proativo** (event-driven), não só um painel que precisa ser aberto e interpretado.
- **Tags de skills automáticas** a partir do histórico, sem depender de cadastro manual.
- **Fecha o ciclo**: sugere e executa dentro do DevOps.
- **Human-in-the-loop**: nada muda sem aprovação; tudo fica registrado (auditoria).

## 3. Arquitetura (4 peças)

```
Azure DevOps ──(Service Hooks / webhooks + varredura agendada)──► [1] Ingestão
                                                                      │
                                                                      ▼
                                                    [2] Motor de capacidade (determinístico)
                                                                      │
                                                                      ▼
                                                    [3] Agente de IA (avalia + sugere + explica)
                                                                      │
                                                                      ▼
                                              Caixa de sugestões do gestor (Aprovar / Ignorar)
                                                                      │
                                                                      ▼
                                              [4] Executor de ações ──► Azure DevOps (REST)

Chat do gestor ──► Agente + MCP do Azure DevOps (leitura e escrita em linguagem natural)
```

1. **Ingestão**: recebe eventos do DevOps via Service Hooks (work item created/updated)
   e faz uma varredura agendada (ex: diária) para o que não gera evento
   (ex: sprint começando com alguém acima de 100%). Sincroniza a hierarquia
   Sprint → Feature → Task com os vínculos pai/filho. Normaliza e grava no banco.
2. **Motor de capacidade**: cálculo **sem IA**, no nível de Task. Capacidade semanal
   por pessoa (horas base × dias úteis − feriados − ausências), horas alocadas por
   semana (distribuídas pelo período da task ou da sprint), utilização %, detecção de
   sobrecarga, sobreposição e conflitos com ausência.
3. **Agente de IA**: chamado só quando há evento relevante ou na varredura (não fica
   rodando o tempo todo). Cruza carga + tags de skills + contexto da Feature/projeto e
   gera sugestões com justificativa e impacto antes/depois. Também popula as tags de skills.
4. **Executor de ações**: após aprovação, aplica a ação via **API REST do DevOps de forma
   determinística** (reatribuir task, mover task de sprint, criar task). O MCP do Azure
   DevOps é usado no **chat**, não na execução de sugestões aprovadas.

## 4. Modelo de dados (inicial)

- `pessoa`: id, nome, papel, horas_semana_base, devops_user_id
- `ausencia`: pessoa_id, inicio, fim, tipo (férias, certificação, licença, outro)
- `feriado`: data, nome, abrangência
- `skill_tag`: pessoa_id, tag, origem (`ia` | `gestor`), confianca, confirmada (bool)
- `projeto`: id, nome, descricao_extra (contexto que o gestor adiciona), tags_requeridas
- `sprint`: id, nome, iteration_path, inicio, fim, projeto_id
- `feature`: id DevOps, projeto_id, sprint_id, titulo, descricao, tags
- `work_item` (task): id DevOps, feature_id, sprint_id, titulo, descritivo,
  responsavel_id, inicio, fim, horas_estimadas, horas_restantes, horas_concluidas,
  horas_origem (`devops` | `sistema`), tags
- `sugestao`: id, tipo, payload da ação, justificativa, impacto, status
  (`pendente` | `aplicada` | `ignorada`), criada_em, decidida_por, decidida_em
- `evento`: log bruto dos webhooks recebidos

## 5. Regras de produto (não violar)

- **A IA sugere, o gestor decide.** Nenhuma escrita no DevOps sem aprovação explícita.
- **Toda ação aplicada fica registrada** (quem aprovou, quando, o que mudou).
- **Não avaliamos desempenho de pessoas.** O foco é **carga + encaixe de skills**, nunca
  "fulano não rende". Dados do DevOps são proxy ruim de desempenho, e isso soa como
  vigilância (LGPD). Sugestões falam de sobrecarga e fit com o projeto.
- **Números vêm do motor, não do LLM.** O agente explica e prioriza, mas porcentagens e
  horas são sempre calculadas de forma determinística.
- Tags inferidas pela IA aparecem como "sugeridas" até o gestor confirmar.
- O executor só altera **Tasks**. Features e Sprints nunca são modificadas pelo sistema.

## 6. Escopo do hackathon (prioridade)

**P0 — tem que funcionar 100%**
- Sincronizar com o DevOps (projetos, sprints, features, tasks, membros)
- Cadastro de ausências e feriados
- Motor de capacidade + heatmap pessoa × semana
- Alertas de sobrecarga e conflito com ausência

**P1 — o diferencial**
- Webhooks do DevOps → sugestão gerada pelo agente → caixa de aprovação
- Executor: aprovar sugestão → reatribuir/mover task no DevOps
- Tags de skills geradas pela IA a partir do histórico de tasks

**P2 — se der tempo**
- Timeline com drag-and-drop
- Chat com o agente via MCP do Azure DevOps
- Matching de feature/projeto novo × pessoas por skill

Melhor um fluxo de agente redondo do que vários pela metade.

## 7. Roteiro da demo

1. Abrir o heatmap: equipe com uma pessoa em sobrecarga e alguém de férias com task.
2. **Ao vivo**: criar uma task no Azure DevOps.
3. Em segundos aparece a sugestão no sistema, com justificativa e impacto.
4. Clicar em **Aprovar** e mostrar a task reatribuída no DevOps.
5. Mostrar as tags de skills geradas pela IA e uma feature nova sendo casada com a pessoa certa.

## 8. Stack e decisões técnicas

> **Estado atual do trabalho (o que já foi feito, onde paramos, próximos passos):
> leia [docs/STATUS.md](docs/STATUS.md) antes de começar qualquer tarefa e
> atualize-o ao final de cada etapa.**

- **Backend**: Supabase (nuvem, free tier) — Postgres, Auth, Realtime, Edge Functions
  (Deno), pg_cron, pg_net e Vault. Projeto: `wswcksxvsqhmxxawgwmq`.
- **Migrations**: SQL versionado em `supabase/migrations` (Supabase CLI). Tipos gerados com
  `pnpm db:types` em `supabase/functions/_shared/db.types.ts`.
- **Front**: `apps/web` — React 19 + Vite + TypeScript strict + TanStack Router +
  TanStack Query + Tailwind v4 + shadcn/ui + supabase-js com os tipos gerados. pt-BR.
- **Código compartilhado puro** (tipos, mappers, futuro motor de capacidade), sem
  dependências de runtime: `supabase/functions/_shared`, importável pelo front via alias.
  Código que depende do runtime Deno fica em `supabase/functions/_lib`.
- **Azure DevOps**: `fetch` puro na REST API (api-version 7.1), com retry exponencial
  respeitando `Retry-After`. Nada de lib Node (tem que rodar no Deno).
- **Testes**: Vitest (front e `_shared`) e `deno test` nas functions.
- **Gerenciador**: pnpm na raiz (workspace `apps/*`).
- **Git**: Conventional Commits (descrição em pt-BR), branches curtas por funcionalidade,
  PRs pequenos, `main` protegida. Segredos nunca no repo (gitleaks no CI).
