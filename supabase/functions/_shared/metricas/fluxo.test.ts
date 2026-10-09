import { describe, expect, it } from "vitest";
import { metricasFluxo, percentil, previsaoSprint, type ItemFluxoMetrica } from "./fluxo.ts";

const HOJE = "2026-10-21";
const fechado = (ativado: string, fechadoEm: string, criado = "2026-09-01T00:00:00Z"): ItemFluxoMetrica => ({
  categoria: "Completed",
  criado,
  ativado,
  fechado: fechadoEm,
  mudouEstado: fechadoEm,
});

describe("percentil", () => {
  it("interpola e lida com lista vazia", () => {
    expect(percentil([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentil([1, 2, 3, 4, 10], 0.85)).toBe(6.4);
    expect(percentil([], 0.5)).toBeNull();
  });
});

describe("metricasFluxo", () => {
  const itens: ItemFluxoMetrica[] = [
    fechado("2026-10-05T00:00:00Z", "2026-10-07T00:00:00Z"),
    fechado("2026-10-05T00:00:00Z", "2026-10-09T00:00:00Z"),
    fechado("2026-10-12T00:00:00Z", "2026-10-13T00:00:00Z"),
    fechado("2026-10-19T00:00:00Z", "2026-10-20T00:00:00Z"),
    { categoria: "InProgress", criado: "2026-10-10T00:00:00Z", ativado: "2026-10-14T00:00:00Z", fechado: null, mudouEstado: "2026-10-14T12:00:00Z" },
    { categoria: "Proposed", criado: "2026-10-15T00:00:00Z", ativado: null, fechado: null, mudouEstado: null },
  ];
  const m = metricasFluxo(itens, HOJE, 4);

  it("throughput por semana, média sem a semana atual (incompleta)", () => {
    expect(m.throughput.map((s) => [s.semana, s.concluidos])).toEqual([
      ["28/9", 0],
      ["5/10", 2],
      ["12/10", 1],
      ["19/10", 1],
    ]);
    expect(m.throughputMedio).toBe(1);
  });

  it("cycle time, lead time e WIP", () => {
    expect(m.cycleMediana).toBe(1.5);
    expect(m.cycleP85).toBeCloseTo(3.1, 1);
    expect(m.leadMediana).toBeGreaterThan(30);
    expect(m.wip).toBe(1);
    expect(m.wipIdadeMediana).toBe(7);
  });
});

describe("previsaoSprint", () => {
  it("compara horas restantes com a capacidade que sobra", () => {
    expect(previsaoSprint({ horasRestantes: 40, capacidadeSprintH: 200, diasUteisTotal: 10, diasUteisRestantes: 4 })).toMatchObject({
      capacidadeRestanteH: 80,
      pressao: 0.5,
      status: "no-ritmo",
    });
    expect(previsaoSprint({ horasRestantes: 90, capacidadeSprintH: 200, diasUteisTotal: 10, diasUteisRestantes: 4 }).status).toBe("em-risco");
    expect(previsaoSprint({ horasRestantes: 72, capacidadeSprintH: 200, diasUteisTotal: 10, diasUteisRestantes: 4 }).status).toBe("apertado");
  });
});
