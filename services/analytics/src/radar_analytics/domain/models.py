"""Modelos do domínio (imutáveis). Sem I/O: os repositórios montam estes objetos a partir do banco.

Convenções:
- Datas de calendário são `date`; instantes são `datetime` com fuso (os repositórios convertem
  para America/Sao_Paulo antes de chegar aqui).
- Frações (0.8 = 80%) no domínio; percentuais só na saída, via `numeros.pct`.
"""

from __future__ import annotations

from datetime import date, datetime, time
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Valor = float | int | str | bool | None


class _Base(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Evidencia(_Base):
    """Prova de um número: como foi calculado, com o quê, e o resultado (já arredondado)."""

    metrica: str
    formula: str
    entradas: dict[str, Valor | list[Valor]]
    resultado: Valor
    unidade: str = ""


class Categoria(StrEnum):
    """Categoria de estado do processo do DevOps (mesma de `_shared/kanban.ts`)."""

    PROPOSTO = "Proposed"
    ANDAMENTO = "InProgress"
    RESOLVIDO = "Resolved"
    CONCLUIDO = "Completed"
    REMOVIDO = "Removed"


class RegrasGerais(_Base):
    """Regras do gestor (tabela `regra_capacidade`); padrão de mercado em `PADRAO_MERCADO`."""

    jornada_dia: float = 8.0
    foco: float = 0.75
    atencao: float = 0.8
    sobrecarga: float = 1.0


PADRAO_MERCADO = RegrasGerais()


class Pessoa(_Base):
    id: str
    nome: str
    funcao: str | None = None
    skills: tuple[str, ...] = ()
    jornada_dia: float | None = None
    foco: float | None = None


class Sprint(_Base):
    id: str
    projeto_id: str
    nome: str
    inicio: date | None
    fim: date | None


class CapacidadeTime(_Base):
    """Capacity do DevOps: horas/dia da pessoa num time, numa sprint."""

    sprint_id: str
    time_id: str
    pessoa_id: str
    capacidade_dia: float


class Alocacao(_Base):
    """Horas/dia que o gestor dedica da pessoa ao projeto (sobrepõe a Capacity)."""

    projeto_id: str
    pessoa_id: str
    horas_dia: float


class Folga(_Base):
    """Ausência: pessoal (pessoa_id) ou do time inteiro (pessoa_id nulo + time_id).

    Days off do DevOps têm sprint_id/time_id; a tabela `ausencia` vem só com pessoa_id.
    """

    inicio: date
    fim: date
    pessoa_id: str | None = None
    time_id: str | None = None
    sprint_id: str | None = None
    tipo: str = "dayoff"


class Task(_Base):
    id: int
    projeto_id: str
    tipo: str
    titulo: str
    estado: str | None
    categoria: Categoria
    sprint_id: str | None
    responsavel_id: str | None
    horas_restantes: float | None = None
    horas_estimadas: float | None = None
    horas_concluidas: float | None = None
    inicio: date | None = None
    fim: date | None = None
    tags: tuple[str, ...] = ()
    feature_id: int | None = None
    feature_tags: tuple[str, ...] = ()
    tem_filhos: bool = False
    prioridade: int | None = None
    criado_em: datetime | None = None
    bloqueado: bool = False
    depende_de: tuple[int, ...] = ()

    @property
    def aberta(self) -> bool:
        return self.categoria not in (Categoria.CONCLUIDO, Categoria.REMOVIDO)

    @property
    def em_andamento(self) -> bool:
        return self.categoria in (Categoria.ANDAMENTO, Categoria.RESOLVIDO)


class Transicao(_Base):
    work_item_id: int
    campo: Literal["System.State", "System.BoardColumn"]
    de: str | None
    para: str | None
    changed_at: datetime
    changed_rev: int


class ColunaFluxo(_Base):
    coluna: str
    tipo: Literal["espera", "ativa"] = "ativa"
    sla_horas_uteis: float | None = None
    limite_wip_coluna: int | None = None


class Expediente(_Base):
    """Janela do dia que conta como hora útil para SLA de fila (horário de Brasília)."""

    inicio: time = time(9, 0)
    fim: time = time(18, 0)


class ConfigAnalise(_Base):
    limite_wip_pessoa: int = 3
    tags_bloqueio: tuple[str, ...] = ("bloqueado", "blocked", "impedimento")
    campo_horas_carga: Literal["restante", "estimada_menos_concluida", "estimada"] = "restante"
    horas_fallback_padrao: float = 4.0
    horas_fallback_por_tag: dict[str, float] = Field(default_factory=dict)
    percentil_referencia: float = 0.85
    min_amostras_percentil: int = 5
    expediente: Expediente = Expediente()
    colunas: tuple[ColunaFluxo, ...] = ()
