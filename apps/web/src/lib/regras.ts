// Regras de capacidade do gestor (tabelas regra_capacidade*, alocacao_projeto).
// A resolução em cascata é pura e fica em @shared/capacidade/regras — aqui só leitura,
// gravação e um resolvedor pronto para os motores.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  type AlocacaoProjeto,
  horasDaPessoa,
  type HorasPessoa,
  type Limites,
  limitesDe,
  PADRAO_MERCADO,
  type RegraPessoa,
  type RegraProjeto,
  type RegrasGerais,
} from "@shared/capacidade/regras";
import { supabase } from "./supabase";

export const keyRegras = ["regras"] as const;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export interface Regras {
  geral: RegrasGerais;
  pessoas: Map<string, RegraPessoa>;
  projetos: Map<string, RegraProjeto>;
  alocacoes: AlocacaoProjeto[];
  /** Horas produtivas resolvidas da pessoa (pessoa → geral → mercado). */
  horas: (pessoaId: string) => HorasPessoa;
  /** Limites gerais, ou os do projeto quando informado. */
  limites: (projetoId?: string) => Limites;
}

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

  const regras = useMemo((): Regras | null => {
    const d = q.data;
    if (!d) return null;
    const geral: RegrasGerais = d.geral
      ? {
          jornadaDia: Number(d.geral.jornada_dia),
          foco: Number(d.geral.foco),
          atencao: Number(d.geral.limite_atencao),
          sobrecarga: Number(d.geral.limite_sobrecarga),
        }
      : PADRAO_MERCADO;
    const pessoas = new Map(
      d.pessoas.map((p) => [p.pessoa_id, { pessoaId: p.pessoa_id, jornadaDia: num(p.jornada_dia), foco: num(p.foco) }]),
    );
    const projetos = new Map(
      d.projetos.map((p) => [
        p.projeto_id,
        { projetoId: p.projeto_id, atencao: num(p.limite_atencao), sobrecarga: num(p.limite_sobrecarga) },
      ]),
    );
    return {
      geral,
      pessoas,
      projetos,
      alocacoes: d.alocacoes.map((a) => ({ projetoId: a.projeto_id, pessoaId: a.pessoa_id, horasDia: Number(a.horas_dia) })),
      horas: (pessoaId) => horasDaPessoa(geral, pessoas.get(pessoaId)),
      limites: (projetoId) => limitesDe(geral, projetoId ? projetos.get(projetoId) : null),
    };
  }, [q.data]);

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

/** Ambos nulos = volta a herdar a regra geral (apaga a linha). */
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

/** horasDia nulo = remove a alocação (volta a valer a Capacity do DevOps). */
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
