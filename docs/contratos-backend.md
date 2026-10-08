# Contratos do backend — serviço de análise

> Para quem consome os dados do serviço `services/analytics` (front, executor). O serviço
> **não** altera o front nem escreve no Azure DevOps.

## `sugestao` (tabela, Realtime ligado)

Uma linha por análise que encontrou ação. Sempre nasce `status = 'pendente'`.

| Coluna | Tipo | Conteúdo |
|---|---|---|
| `id` | uuid | |
| `projeto_id` | uuid | projeto analisado |
| `origem` | text | `evento` (webhook de work item) ou `sweep` (varredura de 15 min) |
| `tipo` | text | `reatribuir` · `mover_sprint` · `pausar` |
| `status` | text | `pendente` → `aplicada` / `ignorada` (decisão do gestor) |
| `markdown` | text | texto pronto para exibir, formato fixo (abaixo), com **pseudônimos** |
| `justificativa` | text | as três justificativas concatenadas (busca/preview) |
| `acao` | jsonb | o que o executor aplica, com **IDs reais** (abaixo) |
| `impacto` | jsonb | `{quadrante, quick_win, impacto_score, esforco_score, impacto{...}, esforco{...}}` |
| `impacto_antes` / `impacto_depois` | jsonb | `{pessoas: [{pessoa, pico_pct, semana_pct, horas_acima_do_limite}]}` (pseudônimos) |
| `payload` | jsonb | `entrada_llm` (dados pseudonimizados enviados), `evidencias` (fórmula, entradas, resultado), `resposta`, `validacao.tentativas`, `modelo` |
| `versao_prompt` | text | ex.: `analista-fluxo.v1`; `sem-prompt` quando só o template foi usado |
| `hash_payload` | text | idempotência: o mesmo estado não gera duas pendentes |
| `usou_fallback` | bool | `true` = texto do template determinístico (LLM indisponível ou reprovado 2×) |
| `criada_em`, `decidida_por`, `decidida_em` | | como antes |

### `acao`

```json
{ "tipo": "reatribuir",   "work_item_id": 123, "de_pessoa_id": "<uuid>", "para_pessoa_id": "<uuid>" }
{ "tipo": "mover_sprint", "work_item_id": 123, "de_pessoa_id": "<uuid>", "para_sprint_id": "<uuid>" }
{ "tipo": "pausar",       "work_item_id": 123, "de_pessoa_id": "<uuid>" }
```
Só Tasks (nunca Feature/Epic/Sprint). `pessoa.id` e `sprint.id` são os do banco.
Para mostrar nomes reais ao gestor, o front resolve esses IDs (o markdown fica pseudonimizado).

### `markdown` (formato fixo)

```
🚨 ALERTA DE GARGALO
<até 2 linhas>

🛠️ RECOMENDAÇÃO DE AÇÃO
<1 linha>

📊 JUSTIFICATIVA TÉCNICA (Explainable AI)
- **Pareto:** ...
- **Mapa de Calor / Tempo de Ciclo:** ...
- **Esforço vs Impacto:** ...
```

## Tabelas novas (leitura para autenticados, escrita só service_role)

- `work_item_transicao` — histórico de `System.State` / `System.BoardColumn`.
- `fluxo_config` — colunas de espera, SLA em horas úteis, limites de WIP (coluna `*` = por pessoa).
- `analise_config` — tags/campo de bloqueio, campo de horas da carga, fallback de horas, percentil.
- `devops_relacao_cache` — dependências lidas do DevOps.

## HTTP do serviço

| Rota | Quem chama | Auth |
|---|---|---|
| `POST /analyze/event` `{work_item_id, evento_id?}` → 202 | trigger em `evento` (pg_net) | `x-analytics-secret` |
| `POST /analyze/sweep` → 202 | pg_cron `radar-analytics-sweep` (15 min) | `x-analytics-secret` |
| `GET /health` | monitoramento | — |
