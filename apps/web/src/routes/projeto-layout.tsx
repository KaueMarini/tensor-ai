import { Outlet, useParams } from "@tanstack/react-router";
import { useProjetos } from "@/lib/queries";

export function ProjetoLayout() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const { data: projetos } = useProjetos();
  const projeto = projetos?.find((p) => p.id === projetoId);

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6">
      <header className="mb-5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Projeto</div>
        <h1 className="text-2xl font-semibold tracking-tight dark:text-slate-100">{projeto?.nome ?? "…"}</h1>
      </header>
      <Outlet />
    </div>
  );
}
