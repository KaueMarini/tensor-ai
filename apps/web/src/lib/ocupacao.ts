import { useMemo } from "react";
import type { CelulaGlobal } from "@shared/capacidade/global";
import { useMembros } from "./queries";
import { useCargaGlobal } from "./carga-global";
import { agruparMembros } from "./membros";

export interface Periodo {
  id: string;
  inicio: string;
  fim: string;
  rotulo: string;
}

const DIA = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function segundaDestaSemana(): Date {
  const hoje = new Date();
  const base = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const dow = base.getUTCDay() || 7;
  return new Date(base.getTime() - (dow - 1) * DIA);
}

export function semana(offset: number): Periodo {
  const seg = new Date(segundaDestaSemana().getTime() + offset * 7 * DIA);
  const sex = new Date(seg.getTime() + 4 * DIA);
  const mesmoMes = seg.getUTCMonth() === sex.getUTCMonth();
  const rotulo = mesmoMes
    ? `${seg.getUTCDate()}–${sex.getUTCDate()} ${MESES[sex.getUTCMonth()]}`
    : `${seg.getUTCDate()} ${MESES[seg.getUTCMonth()]}–${sex.getUTCDate()} ${MESES[sex.getUTCMonth()]}`;
  return { id: `sem-${iso(seg)}`, inicio: iso(seg), fim: iso(sex), rotulo };
}

export const semanas = (n: number) => Array.from({ length: n }, (_, i) => semana(i));

export function meses(n: number): Periodo[] {
  const seg = segundaDestaSemana();
  return Array.from({ length: n }, (_, i) => {
    const primeiro = new Date(Date.UTC(seg.getUTCFullYear(), seg.getUTCMonth() + i, 1));
    const ultimo = new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth() + 1, 0));
    const inicio = i === 0 ? seg : primeiro;
    const ano = String(primeiro.getUTCFullYear()).slice(2);
    return { id: `mes-${iso(primeiro)}`, inicio: iso(inicio), fim: iso(ultimo), rotulo: `${MESES[primeiro.getUTCMonth()]}/${ano}` };
  });
}

export function proximasSemanas(n: number): Periodo {
  const a = semana(0);
  const b = semana(n - 1);
  return { id: `prox-${a.inicio}-${n}`, inicio: a.inicio, fim: b.fim, rotulo: n === 1 ? "esta semana" : `nas próximas ${n} semanas` };
}

export function useOcupacaoEquipe() {
  const membrosQ = useMembros();
  const membros = useMemo(() => agruparMembros(membrosQ.data ?? []), [membrosQ.data]);
  const ids = useMemo(() => membros.map((m) => m.pessoaId), [membros]);
  const global = useCargaGlobal(ids);

  const nomesProjeto = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of membrosQ.data ?? []) if (r.projeto_id) m.set(r.projeto_id, r.projeto_nome ?? "Projeto");
    return m;
  }, [membrosQ.data]);

  return {
    membros,
    carregando: membrosQ.isLoading || (ids.length > 0 && global.carregando),
    erro: membrosQ.error ?? global.erro,
    regras: global.regras,
    conflitos: global.conflitos,
    celula: global.celula as ((p: Periodo, pessoaId: string) => CelulaGlobal | undefined) | null,
    nomeProjeto: (id: string) => nomesProjeto.get(id) ?? "Outro projeto",
  };
}
