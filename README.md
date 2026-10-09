# Tensor AI - Hackaton Iport 

# Equipe: JLNK

### O assistente de IA que acompanha o seu Azure DevOps 24 horas por dia e diz o que fazer antes do problema acontecer.

**Demo:** https://tensor-ai-app.vercel.app

O Azure DevOps mostra **o que** precisa ser feito, **onde** e **quando**. Ele não responde à
pergunta que tira o sono de qualquer gestor:

> **Quem da minha equipe está livre de verdade agora, quem já passou do limite, e o que eu faço
> com isso?**

O Tensor AI responde. Ele fica conectado ao Azure DevOps o tempo todo, junta os dados de
todos os projetos, sprints, tasks, times, férias e feriados, e transforma isso em **decisões
prontas**: quem deve assumir cada task, de quem tirar trabalho, quem montar num projeto novo, onde
o projeto está travado e quais projetos estão fazendo a mesma coisa. O gestor aprova com um clique
e a mudança já acontece no próprio Azure DevOps.

> *"Os outros mostram o problema. O Tensor AI avisa antes, diz quem é a melhor pessoa para resolver e
> resolve com um clique."*

Projeto desenvolvido para o hackathon da iPORT Solutions.

---

## Por que o Tensor AI é diferente

| Painel comum | Tensor AI |
|---|---|
| Você precisa abrir, filtrar e interpretar | **Ele te procura**: avisa no sino assim que algo muda no DevOps |
| Mostra a carga de um projeto por vez | Soma a carga de cada pessoa **em todos os projetos** |
| Ignora férias, folgas e feriados | Desconta ausências, feriados nacionais, regionais e recessos |
| Diz que há um problema | **Diz quem resolve**: tempo livre, skills e experiência em projetos parecidos |
| Você vai ao DevOps fazer a mudança | **Aplica no DevOps com um clique**, com auditoria |
| Cadastro manual de habilidades | Skills de cada pessoa **aprendidas sozinhas** pelo histórico de tasks |

---

## O que o assistente faz por você

### 1. Vigia o Azure DevOps sem parar
Cada task criada, reatribuída ou movida chega ao Tensor AI em segundos pelos Service Hooks do DevOps
(em torno de 8 segundos do clique no DevOps até a tela). A cada 5 minutos uma reconciliação confere
o que possa ter escapado, e a cada 15 minutos o agente reavalia a equipe inteira. Ninguém precisa
lembrar de abrir um relatório.

### 2. Mostra a disponibilidade real da equipe
Um mapa pessoa × semana com a ocupação somando **todos os projetos**: livre, no limite ou
sobrecarregado. A capacidade já vem descontada de férias, folgas do DevOps, ausências da Agenda e
feriados. O gestor define jornada, foco e limites por pessoa e por projeto; sem nada definido,
vale o padrão de mercado.

### 3. Aloca a equipe por você
- **Task sem dono:** indica quem tem skill e folga para pegar.
- **Pessoa sobrecarregada:** escolhe qual task tirar e para quem passar, mostrando a ocupação de
  cada um antes e depois.
- **Férias com trabalho no meio:** o Tensor AI avisa que a pessoa vai sair com tasks abertas, monta a
  divisão de todas elas entre quem tem tempo livre, skills e experiência em projetos parecidos, e
  oferece **"Rotear tudo no DevOps"** num clique só.
- **Projeto novo sem ninguém:** lê a descrição e as tags, encontra o squad de um projeto parecido
  e monta a menor equipe disponível que cobre o que o projeto pede.

### 4. Encontra os gaps dos projetos
- **Gargalos:** tasks paradas muito além do normal num estado do fluxo.
- **WIP alto:** gente com coisa demais aberta ao mesmo tempo.
- **Esforço × impacto:** projeto consumindo uma fatia grande da equipe para pouco impacto, ou
  projeto importante com pouca gente.
- **Previsão da sprint:** se o que falta cabe na capacidade que resta.
- **Métricas de fluxo:** throughput, cycle time, lead time e WIP por projeto.

### 5. Revela projetos semelhantes
Compara a descrição de todos os projetos (análise de texto) e as tags. Quando dois projetos estão
resolvendo o mesmo problema, o Tensor AI aponta, mostra as palavras em comum e sugere aproveitar quem
já tem experiência no outro.

### 6. Explica cada recomendação
Toda sugestão tem o botão **Entender análise**, que abre a visão técnica do caso: diagnóstico de
tempo com mapa de calor, Pareto 80/20 e matriz esforço × impacto, com a leitura escrita pela IA e
conferida contra os dados.

### 7. Executa com a sua aprovação
Aprovou, está feito: a task é reatribuída no Azure DevOps na hora. Antes de aplicar, o Tensor AI
confere se a situação ainda é a mesma, e tudo fica registrado na auditoria (quem aprovou, quando,
o que mudou).

---

## Princípios do produto

- **A IA sugere, o gestor decide.** Nada é escrito no Azure DevOps sem um clique de aprovação.
- **Os números vêm de um motor determinístico**, nunca do modelo de linguagem. A IA prioriza e
  explica; horas e porcentagens são sempre calculadas.
