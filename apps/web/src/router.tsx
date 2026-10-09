import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, redirect } from "@tanstack/react-router";
import { Toaster } from "sonner";
import type { ComponentType } from "react";
import { supabase } from "@/lib/supabase";
import { SomenteGestor } from "@/lib/papel";
import { LoginPage } from "@/routes/login";
import { AppLayout } from "@/routes/app-layout";
import { ProjetoLayout } from "@/routes/projeto/layout";

function paginaDeGestor(carregar: () => Promise<ComponentType>) {
  return lazyRouteComponent(
    () =>
      carregar().then((Pagina) => ({
        default: function PaginaDeGestor() {
          return (
            <SomenteGestor>
              <Pagina />
            </SomenteGestor>
          );
        },
      })),
    "default",
  );
}

const InicioPage = lazyRouteComponent(() => import("@/routes/inicio"), "InicioPage");
const ProjetosPage = lazyRouteComponent(() => import("@/routes/projetos"), "ProjetosPage");
const MembrosPage = lazyRouteComponent(() => import("@/routes/membros"), "MembrosPage");
const AgendaPage = lazyRouteComponent(() => import("@/routes/agenda"), "AgendaPage");
const SugestoesAlocacaoPage = paginaDeGestor(() => import("@/routes/analises").then((m) => m.AnalisesPage));
const RegrasPage = paginaDeGestor(() => import("@/routes/capacidade").then((m) => m.CapacidadePage));
const SincronizacaoPage = paginaDeGestor(() => import("@/routes/sincronizacao").then((m) => m.SincronizacaoPage));
const ResumoPage = lazyRouteComponent(() => import("@/routes/projeto/resumo"), "ResumoPage");
const CronogramaPage = lazyRouteComponent(() => import("@/routes/projeto/cronograma"), "CronogramaPage");
const EquipeProjetoPage = lazyRouteComponent(() => import("@/routes/projeto/equipe"), "EquipeProjetoPage");
const KanbanPage = lazyRouteComponent(() => import("@/routes/projeto/kanban"), "KanbanPage");
const MetricasPage = paginaDeGestor(() => import("@/routes/projeto/metricas").then((m) => m.MetricasPage));

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster position="bottom-right" toastOptions={{ className: "text-sm" }} />
    </>
  ),
});

async function temSessao() {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

const texto = (v: unknown) => (typeof v === "string" && v ? v : undefined);

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    if (await temSessao()) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async () => {
    if (!(await temSessao())) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

const raizRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/inicio" });
  },
});

const inicioRoute = createRoute({ getParentRoute: () => appRoute, path: "/inicio", component: InicioPage });

const projetosRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projetos",
  validateSearch: (s: Record<string, unknown>): { q?: string; p?: number } => ({
    ...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
    ...(Number(s.p) > 0 ? { p: Math.floor(Number(s.p)) } : {}),
  }),
  component: ProjetosPage,
});

const membrosRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/membros",
  validateSearch: (s: Record<string, unknown>): { visao?: "squads" | "skills" } =>
    s.visao === "squads" || s.visao === "projeto" ? { visao: "squads" } : s.visao === "skills" ? { visao: "skills" } : {},
  component: MembrosPage,
});

const sugestoesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/analises",
  validateSearch: (s: Record<string, unknown>): { projeto?: string; aba?: "processo" } => ({
    ...(texto(s.projeto) ? { projeto: texto(s.projeto) } : {}),
    ...(s.aba === "processo" ? { aba: "processo" as const } : {}),
  }),
  component: SugestoesAlocacaoPage,
});

const agendaRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/agenda",
  validateSearch: (s: Record<string, unknown>): { mes?: string; projeto?: string } => ({
    ...(typeof s.mes === "string" && /^\d{4}-\d{2}$/.test(s.mes) ? { mes: s.mes } : {}),
    ...(texto(s.projeto) ? { projeto: texto(s.projeto) } : {}),
  }),
  component: AgendaPage,
});

const regrasRoute = createRoute({ getParentRoute: () => appRoute, path: "/capacidade", component: RegrasPage });
const sincronizacaoRoute = createRoute({ getParentRoute: () => appRoute, path: "/sincronizacao", component: SincronizacaoPage });

const projetoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projetos/$projetoId",
  component: ProjetoLayout,
});

const paraAba =
  (aba: "resumo" | "equipe") =>
  ({ params }: { params: { projetoId: string } }) => {
    throw redirect({ to: aba === "resumo" ? "/projetos/$projetoId/resumo" : "/projetos/$projetoId/equipe", params });
  };

const projetoIndexRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/", beforeLoad: paraAba("resumo") });
const resumoRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/resumo", component: ResumoPage });
const kanbanRoute = createRoute({
  getParentRoute: () => projetoRoute,
  path: "/kanban",
  validateSearch: (s: Record<string, unknown>): { modo?: "lista"; sprint?: string; resp?: string } => ({
    ...(s.modo === "lista" ? { modo: "lista" as const } : {}),
    ...(texto(s.sprint) ? { sprint: texto(s.sprint) } : {}),
    ...(texto(s.resp) ? { resp: texto(s.resp) } : {}),
  }),
  component: KanbanPage,
});
const cronogramaRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/cronograma", component: CronogramaPage });
const equipeRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/equipe", component: EquipeProjetoPage });
const metricasRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/metricas", component: MetricasPage });
const antigaAnalisesRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/analises", beforeLoad: paraAba("resumo") });
const antigaSquadRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/squad", beforeLoad: paraAba("equipe") });
const antigaCapacidadeRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/capacidade", beforeLoad: paraAba("equipe") });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    raizRoute,
    inicioRoute,
    projetosRoute,
    membrosRoute,
    agendaRoute,
    sugestoesRoute,
    regrasRoute,
    sincronizacaoRoute,
    projetoRoute.addChildren([
      projetoIndexRoute,
      resumoRoute,
      kanbanRoute,
      cronogramaRoute,
      equipeRoute,
      metricasRoute,
      antigaAnalisesRoute,
      antigaSquadRoute,
      antigaCapacidadeRoute,
    ]),
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
