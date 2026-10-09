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
  porDescricao: number;
  porTags: number;
  emComum: string[];
  palavras: string[];
}

const STOP = new Set(
  ("a o os as um uma uns umas de da do das dos em no na nos nas para por com sem e ou que se ao aos sua seu suas seus como mais " +
    "entre pelo pela pelos pelas sobre via cada todo toda todos todas este esta esse essa isso antes depois quando onde ser sao " +
    "tem ter tambem the and for with of to in on is are").split(" "),
);

export function palavrasDescricao(texto: string | null): string[] {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w))
    .map((w) => (w.length > 5 && w.endsWith("s") ? w.slice(0, -1) : w));
}

function vetores(docs: string[][]) {
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const n = docs.length;
  return docs.map((d) => {
    const tf = new Map<string, number>();
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1);
    const v = new Map<string, number>();
    for (const [w, c] of tf) v.set(w, c * Math.log(1 + n / (df.get(w) ?? 1)));
    return v;
  });
}

function cosseno(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [w, x] of a) {
    na += x * x;
    const y = b.get(w);
    if (y) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function projetosParecidos(projetos: ProjetoPortfolio[], catalogo: string[], limiar = 0.3): ParParecido[] {
  const base = projetos.map((p) => ({ p, t: termosDoProjeto(p, catalogo), w: palavrasDescricao(p.descricao) }));
  const vs = vetores(base.map((x) => x.w));
  const out: ParParecido[] = [];
  for (let i = 0; i < base.length; i++)
    for (let j = i + 1; j < base.length; j++) {
      const A = base[i]!;
      const B = base[j]!;
      if (A.w.length < 3 && A.t.length < 2) continue;
      if (B.w.length < 3 && B.t.length < 2) continue;
      const porDescricao = cosseno(vs[i]!, vs[j]!);
      const porTags = similaridade(A.t, B.t);
      const s = 0.6 * porDescricao + 0.4 * porTags;
      if (s < limiar) continue;
      const chavesB = new Set(B.t.map((x) => x.chave));
      const palavras = [...vs[i]!.keys()]
        .filter((w) => vs[j]!.has(w))
        .sort((x, y) => vs[i]!.get(y)! + vs[j]!.get(y)! - (vs[i]!.get(x)! + vs[j]!.get(x)!))
        .slice(0, 6);
      const [a, b] = [A.p.id, B.p.id].sort();
      out.push({
        a: a!,
        b: b!,
        similaridade: r3(s),
        porDescricao: r3(porDescricao),
        porTags: r3(porTags),
        emComum: A.t.filter((x) => chavesB.has(x.chave)).map((x) => x.termo),
        palavras,
      });
    }
  return out.sort((x, y) => y.similaridade - x.similaridade);
}