- **Não se avalia desempenho de pessoas.** O foco é carga, disponibilidade e encaixe de skills.
- **Tudo que é aplicado fica registrado.**
- O sistema só altera **Tasks**; Features e Sprints nunca são modificadas.
- **Não substitui o Azure DevOps**: usa os dados que já existem lá.

---

## Sumário técnico

1. [Telas](#1-telas)
2. [Arquitetura](#2-arquitetura)
3. [Como os números são calculados](#3-como-os-números-são-calculados)
4. [O agente de IA](#4-o-agente-de-ia)
5. [Segurança e LGPD](#5-segurança-e-lgpd)
6. [Estrutura do repositório](#6-estrutura-do-repositório)

## 1. Telas

| Tela | Para que serve |
|---|---|
| **Início** | O dia do gestor em uma tela: quem está acima da capacidade ou no limite, quem vai sair de férias com tasks, tasks sem dono, horas livres, prioridades com ação de um clique, mapa pessoa × semana e a saúde de cada projeto. |
| **Sugestões** | A caixa do assistente, em duas abas: **Alocação de equipe** (sobrecarga, férias com tasks, tasks sem dono, equipe de projeto novo) e **Melhoria de processo** (gargalos, WIP alto, esforço × impacto, projetos parecidos). Cada sugestão tem *Aprovar*, *Ignorar* e *Entender análise*. |
| **Projetos** | Lista com busca e paginação. Projeto sem pessoas recebe o selo "Sem equipe". |
| **Projeto › Resumo** | Uso do time na sprint, alertas (inclusive "parece bem aqui, mas está sobrecarregado no geral"), quem pode absorver trabalho e projetos parecidos com este. |
| **Projeto › Kanban** | Quadro e lista. Arrastar um card muda o estado no Azure DevOps. |
| **Projeto › Cronograma** | Linha do tempo das sprints e features. |
| **Projeto › Equipe** | Cada squad com a ocupação neste projeto e somando todos, horas dedicadas, limites do projeto e equipe sugerida para reforço. |
| **Projeto › Métricas** | Fluxo e previsibilidade: throughput, cycle time, lead time, WIP e previsão da sprint. |
| **Equipe** | Ocupação semana a semana (até 2 anos), skills e tags de cada pessoa e squads. |
| **Agenda** | Calendário com sprints, feriados, ausências e entregas. Registrar uma ausência reduz a capacidade na hora. |
| **Regras de capacidade** | Jornada, foco e limites de alerta: gerais, por pessoa e por projeto. |
| **Sincronização** | Estado da ligação com o Azure DevOps, sincronização manual, últimos eventos e auditoria. |

O sino no topo concentra os avisos do assistente; o botão *Ajuda* abre um glossário em linguagem
simples.

## 2. Arquitetura

```
Azure DevOps ── Service Hooks ──► devops-webhook ─┐
             ◄── REST (PAT) ───── devops-sync ────┼──► Postgres (Supabase) ── Realtime ──► Front (React)
                                  cron a cada 5 min│        │
                                                   │        └─ gatilho por evento e cron 15 min ─► agente ──► Gemini / Claude
             ◄── devops-acoes (mover, atribuir, aprovar sugestão; auditado) ◄──────────────────── gestor
```

| Peça | Tecnologia | Função |
|---|---|---|
| Banco | Supabase Postgres, RLS, pg_cron, pg_net, Vault | Dados sincronizados, regras, sugestões e auditoria; tarefas agendadas e segredos. |
| `devops-sync` | Edge Function (Deno) | Carga completa e reconciliação incremental (WIQL + lotes de 200), idempotente por revisão. |
| `devops-webhook` | Edge Function | Recebe os Service Hooks, grava o evento bruto e processa em segundo plano. |
| `devops-acoes` | Edge Function | Escritas no DevOps aprovadas pelo gestor (estado, responsável, sugestão, lote de reatribuições). |
| `agente` | Edge Function | O assistente: gera as sugestões e a explicação técnica de cada uma. |
| Motores | TypeScript puro em `supabase/functions/_shared` | Capacidade, carga global, regras, ausências, recomendação, equipe sugerida, portfólio e fluxo. Front e agente usam **o mesmo código**, então os números são idênticos nos dois. |
| Front | React 19, Vite, TypeScript strict, TanStack Router/Query, Tailwind v4 | Interface atualizada ao vivo pelo Realtime, publicada na Vercel. |
| Serviço de análise (opcional) | Python 3.12, FastAPI | Métricas de fluxo avançadas para evolução futura (`services/analytics`). |

## 3. Como os números são calculados

**Capacidade de uma pessoa** = horas produtivas por dia × dias úteis, sem feriados, folgas do
DevOps e ausências da Agenda.

- Horas produtivas = jornada × foco. Padrão de mercado: 8 h × 75% = 6 h por dia.
- Dentro de um projeto vale, nesta ordem: as horas que o gestor dedicou ao projeto, a Capacity do
  Azure DevOps ou as horas produtivas da pessoa.
- A soma de todos os projetos nunca passa das horas produtivas da pessoa.

**Carga** = horas restantes das tasks abertas (ou estimado − concluído), distribuídas pelos dias
em que a pessoa está disponível na sprint.

**Ocupação** = carga ÷ capacidade. Padrão: *no limite* acima de 80%, *sobrecarregado* acima de
100%. Gestor, pessoa e projeto podem ter limites próprios.

**Recomendação de responsável** = 65% encaixe de skills + 35% folga depois de receber a task,
penalizando quem passaria do limite. Em ausências, quem atua num projeto parecido ganha bônus, e
as horas já roteadas no mesmo lote entram na conta antes de escolher a próxima pessoa.

**Férias com tasks** = para cada ausência nas próximas 6 semanas, os dias úteis fora, a parte da
sprint restante sem a pessoa e as horas em risco. Crítico quando a pessoa fica fora de metade ou
mais da sprint.

**Equipe sugerida para projeto novo**: os termos do projeto vêm das tags, das skills citadas na
descrição e de sinônimos ("React" → front-end). O sistema compara com os squads de projetos
parecidos e monta o menor grupo de pessoas disponíveis que cobre o que o projeto pede.

**Projetos parecidos** = 60% semelhança do texto das descrições (TF-IDF com cosseno) + 40% tags e
skills em comum.

**Esforço × impacto**: a fatia da capacidade da equipe que cada projeto consome nas próximas 4
semanas, contra o impacto do projeto (definido pelo gestor, pela linha `Impacto:` na descrição do
DevOps ou estimado pela IA).

**Métricas de fluxo**: throughput (tasks concluídas por semana), cycle time (ativação →
conclusão, mediana e P85), lead time (criação → conclusão), WIP e previsão da sprint (horas que
faltam × capacidade que resta).

## 4. O agente de IA

O assistente roda na Edge Function `agente`, disparado a cada evento do DevOps e a cada 15 minutos.

1. **Candidatas (determinístico):** o motor monta as ações possíveis com todos os números prontos:
   atribuir, rebalancear, cobrir férias, montar equipe, gargalo, WIP alto, esforço × impacto e
   projetos parecidos.
2. **Linguagem (IA):** o modelo recebe as candidatas com pseudônimos ("Pessoa A") e devolve
   prioridade, título e explicação. Funciona com **Gemini** (preferido) ou **Claude**, com troca
   automática de modelo quando a cota acaba; sem chave, usa texto automático.
3. **Validador:** o texto da IA é rejeitado se citar um número que não está nos fatos, uma pessoa
   fora da candidata, falar de desempenho ou vier sem acentuação. Nesses casos vale o texto
   automático.
4. **Gravação:** a sugestão entra como pendente, com aviso no sino. A mesma situação não gera duas
   sugestões; se o motivo some (task atribuída, sobrecarga resolvida), ela expira sozinha.

**Aprovar** revalida a situação (a task ainda está com o mesmo responsável?) antes de aplicar no
Azure DevOps. Num lote de férias, cada task é conferida e aplicada uma a uma, e o gestor pode
desmarcar as que não quer mover.

## 5. Segurança e LGPD

| Pilar | Como está implementado |
|---|---|
| Criptografia | Supabase e Vercel só aceitam HTTPS (TLS 1.2/1.3); banco criptografado em repouso (AES-256). Cabeçalhos HSTS, CSP, `nosniff`, `no-store` e `X-Frame-Options` no front e nas funções. |
| Segredos | PAT e chaves ficam em Supabase Secrets e no Vault. Os segredos de entrada (cron, webhook, agente) são guardados só como **hash SHA-256** e comparados em tempo constante. `.env` fora do Git e gitleaks no CI. |
| IA sem dado pessoal | Antes de qualquer chamada ao modelo, um middleware troca nomes e e-mails conhecidos por `[USER_01]`, e e-mails, CPFs e telefones soltos por marcadores. As pessoas aparecem como pseudônimos e a resposta é restaurada só dentro do sistema. |
| Logs | Todo log passa por um sanitizador: e-mails mascarados (`k***@g***.com`) e campos de pessoa ocultos. |
| Ciclo de vida (TTL) | Expurgo diário: sugestões pendentes expiram em 30 dias e decididas somem em 90; caches da IA em 7 dias; notificações em 30/90 dias; histórico e auditoria em 1 ano; eventos de webhook em 30 dias. |
| Direito ao esquecimento | `esquecer_pessoa` apaga skills, ausências, regras, alocações, notificações e sugestões, e anonimiza o nome de vez. `esquecer_usuario` apaga a conta. Botão na ficha da pessoa, só para admin. |
| Acesso (RBAC) | Papéis `admin`, `gestor` e `membro` sobre o JWT do Supabase Auth. Sugestões, métricas executivas, regras, sincronização e auditoria só para gestor/admin, garantido por RLS no banco e por middleware nas funções. |
| Auditoria | Tabela `auditoria` append-only (UPDATE e DELETE bloqueados) com hash encadeado (`verificar_auditoria()` detecta adulteração). Registra ator anonimizado (HMAC), papel, ação, recurso e IP mascarado. |

## 6. Estrutura do repositório

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
