import pytest

from fabrica import SEMANA_1, SEMANA_2, SEMANA_3, cap, d, entrada, ferias, pessoa, sprint, task
from radar_analytics.domain.capacidade import (
    conflitos_ausencia,
    distribuir,
    evidencia_utilizacao,
    horas_da_task,
    horas_produtivas,
    periodo_da_task,
    status_de,
    utilizacao_semanal,
)
from radar_analytics.domain.models import (
    PADRAO_MERCADO,
    Alocacao,
    ConfigAnalise,
    Folga,
    RegrasGerais,
)

ANA = pessoa("ana")


def _celula(e, semana, pid="ana"):
    return next(c for c in utilizacao_semanal(e, [semana]) if c.pessoa_id == pid)


def test_horas_produtivas_cascata() -> None:
    assert horas_produtivas(PADRAO_MERCADO, ANA) == 6
    assert horas_produtivas(PADRAO_MERCADO, pessoa("x", jornada_dia=8, foco=1)) == 8
    assert horas_produtivas(PADRAO_MERCADO, pessoa("x", foco=0.5)) == 4


def test_status_de_limites() -> None:
    assert status_de(0, 0, PADRAO_MERCADO) == (None, "ok")
    assert status_de(1, 0, PADRAO_MERCADO) == (None, "sem-capacidade")
    assert status_de(24, 30, PADRAO_MERCADO)[1] == "ok"
    assert status_de(25, 30, PADRAO_MERCADO)[1] == "limite"
    assert status_de(30, 30, PADRAO_MERCADO)[1] == "limite"
    assert status_de(31, 30, PADRAO_MERCADO)[1] == "sobrecarga"


def test_horas_da_task_modos() -> None:
    t = task(1, horas_restantes=3, horas_estimadas=10, horas_concluidas=4)
    assert horas_da_task(t, ConfigAnalise()).horas == 3
    assert horas_da_task(t, ConfigAnalise(campo_horas_carga="estimada_menos_concluida")).horas == 6
    assert horas_da_task(t, ConfigAnalise(campo_horas_carga="estimada")).horas == 10
    sem_restante = task(2, horas_estimadas=10, horas_concluidas=12)
    assert horas_da_task(sem_restante, ConfigAnalise()).horas == 0


def test_task_sem_estimativa_usa_fallback_do_sistema() -> None:
    t = task(1, tags=("Bug",))
    h = horas_da_task(t, ConfigAnalise())
    assert (h.horas, h.origem) == (4, "sistema")
    h2 = horas_da_task(t, ConfigAnalise(horas_fallback_por_tag={"bug": 2, "spike": 8}))
    assert (h2.horas, h2.origem) == (2, "sistema")
    for modo in ("estimada_menos_concluida", "estimada"):
        assert horas_da_task(t, ConfigAnalise(campo_horas_carga=modo)).origem == "sistema"


def test_task_sem_estimativa_aparece_como_carga_do_sistema() -> None:
    e = entrada(pessoas=(ANA,), tasks=(task(1, responsavel_id="ana"),))
    c = _celula(e, SEMANA_1)
    assert c.carga_h == 2
    assert c.carga_sistema_h == 2


def test_periodo_vem_da_task_ou_da_sprint() -> None:
    sprints = {"s1": sprint("s1", d(5), d(16))}
    assert periodo_da_task(task(1), sprints) == (d(5), d(16))
    assert periodo_da_task(task(1, inicio=d(7), fim=d(8)), sprints) == (d(7), d(8))
    assert periodo_da_task(task(1, inicio=d(9), fim=d(8)), sprints) == (d(5), d(16))
    assert periodo_da_task(task(1, sprint_id=None), sprints) is None
    assert periodo_da_task(task(1, sprint_id="x"), {"x": sprint("x", None, None)}) is None


def test_distribuir_cai_no_calendario_quando_pessoa_ausente_o_periodo_todo() -> None:
    fol = [ferias("ana", d(5), d(9))]
    partes = distribuir(10, (d(5), d(9)), frozenset(), fol)
    assert len(partes) == 5
    assert sum(partes.values()) == pytest.approx(10)


def test_distribuir_periodo_so_de_fim_de_semana() -> None:
    assert distribuir(4, (d(10), d(11)), frozenset()) == {d(11): 4}
    assert sum(distribuir(4, (d(12), d(12)), frozenset({d(12)})).values()) == 4


def test_feriado_no_meio_da_semana() -> None:
    e = entrada(
        pessoas=(ANA,),
        feriados=frozenset({d(7)}),
        tasks=(task(1, responsavel_id="ana", horas_restantes=12, inicio=d(5), fim=d(9)),),
    )
    c = _celula(e, SEMANA_1)
    assert c.dias_uteis == 4
    assert c.capacidade_h == 24
    assert c.carga_h == 12
    assert c.utilizacao == pytest.approx(0.5)


