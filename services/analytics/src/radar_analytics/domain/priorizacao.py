from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

from radar_analytics import numeros
from radar_analytics.domain.models import Evidencia

Quadrante = Literal["quick_win", "grande_aposta", "preenchimento", "evitar"]

PESOS_IMPACTO = {"reducao_pico_pp": 0.5, "horas_atraso_destravadas": 0.3, "itens_desbloqueados": 0.2}
REF_IMPACTO = {"reducao_pico_pp": 20.0, "horas_atraso_destravadas": 16.0, "itens_desbloqueados": 2.0}
PESOS_ESFORCO = {"horas_movidas": 0.5, "reatribuicoes": 0.3, "penalidade_skill": 0.2}
REF_ESFORCO = {"horas_movidas": 24.0, "reatribuicoes": 2.0, "penalidade_skill": 1.0}
CORTE = 0.5


class _Base(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Impacto(_Base):
    reducao_pico_pp: float = 0.0
    horas_atraso_destravadas: float = 0.0
    itens_desbloqueados: int = 0


class Esforco(_Base):
    horas_movidas: float = 0.0
    reatribuicoes: int = 0
    penalidade_skill: float = 0.0


class Priorizacao(_Base):
    impacto: float
    esforco: float
    quadrante: Quadrante
    quick_win: bool
    evidencia: Evidencia


def _score(valores: dict[str, float], pesos: dict[str, float], refs: dict[str, float]) -> float:
    return sum(p * min(1.0, max(0.0, valores[k]) / refs[k]) for k, p in pesos.items())


def classificar(impacto: Impacto, esforco: Esforco) -> Priorizacao:
    vi = {k: float(v) for k, v in impacto.model_dump().items()}
    ve = {k: float(v) for k, v in esforco.model_dump().items()}
    si = numeros.indice(_score(vi, PESOS_IMPACTO, REF_IMPACTO))
    se = numeros.indice(_score(ve, PESOS_ESFORCO, REF_ESFORCO))
    alto_i, alto_e = si >= CORTE, se >= CORTE
    quadrante: Quadrante = (
        "quick_win"
        if alto_i and not alto_e
        else "grande_aposta"
        if alto_i
        else "preenchimento"
        if not alto_e
        else "evitar"
    )
    return Priorizacao(
        impacto=si,
        esforco=se,
        quadrante=quadrante,
        quick_win=quadrante == "quick_win",
        evidencia=Evidencia(
            metrica="esforco_impacto",
            formula="média ponderada de min(1, x/ref); alto ≥ 0,5; quick win = impacto alto e esforço baixo",
            entradas={
                **{f"impacto.{k}": numeros.horas(v) for k, v in vi.items()},
                **{f"esforco.{k}": numeros.indice(v) for k, v in ve.items()},
                "impacto_score": si,
                "esforco_score": se,
            },
            resultado=quadrante,
        ),
    )
