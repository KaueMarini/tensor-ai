import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { supabase } from "@/lib/supabase";
import { LoginPage } from "@/routes/login";
import { AppLayout } from "@/routes/app-layout";
import { InicioPage } from "@/routes/inicio";
import { ProjetosPage } from "@/routes/projetos";
import { MembrosPage } from "@/routes/membros";
import { AgendaPage } from "@/routes/agenda";
import { AnalisesPage as SugestoesAlocacaoPage } from "@/routes/analises";
import { CapacidadePage as RegrasPage } from "@/routes/capacidade";
import { ProjetoLayout } from "@/routes/projeto/layout";
import { ResumoPage } from "@/routes/projeto/resumo";
import { CronogramaPage } from "@/routes/projeto/cronograma";
import { EquipeProjetoPage } from "@/routes/projeto/equipe";
import { KanbanPage } from "@/routes/projeto/kanban";
import { MetricasPage } from "@/routes/projeto/metricas";

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

/** Equipe: ocupação (padrão), skills e tags, squads. "projeto" é o nome antigo de squads. */
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
  validateSearch: (s: Record<string, unknown>): { projeto?: string } => (texto(s.projeto) ? { projeto: texto(s.projeto) } : {}),
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
// Abas antigas (links salvos continuam funcionando)
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
