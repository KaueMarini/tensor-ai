from __future__ import annotations

import json
from typing import Any, Literal, Protocol

import anthropic
import structlog
from anthropic.types.beta import BetaMessageParam, BetaOutputConfigParam, BetaTextBlockParam
from pydantic import BaseModel, ConfigDict, ValidationError

log = structlog.get_logger(__name__)

BETA_FALLBACK = "server-side-fallback-2026-07-01"
Esforco = Literal["low", "medium", "high", "xhigh", "max"]


class Justificativa(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pareto: str
    tempo_ciclo: str
    esforco_impacto: str


class RespostaLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    acao_id: str
    alerta: str
    recomendacao: str
    justificativa: Justificativa


SCHEMA_RESPOSTA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "acao_id": {"type": "string"},
        "alerta": {"type": "string"},
        "recomendacao": {"type": "string"},
        "justificativa": {
            "type": "object",
            "properties": {
                "pareto": {"type": "string"},
                "tempo_ciclo": {"type": "string"},
                "esforco_impacto": {"type": "string"},
            },
            "required": ["pareto", "tempo_ciclo", "esforco_impacto"],
            "additionalProperties": False,
        },
    },
    "required": ["acao_id", "alerta", "recomendacao", "justificativa"],
    "additionalProperties": False,
}


class FalhaLLM(Exception):
    pass


class LLMClient(Protocol):
    modelo: str

    def responder(
        self,
        sistema: str,
        entrada: dict[str, Any],
        rejeitada: RespostaLLM | None = None,
        erros: list[str] | None = None,
    ) -> RespostaLLM: ...


def mensagem_usuario(entrada: dict[str, Any]) -> str:
    return "Dados já calculados pelo motor (JSON):\n" + json.dumps(
        entrada, ensure_ascii=False, sort_keys=True
    )


def interpretar(texto: str) -> RespostaLLM:
    try:
        return RespostaLLM.model_validate_json(texto)
    except ValidationError as erro:
        raise FalhaLLM(f"JSON fora do formato: {erro.error_count()} erro(s)") from erro


class AnthropicLLM:
    def __init__(
        self,
        api_key: str,
        modelo: str,
        *,
        timeout_s: float = 30.0,
        max_tentativas: int = 3,
        esforco: Esforco = "low",
        cliente: anthropic.Anthropic | None = None,
    ) -> None:
        self._cliente = cliente or anthropic.Anthropic(
            api_key=api_key, timeout=timeout_s, max_retries=max_tentativas
        )
        self.modelo = modelo
        self._esforco = esforco

    def responder(
        self,
        sistema: str,
        entrada: dict[str, Any],
        rejeitada: RespostaLLM | None = None,
        erros: list[str] | None = None,
    ) -> RespostaLLM:
        mensagens = mensagens_da_tentativa(entrada, rejeitada, erros)
        sistema_blocos: list[BetaTextBlockParam] = [
            {"type": "text", "text": sistema, "cache_control": {"type": "ephemeral"}}
        ]
        saida: BetaOutputConfigParam = {
            "effort": self._esforco,
            "format": {"type": "json_schema", "schema": SCHEMA_RESPOSTA},
        }
        try:
            resp = self._cliente.beta.messages.create(
                model=self.modelo,
                max_tokens=4000,
                system=sistema_blocos,
                messages=mensagens,
                output_config=saida,
                betas=[BETA_FALLBACK],
                fallbacks="default",
            )
        except anthropic.APIStatusError as erro:
            raise FalhaLLM(f"API {erro.status_code}") from erro
        except anthropic.APIConnectionError as erro:
            raise FalhaLLM("sem conexão com a API") from erro
        if resp.stop_reason == "refusal":
            raise FalhaLLM("recusa do modelo")
        texto = next((b.text for b in resp.content if b.type == "text"), None)
        if not texto:
            raise FalhaLLM(f"sem texto na resposta (stop_reason={resp.stop_reason})")
        log.info("llm_resposta", modelo=resp.model, tokens_saida=resp.usage.output_tokens)
        return interpretar(texto)


def mensagens_da_tentativa(
    entrada: dict[str, Any], rejeitada: RespostaLLM | None, erros: list[str] | None
) -> list[BetaMessageParam]:
    mensagens: list[BetaMessageParam] = [{"role": "user", "content": mensagem_usuario(entrada)}]
    if rejeitada is not None:
        mensagens.append({"role": "assistant", "content": rejeitada.model_dump_json()})
        mensagens.append(
            {
                "role": "user",
                "content": "A resposta foi rejeitada pelo validador:\n- "
                + "\n- ".join(erros or [])
                + "\nResponda de novo no mesmo formato, usando só acao_id e números presentes nos dados.",
            }
        )
    return mensagens
