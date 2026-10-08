// Carga global (todos os projetos) das pessoas candidatas, para a tela Análises.
// Busca só o necessário dessas pessoas e roda o motor puro @shared/capacidade/global.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type CelulaGlobal, cargaGlobal, type ItemGlobal } from "@shared/capacidade/global";
import { categoriaDe, TIPOS_FORA_DO_KANBAN } from "@shared/kanban";
import { supabase } from "./supabase";
import { useRegras } from "./regras";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function useCargaGlobal(pessoaIds: string[]) {
  const { regras, carregando: carregandoRegras } = useRegras();
  const ids = useMemo(() => [...new Set(pessoaIds)].sort(), [pessoaIds]);

  const q = useQuery({
    // prefixo "backlog": o Realtime de work_item já invalida
    queryKey: ["backlog", "carga_global", ...ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [sprints, capacidades, folgas, feriados, itens] = await Promise.all([
        supabase.from("sprint").select("id, projeto_id, inicio, fim").is("deleted_at", null).not("inicio", "is", null),
        supabase.from("capacidade_sprint").select("sprint_id, pessoa_id, time_id, capacidade_dia").in("pessoa_id", ids),
        supabase.from("dias_off").select("sprint_id, time_id, pessoa_id, inicio, fim").or(`pessoa_id.is.null,pessoa_id.in.(${ids.join(",")})`),
        supabase.from("feriado").select("data"),
        supabase
          .from("v_backlog")
          .select("projeto_id, sprint_id, item_id, item_parent_id, item_tipo, item_estado, responsavel_id, horas_restantes, horas_estimadas, horas_concluidas")
          .in("responsavel_id", ids),
      ]);
      return {
        sprints: unwrap(sprints),
        capacidades: unwrap(capacidades),
        folgas: unwrap(folgas),
        feriados: unwrap(feriados),
        itens: unwrap(itens),
      };
    },
  });

  const celula = useMemo(() => {
    const d = q.data;
    if (!d || !regras) return null;
    const pais = new Set(d.itens.map((r) => r.item_parent_id).filter((x): x is number => x !== null));
    const itens: ItemGlobal[] = d.itens
      .filter((r) => r.item_id !== null && !TIPOS_FORA_DO_KANBAN.has(r.item_tipo ?? ""))
      .map((r) => {
        const cat = categoriaDe(r.item_tipo, r.item_estado);
        return {
          projetoId: r.projeto_id!,
          sprintId: r.sprint_id,
          responsavelId: r.responsavel_id,
          horasRestantes: r.horas_restantes,
          horasEstimadas: r.horas_estimadas,
          horasConcluidas: r.horas_concluidas,
          fechado: cat === "Completed" || cat === "Removed",
          temFilhos: pais.has(r.item_id!),
        };
      });
    const entradaBase = {
      pessoas: ids.map((id) => {
        const h = regras.horas(id);
        return { id, horasDia: h.horasDia, origemHoras: h.origem };
      }),
      sprints: d.sprints.map((s) => ({ id: s.id, projetoId: s.projeto_id, inicio: s.inicio, fim: s.fim })),
      alocacoes: regras.alocacoes,
      limites: regras.limites(),
      capacidades: d.capacidades.map((c) => ({
        sprintId: c.sprint_id,
        pessoaId: c.pessoa_id,
        timeId: c.time_id,
        capacidadeDia: Number(c.capacidade_dia),
      })),
      folgas: d.folgas.map((f) => ({ sprintId: f.sprint_id, timeId: f.time_id, pessoaId: f.pessoa_id, inicio: f.inicio, fim: f.fim })),
      feriados: d.feriados.map((f) => f.data),
      itens,
    };
    const cache = new Map<string, Map<string, CelulaGlobal>>();
    /** Célula global da pessoa no período (ex.: as datas da sprint da task). */
    return (periodo: { id: string; inicio: string; fim: string }, pessoaId: string): CelulaGlobal | undefined => {
      let porPessoa = cache.get(periodo.id);
      if (!porPessoa) {
        porPessoa = new Map(cargaGlobal({ periodo, ...entradaBase }).map((c) => [c.pessoaId, c]));
        cache.set(periodo.id, porPessoa);
      }
      return porPessoa.get(pessoaId);
    };
  }, [q.data, regras, ids]);

  return { carregando: q.isLoading || carregandoRegras, erro: q.error, celula, regras };
}
