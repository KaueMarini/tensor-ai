"""Arredondamento: o ÚNICO lugar que define casas decimais e tolerâncias.

Domínio calcula em float; tudo que sai para evidência, texto ou banco passa por aqui. O validador
anti-alucinação usa as mesmas tolerâncias para conferir números citados pelo LLM.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

CASAS_HORAS = 1
CASAS_PERCENTUAL = 0
CASAS_INDICE = 2

# Diferença máxima aceita entre um número no texto e o valor da evidência
TOLERANCIA_HORAS = 0.1
TOLERANCIA_PERCENTUAL = 1.0


def arredondar(valor: float, casas: int) -> float:
    q = Decimal(1).scaleb(-casas)
    # round(…, 9) absorve o ruído de ponto flutuante (8.649999… vira 8.65 antes do meio-para-cima)
    return float(Decimal(str(round(valor, 9))).quantize(q, rounding=ROUND_HALF_UP))


def horas(valor: float) -> float:
    return arredondar(valor, CASAS_HORAS)


def pct(fracao: float) -> float:
    """Fração (1.17) → percentual arredondado (117.0)."""
    return arredondar(fracao * 100, CASAS_PERCENTUAL)


def indice(valor: float) -> float:
    return arredondar(valor, CASAS_INDICE)
