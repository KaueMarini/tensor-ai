from __future__ import annotations

import threading
import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from radar_analytics.api.main import criar_app

SEGREDO = "s3gr3do"
H = {"x-analytics-secret": SEGREDO}


class ServicoFalso:
    def __init__(self, atraso_sweep: float = 0.0) -> None:
        self.itens: list[int] = []
        self.sweeps = 0
        self.atraso_sweep = atraso_sweep
        self.feito = threading.Event()

    def analisar_item(self, work_item_id: int) -> dict[str, Any]:
        self.itens.append(work_item_id)
        self.feito.set()
        if work_item_id == 666:
            raise RuntimeError("falha simulada")
        return {"status": "criada"}

    def sweep(self) -> list[dict[str, Any]]:
        time.sleep(self.atraso_sweep)
        self.sweeps += 1
        self.feito.set()
        return [{"status": "criada"}, {"status": "sem_acao"}]


def _cliente(srv: ServicoFalso, debounce: float = 0.05, segredo: str | None = SEGREDO) -> TestClient:
    return TestClient(criar_app(srv, segredo, debounce, {"versao_prompt": "analista-fluxo.v1"}))


def _esperar(cond: Any, limite: float = 2.0) -> None:
    fim = time.monotonic() + limite
    while time.monotonic() < fim:
        if cond():
            return
        time.sleep(0.01)
    raise AssertionError("condição não ocorreu a tempo")


def test_health_sem_autenticacao() -> None:
    with _cliente(ServicoFalso()) as c:
        r = c.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "debounce_pendentes": 0, "versao_prompt": "analista-fluxo.v1"}


@pytest.mark.parametrize("cabecalho", [{}, {"x-analytics-secret": "errado"}, {"x-analytics-secret": ""}])
def test_rotas_exigem_segredo(cabecalho: dict[str, str]) -> None:
    with _cliente(ServicoFalso()) as c:
        assert c.post("/analyze/event", json={"work_item_id": 1}, headers=cabecalho).status_code == 401
        assert c.post("/analyze/sweep", headers=cabecalho).status_code == 401


def test_sem_segredo_configurado_recusa() -> None:
    with _cliente(ServicoFalso(), segredo=None) as c:
        assert c.post("/analyze/sweep", headers=H).status_code == 503


def test_evento_valida_corpo() -> None:
    with _cliente(ServicoFalso()) as c:
        assert c.post("/analyze/event", json={"work_item_id": 0}, headers=H).status_code == 422


def test_debounce_junta_rajada_do_mesmo_item() -> None:
    srv = ServicoFalso()
    with _cliente(srv, debounce=0.2) as c:
        for _ in range(5):
            r = c.post("/analyze/event", json={"work_item_id": 42, "evento_id": 1}, headers=H)
            assert r.status_code == 202
        c.post("/analyze/event", json={"work_item_id": 7}, headers=H)
        assert c.get("/health").json()["debounce_pendentes"] == 2
        _esperar(lambda: len(srv.itens) == 2)
        time.sleep(0.3)
        assert sorted(srv.itens) == [7, 42]


def test_falha_na_analise_nao_derruba_a_api() -> None:
    srv = ServicoFalso()
    with _cliente(srv, debounce=0.01) as c:
        c.post("/analyze/event", json={"work_item_id": 666}, headers=H)
        _esperar(srv.feito.is_set)
        assert c.get("/health").status_code == 200


def test_sweep_em_segundo_plano_e_sem_concorrencia() -> None:
    srv = ServicoFalso(atraso_sweep=0.3)
    with _cliente(srv) as c:
        assert c.post("/analyze/sweep", headers=H).json() == {"iniciado": True}
        time.sleep(0.05)
        assert c.post("/analyze/sweep", headers=H).json()["iniciado"] is False
        _esperar(lambda: srv.sweeps == 1)
