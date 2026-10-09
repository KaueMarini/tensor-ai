import { describe, expect, it } from "vitest";
import { explicar, type ItemTempo, pareto, quadranteDe } from "./explicacao.ts";

const HOJE = "2026-10-09";
const item = (id: number, over: Partial<ItemTempo> = {}): ItemTempo => ({
  id,
  titulo: `Task ${id}`,
  categoria: "Proposed",
  responsavelId: "ana",
  horas: 4,
  criado: "2026-10-01T10:00:00Z",
  mudouEstado: "2026-10-07T10:00:00Z",
  ...over,
});

describe("pareto", () => {
  it("acumula do maior para o menor e diz quantos itens fazem 80%", () => {
    const p = pareto("t", "h", [
      { rotulo: "a", valor: 60, destaque: false },
      { rotulo: "b", valor: 25, destaque: true },
      { rotulo: "c", valor: 10, destaque: false },
      { rotulo: "d", valor: 5, destaque: false },
    ])!;
    expect(p.itens.map((x) => x.acumuladoPct)).toEqual([60, 85, 95, 100]);
    expect(p.corte80).toBe(2);
    expect(p.fatos).toMatchObject({ itens_80: 2, itens_total: 4, pct_itens_80: 50, destaque_pct: 25, destaque_no_80: "sim" });
  });
  it("com um item só não há Pareto", () => {
    expect(pareto("t", "h", [{ rotulo: "a", valor: 5, destaque: false }])).toBeNull();
  });
});

describe("quadranteDe", () => {
  it("classifica os quatro quadrantes", () => {
    expect(quadranteDe(0.2, 0.8)).toBe("quick-win");
    expect(quadranteDe(0.8, 0.8)).toBe("grande-aposta");
    expect(quadranteDe(0.2, 0.2)).toBe("preenchimento");
    expect(quadranteDe(0.8, 0.2)).toBe("evitar");
  });
});

describe("explicar", () => {
  it("task sem dono: tempo (com mapa de calor), Pareto das horas sem dono e matriz", () => {
    const fs = explicar({
      hoje: HOJE,
      sugestao: {
        tipo: "atribuir",
        projetoId: "p",
        acao: { work_item_id: 9, de_pessoa_id: null, para_pessoa_id: "ana" },
        fatos: { horas: 8, para_antes_pct: 40, para_depois_pct: 55 },
      },
      itensProjeto: [
        item(9, { responsavelId: null, horas: 8, criado: "2026-09-10T10:00:00Z", mudouEstado: "2026-09-10T10:00:00Z" }),
        item(10, { responsavelId: null, horas: 2 }),
        item(11),
        item(12, { categoria: "InProgress" }),
      ],
    });
    expect(fs.map((f) => f.tipo)).toEqual(["tempo", "pareto", "matriz"]);
    const t = fs[0]!;
    if (t.tipo !== "tempo") throw new Error();
    expect(t.alvo).toMatchObject({ id: 9, leadDias: 29, paradoDias: 29, estado: "A fazer" });
    expect(t.estourado).toBe(true);
    expect(t.mapa.destaque).toEqual([0, 3]);
    const m = fs[2]!;
    if (m.tipo !== "matriz") throw new Error();
    expect(m.fatos.esforco_pct).toBe(25);
    expect(m.quadrante).toBe("quick-win");
  });

  it("rebalancear sem atraso: só Pareto da carga da pessoa e matriz (tempo não entra)", () => {
    const fs = explicar({
      hoje: HOJE,
      sugestao: {
        tipo: "rebalancear",
        projetoId: "p",
        acao: { work_item_id: 3, de_pessoa_id: "kaue", para_pessoa_id: "ana" },
        fatos: { horas: 6, de_acima_h: 4, para_antes_pct: 0, para_depois_pct: 11 },
      },
      itensProjeto: [item(3), item(4)],
      itensDe: [item(3, { horas: 6 }), item(4, { horas: 30 }), item(5, { horas: 20 })],
    });
    expect(fs.map((f) => f.tipo)).toEqual(["pareto", "matriz"]);
    const m = fs[1]!;
    if (m.tipo !== "matriz") throw new Error();
    expect(m.fatos.sobrecarga_resolvida_pct).toBe(100);
    expect(m.quadrante).toBe("quick-win");
  });

  it("projetos parecidos: matriz de portfólio com os dois em destaque", () => {
    const fs = explicar({
      hoje: HOJE,
      sugestao: { tipo: "similares", projetoId: "a", acao: null, fatos: { projeto_a: "A", projeto_b: "B" } },
      itensProjeto: [],
      portfolio: [
        { id: "a", nome: "A", fatia: 0.4, horas: 160, impacto: 3 },
        { id: "b", nome: "B", fatia: 0.1, horas: 40, impacto: 3 },
        { id: "c", nome: "C", fatia: 0.2, horas: 80, impacto: 1 },
      ],
    });
    expect(fs.map((f) => f.tipo)).toEqual(["matriz"]);
    const m = fs[0]!;
    if (m.tipo !== "matriz") throw new Error();
    expect(m.pontos.filter((p) => p.destaque).map((p) => p.rotulo)).toEqual(["A", "B"]);
  });
});
