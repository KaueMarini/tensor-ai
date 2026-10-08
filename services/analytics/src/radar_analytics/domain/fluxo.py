"""Métricas de fluxo: tempo em fila (waiting time), cycle/lead time, aging e WIP. Puro.

- Coluna: usa o histórico de `System.BoardColumn` quando o item tem; senão o de `System.State`.
- Waiting time: horas úteis (expediente, sem fim de semana/feriado) somadas em TODAS as
  passagens pela coluna (reentrada soma), comparadas ao SLA da coluna de espera.
- Cycle time: 1ª entrada em andamento → última entrada em concluído. Lead time: criação →
  última entrada em concluído. Aging: 1ª entrada em andamento → agora (item ainda aberto).
  Os três em dias corridos, comparados ao percentil de referência (p85) do projeto.
- WIP é medida de CARGA (itens em andamento ao mesmo tempo), nunca de desempenho.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from radar_analytics import numeros
from radar_analytics.domain.calendario import horas_uteis_entre
from radar_analytics.domain.models import (
    Categoria,
    ColunaFluxo,
    ConfigAnalise,
    Evidencia,
    Task,
    Transicao,
)
from radar_analytics.domain.skills import chave_skill

# Mesmo mapa de `_shared/kanban.ts` (sem metadados do processo, decide pelo nome)
_POR_NOME: dict[str, Categoria] = {
    "new": Categoria.PROPOSTO,
    "to do": Categoria.PROPOSTO,
    "proposed": Categoria.PROPOSTO,
    "approved": Categoria.PROPOSTO,
    "active": Categoria.ANDAMENTO,
    "in progress": Categoria.ANDAMENTO,
    "doing": Categoria.ANDAMENTO,
    "committed": Categoria.ANDAMENTO,
    "open": Categoria.ANDAMENTO,
    "resolved": Categoria.RESOLVIDO,
    "closed": Categoria.CONCLUIDO,
    "done": Categoria.CONCLUIDO,
    "completed": Categoria.CONCLUIDO,
    "removed": Categoria.REMOVIDO,
    "cut": Categoria.REMOVIDO,
}


def categoria_estado(estado: str | None) -> Categoria:
    if not estado:
        return Categoria.PROPOSTO
    return _POR_NOME.get(estado.strip().lower(), Categoria.ANDAMENTO)


class _Base(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Segmento(_Base):
    coluna: str
    entrou: datetime
    saiu: datetime | None


class EsperaColuna(_Base):
    task_id: int
    coluna: str
    horas_uteis: float
    passagens: int
    sla_horas_uteis: float
    excesso_horas: float
    em_curso: bool
    evidencia: Evidencia


class TemposItem(_Base):
    task_id: int
    cycle_dias: float | None
    lead_dias: float | None
    aging_dias: float | None


class Referencia(_Base):
    percentil: float
    cycle_dias: float | None
    lead_dias: float | None
    amostras: int
    evidencia: Evidencia


class AgingAcima(_Base):
    task_id: int
    aging_dias: float
    referencia_dias: float
    evidencia: Evidencia


class Wip(_Base):
    chave: str  # pessoa_id ou nome da coluna
    wip: int
    limite: int
    tasks: tuple[int, ...]
    evidencia: Evidencia

    @property
    def acima(self) -> bool:
        return self.wip > self.limite


# --------------------------------------------------------------------------- histórico


def por_item(transicoes: Iterable[Transicao]) -> dict[int, list[Transicao]]:
    out: dict[int, list[Transicao]] = defaultdict(list)
    for t in transicoes:
        out[t.work_item_id].append(t)
    for lista in out.values():
        lista.sort(key=lambda t: (t.changed_rev, t.changed_at))
    return out


def _campo_do_item(hist: Sequence[Transicao]) -> str:
    return "System.BoardColumn" if any(t.campo == "System.BoardColumn" for t in hist) else "System.State"


def segmentos(hist: Sequence[Transicao]) -> list[Segmento]:
    """Intervalos em cada coluna. Passagens antes do 1º registro do histórico são desconhecidas."""
    campo = _campo_do_item(hist)
    trans = [t for t in hist if t.campo == campo and t.para]
    out: list[Segmento] = []
    for i, t in enumerate(trans):
        saiu = trans[i + 1].changed_at if i + 1 < len(trans) else None
        out.append(Segmento(coluna=t.para or "", entrou=t.changed_at, saiu=saiu))
    return out


def coluna_atual(hist: Sequence[Transicao], estado: str | None) -> str | None:
    segs = segmentos(hist)
    return segs[-1].coluna if segs else estado


# --------------------------------------------------------------------------- waiting time


def tempo_em_espera(
    task: Task,
    hist: Sequence[Transicao],
    config: ConfigAnalise,
    feriados: frozenset[date],
    agora: datetime,
) -> list[EsperaColuna]:
    espera = {chave_skill(c.coluna): c for c in config.colunas if c.tipo == "espera" and c.sla_horas_uteis}
    acumulado: dict[str, list[Segmento]] = defaultdict(list)
    for s in segmentos(hist):
        k = chave_skill(s.coluna)
        if k in espera:
            acumulado[k].append(s)
    out: list[EsperaColuna] = []
    for k, segs in acumulado.items():
        col: ColunaFluxo = espera[k]
        sla = col.sla_horas_uteis or 0.0
        parciais = [horas_uteis_entre(s.entrou, s.saiu or agora, feriados, config.expediente) for s in segs]
        total = numeros.horas(sum(parciais))
        excesso = numeros.horas(max(0.0, total - sla))
        out.append(
            EsperaColuna(
                task_id=task.id,
                coluna=col.coluna,
                horas_uteis=total,
                passagens=len(segs),
                sla_horas_uteis=sla,
                excesso_horas=excesso,
                em_curso=segs[-1].saiu is None,
                evidencia=Evidencia(
                    metrica="waiting_time",
                    formula="Σ horas úteis em cada passagem pela coluna; excesso = max(0, total − SLA)",
                    entradas={
                        "coluna": col.coluna,
                        "passagens_horas": [numeros.horas(p) for p in parciais],
                        "sla_horas_uteis": sla,
                        "expediente": f"{config.expediente.inicio:%H:%M}-{config.expediente.fim:%H:%M}",
                    },
                    resultado=total,
                    unidade="h úteis",
                ),
            )
        )
    return out


# --------------------------------------------------------------------------- cycle/lead/aging


def _dias(a: datetime, b: datetime) -> float:
    return max(0.0, (b - a).total_seconds() / 86400)


def tempos(task: Task, hist: Sequence[Transicao], agora: datetime) -> TemposItem:
    estados = [t for t in hist if t.campo == "System.State"]
    inicio_trabalho = next(
        (t.changed_at for t in estados if categoria_estado(t.para) == Categoria.ANDAMENTO), None
    )
    concluiu = None
    if task.categoria == Categoria.CONCLUIDO:
        fim = [t.changed_at for t in estados if categoria_estado(t.para) == Categoria.CONCLUIDO]
        concluiu = fim[-1] if fim else None
    cycle = _dias(inicio_trabalho, concluiu) if inicio_trabalho and concluiu else None
    lead = _dias(task.criado_em, concluiu) if task.criado_em and concluiu else None
    aging = _dias(inicio_trabalho, agora) if inicio_trabalho and task.aberta and task.em_andamento else None
    return TemposItem(task_id=task.id, cycle_dias=cycle, lead_dias=lead, aging_dias=aging)


def percentil(valores: Sequence[float], p: float) -> float:
    """Percentil com interpolação linear (método 'linear' / tipo 7). Exige ao menos 1 valor."""
    if not valores:
        raise ValueError("percentil de lista vazia")
    ordenados = sorted(valores)
    pos = (len(ordenados) - 1) * p
    baixo = math.floor(pos)
    alto = math.ceil(pos)
    return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (pos - baixo)


def referencia(medidos: Sequence[TemposItem], config: ConfigAnalise) -> Referencia:
    cycles = [t.cycle_dias for t in medidos if t.cycle_dias is not None]
    leads = [t.lead_dias for t in medidos if t.lead_dias is not None]
    p = config.percentil_referencia
    minimo = config.min_amostras_percentil
    cyc = numeros.horas(percentil(cycles, p)) if len(cycles) >= minimo else None
    lea = numeros.horas(percentil(leads, p)) if len(leads) >= minimo else None
    return Referencia(
        percentil=p,
        cycle_dias=cyc,
        lead_dias=lea,
        amostras=len(cycles),
        evidencia=Evidencia(
            metrica="referencia_tempo_ciclo",
            formula=f"percentil {numeros.pct(p):.0f} (interpolação linear) do cycle/lead time dos concluídos",
            entradas={"amostras_cycle": len(cycles), "amostras_lead": len(leads), "minimo_amostras": minimo},
            resultado=cyc,
            unidade="dias",
        ),
    )


def aging_acima(medidos: Sequence[TemposItem], ref: Referencia) -> list[AgingAcima]:
    if ref.cycle_dias is None:
        return []
    out: list[AgingAcima] = []
    for t in medidos:
        if t.aging_dias is None or t.aging_dias <= ref.cycle_dias:
            continue
        aging = numeros.horas(t.aging_dias)
        out.append(
            AgingAcima(
                task_id=t.task_id,
                aging_dias=aging,
                referencia_dias=ref.cycle_dias,
                evidencia=Evidencia(
                    metrica="aging_wip",
                    formula="agora − 1ª entrada em andamento, comparado ao p85 do cycle time",
                    entradas={"p85_cycle_dias": ref.cycle_dias},
                    resultado=aging,
                    unidade="dias",
                ),
            )
        )
    return out


# --------------------------------------------------------------------------- WIP


def wip_por_pessoa(tasks: Iterable[Task], limite: int) -> list[Wip]:
    por: dict[str, list[int]] = defaultdict(list)
    for t in tasks:
        if t.em_andamento and not t.tem_filhos and t.responsavel_id:
            por[t.responsavel_id].append(t.id)
    return [
        Wip(
            chave=pid,
            wip=len(ids),
            limite=limite,
            tasks=tuple(sorted(ids)),
            evidencia=Evidencia(
                metrica="wip_pessoa",
                formula="nº de tasks em andamento atribuídas à pessoa (medida de carga)",
                entradas={"limite_wip_pessoa": limite},
                resultado=len(ids),
                unidade="tasks",
            ),
        )
        for pid, ids in sorted(por.items())
    ]


def wip_por_coluna(
    tasks: Iterable[Task], colunas_atuais: dict[int, str | None], config: ConfigAnalise
) -> list[Wip]:
    limites = {chave_skill(c.coluna): c for c in config.colunas if c.limite_wip_coluna}
    por: dict[str, list[int]] = defaultdict(list)
    for t in tasks:
        col = colunas_atuais.get(t.id)
        if t.aberta and col and chave_skill(col) in limites:
            por[chave_skill(col)].append(t.id)
    out: list[Wip] = []
    for k, ids in sorted(por.items()):
        c = limites[k]
        lim = c.limite_wip_coluna or 0
        out.append(
            Wip(
                chave=c.coluna,
                wip=len(ids),
                limite=lim,
                tasks=tuple(sorted(ids)),
                evidencia=Evidencia(
                    metrica="wip_coluna",
                    formula="nº de itens abertos na coluna",
                    entradas={"coluna": c.coluna, "limite_wip_coluna": lim},
                    resultado=len(ids),
                    unidade="itens",
                ),
            )
        )
    return out
