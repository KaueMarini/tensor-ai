// Motor de sincronização Azure DevOps -> Supabase.
// Idempotente: o banco só aceita revisões mais novas (upsert_work_items), então rodar de novo,
// em paralelo com o webhook ou fora de ordem nunca regride dados.

import { AzdoHttpError, chunk } from "../_shared/azdo/client.ts";
import type { AzdoProject, AzdoWorkItem } from "../_shared/azdo/types.ts";
import { errorMessage, log } from "../_shared/log.ts";
import { flattenIterations, mapCapacities, mapMembers, mapTeamDaysOff } from "../_shared/mappers/team.ts";
import { mapWorkItem } from "../_shared/mappers/workItem.ts";
import { extractWebhookRef } from "../_shared/mappers/webhook.ts";
import type { AzdoServiceHookPayload } from "../_shared/azdo/types.ts";
import type { AzdoClient } from "../_shared/azdo/client.ts";
import { asJson, type Db } from "./context.ts";
import type { Database } from "../_shared/db.types.ts";

type SyncStatePatch = Database["public"]["Tables"]["sync_state"]["Update"];

export type Origem = "webhook" | "reconcile" | "full";
export type Modo = "full" | "reconcile";

export interface SyncCtx {
  db: Db;
  azdo: AzdoClient;
  filtro: string[];
  deadline: number; // epoch ms; para antes disso e salva progresso
  runId?: string;
}

const LEASE_SEGUNDOS = 170;
const RECONCILE_OVERLAP_MS = 2 * 60_000;
const FULL_CURSOR_MARGIN_MS = 5 * 60_000;
const WIQL_PAGE = 1000;

const timeLeft = (ctx: SyncCtx) => ctx.deadline - Date.now();

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Como must, para consultas de lista. */
function rows<T>(res: { data: T[] | null; error: { message: string } | null }, what: string): T[] {
  return must(res, what) ?? [];
}

/** Igualdade estrutural com chaves ordenadas (para evitar escritas e eventos Realtime à toa). */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}

// ---------------------------------------------------------------------------
// Work items
// ---------------------------------------------------------------------------

export async function upsertWorkItems(ctx: SyncCtx, items: AzdoWorkItem[], projetoId: string, origem: Origem) {
  if (items.length === 0) return 0;
  const rows = items.map((i) => mapWorkItem(i, projetoId));
  const res = must(
    await ctx.db.rpc("upsert_work_items", { p_items: asJson(rows), p_origem: origem }),
    "upsert_work_items",
  );
  let aplicados = 0;
  for (const r of res ?? []) {
    if (r.aplicado) aplicados++;
    const row = rows.find((x) => x.devops_id === r.devops_id);
    log("info", r.aplicado ? "work_item gravado" : "work_item ignorado (rev não é maior)", {
      devops_id: r.devops_id,
      rev: row?.rev,
      origem,
      run_id: ctx.runId,
    });
  }
  return aplicados;
}

async function fetchAndUpsert(ctx: SyncCtx, ids: number[], projetoId: string, origem: Origem) {
  let aplicados = 0;
  let maxChanged: string | null = null;
  for (const lote of chunk(ids, 200)) {
    const items = await ctx.azdo.getWorkItemsBatch(lote);
    aplicados += await upsertWorkItems(ctx, items, projetoId, origem);
    for (const i of items) {
      const c = i.fields["System.ChangedDate"];
      if (typeof c === "string" && (!maxChanged || c > maxChanged)) maxChanged = c;
    }
  }
  return { aplicados, maxChanged };
}

