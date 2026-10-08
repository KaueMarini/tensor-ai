"""Da análise à sugestão: LLM escolhe + redige → validador → (1 nova tentativa) → fallback.

Sem I/O de banco: recebe o LLM e o prompt prontos e devolve a `SugestaoNova` para gravar.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import structlog

from radar_analytics.agent.entrada import hash_entrada, montar_entrada, vazamentos
from radar_analytics.agent.llm import FalhaLLM, LLMClient, RespostaLLM
from radar_analytics.agent.prompt_loader import Prompt
from radar_analytics.agent.render import fallback, render
from radar_analytics.agent.validador import validar
from radar_analytics.domain.analise import Analise, Snapshot
from radar_analytics.domain.candidatos import AcaoCandidata
from radar_analytics.repositories.escrita import SugestaoNova

log = structlog.get_logger(__name__)
VERSAO_SEM_PROMPT = "sem-prompt"


class VazamentoDeDados(RuntimeError):  # noqa: N818 - nome do domínio
    """A entrada do LLM conteria um identificador real (bug: nunca deve acontecer)."""


def acao_estruturada(c: AcaoCandidata) -> dict[str, Any]:
    """O que o executor aplica no DevOps depois da aprovação (IDs reais)."""
    acao: dict[str, Any] = {"tipo": c.tipo, "work_item_id": c.task_id, "de_pessoa_id": c.de_pessoa_id}
    if c.para_pessoa_id:
        acao["para_pessoa_id"] = c.para_pessoa_id
    if c.para_sprint_id:
        acao["para_sprint_id"] = c.para_sprint_id
    return acao


def escolher_texto(
    dados: dict[str, Any], ids: list[str], llm: LLMClient | None, prompt: Prompt | None
) -> tuple[RespostaLLM, bool, list[list[str]]]:
    """(resposta, usou_fallback, erros de cada tentativa)."""
    historico: list[list[str]] = []
    if llm is None or prompt is None:
        return fallback(dados), True, historico
    rejeitada: RespostaLLM | None = None
    erros: list[str] | None = None
    for tentativa in (1, 2):
        try:
            r = llm.responder(prompt.texto, dados, rejeitada, erros)
        except FalhaLLM as falha:
            historico.append([f"falha do LLM: {falha}"])
            log.warning("llm_falhou", tentativa=tentativa, erro=str(falha))
            break
        erros = validar(r, dados, ids)
        historico.append(erros)
        if not erros:
            return r, False, historico
        log.warning("llm_rejeitado", tentativa=tentativa, erros=erros)
        rejeitada = r
    # fallback mantém a ação escolhida pelo LLM se ela for válida
    escolhida = rejeitada.acao_id if rejeitada is not None and rejeitada.acao_id in ids else None
    return fallback(dados, escolhida), True, historico


def gerar_sugestao(
    a: Analise,
    s: Snapshot,
    nome_projeto: str,
    origem: str,
    llm: LLMClient | None,
    prompt: Prompt | None,
    ja_pendente: Callable[[str], bool] = lambda _h: False,
) -> SugestaoNova | None:
    """None se não há ação candidata ou se o mesmo estado já tem sugestão pendente (sem chamar o LLM)."""
    if not a.candidatos:
        return None
    dados, mapa = montar_entrada(a, s, nome_projeto)
    if vaz := vazamentos(dados, s, mapa):
        raise VazamentoDeDados(f"{len(vaz)} identificador(es) real(is) na entrada do LLM")
    versao = prompt.rotulo if prompt else VERSAO_SEM_PROMPT
    hash_payload = hash_entrada(dados, versao)
    if ja_pendente(hash_payload):
        log.info("sugestao_ja_pendente", projeto_id=a.projeto_id, hash=hash_payload[:12])
        return None
    ids = [c.acao_id for c in a.candidatos]
    resposta, usou_fallback, historico = escolher_texto(dados, ids, llm, prompt)
    candidato = next(c for c in a.candidatos if c.acao_id == resposta.acao_id)
    cand_dados = next(c for c in dados["candidatos"] if c["acao_id"] == resposta.acao_id)

    return SugestaoNova(
        projeto_id=a.projeto_id,
        origem=origem,
        tipo=candidato.tipo,
        markdown=render(resposta),
        justificativa=" ".join(resposta.justificativa.model_dump().values()),
        payload={
            "entrada_llm": dados,
            "evidencias": {
                "acao": candidato.evidencia.model_dump(mode="json"),
                "priorizacao": candidato.priorizacao.evidencia.model_dump(mode="json"),
                "pareto": a.pareto.evidencia.model_dump(mode="json"),
                "tempo_ciclo": a.referencia.evidencia.model_dump(mode="json"),
            },
            "resposta": resposta.model_dump(),
            "validacao": {"tentativas": historico},
            "modelo": None if usou_fallback or llm is None else llm.modelo,
        },
        acao=acao_estruturada(candidato),
        impacto={
            "quadrante": candidato.priorizacao.quadrante,
            "quick_win": candidato.priorizacao.quick_win,
            "impacto_score": candidato.priorizacao.impacto,
            "esforco_score": candidato.priorizacao.esforco,
            "impacto": candidato.impacto.model_dump(),
            "esforco": candidato.esforco.model_dump(),
        },
        impacto_antes={"pessoas": cand_dados["antes"]},
        impacto_depois={"pessoas": cand_dados["depois"]},
        versao_prompt=versao,
        hash_payload=hash_payload,
        usou_fallback=usou_fallback,
    )
