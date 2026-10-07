// Tipos mínimos dos payloads da REST API do Azure DevOps (api-version 7.1).
// Só o que a sync usa; campos desconhecidos são tolerados.

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
  value?: AzdoCapacity[]; // formatos antigos devolvem em "value"
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

export interface AzdoList<T> {
  count: number;
  value: T[];
}

/** Payload de Service Hook (workitem.created/updated/deleted/restored). */
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
