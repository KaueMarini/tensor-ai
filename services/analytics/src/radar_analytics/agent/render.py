from __future__ import annotations

from datetime import date
from typing import Any

from radar_analytics.agent.llm import Justificativa, RespostaLLM

QUADRANTES = {
    "quick_win": "Quick Win",
    "grande_aposta": "Grande aposta",
    "preenchimento": "Preenchimento",
    "evitar": "Evitar",
}


def fmt(n: float | int | None) -> str:
    if n is None:
        return "—"
    v = float(n)
    return str(int(v)) if v.is_integer() else f"{v}".replace(".", ",")


def _dia_mes(iso: str | None) -> str:
    return "" if not iso else date.fromisoformat(iso).strftime("%d/%m")


def render(r: RespostaLLM) -> str:
    j = r.justificativa
    return (
        "🚨 ALERTA DE GARGALO\n"
        f"{r.alerta.strip()}\n\n"
        "🛠️ RECOMENDAÇÃO DE AÇÃO\n"
        f"{r.recomendacao.strip()}\n\n"
        "📊 JUSTIFICATIVA TÉCNICA (Explainable AI)\n"
        f"- **Pareto:** {j.pareto.strip()}\n"
        f"- **Mapa de Calor / Tempo de Ciclo:** {j.tempo_ciclo.strip()}\n"
        f"- **Esforço vs Impacto:** {j.esforco_impacto.strip()}\n"
    )


def fallback(dados: dict[str, Any], acao_id: str | None = None) -> RespostaLLM:
    candidatos: list[dict[str, Any]] = dados["candidatos"]
    c = next((x for x in candidatos if x["acao_id"] == acao_id), candidatos[0])
    origem = c["antes"][0]
    origem_depois = c["depois"][0]

    if c["motivo"] == "ausencia":
        ausencia = next(
            (a for a in dados["alertas"] if a["tipo"] == "ausencia" and a["task"] == c["task"]),
            None,
        )
        dias = f" em {fmt(ausencia['evidencia']['resultado'])} dia(s) útil(eis)" if ausencia else ""
        alerta = f"{c['de']} estará ausente{dias} no período de {c['task']} ({fmt(c['horas'])}h)."
    else:
        semana = _dia_mes(c["semana_inicio"])
        alerta = (
            f"{c['de']} está com {fmt(origem['semana_pct'])}% de utilização na semana de {semana}"
            f" (pico de {fmt(origem['pico_pct'])}%)."
        )

    alvo = {"reatribuir": c["para"], "mover_sprint": c["para_sprint"]}.get(c["tipo"])
    verbo = {"reatribuir": "Reatribuir", "mover_sprint": "Mover", "pausar": "Pausar"}[c["tipo"]]
    destino = {"reatribuir": f" para {alvo}", "mover_sprint": f" para a {alvo}"}.get(c["tipo"], "")
    recomendacao = f"Sugestão: {verbo} {c['task']} ({fmt(c['horas'])}h){destino}."

    causas = [x for x in dados["pareto"]["causas"] if x["vital"]] or dados["pareto"]["causas"][:1]
    if causas:
        pareto = "; ".join(f"{x['causa']}: {x['tasks']} task(s), {fmt(x['pct'])}%" for x in causas)
        pareto += f" (acumulado {fmt(causas[-1]['pct_acumulado'])}%)."
    else:
        pareto = "Sem causas de atraso registradas no período."

    ref = dados["tempo_de_ciclo"]["cycle_time_referencia_dias"]
    ciclo = (
        f"Cycle time p{fmt(dados['tempo_de_ciclo']['percentil'])} de {fmt(ref)} dias. "
        if ref is not None
        else "Sem histórico suficiente de cycle time. "
    )
    ciclo += f"Pico de {c['de']}: {fmt(origem['pico_pct'])}% → {fmt(origem_depois['pico_pct'])}%"
    if c["para"] and len(c["depois"]) > 1:
        ciclo += f"; {c['para']} fica em {fmt(c['depois'][1]['pico_pct'])}%"
    ciclo += "."

    esforco = (
        f"{QUADRANTES[c['quadrante']]}: impacto {fmt(c['impacto_score'])} e esforço"
        f" {fmt(c['esforco_score'])} ({fmt(c['horas'])}h movidas)."
    )
    return RespostaLLM(
        acao_id=c["acao_id"],
        alerta=alerta,
        recomendacao=recomendacao,
        justificativa=Justificativa(pareto=pareto, tempo_ciclo=ciclo, esforco_impacto=esforco),
    )