def test_ausencia_na_semana_inteira() -> None:
    e = entrada(
        pessoas=(ANA,),
        folgas=(ferias("ana", d(5), d(9)),),
        tasks=(task(1, responsavel_id="ana", horas_restantes=10, inicio=d(5), fim=d(9)),),
    )
    c = _celula(e, SEMANA_1)
    assert c.capacidade_h == 0
    assert c.carga_h == 10
    assert c.status == "sem-capacidade"
    assert c.utilizacao is None


def test_task_atravessando_virada_de_sprint() -> None:
    e = entrada(
        pessoas=(ANA,),
        tasks=(task(1, responsavel_id="ana", horas_restantes=20, inicio=d(12), fim=d(23)),),
    )
    cels = utilizacao_semanal(e, [SEMANA_1, SEMANA_2, SEMANA_3])
    assert [c.carga_h for c in cels] == [0, 10, 10]


def test_pessoa_sem_capacidade_cadastrada_usa_padrao() -> None:
    c = _celula(entrada(pessoas=(ANA,)), SEMANA_1)
    assert c.capacidade_h == 30
    assert c.origem_capacidade == "padrao"
    assert c.status == "ok"
    gestor = _celula(entrada(pessoas=(pessoa("ana", jornada_dia=8, foco=1),)), SEMANA_1)
    assert (gestor.capacidade_h, gestor.origem_capacidade) == (40, "gestor")


def test_capacity_de_varios_projetos_soma_e_respeita_teto() -> None:
    e = entrada(
        pessoas=(ANA,),
        sprints=(sprint("s1", d(5), d(16)), sprint("p2", d(5), d(16), projeto="proj-2")),
        capacidades=(cap("s1", "ana", 4), cap("p2", "ana", 4, time_id="t2")),
    )
    c = _celula(e, SEMANA_1)
    assert c.capacidade_h == 30
    assert c.origem_capacidade == "devops"


def test_alocacao_do_gestor_sobrepoe_capacity() -> None:
    e = entrada(
        pessoas=(ANA,),
        capacidades=(cap("s1", "ana", 6),),
        alocacoes=(Alocacao(projeto_id="proj-1", pessoa_id="ana", horas_dia=2),),
    )
    c = _celula(e, SEMANA_1)
    assert (c.capacidade_h, c.origem_capacidade) == (10, "gestor")


def test_folga_do_time_tira_so_a_parcela_do_time() -> None:
    e = entrada(
        pessoas=(ANA,),
        sprints=(sprint("s1", d(5), d(16)), sprint("p2", d(5), d(16), projeto="proj-2")),
        capacidades=(cap("s1", "ana", 3), cap("p2", "ana", 3, time_id="t2")),
        folgas=(Folga(time_id="t1", sprint_id="s1", inicio=d(5), fim=d(5)),),
    )
    c = _celula(e, SEMANA_1)
    assert c.capacidade_h == 27


def test_status_por_limites_customizados() -> None:
    regras = RegrasGerais(atencao=0.5, sobrecarga=0.6)
    e = entrada(
        pessoas=(ANA,),
        regras=regras,
        tasks=(task(1, responsavel_id="ana", horas_restantes=20, inicio=d(5), fim=d(9)),),
    )
    c = _celula(e, SEMANA_1)
    assert c.status == "sobrecarga"
    ev = evidencia_utilizacao(c, regras)
    assert ev.resultado == 67
    assert ev.entradas["limite_sobrecarga_pct"] == 60


def test_ignora_fechadas_pais_e_sem_responsavel() -> None:
    e = entrada(
        pessoas=(ANA,),
        tasks=(
            task(1, responsavel_id="ana", horas_restantes=5, estado="Closed"),
            task(2, responsavel_id="ana", horas_restantes=5, tem_filhos=True),
            task(3, horas_restantes=5),
            task(4, responsavel_id="ana", horas_restantes=5, sprint_id=None),
        ),
    )
    assert _celula(e, SEMANA_1).carga_h == 0


def test_conflito_com_ausencia() -> None:
    e = entrada(
        pessoas=(ANA,),
        folgas=(ferias("ana", d(19), d(23)),),
        tasks=(
            task(1, responsavel_id="ana", horas_restantes=12, sprint_id="s2"),
            task(2, responsavel_id="ana", horas_restantes=12, sprint_id="s1"),
            task(3, responsavel_id="ana", horas_restantes=12, sprint_id=None),
        ),
    )
    conf = conflitos_ausencia(e)
    assert [c.task_id for c in conf] == [1]
    assert len(conf[0].dias_ausente) == 5
    assert conf[0].evidencia.resultado == 5
