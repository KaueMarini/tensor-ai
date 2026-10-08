// Kanban por categoria de estado. Cada processo (Agile, Scrum, Basic, custom) tem nomes de
// estado diferentes, mas toda categoria é fixa no DevOps — as colunas usam a categoria.
// Puro: usado pela Edge Function (escolher o estado de destino) e pelo front (colunas).

import type { AzdoStateCategory, AzdoWorkItemState } from "./azdo/types.ts";

export type Categoria = Exclude<AzdoStateCategory, "Removed">;

export const CATEGORIAS: Categoria[] = ["Proposed", "InProgress", "Resolved", "Completed"];

/** Tipos que não entram no Kanban nem podem ser movidos pelo app (regra: Features nunca mudam). */
export const TIPOS_FORA_DO_KANBAN = new Set(["Feature", "Epic"]);

/** Estados por tipo: { Task: [{ nome, categoria }] }. */
export type EstadosPorTipo = Record<string, { nome: string; categoria: AzdoStateCategory }[]>;

export function mapearEstados(states: AzdoWorkItemState[]) {
  return states.map((s) => ({ nome: s.name, categoria: s.category }));
}

/** Primeiro estado do tipo que pertence à categoria (ordem do processo). */
export function estadoDestino(estados: { nome: string; categoria: AzdoStateCategory }[], categoria: Categoria) {
  return estados.find((e) => e.categoria === categoria)?.nome ?? null;
}

const POR_NOME: Record<string, AzdoStateCategory> = {
  new: "Proposed",
  "to do": "Proposed",
  proposed: "Proposed",
  approved: "Proposed",
  active: "InProgress",
  "in progress": "InProgress",
  doing: "InProgress",
  committed: "InProgress",
  open: "InProgress",
  resolved: "Resolved",
  closed: "Completed",
  done: "Completed",
  completed: "Completed",
  removed: "Removed",
  cut: "Removed",
};

/** Categoria de um estado. Usa os metadados do processo e, sem eles, o nome conhecido. */
export function categoriaDe(tipo: string | null, estado: string | null, estados?: EstadosPorTipo): AzdoStateCategory {
  if (!estado) return "Proposed";
  const doTipo = tipo ? estados?.[tipo]?.find((e) => e.nome === estado) : undefined;
  return doTipo?.categoria ?? POR_NOME[estado.toLowerCase()] ?? "InProgress";
}
