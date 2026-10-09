from datetime import UTC, date, datetime
from decimal import Decimal

import httpx
import pytest

from radar_analytics.devops.client import DevOpsLeitura
from radar_analytics.domain.models import Categoria
from radar_analytics.repositories import mapeamento as m

UPDATES = [
    {
        "id": 1,
        "rev": 1,
        "fields": {
            "System.State": {"newValue": "New"},
            "System.ChangedDate": {"newValue": "2026-10-05T12:00:00Z"},
        },
    },
    {
        "id": 2,
        "rev": 2,
        "fields": {
            "System.State": {"oldValue": "New", "newValue": "Active"},
            "System.BoardColumn": {"oldValue": "To Do", "newValue": "Doing"},
            "System.ChangedDate": {
                "oldValue": "2026-10-05T12:00:00Z",
                "newValue": "2026-10-06T13:30:00.123Z",
            },
        },
    },
    {"id": 3, "rev": 3, "fields": {"System.Title": {"oldValue": "a", "newValue": "b"}}},
    {"id": 4, "rev": 4, "fields": {"System.Tags": {"newValue": "x"}}},
    {"id": 5, "rev": 5},
]


def test_transicoes_de_updates() -> None:
    t = m.transicoes_de_updates(7, UPDATES)
    assert [(x.campo, x.de, x.para, x.changed_rev) for x in t] == [
        ("System.State", None, "New", 1),
        ("System.State", "New", "Active", 2),
        ("System.BoardColumn", "To Do", "Doing", 2),
    ]
    assert t[1].changed_at == datetime(2026, 10, 6, 13, 30, 0, 123000, tzinfo=UTC)


def test_dependencias_de_relacoes() -> None:
    item = {
        "id": 5,
        "relations": [
            {"rel": "System.LinkTypes.Dependency-Reverse", "url": "https://x/_apis/wit/workItems/9"},
            {"rel": "System.LinkTypes.Hierarchy-Reverse", "url": "https://x/_apis/wit/workItems/1"},
            {"rel": "System.LinkTypes.Dependency-Forward", "url": "https://x/_apis/wit/workItems/abc"},
        ],
    }
    assert m.dependencias_de_relacoes(item) == [("System.LinkTypes.Dependency-Reverse", 9)]
    assert m.dependencias_de_relacoes({}) == []


def test_task_de_linha() -> None:
    linha = {
        "devops_id": 42,
        "projeto_id": "p",
        "tipo": "Task",
        "titulo": "X",
        "estado": "Active",
        "sprint_id": None,
        "responsavel_id": "u1",
        "horas_restantes": Decimal("3.5"),
        "horas_estimadas": None,
        "horas_concluidas": 2,
        "start_date": datetime(2026, 10, 6, 2, tzinfo=UTC),
        "finish_date": None,
        "target_date": datetime(2026, 10, 9, 12, tzinfo=UTC),
        "tags": ["a"],
        "feature_devops_id": 1,
        "feature_tags": ["f"],
        "tem_filhos": False,
        "fields": {"Microsoft.VSTS.Common.Priority": 4, "Microsoft.VSTS.CMMI.Blocked": "Yes"},
        "criado_devops": None,
        "criado_em": datetime(2026, 10, 1, tzinfo=UTC),
        "depende_de": [9],
    }
    t = m.task(linha, "Microsoft.VSTS.CMMI.Blocked")
    assert t.categoria is Categoria.ANDAMENTO
    assert (t.horas_restantes, t.horas_concluidas) == (3.5, 2.0)
    assert (t.inicio, t.fim) == (date(2026, 10, 5), date(2026, 10, 9))
    assert (t.prioridade, t.bloqueado, t.depende_de) == (4, True, (9,))
    assert t.criado_em == datetime(2026, 10, 1, tzinfo=UTC)
    sem = m.task({**linha, "fields": {"Microsoft.VSTS.Common.Priority": "x"}}, None)
    assert (sem.prioridade, sem.bloqueado) == (None, False)


def test_config_e_regras() -> None:
    assert m.regras(None).jornada_dia == 8
    r = m.regras(
        {"jornada_dia": Decimal(8), "foco": Decimal("1"), "limite_atencao": 0.7, "limite_sobrecarga": 1.1}
    )
    assert (r.foco, r.atencao, r.sobrecarga) == (1.0, 0.7, 1.1)
    fluxo = [
        {
            "coluna": "*",
            "tipo": "ativa",
            "sla_horas_uteis": None,
            "limite_wip_coluna": None,
            "limite_wip_pessoa": 2,
        },
        {
            "coluna": "Code Review",
            "tipo": "espera",
            "sla_horas_uteis": Decimal(24),
            "limite_wip_coluna": None,
        },
    ]
    c = m.config(None, fluxo)
    assert c.limite_wip_pessoa == 2
    assert c.colunas[0].sla_horas_uteis == 24
    analise = {
        "tags_bloqueio": ["impedido"],
        "campo_horas_carga": "estimada",
        "horas_fallback_padrao": Decimal(6),
        "horas_fallback_por_tag": {"bug": 2},
        "percentil_referencia": Decimal("0.9"),
    }
    c2 = m.config(analise, fluxo)
    assert (c2.tags_bloqueio, c2.campo_horas_carga, c2.horas_fallback_padrao) == (
        ("impedido",),
        "estimada",
        6,
    )
    assert c2.horas_fallback_por_tag == {"bug": 2.0}


def test_pessoa_e_data_local() -> None:
    p = m.pessoa({"id": "u", "nome": None, "funcao": "QA", "skills": ["a"], "jornada_dia": None, "foco": 0.5})
    assert (p.nome, p.skills, p.foco) == ("", ("a",), 0.5)
    assert m.data_local(None) is None
    assert m.data_local(date(2026, 1, 1)) == date(2026, 1, 1)
    assert m.data_local(datetime(2026, 1, 1, 12)) == date(2026, 1, 1)


def _cliente(handler: object, pausas: list[float]) -> DevOpsLeitura:
    return DevOpsLeitura(
        "https://dev.azure.com/org",
        "pat",
        transport=httpx.MockTransport(handler),
        dormir=pausas.append,
    )


def test_cliente_respeita_retry_after_e_pagina_updates() -> None:
    chamadas: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        chamadas.append(req)
        if len(chamadas) == 1:
            return httpx.Response(429, headers={"Retry-After": "3"})
        return httpx.Response(200, json={"value": UPDATES})

    pausas: list[float] = []
    t = _cliente(handler, pausas).transicoes(7)
    assert len(t) == 3
    assert pausas == [3.0]
    assert chamadas[-1].method == "GET"
    assert chamadas[-1].url.params["api-version"] == "7.1"
    assert chamadas[-1].headers["Authorization"].startswith("Basic ")


def test_cliente_desiste_depois_das_tentativas() -> None:
    pausas: list[float] = []
    cliente = _cliente(lambda _r: httpx.Response(503), pausas)
    with pytest.raises(httpx.HTTPStatusError):
        cliente.transicoes(1)
    assert pausas == [1.0, 2.0, 4.0, 8.0]


def test_cliente_erro_de_rede_tenta_de_novo() -> None:
    n = {"i": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        n["i"] += 1
        if n["i"] == 1:
            raise httpx.ConnectError("caiu", request=req)
        return httpx.Response(200, json={"value": [{"id": 3, "relations": []}, None]})

    pausas: list[float] = []
    assert _cliente(handler, pausas).dependencias([3]) == []
    assert pausas == [1.0]
