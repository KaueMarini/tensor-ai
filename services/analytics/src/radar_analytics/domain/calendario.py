"""Calendário de trabalho: dias úteis, folgas e horas úteis entre dois instantes. Puro."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Iterator
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from radar_analytics.domain.models import Expediente, Folga

FUSO = ZoneInfo("America/Sao_Paulo")
SABADO = 5


def dias(inicio: date, fim: date) -> Iterator[date]:
    d = inicio
    while d <= fim:
        yield d
        d += timedelta(days=1)


def fim_de_semana(d: date) -> bool:
    return d.weekday() >= SABADO


def dias_uteis(inicio: date, fim: date, excluir: Callable[[date], bool] = lambda _d: False) -> list[date]:
    """Segunda a sexta no intervalo (inclusivo), menos os dias em `excluir`."""
    return [d for d in dias(inicio, fim) if not fim_de_semana(d) and not excluir(d)]


def segunda_da_semana(d: date) -> date:
    return d - timedelta(days=d.weekday())


def semanas(inicio: date, quantidade: int) -> list[tuple[date, date]]:
    """`quantidade` semanas (segunda a domingo) a partir da semana de `inicio`."""
    seg = segunda_da_semana(inicio)
    return [(seg + timedelta(weeks=i), seg + timedelta(weeks=i, days=6)) for i in range(quantidade)]


def em(d: date, f: Folga) -> bool:
    return f.inicio <= d <= f.fim


def folga_pessoal(pessoa_id: str, folgas: Iterable[Folga]) -> Callable[[date], bool]:
    minhas = [f for f in folgas if f.pessoa_id == pessoa_id]
    return lambda d: any(em(d, f) for f in minhas)


EXPEDIENTE_PADRAO = Expediente()


def horas_uteis_entre(
    inicio: datetime,
    fim: datetime,
    feriados: frozenset[date],
    expediente: Expediente = EXPEDIENTE_PADRAO,
) -> float:
    """Horas dentro do expediente, em dias úteis sem feriado, entre dois instantes.

    Os instantes são convertidos para America/Sao_Paulo. fim <= inicio → 0.
    """
    ini = inicio.astimezone(FUSO)
    fi = fim.astimezone(FUSO)
    if fi <= ini:
        return 0.0
    total = 0.0
    for d in dias(ini.date(), fi.date()):
        if fim_de_semana(d) or d in feriados:
            continue
        abre = datetime.combine(d, expediente.inicio, tzinfo=FUSO)
        fecha = datetime.combine(d, expediente.fim, tzinfo=FUSO)
        a = max(abre, ini)
        b = min(fecha, fi)
        if b > a:
            total += (b - a).total_seconds() / 3600
    return total
