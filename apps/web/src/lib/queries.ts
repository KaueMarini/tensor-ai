import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { Categoria, EstadosPorTipo } from "@shared/kanban";
import { supabase, type Views } from "./supabase";

export const keys = {
  projetos: ["projetos"] as const,
  projeto: (id: string) => ["projetos", "um", id] as const,
  projetosPagina: (busca: string, pagina: number) => ["projetos", "pagina", busca, pagina] as const,
  projetosPorIds: (ids: string[]) => ["projetos", "ids", ...ids] as const,
  sprints: (projetoId: string) => ["sprints", projetoId] as const,
  backlog: (projetoId: string) => ["backlog", projetoId] as const,
  syncState: ["sync_state"] as const,
  membros: ["membros"] as const,
  membrosProjeto: (projetoId: string) => ["membros", "projeto", projetoId] as const,
  capacidade: (projetoId: string) => ["capacidade", projetoId] as const,
  diasOff: (projetoId: string) => ["dias_off", projetoId] as const,
  feriados: ["feriados"] as const,
  estados: (projetoId: string) => ["estados", projetoId] as const,
  skillsCatalogo: ["skills_catalogo"] as const,
  funcaoTags: ["funcao_tags"] as const,
};

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Chama uma Edge Function e devolve a mensagem de erro do corpo (não só "non-2xx"). */
async function invocar<T>(nome: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(nome, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const corpo = (await error.context.json().catch(() => null)) as { error?: string } | null;
      throw new Error(corpo?.error ?? error.message);
    }
    throw error;
  }
  return data as T;
}

// =====================================================================
// Projetos (pensado para muitos: paginação e busca no banco)
// =====================================================================

export type ProjetoResumo = Views<"v_projeto_resumo">;
export const POR_PAGINA = 20;

export function useProjetosPagina(busca: string, pagina: number) {
  return useQuery({
    queryKey: keys.projetosPagina(busca, pagina),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("v_projeto_resumo").select("*", { count: "exact" }).order("nome");
      const termo = busca.trim();
      if (termo) q = q.ilike("nome", `%${termo.replace(/[%_]/g, (c) => `\\${c}`)}%`);
      const { data, error, count } = await q.range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (error) throw new Error(error.message);
      return { projetos: data ?? [], total: count ?? 0 };
    },
  });
}

export function useProjeto(id: string) {
  return useQuery({
    queryKey: keys.projeto(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("v_projeto_resumo").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useProjetosPorIds(ids: string[]) {
  return useQuery({
    queryKey: keys.projetosPorIds(ids),
    enabled: ids.length > 0,
    queryFn: async () => unwrap(await supabase.from("projeto").select("id, nome").in("id", ids)),
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

export function useMembrosProjeto(projetoId: string) {
  return useQuery({
    queryKey: keys.membrosProjeto(projetoId),
    queryFn: async () =>
      unwrap(await supabase.from("v_membros").select("*").eq("projeto_id", projetoId).order("nome")),
  });
}

// =====================================================================
// Capacidade (insumos do motor em @shared/capacidade/motor)
// =====================================================================

export function useCapacidades(projetoId: string) {
  return useQuery({
    queryKey: keys.capacidade(projetoId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("capacidade_sprint")
          .select("sprint_id, pessoa_id, capacidade_dia, sprint!inner(projeto_id)")
          .eq("sprint.projeto_id", projetoId),
      ),
  });
}

export function useDiasOff(projetoId: string) {
  return useQuery({
    queryKey: keys.diasOff(projetoId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("dias_off")
          .select("sprint_id, pessoa_id, inicio, fim, sprint!inner(projeto_id)")
          .eq("sprint.projeto_id", projetoId),
      ),
  });
}

export function useFeriados() {
  return useQuery({
    queryKey: keys.feriados,
    staleTime: 60 * 60_000,
    queryFn: async () => unwrap(await supabase.from("feriado").select("data, nome")),
  });
}

// =====================================================================
// Kanban: estados do processo e mover card (escreve no DevOps)
// =====================================================================

export function useEstados(projetoId: string) {
  return useQuery({
    queryKey: keys.estados(projetoId),
    staleTime: 60 * 60_000,
    retry: 1,
    queryFn: async () =>
      (await invocar<{ estados: EstadosPorTipo }>("devops-acoes", { acao: "estados", projeto_id: projetoId })).estados,
  });
}

export function useMoverCard() {
  return useMutation({
    mutationFn: (v: { devopsId: number; categoria: Categoria }) =>
      invocar<{ ok: true; de: string; para: string; semMudanca?: boolean }>("devops-acoes", {
        acao: "mover",
        devops_id: v.devopsId,
        categoria: v.categoria,
      }),
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
