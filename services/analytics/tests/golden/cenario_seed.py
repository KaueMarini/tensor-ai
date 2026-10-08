"""Cenário do `pnpm devops:seed` (projeto de pátio, antigo IportJLKN12), como o banco o teria.

- Sprints de 2 semanas: S1 05–16/10, S2 19–30/10, S3 02–13/11; Capacity 6h/dia para todos.
- Kauê: 16+20+16+10+8 = 70h na Sprint 1 contra 60h → ~117%.
- Julliano de férias 19–23/10 com tasks na Sprint 2.
- Feriado do time em 02/11 (Finados); "Testes de carga do websocket" sem estimativa.
"""

from __future__ import annotations

from datetime import date

from radar_analytics.domain.analise import Snapshot
from radar_analytics.domain.capacidade import EntradaCapacidade
from radar_analytics.domain.fluxo import categoria_estado
from radar_analytics.domain.models import CapacidadeTime, Folga, Pessoa, Sprint, Task

PROJETO = "badd3c28-2533-4e04-9239-e79fa7f520f0"
TIME = "time-patio"
HOJE = date(2026, 10, 5)

PESSOAS = (
    Pessoa(id="kaue", nome="Kauê Marini", funcao="Tech Lead", skills=("back-end", "integracao-fiscal")),
    Pessoa(id="laryssa", nome="Laryssa", funcao="Front-end", skills=("front-end", "react")),
    Pessoa(id="nicolas", nome="Nicolas", funcao="Back-end", skills=("back-end", "testes", "websocket")),
    Pessoa(id="julliano", nome="Julliano", funcao="Dados & BI", skills=("dados", "power-automate")),
)

SPRINTS = (
    Sprint(id="s1", projeto_id=PROJETO, nome="Sprint 1", inicio=date(2026, 10, 5), fim=date(2026, 10, 16)),
    Sprint(id="s2", projeto_id=PROJETO, nome="Sprint 2", inicio=date(2026, 10, 19), fim=date(2026, 10, 30)),
    Sprint(id="s3", projeto_id=PROJETO, nome="Sprint 3", inicio=date(2026, 11, 2), fim=date(2026, 11, 13)),
)

# (id, título, sprint, responsável, horas restantes, tags)
_TASKS: list[tuple[int, str, str, str, float | None, tuple[str, ...]]] = [
    (101, "API de janelas disponíveis", "s1", "kaue", 16, ("back-end",)),
    (102, "Autenticação de transportadoras", "s1", "kaue", 20, ("back-end",)),
    (103, "Ajustes de performance na consulta de docas", "s1", "kaue", 16, ("back-end",)),
    (104, "Leitura de XML da NF-e", "s1", "kaue", 10, ("integracao-fiscal",)),
    (105, "Validação de CT-e", "s1", "kaue", 8, ("integracao-fiscal",)),
    (106, "Tela de agendamento", "s1", "laryssa", 16, ("front-end",)),
    (107, "Componente de calendário reutilizável", "s1", "laryssa", 12, ("front-end",)),
    (108, "Testes de regressão do agendamento", "s1", "nicolas", 14, ("testes",)),
    (109, "Documentação da integração fiscal", "s1", "julliano", 8, ("integracao-fiscal",)),
    (110, "Mapa do pátio", "s2", "laryssa", 16, ("front-end",)),
    (111, "Websocket de status das vagas", "s2", "nicolas", 12, ("back-end", "websocket")),
    (112, "Alertas de fila", "s2", "nicolas", 8, ("back-end",)),
    (113, "Testes de carga do websocket", "s2", "nicolas", None, ("testes",)),
    (114, "Tópicos do bot de atendimento", "s2", "kaue", 10, ("copilot-studio",)),
    (115, "Base de conhecimento do bot", "s2", "kaue", 8, ("copilot-studio",)),
    (116, "Conector Power Automate com a API de agendamento", "s2", "julliano", 12, ("power-automate",)),
    (117, "Modelo de dados analítico", "s2", "julliano", 10, ("dados",)),
    (118, "Dashboard de indicadores", "s3", "julliano", 12, ("dados",)),
    (119, "Validação dos indicadores com a operação", "s3", "julliano", 6, ("dados",)),
    (120, "POC de OCR no gate", "s3", "nicolas", 16, ("back-end",)),
    (121, "Integração do OCR com o agendamento", "s3", "kaue", 12, ("back-end",)),
]


def snapshot() -> Snapshot:
    tasks = tuple(
        Task(
            id=tid,
            projeto_id=PROJETO,
            tipo="Task",
            titulo=titulo,
            estado="New",
            categoria=categoria_estado("New"),
            sprint_id=sid,
            responsavel_id=resp,
            horas_restantes=h,
            horas_estimadas=h,
            tags=tags,
        )
        for tid, titulo, sid, resp, h, tags in _TASKS
    )
    capacidades = tuple(
        CapacidadeTime(sprint_id=s.id, time_id=TIME, pessoa_id=p.id, capacidade_dia=6)
        for s in SPRINTS
        for p in PESSOAS
    )
    folgas = (
        Folga(
            pessoa_id="julliano",
            time_id=TIME,
            sprint_id="s2",
            inicio=date(2026, 10, 19),
            fim=date(2026, 10, 23),
        ),
        Folga(time_id=TIME, sprint_id="s3", inicio=date(2026, 11, 2), fim=date(2026, 11, 2)),
    )
    return Snapshot(
        projeto_id=PROJETO,
        capacidade=EntradaCapacidade(
            pessoas=PESSOAS, sprints=SPRINTS, capacidades=capacidades, folgas=folgas, tasks=tasks
        ),
        membros_projeto={PROJETO: frozenset(p.id for p in PESSOAS)},
    )
