from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID

import pytest

import radar_analytics.servico as mod
from golden.cenario_seed import PROJETO, snapshot
from radar_analytics.domain.calendario import FUSO
from radar_analytics.servico import Servico

AGORA = datetime(2026, 10, 5, 9, tzinfo=FUSO)
ID = UUID("00000000-0000-0000-0000-000000000001")


class PoolFalso:
    def __init__(self, nome: str | None = "Atlântico Docas") -> None:
        self.nome = nome

    @contextmanager
    def connection(self) -> Any:
        linha = None if self.nome is None else {"nome": self.nome}
        yield SimpleNamespace(execute=lambda *_a, **_k: SimpleNamespace(fetchone=lambda: linha))


@pytest.fixture
def gravadas(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    salvas: list[Any] = []
    monkeypatch.setattr(mod, "carregar_snapshot", lambda *_a, **_k: snapshot())
    monkeypatch.setattr(mod, "projeto_do_item", lambda _c, i: PROJETO if i == 101 else None)
    monkeypatch.setattr(mod, "projetos_ativos", lambda _c: [PROJETO, "quebrado"])
    monkeypatch.setattr(mod.escrita, "existe_pendente", lambda _c, _h: False)
    monkeypatch.setattr(mod.escrita, "gravar_relacoes", lambda _c, r: salvas.append(("rel", r)))

    def gravar(_c: Any, s: Any) -> UUID:
        salvas.append(s)
        return ID

    monkeypatch.setattr(mod.escrita, "gravar_sugestao", gravar)
    return salvas


def _srv(pool: Any = None, devops: Any = None) -> Servico:
    return Servico(pool or PoolFalso(), None, None, devops, relogio=lambda: AGORA)


def test_analisar_projeto_grava_sugestao_pendente(gravadas: list[Any]) -> None:
    r = _srv().analisar_projeto(PROJETO, "evento")
    assert r == {"projeto_id": PROJETO, "status": "criada", "sugestao_id": str(ID)}
    sug = gravadas[-1]
    assert sug.usou_fallback
    assert sug.origem == "evento"
    assert sug.markdown.startswith("🚨 ALERTA DE GARGALO")


def test_projeto_inexistente(gravadas: list[Any]) -> None:
    assert _srv(PoolFalso(None)).analisar_projeto("x", "sweep")["status"] == "projeto_inexistente"
    assert gravadas == []


def test_ja_pendente_nao_grava(gravadas: list[Any], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mod.escrita, "existe_pendente", lambda _c, _h: True)
    assert _srv().analisar_projeto(PROJETO, "sweep")["status"] == "ja_pendente"
    assert gravadas == []


def test_analisar_item_rele_dependencias_e_tolera_falha(gravadas: list[Any]) -> None:
    devops = SimpleNamespace(dependencias=lambda ids: [(ids[0], "System.LinkTypes.Dependency-Reverse", 9)])
    assert _srv(devops=devops).analisar_item(101)["status"] == "criada"
    assert ("rel", [(101, "System.LinkTypes.Dependency-Reverse", 9)]) in gravadas

    def quebra(_ids: list[int]) -> list[Any]:
        raise RuntimeError("DevOps fora")

    assert _srv(devops=SimpleNamespace(dependencias=quebra)).analisar_item(101)["status"] == "criada"
    assert _srv().analisar_item(999)["status"] == "item_inexistente"


def test_sweep_continua_quando_um_projeto_falha(gravadas: list[Any], monkeypatch: pytest.MonkeyPatch) -> None:
    original = mod.carregar_snapshot

    def snap(_c: Any, p: str, *_a: Any) -> Any:
        if p == "quebrado":
            raise RuntimeError("sql")
        return original(_c, p, *_a)

    monkeypatch.setattr(mod, "carregar_snapshot", snap)
    r = _srv().sweep()
    assert [x["status"] for x in r] == ["criada", "erro"]
