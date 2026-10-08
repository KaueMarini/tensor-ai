// "Precisa de você": transforma a ocupação geral (global.ts) e as tasks sem dono numa lista
// curta de pendências para o gestor, da mais grave para a menos grave, cada uma com uma frase
// pronta e o alvo da ação. Puro e determinístico: a tela só exibe.

import type { CelulaGlobal } from "./global.ts";

export type Gravidade = "critico" | "atencao";

export type ItemAtencao =
  | {
      tipo: "sobrecarga" | "sem-capacidade" | "limite";
      gravidade: Gravidade;
      pessoaId: string;
      titulo: string;
      detalhe: string;
      /** Projeto que mais pesa na carga da pessoa (onde agir primeiro). */
      projetoId: string | null;
      /** Para ordenar: horas acima da capacidade (ou % de uso no limite). */
      peso: number;
    }
  | {
      tipo: "sem-equipe";
      gravidade: Gravidade;
      titulo: string;
      detalhe: string;
      projetoId: string;
      peso: number;
    }
  | {
      tipo: "sem-dono";
      gravidade: Gravidade;
      titulo: string;
      detalhe: string;
      projetoId: string | null;
      peso: number;
    };

export interface SemDonoProjeto {
  projetoId: string;
  nome: string;
  tasks: number;
  horas: number;
}

const h = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")}h`;
const pct = (u: number | null) => (u === null ? "—" : `${Math.round(u * 100)}%`);

export function itensDeAtencao(entrada: {
  pessoas: { id: string; nome: string }[];
  celula: (pessoaId: string) => CelulaGlobal | undefined;
  nomeProjeto: (projetoId: string) => string;
  semDono: SemDonoProjeto[];
  /** Projetos novos sem ninguém alocado (ganham sugestão de squad/pessoas). */
  semEquipe?: { projetoId: string; nome: string }[];
  /** Ex.: "nas próximas 2 semanas" */
  periodo: string;
}): ItemAtencao[] {
  const { pessoas, celula, nomeProjeto, semDono, periodo, semEquipe = [] } = entrada;
  const out: ItemAtencao[] = [];

  for (const p of pessoas) {
    const c = celula(p.id);
    if (!c || c.status === "ok") continue;
    const principal = c.porProjeto[0];
    const onde = principal
      ? c.porProjeto.length > 1
        ? ` · maior parte em ${nomeProjeto(principal.projetoId)} (${h(principal.cargaH)})`
        : ` · tudo em ${nomeProjeto(principal.projetoId)}`
      : "";
    if (c.status === "sem-capacidade") {
      out.push({
        tipo: "sem-capacidade",
        gravidade: "critico",
        pessoaId: p.id,
        projetoId: principal?.projetoId ?? null,
        titulo: `${p.nome} tem ${h(c.cargaH)} de tasks, mas está ausente ${periodo}`,
        detalhe: `Férias, folga ou feriado zeraram a capacidade${onde}`,
        peso: c.cargaH + 1000,
      });
    } else if (c.status === "sobrecarga") {
      out.push({
        tipo: "sobrecarga",
        gravidade: "critico",
        pessoaId: p.id,
        projetoId: principal?.projetoId ?? null,
        titulo: `${p.nome} está a ${pct(c.utilizacao)} ${periodo}`,
        detalhe: `${h(-c.livreH)} acima da capacidade (${h(c.cargaH)} de ${h(c.capacidadeH)})${onde}`,
        peso: -c.livreH,
      });
    } else {
      out.push({
        tipo: "limite",
        gravidade: "atencao",
        pessoaId: p.id,
        projetoId: principal?.projetoId ?? null,
        titulo: `${p.nome} está no limite: ${pct(c.utilizacao)} ${periodo}`,
        detalhe: `Sobram ${h(Math.max(0, c.livreH))} · evite passar mais trabalho${onde}`,
        peso: c.utilizacao ?? 0,
      });
    }
  }

  const comTasks = semDono.filter((s) => s.tasks > 0);
  const total = comTasks.reduce((n, s) => n + s.tasks, 0);
  if (total > 0) {
    const horas = comTasks.reduce((n, s) => n + s.horas, 0);
    const lista = [...comTasks].sort((a, b) => b.tasks - a.tasks);
    out.push({
      tipo: "sem-dono",
      gravidade: "atencao",
      projetoId: lista.length === 1 ? lista[0]!.projetoId : null,
      titulo: `${total} ${total === 1 ? "task sem responsável" : "tasks sem responsável"} (${h(horas)})`,
      detalhe: `${lista.map((s) => `${s.nome} ${s.tasks}`).join(" · ")} · já existe sugestão de quem pode pegar`,
      peso: total,
    });
  }

  for (const p of semEquipe) {
    out.push({
      tipo: "sem-equipe",
      gravidade: "atencao",
      projetoId: p.projetoId,
      titulo: `Projeto novo sem equipe: ${p.nome}`,
      detalhe: "Pela descrição e pelas tags, já há um squad e pessoas com as skills certas e tempo livre para ele",
      peso: 0,
    });
  }

  const ordem = { "sem-capacidade": 0, sobrecarga: 1, "sem-equipe": 2, "sem-dono": 3, limite: 4 } as const;
  return out.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || b.peso - a.peso);
}
