// agente: o agente de IA do Radar. Calcula as ações candidatas com o motor determinístico
// (_shared/agente/candidatos.ts), pede ao LLM (Gemini ou Claude) só a prioridade e a explicação (com
// pseudônimos), valida o texto contra os fatos e grava `sugestao` PENDENTE + notificação no
// sino. Nunca escreve no DevOps: quem aplica é o gestor, pelo devops-acoes (aprovar_sugestao).
//
// Rotas (deploy com --no-verify-jwt; autorização aqui):
//   POST .../agente/analyze/event { work_item_id }  ← trigger em `evento` (pg_net), só o projeto do item
//   POST .../agente/analyze/sweep                   ← pg_cron a cada 15 min, todos os projetos
//   POST .../agente { projeto_id? }                 ← botão "Analisar agora" (JWT do gestor)
// Segredo: header x-analytics-secret (Vault radar_analytics_secret) ou x-sync-secret.
//
// Idempotente: a chave da situação (hash_payload) não gera duas pendentes; ignorada não volta
// por 7 dias; pendente cuja situação sumiu vira 'expirada'. O LLM só é chamado para as novas.

import { errorMessage, log } from "../_shared/log.ts";
import { normalizarNome } from "../_shared/nomes.ts";
import { categoriaDe, TIPOS_FORA_DO_KANBAN } from "../_shared/kanban.ts";
import { horasPendentes } from "../_shared/capacidade/motor.ts";
import { montarCargaGlobal, regrasDeLinhas } from "../_shared/capacidade/montagem.ts";
import { avaliarPortfolio, type Impacto, type OrigemImpacto, type ProjetoPortfolio, projetosParecidos } from "../_shared/capacidade/portfolio.ts";
import { type Candidato, gerarCandidatos, type PessoaAgente, type TarefaAgente } from "../_shared/agente/candidatos.ts";
import { explicar, type Ferramenta, type SugestaoBase } from "../_shared/agente/explicacao.ts";
import { gerarCandidatosProcesso, type ItemFluxo } from "../_shared/agente/processo.ts";
import {
  despseudonimizar,
  explicacaoTemplate,
  FERRAMENTA,
  FERRAMENTA_EXPLICACAO,
  FERRAMENTA_IMPACTO,
  mensagemExplicacao,
  mensagemCandidatas,
  pseudonimos,
  SISTEMA,
  SISTEMA_EXPLICACAO,
  SISTEMA_IMPACTO,
  template,
  type TextoSugestao,
  validar,
  validarExplicacao,
  VERSAO_PROMPT,
} from "../_shared/agente/texto.ts";
import { asJson, corsHeaders, createDb, type Db, env, jsonResponse, verificarSegredo } from "../_lib/context.ts";
import { protegido } from "../_lib/seguranca.ts";
import { definirPessoasPII, pedirJSON, provedorLLM, ultimoErroLLM } from "../_lib/llm.ts";

const MAX_LLM = 12;
const DIA = 86_400_000;

async function autorizado(req: Request, db: Db): Promise<boolean> {
  if (await verificarSegredo(req.headers.get("x-analytics-secret"), "ANALYTICS_SHARED_SECRET")) return true;
  if (await verificarSegredo(req.headers.get("x-sync-secret"), "SYNC_SECRET")) return true;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await db.auth.getUser(token);
  return !error && !!data.user;
}

function rows<T>(r: { data: T[] | null; error: { message: string } | null }, onde: string): T[] {
  if (r.error) throw new Error(`${onde}: ${r.error.message}`);
  return r.data ?? [];
}

/** Hoje em São Paulo e o horizonte "próximas 2 semanas" (mesmo do front). */
function horizonte() {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const d = new Date(`${hoje}T00:00:00Z`);
  const seg = new Date(d.getTime() - ((d.getUTCDay() || 7) - 1) * DIA);
  const sexta = new Date(seg.getTime() + 11 * DIA);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const sexta4 = new Date(seg.getTime() + 25 * DIA);
  return {
    hoje,
    periodo: { id: `prox-${iso(seg)}-2`, inicio: iso(seg), fim: iso(sexta) },
    // portfólio olha um pouco mais longe: próximas 4 semanas
    periodo4: { id: `prox-${iso(seg)}-4`, inicio: iso(seg), fim: iso(sexta4) },
  };
}

