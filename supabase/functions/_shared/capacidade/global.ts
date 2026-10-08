// Carga GLOBAL de uma pessoa num período (todos os projetos), para decisões de alocação.
//
// O motor por projeto (motor.ts) responde "quanto da pessoa está alocado neste projeto".
// Para sugerir quem pega uma task, isso engana: quem está em 4 projetos com 6h/dia em cada
// parece ter 24h/dia. Aqui:
//   capacidade/dia = soma, por projeto com sprint no dia, da alocação do gestor naquele
//                    projeto (ou, sem ela, da Capacity da pessoa nos times do projeto),
//                    limitada às horas produtivas da pessoa (regras.ts: jornada × foco);
//                    sem nada configurado, as horas produtivas. Folga pessoal zera o dia;
//                    folga de um time tira só a parcela daquele time; feriado zera.
//   status         = pelos limites gerais (os do projeto valem só na visão do projeto).
//   carga          = horas pendentes das tasks abertas da pessoa em TODOS os projetos,
//                    proporcional aos dias úteis da sprint da task que caem no período.
// Puro e determinístico (CLAUDE.md §5: números vêm do motor).

import { type Celula, diasUteis, horasPendentes, type ItemCarga, type PessoaCap, statusDe } from "./motor.ts";
import { type AlocacaoProjeto, type Limites, type OrigemCapacidade, PADRAO_MERCADO } from "./regras.ts";

export interface SprintPeriodo {
  id: string;
  /** Necessário para aplicar a alocação do gestor por projeto. */
  projetoId?: string;
  inicio: string | null;
  fim: string | null;
}

export interface CapacidadeTime {
  sprintId: string;
  pessoaId: string;
  timeId: string;
  capacidadeDia: number;
}

/** pessoaId nulo = folga do time inteiro (tira só a capacidade daquele time). */
export interface FolgaTime {
  sprintId: string;
  timeId: string;
  pessoaId: string | null;
  inicio: string;
  fim: string;
}

export interface ItemGlobal extends ItemCarga {
  projetoId: string;
}

export interface CelulaGlobal extends Celula {
  /** Carga por projeto no período (h), para explicar de onde vem a ocupação. */
  porProjeto: { projetoId: string; cargaH: number }[];
}

const DIA_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const dentro = (d: string, inicio: string, fim: string) => d >= inicio.slice(0, 10) && d <= fim.slice(0, 10);

function* dias(inicio: string, fim: string) {
  for (let t = Date.parse(`${inicio.slice(0, 10)}T00:00:00Z`), f = Date.parse(`${fim.slice(0, 10)}T00:00:00Z`); t <= f; t += DIA_MS) {
    const d = new Date(t);
    const semana = d.getUTCDay();
    if (semana !== 0 && semana !== 6) yield d.toISOString().slice(0, 10);
  }
}

