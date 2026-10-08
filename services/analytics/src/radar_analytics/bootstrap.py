"""Monta as dependências reais a partir do ambiente (pool, LLM, prompt, DevOps)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import structlog

from radar_analytics.agent.llm import AnthropicLLM, LLMClient
from radar_analytics.agent.prompt_loader import Prompt, PromptAusente, carregar
from radar_analytics.config import settings
from radar_analytics.devops.client import DevOpsLeitura
from radar_analytics.logs import configurar
from radar_analytics.repositories.db import criar_pool
from radar_analytics.servico import Servico

log = structlog.get_logger(__name__)


@dataclass
class Recursos:
    servico: Servico
    segredo: str | None
    debounce_s: float
    info: dict[str, Any]
    fechar: Callable[[], None]


def montar() -> Recursos:
    cfg = settings()
    configurar(cfg.log_level)
    pool = criar_pool(cfg.supabase_db_url.get_secret_value(), cfg.db_pool_max)
    devops = DevOpsLeitura(cfg.devops_org, cfg.devops_pat_read.get_secret_value())

    prompt: Prompt | None = None
    try:
        prompt = carregar(cfg.versao_prompt, cfg.prompts_dir)
    except PromptAusente as erro:
        log.warning("prompt_ausente_usando_template", caminho=str(erro))

    llm: LLMClient | None = None
    if cfg.anthropic_api_key is not None:
        llm = AnthropicLLM(
            cfg.anthropic_api_key.get_secret_value(),
            cfg.llm_model,
            timeout_s=cfg.llm_timeout_s,
            max_tentativas=cfg.llm_max_tentativas,
            esforco=cfg.llm_esforco,
        )
    else:
        log.warning("sem_anthropic_api_key_usando_template")

    def fechar() -> None:
        devops.close()
        pool.close()

    return Recursos(
        servico=Servico(pool, llm, prompt, devops, cfg.sweep_semanas),
        segredo=None
        if cfg.analytics_shared_secret is None
        else cfg.analytics_shared_secret.get_secret_value(),
        debounce_s=cfg.debounce_segundos,
        info={
            "versao_prompt": prompt.rotulo if prompt else None,
            "llm": cfg.llm_model if llm else None,
        },
        fechar=fechar,
    )