interface SkillJson {
  tag?: string;
  confirmada?: boolean;
  rejeitada?: boolean;
  evidencias?: number;
}

async function carregar(db: Db) {
  const [projetos, membros, regraG, regraP, regraPr, aloc, sprints, caps, folgas, feriados, backlog, ausencias] = await Promise.all([
    db.from("v_projeto_resumo").select("id, nome, descricao, tags, n_membros, n_itens"),
    db.from("v_membros").select("pessoa_id, nome, unique_name, projeto_id, time_id, time_nome, skills, tags"),
    db.from("regra_capacidade").select("*").maybeSingle(),
    db.from("regra_capacidade_pessoa").select("pessoa_id, jornada_dia, foco"),
    db.from("regra_capacidade_projeto").select("projeto_id, limite_atencao, limite_sobrecarga"),
    db.from("alocacao_projeto").select("projeto_id, pessoa_id, horas_dia"),
    db.from("sprint").select("id, projeto_id, inicio, fim").is("deleted_at", null).not("inicio", "is", null),
    db.from("capacidade_sprint").select("sprint_id, pessoa_id, time_id, capacidade_dia"),
    db.from("dias_off").select("sprint_id, time_id, pessoa_id, inicio, fim"),
    db.from("feriado").select("data"),
    db
      .from("v_backlog")
      .select(
        "projeto_id, sprint_id, sprint_nome, sprint_inicio, sprint_fim, item_id, item_parent_id, item_tipo, item_estado, item_titulo, responsavel_id, horas_restantes, horas_estimadas, horas_concluidas, tags, feature_tags",
      ),
    db.from("ausencia").select("pessoa_id, inicio, fim"),
  ]);
  const [impDevops, avaliacoes] = await Promise.all([
    db.from("projeto").select("id, impacto_devops").is("deleted_at", null),
    db.from("projeto_avaliacao").select("projeto_id, impacto_gestor, impacto_ia"),
  ]);
  if (regraG.error) throw new Error(regraG.error.message);
  // LGPD: nomes e e-mails de todo mundo entram no dicionário de anonimização do LLM
  definirPessoasPII(
    [...new Map(rows(membros, "membros").filter((m) => m.pessoa_id).map((m) => [m.pessoa_id, { nome: normalizarNome(m.nome ?? ""), email: m.unique_name }])).values()].filter(
      (p) => p.nome,
    ),
  );
  return {
    projetos: rows(projetos, "projetos"),
    membros: rows(membros, "membros"),
    regras: regrasDeLinhas({ geral: regraG.data, pessoas: rows(regraP, "regras"), projetos: rows(regraPr, "regras"), alocacoes: rows(aloc, "alocações") }),
    carga: {
      sprints: rows(sprints, "sprints"),
      capacidades: rows(caps, "capacidade"),
      folgas: rows(folgas, "folgas"),
      feriados: rows(feriados, "feriados"),
      itens: rows(backlog, "backlog"),
      ausencias: rows(ausencias, "ausências"),
    },
    impactoDevops: new Map(rows(impDevops, "impacto").map((p) => [p.id, p.impacto_devops])),
    avaliacoes: rows(avaliacoes, "avaliações"),
  };
}

type Dados = ReturnType<typeof montarEntrada>;

/** Impacto do projeto: gestor > DevOps ("Impacto:" na descrição) > estimado pela IA. */
function impactoDe(id: string, brutos: Awaited<ReturnType<typeof carregar>>): { impacto: Impacto | null; origem: OrigemImpacto | null } {
  const a = brutos.avaliacoes.find((x) => x.projeto_id === id);
  if (a?.impacto_gestor) return { impacto: a.impacto_gestor as Impacto, origem: "gestor" };
  const d = brutos.impactoDevops.get(id);
  if (d) return { impacto: d as Impacto, origem: "devops" };
  if (a?.impacto_ia) return { impacto: a.impacto_ia as Impacto, origem: "ia" };
  return { impacto: null, origem: null };
}

