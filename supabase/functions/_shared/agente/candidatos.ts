import type { CelulaGlobal } from "../capacidade/global.ts";
import type { StatusCarga } from "../capacidade/motor.ts";
import { type CandidatoAlocacao, recomendarAlocacao } from "../capacidade/recomendacao.ts";
import { type PessoaPerfil, type ProjetoPerfil, type SquadPerfil, sugerirEquipe } from "../capacidade/equipe-sugerida.ts";
import { type AvaliacaoProjeto, type ParParecido, ROTULO_IMPACTO } from "../capacidade/portfolio.ts";
import { type ConflitoAusencia, ROTULO_AUSENCIA } from "../capacidade/ausencias.ts";

const FONTE_IMPACTO = { gestor: "definido pelo gestor", devops: "da descrição no DevOps", ia: "estimado pela IA" } as const;

export interface Periodo {
  id: string;
  inicio: string;
  fim: string;
}

export interface PessoaAgente extends CandidatoAlocacao {
  nome: string;
  projetos: string[];
}

export interface TarefaAgente {
  id: number;
  titulo: string;
  projetoId: string;
  sprint: { id: string; nome: string; inicio: string; fim: string } | null;
  responsavelId: string | null;
  horas: number | null;
  tags: string[];
  featureTags: string[];
  categoria?: string;
}

export interface ProjetoAgente extends ProjetoPerfil {
  nMembros: number;
  nItens: number;
}

export type TipoSugestao = "atribuir" | "rebalancear" | "ausencia" | "equipe" | "portfolio" | "similares" | "gargalo" | "wip";
export type Gravidade = "critico" | "atencao" | "info";

export interface Uso {
  pessoaId: string;
  cargaH: number;
  capacidadeH: number;
  pct: number | null;
  status: StatusCarga;
}

export interface AcaoReatribuir {
  tipo: "reatribuir";
  work_item_id: number;
  de_pessoa_id: string | null;
  para_pessoa_id: string;
}

export interface AcaoLote {
  tipo: "reatribuir_lote";
  itens: Omit<AcaoReatribuir, "tipo">[];
}

export interface RotaAusencia {
  task_id: number;
  titulo: string;
  horas: number;
  sprint: string;
  sprint_id: string;
  projeto_id: string;
  pct_sprint_ausente: number;
  para_pessoa_id: string | null;
  fora_do_time?: boolean;
  para_antes_pct?: number;
  para_depois_pct?: number;
  para_livre_h?: number;
  skills?: string[];
  projeto_semelhante?: string | null;
  semelhanca_pct?: number;
}

