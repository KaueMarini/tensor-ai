import { describe, expect, it } from "vitest";
import { type CapacidadeTime, cargaGlobal, type FolgaTime, type ItemGlobal } from "./global.ts";

// Sprint 1 de cada projeto: 05/10 a 16/10/2026 = 10 dias úteis
const S = (id: string, inicio = "2026-10-05", fim = "2026-10-16", projetoId = `p-${id}`) => ({ id, inicio, fim, projetoId });
const periodo = { id: "jan", inicio: "2026-10-05", fim: "2026-10-16" };
// 8h produtivas/dia para facilitar as contas (o padrão de mercado é 6h, ver regras.ts)
const kaue = { id: "kaue", horasDia: 8 };

const item = (over: Partial<ItemGlobal>): ItemGlobal => ({
  projetoId: "p1",
  sprintId: "a1",
  responsavelId: "kaue",
  horasRestantes: 10,
  horasEstimadas: null,
  horasConcluidas: null,
  fechado: false,
  temFilhos: false,
  ...over,
});

const cap = (sprintId: string, timeId: string, capacidadeDia: number, pessoaId = "kaue"): CapacidadeTime => ({
  sprintId,
  timeId,
  pessoaId,
  capacidadeDia,
});

function rodar(over: Partial<Parameters<typeof cargaGlobal>[0]> = {}) {
  return cargaGlobal({
    periodo,
    pessoas: [kaue],
    sprints: [S("a1"), S("b1"), S("c1"), S("d1")],
    capacidades: [],
    folgas: [],
    feriados: [],
    itens: [],
    ...over,
  })[0]!;
}

describe("cargaGlobal", () => {
  it("4 times com 6h/dia não viram 24h/dia: limita à jornada (8h)", () => {
    const c = rodar({ capacidades: [cap("a1", "ta", 6), cap("b1", "tb", 6), cap("c1", "tc", 6), cap("d1", "td", 6)] });
    expect(c.capacidadeH).toBe(80);
    expect(c.capacidadeDia).toBe(8);
  });

  it("alocação parcial soma: 4h + 2h + 1h + 1h = 8h/dia", () => {
    const c = rodar({ capacidades: [cap("a1", "ta", 4), cap("b1", "tb", 2), cap("c1", "tc", 1), cap("d1", "td", 1)] });
    expect(c.capacidadeH).toBe(80);
  });

  it("soma a carga de todos os projetos e mostra de onde vem", () => {
    const c = rodar({
      capacidades: [cap("a1", "ta", 6), cap("b1", "tb", 6)],
      itens: [
        item({ projetoId: "p1", sprintId: "a1", horasRestantes: 50 }),
        item({ projetoId: "p2", sprintId: "b1", horasRestantes: 40 }),
        item({ projetoId: "p2", sprintId: "b1", horasRestantes: 8, fechado: true }),
      ],
    });
    expect(c.cargaH).toBe(90);
    expect(c.status).toBe("sobrecarga");
    expect(c.porProjeto).toEqual([
      { projetoId: "p1", cargaH: 50 },
      { projetoId: "p2", cargaH: 40 },
    ]);
  });

  it("sprint que só cobre parte do período conta proporcional", () => {
    // sprint de 12/10 a 23/10: 5 dos 10 dias úteis caem no período
    const c = rodar({ sprints: [S("x", "2026-10-12", "2026-10-23")], itens: [item({ sprintId: "x", horasRestantes: 20 })] });
    expect(c.cargaH).toBe(10);
  });

  it("folga pessoal zera o dia; folga do time tira só a parcela daquele time", () => {
    const folgas: FolgaTime[] = [
      { sprintId: "a1", timeId: "ta", pessoaId: "kaue", inicio: "2026-10-05", fim: "2026-10-06" }, // 2 dias de férias
      { sprintId: "b1", timeId: "tb", pessoaId: null, inicio: "2026-10-07", fim: "2026-10-07" }, // folga do time B
    ];
    const c = rodar({ capacidades: [cap("a1", "ta", 4), cap("b1", "tb", 4)], folgas });
    // 8 dias úteis; no dia 07 só o time A conta (4h): 7×8 + 4 = 60
    expect(c.diasUteis).toBe(8);
    expect(c.capacidadeH).toBe(60);
  });

  it("sem Capacity em nenhum time usa as horas produtivas e marca como padrão", () => {
    const c = rodar();
    expect(c.capacidadeH).toBe(80);
    expect(c.origemCapacidade).toBe("padrao");
  });

  it("alocação do gestor no projeto sobrepõe a Capacity do DevOps daquele projeto", () => {
    // DevOps: 6h em A e 6h em B (teto 8h). Gestor: só 1h/dia em A → 1 + 6 = 7h/dia
    const c = rodar({
      capacidades: [cap("a1", "ta", 6), cap("b1", "tb", 6)],
      alocacoes: [{ projetoId: "p-a1", pessoaId: "kaue", horasDia: 1 }],
    });
    expect(c.capacidadeH).toBe(70);
    expect(c.origemCapacidade).toBe("gestor");
  });

  it("alocação do gestor só vale nos dias em que o projeto tem sprint", () => {
    const c = rodar({
      sprints: [S("a1", "2026-10-12", "2026-10-16")],
      alocacoes: [{ projetoId: "p-a1", pessoaId: "kaue", horasDia: 2 }],
    });
    // 5 dias sem sprint de A (8h padrão) + 5 dias com A (2h do gestor)
    expect(c.capacidadeH).toBe(50);
  });

  it("jornada menor da pessoa vira o teto e limites gerais definem o status", () => {
    const c = rodar({
      pessoas: [{ id: "kaue", horasDia: 4, origemHoras: "gestor" }],
      capacidades: [cap("a1", "ta", 6)],
      itens: [item({ horasRestantes: 30 })],
      limites: { atencao: 0.7, sobrecarga: 0.9 },
    });
    expect(c.capacidadeH).toBe(40);
    expect(c.utilizacao).toBe(0.75);
    expect(c.status).toBe("limite");
    expect(c.origemCapacidade).toBe("gestor");
  });

  it("feriado sai da capacidade", () => {
    const c = rodar({ capacidades: [cap("a1", "ta", 8)], feriados: ["2026-10-12"] });
    expect(c.capacidadeH).toBe(72);
  });
});
