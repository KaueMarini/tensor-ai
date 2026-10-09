from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

CASAS_HORAS = 1
CASAS_PERCENTUAL = 0
CASAS_INDICE = 2

TOLERANCIA_HORAS = 0.1
TOLERANCIA_PERCENTUAL = 1.0


def arredondar(valor: float, casas: int) -> float:
    q = Decimal(1).scaleb(-casas)
    return float(Decimal(str(round(valor, 9))).quantize(q, rounding=ROUND_HALF_UP))


def horas(valor: float) -> float:
    return arredondar(valor, CASAS_HORAS)


def pct(fracao: float) -> float:
    return arredondar(fracao * 100, CASAS_PERCENTUAL)


def indice(valor: float) -> float:
    return arredondar(valor, CASAS_INDICE)
