import { useEffect } from "react";
import { Link, Outlet, useParams } from "@tanstack/react-router";
import { BarChart3, CalendarRange, ChevronRight, ExternalLink, Gauge, KanbanSquare, Users, type LucideIcon } from "lucide-react";
import { useProjeto } from "@/lib/queries";
import { registrarRecente } from "@/lib/recentes";
import { MarcaProjeto } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";

const AZDO_ORG_URL = (import.meta.env.VITE_AZDO_ORG_URL as string | undefined)?.replace(/\/$/, "");

type Aba = {
  to:
    | "/projetos/$projetoId/resumo"
    | "/projetos/$projetoId/kanban"
    | "/projetos/$projetoId/cronograma"
    | "/projetos/$projetoId/equipe"
    | "/projetos/$projetoId/metricas";
  rotulo: string;
  icone: LucideIcon;
};

// Resumo primeiro: é o que o gestor quer ver ao abrir um projeto
const ABAS: Aba[] = [
  { to: "/projetos/$projetoId/resumo", rotulo: "Resumo", icone: Gauge },
  { to: "/projetos/$projetoId/kanban", rotulo: "Kanban", icone: KanbanSquare },
  { to: "/projetos/$projetoId/cronograma", rotulo: "Cronograma", icone: CalendarRange },
  { to: "/projetos/$projetoId/equipe", rotulo: "Equipe", icone: Users },
  { to: "/projetos/$projetoId/metricas", rotulo: "Métricas", icone: BarChart3 },
];

export function ProjetoLayout() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const { data: projeto, isLoading } = useProjeto(projetoId);

  useEffect(() => {
    if (projeto) registrarRecente(projeto.id!);
  }, [projeto]);

  if (!isLoading && !projeto) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-200">Projeto não encontrado</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ele pode ter sido excluído no Azure DevOps — projetos excluídos lá saem daqui na próxima sincronização.
          </p>
          <Link to="/projetos" className="mt-2 inline-block text-sm text-brand-700 hover:underline dark:text-brand-300">
            Voltar para Projetos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 pt-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-[1500px]">
          <nav className="mb-3 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Link to="/projetos" className="hover:text-slate-800 dark:hover:text-slate-200">
              Projetos
            </Link>
            <ChevronRight className="size-3" />
            <span className="truncate text-slate-700 dark:text-slate-300">{projeto?.nome ?? "…"}</span>
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            {projeto?.nome ? <MarcaProjeto nome={projeto.nome} className="size-11 text-lg" /> : <span className="size-11 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  {projeto?.nome ?? "Carregando…"}
                </h1>
                {projeto?.processo && <Badge tone="slate">{projeto.processo}</Badge>}
                {projeto?.sprint_atual && <Badge tone="teal">Sprint atual: {projeto.sprint_atual}</Badge>}
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400" title={projeto?.descricao ?? undefined}>
                {projeto?.descricao || "Sem descrição no Azure DevOps."}
              </p>
              {(projeto?.tags?.length ?? 0) > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1" title="Tags do projeto (linha “Tags:” na descrição do Azure DevOps)">
                  {projeto!.tags!.map((t) => (
                    <Badge key={t} tone="slate" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {AZDO_ORG_URL && projeto?.nome && (
              <a
                href={`${AZDO_ORG_URL}/${encodeURIComponent(projeto.nome)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Abrir no DevOps <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>

          <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto">
            {ABAS.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                params={{ projetoId }}
                activeOptions={{ includeSearch: false }}
                className="inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 pb-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                activeProps={{ className: "border-brand-600! text-slate-900! dark:border-brand-400! dark:text-white!" }}
              >
                <a.icone className="size-4" /> {a.rotulo}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1500px] flex-1 px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
