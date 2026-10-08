"""Linha de comando.

uv run radar-analytics backfill [--projeto ID] [--limite N]   histórico via /updates
uv run radar-analytics analisar --projeto ID                  uma análise agora (grava sugestão)
uv run radar-analytics sweep                                  todos os projetos
"""

from __future__ import annotations

import argparse
import json

from radar_analytics.backfill import backfill
from radar_analytics.bootstrap import montar


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="radar-analytics")
    sub = parser.add_subparsers(dest="comando", required=True)
    b = sub.add_parser("backfill", help="histórico de State/BoardColumn e dependências via /updates")
    b.add_argument("--projeto", default=None, help="ID do projeto (padrão: todos)")
    b.add_argument("--limite", type=int, default=500)
    a = sub.add_parser("analisar", help="analisa um projeto agora")
    a.add_argument("--projeto", required=True)
    sub.add_parser("sweep", help="analisa todos os projetos")
    args = parser.parse_args(argv)

    r = montar()
    try:
        srv = r.servico
        if args.comando == "backfill":
            if srv.devops is None:  # pragma: no cover - montar() sempre cria
                raise SystemExit("DevOps não configurado")
            with srv.pool.connection() as conn:
                saida: object = backfill(conn, srv.devops, args.projeto, args.limite)
        elif args.comando == "analisar":
            saida = srv.analisar_projeto(args.projeto, "sweep")
        else:
            saida = srv.sweep()
        print(json.dumps(saida, ensure_ascii=False, default=str))
    finally:
        r.fechar()


if __name__ == "__main__":  # pragma: no cover
    main()
