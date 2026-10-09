from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

from radar_analytics.domain.models import Pessoa

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
_MIN_NOME = 3


def _letra(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def pseudonimos(pessoas: Iterable[Pessoa]) -> dict[str, str]:
    out: dict[str, str] = {}
    for i, p in enumerate(sorted(pessoas, key=lambda p: p.id)):
        partes = ["Dev", p.funcao or "do time"]
        if p.skills:
            partes.append(p.skills[0])
        out[p.id] = f"{' '.join(partes)} #{_letra(i)}"
    return out


def aliases_tasks(ids: Iterable[int]) -> dict[int, str]:
    return {tid: f"T{i + 1}" for i, tid in enumerate(sorted(set(ids)))}


def limpar_texto(texto: str, pessoas: Sequence[Pessoa], nomes: dict[str, str]) -> str:
    out = _EMAIL.sub("[e-mail]", texto)
    trocas: list[tuple[str, str]] = []
    for p in pessoas:
        pseudo = nomes.get(p.id, "[pessoa]")
        completo = p.nome.strip()
        if completo:
            trocas.append((completo, pseudo))
            primeiro = completo.split()[0]
            if len(primeiro) >= _MIN_NOME:
                trocas.append((primeiro, pseudo))
    for nome, pseudo in sorted(trocas, key=lambda t: -len(t[0])):
        out = re.sub(rf"(?<!\w){re.escape(nome)}(?!\w)", pseudo, out, flags=re.IGNORECASE)
    return out
