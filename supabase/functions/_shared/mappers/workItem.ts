// Work item do DevOps -> linha do RPC upsert_work_items.
// Tolera qualquer campo ausente: a iPORT ainda não confirmou quais campos de horas/datas usa.

import type { AzdoIdentityRef, AzdoWorkItem } from "../azdo/types.ts";
import { normalizeIterationPath } from "./paths.ts";

export interface WorkItemRow {
  devops_id: number;
  rev: number;
  projeto_id: string;
  tipo: string;
  estado: string | null;
  titulo: string;
  descritivo: string | null;
  parent_devops_id: number | null;
  responsavel_devops_id: string | null;
  responsavel_nome: string | null;
  responsavel_unique_name: string | null;
  area_path: string | null;
  iteration_path: string | null;
  horas_estimadas: number | null;
  horas_restantes: number | null;
  horas_concluidas: number | null;
  start_date: string | null;
  finish_date: string | null;
  target_date: string | null;
  tags: string[];
  changed_date: string | null;
  fields: Record<string, unknown>;
}

const PARENT_REL = "System.LinkTypes.Hierarchy-Reverse";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** "a; b ;a" -> ["a","b"] (trim + dedup, mantém a grafia original da primeira ocorrência). */
export function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw.split(";")) {
    const tag = t.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
}

/** Pai via System.Parent ou, na falta, pela relação Hierarchy-Reverse. */
export function parentId(item: Pick<AzdoWorkItem, "fields" | "relations">): number | null {
  const direct = num(item.fields["System.Parent"]);
  if (direct !== null) return direct;
  const rel = item.relations?.find((r) => r.rel === PARENT_REL);
  const id = rel ? Number(rel.url.split("/").pop()) : NaN;
  return Number.isFinite(id) ? id : null;
}

function identity(v: unknown): AzdoIdentityRef | null {
  if (v && typeof v === "object" && typeof (v as AzdoIdentityRef).id === "string") return v as AzdoIdentityRef;
  return null;
}

export function mapWorkItem(item: AzdoWorkItem, projetoId: string): WorkItemRow {
  const f = item.fields ?? {};
  const resp = identity(f["System.AssignedTo"]);
  return {
    devops_id: item.id,
    rev: item.rev ?? num(f["System.Rev"]) ?? 0,
    projeto_id: projetoId,
    tipo: str(f["System.WorkItemType"]) ?? "Desconhecido",
    estado: str(f["System.State"]),
    titulo: str(f["System.Title"]) ?? `#${item.id}`,
    descritivo: str(f["System.Description"]),
    parent_devops_id: parentId(item),
    responsavel_devops_id: resp?.id ?? null,
    responsavel_nome: resp?.displayName ?? null,
    responsavel_unique_name: resp?.uniqueName ?? null,
    area_path: str(f["System.AreaPath"]),
    iteration_path: normalizeIterationPath(str(f["System.IterationPath"])),
    horas_estimadas: num(f["Microsoft.VSTS.Scheduling.OriginalEstimate"]),
    horas_restantes: num(f["Microsoft.VSTS.Scheduling.RemainingWork"]),
    horas_concluidas: num(f["Microsoft.VSTS.Scheduling.CompletedWork"]),
    start_date: str(f["Microsoft.VSTS.Scheduling.StartDate"]),
    finish_date: str(f["Microsoft.VSTS.Scheduling.FinishDate"]),
    target_date: str(f["Microsoft.VSTS.Scheduling.TargetDate"]),
    tags: parseTags(f["System.Tags"]),
    changed_date: str(f["System.ChangedDate"]),
    fields: f,
  };
}
