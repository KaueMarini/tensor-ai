// Métricas de fluxo (determinísticas) a partir das datas do Azure DevOps de cada item folha:
//   throughput  itens concluídos por semana (últimas N semanas)
//   cycle time  ativação → conclusão (mediana e P85), em dias
//   lead time   criação → conclusão (mediana), em dias
//   WIP         itens em andamento agora e há quantos dias estão no estado
// Previsão da sprint: horas restantes × capacidade que ainda sobra até o fim.

export interface ItemFluxoMetrica {
  categoria: "Proposed" | "InProgress" | "Resolved" | "Completed";
  criado: string | null;
  ativado: string | null;
  fechado: string | null;
  mudouEstado: string | null;
}

export interface MetricasFluxo {
  throughput: { semana: string; inicio: string; concluidos: number }[];
  throughputMedio: number;
  cycleMediana: number | null;
  cycleP85: number | null;
  leadMediana: number | null;
  /** Itens concluídos com datas suficientes para cycle/lead. */
  amostra: number;
  wip: number;
  wipIdadeMediana: number | null;
}

const DIA = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const diasEntre = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / DIA);

export function percentil(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return r1(s[lo]! + (s[hi]! - s[lo]!) * (i - lo));
}

/** Segunda-feira (UTC) da semana de uma data ISO. */
function segunda(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() || 7) - 1) * DIA).toISOString().slice(0, 10);
}

export function metricasFluxo(itens: ItemFluxoMetrica[], hoje: string, semanas = 6): MetricasFluxo {
  const concluidos = itens.filter((i) => i.categoria === "Completed" && i.fechado);
  const segAtual = segunda(hoje);
  const throughput = Array.from({ length: semanas }, (_, k) => {
    const inicio = new Date(Date.parse(`${segAtual}T00:00:00Z`) - (semanas - 1 - k) * 7 * DIA).toISOString().slice(0, 10);
    const d = new Date(`${inicio}T00:00:00Z`);
    return {
      semana: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
      inicio,
      concluidos: concluidos.filter((i) => segunda(i.fechado!) === inicio).length,
    };
  });
  // a semana atual está incompleta: a média usa só as fechadas
  const fechadas = throughput.slice(0, -1);
  const cycles = concluidos.filter((i) => i.ativado).map((i) => diasEntre(i.ativado!, i.fechado!));
  const leads = concluidos.filter((i) => i.criado).map((i) => diasEntre(i.criado!, i.fechado!));
  const emAndamento = itens.filter((i) => i.categoria === "InProgress");
  const idades = emAndamento.filter((i) => i.mudouEstado ?? i.ativado).map((i) => diasEntre((i.mudouEstado ?? i.ativado)!, `${hoje}T12:00:00Z`));
  return {
    throughput,
    throughputMedio: fechadas.length ? r1(fechadas.reduce((n, s) => n + s.concluidos, 0) / fechadas.length) : 0,
    cycleMediana: percentil(cycles, 0.5),
    cycleP85: percentil(cycles, 0.85),
    leadMediana: percentil(leads, 0.5),
    amostra: concluidos.length,
    wip: emAndamento.length,
    wipIdadeMediana: percentil(idades, 0.5),
  };
}

export interface PrevisaoSprint {
  horasRestantes: number;
  capacidadeRestanteH: number;
  /** horas restantes ÷ capacidade restante (null sem capacidade). */
  pressao: number | null;
  status: "no-ritmo" | "apertado" | "em-risco" | "sem-dados";
  diasUteisRestantes: number;
}

/** A sprint fecha? Compara o que falta com a capacidade do time nos dias úteis que restam. */
export function previsaoSprint(e: { horasRestantes: number; capacidadeSprintH: number; diasUteisTotal: number; diasUteisRestantes: number }): PrevisaoSprint {
  const cap = e.diasUteisTotal > 0 ? (e.capacidadeSprintH * e.diasUteisRestantes) / e.diasUteisTotal : 0;
  const pressao = cap > 0 ? e.horasRestantes / cap : null;
  return {
    horasRestantes: r1(e.horasRestantes),
    capacidadeRestanteH: r1(cap),
    pressao: pressao === null ? null : r1(pressao * 100) / 100,
    status: pressao === null ? (e.horasRestantes > 0 ? "em-risco" : "sem-dados") : pressao > 1 ? "em-risco" : pressao > 0.85 ? "apertado" : "no-ritmo",
    diasUteisRestantes: e.diasUteisRestantes,
  };
}
