import { type Celula, type StatusCarga, statusDe } from "./motor.ts";

export interface TaskAlocacao {
  id: number;
  sprintId: string | null;
  tags: string[];
  featureTags: string[];
  horas: number | null;
}

export interface SkillCandidato {
  tag: string;
  confirmada: boolean;
  evidencias: number;
}

export interface CandidatoAlocacao {
  id: string;
  skills: SkillCandidato[];
  funcoes: string[];
}

export interface MatchSkill {
  tag: string;
  tipo: "confirmada" | "sugerida" | "funcao";
}

export interface OpcaoAlocacao {
  pessoaId: string;
  score: number;
  encaixe: number | null;
  matches: MatchSkill[];
  capacidadeH: number;
  cargaAntesH: number;
  cargaDepoisH: number;
  utilizacaoAntes: number | null;
  utilizacaoDepois: number | null;
  statusDepois: StatusCarga;
  livreDepoisH: number;
}

export interface RecomendacaoTask {
  taskId: number;
  sprintId: string | null;
  tagsConsideradas: string[];
  semEstimativa: boolean;
  opcoes: OpcaoAlocacao[];
}

const PESO_ENCAIXE = 0.65;
const PESO_FOLGA = 0.35;
const PENALIDADE: Record<StatusCarga, number> = { ok: 1, limite: 0.85, sobrecarga: 0.5, "sem-capacidade": 0 };

export function chaveSkill(tag: string): string {
  return tag
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function tagsDaTask(t: TaskAlocacao): string[] {
  const vistas = new Map<string, string>();
  for (const tag of [...t.tags, ...t.featureTags]) {
    const limpa = tag.trim();
    const k = chaveSkill(limpa);
    if (!k || /^seed/i.test(limpa) || vistas.has(k)) continue;
    vistas.set(k, limpa);
  }
  return [...vistas.values()];
}

function encaixe(tags: string[], c: CandidatoAlocacao): { valor: number | null; matches: MatchSkill[] } {
  if (tags.length === 0) return { valor: null, matches: [] };
  const skills = new Map(c.skills.map((s) => [chaveSkill(s.tag), s]));
  const funcoes = new Map(c.funcoes.map((f) => [chaveSkill(f), f]));
  const matches: MatchSkill[] = [];
  let soma = 0;
  for (const tag of tags) {
    const k = chaveSkill(tag);
    const s = skills.get(k);
    if (s?.confirmada) {
      soma += 1;
      matches.push({ tag: s.tag, tipo: "confirmada" });
    } else if (s) {
      soma += 0.5 + 0.3 * Math.min(1, s.evidencias / 5);
      matches.push({ tag: s.tag, tipo: "sugerida" });
    } else if (funcoes.has(k)) {
      soma += 0.5;
      matches.push({ tag: funcoes.get(k)!, tipo: "funcao" });
    }
  }
  return { valor: soma / tags.length, matches };
}

export function recomendarAlocacao(entrada: {
  tasks: TaskAlocacao[];
  candidatos: CandidatoAlocacao[];
  celula: (sprintId: string, pessoaId: string) => Celula | undefined;
  sprintPadrao: string | null;
  maxOpcoes?: number;
}): RecomendacaoTask[] {
  const { tasks, candidatos, celula, sprintPadrao, maxOpcoes = 3 } = entrada;
  const extra = new Map<string, number>();

  return tasks.map((t) => {
    const sprintId = t.sprintId ?? sprintPadrao;
    const tags = tagsDaTask(t);
    const h = Math.max(0, t.horas ?? 0);

    const opcoes = candidatos
      .map((c): OpcaoAlocacao => {
        const cel = sprintId ? celula(sprintId, c.id) : undefined;
        const capacidadeH = cel?.capacidadeH ?? 0;
        const cargaAntesH = (cel?.cargaH ?? 0) + (extra.get(`${sprintId}|${c.id}`) ?? 0);
        const cargaDepoisH = cargaAntesH + h;
        const antes = statusDe(cargaAntesH, capacidadeH, cel?.limites);
        const depois = statusDe(cargaDepoisH, capacidadeH, cel?.limites);
        const livreDepoisH = capacidadeH - cargaDepoisH;
        const folga = capacidadeH > 0 ? Math.min(1, Math.max(0, livreDepoisH / capacidadeH)) : 0;
        const enc = encaixe(tags, c);
        const base = enc.valor === null ? folga : PESO_ENCAIXE * enc.valor + PESO_FOLGA * folga;
        return {
          pessoaId: c.id,
          score: Math.round(base * PENALIDADE[depois.status] * 1000) / 1000,
          encaixe: enc.valor,
          matches: enc.matches,
          capacidadeH,
          cargaAntesH,
          cargaDepoisH,
          utilizacaoAntes: antes.utilizacao,
          utilizacaoDepois: depois.utilizacao,
          statusDepois: depois.status,
          livreDepoisH,
        };
      })
      .sort((a, b) => b.score - a.score || b.livreDepoisH - a.livreDepoisH || a.pessoaId.localeCompare(b.pessoaId))
      .slice(0, maxOpcoes);

    const melhor = opcoes[0];
    if (melhor && sprintId && melhor.statusDepois !== "sem-capacidade") {
      const k = `${sprintId}|${melhor.pessoaId}`;
      extra.set(k, (extra.get(k) ?? 0) + h);
    }

    return { taskId: t.id, sprintId, tagsConsideradas: tags, semEstimativa: t.horas === null, opcoes };
  });
}
