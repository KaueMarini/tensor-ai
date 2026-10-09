import { describe, expect, it } from "vitest";
import { calcularCapacidade, diasUteis, horasPendentes, type ItemCarga, statusDe } from "./motor.ts";

const item = (over: Partial<ItemCarga>): ItemCarga => ({
  sprintId: "s1",
  responsavelId: "p1",
  horasRestantes: null,
  horasEstimadas: null,
  horasConcluidas: null,
  fechado: false,
  temFilhos: false,
  ...over,
});

const sprint = { id: "s1", inicio: "2026-10-05", fim: "2026-10-16" };
const pessoa = { id: "p1", horasDia: 8 };

describe("diasUteis", () => {
  it("conta só segunda a sexta", () => {
    expect(diasUteis("2026-10-05", "2026-10-16")).toBe(10);
    expect(diasUteis("2026-10-10", "2026-10-11")).toBe(0);
  });

  it("desconta os dias excluídos", () => {
    expect(diasUteis("2026-10-05", "2026-10-16", (d) => d === "2026-10-12")).toBe(9);
  });
});

describe("horasPendentes", () => {
  it("prefere o restante e cai para estimado − concluído", () => {
    expect(horasPendentes({ horasRestantes: 3, horasEstimadas: 10, horasConcluidas: 1 })).toBe(3);
    expect(horasPendentes({ horasRestantes: null, horasEstimadas: 10, horasConcluidas: 4 })).toBe(6);
    expect(horasPendentes({ horasRestantes: null, horasEstimadas: 2, horasConcluidas: 5 })).toBe(0);
  });
});

describe("statusDe", () => {
  it("classifica pela utilização", () => {
    expect(statusDe(40, 80).status).toBe("ok");
    expect(statusDe(70, 80).status).toBe("limite");
    expect(statusDe(90, 80).status).toBe("sobrecarga");
    expect(statusDe(5, 0)).toEqual({ utilizacao: null, status: "sem-capacidade" });
    expect(statusDe(0, 0).status).toBe("ok");
  });

  it("padrão de mercado: atenção acima de 80%, exatamente 80% ainda é folga", () => {
    expect(statusDe(64, 80).status).toBe("ok");
    expect(statusDe(65, 80).status).toBe("limite");
    expect(statusDe(80, 80).status).toBe("limite");
  });

  it("usa os limites do gestor", () => {
    const limites = { atencao: 0.9, sobrecarga: 1.1 };
    expect(statusDe(70, 80, limites).status).toBe("ok");
    expect(statusDe(85, 80, limites).status).toBe("limite");
    expect(statusDe(90, 80, limites).status).toBe("sobrecarga");
  });
});

describe("calcularCapacidade", () => {
  it("usa a Capacity do DevOps e soma a carga das tasks abertas", () => {
    const [c] = calcularCapacidade({
      sprints: [sprint],
      pessoas: [pessoa],
      capacidades: [{ sprintId: "s1", pessoaId: "p1", capacidadeDia: 6 }],
      folgas: [],
      feriados: [],
      itens: [
        item({ horasRestantes: 30 }),
        item({ horasRestantes: 40 }),
        item({ horasRestantes: 99, fechado: true }),
        item({ horasRestantes: 99, temFilhos: true }),
        item({ horasRestantes: 99, responsavelId: "outra" }),
      ],
    });
    expect(c).toMatchObject({ diasUteis: 10, capacidadeH: 60, cargaH: 70, livreH: -10, itens: 2, status: "sobrecarga" });
    expect(c!.origemCapacidade).toBe("devops");
  });

  it("sem Capacity configurada usa as horas produtivas da pessoa", () => {
    const [c] = calcularCapacidade({
      sprints: [sprint],
      pessoas: [pessoa],
      capacidades: [],
      folgas: [],
      feriados: [],
      itens: [],
    });
    expect(c).toMatchObject({ capacidadeDia: 8, capacidadeH: 80, origemCapacidade: "padrao", status: "ok" });
  });

  it("desconta feriado, folga da pessoa e folga do time", () => {
    const [c] = calcularCapacidade({
      sprints: [sprint],
      pessoas: [pessoa],
      capacidades: [{ sprintId: "s1", pessoaId: "p1", capacidadeDia: 8 }],
      folgas: [
        { sprintId: "s1", pessoaId: "p1", inicio: "2026-10-06", fim: "2026-10-07" },
        { sprintId: "s1", pessoaId: null, inicio: "2026-10-16", fim: "2026-10-16" },
        { sprintId: "s1", pessoaId: "outra", inicio: "2026-10-08", fim: "2026-10-08" },
      ],
      feriados: ["2026-10-12"],
      itens: [],
    });
    expect(c!.diasUteis).toBe(6);
    expect(c!.capacidadeH).toBe(48);
  });

  it("férias a sprint toda com task atribuída vira sem-capacidade", () => {
    const [c] = calcularCapacidade({
      sprints: [sprint],
      pessoas: [pessoa],
      capacidades: [{ sprintId: "s1", pessoaId: "p1", capacidadeDia: 8 }],
      folgas: [{ sprintId: "s1", pessoaId: "p1", inicio: "2026-10-05", fim: "2026-10-16" }],
      feriados: [],
      itens: [item({ horasRestantes: 4 })],
    });
    expect(c).toMatchObject({ capacidadeH: 0, cargaH: 4, utilizacao: null, status: "sem-capacidade" });
  });

  it("alocação do gestor no projeto vence a Capacity do DevOps; limites do projeto classificam", () => {
    const [c] = calcularCapacidade({
      sprints: [sprint],
      pessoas: [pessoa],
      capacidades: [{ sprintId: "s1", pessoaId: "p1", capacidadeDia: 6 }],
      alocacoes: [{ pessoaId: "p1", horasDia: 2 }],
      limites: { atencao: 0.5, sobrecarga: 0.9 },
      folgas: [],
      feriados: [],
      itens: [item({ horasRestantes: 12 })],
    });
    expect(c).toMatchObject({ capacidadeDia: 2, capacidadeH: 20, origemCapacidade: "gestor", status: "limite" });
    expect(c!.limites).toEqual({ atencao: 0.5, sobrecarga: 0.9 });
  });

  it("ignora sprints sem datas", () => {
    expect(
      calcularCapacidade({
        sprints: [{ id: "x", inicio: null, fim: null }],
        pessoas: [pessoa],
        capacidades: [],
        folgas: [],
        feriados: [],
        itens: [],
      }),
    ).toEqual([]);
  });
});