function montarPortfolio(dados: Dados, brutos: Awaited<ReturnType<typeof carregar>>, periodo4: { id: string; inicio: string; fim: string }) {
  const projetos: ProjetoPortfolio[] = dados.projetos.map((p) => {
    const { impacto, origem } = impactoDe(p.id, brutos);
    return { id: p.id, nome: p.nome, descricao: p.descricao, tags: p.tags, impacto, impactoOrigem: origem };
  });
  let capacidadeTotal = 0;
  const horas = new Map<string, number>();
  const pessoas = new Map<string, number>();
  for (const pe of dados.pessoas) {
    const c = dados.celula(periodo4, pe.id);
    if (!c) continue;
    capacidadeTotal += c.capacidadeH;
    for (const x of c.porProjeto) {
      horas.set(x.projetoId, (horas.get(x.projetoId) ?? 0) + x.cargaH);
      if (x.cargaH > 0) pessoas.set(x.projetoId, (pessoas.get(x.projetoId) ?? 0) + 1);
    }
  }
  const abertas = new Map<string, number>();
  for (const t of dados.tarefas) abertas.set(t.projetoId, (abertas.get(t.projetoId) ?? 0) + (t.horas ?? 0));
  const catalogo = [...new Set([...dados.pessoas.flatMap((p) => [...p.skills.map((s) => s.tag), ...p.funcoes]), ...dados.projetos.flatMap((p) => p.tags)])];
  return {
    avaliacoes: avaliarPortfolio({
      projetos,
      esforco: (id) => ({ horasHorizonte: horas.get(id) ?? 0, pessoas: pessoas.get(id) ?? 0, horasAbertas: abertas.get(id) ?? 0 }),
      capacidadeTotalH: capacidadeTotal,
    }),
    parecidos: projetosParecidos(projetos, catalogo),
  };
}

function montarEntrada(d: Awaited<ReturnType<typeof carregar>>) {
  const pessoas = new Map<string, PessoaAgente>();
  const squads = new Map<string, { id: string; nome: string; projetoId: string; pessoaIds: string[] }>();
  for (const m of d.membros) {
    if (!m.pessoa_id) continue;
    const skills = ((m.skills as SkillJson[] | null) ?? [])
      .filter((s) => s.tag && !s.rejeitada)
      .map((s) => ({ tag: s.tag!, confirmada: s.confirmada ?? true, evidencias: s.evidencias ?? 0 }));
    const p = pessoas.get(m.pessoa_id) ?? {
      id: m.pessoa_id,
      nome: normalizarNome(m.nome ?? "Sem nome"),
      skills,
      funcoes: ((m.tags as { nome: string }[] | null) ?? []).map((t) => t.nome),
      projetos: [],
    };
    if (m.projeto_id && !p.projetos.includes(m.projeto_id)) p.projetos.push(m.projeto_id);
    pessoas.set(m.pessoa_id, p);
    if (m.time_id && m.projeto_id) {
      const s = squads.get(m.time_id) ?? { id: m.time_id, nome: m.time_nome ?? "Squad", projetoId: m.projeto_id, pessoaIds: [] };
      if (!s.pessoaIds.includes(m.pessoa_id)) s.pessoaIds.push(m.pessoa_id);
      squads.set(m.time_id, s);
    }
  }

  const pais = new Set(d.carga.itens.map((r) => r.item_parent_id).filter((x): x is number => x !== null));
  const tarefas: TarefaAgente[] = [];
  for (const r of d.carga.itens) {
    if (r.item_id === null || !r.projeto_id || TIPOS_FORA_DO_KANBAN.has(r.item_tipo ?? "") || pais.has(r.item_id)) continue;
    const cat = categoriaDe(r.item_tipo, r.item_estado);
    if (cat === "Completed" || cat === "Removed") continue;
    const semHoras = r.horas_restantes === null && r.horas_estimadas === null;
    tarefas.push({
      id: r.item_id,
      titulo: r.item_titulo ?? `#${r.item_id}`,
      projetoId: r.projeto_id,
      sprint: r.sprint_id && r.sprint_inicio && r.sprint_fim ? { id: r.sprint_id, nome: r.sprint_nome ?? "Sprint", inicio: r.sprint_inicio, fim: r.sprint_fim } : null,
      responsavelId: r.responsavel_id,
      horas: semHoras
        ? null
        : horasPendentes({ horasRestantes: r.horas_restantes, horasEstimadas: r.horas_estimadas, horasConcluidas: r.horas_concluidas }),
      tags: r.tags ?? [],
      featureTags: r.feature_tags ?? [],
      categoria: cat,
    });
  }

  const ids = [...pessoas.keys()];
  return {
    pessoas: [...pessoas.values()],
    squads: [...squads.values()],
    tarefas,
    projetos: d.projetos.map((p) => ({ id: p.id!, nome: p.nome ?? "", descricao: p.descricao, tags: p.tags ?? [], nMembros: p.n_membros ?? 0, nItens: p.n_itens ?? 0 })),
    celula: montarCargaGlobal(d.carga, d.regras, ids),
  };
}

