// Portfólio (determinístico): ESFORÇO × IMPACTO de cada projeto e projetos PARECIDOS.
//
// Esforço = horas planejadas no horizonte (motor global, todos os projetos) e a fatia da
// capacidade da equipe que isso consome; impacto = 1 baixo, 2 médio, 3 alto (gestor > DevOps >
// sugerido pela IA). Leituras:
//   esforco-alto-impacto-baixo  impacto baixo consumindo muito (≥ 15% da equipe ou ≥ 1,5× a média)
//   impacto-alto-pouco-esforco  impacto alto com trabalho aberto, mas quase ninguém nele (< ½ média)
//   equilibrado | sem-impacto (ninguém definiu nem a IA estimou) | sem-trabalho
// Parecidos: semelhança entre descrição + tags (mesmo cálculo da equipe sugerida).

import { similaridade, termosDoProjeto } from "./equipe-sugerida.ts";

export type Impacto = 1 | 2 | 3;
export type OrigemImpacto = "gestor" | "devops" | "ia";
export type Leitura = "esforco-alto-impacto-baixo" | "impacto-alto-pouco-esforco" | "equilibrado" | "sem-impacto" | "sem-trabalho";

export const ROTULO_IMPACTO: Record<Impacto, string> = { 1: "baixo", 2: "médio", 3: "alto" };

export interface ProjetoPortfolio {
  id: string;
  nome: string;
  descricao: string | null;
  tags: string[];
  impacto: Impacto | null;
  impactoOrigem: OrigemImpacto | null;
}

export interface EsforcoProjeto {
  /** Horas de tasks do projeto que caem no horizonte (todas as pessoas). */
  horasHorizonte: number;
  /** Pessoas com carga do projeto no horizonte. */
  pessoas: number;
  /** Horas pendentes de todas as tasks abertas (qualquer sprint). */
  horasAbertas: number;
}

export interface AvaliacaoProjeto extends EsforcoProjeto {
  projetoId: string;
  impacto: Impacto | null;
  impactoOrigem: OrigemImpacto | null;
  /** Fatia da capacidade total da equipe no horizonte (0..1). */
  fatia: number;
  /** Média da fatia dos projetos com trabalho no horizonte. */
  fatiaMedia: number;
  /** 1 = projeto que mais consome a equipe. */
  rankEsforco: number;
  leitura: Leitura;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function avaliarPortfolio(e: {
  projetos: ProjetoPortfolio[];
  esforco: (projetoId: string) => EsforcoProjeto;
  capacidadeTotalH: number;
}): AvaliacaoProjeto[] {
  const base = e.projetos.map((p) => {
    const esf = e.esforco(p.id);
    return { p, esf, fatia: e.capacidadeTotalH > 0 ? esf.horasHorizonte / e.capacidadeTotalH : 0 };
  });
  const ativos = base.filter((x) => x.esf.horasHorizonte > 0);
  const media = ativos.length ? ativos.reduce((n, x) => n + x.fatia, 0) / ativos.length : 0;
  const ordem = [...base].sort((a, b) => b.esf.horasHorizonte - a.esf.horasHorizonte).map((x) => x.p.id);

  return base.map(({ p, esf, fatia }) => {
    let leitura: Leitura;
    if (esf.horasHorizonte === 0 && esf.horasAbertas === 0) leitura = "sem-trabalho";
    else if (p.impacto === null) leitura = "sem-impacto";
    else if (p.impacto === 1 && esf.horasHorizonte > 0 && (fatia >= 0.15 || (ativos.length >= 2 && fatia >= 1.5 * media))) leitura = "esforco-alto-impacto-baixo";
    else if (p.impacto === 3 && esf.horasAbertas > 0 && ativos.length >= 2 && fatia < 0.5 * media) leitura = "impacto-alto-pouco-esforco";
    else leitura = "equilibrado";
    return {
      projetoId: p.id,
      impacto: p.impacto,
      impactoOrigem: p.impactoOrigem,
      ...esf,
      fatia: r3(fatia),
      fatiaMedia: r3(media),
      rankEsforco: ordem.indexOf(p.id) + 1,
      leitura,
    };
  });
}

export interface ParParecido {
  a: string;
  b: string;
  similaridade: number;
  emComum: string[];
}

/** Pares de projetos com descrição/tags muito parecidas (possível retrabalho ou sinergia). */
export function projetosParecidos(projetos: ProjetoPortfolio[], catalogo: string[], limiar = 0.35): ParParecido[] {
  const termos = projetos.map((p) => ({ p, t: termosDoProjeto(p, catalogo) })).filter((x) => x.t.length >= 2);
  const out: ParParecido[] = [];
  for (let i = 0; i < termos.length; i++)
    for (let j = i + 1; j < termos.length; j++) {
      const A = termos[i]!;
      const B = termos[j]!;
      const s = similaridade(A.t, B.t);
      if (s < limiar) continue;
      const chavesB = new Set(B.t.map((x) => x.chave));
      const [a, b] = [A.p.id, B.p.id].sort();
      out.push({ a: a!, b: b!, similaridade: r3(s), emComum: A.t.filter((x) => chavesB.has(x.chave)).map((x) => x.termo) });
    }
  return out.sort((x, y) => y.similaridade - x.similaridade);
}
