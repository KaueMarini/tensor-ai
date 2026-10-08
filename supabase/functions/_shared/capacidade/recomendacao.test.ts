import { describe, expect, it } from "vitest";
import type { Celula } from "./motor.ts";
import { type CandidatoAlocacao, chaveSkill, recomendarAlocacao, type TaskAlocacao } from "./recomendacao.ts";

const cel = (pessoaId: string, capacidadeH: number, cargaH: number): Celula => ({
  sprintId: "s1",
  pessoaId,
  diasUteis: 10,
  capacidadeDia: capacidadeH / 10,
  capacidadePadrao: false,
  capacidadeH,
  cargaH,
  livreH: Math.max(0, capacidadeH - cargaH),
  utilizacao: capacidadeH ? cargaH / capacidadeH : null,
  status: "ok",
  itens: 0,
});

const task = (over: Partial<TaskAlocacao> = {}): TaskAlocacao => ({
  id: 1,
  sprintId: "s1",
  tags: [],
  featureTags: [],
  horas: 8,
  ...over,
});

const pessoa = (id: string, skills: [string, boolean, number?][] = [], funcoes: string[] = []): CandidatoAlocacao => ({
  id,
  skills: skills.map(([tag, confirmada, evidencias = 3]) => ({ tag, confirmada, evidencias })),
  funcoes,
});

function rodar(tasks: TaskAlocacao[], candidatos: CandidatoAlocacao[], celulas: Celula[]) {
  const mapa = new Map(celulas.map((c) => [c.pessoaId, c]));
  return recomendarAlocacao({ tasks, candidatos, celula: (_s, p) => mapa.get(p), sprintPadrao: "s1" });
}

describe("chaveSkill", () => {
  it("ignora acento, caixa, hífen e espaço", () => {
    expect(chaveSkill("Back-end")).toBe(chaveSkill("backend"));
    expect(chaveSkill("Integração Fiscal")).toBe("integracaofiscal");
  });
});

describe("recomendarAlocacao", () => {
  it("quem tem a skill vem antes de quem só tem tempo livre", () => {
    const [r] = rodar(
      [task({ tags: ["back-end"] })],
      [pessoa("livre"), pessoa("dev", [["backend", true]])],
      [cel("livre", 60, 0), cel("dev", 60, 30)],
    );
    expect(r!.opcoes[0]!.pessoaId).toBe("dev");
    expect(r!.opcoes[0]!.matches).toEqual([{ tag: "backend", tipo: "confirmada" }]);
  });

  it("skill confirmada pesa mais que sugerida", () => {
    const [r] = rodar(
      [task({ tags: ["react"] })],
      [pessoa("sugerida", [["react", false, 2]]), pessoa("confirmada", [["React", true]])],
      [cel("sugerida", 60, 10), cel("confirmada", 60, 10)],
    );
    expect(r!.opcoes.map((o) => o.pessoaId)).toEqual(["confirmada", "sugerida"]);
  });

  it("tags da Feature também contam e tags seed-* são ignoradas", () => {
    const [r] = rodar(
      [task({ tags: ["seed-popular"], featureTags: ["copilot-studio"] })],
      [pessoa("a"), pessoa("b", [["copilot-studio", true]])],
      [cel("a", 60, 0), cel("b", 60, 0)],
    );
    expect(r!.tagsConsideradas).toEqual(["copilot-studio"]);
    expect(r!.opcoes[0]!.pessoaId).toBe("b");
  });

  it("sem tags na task, decide pela folga", () => {
    const [r] = rodar([task()], [pessoa("cheio"), pessoa("folgado")], [cel("cheio", 60, 50), cel("folgado", 60, 10)]);
    expect(r!.opcoes[0]!.pessoaId).toBe("folgado");
    expect(r!.opcoes[0]!.encaixe).toBeNull();
  });

  it("penaliza quem passaria de 100% mesmo tendo a skill", () => {
    const [r] = rodar(
      [task({ tags: ["sql"], horas: 16 })],
      [pessoa("lotado", [["sql", true]]), pessoa("parcial", [["sql", false, 5]])],
      [cel("lotado", 60, 55), cel("parcial", 60, 10)],
    );
    expect(r!.opcoes[0]!.pessoaId).toBe("parcial");
    expect(r!.opcoes.find((o) => o.pessoaId === "lotado")!.statusDepois).toBe("sobrecarga");
  });

  it("distribui em sequência: duas tasks iguais não vão para a mesma pessoa se a outra tem folga", () => {
    const rs = rodar(
      [task({ id: 1, horas: 30 }), task({ id: 2, horas: 30 })],
      [pessoa("a"), pessoa("b")],
      [cel("a", 60, 0), cel("b", 60, 5)],
    );
    expect(rs.map((r) => r.opcoes[0]!.pessoaId)).toEqual(["a", "b"]);
    expect(rs[1]!.opcoes.find((o) => o.pessoaId === "a")!.cargaAntesH).toBe(30);
  });

  it("task sem estimativa não pesa na carga e é sinalizada", () => {
    const [r] = rodar([task({ horas: null })], [pessoa("a")], [cel("a", 60, 20)]);
    expect(r!.semEstimativa).toBe(true);
    expect(r!.opcoes[0]!.cargaDepoisH).toBe(20);
  });

  it("sem capacidade (ex.: férias) vai para o fim", () => {
    const [r] = rodar([task({ tags: ["qa"] })], [pessoa("ferias", [["qa", true]]), pessoa("outro")], [cel("ferias", 0, 0), cel("outro", 60, 30)]);
    expect(r!.opcoes[0]!.pessoaId).toBe("outro");
  });
});
