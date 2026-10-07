import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { supabase } from "@/lib/supabase";
import { LoginPage } from "@/routes/login";
import { AppLayout } from "@/routes/app-layout";
import { InicioPage } from "@/routes/inicio";
import { ProjetoLayout } from "@/routes/projeto-layout";
import { ProjetoPage } from "@/routes/projeto";
import { MembrosPage } from "@/routes/membros";

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

const inicioRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: InicioPage });

const projetoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projetos/$projetoId",
  component: ProjetoLayout,
});

const projetoBacklogRoute = createRoute({
  getParentRoute: () => projetoRoute,
  path: "/",
  component: ProjetoPage,
});

const membrosRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/membros",
  validateSearch: (s: Record<string, unknown>): { visao?: "projeto" } =>
    s.visao === "projeto" ? { visao: "projeto" } : {},
  component: MembrosPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([inicioRoute, membrosRoute, projetoRoute.addChildren([projetoBacklogRoute])]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
