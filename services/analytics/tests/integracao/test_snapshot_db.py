"""Integração com o banco real (só leitura). Pulado sem SUPABASE_DB_URL.

Roda o SQL dos repositórios em todos os projetos ativos e passa o resultado pelo domínio.
"""

from __future__ import annotations

import os
from datetime import datetime

import pytest

from radar_analytics.domain.analise import analisar
from radar_analytics.domain.calendario import FUSO
from radar_analytics.repositories.db import criar_pool
from radar_analytics.repositories.snapshot import carregar_snapshot, projetos_ativos

URL = os.environ.get("SUPABASE_DB_URL")
pytestmark = pytest.mark.skipif(not URL, reason="sem SUPABASE_DB_URL")


def test_snapshot_de_todos_os_projetos_roda_no_dominio() -> None:
    assert URL
    agora = datetime.now(FUSO)
    with criar_pool(URL, 1) as pool, pool.connection() as conn:
        conn.read_only = True
        projetos = projetos_ativos(conn)
        assert projetos
        for p in projetos:
            snap = carregar_snapshot(conn, p, agora.date())
            a = analisar(snap, agora.date(), agora)
            assert a.projeto_id == p
            assert all(c.utilizacao is None or c.utilizacao >= 0 for c in a.celulas)
