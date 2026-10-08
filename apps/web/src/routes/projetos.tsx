// Lista de projetos pensada para volume: busca e paginação no banco (v_projeto_resumo),
// nunca carrega todos. Os recentes (deste navegador) ficam no topo para acesso rápido.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight, Clock, FolderSearch, Search } from "lucide-react";
import { POR_PAGINA, useProjetosPagina, useProjetosPorIds } from "@/lib/queries";
import { precisaDeEquipe } from "@/lib/equipe-sugerida";
import { useRecentes } from "@/lib/recentes";
import { cn, tempoRelativo } from "@/lib/utils";
import { MarcaProjeto } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const numero = new Intl.NumberFormat("pt-BR");

export function ProjetosPage() {
  const { q = "", p = 0 } = useSearch({ from: "/app/projetos" });
  const navigate = useNavigate({ from: "/projetos" });
  const [texto, setTexto] = useState(q);

  // busca com debounce: a URL (e a consulta) só mudam 300 ms depois de parar de digitar
  useEffect(() => {
    if (texto === q) return;
    const t = setTimeout(() => void navigate({ search: { ...(texto ? { q: texto } : {}) }, replace: true }), 300);
    return () => clearTimeout(t);
  }, [texto, q, navigate]);

  const { data, isLoading, isFetching, error } = useProjetosPagina(q, p);
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const irPara = (pagina: number) => void navigate({ search: { ...(q ? { q } : {}), ...(pagina > 0 ? { p: pagina } : {}) } });

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Projetos</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {isLoading ? "Carregando…" : `${numero.format(total)} ${total === 1 ? "projeto" : "projetos"}${q ? ` encontrados para "${q}"` : " sincronizados do Azure DevOps"}`}
        </p>
      </header>

      {!q && p === 0 && <Recentes />}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar projeto pelo nome"
          className="h-11 pl-9 text-base"
          autoFocus
        />
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Erro ao carregar: {error.message}
        </p>
      )}

      <Card className={cn("overflow-hidden transition-opacity", isFetching && !isLoading && "opacity-70")}>
        <div className="hidden grid-cols-[1fr_9rem_6rem_6rem_9rem_1.5rem] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase md:grid dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          <span>Projeto</span>
          <span>Sprint atual</span>
          <span className="text-right">Itens</span>
          <span className="text-right">Membros</span>
          <span>Sincronizado</span>
          <span />
        </div>

        {isLoading &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 dark:border-slate-800">
              <span className="size-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              <span className="h-4 w-1/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}

        {!isLoading && data?.projetos.length === 0 && (
          <div className="grid place-items-center px-6 py-16 text-center">
            <FolderSearch className="mb-3 size-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {q ? "Nenhum projeto com esse nome" : "Nenhum projeto sincronizado ainda"}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {q ? "Confira a grafia ou busque por parte do nome." : "Projetos criados no DevOps aparecem aqui em até 5 minutos."}
            </p>
          </div>
        )}

        {data?.projetos.map((pr) => (
          <Link
            key={pr.id}
            to="/projetos/$projetoId"
            params={{ projetoId: pr.id! }}
            className="group grid grid-cols-[1fr_auto] items-center gap-4 border-b border-slate-100 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-slate-50 md:grid-cols-[1fr_9rem_6rem_6rem_9rem_1.5rem] dark:border-slate-800 dark:hover:bg-slate-800/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <MarcaProjeto nome={pr.nome ?? "?"} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-900 dark:text-slate-100">{pr.nome}</span>
                  {pr.processo && <Badge tone="slate" className="hidden sm:inline-flex">{pr.processo}</Badge>}
                  {precisaDeEquipe(pr) && (
                    <Badge tone="amber" title="Ainda sem pessoas: abra para ver o squad e as pessoas sugeridas">
                      Sem equipe
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {pr.descricao || `${pr.n_features ?? 0} features`}
                </p>
              </div>
            </div>
            <span className="hidden truncate text-sm text-slate-600 md:block dark:text-slate-300">
              {pr.sprint_atual ?? <span className="text-slate-400 dark:text-slate-500">—</span>}
            </span>
            <span className="hidden text-right text-sm tabular-nums text-slate-600 md:block dark:text-slate-300">
              {numero.format(pr.n_itens ?? 0)}
            </span>
            <span className="hidden text-right text-sm tabular-nums text-slate-600 md:block dark:text-slate-300">
              {numero.format(pr.n_membros ?? 0)}
            </span>
            <span className="hidden text-xs text-slate-500 md:block dark:text-slate-400">
              {pr.sync_fase && pr.sync_fase !== "concluido" ? "Importando…" : tempoRelativo(pr.ultima_reconciliacao_em)}
            </span>
            <ArrowRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-slate-600 dark:group-hover:text-brand-300" />
          </Link>
        ))}
      </Card>

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>
            {numero.format(p * POR_PAGINA + 1)}–{numero.format(Math.min(total, (p + 1) * POR_PAGINA))} de {numero.format(total)}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={p === 0} onClick={() => irPara(p - 1)}>
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            <span className="px-2 tabular-nums">
              {p + 1} / {paginas}
            </span>
            <Button variant="outline" size="sm" disabled={p + 1 >= paginas} onClick={() => irPara(p + 1)}>
              Próxima <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Recentes() {
  const ids = useRecentes();
  const { data } = useProjetosPorIds(ids);
  const projetos = ids.map((id) => data?.find((x) => x.id === id)).filter((x) => !!x);
  if (projetos.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
        <Clock className="size-3.5" /> Acessados recentemente
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {projetos.map((pr) => (
          <Link
            key={pr.id}
            to="/projetos/$projetoId"
            params={{ projetoId: pr.id }}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500/60"
          >
            <MarcaProjeto nome={pr.nome} />
            <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{pr.nome}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
