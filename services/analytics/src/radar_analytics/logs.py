"""Logs estruturados em JSON (structlog), uma linha por evento."""

from __future__ import annotations

import logging

import structlog


def configurar(nivel: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", level=nivel)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(ensure_ascii=False),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(nivel)),
        cache_logger_on_first_use=True,
    )
