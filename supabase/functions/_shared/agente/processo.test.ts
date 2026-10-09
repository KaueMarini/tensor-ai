import { describe, expect, it } from "vitest";
import { gerarCandidatosProcesso, type ItemFluxo } from "./processo.ts";
import { explicar } from "./explicacao.ts";

const HOJE = "2026-10-30";
const item = (id: number, paradoDesde: string, over: Partial<ItemFluxo> = {}): ItemFluxo => ({
  id,
  titulo: `Task ${id}`,
  projetoId: "p",
  categoria: "Proposed",
  responsavelId: "ana",
  horas: 4,
  criado: "2026-10-01T10:00:00Z",
  mudouEstado: `${paradoDesde}T10:00:00Z`,
  ...over,
});

describe("gerarCandidatosProcesso", () => {
  it("gargalo: tasks paradas além de 2× a mediana e de 7 dias", () => {
    const itens = [
      item(1, "2026-10-28"),
      item(2, "2026-10-27"),
      item(3, "2026-10-29"),
      item(4, "2026-10-02", { categoria: "Resolved" }), // 28 dias parada em revisão
      item(5, "2026-10-05", { categoria: "Resolved" }), // 25 dias
    ];
    const [g] = gerarCandidatosProcesso({ hoje: HOJE, projetos: [{ id: "p", nome: "Docas" }], itens });
    expect(g!.tipo).toBe("gargalo");
    expect(g!.fatos).toMatchObject({ parados: 2, abertos: 5, estado_gargalo: "Em revisão", max_parado_dias: 28, task_mais_parada: "#4 Task 4" });
  });

  it("wip: mais de 3 em andamento para a mesma pessoa", () => {
    const itens = [1, 2, 3, 4].map((i) => item(i, "2026-10-29", { categoria: "InProgress", responsavelId: "kaue" }));
    const c = gerarCandidatosProcesso({ hoje: HOJE, projetos: [{ id: "p", nome: "Docas" }], itens }).find((x) => x.tipo === "wip")!;
    expect(c.papeis).toEqual({ de: "kaue" });
    expect(c.fatos).toMatchObject({ em_andamento: 4, limite_wip: 3, acima_do_limite: 1, horas_em_andamento: 16 });
  });

  it("fluxo saudável não gera nada", () => {
    const itens = [1, 2, 3].map((i) => item(i, "2026-10-28"));
    expect(gerarCandidatosProcesso({ hoje: HOJE, projetos: [{ id: "p", nome: "Docas" }], itens })).toEqual([]);
  });

  it("explicação do gargalo: mapa de calor + Pareto dos dias parados", () => {
    const itens = [item(1, "2026-10-28"), item(2, "2026-10-27"), item(4, "2026-10-02", { categoria: "Resolved" })];
    const fs = explicar({
      hoje: HOJE,
      sugestao: { tipo: "gargalo", projetoId: "p", acao: null, fatos: { task_mais_parada: "#4 Task 4" } },
      itensProjeto: itens,
    });
    expect(fs.map((f) => f.tipo)).toEqual(["tempo", "pareto"]);
    const p = fs[1]!;
    if (p.tipo !== "pareto") throw new Error();
    expect(p.itens[0]).toMatchObject({ rotulo: "#4 Task 4", destaque: true });
  });
});
