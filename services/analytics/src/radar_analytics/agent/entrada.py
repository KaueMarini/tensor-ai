from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from radar_analytics import numeros
from radar_analytics.domain.analise import Analise, Snapshot
from radar_analytics.domain.anonimizacao import aliases_tasks, limpar_texto, pseudonimos
from radar_analytics.domain.candidatos import AcaoCandidata, EstadoPessoa
from radar_analytics.domain.models import Evidencia

MAX_ALERTAS = 8


@dataclass(frozen=True)
class Mapa:
    pessoas: dict[str, str]
    tasks: dict[int, str]
    sprints: dict[str, str]

    def pessoa(self, pid: str | None) -> str | None:
        return None if pid is None else self.pessoas.get(pid, "Dev de outro time")

    def task(self, tid: int | None) -> str | None:
        return None if tid is None else self.tasks.get(tid, "T?")


def _ev(e: Evidencia) -> dict[str, Any]:
    return {"formula": e.formula, "entradas": e.entradas, "resultado": e.resultado, "unidade": e.unidade}


def _estado(s: EstadoPessoa, mapa: Mapa) -> dict[str, Any]:
    return {
        "pessoa": mapa.pessoa(s.pessoa_id),
        "pico_pct": s.pico_pct,
        "semana_pct": s.semana_pct,
        "horas_acima_do_limite": s.excesso_h,
    }


def _candidato(c: AcaoCandidata, mapa: Mapa, titulos: dict[int, str]) -> dict[str, Any]:
    return {
        "acao_id": c.acao_id,
        "tipo": c.tipo,
        "motivo": c.motivo,
        "task": mapa.task(c.task_id),
        "titulo_task": titulos.get(c.task_id, ""),
        "semana_inicio": c.semana_inicio.isoformat() if c.semana_inicio else None,
        "horas": c.horas,
        "horas_estimativa_do_sistema": c.horas_origem == "sistema",
        "de": mapa.pessoa(c.de_pessoa_id),
        "para": mapa.pessoa(c.para_pessoa_id) if c.para_pessoa_id else None,
        "para_sprint": mapa.sprints.get(c.para_sprint_id or "") if c.para_sprint_id else None,
        "encaixe_skill_pct": None if c.encaixe is None else numeros.pct(c.encaixe),
        "antes": [_estado(s, mapa) for s in c.antes],
        "depois": [_estado(s, mapa) for s in c.depois],
        "impacto": c.impacto.model_dump(),
        "esforco": c.esforco.model_dump(),
        "quadrante": c.priorizacao.quadrante,
        "quick_win": c.priorizacao.quick_win,
        "impacto_score": c.priorizacao.impacto,
        "esforco_score": c.priorizacao.esforco,
    }


def montar_entrada(a: Analise, s: Snapshot, nome_projeto: str) -> tuple[dict[str, Any], Mapa]:
    e = s.capacidade
    ids_tasks: set[int] = {c.task_id for c in a.candidatos}
    ids_tasks |= {x.task_id for x in a.alertas if x.task_id is not None}
    ids_tasks |= {t for i in a.pareto.itens for t in i.tasks}
    mapa = Mapa(
        pessoas=pseudonimos(e.pessoas),
        tasks=aliases_tasks(ids_tasks),
        sprints={sp.id: sp.nome for sp in e.sprints},
    )
    titulos = {t.id: limpar_texto(t.titulo, e.pessoas, mapa.pessoas) for t in e.tasks if t.id in ids_tasks}

    utilizacao: dict[str, list[dict[str, Any]]] = {}
    for c in a.celulas:
        utilizacao.setdefault(mapa.pessoa(c.pessoa_id) or "", []).append(
            {
                "semana_inicio": c.inicio.isoformat(),
                "capacidade_h": c.capacidade_h,
                "carga_h": c.carga_h,
                "carga_estimativa_sistema_h": c.carga_sistema_h,
                "utilizacao_pct": None if c.utilizacao is None else numeros.pct(c.utilizacao),
                "status": c.status,
            }
        )
    entrada: dict[str, Any] = {
        "projeto": limpar_texto(nome_projeto, e.pessoas, mapa.pessoas),
        "hoje": a.hoje.isoformat(),
        "limites": {
            "atencao_pct": numeros.pct(e.regras.atencao),
            "sobrecarga_pct": numeros.pct(e.regras.sobrecarga),
        },
        "alertas": [
            {
                "tipo": x.tipo,
                "gravidade": x.gravidade,
                "pessoa": mapa.pessoa(x.pessoa_id),
                "task": mapa.task(x.task_id),
                "semana_inicio": x.semana_inicio.isoformat() if x.semana_inicio else None,
                "coluna": x.coluna,
                "evidencia": _ev(x.evidencia),
            }
            for x in a.alertas[:MAX_ALERTAS]
        ],
        "utilizacao_semanal": utilizacao,
        "pareto": {
            "total_tasks_afetadas": a.pareto.total,
            "causas": [
                {
                    "causa": i.rotulo,
                    "tasks": i.ocorrencias,
                    "pct": i.pct,
                    "pct_acumulado": i.pct_acumulado,
                    "vital": i.vital,
                }
                for i in a.pareto.itens
            ],
        },
        "tempo_de_ciclo": {
            "percentil": numeros.pct(a.referencia.percentil),
            "cycle_time_referencia_dias": a.referencia.cycle_dias,
            "lead_time_referencia_dias": a.referencia.lead_dias,
            "amostras": a.referencia.amostras,
        },
        "candidatos": [_candidato(c, mapa, titulos) for c in a.candidatos],
    }
    return entrada, mapa


def vazamentos(entrada: dict[str, Any], s: Snapshot, mapa: Mapa) -> list[str]:
    texto = json.dumps(entrada, ensure_ascii=False)
    proibidos: Iterable[str] = [
        *mapa.pessoas,
        *(sp_id for sp_id in mapa.sprints),
        s.projeto_id,
        *(p.nome for p in s.capacidade.pessoas if len(p.nome) >= 3),
    ]
    return [x for x in proibidos if x and x in texto]


def hash_entrada(entrada: dict[str, Any], versao_prompt: str) -> str:
    estavel = {k: v for k, v in entrada.items() if k != "hoje"}
    canonico = json.dumps({"v": versao_prompt, "e": estavel}, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonico.encode()).hexdigest()
