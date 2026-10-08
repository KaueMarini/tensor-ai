"""Agente: entrada pseudonimizada, validador, render, fallback e orquestração (LLM sempre mockado)."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx
import pytest

from golden.cenario_seed import HOJE, PESSOAS, snapshot
from radar_analytics.agent import analista
from radar_analytics.agent.analista import (
    VazamentoDeDados,
    acao_estruturada,
    escolher_texto,
    gerar_sugestao,
)
from radar_analytics.agent.entrada import hash_entrada, montar_entrada, vazamentos
from radar_analytics.agent.llm import (
    AnthropicLLM,
    FalhaLLM,
    Justificativa,
    RespostaLLM,
    interpretar,
    mensagens_da_tentativa,
)
from radar_analytics.agent.prompt_loader import Prompt, PromptAusente, carregar
from radar_analytics.agent.render import fallback, fmt, render
from radar_analytics.agent.validador import numeros_permitidos, validar
from radar_analytics.domain.analise import analisar
from radar_analytics.domain.calendario import FUSO

AGORA = datetime(2026, 10, 5, 9, tzinfo=FUSO)
PROMPT = Prompt(versao="v1", texto="Você é o analista de fluxo.")


@pytest.fixture(scope="module")
def cenario() -> tuple[Any, Any, dict[str, Any]]:
    s = snapshot()
    a = analisar(s, HOJE, AGORA)
    dados, _ = montar_entrada(a, s, "Atlântico Docas")
    return a, s, dados


def _kaue(dados: dict[str, Any]) -> dict[str, Any]:
    return next(c for c in dados["candidatos"] if c["tipo"] == "reatribuir" and c["motivo"] == "sobrecarga")


def _boa(dados: dict[str, Any]) -> RespostaLLM:
    c = _kaue(dados)
    return RespostaLLM(
        acao_id=c["acao_id"],
        alerta=f"{c['de']} está com {fmt(c['antes'][0]['semana_pct'])}% de utilização na semana.",
        recomendacao=f"Sugestão: reatribuir {c['task']} ({fmt(c['horas'])}h) para {c['para']}.",
        justificativa=Justificativa(
            pareto="Sobrecarga é a principal causa: 5 tasks, 62,5% do total.",
            tempo_ciclo=(
                f"Pico cai de {fmt(c['antes'][0]['pico_pct'])}% para {fmt(c['depois'][0]['pico_pct'])}%."
            ),
            esforco_impacto=f"Quadrante {c['quadrante']}, {fmt(c['horas'])}h movidas.",
        ),
    )


class FakeLLM:
    modelo = "fake"

    def __init__(self, *respostas: RespostaLLM | Exception) -> None:
        self.respostas = list(respostas)
        self.chamadas: list[tuple[RespostaLLM | None, list[str] | None]] = []

    def responder(
        self,
        sistema: str,
        entrada: dict[str, Any],
        rejeitada: RespostaLLM | None = None,
        erros: list[str] | None = None,
    ) -> RespostaLLM:
        self.chamadas.append((rejeitada, erros))
        r = self.respostas.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


# --------------------------------------------------------------------------- entrada


def test_entrada_sem_nome_email_nem_id_real(cenario: Any) -> None:
    a, s, dados = cenario
    texto = json.dumps(dados, ensure_ascii=False)
    for p in PESSOAS:
        assert p.nome not in texto
        assert f'"{p.id}"' not in texto
    assert s.projeto_id not in texto
    assert '"s1"' not in texto  # id de sprint vira nome
    assert all(c["task"].startswith("T") for c in dados["candidatos"])
    assert "Kauê" not in texto
    _, mapa = montar_entrada(a, s, "Atlântico Docas")
    assert vazamentos(dados, s, mapa) == []


def test_vazamento_e_detectado(cenario: Any) -> None:
    a, s, dados = cenario
    _, mapa = montar_entrada(a, s, "x")
    sujo = {**dados, "projeto": "Kauê Marini"}
    assert "Kauê Marini" in vazamentos(sujo, s, mapa)


def test_hash_ignora_hoje_e_muda_com_versao(cenario: Any) -> None:
    _, _, dados = cenario
    h = hash_entrada(dados, "v1")
    assert h == hash_entrada({**dados, "hoje": "2030-01-01"}, "v1")
    assert h != hash_entrada(dados, "v2")
    assert h != hash_entrada({**dados, "candidatos": []}, "v1")


# --------------------------------------------------------------------------- validador


def test_resposta_correta_passa(cenario: Any) -> None:
    _, _, dados = cenario
    ids = [c["acao_id"] for c in dados["candidatos"]]
    assert validar(_boa(dados), dados, ids) == []


def test_numero_inventado(cenario: Any) -> None:
    _, _, dados = cenario
    r = _boa(dados)
    r = r.model_copy(update={"alerta": "Utilização de 173% na semana."})
    erros = validar(r, dados, [r.acao_id])
    assert any("173%" in e for e in erros)


def test_tolerancia_de_arredondamento(cenario: Any) -> None:
    _, _, dados = cenario
    assert 116.7 not in numeros_permitidos(dados)
    r = _boa(dados).model_copy(update={"alerta": "Utilização de 116,7% na semana."})
    assert validar(r, dados, [r.acao_id]) == []  # 117 ± 1 p.p.
    r2 = _boa(dados).model_copy(update={"alerta": "São 35,05h de carga."})
    assert validar(r2, dados, [r2.acao_id]) == []  # 35 ± 0,1 h
    r3 = _boa(dados).model_copy(update={"alerta": "São 35,5h de carga."})
    assert validar(r3, dados, [r3.acao_id]) != []


def test_acao_id_inexistente(cenario: Any) -> None:
    _, _, dados = cenario
    r = _boa(dados).model_copy(update={"acao_id": "A-inventada"})
    erros = validar(r, dados, [c["acao_id"] for c in dados["candidatos"]])
    assert any("acao_id inexistente" in e for e in erros)


@pytest.mark.parametrize(
    "frase", ["Dev X está lento.", "Ela é improdutiva.", "Ele não rende.", "Baixa produtividade do time."]
)
def test_termo_de_desempenho(cenario: Any, frase: str) -> None:
    _, _, dados = cenario
    r = _boa(dados).model_copy(update={"alerta": frase})
    assert any("desempenho" in e for e in validar(r, dados, [r.acao_id]))


@pytest.mark.parametrize(
    "frase", ["Realoquei T1.", "Movi a task.", "Executei a mudança.", "A task foi reatribuída."]
)
def test_verbo_de_acao_concluida(cenario: Any, frase: str) -> None:
    _, _, dados = cenario
    r = _boa(dados).model_copy(update={"recomendacao": frase})
    assert any("ação concluída" in e for e in validar(r, dados, [r.acao_id]))


def test_presente_do_indicativo_nao_e_acao_concluida(cenario: Any) -> None:
    _, _, dados = cenario
    r = _boa(dados).model_copy(update={"recomendacao": "Sugestão: o gestor reatribui T1 e move a outra."})
    assert validar(r, dados, [r.acao_id]) == []


def test_tamanhos(cenario: Any) -> None:
    _, _, dados = cenario
    r = _boa(dados).model_copy(update={"alerta": "a\nb\nc", "recomendacao": "linha 1\nlinha 2"})
    erros = validar(r, dados, [r.acao_id])
    assert any("alerta longo" in e for e in erros)
    assert any("1 linha" in e for e in erros)
    vazio = _boa(dados).model_copy(
        update={
            "alerta": " ",
            "justificativa": Justificativa(pareto="", tempo_ciclo="x", esforco_impacto="y"),
        }
    )
    erros2 = validar(vazio, dados, [vazio.acao_id])
    assert "alerta vazio" in erros2
    assert any("justificativa.pareto" in e for e in erros2)


# --------------------------------------------------------------------------- render e fallback


def test_render_formato_estrito(cenario: Any) -> None:
    _, _, dados = cenario
    md = render(_boa(dados))
    titulos = [
        "🚨 ALERTA DE GARGALO",
        "🛠️ RECOMENDAÇÃO DE AÇÃO",
        "📊 JUSTIFICATIVA TÉCNICA (Explainable AI)",
        "- **Pareto:**",
        "- **Mapa de Calor / Tempo de Ciclo:**",
        "- **Esforço vs Impacto:**",
    ]
    posicoes = [md.index(t) for t in titulos]
    assert posicoes == sorted(posicoes)


def test_fallback_passa_no_validador_para_todo_candidato(cenario: Any) -> None:
    _, _, dados = cenario
    ids = [c["acao_id"] for c in dados["candidatos"]]
    for aid in ids:
        r = fallback(dados, aid)
        assert r.acao_id == aid
        assert validar(r, dados, ids) == [], (aid, validar(r, dados, ids))


def test_fallback_sem_pareto_e_com_referencia(cenario: Any) -> None:
    _, _, dados = cenario
    d2 = {**dados, "pareto": {"total_tasks_afetadas": 0, "causas": []}}
    d2["tempo_de_ciclo"] = {**dados["tempo_de_ciclo"], "cycle_time_referencia_dias": 4.5}
    r = fallback(d2)
    assert "Sem causas" in r.justificativa.pareto
    assert "4,5 dias" in r.justificativa.tempo_ciclo
    assert fmt(None) == "—"


# --------------------------------------------------------------------------- orquestração


def test_llm_ok_na_primeira(cenario: Any) -> None:
    _, _, dados = cenario
    ids = [c["acao_id"] for c in dados["candidatos"]]
    llm = FakeLLM(_boa(dados))
    r, usou_fallback, hist = escolher_texto(dados, ids, llm, PROMPT)
    assert (r.acao_id, usou_fallback, hist) == (_boa(dados).acao_id, False, [[]])


def test_llm_corrige_na_segunda_com_feedback(cenario: Any) -> None:
    _, _, dados = cenario
    ids = [c["acao_id"] for c in dados["candidatos"]]
    ruim = _boa(dados).model_copy(update={"alerta": "Utilização de 999%."})
    llm = FakeLLM(ruim, _boa(dados))
    _, usou_fallback, hist = escolher_texto(dados, ids, llm, PROMPT)
    assert not usou_fallback
    assert llm.chamadas[1][0] == ruim
    erros = llm.chamadas[1][1]
    assert erros
    assert "999%" in erros[0]
    assert len(hist) == 2


def test_llm_falha_duas_vezes_usa_fallback_com_a_acao_escolhida(cenario: Any) -> None:
    _, _, dados = cenario
    ids = [c["acao_id"] for c in dados["candidatos"]]
    escolhida = ids[-1]
    ruim = _boa(dados).model_copy(update={"acao_id": escolhida, "alerta": "Ele é lento."})
    r, usou_fallback, _ = escolher_texto(dados, ids, FakeLLM(ruim, ruim), PROMPT)
    assert usou_fallback
    assert r.acao_id == escolhida
    assert validar(r, dados, ids) == []


def test_erro_do_llm_ou_sem_prompt_vai_para_fallback(cenario: Any) -> None:
    _, _, dados = cenario
    ids = [c["acao_id"] for c in dados["candidatos"]]
    r, usou, hist = escolher_texto(dados, ids, FakeLLM(FalhaLLM("API 529")), PROMPT)
    assert usou
    assert hist == [["falha do LLM: API 529"]]
    assert r.acao_id == ids[0]
    assert escolher_texto(dados, ids, None, PROMPT)[1]
    assert escolher_texto(dados, ids, FakeLLM(), None)[1]


def test_gerar_sugestao_com_ids_reais_so_na_acao(cenario: Any) -> None:
    a, s, dados = cenario
    sug = gerar_sugestao(a, s, "Atlântico Docas", "evento", FakeLLM(_boa(dados)), PROMPT)
    assert sug is not None
    assert sug.acao["tipo"] == "reatribuir"
    assert sug.acao["de_pessoa_id"] == "kaue"
    assert sug.acao["work_item_id"] in {101, 102, 103, 104, 105}
    assert "para_pessoa_id" in sug.acao
    assert "Kauê" not in sug.markdown
    assert sug.markdown.startswith("🚨 ALERTA DE GARGALO")
    assert sug.versao_prompt == "analista-fluxo.v1"
    assert not sug.usou_fallback
    assert sug.payload["modelo"] == "fake"
    assert sug.impacto_antes["pessoas"][0]["pessoa"].startswith("Dev ")


def test_gerar_sugestao_idempotente_sem_chamar_llm(cenario: Any) -> None:
    a, s, _ = cenario
    llm = FakeLLM()
    assert gerar_sugestao(a, s, "x", "sweep", llm, PROMPT, ja_pendente=lambda _h: True) is None
    assert llm.chamadas == []
    sem = a.model_copy(update={"candidatos": ()})
    assert gerar_sugestao(sem, s, "x", "sweep", llm, PROMPT) is None


def test_nome_de_pessoa_no_projeto_vira_pseudonimo(cenario: Any) -> None:
    a, s, _ = cenario
    dados, _ = montar_entrada(a, s, "Projeto do Nicolas")
    assert dados["projeto"].startswith("Projeto do Dev ")


def test_gerar_sugestao_bloqueia_vazamento(cenario: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    a, s, dados = cenario

    _, mapa = montar_entrada(a, s, "x")
    monkeypatch.setattr(analista, "montar_entrada", lambda *_: ({**dados, "projeto": "Nicolas"}, mapa))
    with pytest.raises(VazamentoDeDados):
        gerar_sugestao(a, s, "x", "sweep", None, None)


def test_acao_estruturada_mover_sprint(cenario: Any) -> None:
    a, _, _ = cenario
    mover = next(c for c in a.candidatos if c.tipo == "mover_sprint")
    assert acao_estruturada(mover) == {
        "tipo": "mover_sprint",
        "work_item_id": mover.task_id,
        "de_pessoa_id": mover.de_pessoa_id,
        "para_sprint_id": mover.para_sprint_id,
    }


# --------------------------------------------------------------------- adaptador Anthropic (cliente falso)


def _resp(texto: str | None, stop: str = "end_turn") -> SimpleNamespace:
    conteudo = [] if texto is None else [SimpleNamespace(type="text", text=texto)]
    return SimpleNamespace(
        content=conteudo, stop_reason=stop, model="claude-opus-5-5", usage=SimpleNamespace(output_tokens=10)
    )


class _ClienteFalso:
    def __init__(self, efeito: Any) -> None:
        self.kwargs: dict[str, Any] = {}

        def create(**kw: Any) -> Any:
            self.kwargs = kw
            if isinstance(efeito, Exception):
                raise efeito
            return efeito

        self.beta = SimpleNamespace(messages=SimpleNamespace(create=create))


def _llm(efeito: Any) -> tuple[AnthropicLLM, _ClienteFalso]:
    c = _ClienteFalso(efeito)
    return AnthropicLLM("k", "claude-opus-5-5", cliente=c), c  # type: ignore[arg-type]


def test_adaptador_anthropic_monta_pedido_e_interpreta(cenario: Any) -> None:
    _, _, dados = cenario
    boa = _boa(dados)
    llm, cliente = _llm(_resp(boa.model_dump_json()))
    assert llm.responder("sis", dados) == boa
    kw = cliente.kwargs
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["output_config"]["effort"] == "low"
    assert kw["fallbacks"] == "default"
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "tool_choice" not in kw


def test_adaptador_anthropic_erros() -> None:
    with pytest.raises(FalhaLLM, match="recusa"):
        _llm(_resp("{}", stop="refusal"))[0].responder("s", {})
    with pytest.raises(FalhaLLM, match="sem texto"):
        _llm(_resp(None, stop="max_tokens"))[0].responder("s", {})
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    erro_api = anthropic.APIStatusError("x", response=httpx.Response(529, request=req), body=None)
    with pytest.raises(FalhaLLM, match="529"):
        _llm(erro_api)[0].responder("s", {})
    with pytest.raises(FalhaLLM, match="conexão"):
        _llm(anthropic.APIConnectionError(request=req))[0].responder("s", {})
    with pytest.raises(FalhaLLM, match="formato"):
        interpretar('{"acao_id": 1}')


def test_mensagens_da_segunda_tentativa(cenario: Any) -> None:
    _, _, dados = cenario
    msgs = mensagens_da_tentativa(dados, _boa(dados), ["erro x"])
    assert [m["role"] for m in msgs] == ["user", "assistant", "user"]
    assert "erro x" in str(msgs[2]["content"])


# --------------------------------------------------------------------------- prompt


def test_prompt_loader(tmp_path: Path) -> None:
    (tmp_path / "analista-fluxo.v1.md").write_text("  texto  \n", encoding="utf-8")
    p = carregar("v1", tmp_path)
    assert (p.texto, p.rotulo) == ("texto", "analista-fluxo.v1")
    with pytest.raises(PromptAusente):
        carregar("v2", tmp_path)
    (tmp_path / "analista-fluxo.v3.md").write_text("", encoding="utf-8")
    with pytest.raises(PromptAusente):
        carregar("v3", tmp_path)
    with pytest.raises(ValueError, match="inválida"):
        carregar("../x", tmp_path)
