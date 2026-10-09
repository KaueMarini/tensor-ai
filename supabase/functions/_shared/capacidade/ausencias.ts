import { diasUteis } from "./motor.ts";

export interface Ausencia {
  pessoaId: string;
  inicio: string;
  fim: string;
  tipo: string;
  origem: "agenda" | "devops";
}

export interface TarefaAgendada {
  id: number;
  titulo: string;
  projetoId: string;
  responsavelId: string | null;
  horas: number | null;
  sprint: { id: string; nome: string; inicio: string; fim: string } | null;
}

export interface TarefaEmRisco {
  id: number;
  titulo: string;
  projetoId: string;
  horas: number;
  sprintId: string;
  sprintNome: string;
  diasAusente: number;
  diasUteisSprint: number;
  pctSprintAusente: number;
}

export interface ConflitoAusencia {
  pessoaId: string;
  inicio: string;
  fim: string;
  tipo: string;
  origem: "agenda" | "devops";
  diasUteis: number;
  tarefas: TarefaEmRisco[];
  horasEmRisco: number;
  gravidade: "critico" | "atencao";
}

const DIA = 86_400_000;
const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const maior = (a: string, b: string) => (a > b ? a : b);
const menor = (a: string, b: string) => (a < b ? a : b);

function juntar(ausencias: Ausencia[]): Ausencia[] {
  const out: Ausencia[] = [];
  const ordenadas = [...ausencias].sort((a, b) => a.pessoaId.localeCompare(b.pessoaId) || a.inicio.localeCompare(b.inicio));
  for (const a of ordenadas) {
    const ultima = out[out.length - 1];
    if (ultima && ultima.pessoaId === a.pessoaId && a.inicio <= somaDias(ultima.fim, 3)) {
      ultima.fim = maior(ultima.fim, a.fim.slice(0, 10));
      if (a.origem === "agenda") {
        ultima.tipo = a.tipo;
        ultima.origem = "agenda";
      }
    } else out.push({ ...a, inicio: a.inicio.slice(0, 10), fim: a.fim.slice(0, 10) });
  }
  return out;
}

export function conflitosAusencia(e: {
  hoje: string;
  ausencias: Ausencia[];
  tarefas: TarefaAgendada[];
  feriados?: string[];
  horizonteDias?: number;
}): ConflitoAusencia[] {
  const { hoje, horizonteDias = 42 } = e;
  const limite = somaDias(hoje, horizonteDias);
  const feriados = new Set((e.feriados ?? []).map((f) => f.slice(0, 10)));
  const util = (ini: string, fim: string) => (ini <= fim ? diasUteis(ini, fim, (d) => feriados.has(d)) : 0);
  const out: ConflitoAusencia[] = [];

  for (const a of juntar(e.ausencias)) {
    if (a.fim < hoje || a.inicio > limite) continue;
    const ini = maior(a.inicio, hoje);
    const diasAus = util(ini, a.fim);
    if (diasAus === 0) continue;
    const tarefas: TarefaEmRisco[] = [];
    for (const t of e.tarefas) {
      if (t.responsavelId !== a.pessoaId || !t.sprint || t.sprint.fim < hoje) continue;
      const sobreposicao = util(maior(ini, t.sprint.inicio), menor(a.fim, t.sprint.fim));
      if (sobreposicao === 0) continue;
      const restante = util(maior(hoje, t.sprint.inicio), t.sprint.fim);
      tarefas.push({
        id: t.id,
        titulo: t.titulo,
        projetoId: t.projetoId,
        horas: Math.max(0, t.horas ?? 0),
        sprintId: t.sprint.id,
        sprintNome: t.sprint.nome,
        diasAusente: sobreposicao,
        diasUteisSprint: restante,
        pctSprintAusente: restante > 0 ? Math.round((sobreposicao / restante) * 100) : 100,
      });
    }
    if (tarefas.length === 0) continue;
    tarefas.sort((x, y) => y.pctSprintAusente - x.pctSprintAusente || y.horas - x.horas);
    out.push({
      pessoaId: a.pessoaId,
      inicio: a.inicio,
      fim: a.fim,
      tipo: a.tipo,
      origem: a.origem,
      diasUteis: diasAus,
      tarefas,
      horasEmRisco: Math.round(tarefas.reduce((n, t) => n + t.horas, 0) * 10) / 10,
      gravidade: tarefas.some((t) => t.pctSprintAusente >= 50) ? "critico" : "atencao",
    });
  }
  return out.sort((a, b) => (a.gravidade === b.gravidade ? a.inicio.localeCompare(b.inicio) : a.gravidade === "critico" ? -1 : 1));
}

export const ROTULO_AUSENCIA: Record<string, string> = {
  ferias: "férias",
  certificacao: "certificação",
  licenca: "licença",
  folga: "folga",
  outro: "ausência",
};

export function ausenciasDeLinhas(
  agenda: { pessoa_id: string; inicio: string; fim: string; tipo?: string | null }[],
  folgas: { pessoa_id: string | null; inicio: string; fim: string }[],
): Ausencia[] {
  return [
    ...agenda.map((x) => ({ pessoaId: x.pessoa_id, inicio: x.inicio, fim: x.fim, tipo: x.tipo ?? "ferias", origem: "agenda" as const })),
    ...folgas.filter((x) => x.pessoa_id).map((x) => ({ pessoaId: x.pessoa_id!, inicio: x.inicio, fim: x.fim, tipo: "folga", origem: "devops" as const })),
  ];
}
