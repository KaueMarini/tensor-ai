// Agrupa as linhas planas de v_backlog em Sprint → Feature → itens (com sub-árvore por parent,
// ex.: Feature → User Story → Task). Função pura: sem React, sem Supabase.

import type { Views } from "./supabase";

export type BacklogRow = Views<"v_backlog">;

export interface SprintInfo {
  id: string;
  nome: string;
  inicio: string | null;
  fim: string | null;
}

export type SprintStatus = "atual" | "futura" | "passada" | "sem-data";

export interface Totais {
  itens: number;
  estimadas: number;
  restantes: number;
  concluidas: number;
  semEstimativa: number;
}

export interface ItemNode {
  row: BacklogRow;
  depth: number;
  temFilhos: boolean;
}

export interface FeatureGroup {
  key: string;
  id: number | null;
  titulo: string;
  estado: string | null;
  itens: ItemNode[];
  totais: Totais;
}

export interface SprintGroup {
  key: string;
  id: string | null;
  nome: string;
  inicio: string | null;
  fim: string | null;
  status: SprintStatus;
  features: FeatureGroup[];
  totais: Totais;
}

const SEM_SPRINT = "__sem_sprint__";

export function hojeISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function sprintStatus(inicio: string | null, fim: string | null, hoje = hojeISO()): SprintStatus {
  if (!inicio || !fim) return "sem-data";
  if (hoje < inicio.slice(0, 10)) return "futura";
  if (hoje > fim.slice(0, 10)) return "passada";
  return "atual";
}

function totaisVazios(): Totais {
  return { itens: 0, estimadas: 0, restantes: 0, concluidas: 0, semEstimativa: 0 };
}

function somar(t: Totais, n: ItemNode) {
  t.itens++;
  t.estimadas += n.row.horas_estimadas ?? 0;
  t.restantes += n.row.horas_restantes ?? 0;
  t.concluidas += n.row.horas_concluidas ?? 0;
  if (n.row.sem_estimativa && !n.temFilhos) t.semEstimativa++;
}

function acumular(dest: Totais, src: Totais) {
  dest.itens += src.itens;
  dest.estimadas += src.estimadas;
  dest.restantes += src.restantes;
  dest.concluidas += src.concluidas;
  dest.semEstimativa += src.semEstimativa;
}

/** Ordena os itens de uma feature como árvore (pai antes dos filhos) e calcula a profundidade. */
function arvore(rows: BacklogRow[]): ItemNode[] {
  const ids = new Set(rows.map((r) => r.item_id));
  const filhos = new Map<number | null, BacklogRow[]>();
  for (const r of rows) {
    const pai = r.item_parent_id !== null && ids.has(r.item_parent_id) ? r.item_parent_id : null;
    const lista = filhos.get(pai) ?? [];
    lista.push(r);
    filhos.set(pai, lista);
  }
  const out: ItemNode[] = [];
  const visitar = (pai: number | null, depth: number) => {
    const lista = (filhos.get(pai) ?? []).sort((a, b) => (a.item_id ?? 0) - (b.item_id ?? 0));
    for (const r of lista) {
      const temFilhos = filhos.has(r.item_id);
      out.push({ row: r, depth, temFilhos });
      if (temFilhos) visitar(r.item_id, depth + 1);
    }
  };
  visitar(null, 0);
  return out;
}

export function matchBusca(r: BacklogRow, busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  const alvo = [
    r.item_titulo,
    r.feature_titulo,
    r.responsavel_nome,
    r.item_estado,
    r.item_id ? `#${r.item_id}` : null,
    ...(r.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return alvo.includes(q);
}

export function agruparBacklog(
  sprints: SprintInfo[],
  rows: BacklogRow[],
  opts: { busca?: string; hoje?: string } = {},
): SprintGroup[] {
  const busca = opts.busca ?? "";
  const filtradas = rows.filter((r) => matchBusca(r, busca));

  const porSprint = new Map<string, BacklogRow[]>();
  for (const r of filtradas) {
    const k = r.sprint_id ?? SEM_SPRINT;
    const lista = porSprint.get(k) ?? [];
    lista.push(r);
    porSprint.set(k, lista);
  }

  const grupos: SprintGroup[] = [];
  const montar = (key: string, info: Omit<SprintGroup, "key" | "features" | "totais" | "status">) => {
    const linhas = porSprint.get(key) ?? [];
    const porFeature = new Map<string, BacklogRow[]>();
    for (const r of linhas) {
      const fk = r.feature_id === null ? "sem-feature" : String(r.feature_id);
      const lista = porFeature.get(fk) ?? [];
      lista.push(r);
      porFeature.set(fk, lista);
    }
    const features: FeatureGroup[] = [...porFeature.entries()].map(([fk, lista]) => {
      const primeira = lista[0]!;
      const itens = arvore(lista.filter((r) => r.item_id !== null));
      const totais = totaisVazios();
      for (const n of itens) somar(totais, n);
      return {
        key: `${key}:${fk}`,
        id: primeira.feature_id,
        titulo: primeira.feature_id === null ? "Sem feature" : (primeira.feature_titulo ?? `Feature #${primeira.feature_id}`),
        estado: primeira.feature_estado,
        itens,
        totais,
      };
    });
    // Features nomeadas primeiro (por id), "Sem feature" no fim
    features.sort((a, b) => (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER));
    const totais = totaisVazios();
    for (const f of features) acumular(totais, f.totais);
    grupos.push({ key, ...info, status: sprintStatus(info.inicio, info.fim, opts.hoje), features, totais });
  };

  for (const s of sprints) {
    const temLinhas = porSprint.has(s.id);
    // Iterações sem data e sem itens (ex.: as padrão do DevOps) só poluem a tabela
    if (!temLinhas && (busca || !s.inicio)) continue;
    montar(s.id, { id: s.id, nome: s.nome, inicio: s.inicio, fim: s.fim });
  }
  if (porSprint.has(SEM_SPRINT)) {
    montar(SEM_SPRINT, { id: null, nome: "Sem sprint", inicio: null, fim: null });
  }
  return grupos;
}
