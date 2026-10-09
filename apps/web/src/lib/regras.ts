import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type RegraPessoa, type RegraProjeto, type RegrasGerais } from "@shared/capacidade/regras";
import { type Regras, regrasDeLinhas } from "@shared/capacidade/montagem";
import { supabase } from "./supabase";

export const keyRegras = ["regras"] as const;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type { Regras };

export function useRegras() {
  const q = useQuery({
    queryKey: keyRegras,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [geral, pessoas, projetos, alocacoes] = await Promise.all([
        supabase.from("regra_capacidade").select("*").maybeSingle(),
        supabase.from("regra_capacidade_pessoa").select("pessoa_id, jornada_dia, foco"),
        supabase.from("regra_capacidade_projeto").select("projeto_id, limite_atencao, limite_sobrecarga"),
        supabase.from("alocacao_projeto").select("projeto_id, pessoa_id, horas_dia"),
      ]);
      return { geral: unwrap(geral), pessoas: unwrap(pessoas), projetos: unwrap(projetos), alocacoes: unwrap(alocacoes) };
    },
  });
  const regras = useMemo((): Regras | null => (q.data ? regrasDeLinhas(q.data) : null), [q.data]);
  return { regras, carregando: q.isLoading, erro: q.error };
}

function useSalvar<T>(fn: (v: T) => Promise<void>, sucesso: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(sucesso);
      void qc.invalidateQueries({ queryKey: keyRegras });
    },
    onError: (e) => toast.error(`Não foi possível salvar: ${e.message}`),
  });
}

export function useSalvarRegrasGerais() {
  return useSalvar(async (g: RegrasGerais) => {
    unwrap(
      await supabase
        .from("regra_capacidade")
        .update({ jornada_dia: g.jornadaDia, foco: g.foco, limite_atencao: g.atencao, limite_sobrecarga: g.sobrecarga })
        .eq("id", true)
        .select("id"),
    );
  }, "Regras gerais salvas");
}

export function useSalvarRegraPessoa() {
  return useSalvar(async ({ pessoaId, jornadaDia, foco }: RegraPessoa) => {
    if (jornadaDia === null && foco === null) {
      unwrap(await supabase.from("regra_capacidade_pessoa").delete().eq("pessoa_id", pessoaId).select("pessoa_id"));
      return;
    }
    unwrap(
      await supabase
        .from("regra_capacidade_pessoa")
        .upsert({ pessoa_id: pessoaId, jornada_dia: jornadaDia, foco })
        .select("pessoa_id"),
    );
  }, "Jornada da pessoa salva");
}

export function useSalvarRegraProjeto() {
  return useSalvar(async ({ projetoId, atencao, sobrecarga }: RegraProjeto) => {
    if (atencao === null && sobrecarga === null) {
      unwrap(await supabase.from("regra_capacidade_projeto").delete().eq("projeto_id", projetoId).select("projeto_id"));
      return;
    }
    unwrap(
      await supabase
        .from("regra_capacidade_projeto")
        .upsert({ projeto_id: projetoId, limite_atencao: atencao, limite_sobrecarga: sobrecarga })
        .select("projeto_id"),
    );
  }, "Limites do projeto salvos");
}

export function useSalvarAlocacao() {
  return useSalvar(async ({ projetoId, pessoaId, horasDia }: { projetoId: string; pessoaId: string; horasDia: number | null }) => {
    if (horasDia === null) {
      unwrap(
        await supabase.from("alocacao_projeto").delete().eq("projeto_id", projetoId).eq("pessoa_id", pessoaId).select("pessoa_id"),
      );
      return;
    }
    unwrap(
      await supabase
        .from("alocacao_projeto")
        .upsert({ projeto_id: projetoId, pessoa_id: pessoaId, horas_dia: horasDia })
        .select("pessoa_id"),
    );
  }, "Horas no projeto salvas");
}
