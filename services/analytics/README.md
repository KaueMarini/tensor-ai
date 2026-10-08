# radar-analytics

Motor de análise de fluxo e capacidade do Radar de Capacidade. Lê o Supabase, calcula as
métricas de forma determinística, pede ao LLM só a escolha de uma ação candidata + o texto,
valida e grava `sugestao` **pendente**. Nunca escreve no Azure DevOps.

```bash
uv sync                                   # Python 3.12 + dependências
uv run pytest                             # testes (LLM sempre mockado)
uv run ruff check . && uv run mypy src    # qualidade
uv run uvicorn radar_analytics.api.main:criar_app --factory --port 8080
uv run radar-analytics backfill           # histórico de transições via /updates
uv run radar-analytics analisar --projeto <id>
```

Variáveis: `SUPABASE_DB_URL`, `DEVOPS_ORG`, `DEVOPS_PAT_READ`, `ANTHROPIC_API_KEY`, `LLM_MODEL`,
`ANALYTICS_SHARED_SECRET` (ver `src/radar_analytics/config.py`). Fórmulas em
`docs/metodologia.md`, contrato em `docs/contratos-backend.md`, deploy em
`docs/deploy-analytics.md`.
