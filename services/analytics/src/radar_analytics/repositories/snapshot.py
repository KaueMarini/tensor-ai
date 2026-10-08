"""Leitura do banco para montar o `Snapshot` de um projeto (somente leitura).

Carrega o projeto + a carga GLOBAL das pessoas dele: tasks abertas delas em qualquer projeto,
sprints, Capacity, folgas, ausências, feriados, regras e alocações — o mesmo recorte que
`apps/web/src/lib/carga-global.ts` usa.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from psycopg import Connection

from radar_analytics.domain.analise import Snapshot
from radar_analytics.domain.capacidade import EntradaCapacidade
from radar_analytics.domain.models import Alocacao, CapacidadeTime, Folga, Sprint
from radar_analytics.repositories import mapeamento as m

Conn = Connection[dict[str, Any]]
TIPOS_REQUISITO = ("Feature", "Epic")
LINK_PREDECESSOR = "System.LinkTypes.Dependency-Reverse"

_SQL_MEMBROS = """
select distinct tm.pessoa_id::text as pessoa_id
  from time_membro tm join time t on t.id = tm.time_id
 where t.projeto_id = %(projeto)s and tm.ativo
"""

_SQL_PESSOAS = """
select p.id::text as id, p.nome, rp.jornada_dia, rp.foco,
       (select ft.nome from pessoa_funcao_tag pf join funcao_tag ft on ft.id = pf.funcao_tag_id
         where pf.pessoa_id = p.id order by ft.nome limit 1) as funcao,
       coalesce((select array_agg(s.tag order by s.confirmada desc, s.evidencias desc,
                                  s.confianca desc nulls last, s.tag)
                   from skill_tag s
                  where s.pessoa_id = p.id and not s.rejeitada
                    and (s.confirmada or s.origem in ('gestor', 'tasks'))), '{}') as skills
  from pessoa p left join regra_capacidade_pessoa rp on rp.pessoa_id = p.id
 where p.id = any(%(pessoas)s::uuid[])
"""

_SQL_TASKS = """
select w.devops_id, w.projeto_id::text as projeto_id, w.tipo, w.titulo, w.estado,
       w.sprint_id::text as sprint_id, w.responsavel_id::text as responsavel_id,
       w.horas_restantes, w.horas_estimadas, w.horas_concluidas,
       w.start_date, w.finish_date, w.target_date, w.tags, w.feature_devops_id, w.fields,
       w.criado_em,
       coalesce(f.tags, '{}') as feature_tags,
       exists (select 1 from work_item c where c.parent_devops_id = w.devops_id
                                         and c.deleted_at is null) as tem_filhos,
       (select min(t.changed_at) from work_item_transicao t
         where t.work_item_id = w.devops_id and t.campo = 'System.State' and t.de is null) as criado_devops,
       coalesce((select array_agg(r.alvo_id) from devops_relacao_cache r
                  where r.work_item_id = w.devops_id and r.tipo = %(link)s), '{}') as depende_de
  from work_item w
  join projeto p on p.id = w.projeto_id and p.deleted_at is null
  left join work_item f on f.devops_id = w.feature_devops_id
 where w.deleted_at is null
   and w.tipo <> all(%(requisitos)s)
   and (w.projeto_id = %(projeto)s or w.responsavel_id = any(%(pessoas)s::uuid[]))
   and (w.projeto_id = %(projeto)s
        or lower(coalesce(w.estado, '')) not in ('closed', 'done', 'completed', 'removed', 'cut'))
"""

_SQL_SPRINTS = """
select s.id::text as id, s.projeto_id::text as projeto_id, s.nome, s.inicio, s.fim
  from sprint s join projeto p on p.id = s.projeto_id and p.deleted_at is null
 where s.deleted_at is null
   and (s.projeto_id = any(%(projetos)s::uuid[])
        or s.id in (select c.sprint_id from capacidade_sprint c where c.pessoa_id = any(%(pessoas)s::uuid[])))
"""

_SQL_CAPACIDADES = """
select sprint_id::text, time_id::text, pessoa_id::text, capacidade_dia
  from capacidade_sprint where pessoa_id = any(%(pessoas)s::uuid[])
"""

_SQL_DIAS_OFF = """
select d.sprint_id::text, d.time_id::text, d.pessoa_id::text, d.inicio, d.fim
  from dias_off d
 where d.pessoa_id = any(%(pessoas)s::uuid[])
    or (d.pessoa_id is null and d.time_id in (select time_id from time_membro
                                               where pessoa_id = any(%(pessoas)s::uuid[])))
