import type { Candidato } from "./candidatos.ts";
import type { ItemTempo } from "./explicacao.ts";

export interface ItemFluxo extends ItemTempo {
  projetoId: string;
}

export const LIMITE_WIP = 3;
const DIA = 86_400_000;
const dias = (de: string | null, hoje: string) => (de ? Math.max(0, Math.floor((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(de)) / DIA)) : null);
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const ESTADO = { Proposed: "A fazer", InProgress: "Em andamento", Resolved: "Em revisão" } as const;

export function gerarCandidatosProcesso(e: {
  hoje: string;
  projetos: { id: string; nome: string }[];
  itens: ItemFluxo[];
  escopo?: string[];
  limiteWip?: number;
}): Candidato[] {
  const { hoje, limiteWip = LIMITE_WIP } = e;
  const noEscopo = (id: string) => !e.escopo?.length || e.escopo.includes(id);
  const out: Candidato[] = [];

  for (const p of e.projetos) {
    if (!noEscopo(p.id)) continue;
    const doProjeto = e.itens.filter((i) => i.projetoId === p.id && (i.mudouEstado || i.criado));
    if (doProjeto.length < 3) continue;
    const parado = (i: ItemFluxo) => dias(i.mudouEstado ?? i.criado, hoje) ?? 0;
    const med = mediana(doProjeto.map(parado));
    const limite = Math.max(7, 2 * med);
    const presos = doProjeto.filter((i) => parado(i) > limite).sort((a, b) => parado(b) - parado(a));
    if (presos.length === 0) continue;
    const porEstado = new Map<string, number>();
    for (const i of presos) porEstado.set(i.categoria, (porEstado.get(i.categoria) ?? 0) + 1);
    const [estadoTop] = [...porEstado].sort((a, b) => b[1] - a[1]);
    const totalDias = doProjeto.reduce((n, i) => n + parado(i), 0);
    const diasPresos = presos.reduce((n, i) => n + parado(i), 0);
    out.push({
      chave: `gargalo:${p.id}:${presos.map((i) => i.id).sort((a, b) => a - b).join(",")}`,
      tipo: "gargalo",
      gravidade: presos.length >= 3 ? "critico" : "atencao",
      projetoId: p.id,
      acao: null,
      papeis: {},
      fatos: {
        projeto: p.nome,
        parados: presos.length,
        abertos: doProjeto.length,
        mediana_parado_dias: Math.round(med * 10) / 10,
        limite_dias: Math.round(limite * 10) / 10,
        max_parado_dias: parado(presos[0]!),
        estado_gargalo: ESTADO[estadoTop![0] as keyof typeof ESTADO] ?? estadoTop![0],
        pct_dias_parados: totalDias > 0 ? Math.round((diasPresos / totalDias) * 100) : 0,
        task_mais_parada: `#${presos[0]!.id} ${presos[0]!.titulo}`,
      },
      antes: [],
      depois: [],
      detalhe: { presos: presos.map((i) => i.id) },
    });
  }

  const emAndamento = new Map<string, ItemFluxo[]>();
  for (const i of e.itens) {
    if (i.categoria !== "InProgress" || !i.responsavelId) continue;
    emAndamento.set(i.responsavelId, [...(emAndamento.get(i.responsavelId) ?? []), i]);
  }
  for (const [pessoa, lista] of emAndamento) {
    if (lista.length <= limiteWip) continue;
    const porProjeto = new Map<string, number>();
    for (const i of lista) porProjeto.set(i.projetoId, (porProjeto.get(i.projetoId) ?? 0) + 1);
    const [projTop] = [...porProjeto].sort((a, b) => b[1] - a[1]);
    if (!noEscopo(projTop![0])) continue;
    const maisVelha = [...lista].sort((a, b) => (dias(b.mudouEstado ?? b.criado, hoje) ?? 0) - (dias(a.mudouEstado ?? a.criado, hoje) ?? 0))[0]!;
    out.push({
      chave: `wip:${pessoa}:${lista.length}`,
      tipo: "wip",
      gravidade: "atencao",
      projetoId: projTop![0],
      acao: null,
      papeis: { de: pessoa },
      fatos: {
        em_andamento: lista.length,
        limite_wip: limiteWip,
        acima_do_limite: lista.length - limiteWip,
        horas_em_andamento: Math.round(lista.reduce((n, i) => n + i.horas, 0)),
        projetos: porProjeto.size,
        mais_antiga: `#${maisVelha.id} ${maisVelha.titulo}`,
        mais_antiga_dias: dias(maisVelha.mudouEstado ?? maisVelha.criado, hoje) ?? 0,
      },
      antes: [],
      depois: [],
      detalhe: { itens: lista.map((i) => i.id) },
    });
  }
  return out;
}
