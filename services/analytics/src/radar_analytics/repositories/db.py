from __future__ import annotations

from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def criar_pool(url: str, max_size: int = 5) -> ConnectionPool[Connection[dict[str, Any]]]:
    return ConnectionPool(
        url,
        min_size=1,
        max_size=max_size,
        kwargs={"row_factory": dict_row, "prepare_threshold": None, "application_name": "radar-analytics"},
        connection_class=Connection[dict[str, Any]],
        open=True,
    )
