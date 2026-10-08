"""Orquestra uma análise: banco → domínio → agente → `sugestao` pendente. Síncrono (roda em thread)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any, Literal

import structlog
from psycopg import Connection
from psycopg_pool import ConnectionPool

from radar_analytics.agent.analista import gerar_sugestao
from radar_analytics.agent.llm import LLMClient
from radar_analytics.agent.prompt_loader import Prompt
from radar_analytics.devops.client import DevOpsLeitura
from radar_analytics.domain.analise import analisar
from radar_analytics.domain.calendario import FUSO
from radar_analytics.repositories import escrita
from radar_analytics.repositories.snapshot import carregar_snapshot, projeto_do_item, projetos_ativos

log = structlog.get_logger(__name__)
Origem = Literal["evento", "sweep"]


def _agora() -> datetime:
    return datetime.now(FUSO)


class Servico:
    def __init__(
        self,
        pool: ConnectionPool[Connection[dict[str, Any]]],
        llm: LLMClient | None,
        prompt: Prompt | None,
        devops: DevOpsLeitura | None = None,
        semanas: int = 4,
        relogio: Callable[[], datetime] = _agora,
    ) -> None:
        self.pool = pool
        self.llm = llm
        self.prompt = prompt
        self.devops = devops
        self.semanas = semanas
        self.relogio = relogio

    def analisar_projeto(self, projeto_id: str, origem: Origem) -> dict[str, Any]:
        agora = self.relogio()
        with self.pool.connection() as conn:
            linha = conn.execute(
                "select nome from projeto where id = %(p)s and deleted_at is null", {"p": projeto_id}
            ).fetchone()
            if linha is None:
                return {"projeto_id": projeto_id, "status": "projeto_inexistente"}
            snap = carregar_snapshot(conn, projeto_id, agora.date())
            analise = analisar(snap, agora.date(), agora, self.semanas)
            sugestao = gerar_sugestao(
                analise,
                snap,
                str(linha["nome"]),
                origem,
                self.llm,
                self.prompt,
                ja_pendente=lambda h: escrita.existe_pendente(conn, h),
            )
            if sugestao is None:
                status = "sem_acao" if not analise.candidatos else "ja_pendente"
                log.info("analise_sem_sugestao", projeto_id=projeto_id, origem=origem, status=status)
                return {"projeto_id": projeto_id, "status": status, "alertas": len(analise.alertas)}
            sid = escrita.gravar_sugestao(conn, sugestao)
        log.info(
            "sugestao_gravada",
            projeto_id=projeto_id,
            origem=origem,
            sugestao_id=str(sid),
            tipo=sugestao.tipo,
            fallback=sugestao.usou_fallback,
        )
        return {
            "projeto_id": projeto_id,
            "status": "criada" if sid else "ja_pendente",
            "sugestao_id": None if sid is None else str(sid),
        }

    def analisar_item(self, work_item_id: int) -> dict[str, Any]:
        with self.pool.connection() as conn:
            projeto = projeto_do_item(conn, work_item_id)
            if projeto and self.devops is not None:
                try:  # dependências não vêm na sync: relê só deste item
                    escrita.gravar_relacoes(conn, self.devops.dependencias([work_item_id]))
                except Exception as erro:
                    log.warning("dependencias_falharam", devops_id=work_item_id, erro=str(erro))
        if projeto is None:
            return {"devops_id": work_item_id, "status": "item_inexistente"}
        return self.analisar_projeto(projeto, "evento")

    def sweep(self) -> list[dict[str, Any]]:
        with self.pool.connection() as conn:
            projetos = projetos_ativos(conn)
        resultados: list[dict[str, Any]] = []
        for p in projetos:
            try:
                resultados.append(self.analisar_projeto(p, "sweep"))
            except Exception as erro:
                log.exception("sweep_projeto_falhou", projeto_id=p)
                resultados.append({"projeto_id": p, "status": "erro", "erro": str(erro)})
        return resultados
