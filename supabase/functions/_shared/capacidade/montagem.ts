import { type CelulaGlobal, cargaGlobal, type ItemGlobal } from "./global.ts";
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
} from "./regras.ts";
import { categoriaDe, TIPOS_FORA_DO_KANBAN } from "../kanban.ts";

type Num = number | string | null | undefined;
const num = (v: Num) => (v === null || v === undefined ? null : Number(v));

export interface LinhasRegras {
  geral: { jornada_dia: Num; foco: Num; limite_atencao: Num; limite_sobrecarga: Num } | null;
  pessoas: { pessoa_id: string; jornada_dia: Num; foco: Num }[];
  projetos: { projeto_id: string; limite_atencao: Num; limite_sobrecarga: Num }[];
  alocacoes: { projeto_id: string; pessoa_id: string; horas_dia: Num }[];
}

export interface Regras {
  geral: RegrasGerais;
  pessoas: Map<string, RegraPessoa>;
  projetos: Map<string, RegraProjeto>;
  alocacoes: AlocacaoProjeto[];
  horas: (pessoaId: string) => HorasPessoa;
  limites: (projetoId?: string) => Limites;
}

export function regrasDeLinhas(d: LinhasRegras): Regras {
  const geral: RegrasGerais = d.geral
    ? {
        jornadaDia: Number(d.geral.jornada_dia),
        foco: Number(d.geral.foco),
        atencao: Number(d.geral.limite_atencao),
        sobrecarga: Number(d.geral.limite_sobrecarga),
      }
    : PADRAO_MERCADO;
  const pessoas = new Map(d.pessoas.map((p) => [p.pessoa_id, { pessoaId: p.pessoa_id, jornadaDia: num(p.jornada_dia), foco: num(p.foco) }]));
  const projetos = new Map(
    d.projetos.map((p) => [p.projeto_id, { projetoId: p.projeto_id, atencao: num(p.limite_atencao), sobrecarga: num(p.limite_sobrecarga) }]),
  );
  return {
    geral,
    pessoas,
    projetos,
    alocacoes: d.alocacoes.map((a) => ({ projetoId: a.projeto_id, pessoaId: a.pessoa_id, horasDia: Number(a.horas_dia) })),
    horas: (pessoaId) => horasDaPessoa(geral, pessoas.get(pessoaId)),
    limites: (projetoId) => limitesDe(geral, projetoId ? projetos.get(projetoId) : null),
  };
}

export interface LinhasCarga {
  sprints: { id: string; projeto_id: string; inicio: string | null; fim: string | null }[];
  capacidades: { sprint_id: string; pessoa_id: string; time_id: string; capacidade_dia: Num }[];
  folgas: { sprint_id: string; time_id: string; pessoa_id: string | null; inicio: string; fim: string }[];
  feriados: { data: string }[];
  itens: {
    projeto_id: string | null;
    sprint_id: string | null;
    item_id: number | null;
    item_parent_id: number | null;
    item_tipo: string | null;
    item_estado: string | null;
    responsavel_id: string | null;
    horas_restantes: Num;
    horas_estimadas: Num;
    horas_concluidas: Num;
  }[];
  ausencias: { pessoa_id: string; inicio: string; fim: string }[];
}

export type CelulaDe = (periodo: { id: string; inicio: string; fim: string }, pessoaId: string) => CelulaGlobal | undefined;

export function montarCargaGlobal(d: LinhasCarga, regras: Regras, pessoaIds: string[]): CelulaDe {
  const pais = new Set(d.itens.map((r) => r.item_parent_id).filter((x): x is number => x !== null));
  const itens: ItemGlobal[] = d.itens
    .filter((r) => r.item_id !== null && !TIPOS_FORA_DO_KANBAN.has(r.item_tipo ?? ""))
    .map((r) => {
      const cat = categoriaDe(r.item_tipo, r.item_estado);
      return {
        projetoId: r.projeto_id!,
        sprintId: r.sprint_id,
        responsavelId: r.responsavel_id,
        horasRestantes: num(r.horas_restantes),
        horasEstimadas: num(r.horas_estimadas),
        horasConcluidas: num(r.horas_concluidas),
        fechado: cat === "Completed" || cat === "Removed",
        temFilhos: pais.has(r.item_id!),
      };
    });
  const entradaBase = {
    pessoas: pessoaIds.map((id) => {
      const h = regras.horas(id);
      return { id, horasDia: h.horasDia, origemHoras: h.origem };
    }),
    sprints: d.sprints.map((s) => ({ id: s.id, projetoId: s.projeto_id, inicio: s.inicio, fim: s.fim })),
    alocacoes: regras.alocacoes,
    limites: regras.limites(),
    capacidades: d.capacidades.map((c) => ({ sprintId: c.sprint_id, pessoaId: c.pessoa_id, timeId: c.time_id, capacidadeDia: Number(c.capacidade_dia) })),
    folgas: [
      ...d.folgas.map((f) => ({ sprintId: f.sprint_id, timeId: f.time_id, pessoaId: f.pessoa_id, inicio: f.inicio, fim: f.fim })),
      ...d.ausencias.map((a) => ({ sprintId: "", timeId: "", pessoaId: a.pessoa_id, inicio: a.inicio, fim: a.fim })),
    ],
    feriados: d.feriados.map((f) => f.data),
    itens,
  };
  const cache = new Map<string, Map<string, CelulaGlobal>>();
  return (periodo, pessoaId) => {
    let porPessoa = cache.get(periodo.id);
    if (!porPessoa) {
      porPessoa = new Map(cargaGlobal({ periodo, ...entradaBase }).map((c) => [c.pessoaId, c]));
      cache.set(periodo.id, porPessoa);
    }
    return porPessoa.get(pessoaId);
  };
}
