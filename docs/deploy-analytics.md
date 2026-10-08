# Deploy do serviço de análise (`services/analytics`)

## Destino: Fly.io

| Critério | Fly.io | Railway | Render |
|---|---|---|---|
| Máquina sempre ligada (o debounce de 30 s vive em memória) | sim, `min_machines_running = 1` | sim | free **dorme após 15 min** (cold start ~50 s) |
| Região perto do Supabase e da iPORT | `gru` (São Paulo) | só EUA/UE/Ásia | Oregon/Ohio/Frankfurt/Singapura |
| Custo para 1 máquina pequena (aprox., conferir) | ~US$ 2–4/mês (shared-cpu-1x, 512 MB) | trial de US$ 5, depois pago | free inviável pelo sono; pago a partir de US$ 7 |
| Deploy do Dockerfile do repositório | `fly deploy` com Dockerfile e contexto escolhidos | sim | sim |
| Segredos | `fly secrets set` (cifrados, não ficam no repo) | sim | sim |

**Escolha: Fly.io**, região `gru`. O fator decisivo é a demo: "criar a task e a sugestão aparece
em segundos" não aguenta o cold start do Render, e a latência até o Supabase/DevOps é menor no
Brasil. O serviço é um processo só (o debounce é em memória); se precisar escalar, o debounce
passa para o banco antes de subir a segunda máquina.

## Primeira vez

```bash
fly auth login
fly apps create radar-analytics
fly secrets set --app radar-analytics \
  SUPABASE_DB_URL='postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:6543/postgres' \
  DEVOPS_ORG='https://dev.azure.com/JLNK' \
  DEVOPS_PAT_READ='<PAT só com Work Items (Read)>' \
  ANTHROPIC_API_KEY='<chave>' \
  ANALYTICS_SHARED_SECRET="$(openssl rand -hex 32)"
# da RAIZ do repositório (o build precisa de prompts/):
fly deploy . --config services/analytics/fly.toml --dockerfile services/analytics/Dockerfile
curl https://radar-analytics.fly.dev/health
```

- `SUPABASE_DB_URL`: string do **pooler** (porta 6543, modo transação). O pool usa
  `prepare_threshold=None`, exigido pelo pooler.
- `DEVOPS_PAT_READ`: gere um PAT separado, escopo **Work Items (Read)** apenas. O serviço só
  faz `GET` (`devops/client.py`).

## Ligar o banco ao serviço (Vault, uma vez)

No SQL editor do Supabase (não versionado — contém segredo):

```sql
select vault.create_secret('https://radar-analytics.fly.dev', 'radar_analytics_url');
select vault.create_secret('<mesmo ANALYTICS_SHARED_SECRET>', 'radar_analytics_secret');
```

Sem esses dois segredos, o trigger e o cron `radar-analytics-sweep` não fazem nada.

## Depois de subir

```bash
uv run radar-analytics backfill      # (local, com as mesmas variáveis) histórico de transições
```

Verificação ponta a ponta: criar uma task no DevOps de demo → `evento` processado → (30 s de
debounce) → linha `pendente` em `sugestao` com `markdown`, `acao` e `payload.evidencias`.

```sql
select criada_em, tipo, usou_fallback, versao_prompt, acao, left(markdown, 120)
  from sugestao order by criada_em desc limit 5;
select * from net._http_response order by created desc limit 5;   -- respostas do pg_net
```

## CI

`.github/workflows/analytics.yml` roda só quando muda `services/analytics/**` ou `prompts/**`:
ruff (lint + formato), mypy --strict, pytest com cobertura ≥ 90% em `domain/` e build da imagem
(sem push). O deploy é manual (`fly deploy`) por enquanto.
