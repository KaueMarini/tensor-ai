from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from radar_analytics import numeros
from radar_analytics.domain.calendario import semanas as semanas_de
from radar_analytics.domain.candidatos import AcaoCandidata, gerar_candidatos
from radar_analytics.domain.capacidade import (
    CelulaSemana,
    EntradaCapacidade,
    conflitos_ausencia,
    evidencia_utilizacao,
    utilizacao_semanal,
)
from radar_analytics.domain.fluxo import (
    Referencia,
    aging_acima,
    coluna_atual,
    por_item,
    referencia,
    tempo_em_espera,
    tempos,
    wip_por_coluna,
    wip_por_pessoa,
)
from radar_analytics.domain.models import Evidencia, Transicao
from radar_analytics.domain.pareto import Pareto, causas_de_atraso, pareto

TipoAlerta = Literal["sobrecarga", "sem_capacidade", "ausencia", "sla", "wip_pessoa", "wip_coluna", "aging"]
GRAVIDADE: dict[TipoAlerta, int] = {
    "sobrecarga": 3,
    "sem_capacidade": 3,
    "ausencia": 3,
    "sla": 2,
    "aging": 2,
    "wip_pessoa": 1,
    "wip_coluna": 1,
}


class _Base(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Alerta(_Base):
    tipo: TipoAlerta
    gravidade: int
    pessoa_id: str | None = None
    task_id: int | None = None
    semana_inicio: date | None = None
    coluna: str | None = None
    evidencia: Evidencia


class Analise(_Base):
    projeto_id: str
    hoje: date
    semanas: tuple[tuple[date, date], ...]
    celulas: tuple[CelulaSemana, ...]
    alertas: tuple[Alerta, ...]
    referencia: Referencia
    pareto: Pareto
    candidatos: tuple[AcaoCandidata, ...]


class Snapshot(_Base):
    projeto_id: str
    capacidade: EntradaCapacidade
    transicoes: tuple[Transicao, ...] = ()
    membros_projeto: dict[str, frozenset[str]] = {}


def analisar(s: Snapshot, hoje: date, agora: datetime, n_semanas: int = 4) -> Analise:
    e = s.capacidade
    janela = semanas_de(hoje, n_semanas)
    membros = s.membros_projeto.get(s.projeto_id, frozenset())
    tasks_projeto = [t for t in e.tasks if t.projeto_id == s.projeto_id]
    do_projeto = membros | {t.responsavel_id for t in tasks_projeto if t.responsavel_id}

    celulas = [c for c in utilizacao_semanal(e, janela) if c.pessoa_id in do_projeto]
    conflitos = [c for c in conflitos_ausencia(e) if any(t.id == c.task_id for t in tasks_projeto)]
    historico = por_item(s.transicoes)
    esperas = [
        x
        for t in tasks_projeto
        for x in tempo_em_espera(t, historico.get(t.id, []), e.config, e.feriados, agora)
    ]
    medidos = [tempos(t, historico.get(t.id, []), agora) for t in tasks_projeto]
    ref = referencia(medidos, e.config)
    colunas = {t.id: coluna_atual(historico.get(t.id, []), t.estado) for t in tasks_projeto}

    alertas: list[Alerta] = []
    for c in celulas:
        if c.status in ("sobrecarga", "sem-capacidade"):
            tipo: TipoAlerta = "sobrecarga" if c.status == "sobrecarga" else "sem_capacidade"
            alertas.append(
                Alerta(
                    tipo=tipo,
                    gravidade=GRAVIDADE[tipo],
                    pessoa_id=c.pessoa_id,
                    semana_inicio=c.inicio,
                    evidencia=evidencia_utilizacao(c, e.regras),
                )
            )
    for cf in conflitos:
        alertas.append(
            Alerta(
                tipo="ausencia",
                gravidade=GRAVIDADE["ausencia"],
                pessoa_id=cf.pessoa_id,
                task_id=cf.task_id,
                evidencia=cf.evidencia,
            )
        )
    for es in esperas:
        if es.excesso_horas > 0 and es.em_curso:
            alertas.append(
                Alerta(
                    tipo="sla",
                    gravidade=GRAVIDADE["sla"],
                    task_id=es.task_id,
                    coluna=es.coluna,
                    evidencia=es.evidencia,
                )
            )
    for ag in aging_acima(medidos, ref):
        alertas.append(
            Alerta(tipo="aging", gravidade=GRAVIDADE["aging"], task_id=ag.task_id, evidencia=ag.evidencia)
        )
    for w in wip_por_pessoa(tasks_projeto, e.config.limite_wip_pessoa):
        if w.acima:
            alertas.append(
                Alerta(
                    tipo="wip_pessoa",
                    gravidade=GRAVIDADE["wip_pessoa"],
                    pessoa_id=w.chave,
                    evidencia=w.evidencia,
                )
            )
    for w in wip_por_coluna(tasks_projeto, colunas, e.config):
        if w.acima:
            alertas.append(
                Alerta(
                    tipo="wip_coluna",
                    gravidade=GRAVIDADE["wip_coluna"],
                    coluna=w.chave,
                    evidencia=w.evidencia,
                )
            )
    alertas.sort(
        key=lambda a: (-a.gravidade, a.tipo, str(a.semana_inicio), a.pessoa_id or "", a.task_id or 0)
    )

    ocorrencias = causas_de_atraso(
        tasks_projeto, esperas, conflitos, celulas, e.config, numeros.pct(e.regras.sobrecarga)
    )
    candidatos = gerar_candidatos(e, janela, s.membros_projeto, projeto_id=s.projeto_id)
    return Analise(
        projeto_id=s.projeto_id,
        hoje=hoje,
        semanas=tuple(janela),
        celulas=tuple(celulas),
        alertas=tuple(alertas),
        referencia=ref,
        pareto=pareto(ocorrencias),
        candidatos=tuple(candidatos),
    )