export function cargaGlobal(entrada: {
  periodo: { id: string; inicio: string; fim: string };
  pessoas: PessoaCap[];
  sprints: SprintPeriodo[];
  capacidades: CapacidadeTime[];
  folgas: FolgaTime[];
  feriados: string[];
  itens: ItemGlobal[];
  alocacoes?: AlocacaoProjeto[];
  limites?: Limites;
}): CelulaGlobal[] {
  const { periodo } = entrada;
  const limites = entrada.limites ?? PADRAO_MERCADO;
  const feriados = new Set(entrada.feriados.map((f) => f.slice(0, 10)));
  const sprints = new Map(
    entrada.sprints.filter((s): s is SprintPeriodo & { inicio: string; fim: string } => !!s.inicio && !!s.fim).map((s) => [s.id, s]),
  );
  const diasPeriodo = [...dias(periodo.inicio, periodo.fim)].filter((d) => !feriados.has(d));
  const projetoDa = (sprintId: string) => sprints.get(sprintId)?.projetoId ?? sprintId;
  // projetos com sprint em cada dia (para saber quando a alocação do gestor vale)
  const projetosNoDia = new Map(
    diasPeriodo.map((d) => [d, new Set([...sprints.values()].filter((s) => dentro(d, s.inicio, s.fim)).map((s) => projetoDa(s.id)))]),
  );

  // Fração de cada sprint que cai no período (dias úteis em comum / dias úteis da sprint)
  const fracao = new Map<string, number>();
  for (const s of sprints.values()) {
    const total = diasUteis(s.inicio, s.fim, (d) => feriados.has(d));
    const ini = s.inicio > periodo.inicio ? s.inicio : periodo.inicio;
    const fim = s.fim < periodo.fim ? s.fim : periodo.fim;
    const comum = ini <= fim ? diasUteis(ini, fim, (d) => feriados.has(d)) : 0;
    fracao.set(s.id, total > 0 ? comum / total : 0);
  }

  return entrada.pessoas.map((p) => {
    const teto = p.horasDia;
    const caps = entrada.capacidades.filter((c) => c.pessoaId === p.id);
    const alocacoes = (entrada.alocacoes ?? []).filter((a) => a.pessoaId === p.id);
    const folgasPessoais = entrada.folgas.filter((f) => f.pessoaId === p.id);
    const folgasTime = entrada.folgas.filter((f) => f.pessoaId === null);

    let capacidadeH = 0;
    let uteis = 0;
    let usouGestor = false;
    let usouDevops = false;
    for (const d of diasPeriodo) {
      if (folgasPessoais.some((f) => dentro(d, f.inicio, f.fim))) continue;
      uteis++;
      const porProjetoDia = new Map<string, number>();
      for (const c of caps) {
        const s = sprints.get(c.sprintId);
        if (!s || !dentro(d, s.inicio, s.fim)) continue;
        const folga = folgasTime.some((f) => f.timeId === c.timeId && f.sprintId === c.sprintId && dentro(d, f.inicio, f.fim));
        const proj = projetoDa(c.sprintId);
        porProjetoDia.set(proj, (porProjetoDia.get(proj) ?? 0) + (folga ? 0 : c.capacidadeDia));
        usouDevops = true;
      }
      for (const a of alocacoes) {
        if (!projetosNoDia.get(d)?.has(a.projetoId)) continue;
        porProjetoDia.set(a.projetoId, a.horasDia); // gestor sobrepõe a Capacity do DevOps
        usouGestor = true;
      }
      if (porProjetoDia.size === 0) {
        capacidadeH += teto;
        continue;
      }
      const soma = [...porProjetoDia.values()].reduce((n, h) => n + h, 0);
      capacidadeH += Math.min(soma, teto);
    }
    const origemCapacidade: OrigemCapacidade =
      usouGestor || p.origemHoras === "gestor" ? "gestor" : usouDevops ? "devops" : "padrao";

    const porProjeto = new Map<string, number>();
    let cargaH = 0;
    let itens = 0;
    for (const i of entrada.itens) {
      if (i.responsavelId !== p.id || i.fechado || i.temFilhos || !i.sprintId) continue;
      const f = fracao.get(i.sprintId) ?? 0;
      if (f <= 0) continue;
      const h = horasPendentes(i) * f;
      cargaH += h;
      itens++;
      porProjeto.set(i.projetoId, (porProjeto.get(i.projetoId) ?? 0) + h);
    }

    capacidadeH = round1(capacidadeH);
    cargaH = round1(cargaH);
    return {
      sprintId: periodo.id,
      pessoaId: p.id,
      diasUteis: uteis,
      capacidadeDia: uteis > 0 ? round1(capacidadeH / uteis) : 0,
      origemCapacidade,
      limites,
      capacidadeH,
      cargaH,
      livreH: round1(capacidadeH - cargaH),
      itens,
      ...statusDe(cargaH, capacidadeH, limites),
      porProjeto: [...porProjeto]
        .map(([projetoId, h]) => ({ projetoId, cargaH: round1(h) }))
        .sort((a, b) => b.cargaH - a.cargaH),
    };
  });
}
