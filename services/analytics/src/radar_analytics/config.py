"""Configuração do serviço, só por variáveis de ambiente (segredos nunca no repositório)."""

from __future__ import annotations

from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

FUSO = ZoneInfo("America/Sao_Paulo")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_db_url: SecretStr
    devops_org: str = Field(description="URL da organização, ex: https://dev.azure.com/JLNK")
    devops_pat_read: SecretStr = Field(description="PAT com escopo Work Items (Read) apenas")
    anthropic_api_key: SecretStr
    llm_model: str = "claude-sonnet-5-5"
    analytics_shared_secret: SecretStr

    llm_timeout_s: float = 30.0
    llm_max_tentativas: int = 3
    debounce_segundos: float = 30.0
    db_pool_max: int = 5
    versao_prompt: str = "v1"
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def settings() -> Settings:
    return Settings()  # valores vêm do ambiente
