// devops-acoes: ações do gestor que escrevem no Azure DevOps (hoje: mover card no Kanban).
// Deploy com --no-verify-jwt; exige JWT de usuário logado, validado aqui.
//
// POST { acao: "estados", projeto_id }            -> { estados: { Task: [{ nome, categoria }] } }
// POST { acao: "mover", devops_id, categoria }    -> { ok, de, para }
// POST { acao: "atribuir", devops_id, pessoa_id, motivo? } -> { ok, para }
//      (sugestão de alocação aprovada pelo gestor; motivo = encaixe/impacto, vai para a auditoria)
//
// Toda tentativa fica registrada em `acao` (quem, quando, antes/depois, erro).

import { errorMessage, log } from "../_shared/log.ts";
import { AzdoHttpError } from "../_shared/azdo/client.ts";
import {
  CATEGORIAS,
  type Categoria,
  categoriaDe,
  estadoDestino,
  type EstadosPorTipo,
  mapearEstados,
  TIPOS_FORA_DO_KANBAN,
} from "../_shared/kanban.ts";
import { asJson, corsHeaders, createAzdo, createDb, type Db, jsonResponse } from "../_lib/context.ts";
import { upsertWorkItems } from "../_lib/sync.ts";

type Azdo = ReturnType<typeof createAzdo>;

async function usuario(req: Request, db: Db) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}

async function estadosDoProjeto(db: Db, azdo: Azdo, projetoId: string): Promise<EstadosPorTipo> {
  const { data, error } = await db
    .from("work_item")
    .select("tipo")
    .eq("projeto_id", projetoId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const tipos = [...new Set((data ?? []).map((r) => r.tipo))].filter((t) => !TIPOS_FORA_DO_KANBAN.has(t));
  const pares = await Promise.all(
    tipos.map(async (t) => [t, mapearEstados(await azdo.getWorkItemTypeStates(projetoId, t))] as const),
  );
  return Object.fromEntries(pares);
}

function mensagemAzdo(err: unknown): string {
  if (err instanceof AzdoHttpError) {
    if (err.status === 401 || err.status === 403) {
      return "O token do DevOps (PAT) não tem permissão de escrita em Work Items.";
    }
    try {
      return (JSON.parse(err.body) as { message?: string }).message ?? err.message;
    } catch {
      return err.message;
    }
  }
  return errorMessage(err);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "use POST" }, 405);

  const db = createDb();
  const user = await usuario(req, db);
  if (!user) return jsonResponse({ error: "não autorizado" }, 401);

  const body = await req.json().catch(() => ({}));
  const azdo = createAzdo();

  try {
    if (body.acao === "estados") {
      if (typeof body.projeto_id !== "string") return jsonResponse({ error: "projeto_id obrigatório" }, 400);
      return jsonResponse({ estados: await estadosDoProjeto(db, azdo, body.projeto_id) });
    }

    if (body.acao === "mover") {
      const devopsId = Number(body.devops_id);
      const categoria = body.categoria as Categoria;
      if (!Number.isInteger(devopsId) || !CATEGORIAS.includes(categoria)) {
        return jsonResponse({ error: "devops_id e categoria válidos são obrigatórios" }, 400);
      }
      return jsonResponse(...(await mover(db, azdo, devopsId, categoria, user)));
    }

    if (body.acao === "atribuir") {
      const devopsId = Number(body.devops_id);
      if (!Number.isInteger(devopsId) || typeof body.pessoa_id !== "string") {
        return jsonResponse({ error: "devops_id e pessoa_id são obrigatórios" }, 400);
      }
      return jsonResponse(...(await atribuir(db, azdo, devopsId, body.pessoa_id, body.motivo ?? null, user)));
    }

    return jsonResponse({ error: "ação desconhecida" }, 400);
  } catch (err) {
    log("error", "devops-acoes falhou", { acao: body.acao, erro: errorMessage(err) });
    return jsonResponse({ error: mensagemAzdo(err) }, 500);
  }
});

