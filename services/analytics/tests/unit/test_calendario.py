from datetime import UTC, datetime

from fabrica import d, dt
from radar_analytics.domain.calendario import dias_uteis, horas_uteis_entre, semanas
from radar_analytics.domain.models import Expediente


def test_dias_uteis_pula_fim_de_semana_e_excluidos() -> None:
    feriado = d(12)
    uteis = dias_uteis(d(9), d(13), lambda x: x == feriado)
    assert uteis == [d(9), d(13)]


def test_semanas_comecam_na_segunda() -> None:
    assert semanas(d(8), 2) == [(d(5), d(11)), (d(12), d(18))]


def test_horas_uteis_no_mesmo_dia() -> None:
    assert horas_uteis_entre(dt(5, 10), dt(5, 15), frozenset()) == 5


def test_horas_uteis_atravessando_fim_de_semana() -> None:
    assert horas_uteis_entre(dt(9, 16), dt(12, 11), frozenset()) == 4


def test_horas_uteis_com_feriado_no_meio() -> None:
    assert horas_uteis_entre(dt(6, 9), dt(8, 9), frozenset({d(7)})) == 9


def test_horas_uteis_fora_do_expediente_e_invertido() -> None:
    assert horas_uteis_entre(dt(5, 19), dt(5, 23), frozenset()) == 0
    assert horas_uteis_entre(dt(6), dt(5), frozenset()) == 0


def test_horas_uteis_converte_fuso() -> None:
    ini = datetime(2026, 10, 5, 12, tzinfo=UTC)
    fim = datetime(2026, 10, 5, 15, tzinfo=UTC)
    assert horas_uteis_entre(ini, fim, frozenset(), Expediente()) == 3
