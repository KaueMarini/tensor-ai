// Sugestão de responsável para tasks sem dono (determinística, sem IA).
//
// Para cada task, ranqueia as pessoas do time do projeto por:
//   - encaixe: tags da task + da Feature pai × skills da pessoa (confirmada vale mais que
//     sugerida pelas tasks) e tags de função; sem tags na task, o encaixe é neutro;
//   - folga: horas livres na sprint da task DEPOIS de receber a task (motor de capacidade).
// Penaliza quem passaria do limite. Distribui em sequência: a carga da 1ª sugestão já conta
// para as próximas tasks, para não empilhar tudo na mesma pessoa.
// Fala de carga e encaixe, nunca de desempenho (CLAUDE.md §5).

import { type Celula, type StatusCarga, statusDe } from "./motor.ts";

export interface TaskAlocacao {
  id: number;
  sprintId: string | null;
  tags: string[];
  featureTags: string[];
  /** Horas pendentes da task; null = sem estimativa (não pesa na carga, vira alerta). */
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
  /** 0..1 — usado só para ordenar. */
  score: number;
  /** 0..1 ou null quando a task não tem tags. */
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
// Sem capacidade na sprint (férias, sem Capacity) nunca é a sugestão principal: vai para o fim.
const PENALIDADE: Record<StatusCarga, number> = { ok: 1, limite: 0.85, sobrecarga: 0.5, "sem-capacidade": 0 };

/** Mesma regra do banco (skill_chave): "Back-end" = "backend" = "back end". */
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
  /** Na ordem em que devem ser distribuídas (ex.: sprint mais próxima e maiores primeiro). */
  tasks: TaskAlocacao[];
  candidatos: CandidatoAlocacao[];
  celula: (sprintId: string, pessoaId: string) => Celula | undefined;
  /** Sprint usada para tasks sem sprint (ex.: a atual). */
  sprintPadrao: string | null;
  maxOpcoes?: number;
}): RecomendacaoTask[] {
  const { tasks, candidatos, celula, sprintPadrao, maxOpcoes = 3 } = entrada;
  const extra = new Map<string, number>(); // carga já sugerida nesta rodada, por sprint × pessoa

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
        const antes = statusDe(cargaAntesH, capacidadeH);
        const depois = statusDe(cargaDepoisH, capacidadeH);
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
