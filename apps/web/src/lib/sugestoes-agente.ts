// Sugestões do agente de IA (tabela `sugestao`, gravada pela Edge Function `agente`).
// Aprovar/ignorar passam pelo devops-acoes (revalida e aplica no DevOps com auditoria).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "./supabase";

export const keySugestoesAgente = ["sugestoes_agente"] as const;

export interface UsoPessoa {
  pessoaId: string;
  nome: string;
  cargaH: number;
  capacidadeH: number;
  pct: number | null;
  status: "ok" | "limite" | "sobrecarga" | "sem-capacidade";
}

export interface SugestaoAgente {
  id: string;
  tipo: "atribuir" | "rebalancear" | "ausencia" | "equipe";
  projetoId: string | null;
  projeto: string | null;
  titulo: string;
  texto: string;
  prioridade: 1 | 2 | 3;
  gravidade: "critico" | "atencao" | "info";
  usouIA: boolean;
  /** "gemini" | "claude" quando o texto veio de um LLM. */
  ia: string | null;
  criadaEm: string;
  workItemId: number | null;
  antes: UsoPessoa[];
  depois: UsoPessoa[];
}

interface Payload {
  titulo?: string;
  prioridade?: number;
  gravidade?: string;
  projeto?: string | null;
  ia?: string | null;
}

export function useSugestoesAgente(projetoId?: string) {
  return useQuery({
    queryKey: [...keySugestoesAgente, projetoId ?? "todas"],
    queryFn: async (): Promise<SugestaoAgente[]> => {
      let q = supabase
        .from("sugestao")
        .select("id, tipo, projeto_id, markdown, payload, usou_fallback, criada_em, acao, impacto_antes, impacto_depois")
        .eq("status", "pendente")
        .order("criada_em", { ascending: false })
        .limit(50);
      if (projetoId) q = q.eq("projeto_id", projetoId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((s) => {
          const p = (s.payload ?? {}) as Payload;
          const acao = s.acao as { work_item_id?: number } | null;
          return {
            id: s.id,
            tipo: s.tipo as SugestaoAgente["tipo"],
            projetoId: s.projeto_id,
            projeto: p.projeto ?? null,
            titulo: p.titulo ?? "Sugestão",
            texto: s.markdown ?? "",
            prioridade: (p.prioridade === 1 || p.prioridade === 3 ? p.prioridade : 2) as 1 | 2 | 3,
            gravidade: (p.gravidade ?? "atencao") as SugestaoAgente["gravidade"],
            usouIA: !s.usou_fallback,
            ia: p.ia ?? null,
            criadaEm: s.criada_em,
            workItemId: acao?.work_item_id ?? null,
            antes: (s.impacto_antes as UsoPessoa[] | null) ?? [],
            depois: (s.impacto_depois as UsoPessoa[] | null) ?? [],
          };
        })
        .sort((a, b) => a.prioridade - b.prioridade || b.criadaEm.localeCompare(a.criadaEm));
    },
  });
}

async function invocar(nome: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) {
    // corpo do erro da function (ex.: "a situação mudou")
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error : null;
    throw new Error(msg ?? error.message);
  }
  return data as Record<string, unknown>;
}

export function useDecidirSugestao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, aprovar }: { id: string; aprovar: boolean; titulo: string }) =>
      invocar("devops-acoes", { acao: aprovar ? "aprovar_sugestao" : "ignorar_sugestao", sugestao_id: id }),
    onSuccess: (_d, v) => toast.success(v.aprovar ? `Aplicado: ${v.titulo}` : "Sugestão ignorada"),
    onError: (e) => toast.error(e.message),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keySugestoesAgente });
      void qc.invalidateQueries({ queryKey: ["backlog"] });
    },
  });
}

export function useAnalisarAgora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projetoId?: string) => invocar("agente", projetoId ? { projeto_id: projetoId } : {}),
    onSuccess: (r) => {
      const novas = Number(r.novas ?? 0);
      toast.success(novas ? `${novas} ${novas === 1 ? "sugestão nova" : "sugestões novas"} do agente` : "Analisado: nada novo além do que já está na caixa");
      void qc.invalidateQueries({ queryKey: keySugestoesAgente });
    },
    onError: (e) => toast.error(`Não foi possível analisar: ${e.message}`),
  });
}
