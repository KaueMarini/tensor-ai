import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { supabase } from "@/lib/supabase";
import { LoginPage } from "@/routes/login";
import { AppLayout } from "@/routes/app-layout";
import { ProjetosPage } from "@/routes/projetos";
import { MembrosPage } from "@/routes/membros";
import { AnalisesPage as SugestoesAlocacaoPage } from "@/routes/analises";
import { ProjetoLayout } from "@/routes/projeto/layout";
import { CronogramaPage } from "@/routes/projeto/cronograma";
import { SquadPage } from "@/routes/projeto/squad";
import { KanbanPage } from "@/routes/projeto/kanban";
import { MetricasPage } from "@/routes/projeto/metricas";
import { AnalisesPage } from "@/routes/projeto/analises";

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

const inicioRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/projetos" });
  },
});

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
  // "projeto" é o nome antigo da visão de squads (links salvos continuam funcionando)
  validateSearch: (s: Record<string, unknown>): { visao?: "squads" } =>
    s.visao === "squads" || s.visao === "projeto" ? { visao: "squads" } : {},
  component: MembrosPage,
});

const sugestoesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/analises",
  component: SugestoesAlocacaoPage,
});

const projetoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projetos/$projetoId",
  component: ProjetoLayout,
});

const projetoIndexRoute = createRoute({
  getParentRoute: () => projetoRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projetos/$projetoId/kanban", params });
  },
});

const cronogramaRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/cronograma", component: CronogramaPage });
const squadRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/squad", component: SquadPage });
const kanbanRoute = createRoute({
  getParentRoute: () => projetoRoute,
  path: "/kanban",
  validateSearch: (s: Record<string, unknown>): { modo?: "lista"; sprint?: string } => ({
    ...(s.modo === "lista" ? { modo: "lista" as const } : {}),
    ...(typeof s.sprint === "string" && s.sprint ? { sprint: s.sprint } : {}),
  }),
  component: KanbanPage,
});
const metricasRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/metricas", component: MetricasPage });
const analisesRoute = createRoute({ getParentRoute: () => projetoRoute, path: "/analises", component: AnalisesPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    inicioRoute,
    projetosRoute,
    membrosRoute,
    sugestoesRoute,
    projetoRoute.addChildren([
      projetoIndexRoute,
      cronogramaRoute,
      squadRoute,
      kanbanRoute,
      metricasRoute,
      analisesRoute,
    ]),
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
