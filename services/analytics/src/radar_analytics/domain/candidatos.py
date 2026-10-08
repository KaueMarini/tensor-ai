"""Ações candidatas, geradas de forma determinística. O LLM só ESCOLHE uma delas.

Gatilhos:
  - semana com o responsável em sobrecarga  → tasks dele que pesam naquela semana
  - task cujo período cruza ausência do responsável
Ações (só Tasks; Features e Sprints nunca mudam):
  - reatribuir    para outra pessoa do time do projeto que, depois de receber a task, não
                  passa do limite de sobrecarga em nenhuma semana da janela
  - mover_sprint  para a próxima sprint datada do projeto
  - pausar        task de baixa prioridade (Priority ≥ 3 no DevOps) sai da sprint
Cada ação é simulada no motor de capacidade (antes × depois) e classificada em Esforço × Impacto.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable, Sequence
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

from radar_analytics import numeros
from radar_analytics.domain.capacidade import (
    CelulaSemana,
    ConflitoAusencia,
    EntradaCapacidade,
    conflitos_ausencia,
    horas_da_task,
    utilizacao_semanal,
)
from radar_analytics.domain.models import Evidencia, Pessoa, Sprint, Task
from radar_analytics.domain.priorizacao import Esforco, Impacto, Priorizacao, classificar
from radar_analytics.domain.skills import encaixe

TipoAcao = Literal["reatribuir", "mover_sprint", "pausar"]
Motivo = Literal["sobrecarga", "ausencia"]
PRIORIDADE_BAIXA = 3
TIPOS_EXCLUIDOS = frozenset({"Feature", "Epic"})


class _Base(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class EstadoPessoa(_Base):
    pessoa_id: str
    pico_pct: float | None
    semana_pct: float | None
    excesso_h: float


class AcaoCandidata(_Base):
    acao_id: str
    tipo: TipoAcao
    motivo: Motivo
    task_id: int
    projeto_id: str
    semana_inicio: date | None
    horas: float
    horas_origem: Literal["devops", "sistema"]
    de_pessoa_id: str
    para_pessoa_id: str | None = None
    para_sprint_id: str | None = None
    encaixe: float | None = None
    antes: tuple[EstadoPessoa, ...]
    depois: tuple[EstadoPessoa, ...]
    impacto: Impacto
    esforco: Esforco
    priorizacao: Priorizacao
    evidencia: Evidencia


def acao_id(tipo: str, task_id: int, alvo: str | None) -> str:
    return (
        "A-" + hashlib.sha1(f"{tipo}|{task_id}|{alvo or ''}".encode(), usedforsecurity=False).hexdigest()[:8]
    )


def _estado(
    pessoa_id: str, celulas: Sequence[CelulaSemana], semana: date | None, sobrecarga: float
) -> EstadoPessoa:
    minhas = [c for c in celulas if c.pessoa_id == pessoa_id]
    utils = [c.utilizacao for c in minhas if c.utilizacao is not None]
    na_semana = next((c for c in minhas if c.inicio == semana), None)
    excesso = sum(max(0.0, c.carga_h - c.capacidade_h * sobrecarga) for c in minhas)
    excesso += sum(c.carga_h for c in minhas if c.status == "sem-capacidade")
    return EstadoPessoa(
        pessoa_id=pessoa_id,
        pico_pct=numeros.pct(max(utils)) if utils else None,
        semana_pct=None
        if na_semana is None or na_semana.utilizacao is None
        else numeros.pct(na_semana.utilizacao),
        excesso_h=numeros.horas(excesso),
    )


def _proxima_sprint(task: Task, sprints: Sequence[Sprint]) -> Sprint | None:
    atual = next((s for s in sprints if s.id == task.sprint_id), None)
    if atual is None or atual.fim is None:
        return None
    seguintes = [
        s
        for s in sprints
        if s.projeto_id == task.projeto_id and s.inicio is not None and s.inicio > atual.fim
    ]
    return min(seguintes, key=lambda s: s.inicio or date.max, default=None)


def _com(e: EntradaCapacidade, nova: Task) -> EntradaCapacidade:
    return e.model_copy(update={"tasks": tuple(nova if t.id == nova.id else t for t in e.tasks)})


def gerar_candidatos(
    e: EntradaCapacidade,
    semanas: Sequence[tuple[date, date]],
    membros_projeto: dict[str, frozenset[str]],
    max_candidatos: int = 8,
    max_destinos_por_task: int = 2,
    projeto_id: str | None = None,
) -> list[AcaoCandidata]:
    pessoas = {p.id: p for p in e.pessoas}
    celulas = utilizacao_semanal(e, semanas)
    conflitos = {c.task_id: c for c in conflitos_ausencia(e)}
    alvos = _gatilhos(e, celulas, conflitos, projeto_id)

    out: dict[str, AcaoCandidata] = {}
    for task, motivo, semana in alvos:
        de = task.responsavel_id or ""
        opcoes: list[tuple[TipoAcao, Task, str | None, str | None]] = []
        destinos: list[tuple[float, float, str]] = []
        for pid in sorted(membros_projeto.get(task.projeto_id, frozenset()) - {de}):
            p = pessoas.get(pid)
            if p is None:
                continue
            fit = encaixe((*task.tags, *task.feature_tags), (*p.skills, *((p.funcao,) if p.funcao else ())))
            livre = sum(c.livre_h for c in celulas if c.pessoa_id == pid)
            destinos.append((-fit, -livre, pid))
        for _, _, pid in sorted(destinos)[: max_destinos_por_task * 2]:
            opcoes.append(("reatribuir", task.model_copy(update={"responsavel_id": pid}), pid, None))
        prox = _proxima_sprint(task, e.sprints)
        if prox is not None:
            movida = task.model_copy(update={"sprint_id": prox.id, "inicio": None, "fim": None})
            opcoes.append(("mover_sprint", movida, None, prox.id))
        if task.prioridade is not None and task.prioridade >= PRIORIDADE_BAIXA:
            opcoes.append(
                (
                    "pausar",
                    task.model_copy(update={"sprint_id": None, "inicio": None, "fim": None}),
                    None,
                    None,
                )
            )

        aceitas_reatribuir = 0
        for tipo, nova, para, sprint in opcoes:
            if tipo == "reatribuir" and aceitas_reatribuir >= max_destinos_por_task:
                continue
            cand = _avaliar(
                e, semanas, celulas, conflitos, task, nova, tipo, motivo, semana, para, sprint, pessoas
            )
            if cand is None:
                continue
            if tipo == "reatribuir":
                aceitas_reatribuir += 1
            out.setdefault(cand.acao_id, cand)

    ordenadas = sorted(
        out.values(),
        key=lambda c: (not c.priorizacao.quick_win, -c.priorizacao.impacto, c.priorizacao.esforco, c.acao_id),
    )
    return ordenadas[:max_candidatos]


def _gatilhos(
    e: EntradaCapacidade,
    celulas: Sequence[CelulaSemana],
    conflitos: dict[int, ConflitoAusencia],
    projeto_id: str | None,
) -> list[tuple[Task, Motivo, date | None]]:
    tasks = {
        t.id: t
        for t in e.tasks
        if t.tipo not in TIPOS_EXCLUIDOS and (projeto_id is None or t.projeto_id == projeto_id)
    }
    vistos: set[int] = set()
    out: list[tuple[Task, Motivo, date | None]] = []
    for tid in sorted(conflitos):
        if tid in tasks:
            out.append((tasks[tid], "ausencia", None))
            vistos.add(tid)
    for c in sorted(celulas, key=lambda c: (c.inicio, c.pessoa_id)):
        if c.status not in ("sobrecarga", "sem-capacidade"):
            continue
        for tid in c.tasks:
            t = tasks.get(tid)
            if t is None or tid in vistos or t.responsavel_id != c.pessoa_id:
                continue
            vistos.add(tid)
            out.append((t, "sobrecarga", c.inicio))
    return out


def _avaliar(
    e: EntradaCapacidade,
    semanas: Sequence[tuple[date, date]],
    celulas_antes: Sequence[CelulaSemana],
    conflitos_antes: dict[int, ConflitoAusencia],
    task: Task,
    nova: Task,
    tipo: TipoAcao,
    motivo: Motivo,
    semana: date | None,
    para: str | None,
    para_sprint: str | None,
    pessoas: dict[str, Pessoa],
) -> AcaoCandidata | None:
    de = task.responsavel_id or ""
    envolvidos = [de] + ([para] if para else [])
    depois_e = _com(e, nova)
    sub = depois_e.model_copy(update={"pessoas": tuple(pessoas[p] for p in envolvidos if p in pessoas)})
    celulas_depois = utilizacao_semanal(sub, semanas)
    if para and any(
        c.status in ("sobrecarga", "sem-capacidade") for c in celulas_depois if c.pessoa_id == para
    ):
        return None  # não resolve um problema criando outro

    lim = e.regras.sobrecarga
    antes = tuple(_estado(p, celulas_antes, semana, lim) for p in envolvidos)
    depois = tuple(_estado(p, celulas_depois, semana, lim) for p in envolvidos)
    pico_antes = max((s.pico_pct or 0.0) for s in antes)
    pico_depois = max((s.pico_pct or 0.0) for s in depois)

    conflito_resolvido = task.id in conflitos_antes and not any(
        c.task_id == task.id for c in conflitos_ausencia(sub)
    )
    if tipo == "mover_sprint" and motivo == "ausencia" and not conflito_resolvido:
        return None
    horas = horas_da_task(task, e.config)
    horas_atraso = sum(s.excesso_h for s in antes) - sum(s.excesso_h for s in depois)
    if conflito_resolvido:
        horas_atraso += horas.horas
    if horas_atraso <= 0 and pico_depois >= pico_antes and not conflito_resolvido:
        return None  # não melhora nada

    fit = None
    if para:
        p = pessoas[para]
        fit = encaixe((*task.tags, *task.feature_tags), (*p.skills, *((p.funcao,) if p.funcao else ())))
    impacto = Impacto(
        reducao_pico_pp=numeros.horas(max(0.0, pico_antes - pico_depois)),
        horas_atraso_destravadas=numeros.horas(max(0.0, horas_atraso)),
        itens_desbloqueados=1 if conflito_resolvido else 0,
    )
    esforco = Esforco(
        horas_movidas=numeros.horas(horas.horas),
        reatribuicoes=1 if tipo == "reatribuir" else 0,
        penalidade_skill=numeros.indice(1 - fit) if fit is not None else 0.0,
    )
    prior = classificar(impacto, esforco)
    aid = acao_id(tipo, task.id, para or para_sprint)
    return AcaoCandidata(
        acao_id=aid,
        tipo=tipo,
        motivo=motivo,
        task_id=task.id,
        projeto_id=task.projeto_id,
        semana_inicio=semana,
        horas=numeros.horas(horas.horas),
        horas_origem=horas.origem,
        de_pessoa_id=de,
        para_pessoa_id=para,
        para_sprint_id=para_sprint,
        encaixe=None if fit is None else numeros.indice(fit),
        antes=antes,
        depois=depois,
        impacto=impacto,
        esforco=esforco,
        priorizacao=prior,
        evidencia=Evidencia(
            metrica="simulacao_acao",
            formula="motor de capacidade recalculado com a task alterada; pico = maior utilização semanal",
            entradas={
                "pico_antes_pct": pico_antes,
                "pico_depois_pct": pico_depois,
                "horas_task": numeros.horas(horas.horas),
                "conflito_ausencia_resolvido": conflito_resolvido,
            },
            resultado=numeros.horas(pico_antes - pico_depois),
            unidade="p.p.",
        ),
    )


def ids_validos(candidatos: Iterable[AcaoCandidata]) -> frozenset[str]:
    return frozenset(c.acao_id for c in candidatos)
