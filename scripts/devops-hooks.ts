// pnpm devops:hooks [create|list|delete]
// Gerencia as subscriptions de Service Hooks (Web Hooks) que apontam para a function devops-webhook.
// Idempotente: "create" só cria o que falta. Escopo por projeto (AZDO_PROJECTS ou todos).

import { createAzdoClient } from "../supabase/functions/_shared/azdo/client.ts";
import { WEBHOOK_EVENTS } from "../supabase/functions/_shared/mappers/webhook.ts";

interface Subscription {
  id: string;
  eventType: string;
  status: string;
  publisherInputs?: { projectId?: string };
  consumerInputs?: { url?: string };
}

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k} (.env.local / supabase/.env.functions)`);
  return v;
};

const azdo = createAzdoClient({ orgUrl: need("AZDO_ORG_URL"), pat: need("AZDO_PAT") });
const webhookUrl = `${need("SUPABASE_URL")}/functions/v1/devops-webhook`;
const filtro = (process.env.AZDO_PROJECTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function projetos() {
  const todos = await azdo.listProjects();
  return todos.filter((p) => filtro.length === 0 || filtro.includes(p.name.toLowerCase()) || filtro.includes(p.id));
}

async function nossas(): Promise<Subscription[]> {
  const res = await azdo.request<{ value: Subscription[] }>("GET", "_apis/hooks/subscriptions");
  return res.value.filter((s) => s.consumerInputs?.url === webhookUrl);
}

async function create() {
  const existentes = await nossas();
  for (const p of await projetos()) {
    for (const eventType of WEBHOOK_EVENTS) {
      if (existentes.some((s) => s.eventType === eventType && s.publisherInputs?.projectId === p.id)) {
        console.log(`= ${p.name} ${eventType} (já existe)`);
        continue;
      }
      const sub = await azdo.request<Subscription>("POST", "_apis/hooks/subscriptions", {
        body: {
          publisherId: "tfs",
          eventType,
          resourceVersion: "1.0",
          consumerId: "webHooks",
          consumerActionId: "httpRequest",
          publisherInputs: { projectId: p.id },
          consumerInputs: {
            url: webhookUrl,
            basicAuthUsername: need("WEBHOOK_BASIC_USER"),
            basicAuthPassword: need("WEBHOOK_BASIC_PASS"),
            resourceDetailsToSend: "all",
            messagesToSend: "none",
            detailedMessagesToSend: "none",
          },
        },
      });
      console.log(`+ ${p.name} ${eventType} -> ${sub.id}`);
    }
  }
}

async function list() {
  const subs = await nossas();
  if (subs.length === 0) console.log("Nenhuma subscription apontando para", webhookUrl);
  for (const s of subs) console.log(`${s.id}  ${s.eventType.padEnd(18)} ${s.status.padEnd(10)} projeto=${s.publisherInputs?.projectId}`);
}

async function remove() {
  for (const s of await nossas()) {
    await azdo.request("DELETE", `_apis/hooks/subscriptions/${s.id}`);
    console.log(`- ${s.eventType} ${s.id}`);
  }
}

const cmd = process.argv[2] ?? "list";
const acoes: Record<string, () => Promise<void>> = { create, list, delete: remove };
if (!acoes[cmd]) {
  console.error("uso: pnpm devops:hooks [create|list|delete]");
  process.exit(1);
}
acoes[cmd]!().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  console.error("\nSem permissão? Crie pela UI: Project Settings > Service hooks > + > Web Hooks (ver README).");
  process.exit(1);
});
