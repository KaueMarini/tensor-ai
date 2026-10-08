"""Carrega o system prompt versionado: `prompts/analista-fluxo.<versao>.md`."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

NOME = "analista-fluxo"
_VERSAO = re.compile(r"^v\d+$")
# services/analytics/src/radar_analytics/agent/prompt_loader.py → raiz do repositório
PADRAO_DIR = Path(__file__).resolve().parents[5] / "prompts"


@dataclass(frozen=True)
class Prompt:
    versao: str
    texto: str

    @property
    def rotulo(self) -> str:
        return f"{NOME}.{self.versao}"


class PromptAusente(FileNotFoundError):  # noqa: N818 - nome do domínio
    pass


def carregar(versao: str, diretorio: Path | None = None) -> Prompt:
    if not _VERSAO.match(versao):
        raise ValueError(f"versão de prompt inválida: {versao!r} (esperado v1, v2...)")
    caminho = (diretorio or PADRAO_DIR) / f"{NOME}.{versao}.md"
    if not caminho.is_file():
        raise PromptAusente(str(caminho))
    texto = caminho.read_text(encoding="utf-8").strip()
    if not texto:
        raise PromptAusente(f"{caminho} está vazio")
    return Prompt(versao=versao, texto=texto)
