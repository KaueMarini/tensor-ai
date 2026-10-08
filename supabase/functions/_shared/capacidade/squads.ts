// Resumo de capacidade de um squad (time do DevOps) numa sprint, a partir das células do motor.
// Puro e determinístico: a tela só exibe.

import { type Celula, type StatusCarga, statusDe } from "./motor.ts";

export interface ResumoSquad {
  pessoas: number;
  capacidadeH: number;
  cargaH: number;
  livreH: number;
  utilizacao: number | null;
  status: StatusCarga;
  itens: number;
  /** Pessoas do squad por status individual (o agregado pode estar ok com alguém sobrecarregado). */
  porStatus: Record<StatusCarga, number>;
}

export function resumirSquad(celulas: (Celula | undefined)[]): ResumoSquad {
  const porStatus: Record<StatusCarga, number> = { ok: 0, limite: 0, sobrecarga: 0, "sem-capacidade": 0 };
  let capacidadeH = 0;
  let cargaH = 0;
  let itens = 0;
  let pessoas = 0;
  let limites: Celula["limites"] | undefined;
  for (const c of celulas) {
    if (!c) continue;
    pessoas++;
    capacidadeH += c.capacidadeH;
    cargaH += c.cargaH;
    itens += c.itens;
    porStatus[c.status]++;
    limites ??= c.limites;
  }
  const { utilizacao, status } = statusDe(cargaH, capacidadeH, limites);
  return { pessoas, capacidadeH, cargaH, livreH: Math.max(0, capacidadeH - cargaH), utilizacao, status, itens, porStatus };
}

/** "IportJLKN12 Team" é o time padrão que o DevOps cria com o projeto. */
export function ehTimePadrao(nomeTime: string, nomeProjeto: string): boolean {
  return nomeTime.trim().toLowerCase() === `${nomeProjeto} team`.trim().toLowerCase();
}
