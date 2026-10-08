import { describe, expect, it } from "vitest";
import { horasDaPessoa, limitesDe, PADRAO_MERCADO, personalizadas } from "./regras.ts";

describe("regras de capacidade", () => {
  it("sem nada do gestor: padrão de mercado (8h × 75% = 6h produtivas)", () => {
    expect(horasDaPessoa(PADRAO_MERCADO)).toEqual({ jornadaDia: 8, foco: 0.75, horasDia: 6, origem: "padrao" });
    expect(limitesDe(PADRAO_MERCADO)).toEqual({ atencao: 0.8, sobrecarga: 1 });
  });

  it("pessoa herda só o que não definiu", () => {
    expect(horasDaPessoa(PADRAO_MERCADO, { jornadaDia: 6, foco: null })).toMatchObject({ horasDia: 4.5, origem: "gestor" });
    expect(horasDaPessoa(PADRAO_MERCADO, { jornadaDia: null, foco: 1 })).toMatchObject({ horasDia: 8, origem: "gestor" });
    expect(horasDaPessoa(PADRAO_MERCADO, { jornadaDia: null, foco: null }).origem).toBe("padrao");
  });

  it("projeto sobrepõe os limites gerais e atenção nunca passa da sobrecarga", () => {
    expect(limitesDe(PADRAO_MERCADO, { atencao: 0.9, sobrecarga: null })).toEqual({ atencao: 0.9, sobrecarga: 1 });
    expect(limitesDe(PADRAO_MERCADO, { atencao: null, sobrecarga: 0.7 })).toEqual({ atencao: 0.7, sobrecarga: 0.7 });
  });

  it("detecta regras gerais diferentes do mercado", () => {
    expect(personalizadas(PADRAO_MERCADO)).toBe(false);
    expect(personalizadas({ ...PADRAO_MERCADO, foco: 0.8 })).toBe(true);
  });
});