type RespostaLLM = { id: number; prioridade: number; titulo: string; texto: string }[];

/** Pede ao LLM prioridade + texto; devolve por índice da candidata (null = usar template). */
async function redigirComLLM(cands: Candidato[], apelidos: Map<string, string>): Promise<Map<number, TextoSugestao> | null> {
  if (cands.length === 0) return null;
  const r = await pedirJSON<{ sugestoes?: RespostaLLM }>({
    sistema: SISTEMA,
    mensagem: mensagemCandidatas(cands, apelidos),
    ferramenta: { nome: FERRAMENTA.name, descricao: FERRAMENTA.description },
    esquema: FERRAMENTA.input_schema as unknown as Record<string, unknown>,
  });
  const uso = r?.sugestoes ?? [];
  if (uso.length === 0) return null;
  const out = new Map<number, TextoSugestao>();
  for (const x of uso) {
    if (!Number.isInteger(x.id) || !cands[x.id]) continue;
    out.set(x.id, { prioridade: ([1, 2, 3].includes(x.prioridade) ? x.prioridade : 2) as 1 | 2 | 3, titulo: String(x.titulo ?? ""), texto: String(x.texto ?? "") });
  }
  return out;
}

/**
 * Importância dos projetos que ninguém classificou (nem o gestor nem a linha "Impacto:" do
 * DevOps): a IA estima pela descrição e grava como SUGERIDA (projeto_avaliacao.impacto_ia),
 * uma vez por projeto. O gestor confirma ou troca na tela.
 */
async function estimarImpactos(db: Db, projetos: { id: string; nome: string; descricao: string | null; tags: string[] }[]) {
  const alvo = projetos.filter((p) => p.descricao || p.tags.length).slice(0, 15);
  if (alvo.length === 0) return 0;
  const r = await pedirJSON<{ projetos?: { id: number; impacto: number; justificativa: string }[] }>({
    sistema: SISTEMA_IMPACTO,
    mensagem: JSON.stringify(alvo.map((p, id) => ({ id, projeto: p.nome, descricao: p.descricao, tags: p.tags }))),
    ferramenta: { nome: FERRAMENTA_IMPACTO.name, descricao: FERRAMENTA_IMPACTO.description },
    esquema: FERRAMENTA_IMPACTO.input_schema as unknown as Record<string, unknown>,
  });
  let n = 0;
  for (const x of r?.projetos ?? []) {
    const p = alvo[x.id];
    if (!p || ![1, 2, 3].includes(x.impacto)) continue;
    const { error } = await db.from("projeto_avaliacao").upsert({
      projeto_id: p.id,
      impacto_ia: x.impacto,
      justificativa_ia: String(x.justificativa ?? "").slice(0, 300),
      ia_avaliado_em: new Date().toISOString(),
    });
    if (error) log("warn", "agente: gravar impacto falhou", { erro: error.message });
    else n++;
  }
  return n;
}

/** Tasks abertas (folhas) com as datas do DevOps: base do diagnóstico de tempo, gargalos e WIP. */
async function itensComDatas(db: Db, dados: Dados): Promise<ItemFluxo[]> {
  const datas = new Map(
    rows(await db.from("work_item").select("devops_id, fields").is("deleted_at", null), "datas").map((d) => [d.devops_id, (d.fields ?? {}) as Record<string, unknown>]),
  );
  return dados.tarefas.map((t) => {
    const f = datas.get(t.id) ?? {};
    return {
      id: t.id,
      titulo: t.titulo,
      projetoId: t.projetoId,
      categoria: t.categoria === "InProgress" || t.categoria === "Resolved" ? t.categoria : "Proposed",
      responsavelId: t.responsavelId,
      horas: t.horas ?? 0,
      criado: texto(f["System.CreatedDate"]),
      mudouEstado: texto(f["Microsoft.VSTS.Common.StateChangeDate"]),
    };
  });
}

