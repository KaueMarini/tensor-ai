import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { supabase } from "@/lib/supabase";
import { LoginPage } from "@/routes/login";
import { AppLayout } from "@/routes/app-layout";
import { InicioPage } from "@/routes/inicio";
import { ProjetoPage } from "@/routes/projeto";

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
  component: ProjetoPage,
});

const routeTree = rootRoute.addChildren([loginRoute, appRoute.addChildren([inicioRoute, projetoRoute])]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
