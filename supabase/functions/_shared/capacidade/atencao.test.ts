import { describe, expect, it } from "vitest";
import type { CelulaGlobal } from "./global.ts";
import { itensDeAtencao } from "./atencao.ts";

const cel = (pessoaId: string, capacidadeH: number, cargaH: number, status: CelulaGlobal["status"], porProjeto: CelulaGlobal["porProjeto"] = []): CelulaGlobal => ({
  sprintId: "x",
  pessoaId,
  diasUteis: 10,
  capacidadeDia: capacidadeH / 10,
  origemCapacidade: "devops",
  limites: { atencao: 0.8, sobrecarga: 1 },
  capacidadeH,
  cargaH,
  livreH: capacidadeH - cargaH,
  utilizacao: capacidadeH ? cargaH / capacidadeH : null,
  status,
  itens: 1,
  porProjeto,
});

const pessoas = [
  { id: "a", nome: "Ana" },
  { id: "b", nome: "Bruno" },
  { id: "c", nome: "Caio" },
  { id: "d", nome: "Duda" },
];
const celulas: Record<string, CelulaGlobal> = {
  a: cel("a", 40, 76, "sobrecarga", [
    { projetoId: "p1", cargaH: 66 },
    { projetoId: "p2", cargaH: 10 },
  ]),
  b: cel("b", 60, 54, "limite", [{ projetoId: "p2", cargaH: 54 }]),
  c: cel("c", 0, 12, "sem-capacidade", [{ projetoId: "p1", cargaH: 12 }]),
  d: cel("d", 60, 10, "ok"),
};
const nomes: Record<string, string> = { p1: "Atlântico", p2: "Rota" };

function rodar(semDono = [{ projetoId: "p2", nome: "Rota", tasks: 3, horas: 12 }]) {
  return itensDeAtencao({ pessoas, celula: (id) => celulas[id], nomeProjeto: (id) => nomes[id]!, semDono, periodo: "nas próximas 2 semanas" });
}

describe("itensDeAtencao", () => {
  it("ordena: ausente com tasks, sobrecarga, sem dono, no limite; quem tem folga não aparece", () => {
    expect(rodar().map((i) => i.tipo)).toEqual(["sem-capacidade", "sobrecarga", "sem-dono", "limite"]);
  });

  it("frase da sobrecarga diz quanto passou e de onde vem", () => {
    const s = rodar().find((i) => i.tipo === "sobrecarga")!;
    expect(s.titulo).toBe("Ana está a 190% nas próximas 2 semanas");
    expect(s.detalhe).toBe("36h acima da capacidade (76h de 40h) · maior parte em Atlântico (66h)");
    expect(s.projetoId).toBe("p1");
  });

  it("agrupa tasks sem dono num item só", () => {
    const itens = rodar([
      { projetoId: "p1", nome: "Atlântico", tasks: 1, horas: 4 },
      { projetoId: "p2", nome: "Rota", tasks: 3, horas: 12 },
    ]);
    const s = itens.filter((i) => i.tipo === "sem-dono");
    expect(s).toHaveLength(1);
    expect(s[0]!.titulo).toBe("4 tasks sem responsável (16h)");
    expect(s[0]!.detalhe.startsWith("Rota 3 · Atlântico 1")).toBe(true);
  });

  it("projeto sem equipe entra depois das sobrecargas e antes das tasks sem dono", () => {
    const itens = itensDeAtencao({
      pessoas,
      celula: (id) => celulas[id],
      nomeProjeto: (id) => nomes[id]!,
      semDono: [{ projetoId: "p2", nome: "Rota", tasks: 3, horas: 12 }],
      semEquipe: [{ projetoId: "p9", nome: "Farol" }],
      periodo: "nas próximas 2 semanas",
    });
    expect(itens.map((i) => i.tipo)).toEqual(["sem-capacidade", "sobrecarga", "sem-equipe", "sem-dono", "limite"]);
    expect(itens[2]!.titulo).toBe("Projeto novo sem equipe: Farol");
  });

  it("sem tasks sem dono não cria item", () => {
    expect(rodar([]).some((i) => i.tipo === "sem-dono")).toBe(false);
  });
});
