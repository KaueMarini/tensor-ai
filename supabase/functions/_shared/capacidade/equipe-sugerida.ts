// Equipe sugerida para um projeto sem pessoas (determinístico, sem IA).
//
// 1. Termos do projeto: tags (linha "Tags:" da descrição no DevOps, peso 1) + skills conhecidas
//    que aparecem na descrição (peso 0,6) + sinônimos comuns ("React" → front-end, peso 0,5).
// 2. Squads de outros projetos: semelhança entre os projetos (termos em comum) + cobertura
//    dos termos pelas skills dos membros + disponibilidade (horas livres no horizonte).
// 3. Pessoas avulsas: encaixe de skills × folga, penalizando quem está no limite/sobrecarregado,
//    e uma montagem gulosa que cobre o máximo de termos com o mínimo de gente disponível.
// Fala de skills e carga, nunca de desempenho (CLAUDE.md §5). Números vêm daqui, não do LLM.

import type { StatusCarga } from "./motor.ts";
import { chaveSkill, type SkillCandidato } from "./recomendacao.ts";

export interface ProjetoPerfil {
  id: string;
  nome: string;
  descricao: string | null;
  tags: string[];
}

export interface PessoaPerfil {
  id: string;
  skills: SkillCandidato[];
  funcoes: string[];
  /** Ocupação geral no horizonte (motor global). */
  capacidadeH: number;
  livreH: number;
  status: StatusCarga;
}

export interface SquadPerfil {
  id: string;
  nome: string;
  projetoId: string;
  pessoaIds: string[];
}

export interface Termo {
  termo: string;
  chave: string;
  peso: number;
  origem: "tag" | "descricao" | "sinonimo";
}

export interface SquadSugerido {
  squadId: string;
  nome: string;
  projetoId: string;
  /** 0..1 */
  score: number;
  similaridade: number;
  cobertura: number;
  disponibilidade: number;
  /** Termos que o projeto de origem tem em comum com o novo. */
  emComum: string[];
  cobertos: { termo: string; pessoaIds: string[] }[];
  faltando: string[];
  livreH: number;
  pessoaIds: string[];
}

export interface PessoaSugerida {
  pessoaId: string;
  score: number;
  encaixe: number;
  folga: number;
  matches: { termo: string; tipo: "confirmada" | "sugerida" | "funcao" }[];
  livreH: number;
  status: StatusCarga;
}

export interface EquipeSugerida {
  termos: Termo[];
  squads: SquadSugerido[];
  pessoas: PessoaSugerida[];
  /** Menor grupo de pessoas disponíveis que cobre o máximo dos termos. */
  montagem: {
    pessoaIds: string[];
    /** O que cada escolhida traz (só termos que ela cobre) e quanto tem livre. */
    pessoas: { pessoaId: string; cobre: string[]; livreH: number; status: StatusCarga }[];
    cobertos: string[];
    faltando: string[];
    livreH: number;
  };
  /** Termos que ninguém da empresa tem como skill. */
  semNinguem: string[];
}

const STOP = new Set(
  "a o os as um uma uns umas de da do das dos em no na nos nas para por com sem e ou que se ao aos sua seu suas seus como mais entre pelo pela pelos pelas sobre via the and for with of to in on".split(" "),
);

