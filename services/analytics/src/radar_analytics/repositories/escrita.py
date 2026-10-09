from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict

from radar_analytics.domain.models import Transicao

Conn = Connection[dict[str, Any]]


class SugestaoNova(BaseModel):
    model_config = ConfigDict(frozen=True)

    projeto_id: str
    origem: str
    tipo: str
    markdown: str
    justificativa: str
    payload: dict[str, Any]
    acao: dict[str, Any]
    impacto: dict[str, Any]
    impacto_antes: dict[str, Any]
    impacto_depois: dict[str, Any]
    versao_prompt: str
    hash_payload: str
    usou_fallback: bool


def existe_pendente(conn: Conn, hash_payload: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "select 1 from sugestao where hash_payload = %(h)s and status = 'pendente' limit 1",
            {"h": hash_payload},
        )
        return cur.fetchone() is not None


def gravar_sugestao(conn: Conn, s: SugestaoNova) -> UUID | None:
    with conn.cursor() as cur:
        cur.execute(
            """insert into sugestao (projeto_id, origem, tipo, markdown, justificativa, payload, acao,
                                     impacto, impacto_antes, impacto_depois, versao_prompt,
                                     hash_payload, usou_fallback, status)
               values (%(projeto_id)s, %(origem)s, %(tipo)s, %(markdown)s, %(justificativa)s, %(payload)s,
                       %(acao)s, %(impacto)s, %(impacto_antes)s, %(impacto_depois)s, %(versao_prompt)s,
                       %(hash_payload)s, %(usou_fallback)s, 'pendente')
               on conflict (hash_payload) where status = 'pendente' and hash_payload is not null
               do nothing
               returning id""",
            {
                **s.model_dump(),
                "payload": Jsonb(s.payload),
                "acao": Jsonb(s.acao),
                "impacto": Jsonb(s.impacto),
                "impacto_antes": Jsonb(s.impacto_antes),
                "impacto_depois": Jsonb(s.impacto_depois),
            },
        )
        linha = cur.fetchone()
    conn.commit()
    return None if linha is None else UUID(str(linha["id"]))


def gravar_transicoes(conn: Conn, transicoes: Sequence[Transicao]) -> int:
    if not transicoes:
        return 0
    with conn.cursor() as cur:
        cur.executemany(
            """insert into work_item_transicao
                   (work_item_id, campo, de, para, changed_at, changed_rev, origem)
               values (%(work_item_id)s, %(campo)s, %(de)s, %(para)s, %(changed_at)s, %(changed_rev)s,
                       'backfill')
               on conflict (work_item_id, campo, changed_rev) do nothing""",
            [t.model_dump() for t in transicoes],
        )
        n = cur.rowcount
    conn.commit()
    return max(n, 0)


def itens_sem_historico(conn: Conn, projeto_id: str | None, limite: int) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            """select w.devops_id from work_item w
                where w.deleted_at is null and w.tipo not in ('Feature', 'Epic')
                  and (%(p)s::uuid is null or w.projeto_id = %(p)s::uuid)
                  and not exists (select 1 from work_item_transicao t
                                   where t.work_item_id = w.devops_id and t.origem = 'backfill')
                order by w.devops_id limit %(n)s""",
            {"p": projeto_id, "n": limite},
        )
        return [int(r["devops_id"]) for r in cur.fetchall()]


def gravar_relacoes(conn: Conn, relacoes: Iterable[tuple[int, str, int]]) -> None:
    lista = list(relacoes)
    itens = sorted({r[0] for r in lista})
    with conn.cursor() as cur:
        if itens:
            cur.execute("delete from devops_relacao_cache where work_item_id = any(%(i)s)", {"i": itens})
        if lista:
            cur.executemany(
                """insert into devops_relacao_cache (work_item_id, tipo, alvo_id) values (%s, %s, %s)
                   on conflict do nothing""",
                lista,
            )
    conn.commit()
