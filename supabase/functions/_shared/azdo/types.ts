export interface AzdoIdentityRef {
  id: string;
  displayName?: string;
  uniqueName?: string;
  descriptor?: string;
}

export interface AzdoProject {
  id: string;
  name: string;
  description?: string;
  state?: string;
  capabilities?: { processTemplate?: { templateName?: string } };
}

export interface AzdoTeam {
  id: string;
  name: string;
  projectId?: string;
}

export interface AzdoTeamMember {
  identity: AzdoIdentityRef;
  isTeamAdmin?: boolean;
}

export interface AzdoClassificationNode {
  id: number;
  identifier: string;
  name: string;
  path: string;
  structureType?: string;
  hasChildren?: boolean;
  attributes?: { startDate?: string; finishDate?: string };
  children?: AzdoClassificationNode[];
}

export interface AzdoTeamIteration {
  id: string;
  name: string;
  path: string;
  attributes?: { startDate?: string | null; finishDate?: string | null; timeFrame?: string };
}

export interface AzdoDateRange {
  start: string;
  end: string;
}

export interface AzdoCapacity {
  teamMember: AzdoIdentityRef;
  activities: { name?: string | null; capacityPerDay: number }[];
  daysOff: AzdoDateRange[];
}

export interface AzdoCapacityResponse {
  teamMembers?: AzdoCapacity[];
  value?: AzdoCapacity[];
  totalCapacityPerDay?: number;
  totalDaysOff?: number;
}

export interface AzdoTeamDaysOff {
  daysOff: AzdoDateRange[];
}

export interface AzdoRelation {
  rel: string;
  url: string;
  attributes?: Record<string, unknown>;
}

export interface AzdoWorkItem {
  id: number;
  rev: number;
  fields: Record<string, unknown>;
  relations?: AzdoRelation[];
  url?: string;
}

export interface AzdoWiqlResult {
  workItems: { id: number; url?: string }[];
  asOf?: string;
}

export type AzdoStateCategory = "Proposed" | "InProgress" | "Resolved" | "Completed" | "Removed";

export interface AzdoWorkItemState {
  name: string;
  color?: string;
  category: AzdoStateCategory;
}

export interface AzdoPatchOp {
  op: "add" | "replace" | "remove" | "test";
  path: string;
  value?: unknown;
}

export interface AzdoList<T> {
  count: number;
  value: T[];
}

export interface AzdoServiceHookPayload {
  id?: string;
  eventType?: string;
  notificationId?: number;
  publisherId?: string;
  createdDate?: string;
  resource?: {
    id?: number;
    workItemId?: number;
    rev?: number;
    fields?: Record<string, unknown>;
    revision?: { id?: number; rev?: number; fields?: Record<string, unknown> };
  };
  resourceContainers?: { project?: { id?: string } };
}
