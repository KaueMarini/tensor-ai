import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type EquipeSugerida, sugerirEquipe } from "@shared/capacidade/equipe-sugerida";
import type { Membro } from "./membros";
import { proximasSemanas, useOcupacaoEquipe } from "./ocupacao";
import { useMembros } from "./queries";
import { supabase } from "./supabase";

export const HORIZONTE_EQUIPE = proximasSemanas(4);

export function precisaDeEquipe(p: { n_membros: number | null; n_itens: number | null } | null | undefined): boolean {
  if (!p) return false;
  const membros = p.n_membros ?? 0;
  return membros === 0 || (membros === 1 && (p.n_itens ?? 0) === 0);
}

export function usePerfisProjetos() {
  return useQuery({
    queryKey: ["projetos", "perfis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_projeto_resumo").select("id, nome, descricao, tags, n_membros, n_itens");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useEquipeSugerida(projetoId: string) {
  const perfis = usePerfisProjetos();
  const membrosQ = useMembros();
  const eq = useOcupacaoEquipe();

  const resultado = useMemo((): EquipeSugerida | null => {
    const lista = perfis.data;
    const alvo = lista?.find((p) => p.id === projetoId);
    if (!lista || !alvo || !eq.celula || !membrosQ.data) return null;
    const celula = eq.celula;

    const squads = new Map<string, { id: string; nome: string; projetoId: string; pessoaIds: string[] }>();
    for (const r of membrosQ.data) {
      if (!r.time_id || !r.pessoa_id || !r.projeto_id) continue;
      const s = squads.get(r.time_id) ?? { id: r.time_id, nome: r.time_nome ?? "Squad", projetoId: r.projeto_id, pessoaIds: [] };
      if (!s.pessoaIds.includes(r.pessoa_id)) s.pessoaIds.push(r.pessoa_id);
      squads.set(r.time_id, s);
    }

    return sugerirEquipe({
      alvo: { id: alvo.id!, nome: alvo.nome ?? "", descricao: alvo.descricao, tags: alvo.tags ?? [] },
      projetos: lista.filter((p) => p.id !== projetoId).map((p) => ({ id: p.id!, nome: p.nome ?? "", descricao: p.descricao, tags: p.tags ?? [] })),
      pessoas: eq.membros.map((m) => {
        const c = celula(HORIZONTE_EQUIPE, m.pessoaId);
        return {
          id: m.pessoaId,
          skills: m.skills.map((tag) => ({
            tag,
            confirmada: m.skillsInfo.info[tag]?.confirmada ?? true,
            evidencias: m.skillsInfo.info[tag]?.evidencias ?? 0,
          })),
          funcoes: m.tags.map((t) => t.nome),
          capacidadeH: c?.capacidadeH ?? 0,
          livreH: c?.livreH ?? 0,
          status: c?.status ?? "ok",
        };
      }),
      squads: [...squads.values()],
      jaNoProjeto: eq.membros.filter((m) => m.projetos.some((p) => p.id === projetoId)).map((m) => m.pessoaId),
    });
  }, [perfis.data, membrosQ.data, eq.celula, eq.membros, projetoId]);

  const membrosPorId = useMemo(() => new Map<string, Membro>(eq.membros.map((m) => [m.pessoaId, m])), [eq.membros]);

  return {
    carregando: perfis.isLoading || eq.carregando,
    erro: perfis.error ?? eq.erro,
    resultado,
    membrosPorId,
    nomeProjeto: eq.nomeProjeto,
    celula: eq.celula,
  };
}
