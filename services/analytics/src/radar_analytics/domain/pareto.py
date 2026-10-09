from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from pydantic import BaseModel, ConfigDict

from radar_analytics import numeros
from radar_analytics.domain.capacidade import CelulaSemana, ConflitoAusencia, horas_da_task
from radar_analytics.domain.fluxo import EsperaColuna
from radar_analytics.domain.models import ConfigAnalise, Evidencia, Task
from radar_analytics.domain.skills import chave_skill

CORTE_VITAIS = 0.8


class _Base(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Ocorrencia(_Base):
    causa: str
    rotulo: str
    task_id: int


class ItemPareto(_Base):
    causa: str
    rotulo: str
    ocorrencias: int
    pct: float
    pct_acumulado: float
    vital: bool
    tasks: tuple[int, ...]


class Pareto(_Base):
    itens: tuple[ItemPareto, ...]
    total: int
    evidencia: Evidencia


def causas_de_atraso(
    tasks: Iterable[Task],
    esperas: Iterable[EsperaColuna],
    conflitos: Iterable[ConflitoAusencia],
    celulas: Iterable[CelulaSemana],
    config: ConfigAnalise,
    limite_sobrecarga_pct: float,
) -> list[Ocorrencia]:
    lista = [t for t in tasks if not t.tem_filhos]
    abertas = {t.id for t in lista if t.aberta}
    tags_bloqueio = {chave_skill(t) for t in config.tags_bloqueio}
    out: list[Ocorrencia] = []

    for e in esperas:
        if e.excesso_horas > 0 and e.task_id in abertas:
            out.append(
                Ocorrencia(causa=f"sla:{e.coluna}", rotulo=f"Estouro de SLA em {e.coluna}", task_id=e.task_id)
            )

    sobrecarregadas = {tid for c in celulas if c.status == "sobrecarga" for tid in c.tasks}
    ausentes = {c.task_id for c in conflitos}
    for t in lista:
        if not t.aberta:
            continue
        if t.bloqueado or any(chave_skill(tag) in tags_bloqueio for tag in t.tags):
            out.append(Ocorrencia(causa="bloqueado", rotulo="Bloqueado", task_id=t.id))
        if t.id in ausentes:
            out.append(Ocorrencia(causa="ausente", rotulo="Responsável ausente", task_id=t.id))
        if t.id in sobrecarregadas:
            rotulo = f"Responsável acima de {limite_sobrecarga_pct:.0f}%"
            out.append(Ocorrencia(causa="sobrecarga", rotulo=rotulo, task_id=t.id))
        if t.responsavel_id and horas_da_task(t, config).origem == "sistema":
            out.append(Ocorrencia(causa="sem_estimativa", rotulo="Sem estimativa", task_id=t.id))
        if any(d in abertas for d in t.depende_de):
            out.append(Ocorrencia(causa="dependencia", rotulo="Dependência pendente", task_id=t.id))
    return out


def pareto(ocorrencias: Iterable[Ocorrencia]) -> Pareto:
    por: dict[str, set[int]] = defaultdict(set)
    rotulos: dict[str, str] = {}
    for o in ocorrencias:
        por[o.causa].add(o.task_id)
        rotulos[o.causa] = o.rotulo
    ordem = sorted(por.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    total = sum(len(ids) for _, ids in ordem)

    itens: list[ItemPareto] = []
    acumulado = 0
    for causa, ids in ordem:
        vital = acumulado / total < CORTE_VITAIS
        acumulado += len(ids)
        itens.append(
            ItemPareto(
                causa=causa,
                rotulo=rotulos[causa],
                ocorrencias=len(ids),
                pct=numeros.arredondar(100 * len(ids) / total, 1),
                pct_acumulado=numeros.arredondar(100 * acumulado / total, 1),
                vital=vital,
                tasks=tuple(sorted(ids)),
            )
        )
    return Pareto(
        itens=tuple(itens),
        total=total,
        evidencia=Evidencia(
            metrica="pareto_causas",
            formula="tasks afetadas por causa, ordem decrescente; vitais = menor topo com acumulado ≥ 80%",
            entradas={i.causa: i.ocorrencias for i in itens},
            resultado=sum(1 for i in itens if i.vital),
            unidade="causas vitais",
        ),
    )
