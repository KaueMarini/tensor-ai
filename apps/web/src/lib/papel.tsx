// RBAC no front (espelho do que o banco já garante por RLS e as Edge Functions por middleware):
// o papel vem do servidor (rpc papel_atual, a partir do JWT assinado), nunca de algo editável
// no navegador. Esconder na tela é conforto; a proteção de verdade está no banco.

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { supabase } from "./supabase";

export type Papel = "admin" | "gestor" | "membro";

export function usePapel() {
  const q = useQuery({
    queryKey: ["papel"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("papel_atual");
      if (error) throw new Error(error.message);
      return (data as Papel | null) ?? "membro";
    },
  });
  const papel = q.data ?? null;
  return { papel, carregando: q.isLoading, ehGestor: papel === "admin" || papel === "gestor", ehAdmin: papel === "admin" };
}

/** Conteúdo só para gestor/admin; membro vê o aviso (ou nada, com `oculto`). */
export function SomenteGestor({ children, oculto }: { children: ReactNode; oculto?: boolean }) {
  const { ehGestor, carregando } = usePapel();
  if (carregando) return null;
  if (ehGestor) return <>{children}</>;
  if (oculto) return null;
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white px-6 py-10 text-center dark:border-slate-800 dark:bg-slate-900">
      <ShieldAlert className="mx-auto mb-3 size-8 text-slate-400" />
      <p className="font-medium text-slate-800 dark:text-slate-100">Acesso restrito a gestores</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Esta área tem informações executivas e dados de alocação das pessoas. Peça acesso a um administrador.
      </p>
    </div>
  );
}
