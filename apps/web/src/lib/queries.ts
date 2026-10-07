import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Views } from "./supabase";

export const keys = {
  projetos: ["projetos"] as const,
  sprints: (projetoId: string) => ["sprints", projetoId] as const,
  backlog: (projetoId: string) => ["backlog", projetoId] as const,
  syncState: ["sync_state"] as const,
  membros: ["membros"] as const,
  skillsCatalogo: ["skills_catalogo"] as const,
  funcaoTags: ["funcao_tags"] as const,
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

// =====================================================================
// Membros: skills (skill_tag, já existente) + tags de função (funcao_tag, nova)
// =====================================================================

export type MembroRow = Views<"v_membros">;

/** Todos os vínculos pessoa × time de todos os projetos; a tela agrupa por pessoa ou por projeto. */
export function useMembros() {
  return useQuery({
    queryKey: keys.membros,
    queryFn: async () => unwrap(await supabase.from("v_membros").select("*").order("nome")),
  });
}

/** Skills já usadas por alguém, pra autocomplete — skill continua texto livre, sem catálogo rígido. */
export function useSkillsCatalogo() {
  return useQuery({
    queryKey: keys.skillsCatalogo,
    queryFn: async () => {
      const { data, error } = await supabase.from("skill_tag").select("tag").order("tag");
      if (error) throw new Error(error.message);
      return [...new Set((data ?? []).map((r) => r.tag))];
    },
  });
}

/** Catálogo de tags de função (Desenvolvedor, Tech Lead...) — gestor cria/edita/remove. */
export function useFuncaoTags() {
  return useQuery({
    queryKey: keys.funcaoTags,
    queryFn: async () => unwrap(await supabase.from("funcao_tag").select("id, nome").order("nome")),
  });
}

function useInvalidarMembros() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: keys.membros });
}

export function useAdicionarSkill() {
  const invalidar = useInvalidarMembros();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pessoaId, skill }: { pessoaId: string; skill: string }) => {
      const { error } = await supabase
        .from("skill_tag")
        .insert({ pessoa_id: pessoaId, tag: skill.trim(), origem: "gestor", confirmada: true });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidar();
      void qc.invalidateQueries({ queryKey: keys.skillsCatalogo });
    },
  });
}

export function useRemoverSkill() {
  const invalidar = useInvalidarMembros();
  return useMutation({
    mutationFn: async ({ pessoaId, skill }: { pessoaId: string; skill: string }) => {
      const { error } = await supabase.from("skill_tag").delete().eq("pessoa_id", pessoaId).eq("tag", skill);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}

export function useCriarFuncaoTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase.from("funcao_tag").insert({ nome: nome.trim() }).select("id, nome").single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.funcaoTags }),
  });
}

export function useRenomearFuncaoTag() {
  const invalidar = useInvalidarMembros();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nome }: { id: number; nome: string }) => {
      const { error } = await supabase.from("funcao_tag").update({ nome: nome.trim() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.funcaoTags });
      invalidar();
    },
  });
}

export function useExcluirFuncaoTag() {
  const invalidar = useInvalidarMembros();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("funcao_tag").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.funcaoTags });
      invalidar();
    },
  });
}

export function useAssociarFuncaoTag() {
  const invalidar = useInvalidarMembros();
  return useMutation({
    mutationFn: async ({ pessoaId, funcaoTagId }: { pessoaId: string; funcaoTagId: number }) => {
      const { error } = await supabase.from("pessoa_funcao_tag").insert({ pessoa_id: pessoaId, funcao_tag_id: funcaoTagId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}

export function useDesassociarFuncaoTag() {
  const invalidar = useInvalidarMembros();
  return useMutation({
    mutationFn: async ({ pessoaId, funcaoTagId }: { pessoaId: string; funcaoTagId: number }) => {
      const { error } = await supabase
        .from("pessoa_funcao_tag")
        .delete()
        .eq("pessoa_id", pessoaId)
        .eq("funcao_tag_id", funcaoTagId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}
