// Junta os dados de um projeto e roda o motor de capacidade (@shared/capacidade/motor).
// Squad e Análises leem daqui, então os números são os mesmos nas duas telas.

import { useMemo } from "react";
import { calcularCapacidade, type Celula } from "@shared/capacidade/motor";
import { categoriaDe, TIPOS_FORA_DO_KANBAN } from "@shared/kanban";
import {
  useBacklog,
  useCapacidades,
  useDiasOff,
  useEstados,
  useFeriados,
  useMembrosProjeto,
  useSprints,
} from "./queries";
import { sprintStatus } from "./backlog";
import { normalizarNome } from "./utils";
import { lerSkills, type SkillsPessoa } from "./skills";
import { useRegras } from "./regras";

export interface PessoaProjeto {
  id: string;
  nome: string;
  uniqueName: string | null;
  times: string[];
  skills: string[];
  skillsInfo: SkillsPessoa;
  tags: { id: number; nome: string }[];
  /** Tem task no projeto mas não está em nenhum time dele no DevOps. */
  foraDoTime: boolean;
}

export interface SprintProjeto {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  status: ReturnType<typeof sprintStatus>;
}

export function useCapacidadeProjeto(projetoId: string) {
  const sprints = useSprints(projetoId);
  const backlog = useBacklog(projetoId);
  const membros = useMembrosProjeto(projetoId);
  const capacidades = useCapacidades(projetoId);
  const folgas = useDiasOff(projetoId);
  const feriados = useFeriados();
  const estados = useEstados(projetoId);
  const { regras, carregando: carregandoRegras } = useRegras();

  const consultas = [sprints, backlog, membros, capacidades, folgas, feriados];
  const carregando = consultas.some((q) => q.isLoading) || carregandoRegras;
  const erro = consultas.find((q) => q.error)?.error ?? null;

  const dados = useMemo(() => {
    const pessoas = new Map<string, PessoaProjeto>();
    for (const m of membros.data ?? []) {
      if (!m.pessoa_id) continue;
      const skillsInfo = lerSkills(m.skills);
      const p = pessoas.get(m.pessoa_id) ?? {
        id: m.pessoa_id,
        nome: normalizarNome(m.nome ?? "Sem nome"),
        uniqueName: m.unique_name,
        times: [],
        skills: skillsInfo.skills,
        skillsInfo,
        tags: (m.tags as unknown as { id: number; nome: string }[] | null) ?? [],
        foraDoTime: false,
      };
      if (m.time_nome && !p.times.includes(m.time_nome)) p.times.push(m.time_nome);
      pessoas.set(m.pessoa_id, p);
    }

    const rows = (backlog.data ?? []).filter(
      (r) => r.item_id !== null && !TIPOS_FORA_DO_KANBAN.has(r.item_tipo ?? ""),
    );
    // quem tem task no projeto também pesa, mesmo fora dos times do DevOps
    for (const r of rows) {
      if (r.responsavel_id && !pessoas.has(r.responsavel_id)) {
        pessoas.set(r.responsavel_id, {
          id: r.responsavel_id,
          nome: normalizarNome(r.responsavel_nome ?? "Sem nome"),
          uniqueName: null,
          times: [],
          skills: [],
          skillsInfo: lerSkills([]),
          tags: [],
          foraDoTime: true,
        });
      }
    }

    const pais = new Set(rows.map((r) => r.item_parent_id).filter((x): x is number => x !== null));
    const itens = rows.map((r) => {
      const cat = categoriaDe(r.item_tipo, r.item_estado, estados.data);
      return {
        sprintId: r.sprint_id,
        responsavelId: r.responsavel_id,
        horasRestantes: r.horas_restantes,
        horasEstimadas: r.horas_estimadas,
        horasConcluidas: r.horas_concluidas,
        fechado: cat === "Completed" || cat === "Removed",
        temFilhos: r.item_id !== null && pais.has(r.item_id),
      };
    });

    const sprintsComData: SprintProjeto[] = (sprints.data ?? [])
      .filter((s): s is typeof s & { inicio: string; fim: string } => !!s.inicio && !!s.fim)
      .map((s) => ({ id: s.id, nome: s.nome, inicio: s.inicio, fim: s.fim, status: sprintStatus(s.inicio, s.fim) }))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));

    const listaPessoas = [...pessoas.values()].sort(
      (a, b) => Number(a.foraDoTime) - Number(b.foraDoTime) || a.nome.localeCompare(b.nome, "pt-BR"),
    );

    const celulas = calcularCapacidade({
      sprints: sprintsComData,
      pessoas: listaPessoas.map((p) => {
        const h = regras?.horas(p.id);
        return { id: p.id, horasDia: h?.horasDia ?? 6, origemHoras: h?.origem };
      }),
      alocacoes: (regras?.alocacoes ?? []).filter((a) => a.projetoId === projetoId),
      limites: regras?.limites(projetoId),
      capacidades: (capacidades.data ?? []).map((c) => ({
        sprintId: c.sprint_id,
        pessoaId: c.pessoa_id,
        capacidadeDia: Number(c.capacidade_dia),
      })),
      folgas: (folgas.data ?? []).map((f) => ({ sprintId: f.sprint_id, pessoaId: f.pessoa_id, inicio: f.inicio, fim: f.fim })),
      feriados: (feriados.data ?? []).map((f) => f.data),
      itens,
    });
    const porChave = new Map<string, Celula>(celulas.map((c) => [`${c.sprintId}|${c.pessoaId}`, c]));

    const sprintAtual =
      sprintsComData.find((s) => s.status === "atual") ??
      sprintsComData.find((s) => s.status === "futura") ??
      sprintsComData.at(-1) ??
      null;

    const abertos = itens.filter((i) => !i.fechado && !i.temFilhos);
    return {
      regras,
      pessoas: listaPessoas,
      sprints: sprintsComData,
      sprintAtual,
      celula: (sprintId: string, pessoaId: string) => porChave.get(`${sprintId}|${pessoaId}`),
      semResponsavel: rows.filter((r, i) => !itens[i]!.fechado && !itens[i]!.temFilhos && !r.responsavel_id),
      semEstimativa: rows.filter((r, i) => !itens[i]!.fechado && !itens[i]!.temFilhos && r.sem_estimativa),
      semSprint: abertos.filter((i) => !i.sprintId).length,
    };
  }, [membros.data, backlog.data, sprints.data, capacidades.data, folgas.data, feriados.data, estados.data, regras, projetoId]);

  return { carregando, erro, ...dados };
}
