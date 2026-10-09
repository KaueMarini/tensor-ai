from __future__ import annotations

import asyncio
import hmac
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any, Protocol

import structlog
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)


class ServicoAnalise(Protocol):
    def analisar_item(self, work_item_id: int) -> dict[str, Any]: ...
    def sweep(self) -> list[dict[str, Any]]: ...


class Debouncer:
    def __init__(self, atraso_s: float) -> None:
        self.atraso_s = atraso_s
        self._tarefas: dict[Any, asyncio.Task[None]] = {}

    def agendar(self, chave: Any, acao: Callable[[], Awaitable[None]]) -> None:
        anterior = self._tarefas.pop(chave, None)
        if anterior is not None:
            anterior.cancel()

        async def rodar() -> None:
            await asyncio.sleep(self.atraso_s)
            self._tarefas.pop(chave, None)
            await acao()

        self._tarefas[chave] = asyncio.create_task(rodar())

    @property
    def pendentes(self) -> int:
        return len(self._tarefas)

    async def fechar(self) -> None:
        for t in self._tarefas.values():
            t.cancel()
        self._tarefas.clear()


class PedidoEvento(BaseModel):
    work_item_id: int = Field(gt=0)
    evento_id: int | None = None


def autenticar(request: Request, x_analytics_secret: Annotated[str | None, Header()] = None) -> None:
    esperado: str | None = request.app.state.segredo
    if not esperado:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "ANALYTICS_SHARED_SECRET não configurado")
    if not x_analytics_secret or not hmac.compare_digest(x_analytics_secret.encode(), esperado.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "não autorizado")


Autenticado = Annotated[None, Depends(autenticar)]
rotas = APIRouter()


@rotas.get("/health")
async def health(request: Request) -> dict[str, Any]:
    return {
        "status": "ok",
        "debounce_pendentes": request.app.state.debouncer.pendentes,
        **request.app.state.info,
    }


@rotas.post("/analyze/event", status_code=status.HTTP_202_ACCEPTED)
async def evento(pedido: PedidoEvento, request: Request, _: Autenticado) -> dict[str, Any]:
    srv: ServicoAnalise = request.app.state.servico
    deb: Debouncer = request.app.state.debouncer

    async def analisar() -> None:
        try:
            r = await asyncio.to_thread(srv.analisar_item, pedido.work_item_id)
            log.info("analise_evento", devops_id=pedido.work_item_id, evento_id=pedido.evento_id, **r)
        except Exception:
            log.exception("analise_evento_falhou", devops_id=pedido.work_item_id)

    deb.agendar(pedido.work_item_id, analisar)
    return {"agendado": True, "work_item_id": pedido.work_item_id, "em_s": deb.atraso_s}


@rotas.post("/analyze/sweep", status_code=status.HTTP_202_ACCEPTED)
async def sweep(request: Request, _: Autenticado) -> dict[str, Any]:
    srv: ServicoAnalise = request.app.state.servico
    trava: asyncio.Lock = request.app.state.sweep_lock
    if trava.locked():
        return {"iniciado": False, "motivo": "varredura em andamento"}

    async def rodar() -> None:
        async with trava:
            try:
                r = await asyncio.to_thread(srv.sweep)
                criadas = sum(x.get("status") == "criada" for x in r)
                log.info("sweep_concluido", projetos=len(r), sugestoes=criadas)
            except Exception:
                log.exception("sweep_falhou")

    tarefa = asyncio.create_task(rodar())
    fundo: set[asyncio.Task[None]] = request.app.state.em_segundo_plano
    fundo.add(tarefa)
    tarefa.add_done_callback(fundo.discard)
    return {"iniciado": True}


def criar_app(
    servico: ServicoAnalise | None = None,
    segredo: str | None = None,
    debounce_s: float | None = None,
    info: dict[str, Any] | None = None,
) -> FastAPI:

    @asynccontextmanager
    async def ciclo(app: FastAPI) -> AsyncIterator[None]:
        fechar: Callable[[], None] = lambda: None
        if servico is None:
            from radar_analytics.bootstrap import montar

            r = montar()
            app.state.servico, app.state.segredo, app.state.info = r.servico, r.segredo, r.info
            app.state.debouncer = Debouncer(r.debounce_s)
            fechar = r.fechar
        else:
            app.state.servico, app.state.segredo, app.state.info = servico, segredo, info or {}
            app.state.debouncer = Debouncer(debounce_s if debounce_s is not None else 30.0)
        app.state.sweep_lock = asyncio.Lock()
        app.state.em_segundo_plano = set()
        yield
        await app.state.debouncer.fechar()
        fechar()

    app = FastAPI(title="Radar de Capacidade — análise", version="0.1.0", lifespan=ciclo)
    app.include_router(rotas)
    return app
