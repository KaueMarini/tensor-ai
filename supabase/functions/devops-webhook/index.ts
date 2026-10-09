// devops-webhook: recebe Service Hooks do Azure DevOps (workitem.created/updated/deleted/restored).
// Deploy com --no-verify-jwt (o DevOps não envia JWT do Supabase); autenticação por basic auth.
// Grava o evento bruto (idempotente pela chave), responde 200 na hora e processa em background:
// rebusca o item na API e só grava se o rev for maior.

import type { AzdoServiceHookPayload } from "../_shared/azdo/types.ts";
import { extractWebhookRef } from "../_shared/mappers/webhook.ts";
import { errorMessage, log } from "../_shared/log.ts";
import { asJson, createAzdo, createDb, env, jsonResponse, projectFilter, safeEqual, verificarSegredo } from "../_lib/context.ts";
import { processarEvento, type SyncCtx } from "../_lib/sync.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

async function basicAuthOk(req: Request): Promise<boolean> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  // avalia os dois para não vazar qual falhou pelo tempo de resposta
  const okUser = safeEqual(user, env("WEBHOOK_BASIC_USER"));
  const okPass = await verificarSegredo(pass, "WEBHOOK_BASIC_PASS");
  return sep > 0 && okUser && okPass;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "use POST" }, 405);
  if (!(await basicAuthOk(req))) return jsonResponse({ error: "não autorizado" }, 401);

  let payload: AzdoServiceHookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const ref = extractWebhookRef(payload);
  const db = createDb();
  const { data, error } = await db
    .from("evento")
    .upsert(
      { chave_idempotencia: ref.chave, tipo: ref.tipo, devops_id: ref.devopsId, rev: ref.rev, payload: asJson(payload) },
      { onConflict: "chave_idempotencia", ignoreDuplicates: true },
    )
    .select("id, payload, tentativas");

  if (error) {
    log("error", "falha ao gravar evento", { devops_id: ref.devopsId, erro: error.message });
    // 500 faz o DevOps reenviar; a reconciliação cobre se ele desistir
    return jsonResponse({ error: "falha ao gravar evento" }, 500);
  }

  const evento = data?.[0];
  if (!evento) {
    log("info", "evento duplicado ignorado", { devops_id: ref.devopsId, chave: ref.chave });
    return jsonResponse({ ok: true, duplicado: true });
  }

  log("info", "evento recebido", { devops_id: ref.devopsId, rev: ref.rev, tipo: ref.tipo, evento_id: evento.id });
  const ctx: SyncCtx = { db, azdo: createAzdo(), filtro: projectFilter(), deadline: Date.now() + 60_000 };
  EdgeRuntime.waitUntil(
    processarEvento(ctx, evento).catch((err) =>
      log("error", "processamento em background falhou", { devops_id: ref.devopsId, erro: errorMessage(err) })
    ),
  );
  return jsonResponse({ ok: true, evento_id: evento.id });
});
