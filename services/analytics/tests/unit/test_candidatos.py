from fabrica import SEMANA_1, SEMANA_2, SEMANA_3, d, entrada, ferias, pessoa, sprint, task
from radar_analytics.domain.candidatos import acao_id, gerar_candidatos, ids_validos

SEMANAS = [SEMANA_1, SEMANA_2, SEMANA_3]
MEMBROS = {"proj-1": frozenset({"ana", "bia", "caio"})}
PESSOAS = (
    pessoa("ana", skills=("react",)),
    pessoa("bia", skills=("react", "typescript")),
    pessoa("caio", skills=("sql",)),
)


def test_sobrecarga_gera_reatribuicao_para_quem_tem_skill_e_mover_sprint() -> None:
    e = entrada(
        pessoas=PESSOAS,
        tasks=(
            task(1, responsavel_id="ana", horas_restantes=50, tags=("react",)),
            task(2, responsavel_id="ana", horas_restantes=30, tags=("react",)),
        ),
    )
    cands = gerar_candidatos(e, SEMANAS, MEMBROS)
    assert cands
    tipos = {(c.tipo, c.task_id, c.para_pessoa_id) for c in cands}
    assert ("reatribuir", 1, "bia") in tipos
    assert ("mover_sprint", 1, None) in tipos
    reat = next(c for c in cands if c.tipo == "reatribuir" and c.task_id == 1 and c.para_pessoa_id == "bia")
    assert reat.encaixe == 1
    assert reat.antes[0].pico_pct == 133
    assert reat.depois[0].pico_pct == 50
    # pico da equipe: ana 133% → 50%, mas bia vai a 83%
    assert reat.impacto.reducao_pico_pp == 50
    assert reat.motivo == "sobrecarga"
    assert reat.semana_inicio == d(5)
    assert reat.acao_id == acao_id("reatribuir", 1, "bia")
    assert all(c.para_pessoa_id != "ana" for c in cands)
    # ordenação: quick wins primeiro
    flags = [c.priorizacao.quick_win for c in cands]
    assert flags == sorted(flags, reverse=True)
    assert len(ids_validos(cands)) == len(cands)


def test_nao_reatribui_para_quem_ficaria_sobrecarregado() -> None:
    e = entrada(
        pessoas=PESSOAS[:2],
        sprints=(sprint("s1", d(5), d(16)),),
        tasks=(
            task(1, responsavel_id="ana", horas_restantes=80),
            task(2, responsavel_id="bia", horas_restantes=50),
        ),
    )
    cands = gerar_candidatos(e, SEMANAS, {"proj-1": frozenset({"ana", "bia"})})
    assert not [c for c in cands if c.tipo == "reatribuir"]
    assert not [c for c in cands if c.tipo == "mover_sprint"]  # não há sprint seguinte


def test_pausar_so_baixa_prioridade() -> None:
    e = entrada(
        pessoas=PESSOAS[:1],
        sprints=(sprint("s1", d(5), d(16)),),
        tasks=(
            task(1, responsavel_id="ana", horas_restantes=50, prioridade=4),
            task(2, responsavel_id="ana", horas_restantes=30, prioridade=1),
        ),
    )
    cands = gerar_candidatos(e, SEMANAS, {"proj-1": frozenset({"ana"})})
    assert {(c.tipo, c.task_id) for c in cands} == {("pausar", 1)}


def test_ausencia_gera_reatribuicao_e_resolve_conflito() -> None:
    e = entrada(
        pessoas=PESSOAS,
        folgas=(ferias("caio", d(19), d(23)),),
        tasks=(task(9, responsavel_id="caio", horas_restantes=12, sprint_id="s2", tags=("sql",)),),
    )
    cands = gerar_candidatos(e, SEMANAS, MEMBROS)
    reat = [c for c in cands if c.tipo == "reatribuir"]
    assert reat
    assert all(c.motivo == "ausencia" for c in cands)
    assert reat[0].impacto.itens_desbloqueados == 1
    assert reat[0].evidencia.entradas["conflito_ausencia_resolvido"] is True
    # sem gente com sql, a penalidade de skill aparece
    assert reat[0].esforco.penalidade_skill == 1


def test_mover_sprint_que_nao_resolve_ausencia_e_descartado() -> None:
    e = entrada(
        pessoas=PESSOAS[2:],
        sprints=(sprint("s1", d(5), d(16)), sprint("s2", d(19), d(30))),
        folgas=(ferias("caio", d(5), d(30)),),
        tasks=(task(9, responsavel_id="caio", horas_restantes=12, sprint_id="s1"),),
    )
    cands = gerar_candidatos(e, SEMANAS, {"proj-1": frozenset({"caio"})})
    assert cands == []


def test_feature_nunca_vira_candidata_e_filtro_de_projeto() -> None:
    e = entrada(
        pessoas=PESSOAS,
        tasks=(
            task(1, tipo="Feature", responsavel_id="ana", horas_restantes=80),
            task(2, responsavel_id="ana", horas_restantes=80, projeto_id="outro"),
        ),
    )
    assert gerar_candidatos(e, SEMANAS, MEMBROS, projeto_id="proj-1") == []
    assert all(c.task_id != 1 for c in gerar_candidatos(e, SEMANAS, MEMBROS))


def test_limite_de_candidatos() -> None:
    e = entrada(
        pessoas=PESSOAS,
        tasks=tuple(task(i, responsavel_id="ana", horas_restantes=20) for i in range(1, 8)),
    )
    assert len(gerar_candidatos(e, SEMANAS, MEMBROS, max_candidatos=3)) == 3
