// Agente, parte determinística: a partir da ocupação geral (motor global), das tasks e dos
// projetos, monta as AÇÕES CANDIDATAS com todos os números já calculados. O LLM depois só
// prioriza e explica (CLAUDE.md §5: números vêm do motor). Puro e testado.
//
// Tipos de sugestão:
//   atribuir    task aberta sem responsável → quem tem skill e folga (recomendarAlocacao)
//   rebalancear pessoa acima da capacidade  → passar UMA task dela para quem tem folga
//   ausencia    pessoa ausente com tasks    → passar a maior task para quem está disponível
//   equipe      projeto novo sem pessoas    → squad parecido / montagem (equipe-sugerida)

import type { CelulaGlobal } from "../capacidade/global.ts";
import type { StatusCarga } from "../capacidade/motor.ts";
import { type CandidatoAlocacao, recomendarAlocacao } from "../capacidade/recomendacao.ts";
import { type PessoaPerfil, type ProjetoPerfil, type SquadPerfil, sugerirEquipe } from "../capacidade/equipe-sugerida.ts";

export interface Periodo {
  id: string;
  inicio: string;
  fim: string;
}

export interface PessoaAgente extends CandidatoAlocacao {
  nome: string;
  /** Projetos em que a pessoa está num time ativo (só esses podem receber task do projeto). */
  projetos: string[];
}

export interface TarefaAgente {
  id: number;
  titulo: string;
  projetoId: string;
  sprint: { id: string; nome: string; inicio: string; fim: string } | null;
  responsavelId: string | null;
  /** Horas pendentes; null = sem estimativa. */
  horas: number | null;
  tags: string[];
  featureTags: string[];
}

export interface ProjetoAgente extends ProjetoPerfil {
  nMembros: number;
  nItens: number;
}

export type TipoSugestao = "atribuir" | "rebalancear" | "ausencia" | "equipe";
export type Gravidade = "critico" | "atencao" | "info";

export interface Uso {
  pessoaId: string;
  cargaH: number;
  capacidadeH: number;
  /** % inteiro (190 = 190%); null sem capacidade. */
  pct: number | null;
  status: StatusCarga;
}

