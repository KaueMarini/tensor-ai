import { Navigate } from "@tanstack/react-router";
import { useProjetos } from "@/lib/queries";

/** "/" leva direto ao primeiro projeto. */
export function InicioPage() {
  const { data, isLoading } = useProjetos();
  if (isLoading) return null;
  const primeiro = data?.[0];
  if (primeiro) return <Navigate to="/projetos/$projetoId" params={{ projetoId: primeiro.id }} replace />;
  return (
    <div className="grid h-full place-items-center p-8 text-center text-sm text-slate-500">
      Nenhum projeto sincronizado. Rode a sync completa do DevOps.
    </div>
  );
}
