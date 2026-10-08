"""Golden test: o cenário do devops:seed precisa gerar os dois alertas da demo.

`seed_esperado.json` guarda o resumo aprovado. Mudou o motor de propósito? Rode com
UPDATE_GOLDEN=1, revise o diff do JSON e commite.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from cenario_seed import HOJE, snapshot

from radar_analytics.domain.analise import Analise, analisar
from radar_analytics.domain.calendario import FUSO

ESPERADO = Path(__file__).with_name("seed_esperado.json")
AGORA = datetime(2026, 10, 5, 9, tzinfo=FUSO)


def _resumo(a: Analise) -> dict[str, Any]:
    return {
        "alertas": [
            {
                "tipo": x.tipo,
                "pessoa": x.pessoa_id,
                "task": x.task_id,
                "semana": x.semana_inicio.isoformat() if x.semana_inicio else None,
                "resultado": x.evidencia.resultado,
            }
            for x in a.alertas
        ],
        "utilizacao": {
            f"{c.pessoa_id}@{c.inicio.isoformat()}": [c.capacidade_h, c.carga_h, c.status] for c in a.celulas
        },
        "pareto": [[i.causa, i.ocorrencias, i.pct_acumulado, i.vital] for i in a.pareto.itens],
        "candidatos": [
            {
                "acao_id": c.acao_id,
                "tipo": c.tipo,
                "task": c.task_id,
                "para": c.para_pessoa_id or c.para_sprint_id,
                "quadrante": c.priorizacao.quadrante,
            }
            for c in a.candidatos
        ],
    }


def test_seed_gera_alerta_de_sobrecarga_e_de_ferias_com_task() -> None:
    a = analisar(snapshot(), HOJE, AGORA)
    sobrecarga = [x for x in a.alertas if x.tipo == "sobrecarga"]
    assert {(x.pessoa_id, x.evidencia.resultado) for x in sobrecarga} == {("kaue", 117)}
    assert {x.semana_inicio.isoformat() for x in sobrecarga if x.semana_inicio} == {
        "2026-10-05",
        "2026-10-12",
    }

    ferias = [x for x in a.alertas if x.tipo == "ausencia"]
    assert {(x.pessoa_id, x.task_id) for x in ferias} == {("julliano", 116), ("julliano", 117)}
    assert all(x.evidencia.resultado == 5 for x in ferias)

    # os alertas graves vêm primeiro e há ação para os dois casos
    assert a.alertas[0].gravidade == 3
    assert any(c.de_pessoa_id == "kaue" and c.tipo == "reatribuir" for c in a.candidatos)
    assert any(c.task_id in (116, 117) for c in a.candidatos)
    assert all(c.projeto_id == a.projeto_id for c in a.candidatos)
    assert a.pareto.itens[-1].pct_acumulado == 100


def test_seed_bate_com_o_resumo_aprovado() -> None:
    atual = _resumo(analisar(snapshot(), HOJE, AGORA))
    if os.environ.get("UPDATE_GOLDEN") == "1" or not ESPERADO.exists():
        ESPERADO.write_text(json.dumps(atual, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    assert atual == json.loads(ESPERADO.read_text(encoding="utf-8"))
