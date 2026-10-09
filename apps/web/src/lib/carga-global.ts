import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { montarCargaGlobal } from "@shared/capacidade/montagem";
import { ausenciasDeLinhas, conflitosAusencia, type TarefaAgendada } from "@shared/capacidade/ausencias";
import { categoriaDe, TIPOS_FORA_DO_KANBAN } from "@shared/kanban";
import { horasPendentes } from "@shared/capacidade/motor";
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
          .select("projeto_id, sprint_id, sprint_nome, sprint_inicio, sprint_fim, item_id, item_parent_id, item_tipo, item_estado, item_titulo, responsavel_id, horas_restantes, horas_estimadas, horas_concluidas")
          .in("responsavel_id", ids),
        supabase.from("ausencia").select("pessoa_id, inicio, fim, tipo").in("pessoa_id", ids),
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

  const conflitos = useMemo(() => {
    if (!q.data) return [];
    const { itens, ausencias, folgas, feriados } = q.data;
    const pais = new Set(itens.map((r) => r.item_parent_id).filter((x): x is number => x !== null));
    const tarefas: TarefaAgendada[] = [];
    for (const r of itens) {
      if (r.item_id === null || !r.projeto_id || TIPOS_FORA_DO_KANBAN.has(r.item_tipo ?? "") || pais.has(r.item_id)) continue;
      const cat = categoriaDe(r.item_tipo, r.item_estado);
      if (cat === "Completed" || cat === "Removed") continue;
      tarefas.push({
        id: r.item_id,
        titulo: r.item_titulo ?? `#${r.item_id}`,
        projetoId: r.projeto_id,
        responsavelId: r.responsavel_id,
        horas: horasPendentes({ horasRestantes: r.horas_restantes, horasEstimadas: r.horas_estimadas, horasConcluidas: r.horas_concluidas }),
        sprint: r.sprint_id && r.sprint_inicio && r.sprint_fim ? { id: r.sprint_id, nome: r.sprint_nome ?? "Sprint", inicio: r.sprint_inicio, fim: r.sprint_fim } : null,
      });
    }
    return conflitosAusencia({
      hoje: new Date().toISOString().slice(0, 10),
      ausencias: ausenciasDeLinhas(ausencias, folgas),
      tarefas,
      feriados: feriados.map((f) => f.data),
    });
  }, [q.data]);

  return { carregando: q.isLoading || carregandoRegras, erro: q.error, celula, regras, conflitos };
}