/** Todos os IDs vivos do projeto, paginando por ID (contorna o limite de 20k do WIQL). */
async function allIds(ctx: SyncCtx, projetoId: string): Promise<number[]> {
  const ids: number[] = [];
  let last = 0;
  for (;;) {
    const page = await ctx.azdo.wiqlIds(
      projetoId,
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Id] > ${last} ORDER BY [System.Id]`,
      19_999,
    );
    ids.push(...page);
    if (page.length < 19_999) return ids;
    last = page[page.length - 1]!;
  }
}

// ---------------------------------------------------------------------------
// Projetos, sprints, times, membros, capacidade
// ---------------------------------------------------------------------------

export async function syncProjetos(ctx: SyncCtx): Promise<AzdoProject[]> {
  const todos = await ctx.azdo.listProjects();
  const alvo = todos.filter(
    (p) => ctx.filtro.length === 0 || ctx.filtro.includes(p.name.toLowerCase()) || ctx.filtro.includes(p.id),
  );
  const detalhados = await Promise.all(alvo.map((p) => ctx.azdo.getProject(p.id)));
  const existentes = rows(await ctx.db.from("projeto").select("id, nome, descricao, processo"), "ler projetos");
  const mudou = detalhados
    .map((p) => ({
      id: p.id,
      nome: p.name,
      descricao: p.description ?? null,
      processo: p.capabilities?.processTemplate?.templateName ?? null,
    }))
    .filter((p) => canon(p) !== canon(existentes.find((e) => e.id === p.id)));
  if (mudou.length) must(await ctx.db.from("projeto").upsert(mudou), "upsert projeto");
  return detalhados;
}

export async function syncMeta(ctx: SyncCtx, projetoId: string) {
  // Sprints (iterações do projeto, com datas)
  const tree = await ctx.azdo.getIterationTree(projetoId);
  const sprints = flattenIterations(tree, projetoId);
  const atuais = rows(
    await ctx.db.from("sprint").select("id, projeto_id, nome, iteration_path, inicio, fim, deleted_at").eq("projeto_id", projetoId),
    "ler sprints",
  );
  const mudaram = sprints.filter((s) => canon(s) !== canon(atuais.find((a) => a.id === s.id)));
  if (mudaram.length) must(await ctx.db.from("sprint").upsert(mudaram), "upsert sprint");
  const ids = new Set(sprints.map((s) => s.id));
  const sumiram = atuais.filter((a) => !ids.has(a.id) && !a.deleted_at).map((a) => a.id);
  if (sumiram.length) {
    must(await ctx.db.from("sprint").update({ deleted_at: new Date().toISOString() }).in("id", sumiram), "excluir sprints");
  }

  // Times, membros e capacidade por sprint
  const times = await ctx.azdo.listTeams(projetoId);
  const timesAtuais = rows(await ctx.db.from("time").select("id, projeto_id, nome").eq("projeto_id", projetoId), "ler times");
  const timesMudaram = times
    .map((t) => ({ id: t.id, projeto_id: projetoId, nome: t.name }))
    .filter((t) => canon(t) !== canon(timesAtuais.find((a) => a.id === t.id)));
  if (timesMudaram.length) must(await ctx.db.from("time").upsert(timesMudaram), "upsert time");

  for (const time of times) {
    const membros = mapMembers(await ctx.azdo.listTeamMembers(projetoId, time.id));
    must(await ctx.db.rpc("sync_time_membros", { p_time_id: time.id, p_membros: asJson(membros) }), "sync_time_membros");

    const iteracoes = await ctx.azdo.listTeamIterations(projetoId, time.id);
    for (const it of iteracoes.filter((i) => ids.has(i.id))) {
      const [cap, off] = await Promise.all([
        ctx.azdo.getCapacities(projetoId, time.id, it.id),
        ctx.azdo.getTeamDaysOff(projetoId, time.id, it.id),
      ]);
      await replaceCapacidadeSeMudou(ctx, it.id, time.id, mapCapacities(cap), mapTeamDaysOff(off));
    }
  }
  log("info", "metadados sincronizados", { projeto_id: projetoId, sprints: sprints.length, times: times.length, run_id: ctx.runId });
}

async function replaceCapacidadeSeMudou(
  ctx: SyncCtx,
  sprintId: string,
  timeId: string,
  capacidades: ReturnType<typeof mapCapacities>,
  diasOffTime: ReturnType<typeof mapTeamDaysOff>,
) {
  const [cap, off] = await Promise.all([
    ctx.db.from("capacidade_sprint").select("capacidade_dia, atividades, pessoa:pessoa_id(devops_user_id)")
      .eq("sprint_id", sprintId).eq("time_id", timeId),
    ctx.db.from("dias_off").select("inicio, fim, pessoa:pessoa_id(devops_user_id)").eq("sprint_id", sprintId).eq("time_id", timeId),
  ]);
  const capAtual = rows(cap, "ler capacidade");
  const offAtual = rows(off, "ler dias off");
  const atual = {
    cap: capAtual
      .map((c) => ({
        u: c.pessoa?.devops_user_id,
        d: Number(c.capacidade_dia),
        a: c.atividades,
        off: offAtual.filter((o) => o.pessoa?.devops_user_id === c.pessoa?.devops_user_id).map((o) => [o.inicio, o.fim]).sort(),
      }))
      .sort((a, b) => String(a.u).localeCompare(String(b.u))),
    time: offAtual.filter((o) => !o.pessoa).map((o) => [o.inicio, o.fim]).sort(),
  };
  const novo = {
    cap: capacidades
      .map((c) => ({ u: c.devops_user_id, d: c.capacidade_dia, a: c.atividades, off: c.dias_off.map((o) => [o.inicio, o.fim]).sort() }))
      .sort((a, b) => a.u.localeCompare(b.u)),
    time: diasOffTime.map((o) => [o.inicio, o.fim]).sort(),
  };
  if (canon(atual) === canon(novo)) return;
  must(
    await ctx.db.rpc("replace_capacidade", {
      p_sprint_id: sprintId,
      p_time_id: timeId,
      p_capacidades: asJson(capacidades),
      p_dias_off_time: asJson(diasOffTime),
    }),
    "replace_capacidade",
  );
  log("info", "capacidade atualizada", { sprint_id: sprintId, time_id: timeId, membros: capacidades.length, run_id: ctx.runId });
}

// ---------------------------------------------------------------------------
// Estado e lease
// ---------------------------------------------------------------------------

type SyncState = Awaited<ReturnType<typeof readState>>;

async function readState(ctx: SyncCtx, projetoId: string) {
  return must(await ctx.db.from("sync_state").select("*").eq("projeto_id", projetoId).maybeSingle(), "ler sync_state");
}

async function saveState(ctx: SyncCtx, projetoId: string, patch: SyncStatePatch) {
  must(await ctx.db.from("sync_state").update(patch).eq("projeto_id", projetoId), "salvar sync_state");
}

export async function withLease<T>(ctx: SyncCtx, projetoId: string, fn: () => Promise<T>): Promise<T | "ocupado"> {
  const ok = must(
    await ctx.db.rpc("acquire_sync_lease", { p_projeto_id: projetoId, p_segundos: LEASE_SEGUNDOS }),
    "acquire_sync_lease",
  );
  if (!ok) return "ocupado";
  try {
    return await fn();
  } finally {
    await ctx.db.rpc("release_sync_lease", { p_projeto_id: projetoId });
  }
}

// ---------------------------------------------------------------------------
// Full (retomável) e reconcile
// ---------------------------------------------------------------------------

export interface ResultadoProjeto {
  projeto: string;
  modo: Modo;
  fase: string;
  done: boolean;
  aplicados: number;
  removidos?: number;
}

const FASES_FULL = ["meta", "itens", "sweep"];

/** Avança a sync completa até acabar ou estourar o orçamento de tempo. Retoma de sync_state. */
export async function runFull(ctx: SyncCtx, projetoId: string, reiniciar: boolean): Promise<ResultadoProjeto> {
  let state = await readState(ctx, projetoId);
  let aplicados = 0;
  let removidos = 0;

  if (reiniciar || !state || !FASES_FULL.includes(state.fase)) {
    await saveState(ctx, projetoId, {
      fase: "meta",
      cursor: { lastId: 0 },
      run_id: crypto.randomUUID(),
      full_iniciada_em: new Date().toISOString(),
      ultimo_erro: null,
    });
    state = await readState(ctx, projetoId);
  }
  ctx.runId = state!.run_id ?? undefined;

  while (timeLeft(ctx) > 0) {
    const fase = state!.fase;
    if (fase === "meta") {
      await syncMeta(ctx, projetoId);
      await saveState(ctx, projetoId, { fase: "itens", cursor: { lastId: 0 } });
    } else if (fase === "itens") {
      let lastId = Number((state!.cursor as { lastId?: number })?.lastId ?? 0);
      const ids = await ctx.azdo.wiqlIds(
        projetoId,
        `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Id] > ${lastId} ORDER BY [System.Id]`,
        WIQL_PAGE,
      );
      if (ids.length === 0) {
        await saveState(ctx, projetoId, { fase: "sweep" });
      } else {
        for (const lote of chunk(ids, 200)) {
          if (timeLeft(ctx) <= 0) break;
          aplicados += (await fetchAndUpsert(ctx, lote, projetoId, "full")).aplicados;
          lastId = lote[lote.length - 1]!;
          await saveState(ctx, projetoId, { cursor: { lastId } });
        }
      }
    } else if (fase === "sweep") {
      const vivos = await allIds(ctx, projetoId);
      removidos = must(
        await ctx.db.rpc("sweep_work_items", { p_projeto_id: projetoId, p_ids_vivos: vivos }),
        "sweep_work_items",
      ) ?? 0;
      const inicio = Date.parse(state!.full_iniciada_em ?? new Date().toISOString());
      await saveState(ctx, projetoId, {
        fase: "concluido",
        cursor: {},
        full_concluida_em: new Date().toISOString(),
        ultimo_changed_date: new Date(inicio - FULL_CURSOR_MARGIN_MS).toISOString(),
        ultima_reconciliacao_em: new Date().toISOString(),
        ultima_reconciliacao_ok: true,
      });
      log("info", "sync completa concluída", { projeto_id: projetoId, removidos, run_id: ctx.runId });
      return { projeto: projetoId, modo: "full", fase: "concluido", done: true, aplicados, removidos };
    } else {
      break;
    }
    state = await readState(ctx, projetoId);
  }
  return { projeto: projetoId, modo: "full", fase: state!.fase, done: false, aplicados };
}

export async function runReconcile(ctx: SyncCtx, projetoId: string): Promise<ResultadoProjeto> {
  const state = await readState(ctx, projetoId);
  // Sem full concluída (ou full em andamento): continua a full
  if (!state?.ultimo_changed_date || FASES_FULL.includes(state.fase)) {
    return runFull(ctx, projetoId, false);
  }
  ctx.runId = crypto.randomUUID();
  try {
    await syncMeta(ctx, projetoId);

    const desde = new Date(Date.parse(state.ultimo_changed_date) - RECONCILE_OVERLAP_MS).toISOString();
    const ids = await ctx.azdo.wiqlIds(
      projetoId,
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.ChangedDate] > '${desde}' ORDER BY [System.ChangedDate]`,
    );
    const { aplicados, maxChanged } = await fetchAndUpsert(ctx, ids, projetoId, "reconcile");

    // Exclusões não geram ChangedDate consultável: compara com a lixeira
    let removidos = 0;
    const lixeira = await ctx.azdo.listRecycleBinIds(projetoId).catch((err) => {
      log("warn", "lixeira indisponível", { projeto_id: projetoId, erro: errorMessage(err) });
      return [] as number[];
    });
    if (lixeira.length) {
      const vivosNoBanco = rows(
        await ctx.db.from("work_item").select("devops_id").eq("projeto_id", projetoId).is("deleted_at", null).in("devops_id", lixeira),
        "ler itens da lixeira",
      );
      for (const { devops_id } of vivosNoBanco) {
        if (must(await ctx.db.rpc("soft_delete_work_item", { p_devops_id: devops_id }), "soft_delete")) {
          removidos++;
          log("info", "work_item excluído (lixeira)", { devops_id, origem: "reconcile", run_id: ctx.runId });
        }
      }
    }

    const reprocessados = await reprocessarEventos(ctx);
    const cursor = maxChanged && maxChanged > state.ultimo_changed_date ? maxChanged : state.ultimo_changed_date;
    await saveState(ctx, projetoId, {
      ultimo_changed_date: cursor,
      ultima_reconciliacao_em: new Date().toISOString(),
      ultima_reconciliacao_ok: true,
      ultimo_erro: null,
    });
    log("info", "reconciliação concluída", {
      projeto_id: projetoId, alterados: ids.length, aplicados, removidos, reprocessados, run_id: ctx.runId,
    });
    return { projeto: projetoId, modo: "reconcile", fase: "concluido", done: true, aplicados, removidos };
  } catch (err) {
    await saveState(ctx, projetoId, {
      ultima_reconciliacao_em: new Date().toISOString(),
      ultima_reconciliacao_ok: false,
      ultimo_erro: errorMessage(err),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Eventos de webhook
// ---------------------------------------------------------------------------

export interface EventoRow {
  id: number;
  payload: unknown;
  tentativas: number;
}

/** Processa um evento: rebusca o item na API (não confia no payload) e grava se o rev for maior. */
export async function processarEvento(ctx: SyncCtx, evento: EventoRow): Promise<void> {
  const ref = extractWebhookRef(evento.payload as AzdoServiceHookPayload);
  const fim = (status: string, erro: string | null = null) =>
    ctx.db.from("evento").update({
      status,
      erro,
      tentativas: evento.tentativas + 1,
      processado_em: new Date().toISOString(),
    }).eq("id", evento.id);

  if (ref.devopsId === null) {
    await fim("ignorado", "evento sem id de work item");
    return;
  }
  try {
    let item: AzdoWorkItem | null = null;
    try {
      item = await ctx.azdo.getWorkItem(ref.devopsId);
    } catch (err) {
      if (!(err instanceof AzdoHttpError && err.status === 404)) throw err;
    }

    if (!item) {
      const removido = must(
        await ctx.db.rpc("soft_delete_work_item", { p_devops_id: ref.devopsId, p_rev: ref.rev ?? undefined }),
        "soft_delete",
      );
      log("info", removido ? "work_item excluído" : "exclusão ignorada (já excluído ou rev antigo)", {
        devops_id: ref.devopsId, rev: ref.rev, origem: "webhook", evento_id: evento.id,
      });
      await fim("processado");
      return;
    }

    const projetoId = await resolverProjeto(ctx, ref.projetoId, item);
    if (!projetoId) {
      await fim("ignorado", "projeto fora do filtro ou ainda não sincronizado");
      return;
    }
    await upsertWorkItems(ctx, [item], projetoId, "webhook");
    await fim("processado");
  } catch (err) {
    log("error", "falha ao processar evento", { devops_id: ref.devopsId, evento_id: evento.id, erro: errorMessage(err) });
    await fim("erro", errorMessage(err));
  }
}

async function resolverProjeto(ctx: SyncCtx, projetoId: string | null, item: AzdoWorkItem) {
  if (projetoId) {
    const { data } = await ctx.db.from("projeto").select("id").eq("id", projetoId).maybeSingle();
    if (data) return data.id;
  }
  const nome = item.fields["System.TeamProject"];
  if (typeof nome !== "string") return null;
  const { data } = await ctx.db.from("projeto").select("id").ilike("nome", nome).maybeSingle();
  return data?.id ?? null;
}

/** Eventos que falharam ou ficaram presos (ex.: a function morreu no meio). */
async function reprocessarEventos(ctx: SyncCtx): Promise<number> {
  const umMinutoAtras = new Date(Date.now() - 60_000).toISOString();
  const pendentes = rows(
    await ctx.db.from("evento").select("id, payload, tentativas")
      .in("status", ["recebido", "erro"]).lt("recebido_em", umMinutoAtras).lt("tentativas", 5)
      .order("recebido_em").limit(50),
    "ler eventos pendentes",
  );
  for (const ev of pendentes) {
    if (timeLeft(ctx) <= 0) break;
    await processarEvento(ctx, ev);
  }
  return pendentes.length;
}

export type { SyncState };
