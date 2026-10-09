# Radar de Capacidade

**Demo:** https://radar-capacidade.vercel.app

O Radar de Capacidade responde à pergunta que o Azure DevOps não responde bem: **qual é a
disponibilidade real da equipe agora, e quando ela já está no limite?** Ele lê projetos, sprints,
features, tasks, times e capacidade do Azure DevOps, calcula a ocupação de cada pessoa somando
todos os projetos e propõe ações antes que o problema aconteça: quem deve pegar uma task sem
dono, de quem tirar trabalho, quem montar num projeto novo, onde o fluxo está travado. O gestor
aprova com um clique e a mudança é aplicada no próprio Azure DevOps, com auditoria.

Projeto desenvolvido para o hackathon da iPORT Solutions.

---

## Sumário

1. [O problema e a proposta](#1-o-problema-e-a-proposta)
2. [O que o sistema faz, tela por tela](#2-o-que-o-sistema-faz-tela-por-tela)
3. [Arquitetura](#3-arquitetura)
4. [Como os números são calculados](#4-como-os-números-são-calculados)
5. [O agente de IA](#5-o-agente-de-ia)
6. [Segurança e LGPD](#6-segurança-e-lgpd)
7. [Estrutura do repositório](#7-estrutura-do-repositório)
8. [Passo a passo: rodar e publicar do zero](#8-passo-a-passo-rodar-e-publicar-do-zero)
9. [Scripts](#9-scripts)
10. [Qualidade e testes](#10-qualidade-e-testes)
11. [Problemas comuns](#11-problemas-comuns)

---

## 1. O problema e a proposta

No Azure DevOps os times registram **o que** precisa ser feito (work items), **onde** (projetos
e iterações) e **quando** (sprints). O que falta é a visão do gestor: quem está sobrecarregado
somando todos os projetos, quem está de férias com trabalho atribuído, se a sprint vai fechar e
quem é a melhor pessoa para uma task nova.

A hierarquia usada é **Sprint → Feature → Task**. A carga é sempre calculada no nível da Task;
features e sprints servem para agrupar e dar contexto.

Princípios do produto:

- **O sistema sugere, o gestor decide.** Nada é escrito no Azure DevOps sem um clique de aprovação.
- **Tudo que é aplicado fica registrado** (quem, quando, o que mudou).
- **Os números vêm de um motor determinístico**, nunca de um modelo de linguagem. A IA só
  prioriza e explica.
- **Não se avalia desempenho de pessoas.** O foco é carga, disponibilidade e encaixe de skills.
- O sistema só altera **Tasks**; Features e Sprints nunca são modificadas.

## 2. O que o sistema faz, tela por tela

| Tela | Para que serve |
|---|---|
| **Início** | Visão do dia: pessoas acima da capacidade ou no limite, tasks sem dono, horas livres, prioridades com ação de um clique, mapa pessoa × semana e a saúde de cada projeto. |
| **Projetos** | Lista com busca e paginação. Projeto sem pessoas recebe o selo "Sem equipe". |
| **Projeto › Resumo** | Uso do time na sprint, alertas (inclusive "parece bem aqui, mas está sobrecarregado no geral"), quem pode absorver trabalho, mapa pessoa × sprint e projetos parecidos com este. |
| **Projeto › Kanban** | Quadro e lista. Arrastar um card muda o estado no Azure DevOps. |
| **Projeto › Cronograma** | Linha do tempo das sprints e features. |
| **Projeto › Equipe** | Cada squad com a ocupação neste projeto e somando todos; horas por dia dedicadas ao projeto; limites de alerta do projeto; equipe sugerida para reforço. |
| **Projeto › Métricas** | Fluxo e previsibilidade (throughput, cycle time, lead time, WIP, previsão da sprint) e andamento do trabalho. |
| **Equipe** | Ocupação semana a semana (até 2 anos), skills e tags de cada pessoa (as sugeridas vêm sozinhas das tasks) e squads. A ficha da pessoa reúne carga, projetos, jornada e skills. |
| **Sugestões** | Duas abas: **Alocação de equipe** (sobrecarga, ausência, tasks sem dono, equipe de projeto novo) e **Melhoria de processo** (gargalos, WIP alto, esforço × impacto, projetos parecidos). Cada sugestão tem *Aprovar*, *Ignorar* e *Entender análise*. |
| **Agenda** | Calendário com sprints, feriados, ausências e entregas. Registrar ausência e cadastrar feriado regional ou recesso reduz a capacidade na hora. |
| **Regras de capacidade** | Jornada, foco e limites de alerta: gerais, por pessoa e por projeto. Sem nada definido vale o padrão de mercado. |
| **Sincronização** | Estado da ligação com o Azure DevOps, botão de sincronizar agora, últimos eventos e auditoria de tudo que o app escreveu no DevOps. |

O sino no topo concentra as notificações do agente; o botão *Ajuda* abre um glossário em
linguagem simples.

## 3. Arquitetura

```
Azure DevOps ── Service Hooks ──► devops-webhook ─┐
             ◄── REST (PAT) ───── devops-sync ────┼──► Postgres (Supabase) ── Realtime ──► Front (React)
                                  cron a cada 5 min│        │
                                                   │        └─ gatilho por evento e cron 15 min ─► agente ──► Gemini / Claude
             ◄── devops-acoes (mover, atribuir, aprovar sugestão; auditado) ◄──────────────────── gestor
```

| Peça | Tecnologia | Função |
|---|---|---|
| Banco | Supabase Postgres, RLS, pg_cron, pg_net, Vault | Dados sincronizados, regras, sugestões, auditoria; tarefas agendadas e segredos. |
| `devops-sync` | Edge Function (Deno) | Carga completa e reconciliação incremental (WIQL + lotes de 200), idempotente por revisão. |
| `devops-webhook` | Edge Function | Recebe os Service Hooks, grava o evento bruto e processa em segundo plano. |
| `devops-acoes` | Edge Function | Escritas no DevOps feitas pelo gestor (estado, responsável, aprovar sugestão). |
| `agente` | Edge Function | Gera sugestões e a explicação técnica de cada uma. |
| Motores | TypeScript puro em `supabase/functions/_shared` | Capacidade, carga global, regras, recomendação, equipe sugerida, portfólio, fluxo. O front e o agente usam **o mesmo código**, então os números são iguais nos dois. |
| Front | React 19, Vite, TypeScript strict, TanStack Router/Query, Tailwind v4 | Interface, atualizada ao vivo pelo Realtime. Publicado na Vercel. |
| Serviço de análise (opcional) | Python 3.12, FastAPI | Métricas de fluxo avançadas para evolução futura (`services/analytics`). |

**Como os dados chegam:** quando algo muda no Azure DevOps, o Service Hook chama
`devops-webhook`, que busca o item atualizado e grava no banco. O Realtime avisa o front, que
atualiza a tela sem recarregar (em torno de 8 segundos do clique no DevOps até a tela). A cada 5
minutos a reconciliação confere tudo o que pode ter escapado dos webhooks.

## 4. Como os números são calculados

**Capacidade de uma pessoa** = horas produtivas por dia × dias úteis, sem feriados, folgas do
DevOps e ausências da Agenda.

- Horas produtivas = jornada × foco. Padrão de mercado: 8 h × 75% = 6 h por dia.
- Dentro de um projeto vale, nesta ordem: as horas que o gestor dedicou ao projeto, a Capacity
  do Azure DevOps, ou as horas produtivas da pessoa.
- A soma de todos os projetos nunca passa das horas produtivas da pessoa.

**Carga** = horas restantes das tasks abertas (ou estimado − concluído), distribuídas pelos dias
em que a pessoa está disponível na sprint.

**Ocupação** = carga ÷ capacidade. Padrão: *no limite* acima de 80%, *sobrecarregado* acima de
100%. Gestor, pessoa e projeto podem ter limites próprios.

**Recomendação de responsável** = 65% encaixe de skills + 35% folga depois de receber a task,
penalizando quem passaria do limite.

**Equipe sugerida para projeto novo**: os termos do projeto vêm das tags, das skills citadas na
descrição e de sinônimos ("React" → front-end). O sistema compara com os squads de projetos
parecidos e monta o menor grupo de pessoas disponíveis que cobre o que o projeto pede.

**Projetos parecidos** = 60% semelhança do texto das descrições (TF-IDF com cosseno) + 40% tags e
skills em comum.

**Esforço × impacto**: a fatia da capacidade da equipe que cada projeto consome nas próximas 4
semanas, contra o impacto do projeto (definido pelo gestor, pela linha `Impacto:` na descrição
do DevOps ou estimado pela IA).

**Métricas de fluxo**: throughput (tasks concluídas por semana), cycle time (ativação →
conclusão, mediana e P85), lead time (criação → conclusão), WIP e previsão da sprint (horas que
faltam × capacidade que resta).

## 5. O agente de IA

O agente roda na Edge Function `agente`, disparado a cada evento do DevOps e a cada 15 minutos.

1. **Candidatas (determinístico):** o motor monta as ações possíveis com todos os números prontos:
   atribuir, rebalancear, cobrir ausência, montar equipe, gargalo, WIP alto, esforço × impacto e
   projetos parecidos.
2. **Linguagem (IA):** o modelo recebe as candidatas com pseudônimos ("Pessoa A") e devolve
   prioridade, título e explicação. Funciona com **Gemini** (preferido) ou **Claude**; sem chave,
   usa texto automático.
3. **Validador:** o texto da IA é rejeitado se citar um número que não está nos fatos, uma pessoa
   fora da candidata ou falar de desempenho. Nesses casos vale o texto automático.
4. **Gravação:** a sugestão entra como pendente, com notificação no sino. A mesma situação não
   gera duas sugestões; se o motivo some (task atribuída, sobrecarga resolvida), ela expira.

**Entender análise:** abre a visão técnica de uma sugestão, só com as ferramentas que fazem
sentido para o caso: diagnóstico de tempo com mapa de calor (estado × dias parado), Pareto 80/20
e matriz esforço × impacto. A leitura de cada ferramenta é escrita pela IA e conferida contra os
dados.

**Aprovar** revalida a situação (a task ainda está com o mesmo responsável?) antes de aplicar no
Azure DevOps, e registra tudo na auditoria.

## 6. Segurança e LGPD

| Pilar | Como está implementado |
|---|---|
| Criptografia | Supabase e Vercel só aceitam HTTPS (TLS 1.2/1.3); banco criptografado em repouso (AES-256). Cabeçalhos HSTS, CSP, `nosniff`, `no-store` e `X-Frame-Options` no front e nas funções. |
| Segredos | PAT e chaves ficam em Supabase Secrets e no Vault. Os segredos de entrada (cron, webhook, agente) são guardados só como **hash SHA-256** e comparados em tempo constante. `.env` fora do Git e gitleaks no CI. |
| IA sem dado pessoal | Antes de qualquer chamada ao modelo, um middleware troca nomes e e-mails conhecidos por `[USER_01]`, e e-mails, CPFs e telefones soltos por marcadores. As pessoas aparecem como pseudônimos e a resposta é restaurada só dentro do sistema. |
| Logs | Todo log passa por um sanitizador: e-mails mascarados (`k***@g***.com`) e campos de pessoa ocultos. |
| Ciclo de vida (TTL) | Expurgo diário: sugestões pendentes expiram em 30 dias e decididas somem em 90; caches da IA em 7 dias; notificações em 30/90 dias; histórico e auditoria em 1 ano; eventos de webhook em 30 dias. |
| Direito ao esquecimento | `esquecer_pessoa` apaga skills, ausências, regras, alocações, notificações e sugestões, e anonimiza o nome de vez (a sincronização não traz de volta). `esquecer_usuario` apaga a conta. Botão na ficha da pessoa, só para admin. |
| Acesso (RBAC) | Papéis `admin`, `gestor` e `membro` sobre o JWT assinado do Supabase Auth. Sugestões, métricas executivas, regras, sincronização e auditoria só para gestor/admin, garantido por RLS no banco e por middleware nas funções. Contas novas entram como membro. |
| Auditoria | Tabela `auditoria` append-only (UPDATE e DELETE bloqueados) com hash encadeado (`verificar_auditoria()` detecta adulteração). Registra ator anonimizado (HMAC), papel, ação, recurso técnico e IP mascarado. |

## 7. Estrutura do repositório

```
apps/web/                     front (React + Vite)
  src/routes/                 telas
  src/components/             componentes de interface
  src/lib/                    consultas, hooks e integração com o Supabase
supabase/
  migrations/                 esquema do banco, em ordem
  functions/
    _shared/                  código puro e testado (motores, mapeadores, agente, privacidade)
    _lib/                     código do runtime Deno (contexto, sync, LLM, segurança)
    devops-sync/ devops-webhook/ devops-acoes/ agente/
services/analytics/           serviço Python opcional de métricas de fluxo
scripts/                      utilitários (popular a org de demo, webhooks, latência)
.github/workflows/            CI
```

## 8. Passo a passo: rodar e publicar do zero

### 8.1 Pré-requisitos

- Node 22 e pnpm 9 (`corepack enable`)
- Supabase CLI (`npx supabase`)
- Deno 2 (para checar as funções)
- Uma organização no Azure DevOps e um projeto no Supabase

### 8.2 Clonar e instalar

```bash
git clone https://github.com/KaueMarini/radar-capacidade.git
cd radar-capacidade
pnpm install
```

### 8.3 Token do Azure DevOps (PAT)

Em dev.azure.com → *User settings* → *Personal access tokens*, crie um token com:

| Escopo | Para quê |
|---|---|
| Work Items: Read, write & manage | sincronizar, mover no Kanban, atribuir |
| Project and Team: Read, write & manage | ler times e capacidade |
| Service Hooks: Read, write & manage | criar os webhooks |
| Graph: Read & manage | opcional, scripts que montam times |

### 8.4 Variáveis de ambiente

Crie os arquivos abaixo (nenhum deles vai para o Git):

`.env.local` na raiz, usado pelos scripts:

```
AZDO_ORG_URL=https://dev.azure.com/<org>
AZDO_PAT=<pat>
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role>
SUPABASE_ANON_KEY=<anon>
SYNC_SECRET=<valor aleatório>
ANALYTICS_SHARED_SECRET=<valor aleatório>
WEBHOOK_BASIC_PASS=<valor aleatório>
```

`supabase/.env.functions`, enviado para as funções (segredos de entrada só como hash):

```
AZDO_ORG_URL=https://dev.azure.com/<org>
AZDO_PAT=<pat>
WEBHOOK_BASIC_USER=<usuário do webhook>
WEBHOOK_BASIC_PASS_SHA256=<sha256 do WEBHOOK_BASIC_PASS>
SYNC_SECRET_SHA256=<sha256 do SYNC_SECRET>
ANALYTICS_SHARED_SECRET_SHA256=<sha256 do ANALYTICS_SHARED_SECRET>
GEMINI_API_KEY=<chave do Google AI Studio>
LLM_MODEL=gemini-3.5-flash
```

Para gerar um hash: `node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" <valor>`.

`apps/web/.env.local`, usado pelo front (só a chave pública):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon>
VITE_AZDO_ORG_URL=https://dev.azure.com/<org>
```

### 8.5 Banco de dados

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
pnpm db:types
```

### 8.6 Segredos no Vault

No SQL editor do Supabase, uma vez (não versionado, contém segredos):

```sql
select vault.create_secret('https://<ref>.supabase.co', 'radar_project_url');
select vault.create_secret('<SYNC_SECRET>', 'radar_sync_secret');
select vault.create_secret('https://<ref>.supabase.co/functions/v1/agente', 'radar_analytics_url');
select vault.create_secret('<ANALYTICS_SHARED_SECRET>', 'radar_analytics_secret');
```

Eles ligam o cron de reconciliação (5 min) e o agente (por evento e a cada 15 min). O sal da
auditoria é criado sozinho pela migration.

### 8.7 Edge Functions

```bash
npx supabase secrets set --env-file supabase/.env.functions
pnpm functions:deploy
```

As funções são publicadas com `--no-verify-jwt` porque cada uma faz a própria autorização (JWT do
usuário com papel, ou segredo de sistema).

### 8.8 Primeira sincronização e webhooks

```bash
curl -X POST "$SUPABASE_URL/functions/v1/devops-sync" -H "x-sync-secret: $SYNC_SECRET" -d '{"mode":"full"}'
pnpm devops:hooks create
```

A carga completa pode precisar de mais de uma chamada em organizações grandes (ela continua de
onde parou). Depois disso, o cron mantém tudo em dia.

### 8.9 Usuário e papel

Crie um usuário no Supabase Auth (ou `pnpm demo:user`). Contas novas entram como `membro`; para
dar acesso de gestor:

```sql
update public.usuario_papel set papel = 'admin'
 where user_id = (select id from auth.users where email = '<e-mail>');
```

### 8.10 Rodar o front

```bash
pnpm dev
```

Abra http://localhost:5173.

### 8.11 Publicar na Vercel

O `vercel.json` da raiz já define instalação, build, pasta de saída, rotas e cabeçalhos de
segurança.

```bash
npx vercel link --project radar-capacidade
npx vercel deploy --prod \
  --build-env VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-env VITE_SUPABASE_ANON_KEY=<anon> \
  --build-env VITE_AZDO_ORG_URL=https://dev.azure.com/<org>
```

## 9. Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` / `pnpm build` | front em desenvolvimento / build de produção |
| `pnpm db:types` | gera os tipos do banco para o front e as funções |
| `pnpm functions:deploy` | publica as Edge Functions |
| `pnpm functions:check` | checa os tipos das funções com Deno |
| `pnpm devops:hooks create` | cria os Service Hooks em todos os projetos |
| `pnpm devops:popular` / `devops:organizar` | popula e organiza a organização de demonstração |
| `pnpm devops:projetos [--excluir]` | nomes, descrições e tags dos projetos de demo |
| `pnpm devops:projeto-novo [--excluir]` | cria um projeto sem pessoas para demonstrar a equipe sugerida |
| `pnpm devops:datas` | preenche datas de criação e de mudança de estado em itens antigos |
| `pnpm devops:latency <id>` | mede o tempo entre salvar no DevOps e chegar ao banco |
| `pnpm demo:user` | cria o usuário de demonstração |

## 10. Qualidade e testes

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm functions:check
```

- Mais de 130 testes (Vitest) cobrem os motores, o agente, o validador, a privacidade, os
  mapeadores e a lógica do front.
- O serviço Python tem a própria suíte (`cd services/analytics && uv run pytest`).
- O CI (`.github/workflows/ci.yml`) roda tudo a cada push e pull request, mais o gitleaks contra
  segredos no histórico.

## 11. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Projeto novo não aparece | O cron leva até 5 minutos; ou use *Sincronizar agora* em Ajustes › Sincronização. |
| Alteração no DevOps não chega na hora | Faltam os Service Hooks do projeto: `pnpm devops:hooks create`. |
| Sugestões sempre com "texto automático" | Sem `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` nas funções, ou cota do modelo esgotada (o agente tenta modelos reserva sozinho). |
| "Acesso restrito a gestores" | A conta é `membro`; ajuste em `usuario_papel` (seção 8.9). |
| 401 nas funções | Segredo diferente do hash configurado em `supabase/.env.functions`. |
| Métricas de fluxo zeradas | Ainda não há tasks concluídas com datas no DevOps; rode `pnpm devops:datas` para itens antigos. |
