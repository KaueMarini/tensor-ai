import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export const keys = {
  projetos: ["projetos"] as const,
  sprints: (projetoId: string) => ["sprints", projetoId] as const,
  backlog: (projetoId: string) => ["backlog", projetoId] as const,
  syncState: ["sync_state"] as const,
};

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function useProjetos() {
  return useQuery({
    queryKey: keys.projetos,
    queryFn: async () => unwrap(await supabase.from("projeto").select("id, nome, descricao").order("nome")),
  });
}

export function useSprints(projetoId: string) {
  return useQuery({
    queryKey: keys.sprints(projetoId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("sprint")
          .select("id, nome, inicio, fim, iteration_path")
          .eq("projeto_id", projetoId)
          .is("deleted_at", null)
          .order("inicio", { ascending: true, nullsFirst: false }),
      ),
  });
}

export function useBacklog(projetoId: string) {
  return useQuery({
    queryKey: keys.backlog(projetoId),
    queryFn: async () => unwrap(await supabase.from("v_backlog").select("*").eq("projeto_id", projetoId)),
  });
}

export function useSyncState() {
  return useQuery({
    queryKey: keys.syncState,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("sync_state")
          .select("projeto_id, fase, ultima_reconciliacao_em, ultima_reconciliacao_ok, ultimo_erro, atualizado_em"),
      ),
  });
}