export interface Candidato {
  /** Chave de idempotência: a mesma situação não vira duas sugestões. */
  chave: string;
  tipo: TipoSugestao;
  gravidade: Gravidade;
  projetoId: string;
  acao: { tipo: "reatribuir"; work_item_id: number; de_pessoa_id: string | null; para_pessoa_id: string } | null;
  /** Papéis → pessoa (o LLM vê só pseudônimos dos papéis). */
  papeis: Record<string, string>;
  /** Fatos numéricos e textuais; o texto só pode citar números daqui. */
  fatos: Record<string, string | number>;
  antes: Uso[];
  depois: Uso[];
  detalhe: Record<string, unknown>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pctDe = (carga: number, cap: number) => (cap > 0 ? Math.round((carga / cap) * 100) : null);
const uso = (pessoaId: string, c: CelulaGlobal, deltaH = 0): Uso => {
  const carga = r1(Math.max(0, c.cargaH + deltaH));
  return {
    pessoaId,
    cargaH: carga,
    capacidadeH: c.capacidadeH,
    pct: pctDe(carga, c.capacidadeH),
    status: c.capacidadeH <= 0 ? (carga > 0 ? "sem-capacidade" : "ok") : statusPorPct(carga / c.capacidadeH, c.limites),
  };
};
function statusPorPct(u: number, l: { atencao: number; sobrecarga: number }): StatusCarga {
  const x = Math.round(u * 1e6) / 1e6;
  return x > l.sobrecarga ? "sobrecarga" : x > l.atencao ? "limite" : "ok";
}

const ACEITAVEL = new Set<StatusCarga>(["ok", "limite"]);
const sobrepoe = (s: { inicio: string; fim: string }, p: Periodo) => s.inicio <= p.fim && s.fim >= p.inicio;

export function gerarCandidatos(e: {
  hoje: string;
  /** Horizonte das sugestões de carga (ex.: próximas 2 semanas). */
  periodo: Periodo;
  pessoas: PessoaAgente[];
  projetos: ProjetoAgente[];
  tarefas: TarefaAgente[];
  squads: SquadPerfil[];
  celula: (p: Periodo, pessoaId: string) => CelulaGlobal | undefined;
  /** Projetos analisados (evento de um item = só o projeto dele). Vazio = todos. */
  escopo?: string[];
  maxPorTipo?: number;
}): Candidato[] {
  const { periodo, celula, maxPorTipo = 5 } = e;
  const noEscopo = (projetoId: string) => !e.escopo?.length || e.escopo.includes(projetoId);
  const pessoas = new Map(e.pessoas.map((p) => [p.id, p]));
  const projetos = new Map(e.projetos.map((p) => [p.id, p]));
  const periodoDa = (t: TarefaAgente): Periodo => (t.sprint ? { id: t.sprint.id, inicio: t.sprint.inicio, fim: t.sprint.fim } : periodo);
  const vigente = (t: TarefaAgente) => !t.sprint || t.sprint.fim >= e.hoje;
  const doProjeto = (projetoId: string, exceto?: string) => e.pessoas.filter((p) => p.projetos.includes(projetoId) && p.id !== exceto);
  const out: Candidato[] = [];

  /** Melhor destino para uma task (skills + folga na sprint dela), só se não estourar ninguém. */
  function destino(t: TarefaAgente, exceto?: string) {
    const per = periodoDa(t);
    const candidatos = doProjeto(t.projetoId, exceto);
    if (candidatos.length === 0) return null;
    const [rec] = recomendarAlocacao({
      tasks: [{ id: t.id, sprintId: per.id, tags: t.tags, featureTags: t.featureTags, horas: t.horas }],
      candidatos,
      celula: (_s, pid) => celula(per, pid),
      sprintPadrao: per.id,
      maxOpcoes: 1,
    });
    const op = rec?.opcoes[0];
    if (!op || !ACEITAVEL.has(op.statusDepois)) return null;
    return { op, per };
  }

  // 1. Tasks sem dono
  const semDono = e.tarefas
    .filter((t) => !t.responsavelId && vigente(t) && noEscopo(t.projetoId))
    .sort((a, b) => (a.sprint?.inicio ?? "9999").localeCompare(b.sprint?.inicio ?? "9999") || (b.horas ?? 0) - (a.horas ?? 0))
    .slice(0, maxPorTipo * 2);
  let n = 0;
  for (const t of semDono) {
    if (n >= maxPorTipo) break;
    const d = destino(t);
    if (!d) continue;
    const para = pessoas.get(d.op.pessoaId)!;
    const cPara = celula(d.per, para.id)!;
    const h = t.horas ?? 0;
    out.push({
      chave: `atribuir:${t.id}:-:${para.id}`,
      tipo: "atribuir",
      gravidade: "atencao",
      projetoId: t.projetoId,
      acao: { tipo: "reatribuir", work_item_id: t.id, de_pessoa_id: null, para_pessoa_id: para.id },
      papeis: { para: para.id },
      fatos: {
        task_id: t.id,
        task: t.titulo,
        horas: h,
        sprint: t.sprint?.nome ?? "sem sprint",
        projeto: projetos.get(t.projetoId)?.nome ?? "",
        para_antes_pct: pctDe(cPara.cargaH, cPara.capacidadeH) ?? 0,
        para_depois_pct: pctDe(cPara.cargaH + h, cPara.capacidadeH) ?? 0,
        encaixe_pct: d.op.encaixe === null ? -1 : Math.round(d.op.encaixe * 100),
        skills: d.op.matches.map((m) => m.tag).join(", "),
        sem_estimativa: t.horas === null ? "sim" : "não",
      },
      antes: [uso(para.id, cPara)],
      depois: [uso(para.id, cPara, h)],
      detalhe: { matches: d.op.matches, sprintId: t.sprint?.id ?? null },
    });
    n++;
  }

  // 2 e 3. Sobrecarga e ausência no horizonte: tirar UMA task da pessoa
  const pessoasRisco = e.pessoas
    .map((p) => ({ p, c: celula(periodo, p.id) }))
    .filter((x): x is { p: PessoaAgente; c: CelulaGlobal } => !!x.c && (x.c.status === "sobrecarga" || x.c.status === "sem-capacidade"))
    .sort((a, b) => b.c.cargaH - b.c.capacidadeH - (a.c.cargaH - a.c.capacidadeH));
  const contagem = { rebalancear: 0, ausencia: 0 };
  for (const { p, c } of pessoasRisco) {
    const tipo = c.status === "sem-capacidade" ? "ausencia" : "rebalancear";
    if (contagem[tipo] >= maxPorTipo) continue;
    const minhas = e.tarefas.filter(
      (t) => t.responsavelId === p.id && (t.horas ?? 0) > 0 && noEscopo(t.projetoId) && (!t.sprint || sobrepoe(t.sprint, periodo)) && vigente(t),
    );
    if (minhas.length === 0) continue;
    const excesso = c.cargaH - c.capacidadeH * c.limites.sobrecarga;
    // ausência: a maior primeiro; sobrecarga: a menor que resolve, senão a maior
    const ordenadas =
      tipo === "ausencia"
        ? [...minhas].sort((a, b) => (b.horas ?? 0) - (a.horas ?? 0))
        : [
            ...minhas.filter((t) => (t.horas ?? 0) >= excesso).sort((a, b) => (a.horas ?? 0) - (b.horas ?? 0)),
            ...minhas.filter((t) => (t.horas ?? 0) < excesso).sort((a, b) => (b.horas ?? 0) - (a.horas ?? 0)),
          ];
    for (const t of ordenadas) {
      const d = destino(t, p.id);
      if (!d) continue;
      const para = pessoas.get(d.op.pessoaId)!;
      const h = t.horas ?? 0;
      const cDe = celula(d.per, p.id)!;
      const cPara = celula(d.per, para.id)!;
      out.push({
        chave: `${tipo}:${t.id}:${p.id}:${para.id}`,
        tipo,
        gravidade: "critico",
        projetoId: t.projetoId,
        acao: { tipo: "reatribuir", work_item_id: t.id, de_pessoa_id: p.id, para_pessoa_id: para.id },
        papeis: { de: p.id, para: para.id },
        fatos: {
          task_id: t.id,
          task: t.titulo,
          horas: h,
          sprint: t.sprint?.nome ?? "sem sprint",
          projeto: projetos.get(t.projetoId)?.nome ?? "",
          de_pct_horizonte: pctDe(c.cargaH, c.capacidadeH) ?? 0,
          de_acima_h: r1(Math.max(0, c.cargaH - c.capacidadeH)),
          de_carga_h: c.cargaH,
          de_capacidade_h: c.capacidadeH,
          de_antes_pct: pctDe(cDe.cargaH, cDe.capacidadeH) ?? 0,
          de_depois_pct: pctDe(cDe.cargaH - h, cDe.capacidadeH) ?? 0,
          para_antes_pct: pctDe(cPara.cargaH, cPara.capacidadeH) ?? 0,
          para_depois_pct: pctDe(cPara.cargaH + h, cPara.capacidadeH) ?? 0,
          encaixe_pct: d.op.encaixe === null ? -1 : Math.round(d.op.encaixe * 100),
          skills: d.op.matches.map((m) => m.tag).join(", "),
        },
        antes: [uso(p.id, cDe), uso(para.id, cPara)],
        depois: [uso(p.id, cDe, -h), uso(para.id, cPara, h)],
        detalhe: { matches: d.op.matches, sprintId: t.sprint?.id ?? null },
      });
      contagem[tipo]++;
      break; // uma por pessoa por rodada: depois de aplicar, a próxima análise reavalia
    }
  }

  // 4. Projeto novo sem equipe
  for (const pr of e.projetos) {
    if (!noEscopo(pr.id)) continue;
    const semEquipe = pr.nMembros === 0 || (pr.nMembros === 1 && pr.nItens === 0);
    if (!semEquipe) continue;
    const r = sugerirEquipe({
      alvo: pr,
      projetos: e.projetos.filter((x) => x.id !== pr.id),
      pessoas: e.pessoas.map((p): PessoaPerfil => {
        const c = celula(periodo, p.id);
        return { id: p.id, skills: p.skills, funcoes: p.funcoes, capacidadeH: c?.capacidadeH ?? 0, livreH: c?.livreH ?? 0, status: c?.status ?? "ok" };
      }),
      squads: e.squads,
      jaNoProjeto: e.pessoas.filter((p) => p.projetos.includes(pr.id)).map((p) => p.id),
    });
    if (r.termos.length === 0 || (r.montagem.pessoaIds.length === 0 && r.squads.length === 0)) continue;
    const squad = r.squads[0];
    const papeis: Record<string, string> = {};
    r.montagem.pessoaIds.forEach((id, i) => (papeis[`m${i + 1}`] = id));
    out.push({
      chave: `equipe:${pr.id}:${[...r.montagem.pessoaIds].sort().join(",")}`,
      tipo: "equipe",
      gravidade: "atencao",
      projetoId: pr.id,
      acao: null,
      papeis,
      fatos: {
        projeto: pr.nome,
        necessidades: r.termos.map((t) => t.termo).join(", "),
        total_necessidades: r.termos.length,
        montagem_cobre: r.montagem.cobertos.length,
        montagem_pessoas: r.montagem.pessoaIds.length,
        montagem_livre_h: r.montagem.livreH,
        faltando: r.montagem.faltando.join(", ") || "nada",
        squad: squad?.nome ?? "nenhum",
        squad_projeto: squad ? (projetos.get(squad.projetoId)?.nome ?? "") : "",
        squad_cobre_pct: squad ? Math.round(squad.cobertura * 100) : 0,
        squad_parecido_pct: squad ? Math.round(squad.similaridade * 100) : 0,
        squad_livre_h: squad?.livreH ?? 0,
        sem_ninguem: r.semNinguem.join(", ") || "nenhuma",
      },
      antes: [],
      depois: [],
      detalhe: { montagem: r.montagem, squad: squad ?? null, termos: r.termos.map((t) => t.termo) },
    });
  }

  return out;
}
