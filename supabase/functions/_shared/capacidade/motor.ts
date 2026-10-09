import { type Limites, type OrigemCapacidade, PADRAO_MERCADO } from "./regras.ts";

export interface SprintCap {
  id: string;
  inicio: string | null;
  fim: string | null;
}

export interface PessoaCap {
  id: string;
  horasDia: number;
  origemHoras?: "gestor" | "padrao";
}

export interface CapacidadeLinha {
  sprintId: string;
  pessoaId: string;
  capacidadeDia: number;
}

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
  fechado: boolean;
  temFilhos: boolean;
}

export type StatusCarga = "ok" | "limite" | "sobrecarga" | "sem-capacidade";

export interface Celula {
  sprintId: string;
  pessoaId: string;
  diasUteis: number;
  capacidadeDia: number;
  origemCapacidade: OrigemCapacidade;
  limites: Limites;
  capacidadeH: number;
  cargaH: number;
  livreH: number;
  utilizacao: number | null;
  status: StatusCarga;
  itens: number;
}

const DIA_MS = 86_400_000;

function* dias(inicio: string, fim: string) {
  for (let t = Date.parse(`${inicio}T00:00:00Z`), f = Date.parse(`${fim}T00:00:00Z`); t <= f; t += DIA_MS) {
    yield new Date(t);
  }
}

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

export function horasPendentes(i: Pick<ItemCarga, "horasRestantes" | "horasEstimadas" | "horasConcluidas">): number {
  if (i.horasRestantes !== null) return Math.max(0, i.horasRestantes);
  return Math.max(0, (i.horasEstimadas ?? 0) - (i.horasConcluidas ?? 0));
}

export function statusDe(
  cargaH: number,
  capacidadeH: number,
  limites: Limites = PADRAO_MERCADO,
): { utilizacao: number | null; status: StatusCarga } {
  if (capacidadeH <= 0) return { utilizacao: null, status: cargaH > 0 ? "sem-capacidade" : "ok" };
  const utilizacao = cargaH / capacidadeH;
  const u = Math.round(utilizacao * 1e6) / 1e6;
  return {
    utilizacao,
    status: u > limites.sobrecarga ? "sobrecarga" : u > limites.atencao ? "limite" : "ok",
  };
}

export function calcularCapacidade(entrada: {
  sprints: SprintCap[];
  pessoas: PessoaCap[];
  capacidades: CapacidadeLinha[];
  folgas: Folga[];
  feriados: string[];
  itens: ItemCarga[];
  alocacoes?: { pessoaId: string; horasDia: number }[];
  limites?: Limites;
}): Celula[] {
  const limites = entrada.limites ?? PADRAO_MERCADO;
  const alocacao = new Map((entrada.alocacoes ?? []).map((a) => [a.pessoaId, a.horasDia]));
  const feriados = new Set(entrada.feriados.map((f) => f.slice(0, 10)));
  const capPor = new Map<string, number>();
  for (const c of entrada.capacidades) {
    const k = `${c.sprintId}|${c.pessoaId}`;
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
      const doGestor = alocacao.get(p.id);
      const doDevops = capPor.get(k);
      const capacidadeDia = doGestor ?? doDevops ?? p.horasDia;
      const origemCapacidade: OrigemCapacidade =
        doGestor !== undefined ? "gestor" : doDevops !== undefined ? "devops" : p.origemHoras === "gestor" ? "gestor" : "padrao";
      const capacidadeH = round1(capacidadeDia * uteis);
      const carga = cargaPor.get(k) ?? { h: 0, n: 0 };
      const cargaH = round1(carga.h);
      out.push({
        sprintId: s.id,
        pessoaId: p.id,
        diasUteis: uteis,
        capacidadeDia,
        origemCapacidade,
        limites,
        capacidadeH,
        cargaH,
        livreH: round1(capacidadeH - cargaH),
        itens: carga.n,
        ...statusDe(cargaH, capacidadeH, limites),
      });
    }
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
