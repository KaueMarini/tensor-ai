// Regras de capacidade do gestor, resolvidas em cascata (puro, sem Supabase).
// O que o gestor não definir cai no nível de cima e, no fim, no padrão de mercado.
//
//   horas produtivas/dia = jornada × foco      pessoa → geral → mercado
//   horas num projeto    = alocação do gestor  → Capacity do DevOps → horas produtivas
//   limites              = projeto (só na visão do projeto) → geral → mercado

export interface Limites {
  /** Utilização acima disso = "no limite" (fração: 0.8 = 80%). */
  atencao: number;
  /** Utilização acima disso = "sobrecarregado". */
  sobrecarga: number;
}

export interface RegrasGerais extends Limites {
  jornadaDia: number;
  /** Fração da jornada que vira trabalho de task (o resto é reunião, e-mail, interrupção). */
  foco: number;
}

/**
 * Referências usuais de mercado: jornada CLT de 8h; ~6h produtivas por dia (75% de foco),
 * como recomendam Scrum/Azure DevOps ao preencher Capacity; utilização saudável até ~80%;
 * acima de 100% é sobrecarga.
 */
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

/** De onde veio a capacidade de uma célula (a tela mostra para o gestor saber o que mexer). */
export type OrigemCapacidade = "gestor" | "devops" | "padrao";

export interface HorasPessoa {
  jornadaDia: number;
  foco: number;
  /** jornada × foco */
  horasDia: number;
  /** "gestor" se a pessoa tem jornada ou foco próprios. */
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

/** Regras gerais diferentes do padrão de mercado? (a tela avisa) */
export function personalizadas(geral: RegrasGerais): boolean {
  return (Object.keys(PADRAO_MERCADO) as (keyof RegrasGerais)[]).some((k) => Math.abs(geral[k] - PADRAO_MERCADO[k]) > 1e-6);
}
