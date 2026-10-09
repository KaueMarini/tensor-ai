from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable, Sequence
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

from radar_analytics import numeros
from radar_analytics.domain.calendario import dias_uteis, em, folga_pessoal
from radar_analytics.domain.models import (
    PADRAO_MERCADO,
    Alocacao,
    CapacidadeTime,
    ConfigAnalise,
    Evidencia,
    Folga,
    Pessoa,
    RegrasGerais,
    Sprint,
    Task,
)
from radar_analytics.domain.skills import chave_skill

StatusCarga = Literal["ok", "limite", "sobrecarga", "sem-capacidade"]
OrigemHoras = Literal["devops", "sistema"]
OrigemCapacidade = Literal["gestor", "devops", "padrao"]


class _Base(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class EntradaCapacidade(_Base):
    pessoas: tuple[Pessoa, ...]
    sprints: tuple[Sprint, ...]
    capacidades: tuple[CapacidadeTime, ...] = ()
    alocacoes: tuple[Alocacao, ...] = ()
    folgas: tuple[Folga, ...] = ()
    feriados: frozenset[date] = frozenset()
    tasks: tuple[Task, ...] = ()
    regras: RegrasGerais = PADRAO_MERCADO
    config: ConfigAnalise = ConfigAnalise()


class HorasTask(_Base):
    horas: float
    origem: OrigemHoras


class CelulaSemana(_Base):
    pessoa_id: str
    inicio: date
    fim: date
    dias_uteis: int
    capacidade_h: float
    carga_h: float
    carga_sistema_h: float
    livre_h: float
    utilizacao: float | None
    status: StatusCarga
    origem_capacidade: OrigemCapacidade
    tasks: tuple[int, ...]
    por_projeto: dict[str, float]


def horas_produtivas(regras: RegrasGerais, pessoa: Pessoa) -> float:
    jornada = pessoa.jornada_dia if pessoa.jornada_dia is not None else regras.jornada_dia
    foco = pessoa.foco if pessoa.foco is not None else regras.foco
    return max(0.0, jornada * foco)


def status_de(carga_h: float, capacidade_h: float, regras: RegrasGerais) -> tuple[float | None, StatusCarga]:
    if capacidade_h <= 0:
        return None, ("sem-capacidade" if carga_h > 0 else "ok")
    u = carga_h / capacidade_h
    r = round(u, 6)
    status: StatusCarga = "sobrecarga" if r > regras.sobrecarga else "limite" if r > regras.atencao else "ok"
    return u, status


def horas_da_task(task: Task, config: ConfigAnalise) -> HorasTask:
    r, e, c = task.horas_restantes, task.horas_estimadas, task.horas_concluidas
    valor: float | None
    if config.campo_horas_carga == "restante":
        valor = r if r is not None else (e - (c or 0)) if e is not None else None
    elif config.campo_horas_carga == "estimada_menos_concluida":
        valor = (e - (c or 0)) if e is not None else None
    else:
        valor = e
    if valor is not None:
        return HorasTask(horas=max(0.0, valor), origem="devops")
    por_tag = {chave_skill(k): v for k, v in config.horas_fallback_por_tag.items()}
    candidatos = [por_tag[chave_skill(t)] for t in task.tags if chave_skill(t) in por_tag]
    return HorasTask(horas=max(candidatos) if candidatos else config.horas_fallback_padrao, origem="sistema")


def pesa_na_carga(task: Task) -> bool:
    return task.aberta and not task.tem_filhos and task.responsavel_id is not None


def periodo_da_task(task: Task, sprints: dict[str, Sprint]) -> tuple[date, date] | None:
    if task.inicio is not None and task.fim is not None and task.inicio <= task.fim:
        return task.inicio, task.fim
    s = sprints.get(task.sprint_id or "")
    if s is None or s.inicio is None or s.fim is None:
        return None
    return s.inicio, s.fim


def distribuir(
    horas: float,
    periodo: tuple[date, date],
    feriados: frozenset[date],
    ausente: Iterable[Folga] = (),
) -> dict[date, float]:
    folgas = list(ausente)
    ini, fim = periodo
    dias = dias_uteis(ini, fim, lambda d: d in feriados or any(em(d, f) for f in folgas))
    if not dias:
        dias = dias_uteis(ini, fim, lambda d: d in feriados)
    if not dias:
        dias = dias_uteis(ini, fim) or [fim]
    parte = horas / len(dias)
    return dict.fromkeys(dias, parte)


class _Contexto:
    def __init__(self, e: EntradaCapacidade) -> None:
        self.e = e
        self.sprints = {s.id: s for s in e.sprints}
        self.datadas = [s for s in e.sprints if s.inicio is not None and s.fim is not None]
        self.caps: dict[str, list[CapacidadeTime]] = defaultdict(list)
        for c in e.capacidades:
            self.caps[c.pessoa_id].append(c)
        self.aloc: dict[str, list[Alocacao]] = defaultdict(list)
        for a in e.alocacoes:
            self.aloc[a.pessoa_id].append(a)
        self.folgas_time = [f for f in e.folgas if f.pessoa_id is None]

    def projetos_no_dia(self, d: date) -> set[str]:
        return {
            s.projeto_id
            for s in self.datadas
            if s.inicio is not None and s.fim is not None and s.inicio <= d <= s.fim
        }

    def capacidade_dia(self, pessoa: Pessoa, d: date, teto: float) -> tuple[float, OrigemCapacidade]:
        por_projeto: dict[str, float] = {}
        origem: OrigemCapacidade = "padrao"
        for c in self.caps.get(pessoa.id, []):
            s = self.sprints.get(c.sprint_id)
            if s is None or s.inicio is None or s.fim is None or not s.inicio <= d <= s.fim:
                continue
            folga = any(
                f.time_id == c.time_id and (f.sprint_id in (None, c.sprint_id)) and em(d, f)
                for f in self.folgas_time
            )
            por_projeto[s.projeto_id] = por_projeto.get(s.projeto_id, 0.0) + (
                0.0 if folga else c.capacidade_dia
            )
            origem = "devops"
        ativos = self.projetos_no_dia(d)
        for a in self.aloc.get(pessoa.id, []):
            if a.projeto_id in ativos:
                por_projeto[a.projeto_id] = a.horas_dia
                origem = "gestor"
        if not por_projeto:
            return teto, "gestor" if pessoa.jornada_dia is not None or pessoa.foco is not None else "padrao"
        return max(0.0, min(sum(por_projeto.values()), teto)), origem


def carga_por_dia(e: EntradaCapacidade) -> dict[str, dict[date, list[tuple[int, str, float, OrigemHoras]]]]:
    ctx = _Contexto(e)
    out: dict[str, dict[date, list[tuple[int, str, float, OrigemHoras]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for t in e.tasks:
        if not pesa_na_carga(t):
            continue
        periodo = periodo_da_task(t, ctx.sprints)
        if periodo is None:
            continue
        h = horas_da_task(t, e.config)
        pid = t.responsavel_id or ""
        minhas = [f for f in e.folgas if f.pessoa_id == pid]
        for d, parte in distribuir(h.horas, periodo, e.feriados, minhas).items():
            out[pid][d].append((t.id, t.projeto_id, parte, h.origem))
    return out


def utilizacao_semanal(e: EntradaCapacidade, semanas: Sequence[tuple[date, date]]) -> list[CelulaSemana]:
    ctx = _Contexto(e)
    carga = carga_por_dia(e)
    celulas: list[CelulaSemana] = []
    for p in e.pessoas:
        teto = horas_produtivas(e.regras, p)
        indisponivel = _indisponivel(p.id, e)
        minha_carga = carga.get(p.id, {})
        for ini, fim in semanas:
            cap = 0.0
            uteis = 0
            origens: set[OrigemCapacidade] = set()
            for d in dias_uteis(ini, fim, indisponivel):
                uteis += 1
                h, o = ctx.capacidade_dia(p, d, teto)
                cap += h
                origens.add(o)
            carga_h = 0.0
            sistema_h = 0.0
            tasks: set[int] = set()
            por_projeto: dict[str, float] = defaultdict(float)
            for d, partes in minha_carga.items():
                if not ini <= d <= fim:
                    continue
                for tid, proj, h, origem_h in partes:
                    carga_h += h
                    por_projeto[proj] += h
                    tasks.add(tid)
                    if origem_h == "sistema":
                        sistema_h += h
            cap_r, carga_r = numeros.horas(cap), numeros.horas(carga_h)
            utilizacao, status = status_de(carga_r, cap_r, e.regras)
            origem: OrigemCapacidade = (
                "gestor" if "gestor" in origens else "devops" if "devops" in origens else "padrao"
            )
            celulas.append(
                CelulaSemana(
                    pessoa_id=p.id,
                    inicio=ini,
                    fim=fim,
                    dias_uteis=uteis,
                    capacidade_h=cap_r,
                    carga_h=carga_r,
                    carga_sistema_h=numeros.horas(sistema_h),
                    livre_h=numeros.horas(cap_r - carga_r),
                    utilizacao=utilizacao,
                    status=status,
                    origem_capacidade=origem,
                    tasks=tuple(sorted(tasks)),
                    por_projeto={k: numeros.horas(v) for k, v in sorted(por_projeto.items())},
                )
            )
    return celulas


def evidencia_utilizacao(c: CelulaSemana, regras: RegrasGerais) -> Evidencia:
    return Evidencia(
        metrica="utilizacao_semanal",
        formula="carga_h / capacidade_h; capacidade = Σ dias úteis (sem feriado/ausência) × "
        "min(Σ alocação|Capacity por projeto, jornada × foco)",
        entradas={
            "semana_inicio": c.inicio.isoformat(),
            "dias_uteis": c.dias_uteis,
            "capacidade_h": c.capacidade_h,
            "carga_h": c.carga_h,
            "carga_estimativa_sistema_h": c.carga_sistema_h,
            "limite_sobrecarga_pct": numeros.pct(regras.sobrecarga),
            "limite_atencao_pct": numeros.pct(regras.atencao),
        },
        resultado=None if c.utilizacao is None else numeros.pct(c.utilizacao),
        unidade="%",
    )


class ConflitoAusencia(_Base):
    task_id: int
    pessoa_id: str
    dias_ausente: tuple[date, ...]
    horas: float
    origem_horas: OrigemHoras
    evidencia: Evidencia


def conflitos_ausencia(e: EntradaCapacidade) -> list[ConflitoAusencia]:
    sprints = {s.id: s for s in e.sprints}
    out: list[ConflitoAusencia] = []
    for t in e.tasks:
        if not pesa_na_carga(t):
            continue
        periodo = periodo_da_task(t, sprints)
        if periodo is None:
            continue
        pid = t.responsavel_id or ""
        ausente = folga_pessoal(pid, e.folgas)
        dias = dias_uteis(*periodo, lambda d: d in e.feriados)
        fora = tuple(d for d in dias if ausente(d))
        if not fora:
            continue
        h = horas_da_task(t, e.config)
        out.append(
            ConflitoAusencia(
                task_id=t.id,
                pessoa_id=pid,
                dias_ausente=fora,
                horas=numeros.horas(h.horas),
                origem_horas=h.origem,
                evidencia=Evidencia(
                    metrica="conflito_ausencia",
                    formula="dias úteis do período da task ∩ ausências do responsável",
                    entradas={
                        "periodo_inicio": periodo[0].isoformat(),
                        "periodo_fim": periodo[1].isoformat(),
                        "dias_uteis_periodo": len(dias),
                        "horas_task": numeros.horas(h.horas),
                    },
                    resultado=len(fora),
                    unidade="dias",
                ),
            )
        )
    return out


def _indisponivel(pessoa_id: str, e: EntradaCapacidade) -> Callable[[date], bool]:
    ausente = folga_pessoal(pessoa_id, e.folgas)
    return lambda d: d in e.feriados or ausente(d)
