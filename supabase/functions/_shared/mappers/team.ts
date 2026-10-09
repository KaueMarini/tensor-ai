import type {
  AzdoCapacityResponse,
  AzdoClassificationNode,
  AzdoDateRange,
  AzdoTeamDaysOff,
  AzdoTeamMember,
} from "../azdo/types.ts";
import { normalizeIterationPath, toDateOnly } from "./paths.ts";

export interface SprintRow {
  id: string;
  projeto_id: string;
  nome: string;
  iteration_path: string;
  inicio: string | null;
  fim: string | null;
  deleted_at: null;
}

export function flattenIterations(root: AzdoClassificationNode, projetoId: string): SprintRow[] {
  const out: SprintRow[] = [];
  const walk = (node: AzdoClassificationNode) => {
    for (const child of node.children ?? []) {
      const path = normalizeIterationPath(child.path);
      if (path) {
        out.push({
          id: child.identifier,
          projeto_id: projetoId,
          nome: child.name,
          iteration_path: path,
          inicio: toDateOnly(child.attributes?.startDate),
          fim: toDateOnly(child.attributes?.finishDate),
          deleted_at: null,
        });
      }
      walk(child);
    }
  };
  walk(root);
  return out;
}

export function sprintsAtivas(sprints: Pick<SprintRow, "id" | "fim">[], hoje: string): Set<string> {
  return new Set(sprints.filter((s) => !s.fim || s.fim >= hoje).map((s) => s.id));
}

export interface MembroRow {
  devops_user_id: string;
  nome: string;
  unique_name: string | null;
}

export function mapMembers(members: AzdoTeamMember[]): MembroRow[] {
  const seen = new Set<string>();
  return members
    .filter((m) => m.identity?.id && !seen.has(m.identity.id) && seen.add(m.identity.id))
    .map((m) => ({
      devops_user_id: m.identity.id,
      nome: m.identity.displayName ?? m.identity.uniqueName ?? "Sem nome",
      unique_name: m.identity.uniqueName ?? null,
    }));
}

export interface PeriodoRow {
  inicio: string;
  fim: string;
}

export interface CapacidadeRow {
  devops_user_id: string;
  nome: string | null;
  capacidade_dia: number;
  atividades: { nome: string | null; capacidade_dia: number }[];
  dias_off: PeriodoRow[];
}

function periods(ranges: AzdoDateRange[] | undefined): PeriodoRow[] {
  return (ranges ?? [])
    .map((r) => ({ inicio: toDateOnly(r.start), fim: toDateOnly(r.end) }))
    .filter((p): p is PeriodoRow => p.inicio !== null && p.fim !== null);
}

export function mapCapacities(res: AzdoCapacityResponse | null | undefined): CapacidadeRow[] {
  const list = res?.teamMembers ?? res?.value ?? [];
  return list
    .filter((c) => c.teamMember?.id)
    .map((c) => {
      const atividades = (c.activities ?? []).map((a) => ({
        nome: a.name || null,
        capacidade_dia: Number(a.capacityPerDay) || 0,
      }));
      return {
        devops_user_id: c.teamMember.id,
        nome: c.teamMember.displayName ?? null,
        capacidade_dia: atividades.reduce((s, a) => s + a.capacidade_dia, 0),
        atividades,
        dias_off: periods(c.daysOff),
      };
    });
}

export function mapTeamDaysOff(res: AzdoTeamDaysOff | null | undefined): PeriodoRow[] {
  return periods(res?.daysOff);
}
