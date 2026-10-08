import { describe, expect, it } from "vitest";
import type { Celula } from "./motor.ts";
import { ehTimePadrao, resumirSquad } from "./squads.ts";

const cel = (pessoaId: string, capacidadeH: number, cargaH: number, status: Celula["status"], itens = 1): Celula => ({
  sprintId: "s1",
  pessoaId,
  diasUteis: 10,
  capacidadeDia: capacidadeH / 10,
  origemCapacidade: "devops",
  limites: { atencao: 0.8, sobrecarga: 1 },
  capacidadeH,
  cargaH,
  livreH: Math.max(0, capacidadeH - cargaH),
  utilizacao: capacidadeH ? cargaH / capacidadeH : null,
  status,
  itens,
});

describe("resumirSquad", () => {
  it("soma capacidade e carga e recalcula o status do agregado", () => {
    const r = resumirSquad([cel("a", 60, 70, "sobrecarga", 5), cel("b", 60, 20, "ok", 2), undefined]);
    expect(r).toMatchObject({ pessoas: 2, capacidadeH: 120, cargaH: 90, livreH: 30, status: "ok", itens: 7 });
    expect(r.utilizacao).toBeCloseTo(0.75);
    // o agregado está ok, mas alguém está sobrecarregado
    expect(r.porStatus).toEqual({ ok: 1, limite: 0, sobrecarga: 1, "sem-capacidade": 0 });
  });

  it("squad sem capacidade com carga fica 'sem-capacidade'", () => {
    const r = resumirSquad([cel("a", 0, 8, "sem-capacidade")]);
    expect(r.status).toBe("sem-capacidade");
    expect(r.utilizacao).toBeNull();
  });

  it("squad vazio não quebra", () => {
    expect(resumirSquad([])).toMatchObject({ pessoas: 0, capacidadeH: 0, cargaH: 0, status: "ok" });
  });
});

describe("ehTimePadrao", () => {
  it("reconhece o time criado junto com o projeto", () => {
    expect(ehTimePadrao("IportJLKN12 Team", "IportJLKN12")).toBe(true);
    expect(ehTimePadrao("Squad Pátio", "IportJLKN12")).toBe(false);
  });
});