/** Palavras comuns em descrições → skill do catálogo (só vale se a skill existir no catálogo). */
const SINONIMOS: Record<string, string> = {
  react: "front-end",
  angular: "front-end",
  vue: "front-end",
  frontend: "front-end",
  interface: "front-end",
  api: "back-end",
  apis: "back-end",
  backend: "back-end",
  node: "back-end",
  java: "back-end",
  aplicativo: "mobile",
  app: "mobile",
  android: "mobile",
  ios: "mobile",
  celular: "mobile",
  sql: "dados",
  indicadores: "dados",
  powerbi: "power-bi",
  dashboard: "power-bi",
  teams: "copilot-studio",
  chatbot: "copilot-studio",
  bot: "copilot-studio",
  assistente: "copilot-studio",
  nfe: "integracao-fiscal",
  cte: "integracao-fiscal",
  sefaz: "integracao-fiscal",
  fiscal: "integracao-fiscal",
  qa: "testes",
  teste: "testes",
  testes: "testes",
  design: "ux",
  usabilidade: "ux",
  acessibilidade: "ux",
  websocket: "tempo-real",
  websockets: "tempo-real",
  llm: "ia",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function tokens(texto: string | null): Set<string> {
  const out = new Set<string>();
  for (const t of norm(texto ?? "").split(/[^a-z0-9]+/)) if (t.length >= 2 && !STOP.has(t)) out.add(t);
  // "NF-e", "Power BI", "tempo real": junta pares vizinhos também
  const lista = norm(texto ?? "").split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i + 1 < lista.length; i++) out.add(lista[i]! + lista[i + 1]!);
  return out;
}

/** Termos do projeto a partir de tags + descrição, usando o catálogo de skills da empresa. */
export function termosDoProjeto(p: Pick<ProjetoPerfil, "descricao" | "tags">, catalogo: string[]): Termo[] {
  const termos = new Map<string, Termo>();
  const add = (termo: string, peso: number, origem: Termo["origem"]) => {
    const chave = chaveSkill(termo);
    if (!chave) return;
    const atual = termos.get(chave);
    // mantém a grafia que apareceu primeiro (a tag do projeto) e o maior peso
    if (!atual) termos.set(chave, { termo, chave, peso, origem });
    else if (peso > atual.peso) termos.set(chave, { ...atual, peso, origem });
  };
  for (const t of p.tags) add(t.trim(), 1, "tag");

  const tk = tokens(p.descricao);
  const porChave = new Map(catalogo.map((c) => [chaveSkill(c), c]));
  for (const [chave, nome] of porChave) {
    if (!chave) continue;
    const partes = norm(nome).split(/[^a-z0-9]+/).filter(Boolean);
    const aparece = tk.has(chave) || (partes.length > 0 && partes.every((x) => tk.has(x)));
    if (aparece) add(nome, 0.6, "descricao");
  }
  for (const [palavra, skill] of Object.entries(SINONIMOS)) {
    if (!tk.has(palavra)) continue;
    const nome = porChave.get(chaveSkill(skill));
    if (nome) add(nome, 0.5, "sinonimo");
  }
  // "Power BI" na descrição não vira também "bi": termo deduzido que é só pedaço de outro sai
  const lista = [...termos.values()];
  return lista
    .filter((t) => t.origem === "tag" || !lista.some((u) => u !== t && u.chave.length > t.chave.length && u.chave.includes(t.chave)))
    .sort((a, b) => b.peso - a.peso || a.termo.localeCompare(b.termo));
}

/** Jaccard ponderado entre dois conjuntos de termos (0..1). */
export function similaridade(a: Termo[], b: Termo[]): number {
  const pa = new Map(a.map((t) => [t.chave, t.peso]));
  const pb = new Map(b.map((t) => [t.chave, t.peso]));
  let min = 0;
  let max = 0;
  for (const k of new Set([...pa.keys(), ...pb.keys()])) {
    min += Math.min(pa.get(k) ?? 0, pb.get(k) ?? 0);
    max += Math.max(pa.get(k) ?? 0, pb.get(k) ?? 0);
  }
  return max > 0 ? min / max : 0;
}

