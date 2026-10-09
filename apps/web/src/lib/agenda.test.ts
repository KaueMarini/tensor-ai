import { describe, expect, it } from "vitest";
import {
  agruparAusencias,
  celulasDoMes,
  ehDiaUtil,
  type EventoAgenda,
  eventosPorDia,
  hojeLocal,
  lerMes,
  mesVizinho,
  nomeMes,
  proximosEventos,
  rotuloData,
  somarDias,
} from "./agenda";

describe("calendário do mês", () => {
  it("monta 42 células começando no domingo", () => {
    // outubro/2026: dia 1 é quinta → começa no domingo 27/09
    const c = celulasDoMes(2026, 9);
    expect(c).toHaveLength(42);
    expect(c[0]).toMatchObject({ data: "2026-09-27", dia: 27, doMes: false, diaUtil: false });
    expect(c[4]).toMatchObject({ data: "2026-10-01", dia: 1, doMes: true });
    expect(c.at(-1)!.data).toBe("2026-11-07");
    expect(c.filter((x) => x.doMes)).toHaveLength(31);
  });

  it("mês que começa no domingo não tem dias do mês anterior", () => {
    expect(celulasDoMes(2026, 1)[0]!.data).toBe("2026-02-01");
  });

  it("navega entre meses atravessando o ano", () => {
    expect(mesVizinho(2026, 0, -1)).toEqual({ ano: 2025, mes0: 11 });
    expect(mesVizinho(2026, 11, 1)).toEqual({ ano: 2027, mes0: 0 });
    expect(nomeMes(2026, 9)).toBe("Outubro de 2026");
    expect(lerMes("2026-10")).toEqual({ ano: 2026, mes0: 9 });
    expect(lerMes("2026-13")).toBeNull();
    expect(lerMes(undefined)).toBeNull();
  });

  it("datas sem fuso", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(ehDiaUtil("2026-10-10")).toBe(false); // sábado
    expect(ehDiaUtil("2026-10-12")).toBe(true);
    // 23h do dia 7 no fuso local continua sendo dia 7
    expect(hojeLocal(new Date(2026, 9, 7, 23, 30))).toBe("2026-10-07");
  });
});

describe("agruparAusencias", () => {
  it("junta períodos contíguos ou sobrepostos da mesma pessoa e tipo", () => {
    const g = agruparAusencias([
      { id: 1, pessoaId: "a", tipo: "ferias", inicio: "2026-10-05", fim: "2026-10-09" },
      { id: 2, pessoaId: "a", tipo: "ferias", inicio: "2026-10-10", fim: "2026-10-12" },
      { id: 3, pessoaId: "a", tipo: "ferias", inicio: "2026-10-20", fim: "2026-10-21" },
      { id: 4, pessoaId: "a", tipo: "licenca", inicio: "2026-10-13", fim: "2026-10-13" },
      { id: 5, pessoaId: "b", tipo: "ferias", inicio: "2026-10-06", fim: "2026-10-07" },
    ]);
    expect(g.map((x) => [x.pessoaId, x.tipo, x.inicio, x.fim, x.ids])).toEqual([
      ["a", "ferias", "2026-10-05", "2026-10-12", [1, 2]],
      ["a", "ferias", "2026-10-20", "2026-10-21", [3]],
      ["a", "licenca", "2026-10-13", "2026-10-13", [4]],
      ["b", "ferias", "2026-10-06", "2026-10-07", [5]],
    ]);
  });
});

const ev = (over: Partial<EventoAgenda> & Pick<EventoAgenda, "tipo" | "inicio" | "fim">): EventoAgenda => ({
  id: `${over.tipo}-${over.inicio}`,
  texto: over.tipo,
  ...over,
});

describe("eventosPorDia", () => {
  const celulas = celulasDoMes(2026, 9);

  it("sprint só no início e no fim", () => {
    const m = eventosPorDia(celulas, [ev({ tipo: "sprint", texto: "Sprint 1", inicio: "2026-10-05", fim: "2026-10-16" })]);
    expect(m.get("2026-10-05")!.map((e) => e.texto)).toEqual(["Início · Sprint 1"]);
    expect(m.get("2026-10-16")!.map((e) => e.texto)).toEqual(["Fim · Sprint 1"]);
    expect(m.get("2026-10-08")).toEqual([]);
  });

  it("ausência só em dias úteis e recortada pela grade", () => {
    const m = eventosPorDia(celulas, [ev({ tipo: "ausencia", texto: "Ana · Férias", inicio: "2026-09-20", fim: "2026-10-05" })]);
    expect(m.get("2026-09-27")).toEqual([]); // domingo
    expect(m.get("2026-09-28")!.length).toBe(1);
    expect(m.get("2026-10-03")).toEqual([]); // sábado
    expect(m.get("2026-10-05")!.length).toBe(1);
    expect(m.get("2026-10-06")).toEqual([]);
  });

  it("evento de vários dias que não é ausência (folga do time) ocupa os dias úteis", () => {
    const m = eventosPorDia(celulas, [ev({ tipo: "feriado", texto: "Folga do time", inicio: "2026-10-09", fim: "2026-10-12" })]);
    expect(m.get("2026-10-09")!.length).toBe(1); // sexta
    expect(m.get("2026-10-10")).toEqual([]); // sábado
    expect(m.get("2026-10-12")!.length).toBe(1); // segunda
  });

  it("ordena feriado, sprint, entrega e ausência; ignora o que está fora da grade", () => {
    const m = eventosPorDia(celulas, [
      ev({ tipo: "ausencia", texto: "Bia", inicio: "2026-10-12", fim: "2026-10-12" }),
      ev({ tipo: "entrega", texto: "Feature X", inicio: "2026-10-12", fim: "2026-10-12" }),
      ev({ tipo: "feriado", texto: "N. Sra. Aparecida", inicio: "2026-10-12", fim: "2026-10-12" }),
      ev({ tipo: "sprint", texto: "Sprint 2", inicio: "2026-10-12", fim: "2026-10-23" }),
      ev({ tipo: "entrega", texto: "Longe", inicio: "2027-01-10", fim: "2027-01-10" }),
    ]);
    expect(m.get("2026-10-12")!.map((e) => e.tipo)).toEqual(["feriado", "sprint", "entrega", "ausencia"]);
    expect([...m.values()].flat().some((e) => e.texto === "Longe")).toBe(false);
  });
});

describe("próximos eventos", () => {
  it("lista o que ainda não terminou, em ordem, até o limite", () => {
    const lista = proximosEventos(
      [
        ev({ tipo: "entrega", inicio: "2026-10-20", fim: "2026-10-20" }),
        ev({ tipo: "sprint", inicio: "2026-10-01", fim: "2026-10-09" }), // em andamento
        ev({ tipo: "feriado", inicio: "2026-10-02", fim: "2026-10-02" }), // já passou
        ev({ tipo: "ausencia", inicio: "2026-10-15", fim: "2026-10-16" }),
      ],
      "2026-10-07",
      2,
    );
    expect(lista.map((e) => e.tipo)).toEqual(["sprint", "ausencia"]);
  });

  it("formata data única e período", () => {
    expect(rotuloData({ inicio: "2026-10-12", fim: "2026-10-12" })).toBe("12/10");
    expect(rotuloData({ inicio: "2026-10-05", fim: "2026-10-16" })).toBe("05/10–16/10");
  });
});