async function mover(
  db: Db,
  azdo: Azdo,
  devopsId: number,
  categoria: Categoria,
  user: { id: string; email?: string },
): Promise<[unknown, number]> {
  const { data: item, error } = await db
    .from("work_item")
    .select("devops_id, projeto_id, tipo, estado")
    .eq("devops_id", devopsId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) return [{ error: "item não encontrado" }, 404];
  if (TIPOS_FORA_DO_KANBAN.has(item.tipo)) return [{ error: `${item.tipo} não pode ser movida pelo app` }, 422];

  const estados = mapearEstados(await azdo.getWorkItemTypeStates(item.projeto_id, item.tipo));
  const atual = categoriaDe(item.tipo, item.estado, { [item.tipo]: estados });
  if (atual === categoria) return [{ ok: true, de: item.estado, para: item.estado, semMudanca: true }, 200];

  const para = estadoDestino(estados, categoria);
  if (!para) return [{ error: `${item.tipo} não tem estado na coluna escolhida` }, 422];

  const registro = {
    tipo: "mover_estado",
    projeto_id: item.projeto_id,
    devops_id: devopsId,
    antes: asJson({ estado: item.estado }),
    depois: asJson({ estado: para }),
    usuario_id: user.id,
    usuario_email: user.email ?? null,
  };

  try {
    await azdo.updateWorkItem(devopsId, [{ op: "add", path: "/fields/System.State", value: para }]);
  } catch (err) {
    const msg = mensagemAzdo(err);
    await db.from("acao").insert({ ...registro, status: "erro", erro: msg });
    log("warn", "mover estado falhou", { devops_id: devopsId, para, erro: msg });
    return [{ error: msg }, err instanceof AzdoHttpError && err.status < 500 ? 422 : 502];
  }

  await db.from("acao").insert({ ...registro, status: "aplicada" });
  log("info", "estado movido pelo app", { devops_id: devopsId, de: item.estado, para, usuario: user.email });

  // Grava já a nova revisão (o webhook/cron também trariam, mas o card não deve "voltar").
  const ctx = { db, azdo, filtro: [], deadline: Date.now() + 20_000 };
  const atualizados = await azdo.getWorkItemsBatch([devopsId]);
  await upsertWorkItems(ctx, atualizados, item.projeto_id, "app");

  return [{ ok: true, de: item.estado, para }, 200];
}

async function atribuir(
  db: Db,
  azdo: Azdo,
  devopsId: number,
  pessoaId: string,
  motivo: unknown,
  user: { id: string; email?: string },
): Promise<[unknown, number]> {
  const { data: item, error } = await db
    .from("work_item")
    .select("devops_id, projeto_id, tipo, responsavel_id, pessoa:responsavel_id(nome)")
    .eq("devops_id", devopsId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) return [{ error: "item não encontrado" }, 404];
  // Regra do produto: o sistema só altera Tasks (e itens de trabalho), nunca Feature/Epic
  if (TIPOS_FORA_DO_KANBAN.has(item.tipo)) return [{ error: `${item.tipo} não pode ser alterada pelo app` }, 422];

  const { data: pessoa, error: e2 } = await db
    .from("pessoa")
    .select("id, nome, unique_name")
    .eq("id", pessoaId)
    .maybeSingle();
  if (e2) throw new Error(e2.message);
  if (!pessoa?.unique_name) return [{ error: "pessoa sem usuário do DevOps" }, 422];

  // O DevOps só aceita responsável com acesso ao projeto: exige estar num time dele
  const { data: vinculo, error: e3 } = await db
    .from("time_membro")
    .select("pessoa_id, time!inner(projeto_id)")
    .eq("pessoa_id", pessoaId)
    .eq("time.projeto_id", item.projeto_id)
    .limit(1);
  if (e3) throw new Error(e3.message);
  if (!vinculo?.length) return [{ error: `${pessoa.nome} não está em nenhum time deste projeto` }, 422];
  if (item.responsavel_id === pessoaId) return [{ ok: true, para: pessoa.nome, semMudanca: true }, 200];

  const registro = {
    tipo: "atribuir",
    projeto_id: item.projeto_id,
    devops_id: devopsId,
    antes: asJson({
      responsavel_id: item.responsavel_id,
      responsavel: (item.pessoa as { nome?: string } | null)?.nome ?? null,
    }),
    depois: asJson({ responsavel_id: pessoa.id, responsavel: pessoa.nome, motivo }),
    usuario_id: user.id,
    usuario_email: user.email ?? null,
  };

  try {
    await azdo.updateWorkItem(devopsId, [{ op: "add", path: "/fields/System.AssignedTo", value: pessoa.unique_name }]);
  } catch (err) {
    const msg = mensagemAzdo(err);
    await db.from("acao").insert({ ...registro, status: "erro", erro: msg });
    log("warn", "atribuir falhou", { devops_id: devopsId, pessoa: pessoa.nome, erro: msg });
    return [{ error: msg }, err instanceof AzdoHttpError && err.status < 500 ? 422 : 502];
  }

  await db.from("acao").insert({ ...registro, status: "aplicada" });
  log("info", "task atribuída pelo app", { devops_id: devopsId, para: pessoa.nome, usuario: user.email });

  const ctx = { db, azdo, filtro: [], deadline: Date.now() + 20_000 };
  await upsertWorkItems(ctx, await azdo.getWorkItemsBatch([devopsId]), item.projeto_id, "app");
  return [{ ok: true, para: pessoa.nome }, 200];
}
