// Motor de capacidade (determinístico, sem IA). Por pessoa e sprint:
//   capacidade = horas/dia (Capacity do DevOps) × dias úteis − feriados − days off
//   carga      = horas restantes das tasks abertas atribuídas na sprint
//   utilização = carga / capacidade
// Puro: sem React, sem Supabase. Datas no formato "YYYY-MM-DD".

export interface SprintCap {
  id: string;
  inicio: string | null;
  fim: string | null;
}

export interface PessoaCap {
  id: string;
  horasSemanaBase: number;
}

export interface CapacidadeLinha {
  sprintId: string;
  pessoaId: string;
  capacidadeDia: number;
}

/** pessoaId nulo = folga do time inteiro. */
export interface Folga {
  sprintId: string;
  pessoaId: string | null;
  inicio: string;
  fim: string;
}

export interface ItemCarga {
  sprintId: string | null;
  responsavelId: string | null;
  horasRestantes: number | null;
  horasEstimadas: number | null;
  horasConcluidas: number | null;
  /** Concluído/removido não pesa. */
  fechado: boolean;
  /** Pai (ex.: User Story com tasks): as horas já estão nos filhos. */
  temFilhos: boolean;
}

export type StatusCarga = "ok" | "limite" | "sobrecarga" | "sem-capacidade";

export interface Celula {
  sprintId: string;
  pessoaId: string;
  diasUteis: number;
  capacidadeDia: number;
  /** Sem Capacity configurada no DevOps: usa horas_semana_base / 5. */
  capacidadePadrao: boolean;
  capacidadeH: number;
  cargaH: number;
  livreH: number;
  /** null quando não há capacidade (ex.: férias a sprint toda). */
  utilizacao: number | null;
  status: StatusCarga;
  itens: number;
}

export const LIMITE_ATENCAO = 0.85;

const DIA_MS = 86_400_000;

function* dias(inicio: string, fim: string) {
  for (let t = Date.parse(`${inicio}T00:00:00Z`), f = Date.parse(`${fim}T00:00:00Z`); t <= f; t += DIA_MS) {
    yield new Date(t);
  }
}

/** Dias de segunda a sexta no intervalo (inclusivo), menos os excluídos. */
export function diasUteis(inicio: string, fim: string, excluir: (dia: string) => boolean = () => false): number {
  let n = 0;
  for (const d of dias(inicio.slice(0, 10), fim.slice(0, 10))) {
    const semana = d.getUTCDay();
    if (semana === 0 || semana === 6) continue;
    if (excluir(d.toISOString().slice(0, 10))) continue;
    n++;
  }
  return n;
}

/** Horas que ainda pesam numa task: restante, ou estimado − concluído se não houver restante. */
export function horasPendentes(i: Pick<ItemCarga, "horasRestantes" | "horasEstimadas" | "horasConcluidas">): number {
  if (i.horasRestantes !== null) return Math.max(0, i.horasRestantes);
  return Math.max(0, (i.horasEstimadas ?? 0) - (i.horasConcluidas ?? 0));
}

export function statusDe(cargaH: number, capacidadeH: number): { utilizacao: number | null; status: StatusCarga } {
  if (capacidadeH <= 0) return { utilizacao: null, status: cargaH > 0 ? "sem-capacidade" : "ok" };
  const utilizacao = cargaH / capacidadeH;
  return {
    utilizacao,
    status: utilizacao > 1 ? "sobrecarga" : utilizacao > LIMITE_ATENCAO ? "limite" : "ok",
  };
}

export function calcularCapacidade(entrada: {
  sprints: SprintCap[];
  pessoas: PessoaCap[];
  capacidades: CapacidadeLinha[];
  folgas: Folga[];
  feriados: string[];
  itens: ItemCarga[];
}): Celula[] {
  const feriados = new Set(entrada.feriados.map((f) => f.slice(0, 10)));
  const capPor = new Map<string, number>();
  for (const c of entrada.capacidades) {
    const k = `${c.sprintId}|${c.pessoaId}`;
    // pessoa em mais de um time do projeto: a capacidade de cada time soma
    capPor.set(k, (capPor.get(k) ?? 0) + c.capacidadeDia);
  }
  const cargaPor = new Map<string, { h: number; n: number }>();
  for (const i of entrada.itens) {
    if (i.fechado || i.temFilhos || !i.sprintId || !i.responsavelId) continue;
    const k = `${i.sprintId}|${i.responsavelId}`;
    const atual = cargaPor.get(k) ?? { h: 0, n: 0 };
    cargaPor.set(k, { h: atual.h + horasPendentes(i), n: atual.n + 1 });
  }

  const out: Celula[] = [];
  for (const s of entrada.sprints) {
    if (!s.inicio || !s.fim) continue;
    const folgasSprint = entrada.folgas.filter((f) => f.sprintId === s.id);
    for (const p of entrada.pessoas) {
      const minhas = folgasSprint.filter((f) => f.pessoaId === null || f.pessoaId === p.id);
      const uteis = diasUteis(
        s.inicio,
        s.fim,
        (d) => feriados.has(d) || minhas.some((f) => d >= f.inicio.slice(0, 10) && d <= f.fim.slice(0, 10)),
      );
      const k = `${s.id}|${p.id}`;
      const configurada = capPor.get(k);
      const capacidadeDia = configurada ?? p.horasSemanaBase / 5;
      const capacidadeH = round1(capacidadeDia * uteis);
      const carga = cargaPor.get(k) ?? { h: 0, n: 0 };
      const cargaH = round1(carga.h);
      out.push({
        sprintId: s.id,
        pessoaId: p.id,
        diasUteis: uteis,
        capacidadeDia,
        capacidadePadrao: configurada === undefined,
        capacidadeH,
        cargaH,
        livreH: round1(capacidadeH - cargaH),
        itens: carga.n,
        ...statusDe(cargaH, capacidadeH),
      });
    }
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
