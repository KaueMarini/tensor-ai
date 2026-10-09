from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Iterator
from typing import Any

from radar_analytics import numeros
from radar_analytics.agent.llm import RespostaLLM

MAX_LINHAS_ALERTA = 2
MAX_CHARS_ALERTA = 320
MAX_CHARS_RECOMENDACAO = 220
MAX_CHARS_JUSTIFICATIVA = 400

_NUMERO = re.compile(r"(?<![\w.,])(\d+(?:[.,]\d+)?)(\s*%)?")
_NUMERO_EM_TEXTO = re.compile(r"\d+(?:[.,]\d+)?")

TERMOS_DESEMPENHO = (
    r"\blent[oa]s?\b",
    r"\blentidao\b",
    r"\bimprodutiv",
    r"\bnao rende",
    r"\brende pouco\b",
    r"\bbaixo desempenho\b",
    r"\bdesempenho (ruim|fraco|baixo)\b",
    r"\b(baixa|pouca) produtividade\b",
    r"\bprodutividade (baixa|ruim)\b",
    r"\bineficien",
    r"\bincompeten",
    r"\bpreguic",
    r"\bdesleixad",
    r"\bfraco\b|\bfraca\b",
    r"\bculpa\b",
)
VERBOS_CONCLUIDOS = (
    r"\bexecutei\b",
    r"\brealoquei\b",
    r"\bmovi\b",
    r"\breatribuí\b",
    r"\batribuí\b",
    r"\btransferi\b",
    r"\bapliquei\b",
    r"\balterei\b",
    r"\bmudei\b",
    r"\bpausei\b",
    r"\bfoi (realocad|movid|reatribuíd|atribuíd|transferid|aplicad|pausad)",
    r"\bjá (foi|foram) (realocad|movid|reatribuíd|atribuíd|transferid|aplicad|pausad)",
)


def _sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def _paraf(v: str) -> float:
    return float(v.replace(",", "."))


def numeros_permitidos(dados: Any) -> set[float]:
    out: set[float] = set()

    def visitar(v: Any) -> None:
        if isinstance(v, bool) or v is None:
            return
        if isinstance(v, int | float):
            out.add(float(v))
        elif isinstance(v, str):
            out.update(_paraf(n) for n in _NUMERO_EM_TEXTO.findall(v))
        elif isinstance(v, dict):
            for k, x in v.items():
                visitar(k)
                visitar(x)
        elif isinstance(v, list | tuple):
            for x in v:
                visitar(x)

    visitar(dados)
    return out


def _numeros_do_texto(texto: str) -> Iterator[tuple[float, bool, str]]:
    for m in _NUMERO.finditer(texto):
        yield _paraf(m.group(1)), bool(m.group(2)), m.group(0).strip()


def _textos(r: RespostaLLM) -> dict[str, str]:
    return {
        "alerta": r.alerta,
        "recomendacao": r.recomendacao,
        "justificativa.pareto": r.justificativa.pareto,
        "justificativa.tempo_ciclo": r.justificativa.tempo_ciclo,
        "justificativa.esforco_impacto": r.justificativa.esforco_impacto,
    }


def validar(r: RespostaLLM, dados: dict[str, Any], acoes_validas: Iterable[str]) -> list[str]:
    erros: list[str] = []
    if r.acao_id not in set(acoes_validas):
        erros.append(f"acao_id inexistente: {r.acao_id!r} (use um dos candidatos)")

    permitidos = numeros_permitidos(dados)
    for campo, texto in _textos(r).items():
        for valor, eh_pct, original in _numeros_do_texto(texto):
            tol = numeros.TOLERANCIA_PERCENTUAL if eh_pct else numeros.TOLERANCIA_HORAS
            if not any(abs(valor - p) <= tol + 1e-9 for p in permitidos):
                erros.append(f"{campo}: número {original!r} não existe nas evidências")

        base = _sem_acento(texto)
        for padrao in TERMOS_DESEMPENHO:
            if achado := re.search(padrao, base):
                erros.append(f"{campo}: termo de avaliação de desempenho {achado.group(0)!r}")
        minusculo = texto.lower()
        for padrao in VERBOS_CONCLUIDOS:
            if achado := re.search(padrao, minusculo):
                erros.append(f"{campo}: verbo de ação concluída {achado.group(0)!r} (é só sugestão)")

    return erros + _tamanhos(r)


def _tamanhos(r: RespostaLLM) -> list[str]:
    erros: list[str] = []
    linhas_alerta = [x for x in r.alerta.strip().splitlines() if x.strip()]
    if not linhas_alerta:
        erros.append("alerta vazio")
    if len(linhas_alerta) > MAX_LINHAS_ALERTA or len(r.alerta) > MAX_CHARS_ALERTA:
        erros.append(f"alerta longo demais (máx. {MAX_LINHAS_ALERTA} linhas, {MAX_CHARS_ALERTA} caracteres)")
    rec = r.recomendacao.strip()
    if not rec or "\n" in rec or len(rec) > MAX_CHARS_RECOMENDACAO:
        erros.append(f"recomendação deve ter 1 linha (máx. {MAX_CHARS_RECOMENDACAO} caracteres)")
    for campo in ("pareto", "tempo_ciclo", "esforco_impacto"):
        texto = getattr(r.justificativa, campo)
        if not texto.strip() or len(texto) > MAX_CHARS_JUSTIFICATIVA:
            erros.append(f"justificativa.{campo} vazia ou maior que {MAX_CHARS_JUSTIFICATIVA} caracteres")
    return erros