"""


def _todas(conn: Conn, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return list(cur.fetchall())


def _uma(conn: Conn, sql: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(sql, params or {})
        return cur.fetchone()


def projetos_ativos(conn: Conn) -> list[str]:
    return [r["id"] for r in _todas(conn, "select id::text as id from projeto where deleted_at is null", {})]


def projeto_do_item(conn: Conn, devops_id: int) -> str | None:
    r = _uma(conn, "select projeto_id::text as p from work_item where devops_id = %(id)s", {"id": devops_id})
    return None if r is None else r["p"]


def carregar_snapshot(conn: Conn, projeto_id: str, hoje: date, janela_historico_dias: int = 90) -> Snapshot:
    membros = [r["pessoa_id"] for r in _todas(conn, _SQL_MEMBROS, {"projeto": projeto_id})]
    analise = _uma(conn, "select * from analise_config limit 1")
    fluxo = _todas(conn, "select * from fluxo_config where projeto_id = %(p)s", {"p": projeto_id})
    config = m.config(analise, fluxo)
    campo_bloqueio = None if analise is None else analise.get("campo_bloqueio")

    linhas_tasks = _todas(
        conn,
        _SQL_TASKS,
        {
            "projeto": projeto_id,
            "pessoas": membros,
            "requisitos": list(TIPOS_REQUISITO),
            "link": LINK_PREDECESSOR,
        },
    )
    tasks = [m.task(r, campo_bloqueio) for r in linhas_tasks]
    pessoas_ids = sorted(set(membros) | {t.responsavel_id for t in tasks if t.responsavel_id})
    pessoas = [m.pessoa(r) for r in _todas(conn, _SQL_PESSOAS, {"pessoas": pessoas_ids})]
    projetos = sorted({projeto_id} | {t.projeto_id for t in tasks})

    p_pessoas = {"pessoas": pessoas_ids}
    sprints = [
        Sprint(id=r["id"], projeto_id=r["projeto_id"], nome=r["nome"], inicio=r["inicio"], fim=r["fim"])
        for r in _todas(conn, _SQL_SPRINTS, {"projetos": projetos, **p_pessoas})
    ]
    capacidades = [
        CapacidadeTime(
            sprint_id=r["sprint_id"],
            time_id=r["time_id"],
            pessoa_id=r["pessoa_id"],
            capacidade_dia=float(r["capacidade_dia"]),
        )
        for r in _todas(conn, _SQL_CAPACIDADES, p_pessoas)
    ]
    folgas = [
        Folga(
            sprint_id=r["sprint_id"],
            time_id=r["time_id"],
            pessoa_id=r["pessoa_id"],
            inicio=r["inicio"],
            fim=r["fim"],
        )
        for r in _todas(conn, _SQL_DIAS_OFF, p_pessoas)
    ]
    folgas += [
        Folga(pessoa_id=r["pessoa_id"], inicio=r["inicio"], fim=r["fim"], tipo=r["tipo"])
        for r in _todas(
            conn,
            "select pessoa_id::text, inicio, fim, tipo from ausencia"
            " where pessoa_id = any(%(pessoas)s::uuid[])",
            p_pessoas,
        )
    ]
    feriados = frozenset(r["data"] for r in _todas(conn, "select data from feriado", {}))
    alocacoes = [
        Alocacao(projeto_id=r["projeto_id"], pessoa_id=r["pessoa_id"], horas_dia=float(r["horas_dia"]))
        for r in _todas(
            conn,
            "select projeto_id::text, pessoa_id::text, horas_dia from alocacao_projeto"
            " where pessoa_id = any(%(pessoas)s::uuid[])",
            p_pessoas,
        )
    ]
    regras = m.regras(_uma(conn, "select * from regra_capacidade limit 1"))
    transicoes = [
        m.transicao(r)
        for r in _todas(
            conn,
            """select t.work_item_id, t.campo, t.de, t.para, t.changed_at, t.changed_rev
                 from work_item_transicao t join work_item w on w.devops_id = t.work_item_id
                where w.projeto_id = %(p)s and t.changed_at >= %(desde)s::date - %(dias)s""",
            {"p": projeto_id, "desde": hoje, "dias": janela_historico_dias},
        )
    ]
    return Snapshot(
        projeto_id=projeto_id,
        capacidade=EntradaCapacidade(
            pessoas=tuple(pessoas),
            sprints=tuple(sprints),
            capacidades=tuple(capacidades),
            alocacoes=tuple(alocacoes),
            folgas=tuple(folgas),
            feriados=feriados,
            tasks=tuple(tasks),
            regras=regras,
            config=config,
        ),
        transicoes=tuple(transicoes),
        membros_projeto={projeto_id: frozenset(membros)},
    )
