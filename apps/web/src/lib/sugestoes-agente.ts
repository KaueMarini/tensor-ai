import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Ferramenta } from "@shared/agente/explicacao";
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

export interface RotaTask {
  taskId: number;
  titulo: string;
  horas: number;
  sprint: string;
  pctSprintAusente: number;
  paraId: string | null;
  paraNome: string | null;
  foraDoTime: boolean;
  antesPct: number | null;
  depoisPct: number | null;
  livreH: number | null;
  skills: string[];
  projetoSemelhante: string | null;
  semelhancaPct: number;
}

interface RotaBruta {
  task_id: number;
  titulo: string;
  horas: number;
  sprint: string;
  pct_sprint_ausente: number;
  para_pessoa_id: string | null;
  fora_do_time?: boolean;
  para_antes_pct?: number;
  para_depois_pct?: number;
  para_livre_h?: number;
  skills?: string[];
  projeto_semelhante?: string | null;
  semelhanca_pct?: number;
}

export interface SugestaoAgente {
  id: string;
  tipo: "atribuir" | "rebalancear" | "ausencia" | "equipe" | "portfolio" | "similares" | "gargalo" | "wip";
  projetoId: string | null;
  projeto: string | null;
  titulo: string;
  texto: string;
  prioridade: 1 | 2 | 3;
  gravidade: "critico" | "atencao" | "info";
  usouIA: boolean;
  ia: string | null;
  criadaEm: string;
  workItemId: number | null;
  antes: UsoPessoa[];
  depois: UsoPessoa[];
  rotas: RotaTask[];
}

interface Payload {
  titulo?: string;
  prioridade?: number;
  gravidade?: string;
  projeto?: string | null;
  ia?: string | null;
  pessoas?: Record<string, { id: string; nome: string }>;
  detalhe?: { rotas?: RotaBruta[] };
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
          const nomes = new Map(Object.values(p.pessoas ?? {}).map((x) => [x.id, x.nome]));
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
            rotas: (p.detalhe?.rotas ?? []).map((r) => ({
              taskId: r.task_id,
              titulo: r.titulo,
              horas: r.horas,
              sprint: r.sprint,
              pctSprintAusente: r.pct_sprint_ausente,
              paraId: r.para_pessoa_id,
              paraNome: r.para_pessoa_id ? (nomes.get(r.para_pessoa_id) ?? "Alguém") : null,
              foraDoTime: !!r.fora_do_time,
              antesPct: r.para_antes_pct ?? null,
              depoisPct: r.para_depois_pct ?? null,
              livreH: r.para_livre_h ?? null,
              skills: r.skills ?? [],
              projetoSemelhante: r.projeto_semelhante ?? null,
              semelhancaPct: r.semelhanca_pct ?? 0,
            })),
          };
        })
        .sort((a, b) => a.prioridade - b.prioridade || b.criadaEm.localeCompare(a.criadaEm));
    },
  });
}

async function invocar(nome: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error : null;
    throw new Error(msg ?? error.message);
  }
  return data as Record<string, unknown>;
}

export function useDecidirSugestao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, aprovar, itens }: { id: string; aprovar: boolean; titulo: string; itens?: number[] }) =>
      invocar("devops-acoes", { acao: aprovar ? "aprovar_sugestao" : "ignorar_sugestao", sugestao_id: id, ...(itens ? { itens } : {}) }),
    onSuccess: (d, v) => {
      if (!v.aprovar) return void toast.success("Sugestão ignorada");
      const total = Number(d.total ?? 0);
      const aplicadas = Number(d.aplicadas ?? 0);
      if (total && aplicadas < total) toast.warning(`${aplicadas} de ${total} tasks roteadas; as outras mudaram no DevOps`);
      else toast.success(total ? `${aplicadas} ${aplicadas === 1 ? "task roteada" : "tasks roteadas"} no DevOps` : `Aplicado: ${v.titulo}`);
    },
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

export interface ExplicacaoAgente {
  ferramentas: Ferramenta[];
  resumo: string;
  leituras: Partial<Record<Ferramenta["tipo"], string>>;
  origem: Record<string, "ia" | "template">;
  ia: string | null;
  gerado_em: string;
}

export function useExplicacao(sugestaoId: string | null) {
  return useQuery({
    queryKey: ["sugestoes_agente", "explicacao", sugestaoId],
    enabled: !!sugestaoId,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => (await invocar("agente", { acao: "explicar", sugestao_id: sugestaoId })) as unknown as ExplicacaoAgente,
  });
}
