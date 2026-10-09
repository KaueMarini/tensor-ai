from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, cast

from radar_analytics.domain.calendario import FUSO
from radar_analytics.domain.fluxo import categoria_estado
from radar_analytics.domain.models import (
    ColunaFluxo,
    ConfigAnalise,
    Pessoa,
    RegrasGerais,
    Task,
    Transicao,
)

Linha = Mapping[str, Any]
VERDADEIRO = frozenset({"yes", "sim", "true", "1"})
CAMPO_PRIORIDADE = "Microsoft.VSTS.Common.Priority"


def _f(v: Any) -> float | None:
    if v is None:
        return None
    return float(v) if isinstance(v, int | float | Decimal) else float(str(v))


def data_local(v: datetime | date | None) -> date | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=FUSO)).astimezone(FUSO).date()
    return v


def regras(linha: Linha | None) -> RegrasGerais:
    if linha is None:
        return RegrasGerais()
    return RegrasGerais(
        jornada_dia=_f(linha["jornada_dia"]) or 8.0,
        foco=_f(linha["foco"]) or 0.75,
        atencao=_f(linha["limite_atencao"]) or 0.8,
        sobrecarga=_f(linha["limite_sobrecarga"]) or 1.0,
    )


def pessoa(linha: Linha) -> Pessoa:
    return Pessoa(
        id=str(linha["id"]),
        nome=str(linha["nome"] or ""),
        funcao=linha.get("funcao"),
        skills=tuple(linha.get("skills") or ()),
        jornada_dia=_f(linha.get("jornada_dia")),
        foco=_f(linha.get("foco")),
    )


def config(analise: Linha | None, fluxo: Iterable[Linha]) -> ConfigAnalise:
    colunas: list[ColunaFluxo] = []
    wip_pessoa = 3
    for f in fluxo:
        if f["coluna"] == "*":
            wip_pessoa = int(f["limite_wip_pessoa"] or wip_pessoa)
            continue
        colunas.append(
            ColunaFluxo(
                coluna=f["coluna"],
                tipo=f["tipo"],
                sla_horas_uteis=_f(f["sla_horas_uteis"]),
                limite_wip_coluna=f["limite_wip_coluna"],
            )
        )
    if analise is None:
        return ConfigAnalise(limite_wip_pessoa=wip_pessoa, colunas=tuple(colunas))
    return ConfigAnalise(
        limite_wip_pessoa=wip_pessoa,
        tags_bloqueio=tuple(analise["tags_bloqueio"] or ()),
        campo_horas_carga=analise["campo_horas_carga"],
        horas_fallback_padrao=_f(analise["horas_fallback_padrao"]) or 0.0,
        horas_fallback_por_tag={k: float(v) for k, v in (analise["horas_fallback_por_tag"] or {}).items()},
        percentil_referencia=_f(analise["percentil_referencia"]) or 0.85,
        colunas=tuple(colunas),
    )


def _prioridade(fields: Mapping[str, Any]) -> int | None:
    v = fields.get(CAMPO_PRIORIDADE)
    try:
        return None if v is None else int(v)
    except (TypeError, ValueError):
        return None


def task(linha: Linha, campo_bloqueio: str | None) -> Task:
    fields: Mapping[str, Any] = linha.get("fields") or {}
    bloqueio = fields.get(campo_bloqueio) if campo_bloqueio else None
    return Task(
        id=int(linha["devops_id"]),
        projeto_id=str(linha["projeto_id"]),
        tipo=str(linha["tipo"]),
        titulo=str(linha["titulo"]),
        estado=linha["estado"],
        categoria=categoria_estado(linha["estado"]),
        sprint_id=None if linha["sprint_id"] is None else str(linha["sprint_id"]),
        responsavel_id=None if linha["responsavel_id"] is None else str(linha["responsavel_id"]),
        horas_restantes=_f(linha["horas_restantes"]),
        horas_estimadas=_f(linha["horas_estimadas"]),
        horas_concluidas=_f(linha["horas_concluidas"]),
        inicio=data_local(linha["start_date"]),
        fim=data_local(linha["finish_date"] or linha["target_date"]),
        tags=tuple(linha["tags"] or ()),
        feature_id=linha["feature_devops_id"],
        feature_tags=tuple(linha.get("feature_tags") or ()),
        tem_filhos=bool(linha.get("tem_filhos")),
        prioridade=_prioridade(fields),
        criado_em=linha.get("criado_devops") or linha.get("criado_em"),
        bloqueado=str(bloqueio).strip().lower() in VERDADEIRO if bloqueio is not None else False,
        depende_de=tuple(int(x) for x in (linha.get("depende_de") or ())),
    )


CampoTransicao = Literal["System.State", "System.BoardColumn"]
CAMPOS_TRANSICAO: tuple[CampoTransicao, ...] = ("System.State", "System.BoardColumn")


def transicao(linha: Linha) -> Transicao:
    return Transicao(
        work_item_id=int(linha["work_item_id"]),
        campo=cast(CampoTransicao, linha["campo"]),
        de=linha["de"],
        para=linha["para"],
        changed_at=linha["changed_at"],
        changed_rev=int(linha["changed_rev"]),
    )


def transicoes_de_updates(work_item_id: int, updates: Iterable[Mapping[str, Any]]) -> list[Transicao]:
    out: list[Transicao] = []
    for u in updates:
        fields: Mapping[str, Any] = u.get("fields") or {}
        quando_raw = (fields.get("System.ChangedDate") or {}).get("newValue")
        rev = u.get("rev")
        if not quando_raw or rev is None:
            continue
        quando = datetime.fromisoformat(str(quando_raw).replace("Z", "+00:00"))
        for campo in CAMPOS_TRANSICAO:
            mudanca = fields.get(campo)
            if not isinstance(mudanca, Mapping) or "newValue" not in mudanca:
                continue
            de, para = mudanca.get("oldValue"), mudanca.get("newValue")
            if de == para:
                continue
            out.append(
                Transicao(
                    work_item_id=work_item_id,
                    campo=campo,
                    de=de,
                    para=para,
                    changed_at=quando,
                    changed_rev=int(rev),
                )
            )
    return out


def dependencias_de_relacoes(item: Mapping[str, Any]) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    for r in item.get("relations") or []:
        tipo = str(r.get("rel") or "")
        if not tipo.startswith("System.LinkTypes.Dependency"):
            continue
        url = str(r.get("url") or "")
        alvo = url.rstrip("/").rsplit("/", 1)[-1]
        if alvo.isdigit():
            out.append((tipo, int(alvo)))
    return out
