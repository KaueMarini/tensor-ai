export interface Limites {
  atencao: number;
  sobrecarga: number;
}

export interface RegrasGerais extends Limites {
  jornadaDia: number;
  foco: number;
}

export const PADRAO_MERCADO: RegrasGerais = { jornadaDia: 8, foco: 0.75, atencao: 0.8, sobrecarga: 1 };

export interface RegraPessoa {
  pessoaId: string;
  jornadaDia: number | null;
  foco: number | null;
}

export interface RegraProjeto {
  projetoId: string;
  atencao: number | null;
  sobrecarga: number | null;
}

export interface AlocacaoProjeto {
  projetoId: string;
  pessoaId: string;
  horasDia: number;
}

export type OrigemCapacidade = "gestor" | "devops" | "padrao";

export interface HorasPessoa {
  jornadaDia: number;
  foco: number;
  horasDia: number;
  origem: "gestor" | "padrao";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function horasDaPessoa(geral: RegrasGerais, pessoa?: Pick<RegraPessoa, "jornadaDia" | "foco"> | null): HorasPessoa {
  const jornadaDia = pessoa?.jornadaDia ?? geral.jornadaDia;
  const foco = pessoa?.foco ?? geral.foco;
  return {
    jornadaDia,
    foco,
    horasDia: round2(jornadaDia * foco),
    origem: pessoa && (pessoa.jornadaDia !== null || pessoa.foco !== null) ? "gestor" : "padrao",
  };
}

export function limitesDe(geral: Limites, projeto?: Pick<RegraProjeto, "atencao" | "sobrecarga"> | null): Limites {
  const sobrecarga = projeto?.sobrecarga ?? geral.sobrecarga;
  const atencao = Math.min(projeto?.atencao ?? geral.atencao, sobrecarga);
  return { atencao, sobrecarga };
}

export function personalizadas(geral: RegrasGerais): boolean {
  return (Object.keys(PADRAO_MERCADO) as (keyof RegrasGerais)[]).some((k) => Math.abs(geral[k] - PADRAO_MERCADO[k]) > 1e-6);
}
