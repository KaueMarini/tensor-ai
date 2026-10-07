// pnpm devops:latency <workItemId>
// Mede a latência ponta a ponta: altera RemainingWork de um item no DevOps e espera
// a nova revisão aparecer no Supabase (via webhook). Depois desfaz a alteração.

import { createAzdoClient } from "../supabase/functions/_shared/azdo/client.ts";
import type { AzdoWorkItem } from "../supabase/functions/_shared/azdo/types.ts";

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k}`);
  return v;
};
const azdo = createAzdoClient({ orgUrl: need("AZDO_ORG_URL"), pat: need("AZDO_PAT") });
const SUPABASE_URL = need("SUPABASE_URL");
const KEY = need("SUPABASE_SERVICE_ROLE_KEY"); // só local, nunca no front
const id = Number(process.argv[2]);
if (!id) throw new Error("uso: pnpm devops:latency <workItemId>");

const FIELD = "Microsoft.VSTS.Scheduling.RemainingWork";

async function revNoBanco(): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/work_item?select=rev&devops_id=eq.${id}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const rows = (await res.json()) as { rev: number }[];
  return rows[0]?.rev ?? 0;
}

async function alterarEMedir(valor: number): Promise<number> {
  const t0 = performance.now();
  const item = await azdo.request<AzdoWorkItem>("PATCH", `_apis/wit/workitems/${id}`, {
    body: [{ op: "add", path: `/fields/${FIELD}`, value: valor }],
    contentType: "application/json-patch+json",
  });
  const tSalvo = performance.now();
  for (;;) {
    if ((await revNoBanco()) >= item.rev) break;
    if (performance.now() - t0 > 60_000) throw new Error("timeout de 60s esperando o webhook");
    await new Promise((r) => setTimeout(r, 150));
  }
  const total = (performance.now() - tSalvo) / 1000;
  console.log(`#${id} ${FIELD}=${valor} rev ${item.rev}: no banco ${total.toFixed(2)}s depois de salvo no DevOps`);
  return total;
}

const original = (await azdo.getWorkItem(id)).fields[FIELD] as number | undefined;
const tempos: number[] = [];
for (let i = 0; i < 3; i++) {
  tempos.push(await alterarEMedir((original ?? 1) + 1 + i));
  await new Promise((r) => setTimeout(r, 3000));
}
await alterarEMedir(original ?? 0);
console.log(`média ${(tempos.reduce((a, b) => a + b, 0) / tempos.length).toFixed(2)}s (valor original restaurado)`);
