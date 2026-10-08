import pytest

from fabrica import dt, task, trans
from radar_analytics.domain.fluxo import (
    TemposItem,
    aging_acima,
    categoria_estado,
    coluna_atual,
    percentil,
    por_item,
    referencia,
    segmentos,
    tempo_em_espera,
    tempos,
    wip_por_coluna,
    wip_por_pessoa,
)
from radar_analytics.domain.models import Categoria, ColunaFluxo, ConfigAnalise

BOARD = "System.BoardColumn"
STATE = "System.State"
CONFIG = ConfigAnalise(
    colunas=(
        ColunaFluxo(coluna="Code Review", tipo="espera", sla_horas_uteis=24, limite_wip_coluna=1),
        ColunaFluxo(coluna="Doing", tipo="ativa"),
    ),
)


def test_categoria_estado() -> None:
    assert categoria_estado(None) is Categoria.PROPOSTO
    assert categoria_estado("Active") is Categoria.ANDAMENTO
    assert categoria_estado(" done ") is Categoria.CONCLUIDO
    assert categoria_estado("Removed") is Categoria.REMOVIDO
    assert categoria_estado("Em validação") is Categoria.ANDAMENTO


def test_board_column_tem_preferencia_sobre_state() -> None:
    hist = [
        trans(1, STATE, "New", "Active", dt(5), 2),
        trans(1, BOARD, "Doing", "Code Review", dt(6), 3),
    ]
    assert [s.coluna for s in segmentos(hist)] == ["Code Review"]
    assert coluna_atual(hist, "Active") == "Code Review"
    assert coluna_atual([], "Active") == "Active"


def test_item_que_volta_de_coluna_soma_as_passagens() -> None:
    hist = por_item(
        [
            trans(1, BOARD, "Doing", "Code Review", dt(5, 9), 2),  # 9h (segunda inteira)
            trans(1, BOARD, "Code Review", "Doing", dt(6, 9), 3),
            trans(1, BOARD, "Doing", "Code Review", dt(7, 9), 4),  # quarta + quinta = 18h
            trans(1, BOARD, "Code Review", "Done", dt(9, 9), 5),
        ]
    )[1]
    esp = tempo_em_espera(task(1, estado="Active"), hist, CONFIG, frozenset(), dt(20))
    assert len(esp) == 1
    e = esp[0]
    assert (e.passagens, e.horas_uteis, e.excesso_horas, e.em_curso) == (2, 27, 3, False)
    assert e.evidencia.entradas["passagens_horas"] == [9, 18]


def test_espera_em_curso_conta_ate_agora_e_ignora_colunas_ativas() -> None:
    hist = [
        trans(1, BOARD, "To Do", "Doing", dt(5, 9), 1),
        trans(1, BOARD, "Doing", "code review", dt(5, 14), 2),
    ]
    esp = tempo_em_espera(task(1, estado="Active"), hist, CONFIG, frozenset(), dt(6, 12))
    assert len(esp) == 1
    assert esp[0].horas_uteis == 7  # 4h segunda + 3h terça
    assert esp[0].em_curso
    assert esp[0].excesso_horas == 0


def test_tempos_cycle_lead_e_aging() -> None:
    feito = task(1, estado="Closed", criado_em=dt(1))
    hist = [
        trans(1, STATE, "New", "Active", dt(5), 2),
        trans(1, STATE, "Active", "Closed", dt(7), 3),
        trans(1, STATE, "Closed", "Active", dt(8), 4),
        trans(1, STATE, "Active", "Closed", dt(9), 5),
    ]
    t = tempos(feito, hist, dt(20))
    assert t.cycle_dias == pytest.approx(4)
    assert t.lead_dias == pytest.approx(8)
    assert t.aging_dias is None

    aberto = task(2, estado="Active")
    t2 = tempos(aberto, [trans(2, STATE, "New", "Active", dt(5), 2)], dt(15))
    assert (t2.cycle_dias, t2.aging_dias) == (None, pytest.approx(10))

    sem_historico = tempos(task(3, estado="Active"), [], dt(15))
    assert sem_historico.aging_dias is None


def test_percentil_interpolado() -> None:
    assert percentil([1, 2, 3, 4], 0.5) == 2.5
    assert percentil([5], 0.85) == 5
    assert percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.85) == pytest.approx(8.65)
    with pytest.raises(ValueError, match="vazia"):
        percentil([], 0.5)


def test_referencia_exige_amostras_minimas_e_aging_compara() -> None:
    poucos = [TemposItem(task_id=i, cycle_dias=2, lead_dias=3, aging_dias=None) for i in range(3)]
    assert referencia(poucos, ConfigAnalise()).cycle_dias is None
    assert aging_acima(poucos, referencia(poucos, ConfigAnalise())) == []

    medidos = [
        TemposItem(task_id=i, cycle_dias=float(i), lead_dias=float(i), aging_dias=None) for i in range(1, 11)
    ]
    medidos.append(TemposItem(task_id=99, cycle_dias=None, lead_dias=None, aging_dias=12))
    medidos.append(TemposItem(task_id=98, cycle_dias=None, lead_dias=None, aging_dias=3))
    ref = referencia(medidos, ConfigAnalise())
    assert ref.cycle_dias == pytest.approx(8.7)
    assert ref.amostras == 10
    acima = aging_acima(medidos, ref)
    assert [a.task_id for a in acima] == [99]


def test_wip_por_pessoa_e_coluna() -> None:
    tasks = [
        task(1, estado="Active", responsavel_id="ana"),
        task(2, estado="Active", responsavel_id="ana"),
        task(3, estado="Resolved", responsavel_id="ana"),
        task(4, estado="Active", responsavel_id="ana"),
        task(5, estado="New", responsavel_id="ana"),
        task(6, estado="Active", responsavel_id="ana", tem_filhos=True),
        task(7, estado="Active", responsavel_id="bia"),
    ]
    wips = {w.chave: w for w in wip_por_pessoa(tasks, 3)}
    assert wips["ana"].wip == 4
    assert wips["ana"].acima
    assert not wips["bia"].acima

    colunas = {1: "Code Review", 2: "code-review", 3: "Doing", 5: None}
    por_coluna = wip_por_coluna(tasks, colunas, CONFIG)
    assert [(w.chave, w.wip, w.acima) for w in por_coluna] == [("Code Review", 2, True)]
