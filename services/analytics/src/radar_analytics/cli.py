"""Linha de comando: `uv run radar-analytics backfill [--projeto ID] [--limite N]`."""

from __future__ import annotations

import argparse
import json

from radar_analytics.backfill import backfill
from radar_analytics.config import settings
from radar_analytics.devops.client import DevOpsLeitura
from radar_analytics.logs import configurar
from radar_analytics.repositories.db import criar_pool


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="radar-analytics")
    sub = parser.add_subparsers(dest="comando", required=True)
    b = sub.add_parser("backfill", help="histórico de State/BoardColumn e dependências via /updates")
    b.add_argument("--projeto", default=None, help="ID do projeto (padrão: todos)")
    b.add_argument("--limite", type=int, default=500)
    args = parser.parse_args(argv)

    cfg = settings()
    configurar(cfg.log_level)
    if args.comando == "backfill":
        devops = DevOpsLeitura(cfg.devops_org, cfg.devops_pat_read.get_secret_value())
        with criar_pool(cfg.supabase_db_url.get_secret_value(), 1) as pool, pool.connection() as conn:
            print(json.dumps(backfill(conn, devops, args.projeto, args.limite)))
        devops.close()


if __name__ == "__main__":  # pragma: no cover
    main()
