from fabrica import SEMANA_1, d, entrada, ferias, pessoa, task
from radar_analytics.domain.capacidade import conflitos_ausencia, utilizacao_semanal
from radar_analytics.domain.fluxo import EsperaColuna
from radar_analytics.domain.models import ConfigAnalise, Evidencia
from radar_analytics.domain.pareto import Ocorrencia, causas_de_atraso, pareto
from radar_analytics.domain.priorizacao import Esforco, Impacto, classificar

EV = Evidencia(metrica="x", formula="x", entradas={}, resultado=0)


def _oc(causa: str, *ids: int) -> list[Ocorrencia]:
    return [Ocorrencia(causa=causa, rotulo=causa.upper(), task_id=i) for i in ids]


def test_pareto_ordena_acumula_e_marca_vitais() -> None:
    oc = [*_oc("a", 1, 2, 3, 4, 5), *_oc("b", 1, 2, 3), *_oc("c", 7), *_oc("d", 8), *_oc("a", 1)]
    p = pareto(oc)
    assert p.total == 10
    assert [i.causa for i in p.itens] == ["a", "b", "c", "d"]
    assert [i.pct_acumulado for i in p.itens] == [50, 80, 90, 100]
    assert [i.vital for i in p.itens] == [True, True, False, False]
    assert p.evidencia.resultado == 2


def test_pareto_empate_ordena_por_nome_e_vazio() -> None:
    p = pareto([*_oc("z", 1), *_oc("m", 2)])
    assert [i.causa for i in p.itens] == ["m", "z"]
    assert pareto([]).itens == ()


def test_causas_de_atraso_cobre_todas_as_categorias() -> None:
    e = entrada(
        pessoas=(pessoa("ana"), pessoa("bia")),
        folgas=(ferias("bia", d(5), d(6)),),
        tasks=(
            task(1, responsavel_id="ana", horas_restantes=60, inicio=d(5), fim=d(9)),
            task(2, responsavel_id="ana", horas_restantes=1, tags=("Bloqueado",)),
            task(3, responsavel_id="bia", horas_restantes=1),
            task(4, responsavel_id="bia"),
            task(5, responsavel_id="bia", horas_restantes=1, depende_de=(6, 7)),
            task(6, horas_restantes=1),
            task(7, horas_restantes=1, estado="Closed"),
            task(8, horas_restantes=1, bloqueado=True, estado="Closed"),
        ),
    )
    celulas = utilizacao_semanal(e, [SEMANA_1])
    esperas = [
        EsperaColuna(
            task_id=2,
            coluna="Code Review",
            horas_uteis=30,
            passagens=1,
            sla_horas_uteis=24,
            excesso_horas=6,
            em_curso=True,
            evidencia=EV,
        ),
        EsperaColuna(
            task_id=7,
            coluna="Code Review",
            horas_uteis=30,
            passagens=1,
            sla_horas_uteis=24,
            excesso_horas=6,
            em_curso=False,
            evidencia=EV,
        ),
    ]
    oc = causas_de_atraso(e.tasks, esperas, conflitos_ausencia(e), celulas, ConfigAnalise(), 100)
    por = {(o.causa, o.task_id) for o in oc}
    assert ("sla:Code Review", 2) in por
    assert ("sla:Code Review", 7) not in por  # fechada não atrasa mais
    assert ("bloqueado", 2) in por
    assert ("bloqueado", 8) not in por
    assert ("sobrecarga", 1) in por
    assert {("ausente", 3), ("ausente", 4), ("ausente", 5)} <= por
    assert ("sem_estimativa", 4) in por
    assert ("dependencia", 5) in por
    rotulo = next(o.rotulo for o in oc if o.causa == "sobrecarga")
    assert rotulo == "Responsável acima de 100%"


def test_quadrantes() -> None:
    qw = classificar(Impacto(reducao_pico_pp=40), Esforco(horas_movidas=8, reatribuicoes=1))
    assert (qw.quadrante, qw.quick_win) == ("quick_win", True)
    grande = classificar(Impacto(reducao_pico_pp=40), Esforco(horas_movidas=40, reatribuicoes=2))
    assert grande.quadrante == "grande_aposta"
    pouco = classificar(Impacto(reducao_pico_pp=2), Esforco(horas_movidas=2))
    assert pouco.quadrante == "preenchimento"
    ruim = classificar(Impacto(), Esforco(horas_movidas=40, reatribuicoes=2, penalidade_skill=1))
    assert ruim.quadrante == "evitar"
    assert ruim.evidencia.entradas["esforco_score"] == 1.0


def test_falta_de_skill_pesa_no_esforco() -> None:
    com = classificar(Impacto(reducao_pico_pp=40), Esforco(horas_movidas=14, reatribuicoes=1))
    sem = classificar(
        Impacto(reducao_pico_pp=40), Esforco(horas_movidas=14, reatribuicoes=1, penalidade_skill=1)
    )
    assert com.quick_win
    assert not sem.quick_win