const VERSAO_EXPLICACAO = "explica.v6";
/** O LLM às vezes se repete: fica com as 2 primeiras frases (já validadas). */
const duasFrases = (t: string) => (t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [t]).slice(0, 2).join("").trim() || t;
const texto = (v: unknown) => (typeof v === "string" && v ? v : null);

/** "Entender análise": visão micro da sugestão (ferramentas do motor + leitura da IA, validada). */
async function explicarSugestao(db: Db, sugestaoId: string): Promise<[unknown, number]> {
  const { data: s, error } = await db.from("sugestao").select("id, tipo, projeto_id, acao, payload, markdown").eq("id", sugestaoId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!s || !s.projeto_id) return [{ error: "sugestão não encontrada" }, 404];
  const p = (s.payload ?? {}) as { titulo?: string; fatos?: Record<string, string | number>; explicacao?: { versao?: string } };
  if (p.explicacao?.versao === VERSAO_EXPLICACAO) return [p.explicacao, 200];

  const { hoje, periodo4 } = horizonte();
  const brutos = await carregar(db);
  const dados = montarEntrada(brutos);
  const todos = await itensComDatas(db, dados);
  const acao = s.acao as { work_item_id: number; de_pessoa_id: string | null; para_pessoa_id: string } | null;
  // quem perde carga (rebalancear/ausência) ou quem está com WIP alto
  const pessoaFoco = acao?.de_pessoa_id ?? (p as { pessoas?: { de?: { id?: string } } }).pessoas?.de?.id ?? null;
  const pf = montarPortfolio(dados, brutos, periodo4);
  const nomeProj = new Map(dados.projetos.map((x) => [x.id, x.nome]));
  const ferramentas = explicar({
    hoje,
    sugestao: { tipo: s.tipo as SugestaoBase["tipo"], acao, fatos: p.fatos ?? {}, projetoId: s.projeto_id },
    itensProjeto: todos.filter((t) => t.projetoId === s.projeto_id),
    itensDe: pessoaFoco ? todos.filter((t) => t.responsavelId === pessoaFoco) : [],
    portfolio: pf.avaliacoes.map((x) => ({ id: x.projetoId, nome: nomeProj.get(x.projetoId) ?? "", fatia: x.fatia, horas: x.horasHorizonte, impacto: x.impacto })),
  });

  const base = explicacaoTemplate(ferramentas);
  const origem: Record<string, "ia" | "template"> = { resumo: "template" };
  for (const f of ferramentas) origem[f.tipo] = "template";
  let resumo = base.resumo;
  const leituras = { ...base.leituras };
  if (ferramentas.length) {
    const r = await pedirJSON<{ resumo?: string; leituras?: { ferramenta: string; texto: string }[] }>({
      sistema: SISTEMA_EXPLICACAO,
      mensagem: mensagemExplicacao({ tipo: s.tipo, fatos: p.fatos ?? {} }, ferramentas),
      ferramenta: { nome: FERRAMENTA_EXPLICACAO.name, descricao: FERRAMENTA_EXPLICACAO.description },
      esquema: FERRAMENTA_EXPLICACAO.input_schema as unknown as Record<string, unknown>,
    });
    const extras = p.fatos ?? {};
    if (r?.resumo && validarExplicacao(r.resumo, ferramentas, extras) === null) {
      resumo = duasFrases(r.resumo);
      origem.resumo = "ia";
    }
    for (const l of r?.leituras ?? []) {
      const tipo = l.ferramenta as Ferramenta["tipo"];
      if (!ferramentas.some((f) => f.tipo === tipo)) continue;
      const motivo = validarExplicacao(String(l.texto ?? ""), ferramentas, extras);
      if (motivo === null) {
        leituras[tipo] = duasFrases(l.texto);
        origem[tipo] = "ia";
      } else log("info", "explicação: leitura reprovada", { tipo, motivo });
    }
  }
  const resultado = {
    versao: VERSAO_EXPLICACAO,
    ferramentas,
    resumo,
    leituras,
    origem,
    ia: Object.values(origem).includes("ia") ? provedorLLM() : null,
    erro_ia: ultimoErroLLM(),
    gerado_em: new Date().toISOString(),
  };
  // guarda para não chamar a IA de novo; se a IA estava fora do ar, a próxima abertura tenta outra vez
  if (resultado.ia || !provedorLLM()) {
    const { error: e2 } = await db.from("sugestao").update({ payload: asJson({ ...p, explicacao: resultado }) }).eq("id", s.id);
    if (e2) log("warn", "explicação: não guardou no cache", { erro: e2.message });
  }
  return [resultado, 200];
}