export interface Candidato {
  chave: string;
  tipo: TipoSugestao;
  gravidade: Gravidade;
  projetoId: string;
  acao: AcaoReatribuir | AcaoLote | null;
  papeis: Record<string, string>;
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
  periodo: Periodo;
  pessoas: PessoaAgente[];
  projetos: ProjetoAgente[];
  tarefas: TarefaAgente[];
  squads: SquadPerfil[];
  celula: (p: Periodo, pessoaId: string) => CelulaGlobal | undefined;
  escopo?: string[];
  maxPorTipo?: number;
  portfolio?: { avaliacoes: AvaliacaoProjeto[]; parecidos: ParParecido[] };
  conflitos?: ConflitoAusencia[];
}): Candidato[] {
  const { periodo, celula, maxPorTipo = 5 } = e;
  const noEscopo = (projetoId: string) => !e.escopo?.length || e.escopo.includes(projetoId);
  const pessoas = new Map(e.pessoas.map((p) => [p.id, p]));
  const projetos = new Map(e.projetos.map((p) => [p.id, p]));
  const periodoDa = (t: TarefaAgente): Periodo => (t.sprint ? { id: t.sprint.id, inicio: t.sprint.inicio, fim: t.sprint.fim } : periodo);
  const vigente = (t: TarefaAgente) => !t.sprint || t.sprint.fim >= e.hoje;
  const doProjeto = (projetoId: string, exceto?: string) => e.pessoas.filter((p) => p.projetos.includes(projetoId) && p.id !== exceto);
  const out: Candidato[] = [];

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

  const pessoasRisco = e.pessoas
    .map((p) => ({ p, c: celula(periodo, p.id) }))
    .filter((x): x is { p: PessoaAgente; c: CelulaGlobal } => !!x.c && x.c.status === "sobrecarga")
    .sort((a, b) => b.c.cargaH - b.c.capacidadeH - (a.c.cargaH - a.c.capacidadeH));
  const contagem = { rebalancear: 0 };
  for (const { p, c } of pessoasRisco) {
    const tipo = "rebalancear" as const;
    if (contagem[tipo] >= maxPorTipo) continue;
    const minhas = e.tarefas.filter(
      (t) => t.responsavelId === p.id && (t.horas ?? 0) > 0 && noEscopo(t.projetoId) && (!t.sprint || sobrepoe(t.sprint, periodo)) && vigente(t),
    );
    if (minhas.length === 0) continue;
    const excesso = c.cargaH - c.capacidadeH * c.limites.sobrecarga;
    const ordenadas = [
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
      break;
    }
  }

  const parecidosDe = new Map<string, { outro: string; s: number }[]>();
  for (const par of e.portfolio?.parecidos ?? []) {
    parecidosDe.set(par.a, [...(parecidosDe.get(par.a) ?? []), { outro: par.b, s: par.similaridade }]);
    parecidosDe.set(par.b, [...(parecidosDe.get(par.b) ?? []), { outro: par.a, s: par.similaridade }]);
  }
  const experienciaParecida = (pessoa: PessoaAgente, projetoId: string) => {
    let melhor: { projetoId: string; s: number } | null = null;
    for (const x of parecidosDe.get(projetoId) ?? [])
      if (pessoa.projetos.includes(x.outro) && (!melhor || x.s > melhor.s)) melhor = { projetoId: x.outro, s: x.s };
    return melhor;
  };
  const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

  let nAus = 0;
  for (const conf of e.conflitos ?? []) {
    if (nAus >= maxPorTipo) break;
    const de = pessoas.get(conf.pessoaId);
    if (!de) continue;
    const doEscopo = conf.tarefas.filter((tr) => noEscopo(tr.projetoId));
    if (doEscopo.length === 0) continue;

    const extra = new Map<string, number>();
    const comExtra = (per: Periodo, pid: string): CelulaGlobal | undefined => {
      const c = celula(per, pid);
      const add = extra.get(`${per.id}:${pid}`) ?? 0;
      if (!c || add === 0) return c;
      const carga = c.cargaH + add;
      return {
        ...c,
        cargaH: carga,
        livreH: c.capacidadeH - carga,
        utilizacao: c.capacidadeH > 0 ? carga / c.capacidadeH : null,
        status: c.capacidadeH <= 0 ? "sem-capacidade" : statusPorPct(carga / c.capacidadeH, c.limites),
      };
    };

    const rotas: RotaAusencia[] = [];
    const destinos = new Map<string, { per: Periodo; h: number }[]>();
    for (const tr of doEscopo) {
      const t = e.tarefas.find((x) => x.id === tr.id);
      if (!t || !t.sprint) continue;
      const per: Periodo = { id: t.sprint.id, inicio: t.sprint.inicio, fim: t.sprint.fim };
      const janela: Periodo = {
        id: `aus-${conf.inicio}-${t.sprint.id}`,
        inicio: conf.inicio > t.sprint.inicio ? conf.inicio : t.sprint.inicio,
        fim: conf.fim < t.sprint.fim ? conf.fim : t.sprint.fim,
      };
      const livreNaJanela = (p: PessoaAgente) => (celula(janela, p.id)?.capacidadeH ?? 0) > 0;
      const ranquear = (lista: PessoaAgente[]) => {
        if (lista.length === 0) return [];
        const [rec] = recomendarAlocacao({
          tasks: [{ id: t.id, sprintId: per.id, tags: t.tags, featureTags: t.featureTags, horas: t.horas }],
          candidatos: lista,
          celula: (_s, pid) => comExtra(per, pid),
          sprintPadrao: per.id,
          maxOpcoes: lista.length,
        });
        return (rec?.opcoes ?? [])
          .filter((op) => ACEITAVEL.has(op.statusDepois))
          .map((op) => {
            const exp = experienciaParecida(pessoas.get(op.pessoaId)!, t.projetoId);
            return { op, exp, nota: op.score + (exp ? 0.25 * exp.s : 0) };
          })
          .sort((a, b) => b.nota - a.nota);
      };
      const base = { task_id: t.id, titulo: t.titulo, horas: tr.horas, sprint: t.sprint.nome, sprint_id: t.sprint.id, projeto_id: t.projetoId, pct_sprint_ausente: tr.pctSprintAusente };
      let [melhor] = ranquear(doProjeto(t.projetoId, de.id).filter(livreNaJanela));
      let fora = false;
      if (!melhor) {
        [melhor] = ranquear(e.pessoas.filter((p) => p.id !== de.id && !p.projetos.includes(t.projetoId) && experienciaParecida(p, t.projetoId) && livreNaJanela(p)));
        fora = !!melhor;
        if (melhor && !melhor.exp) melhor = undefined;
      }
      if (!melhor) {
        rotas.push({ ...base, para_pessoa_id: null });
        continue;
      }
      const cPara = comExtra(per, melhor.op.pessoaId)!;
      rotas.push({
        ...base,
        para_pessoa_id: melhor.op.pessoaId,
        fora_do_time: fora,
        para_antes_pct: pctDe(cPara.cargaH, cPara.capacidadeH) ?? 0,
        para_depois_pct: pctDe(cPara.cargaH + tr.horas, cPara.capacidadeH) ?? 0,
        para_livre_h: r1(Math.max(0, cPara.livreH)),
        skills: melhor.op.matches.map((m) => m.tag),
        projeto_semelhante: melhor.exp ? (projetos.get(melhor.exp.projetoId)?.nome ?? null) : null,
        semelhanca_pct: melhor.exp ? Math.round(melhor.exp.s * 100) : 0,
      });
      const k = `${per.id}:${melhor.op.pessoaId}`;
      extra.set(k, (extra.get(k) ?? 0) + tr.horas);
      destinos.set(melhor.op.pessoaId, [...(destinos.get(melhor.op.pessoaId) ?? []), { per, h: tr.horas }]);
    }
    if (rotas.length === 0) continue;

    const roteaveis = rotas.filter((r) => r.para_pessoa_id && !r.fora_do_time);
    const horasTotal = r1(rotas.reduce((n, r) => n + r.horas, 0));
    const papeis: Record<string, string> = { de: de.id };
    [...destinos.keys()].forEach((pid, i) => (papeis[`para${i + 1}`] = pid));
    const projetosConf = [...new Set(rotas.map((r) => r.projeto_id))];
    const sprintsConf = [...new Set(rotas.map((r) => `${r.sprint} (${r.pct_sprint_ausente}% da sprint)`))];
    const perDe = (() => {
      const r = rotas[0]!;
      const t = e.tarefas.find((x) => x.id === r.task_id)!;
      return { id: t.sprint!.id, inicio: t.sprint!.inicio, fim: t.sprint!.fim };
    })();
    const cDe = celula(perDe, de.id);
    const usoDestino = (pid: string, comTasks: boolean) => {
      const lista = destinos.get(pid)!;
      const c = celula(lista[0]!.per, pid)!;
      return uso(pid, c, comTasks ? lista.filter((x) => x.per.id === lista[0]!.per.id).reduce((n, x) => n + x.h, 0) : 0);
    };

    out.push({
      chave: `ausencia-lote:${de.id}:${conf.inicio}:${rotas.map((r) => `${r.task_id}>${r.para_pessoa_id ?? "-"}`).join(",")}`,
      tipo: "ausencia",
      gravidade: conf.gravidade,
      projetoId: projetosConf.length === 1 ? projetosConf[0]! : rotas[0]!.projeto_id,
      acao: roteaveis.length
        ? { tipo: "reatribuir_lote", itens: roteaveis.map((r) => ({ work_item_id: r.task_id, de_pessoa_id: de.id, para_pessoa_id: r.para_pessoa_id! })) }
        : null,
      papeis,
      fatos: {
        tipo_ausencia: ROTULO_AUSENCIA[conf.tipo] ?? "ausência",
        periodo: `${fmt(conf.inicio)} a ${fmt(conf.fim)}`,
        dias_ausente: conf.diasUteis,
        n_tasks: rotas.length,
        horas_total: horasTotal,
        sprints: sprintsConf.join(", "),
        projetos: projetosConf.map((id) => projetos.get(id)?.nome ?? "").join(", "),
        n_roteaveis: roteaveis.length,
        n_destinos: destinos.size,
        n_sem_destino: rotas.filter((r) => !r.para_pessoa_id).length,
        n_fora_do_time: rotas.filter((r) => r.fora_do_time).length,
      },
      antes: [...(cDe ? [uso(de.id, cDe)] : []), ...[...destinos.keys()].map((pid) => usoDestino(pid, false))],
      depois: [...(cDe ? [uso(de.id, cDe, -roteaveis.filter((r) => r.sprint_id === perDe.id).reduce((n, r) => n + r.horas, 0))] : []), ...[...destinos.keys()].map((pid) => usoDestino(pid, true))],
      detalhe: { rotas, ausencia: { inicio: conf.inicio, fim: conf.fim, origem: conf.origem } },
    });
    nAus++;
  }

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

  for (const a of e.portfolio?.avaliacoes ?? []) {
    if (!noEscopo(a.projetoId) || a.impacto === null) continue;
    if (a.leitura !== "esforco-alto-impacto-baixo" && a.leitura !== "impacto-alto-pouco-esforco") continue;
    out.push({
      chave: `portfolio:${a.projetoId}:${a.leitura}:${a.impacto}`,
      tipo: "portfolio",
      gravidade: "atencao",
      projetoId: a.projetoId,
      acao: null,
      papeis: {},
      fatos: {
        projeto: projetos.get(a.projetoId)?.nome ?? "",
        leitura: a.leitura,
        impacto: ROTULO_IMPACTO[a.impacto],
        impacto_fonte: a.impactoOrigem ? FONTE_IMPACTO[a.impactoOrigem] : "",
        pct_equipe: Math.round(a.fatia * 100),
        media_pct: Math.round(a.fatiaMedia * 100),
        horas_4sem: Math.round(a.horasHorizonte),
        horas_abertas: Math.round(a.horasAbertas),
        pessoas: a.pessoas,
        rank_esforco: a.rankEsforco,
      },
      antes: [],
      depois: [],
      detalhe: { avaliacao: a },
    });
  }

  for (const par of (e.portfolio?.parecidos ?? []).slice(0, maxPorTipo)) {
    if (!noEscopo(par.a) && !noEscopo(par.b)) continue;
    out.push({
      chave: `similares:${par.a}:${par.b}`,
      tipo: "similares",
      gravidade: "info",
      projetoId: par.a,
      acao: null,
      papeis: {},
      fatos: {
        projeto_a: projetos.get(par.a)?.nome ?? "",
        projeto_b: projetos.get(par.b)?.nome ?? "",
        parecido_pct: Math.round(par.similaridade * 100),
        descricao_pct: Math.round(par.porDescricao * 100),
        em_comum: par.emComum.join(", ") || "nenhuma tag",
        palavras_em_comum: par.palavras.join(", ") || "nenhuma",
      },
      antes: [],
      depois: [],
      detalhe: { par },
    });
  }

  return out;
}
