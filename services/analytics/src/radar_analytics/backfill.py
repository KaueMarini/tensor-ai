from __future__ import annotations

from typing import Any

import structlog
from psycopg import Connection

from radar_analytics.devops.client import DevOpsLeitura
from radar_analytics.repositories import escrita

log = structlog.get_logger(__name__)


def backfill(
    conn: Connection[dict[str, Any]],
    devops: DevOpsLeitura,
    projeto_id: str | None = None,
    limite: int = 500,
) -> dict[str, int]:
    ids = escrita.itens_sem_historico(conn, projeto_id, limite)
    gravadas = 0
    for i, wid in enumerate(ids, 1):
        trans = devops.transicoes(wid)
        gravadas += escrita.gravar_transicoes(conn, trans)
        if i % 25 == 0:
            log.info("backfill_progresso", itens=i, total=len(ids))
    relacoes = devops.dependencias(ids) if ids else []
    escrita.gravar_relacoes(conn, relacoes)
    resumo = {"itens": len(ids), "transicoes": gravadas, "dependencias": len(relacoes)}
    log.info("backfill_concluido", projeto_id=projeto_id, **resumo)
    return resumo
