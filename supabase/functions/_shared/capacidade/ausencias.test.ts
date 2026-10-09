import { describe, expect, it } from "vitest";
import { type Ausencia, conflitosAusencia, type TarefaAgendada } from "./ausencias.ts";

const sprint2 = { id: "s2", nome: "Sprint 2", inicio: "2026-10-19", fim: "2026-10-30" };
const sprint3 = { id: "s3", nome: "Sprint 3", inicio: "2026-11-02", fim: "2026-11-13" };
const t = (id: number, responsavelId: string, horas: number, sprint = sprint2): TarefaAgendada => ({
  id,
  titulo: `Task ${id}`,
  projetoId: "p",
  responsavelId,
  horas,
  sprint,
});
const ferias = (pessoaId: string, inicio: string, fim: string, origem: Ausencia["origem"] = "agenda"): Ausencia => ({
  pessoaId,
  inicio,
  fim,
  tipo: "ferias",
  origem,
});

describe("conflitosAusencia", () => {
  it("ausência parcial na sprint: aponta as tasks e quanto da sprint a pessoa não está", () => {
    const [c] = conflitosAusencia({
      hoje: "2026-10-09",
      ausencias: [ferias("julliano", "2026-10-19", "2026-10-23", "devops")],
      tarefas: [t(1, "julliano", 16), t(2, "julliano", 12), t(3, "julliano", 8, sprint3), t(4, "ana", 10)],
    });
    expect(c!.tarefas.map((x) => x.id)).toEqual([1, 2]);
    expect(c!.tarefas[0]).toMatchObject({ diasAusente: 5, diasUteisSprint: 10, pctSprintAusente: 50 });
    expect(c!.horasEmRisco).toBe(28);
    expect(c!.gravidade).toBe("critico");
  });

  it("junta ausências seguidas da mesma pessoa (agenda + DevOps)", () => {
    const r = conflitosAusencia({
      hoje: "2026-10-09",
      ausencias: [ferias("ana", "2026-10-19", "2026-10-21", "devops"), ferias("ana", "2026-10-22", "2026-10-30")],
      tarefas: [t(1, "ana", 8)],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ inicio: "2026-10-19", fim: "2026-10-30", origem: "agenda", diasUteis: 10 });
    expect(r[0]!.tarefas[0]!.pctSprintAusente).toBe(100);
  });

  it("ignora ausência já passada, fora do horizonte ou sem tasks no período", () => {
    expect(
      conflitosAusencia({
        hoje: "2026-10-09",
        ausencias: [ferias("a", "2026-09-01", "2026-09-05"), ferias("b", "2027-03-01", "2027-03-05"), ferias("c", "2026-10-19", "2026-10-20")],
        tarefas: [t(1, "a", 8), t(2, "b", 8), t(3, "c", 8, sprint3)],
      }),
    ).toEqual([]);
  });

  it("feriado não conta como dia ausente", () => {
    const [c] = conflitosAusencia({
      hoje: "2026-10-09",
      ausencias: [ferias("a", "2026-11-02", "2026-11-03")],
      tarefas: [t(1, "a", 8, sprint3)],
      feriados: ["2026-11-02"],
    });
    expect(c!.diasUteis).toBe(1);
    expect(c!.gravidade).toBe("atencao");
  });
});
