import { describe, expect, it } from "vitest";
import { avaliarPortfolio, type EsforcoProjeto, type ProjetoPortfolio, projetosParecidos } from "./portfolio.ts";

const proj = (id: string, impacto: ProjetoPortfolio["impacto"], extra: Partial<ProjetoPortfolio> = {}): ProjetoPortfolio => ({
  id,
  nome: id,
  descricao: null,
  tags: [],
  impacto,
  impactoOrigem: impacto ? "gestor" : null,
  ...extra,
});

describe("avaliarPortfolio", () => {
  const esforcos: Record<string, EsforcoProjeto> = {
    interno: { horasHorizonte: 120, pessoas: 4, horasAbertas: 200 },
    docas: { horasHorizonte: 60, pessoas: 3, horasAbertas: 100 },
    portal: { horasHorizonte: 4, pessoas: 1, horasAbertas: 80 },
    novo: { horasHorizonte: 0, pessoas: 0, horasAbertas: 0 },
    talvez: { horasHorizonte: 30, pessoas: 2, horasAbertas: 30 },
  };
  const r = avaliarPortfolio({
    projetos: [proj("interno", 1), proj("docas", 2), proj("portal", 3), proj("novo", 3), proj("talvez", null)],
    esforco: (id) => esforcos[id]!,
    capacidadeTotalH: 400,
  });
  const de = (id: string) => r.find((x) => x.projetoId === id)!;

  it("muito esforço em projeto de impacto baixo", () => {
    expect(de("interno")).toMatchObject({ leitura: "esforco-alto-impacto-baixo", fatia: 0.3, rankEsforco: 1 });
  });
  it("impacto alto com trabalho aberto e quase ninguém nele", () => {
    expect(de("portal").leitura).toBe("impacto-alto-pouco-esforco");
  });
  it("sem trabalho, sem impacto definido e equilibrado", () => {
    expect(de("novo").leitura).toBe("sem-trabalho");
    expect(de("talvez").leitura).toBe("sem-impacto");
    expect(de("docas").leitura).toBe("equilibrado");
  });
});

describe("projetosParecidos", () => {
  it("aponta projetos com descrição e tags parecidas e o que têm em comum", () => {
    const pares = projetosParecidos(
      [
        proj("a", 2, { descricao: "Agendamento de janelas no porto com React", tags: ["agendamento", "front-end", "integracao-fiscal"] }),
        proj("b", 2, { descricao: "Portal de agendamento para transportadoras em React", tags: ["agendamento", "front-end"] }),
        proj("c", 2, { descricao: "Bot no Teams", tags: ["copilot-studio", "power-bi"] }),
      ],
      ["react", "front-end", "agendamento", "integracao-fiscal", "copilot-studio", "power-bi"],
    );
    expect(pares).toHaveLength(1);
    expect(pares[0]).toMatchObject({ a: "a", b: "b" });
    expect(pares[0]!.emComum).toEqual(expect.arrayContaining(["agendamento", "front-end", "react"]));
  });
});