async function analisar(db: Db, origem: "evento" | "sweep" | "manual", escopo: string[]) {
  const inicio = Date.now();
  const { hoje, periodo, periodo4 } = horizonte();
  let brutos = await carregar(db);
  const dados = montarEntrada(brutos);

  // Projeto sem importância definida (nem gestor nem DevOps) e ainda não estimado: a IA estima
  let impactosEstimados = 0;
  const semImpacto = dados.projetos.filter((p) => impactoDe(p.id, brutos).impacto === null);
  if (semImpacto.length && provedorLLM()) {
    impactosEstimados = await estimarImpactos(db, semImpacto);
    if (impactosEstimados) brutos = { ...brutos, avaliacoes: rows(await db.from("projeto_avaliacao").select("projeto_id, impacto_gestor, impacto_ia"), "avaliações") };
  }
  const portfolio = montarPortfolio(dados, brutos, periodo4);
  const candidatos = [
    ...gerarCandidatos({ hoje, periodo, ...dados, escopo, portfolio }),
    ...gerarCandidatosProcesso({ hoje, projetos: dados.projetos, itens: await itensComDatas(db, dados), escopo }),
  ];
  const nomePessoa = new Map(dados.pessoas.map((p) => [p.id, p.nome]));
  const nomeProjeto = new Map(dados.projetos.map((p) => [p.id, p.nome]));

  // O que já existe (pendente, ignorada há < 7 dias, aplicada há < 1 dia) não volta
  const desde = new Date(Date.now() - 7 * DIA).toISOString();
  const existentes = rows(
    await db.from("sugestao").select("id, hash_payload, status, decidida_em, projeto_id").not("hash_payload", "is", null).or(`status.eq.pendente,decidida_em.gte.${desde}`),
    "sugestões",
  );
  const bloqueadas = new Set(
    existentes
      .filter((s) => s.status === "pendente" || s.status === "ignorada" || (s.status === "aplicada" && s.decidida_em && s.decidida_em >= new Date(Date.now() - DIA).toISOString()))
      .map((s) => s.hash_payload),
  );
  const chavesAtuais = new Set(candidatos.map((c) => c.chave));

  // Pendente cuja situação não existe mais (task já atribuída, sobrecarga resolvida...) expira
  const expirar = existentes
    .filter((s) => s.status === "pendente" && !chavesAtuais.has(s.hash_payload!) && (escopo.length === 0 || (s.projeto_id && escopo.includes(s.projeto_id))))
    .map((s) => s.id);
  if (expirar.length) {
    const { error } = await db.from("sugestao").update({ status: "expirada", decidida_em: new Date().toISOString() }).in("id", expirar);
    if (error) throw new Error(`expirar: ${error.message}`);
  }

  const novas = candidatos.filter((c) => !bloqueadas.has(c.chave));
  const paraLLM = novas.slice(0, MAX_LLM);
  const apelidos = pseudonimos(paraLLM);
  const doLLM = await redigirComLLM(paraLLM, apelidos);

  let gravadas = 0;
  let viaLLM = 0;
  const notificar: { titulo: string; mensagem: string; gravidade: string; link: string; projeto_id: string }[] = [];
  for (const [i, c] of novas.entries()) {
    const nomePapel = (papel: string) => nomePessoa.get(c.papeis[papel] ?? "") ?? "alguém";
    const base = template(c, nomePapel);
    const llm = i < MAX_LLM ? doLLM?.get(i) : undefined;
    const motivo = llm ? validar(llm, c, apelidos) : "sem LLM";
    const usouLLM = !!llm && motivo === null;
    const nomeDe = (id: string) => nomePessoa.get(id) ?? "alguém";
    const texto: TextoSugestao = usouLLM
      ? { prioridade: llm!.prioridade, titulo: despseudonimizar(llm!.titulo, apelidos, nomeDe), texto: despseudonimizar(llm!.texto, apelidos, nomeDe) }
      : base;
    if (llm && motivo) log("info", "agente: texto do LLM reprovado, usando template", { chave: c.chave, motivo });

    const comNome = (u: { pessoaId: string }) => ({ ...u, nome: nomeDe(u.pessoaId) });
    const { error } = await db.from("sugestao").insert({
      tipo: c.tipo,
      projeto_id: c.projetoId,
      origem: origem === "manual" ? "sweep" : origem,
      status: "pendente",
      acao: c.acao ? asJson(c.acao) : null,
      markdown: texto.texto,
      justificativa: texto.texto,
      impacto_antes: asJson(c.antes.map(comNome)),
      impacto_depois: asJson(c.depois.map(comNome)),
      payload: asJson({
        titulo: texto.titulo,
        prioridade: texto.prioridade,
        gravidade: c.gravidade,
        projeto: nomeProjeto.get(c.projetoId) ?? null,
        fatos: c.fatos,
        pessoas: Object.fromEntries(Object.entries(c.papeis).map(([papel, id]) => [papel, { id, nome: nomeDe(id) }])),
        detalhe: c.detalhe,
        validacao: motivo,
        ia: usouLLM ? provedorLLM() : null,
      }),
      versao_prompt: VERSAO_PROMPT,
      hash_payload: c.chave,
      usou_fallback: !usouLLM,
    });
    if (error) {
      if (error.code === "23505") continue; // outra execução gravou a mesma situação
      throw new Error(`gravar sugestão: ${error.message}`);
    }
    gravadas++;
    if (usouLLM) viaLLM++;
    notificar.push({
      titulo: texto.titulo,
      mensagem: texto.texto,
      gravidade: c.gravidade === "critico" ? "critico" : "atencao",
      link: c.tipo === "equipe" ? `/projetos/${c.projetoId}/resumo` : `/analises?projeto=${c.projetoId}`,
      projeto_id: c.projetoId,
    });
  }
  if (notificar.length) {
    const { error } = await db.from("notificacao").insert(notificar.slice(0, 8).map((n) => ({ ...n, origem: "ia" })));
    if (error) log("warn", "agente: notificação falhou", { erro: error.message });
  }

  const resumo = { origem, escopo, candidatos: candidatos.length, novas: gravadas, via_llm: viaLLM, expiradas: expirar.length, ia: provedorLLM(), erro_ia: ultimoErroLLM(), impactos_estimados: impactosEstimados, ms: Date.now() - inicio };
  log("info", "agente: análise concluída", resumo);
  return resumo;
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const emSegundoPlano = (p: Promise<unknown>) => p.catch((err) => log("error", "agente falhou (segundo plano)", { erro: errorMessage(err) }));

Deno.serve(protegido("agente", ["admin", "gestor"], async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "use POST" }, 405);
  const db = createDb();
  if (!(await autorizado(req, db))) return jsonResponse({ error: "não autorizado" }, 401);

  const caminho = new URL(req.url).pathname;
  const body = (await req.json().catch(() => ({}))) as { work_item_id?: number; projeto_id?: string; acao?: string; sugestao_id?: string };
  try {
    if (body.acao === "explicar") {
      if (typeof body.sugestao_id !== "string") return jsonResponse({ error: "sugestao_id obrigatório" }, 400);
      return jsonResponse(...(await explicarSugestao(db, body.sugestao_id)));
    }
    if (caminho.endsWith("/analyze/event")) {
      const { data } = await db.from("work_item").select("projeto_id").eq("devops_id", Number(body.work_item_id)).maybeSingle();
      if (!data) return jsonResponse({ ok: true, ignorado: "item não encontrado" });
      // pg_net espera só 10 s: responde já e analisa em segundo plano (o LLM pode levar mais)
      EdgeRuntime.waitUntil(emSegundoPlano(analisar(db, "evento", [data.projeto_id])));
      return jsonResponse({ ok: true, aceito: true }, 202);
    }
    if (caminho.endsWith("/analyze/sweep")) {
      if (new URL(req.url).searchParams.get("esperar") === "1") return jsonResponse(await analisar(db, "sweep", []));
      EdgeRuntime.waitUntil(emSegundoPlano(analisar(db, "sweep", [])));
      return jsonResponse({ ok: true, aceito: true }, 202);
    }
    return jsonResponse(await analisar(db, "manual", typeof body.projeto_id === "string" ? [body.projeto_id] : []));
  } catch (err) {
    log("error", "agente falhou", { erro: errorMessage(err) });
    return jsonResponse({ error: errorMessage(err) }, 500);
  }
}));
