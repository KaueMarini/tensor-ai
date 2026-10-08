"""Cliente SOMENTE LEITURA da REST API do Azure DevOps (api-version 7.1).

Só existe `_get`: o serviço nunca escreve no DevOps (o executor é outra peça). Retry com
backoff exponencial respeitando `Retry-After` em 429/5xx, igual a `_shared/azdo/client.ts`.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Iterator, Sequence
from typing import Any

import httpx
import structlog

from radar_analytics.domain.models import Transicao
from radar_analytics.repositories.mapeamento import dependencias_de_relacoes, transicoes_de_updates

API_VERSION = "7.1"
RETENTAVEIS = frozenset({429, 500, 502, 503, 504})
LOTE_IDS = 200

log = structlog.get_logger(__name__)


class DevOpsLeitura:
    def __init__(
        self,
        org_url: str,
        pat: str,
        *,
        max_tentativas: int = 5,
        timeout_s: float = 30.0,
        transport: httpx.BaseTransport | None = None,
        dormir: Callable[[float], None] = time.sleep,
    ) -> None:
        self._http = httpx.Client(
            base_url=org_url.rstrip("/") + "/",
            auth=("", pat),
            timeout=timeout_s,
            headers={"Accept": "application/json"},
            transport=transport,
        )
        self._max = max_tentativas
        self._dormir = dormir

    def close(self) -> None:
        self._http.close()

    def _get(self, caminho: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        params = {"api-version": API_VERSION, **(params or {})}
        espera = 1.0
        for tentativa in range(1, self._max + 1):
            try:
                r = self._http.get(caminho, params=params)
            except httpx.TransportError as erro:
                if tentativa == self._max:
                    raise
                log.warning("devops_get_erro_rede", caminho=caminho, tentativa=tentativa, erro=str(erro))
                self._dormir(espera)
                espera *= 2
                continue
            if r.status_code in RETENTAVEIS and tentativa < self._max:
                retry_after = r.headers.get("Retry-After")
                pausa = float(retry_after) if retry_after and retry_after.isdigit() else espera
                log.warning("devops_get_retry", caminho=caminho, status=r.status_code, pausa_s=pausa)
                self._dormir(pausa)
                espera *= 2
                continue
            r.raise_for_status()
            corpo: dict[str, Any] = r.json()
            return corpo
        raise RuntimeError("inalcançável")  # pragma: no cover

    def updates(self, work_item_id: int) -> Iterator[dict[str, Any]]:
        skip = 0
        while True:
            pagina = self._get(f"_apis/wit/workItems/{work_item_id}/updates", {"$top": 200, "$skip": skip})
            valores: list[dict[str, Any]] = pagina.get("value") or []
            yield from valores
            if len(valores) < 200:
                return
            skip += len(valores)

    def transicoes(self, work_item_id: int) -> list[Transicao]:
        return transicoes_de_updates(work_item_id, self.updates(work_item_id))

    def dependencias(self, ids: Sequence[int]) -> list[tuple[int, str, int]]:
        out: list[tuple[int, str, int]] = []
        for i in range(0, len(ids), LOTE_IDS):
            lote = ids[i : i + LOTE_IDS]
            resp = self._get(
                "_apis/wit/workitems",
                {"ids": ",".join(map(str, lote)), "$expand": "relations", "errorPolicy": "Omit"},
            )
            for item in resp.get("value") or []:
                if not item:
                    continue
                out += [(int(item["id"]), tipo, alvo) for tipo, alvo in dependencias_de_relacoes(item)]
        return out
