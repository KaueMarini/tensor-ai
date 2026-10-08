from datetime import timedelta

from fabrica import PROJ, d, dt, entrada, pessoa, task, trans
from radar_analytics.domain.analise import Snapshot, analisar
from radar_analytics.domain.models import ColunaFluxo, ConfigAnalise

CONFIG = ConfigAnalise(
    limite_wip_pessoa=1,
    min_amostras_percentil=2,
    colunas=(ColunaFluxo(coluna="Code Review", tipo="espera", sla_horas_uteis=8, limite_wip_coluna=1),),
)


def test_alertas_de_fluxo_sla_aging_e_wip() -> None:
    concluidas = [task(10 + i, estado="Closed", criado_em=dt(1)) for i in range(2)]
    hist = []
    for i, t in enumerate(concluidas):
        hist.append(trans(t.id, "System.State", "New", "Active", dt(1), 2))
        hist.append(trans(t.id, "System.State", "Active", "Closed", dt(2 + i), 3))
    abertas = [
        task(1, estado="Active", responsavel_id="ana", horas_restantes=2),
        task(2, estado="Active", responsavel_id="ana", horas_restantes=2),
    ]
    hist += [
        trans(1, "System.State", "New", "Active", dt(1), 2),
        trans(1, "System.BoardColumn", "Doing", "Code Review", dt(5, 9), 3),
        trans(2, "System.BoardColumn", "Doing", "Code Review", dt(5, 9), 2),
    ]
    snap = Snapshot(
        projeto_id=PROJ,
        capacidade=entrada(pessoas=(pessoa("ana"),), tasks=(*concluidas, *abertas), config=CONFIG),
        transicoes=tuple(hist),
        membros_projeto={PROJ: frozenset({"ana"})},
    )
    a = analisar(snap, d(5), dt(7, 12) + timedelta(minutes=0))
    tipos = {x.tipo for x in a.alertas}
    assert {"sla", "aging", "wip_pessoa", "wip_coluna"} <= tipos
    sla = next(x for x in a.alertas if x.tipo == "sla")
    assert sla.coluna == "Code Review"
    assert a.referencia.cycle_dias is not None
    assert [x.gravidade for x in a.alertas] == sorted((x.gravidade for x in a.alertas), reverse=True)
