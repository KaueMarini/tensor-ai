"""Normalização e encaixe de skills (mesma chave do banco: `skill_chave` / `chaveSkill`)."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

_SEPARADORES = re.compile(r"[\s\-_./]+")


def chave_skill(texto: str) -> str:
    """Minúsculas, sem acento, sem hífen/espaço: "Back-end" == "backend"."""
    sem_acento = unicodedata.normalize("NFD", texto)
    sem_acento = "".join(c for c in sem_acento if unicodedata.category(c) != "Mn")
    return _SEPARADORES.sub("", sem_acento.lower())


def tags_relevantes(tags: Iterable[str]) -> set[str]:
    """Tags normalizadas, ignorando as de seed/teste (`seed-*`)."""
    return {chave_skill(t) for t in tags if t.strip() and not chave_skill(t).startswith("seed")}


def encaixe(tags_task: Iterable[str], skills_pessoa: Iterable[str]) -> float:
    """Fração das tags da task cobertas pelas skills da pessoa. Task sem tags → 1 (sem exigência)."""
    tags = tags_relevantes(tags_task)
    if not tags:
        return 1.0
    skills = {chave_skill(s) for s in skills_pessoa}
    return len(tags & skills) / len(tags)
