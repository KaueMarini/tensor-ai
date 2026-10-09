// agente: o agente de IA do Radar. Calcula as ações candidatas com o motor determinístico
// (_shared/agente/candidatos.ts), pede ao Claude só a prioridade e a explicação (com
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
import { type Candidato, gerarCandidatos, type PessoaAgente, type TarefaAgente } from "../_shared/agente/candidatos.ts";
import {
  despseudonimizar,
  FERRAMENTA,
  mensagemCandidatas,
  pseudonimos,
  SISTEMA,
  template,
  type TextoSugestao,
  validar,
  VERSAO_PROMPT,
} from "../_shared/agente/texto.ts";
import { asJson, corsHeaders, createDb, type Db, env, jsonResponse, safeEqual } from "../_lib/context.ts";

const MAX_LLM = 12;
const DIA = 86_400_000;

async function autorizado(req: Request, db: Db): Promise<boolean> {
  const segredos = [
    [req.headers.get("x-analytics-secret"), env("ANALYTICS_SHARED_SECRET", false)],
    [req.headers.get("x-sync-secret"), env("SYNC_SECRET", false)],
  ];
  if (segredos.some(([dado, esperado]) => dado && esperado && safeEqual(dado, esperado))) return true;
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
  return { hoje, periodo: { id: `prox-${iso(seg)}-2`, inicio: iso(seg), fim: iso(sexta) } };
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
    db.from("v_membros").select("pessoa_id, nome, projeto_id, time_id, time_nome, skills, tags"),
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
  if (regraG.error) throw new Error(regraG.error.message);
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

/** Pede ao Claude prioridade + texto; devolve por índice da candidata (null = usar template). */
async function redigirComLLM(cands: Candidato[], apelidos: Map<string, string>): Promise<Map<number, TextoSugestao> | null> {
  const chave = env("ANTHROPIC_API_KEY", false);
  if (!chave || cands.length === 0) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env("LLM_MODEL", false) || "claude-sonnet-5-5",
        max_tokens: 3000,
        system: SISTEMA,
        tools: [FERRAMENTA],
        tool_choice: { type: "tool", name: FERRAMENTA.name },
        messages: [{ role: "user", content: mensagemCandidatas(cands, apelidos) }],
      }),
    });
    if (!res.ok) {
      log("warn", "agente: LLM recusou", { status: res.status, corpo: (await res.text()).slice(0, 300) });
      return null;
    }
    const json = (await res.json()) as { content?: { type: string; input?: { sugestoes?: { id: number; prioridade: number; titulo: string; texto: string }[] } }[] };
    const uso = json.content?.find((c) => c.type === "tool_use")?.input?.sugestoes ?? [];
    const out = new Map<number, TextoSugestao>();
    for (const s of uso) {
      if (!Number.isInteger(s.id) || !cands[s.id]) continue;
      out.set(s.id, { prioridade: ([1, 2, 3].includes(s.prioridade) ? s.prioridade : 2) as 1 | 2 | 3, titulo: String(s.titulo ?? ""), texto: String(s.texto ?? "") });
    }
    return out;
  } catch (err) {
    log("warn", "agente: LLM falhou", { erro: errorMessage(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function analisar(db: Db, origem: "evento" | "sweep" | "manual", escopo: string[]) {
  const inicio = Date.now();
  const { hoje, periodo } = horizonte();
  const dados = montarEntrada(await carregar(db));
  const candidatos = gerarCandidatos({ hoje, periodo, ...dados, escopo });
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

  const resumo = { origem, escopo, candidatos: candidatos.length, novas: gravadas, via_llm: viaLLM, expiradas: expirar.length, ms: Date.now() - inicio };
  log("info", "agente: análise concluída", resumo);
  return resumo;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "use POST" }, 405);
  const db = createDb();
  if (!(await autorizado(req, db))) return jsonResponse({ error: "não autorizado" }, 401);

  const caminho = new URL(req.url).pathname;
  const body = (await req.json().catch(() => ({}))) as { work_item_id?: number; projeto_id?: string };
  try {
    if (caminho.endsWith("/analyze/event")) {
      const { data } = await db.from("work_item").select("projeto_id").eq("devops_id", Number(body.work_item_id)).maybeSingle();
      if (!data) return jsonResponse({ ok: true, ignorado: "item não encontrado" });
      return jsonResponse(await analisar(db, "evento", [data.projeto_id]));
    }
    if (caminho.endsWith("/analyze/sweep")) return jsonResponse(await analisar(db, "sweep", []));
    return jsonResponse(await analisar(db, "manual", typeof body.projeto_id === "string" ? [body.projeto_id] : []));
  } catch (err) {
    log("error", "agente falhou", { erro: errorMessage(err) });
    return jsonResponse({ error: errorMessage(err) }, 500);
  }
});
