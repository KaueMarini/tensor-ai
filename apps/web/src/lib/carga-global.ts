import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { montarCargaGlobal } from "@shared/capacidade/montagem";
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
    queryKey: ["backlog", "carga_global", ...ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [sprints, capacidades, folgas, feriados, itens, ausencias] = await Promise.all([
        supabase.from("sprint").select("id, projeto_id, inicio, fim").is("deleted_at", null).not("inicio", "is", null),
        supabase.from("capacidade_sprint").select("sprint_id, pessoa_id, time_id, capacidade_dia").in("pessoa_id", ids),
        supabase.from("dias_off").select("sprint_id, time_id, pessoa_id, inicio, fim").or(`pessoa_id.is.null,pessoa_id.in.(${ids.join(",")})`),
        supabase.from("feriado").select("data"),
        supabase
          .from("v_backlog")
          .select("projeto_id, sprint_id, item_id, item_parent_id, item_tipo, item_estado, responsavel_id, horas_restantes, horas_estimadas, horas_concluidas")
          .in("responsavel_id", ids),
        supabase.from("ausencia").select("pessoa_id, inicio, fim").in("pessoa_id", ids),
      ]);
      return {
        sprints: unwrap(sprints),
        capacidades: unwrap(capacidades),
        folgas: unwrap(folgas),
        feriados: unwrap(feriados),
        itens: unwrap(itens),
        ausencias: unwrap(ausencias),
      };
    },
  });

  const celula = useMemo(() => (q.data && regras ? montarCargaGlobal(q.data, regras, ids) : null), [q.data, regras, ids]);

  return { carregando: q.isLoading || carregandoRegras, erro: q.error, celula, regras };
}
