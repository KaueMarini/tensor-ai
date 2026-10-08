"""Construtores curtos para os testes (datas de outubro de 2026: dia 5 é segunda-feira)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from radar_analytics.domain.calendario import FUSO
from radar_analytics.domain.capacidade import EntradaCapacidade
from radar_analytics.domain.fluxo import categoria_estado
from radar_analytics.domain.models import (
    CapacidadeTime,
    Folga,
    Pessoa,
    Sprint,
    Task,
    Transicao,
)

PROJ = "proj-1"


def d(dia: int, mes: int = 10) -> date:
    return date(2026, mes, dia)


def dt(dia: int, hora: int = 9, minuto: int = 0, mes: int = 10) -> datetime:
    return datetime(2026, mes, dia, hora, minuto, tzinfo=FUSO)


def pessoa(pid: str, **kw: Any) -> Pessoa:
    return Pessoa(id=pid, nome=kw.pop("nome", pid.capitalize()), **kw)


def sprint(sid: str, inicio: date | None, fim: date | None, projeto: str = PROJ) -> Sprint:
    return Sprint(id=sid, projeto_id=projeto, nome=sid, inicio=inicio, fim=fim)


def task(tid: int, **kw: Any) -> Task:
    estado = kw.pop("estado", "New")
    return Task(
        id=tid,
        projeto_id=kw.pop("projeto_id", PROJ),
        tipo=kw.pop("tipo", "Task"),
        titulo=kw.pop("titulo", f"Task {tid}"),
        estado=estado,
        categoria=kw.pop("categoria", categoria_estado(estado)),
        sprint_id=kw.pop("sprint_id", "s1"),
        responsavel_id=kw.pop("responsavel_id", None),
        **kw,
    )


def cap(sprint_id: str, pessoa_id: str, horas: float, time_id: str = "t1") -> CapacidadeTime:
    return CapacidadeTime(sprint_id=sprint_id, time_id=time_id, pessoa_id=pessoa_id, capacidade_dia=horas)


def ferias(pessoa_id: str, inicio: date, fim: date) -> Folga:
    return Folga(pessoa_id=pessoa_id, inicio=inicio, fim=fim, tipo="ferias")


def trans(item: int, campo: str, de: str | None, para: str, quando: datetime, rev: int) -> Transicao:
    return Transicao(work_item_id=item, campo=campo, de=de, para=para, changed_at=quando, changed_rev=rev)  # type: ignore[arg-type]


def entrada(**kw: Any) -> EntradaCapacidade:
    kw.setdefault("sprints", (sprint("s1", d(5), d(16)), sprint("s2", d(19), d(30))))
    return EntradaCapacidade(**kw)


SEMANA_1 = (d(5), d(11))
SEMANA_2 = (d(12), d(18))
SEMANA_3 = (d(19), d(25))
