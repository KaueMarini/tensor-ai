"""Invariantes do motor, testados com dados gerados (hypothesis)."""

from datetime import date, timedelta

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from fabrica import SEMANA_1, SEMANA_2, SEMANA_3, entrada, ferias, pessoa, task
from radar_analytics.domain.capacidade import distribuir, utilizacao_semanal
from radar_analytics.domain.pareto import Ocorrencia, pareto

BASE = date(2026, 10, 1)
datas = st.integers(min_value=0, max_value=60).map(lambda n: BASE + timedelta(days=n))
horas = st.floats(min_value=0, max_value=500, allow_nan=False, allow_infinity=False)


@given(
    h=horas,
    a=datas,
    duracao=st.integers(min_value=0, max_value=40),
    feriados=st.frozensets(datas, max_size=10),
    ausencias=st.lists(st.tuples(datas, st.integers(min_value=0, max_value=15)), max_size=3),
)
def test_soma_distribuida_igual_as_horas_da_task(
    h: float, a: date, duracao: int, feriados: frozenset[date], ausencias: list[tuple[date, int]]
) -> None:
    folgas = [ferias("p", ini, ini + timedelta(days=n)) for ini, n in ausencias]
    partes = distribuir(h, (a, a + timedelta(days=duracao)), feriados, folgas)
    assert partes
    assert sum(partes.values()) == pytest.approx(h, abs=1e-6)
    assert all(v >= 0 for v in partes.values())


@given(
    contagens=st.dictionaries(
        st.sampled_from(
            ["sla:Code Review", "bloqueado", "ausente", "sobrecarga", "sem_estimativa", "dependencia"]
        ),
        st.integers(min_value=1, max_value=30),
        min_size=1,
    )
)
def test_pareto_acumulado_termina_em_100(contagens: dict[str, int]) -> None:
    oc = [Ocorrencia(causa=c, rotulo=c, task_id=i) for c, n in contagens.items() for i in range(n)]
    p = pareto(oc)
    assert p.itens[-1].pct_acumulado == 100
    acum = [i.pct_acumulado for i in p.itens]
    assert acum == sorted(acum)
    assert p.itens[0].vital
    vitais = [i for i in p.itens if i.vital]
    assert sum(i.ocorrencias for i in vitais) / p.total >= 0.8
    # mínimo: sem a última vital, não chegaria a 80%
    assert sum(i.ocorrencias for i in vitais[:-1]) / p.total < 0.8


@settings(max_examples=60)
@given(
    tarefas=st.lists(
        st.tuples(horas, st.sampled_from(["s1", "s2", None]), st.booleans()),
        max_size=8,
    ),
    jornada=st.floats(min_value=0.5, max_value=12),
    foco=st.floats(min_value=0.05, max_value=1),
    ferias_ini=st.one_of(st.none(), datas),
)
def test_utilizacao_nunca_negativa(
    tarefas: list[tuple[float, str | None, bool]], jornada: float, foco: float, ferias_ini: date | None
) -> None:
    e = entrada(
        pessoas=(pessoa("p", jornada_dia=jornada, foco=foco),),
        folgas=() if ferias_ini is None else (ferias("p", ferias_ini, ferias_ini + timedelta(days=6)),),
        tasks=tuple(
            task(i, responsavel_id="p", horas_restantes=h if com_horas else None, sprint_id=s)
            for i, (h, s, com_horas) in enumerate(tarefas)
        ),
    )
    for c in utilizacao_semanal(e, [SEMANA_1, SEMANA_2, SEMANA_3]):
        assert c.capacidade_h >= 0
        assert c.carga_h >= 0
        assert c.utilizacao is None or c.utilizacao >= 0
