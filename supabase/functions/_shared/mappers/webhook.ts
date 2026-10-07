// Service Hook -> referência mínima. O payload NÃO é fonte de verdade: só usamos o ID
// (e o rev para ordenar deletes); o item é sempre rebuscado na API.

import type { AzdoServiceHookPayload } from "../azdo/types.ts";

export const WEBHOOK_EVENTS = [
  "workitem.created",
  "workitem.updated",
  "workitem.deleted",
  "workitem.restored",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookRef {
  tipo: string;
  devopsId: number | null;
  rev: number | null;
  projetoId: string | null;
  chave: string;
}

export function extractWebhookRef(payload: AzdoServiceHookPayload): WebhookRef {
  const r = payload.resource ?? {};
  // updated: resource.id é o id da *atualização*; o work item vem em workItemId
  const devopsId = r.workItemId ?? r.revision?.id ?? r.id ?? null;
  const rev = r.rev ?? r.revision?.rev ?? null;
  const tipo = payload.eventType ?? "desconhecido";
  // GUID do evento identifica reentregas do mesmo evento; fallback determinístico
  const chave = payload.id ?? `${tipo}:${devopsId}:${rev}:${payload.notificationId ?? ""}`;
  return {
    tipo,
    devopsId: typeof devopsId === "number" ? devopsId : null,
    rev: typeof rev === "number" ? rev : null,
    projetoId: payload.resourceContainers?.project?.id ?? null,
    chave,
  };
}