/** Quanto a pessoa domina o termo: confirmada 1; sugerida 0,5–0,8 pelas evidências; função 0,5. */
export function forca(p: Pick<PessoaPerfil, "skills" | "funcoes">, chave: string): { valor: number; tipo: "confirmada" | "sugerida" | "funcao" | null } {
  const s = p.skills.find((x) => chaveSkill(x.tag) === chave);
  if (s?.confirmada) return { valor: 1, tipo: "confirmada" };
  if (s) return { valor: 0.5 + 0.3 * Math.min(1, s.evidencias / 5), tipo: "sugerida" };
  if (p.funcoes.some((f) => chaveSkill(f) === chave)) return { valor: 0.5, tipo: "funcao" };
  return { valor: 0, tipo: null };
}

const COBRE = 0.5;
const PENALIDADE: Record<StatusCarga, number> = { ok: 1, limite: 0.85, sobrecarga: 0.4, "sem-capacidade": 0 };
const folgaDe = (p: PessoaPerfil) => (p.capacidadeH > 0 ? Math.min(1, Math.max(0, p.livreH / p.capacidadeH)) : 0);
/** Mínimo de horas livres no horizonte para entrar na montagem (um dia de trabalho). */
const MIN_LIVRE_H = 8;
const disponivel = (p: PessoaPerfil) => (p.status === "ok" || p.status === "limite") && p.livreH >= MIN_LIVRE_H;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function sugerirEquipe(entrada: {
  alvo: ProjetoPerfil;
  projetos: ProjetoPerfil[];
  pessoas: PessoaPerfil[];
  squads: SquadPerfil[];
  /** Pessoas que já estão no projeto alvo (ficam de fora). */
  jaNoProjeto?: string[];
  maxSquads?: number;
  maxPessoas?: number;
  maxMontagem?: number;
}): EquipeSugerida {
  const { alvo, maxSquads = 3, maxPessoas = 6, maxMontagem = 5 } = entrada;
  const fora = new Set(entrada.jaNoProjeto ?? []);
  const pessoas = new Map(entrada.pessoas.map((p) => [p.id, p]));
  const catalogo = [
    ...new Set([...entrada.pessoas.flatMap((p) => [...p.skills.map((s) => s.tag), ...p.funcoes]), ...entrada.projetos.flatMap((p) => p.tags)]),
  ];
  const termos = termosDoProjeto(alvo, catalogo);
  const pesoTotal = termos.reduce((n, t) => n + t.peso, 0);
  const vazio: EquipeSugerida = { termos, squads: [], pessoas: [], montagem: { pessoaIds: [], pessoas: [], cobertos: [], faltando: termos.map((t) => t.termo), livreH: 0 }, semNinguem: [] };
  if (termos.length === 0) return vazio;

  const semNinguem = termos
    .filter((t) => !entrada.pessoas.some((p) => forca(p, t.chave).valor >= COBRE))
    .map((t) => t.termo);

  // Squads de outros projetos
  const termosProjeto = new Map(entrada.projetos.map((p) => [p.id, termosDoProjeto(p, catalogo)]));
  const squads: SquadSugerido[] = [];
  for (const sq of entrada.squads) {
    if (sq.projetoId === alvo.id) continue;
    const membros = sq.pessoaIds.map((id) => pessoas.get(id)).filter((p): p is PessoaPerfil => !!p && !fora.has(p.id));
    if (membros.length === 0) continue;
    const deOrigem = termosProjeto.get(sq.projetoId) ?? [];
    const sim = similaridade(termos, deOrigem);
    let cob = 0;
    const cobertos: SquadSugerido["cobertos"] = [];
    const faltando: string[] = [];
    for (const t of termos) {
      const quem = membros.filter((m) => forca(m, t.chave).valor >= COBRE);
      const melhor = Math.max(0, ...membros.map((m) => forca(m, t.chave).valor));
      cob += t.peso * melhor;
      if (quem.length) cobertos.push({ termo: t.termo, pessoaIds: quem.map((m) => m.id) });
      else faltando.push(t.termo);
    }
    cob /= pesoTotal;
    const capacidade = membros.reduce((n, m) => n + m.capacidadeH, 0);
    const livre = membros.reduce((n, m) => n + Math.max(0, m.livreH), 0);
    const disp = capacidade > 0 ? Math.min(1, livre / capacidade) : 0;
    if (sim === 0 && cob === 0) continue;
    const emComum = deOrigem.filter((t) => termos.some((x) => x.chave === t.chave)).map((t) => t.termo);
    squads.push({
      squadId: sq.id,
      nome: sq.nome,
      projetoId: sq.projetoId,
      score: r3(0.35 * sim + 0.45 * cob + 0.2 * disp),
      similaridade: r3(sim),
      cobertura: r3(cob),
      disponibilidade: r3(disp),
      emComum,
      cobertos,
      faltando,
      livreH: Math.round(livre * 10) / 10,
      pessoaIds: membros.map((m) => m.id),
    });
  }
  squads.sort((a, b) => b.score - a.score || b.livreH - a.livreH);

  // Pessoas avulsas
  const candidatas = entrada.pessoas.filter((p) => !fora.has(p.id));
  const avulsas: PessoaSugerida[] = [];
  for (const p of candidatas) {
    let soma = 0;
    const matches: PessoaSugerida["matches"] = [];
    for (const t of termos) {
      const f = forca(p, t.chave);
      soma += t.peso * f.valor;
      if (f.tipo) matches.push({ termo: t.termo, tipo: f.tipo });
    }
    const encaixe = soma / pesoTotal;
    if (encaixe <= 0) continue;
    const folga = folgaDe(p);
    avulsas.push({
      pessoaId: p.id,
      score: r3((0.65 * encaixe + 0.35 * folga) * PENALIDADE[p.status]),
      encaixe: r3(encaixe),
      folga: r3(folga),
      matches,
      livreH: Math.round(Math.max(0, p.livreH) * 10) / 10,
      status: p.status,
    });
  }
  avulsas.sort((a, b) => b.score - a.score || b.livreH - a.livreH || a.pessoaId.localeCompare(b.pessoaId));

  // Montagem gulosa: cada passo pega quem mais cobre o que falta, ponderado pela folga
  const escolhidos: PessoaPerfil[] = [];
  const restante = new Map(termos.map((t) => [t.chave, t]));
  while (escolhidos.length < maxMontagem && restante.size > 0) {
    let melhor: { p: PessoaPerfil; ganho: number } | null = null;
    for (const p of candidatas) {
      if (!disponivel(p) || escolhidos.includes(p)) continue;
      let ganho = 0;
      for (const t of restante.values()) ganho += t.peso * forca(p, t.chave).valor;
      ganho *= (0.5 + 0.5 * folgaDe(p)) * PENALIDADE[p.status];
      if (!melhor || ganho > melhor.ganho || (ganho === melhor.ganho && p.livreH > melhor.p.livreH)) melhor = { p, ganho };
    }
    if (!melhor || melhor.ganho < 0.05) break;
    escolhidos.push(melhor.p);
    for (const t of [...restante.values()]) if (forca(melhor.p, t.chave).valor >= COBRE) restante.delete(t.chave);
  }
  const cobertos = termos.filter((t) => !restante.has(t.chave)).map((t) => t.termo);

  return {
    termos,
    squads: squads.slice(0, maxSquads),
    pessoas: avulsas.slice(0, maxPessoas),
    montagem: {
      pessoaIds: escolhidos.map((p) => p.id),
      pessoas: escolhidos.map((p) => ({
        pessoaId: p.id,
        cobre: termos.filter((t) => forca(p, t.chave).valor >= COBRE).map((t) => t.termo),
        livreH: Math.round(Math.max(0, p.livreH) * 10) / 10,
        status: p.status,
      })),
      cobertos,
      faltando: termos.filter((t) => restante.has(t.chave)).map((t) => t.termo),
      livreH: Math.round(escolhidos.reduce((n, p) => n + Math.max(0, p.livreH), 0) * 10) / 10,
    },
    semNinguem,
  };
}
