// devops-sync: sincronização completa (retomável) ou reconciliação incremental.
// Deploy com --no-verify-jwt; a autorização é feita aqui:
//   - cron (pg_net): header x-sync-secret = SYNC_SECRET
//   - front: JWT de um usuário autenticado (validado via Auth)
//
// POST { "mode": "full" | "reconcile", "restart"?: boolean }
// Resposta: { done, projetos: [{ projeto, modo, fase, done, aplicados }] }. Se done=false, chame de novo.

import { errorMessage, log } from "../_shared/log.ts";
import {
  corsHeaders,
  createAzdo,
  createDb,
  type Db,
  env,
  jsonResponse,
  projectFilter,
  safeEqual,
} from "../_lib/context.ts";
import { type Modo, type ResultadoProjeto, runFull, runReconcile, type SyncCtx, syncProjetos, withLease } from "../_lib/sync.ts";

const ORCAMENTO_MS = 110_000; // limite de wall clock no free tier é 150s

async function autorizado(req: Request, db: Db): Promise<boolean> {
  const secret = req.headers.get("x-sync-secret");
  if (secret) return safeEqual(secret, env("SYNC_SECRET"));
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await db.auth.getUser(token);
  return !error && !!data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "use POST" }, 405);

  const inicio = Date.now();
  const db = createDb();
  if (!(await autorizado(req, db))) return jsonResponse({ error: "não autorizado" }, 401);

  const body = await req.json().catch(() => ({}));
  const modo: Modo = body.mode === "full" ? "full" : "reconcile";
  const ctx: SyncCtx = { db, azdo: createAzdo(), filtro: projectFilter(), deadline: inicio + ORCAMENTO_MS };

  try {
    const projetos = await syncProjetos(ctx);
    const resultados: (ResultadoProjeto | { projeto: string; ocupado: true; done: false })[] = [];
    for (const p of projetos) {
      const r = await withLease(ctx, p.id, () =>
        modo === "full" ? runFull(ctx, p.id, body.restart === true) : runReconcile(ctx, p.id)
      );
      resultados.push(r === "ocupado" ? { projeto: p.id, ocupado: true, done: false } : r);
    }
    const done = resultados.every((r) => r.done);
    log("info", "devops-sync finalizado", { modo, done, ms: Date.now() - inicio, resultados });
    return jsonResponse({ done, modo, ms: Date.now() - inicio, projetos: resultados });
  } catch (err) {
    log("error", "devops-sync falhou", { modo, erro: errorMessage(err) });
    return jsonResponse({ error: errorMessage(err) }, 500);
  }
});
