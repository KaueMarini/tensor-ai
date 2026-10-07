// Contexto de runtime das Edge Functions (Deno): env, cliente Supabase (service_role) e cliente DevOps.
// Código puro e reaproveitável pelo front fica em _shared; aqui fica o que depende do runtime.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Json } from "../_shared/db.types.ts";
import { type AzdoClient, createAzdoClient } from "../_shared/azdo/client.ts";
import { log } from "../_shared/log.ts";

export type Db = SupabaseClient<Database>;

export function env(name: string, required = true): string {
  const v = Deno.env.get(name)?.trim();
  if (!v && required) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v ?? "";
}

export function createDb(): Db {
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAzdo(): AzdoClient {
  return createAzdoClient({ orgUrl: env("AZDO_ORG_URL"), pat: env("AZDO_PAT"), log });
}

/** AZDO_PROJECTS: lista opcional (nomes ou IDs, separados por vírgula). Vazio = todos. */
export function projectFilter(): string[] {
  return env("AZDO_PROJECTS", false)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const asJson = (v: unknown) => v as Json;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Comparação em tempo constante (para segredos). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
