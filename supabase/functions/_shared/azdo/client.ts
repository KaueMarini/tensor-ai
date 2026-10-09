import type {
  AzdoCapacityResponse,
  AzdoClassificationNode,
  AzdoList,
  AzdoPatchOp,
  AzdoProject,
  AzdoTeam,
  AzdoTeamDaysOff,
  AzdoTeamIteration,
  AzdoTeamMember,
  AzdoWiqlResult,
  AzdoWorkItem,
  AzdoWorkItemState,
} from "./types.ts";

export const API_VERSION = "7.1";

export type Logger = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;

export interface AzdoClientConfig {
  orgUrl: string;
  pat: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: Logger;
  maxRetries?: number;
}

export class AzdoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`Azure DevOps ${status} em ${url}: ${body.slice(0, 300)}`);
    this.name = "AzdoHttpError";
  }
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 30_000;

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export function backoffMs(attempt: number, random = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
  return Math.round(base / 2 + random() * (base / 2));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const WORK_ITEM_FIELDS = [
  "System.Id",
  "System.Rev",
  "System.WorkItemType",
  "System.State",
  "System.Title",
  "System.Description",
  "System.Parent",
  "System.AssignedTo",
  "System.AreaPath",
  "System.IterationPath",
  "System.Tags",
  "System.ChangedDate",
  "System.TeamProject",
  "Microsoft.VSTS.Scheduling.OriginalEstimate",
  "Microsoft.VSTS.Scheduling.RemainingWork",
  "Microsoft.VSTS.Scheduling.CompletedWork",
  "Microsoft.VSTS.Scheduling.StartDate",
  "Microsoft.VSTS.Scheduling.FinishDate",
  "Microsoft.VSTS.Scheduling.TargetDate",
  "Microsoft.VSTS.Common.Activity",
  "Microsoft.VSTS.Common.Priority",
  "System.CreatedDate",
  "Microsoft.VSTS.Common.StateChangeDate",
  "Microsoft.VSTS.Common.ActivatedDate",
  "Microsoft.VSTS.Common.ClosedDate",
];

export function createAzdoClient(config: AzdoClientConfig) {
  const orgUrl = config.orgUrl.replace(/\/+$/, "");
  const doFetch = config.fetch ?? fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const log: Logger = config.log ?? (() => {});
  const maxRetries = config.maxRetries ?? 5;
  const auth = "Basic " + btoa(":" + config.pat);
  const seg = encodeURIComponent;

  function url(path: string, query: Record<string, string | number | boolean | undefined> = {}) {
    const u = new URL(path.startsWith("http") ? path : `${orgUrl}/${path.replace(/^\/+/, "")}`);
    if (!u.searchParams.has("api-version")) u.searchParams.set("api-version", API_VERSION);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async function request<T>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | number | boolean | undefined>; body?: unknown; contentType?: string } = {},
  ): Promise<T> {
    const target = url(path, opts.query);
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(target, {
          method,
          headers: {
            Authorization: auth,
            Accept: "application/json",
            ...(opts.body !== undefined ? { "Content-Type": opts.contentType ?? "application/json" } : {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
      } catch (err) {
        if (attempt >= maxRetries) throw err;
        const wait = backoffMs(attempt);
        log("warn", "azdo: erro de rede, tentando de novo", { url: target, attempt, wait, erro: String(err) });
        await sleep(wait);
        continue;
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        if (text && !(res.headers.get("Content-Type") ?? "").includes("json")) {
          throw new AzdoHttpError(401, target, "resposta não-JSON (PAT inválido, expirado ou sem escopo?)");
        }
        return (text ? JSON.parse(text) : undefined) as T;
      }

      const body = await res.text().catch(() => "");
      if (RETRY_STATUS.has(res.status) && attempt < maxRetries) {
        const wait = parseRetryAfter(res.headers.get("Retry-After")) ?? backoffMs(attempt);
        log("warn", "azdo: limitado ou indisponível, aguardando", {
          url: target,
          status: res.status,
          attempt,
          wait,
          rateLimitRemaining: res.headers.get("X-RateLimit-Remaining"),
        });
        await sleep(wait);
        continue;
      }
      throw new AzdoHttpError(res.status, target, body);
    }
  }

  const get = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) =>
    request<T>("GET", path, { query });

  return {
    orgUrl,
    request,

    listProjects: async () => (await get<AzdoList<AzdoProject>>("_apis/projects", { $top: 500 })).value,

    getProject: (project: string) =>
      get<AzdoProject>(`_apis/projects/${seg(project)}`, { includeCapabilities: true }),

    listTeams: async (projectId: string) =>
      (await get<AzdoList<AzdoTeam>>(`_apis/projects/${seg(projectId)}/teams`, { $top: 500 })).value,

    listTeamMembers: async (projectId: string, teamId: string) =>
      (await get<AzdoList<AzdoTeamMember>>(`_apis/projects/${seg(projectId)}/teams/${seg(teamId)}/members`, {
        $top: 1000,
      })).value,

    getIterationTree: (projectId: string) =>
      get<AzdoClassificationNode>(`${seg(projectId)}/_apis/wit/classificationnodes/iterations`, { $depth: 20 }),

    listTeamIterations: async (projectId: string, teamId: string) =>
      (await get<AzdoList<AzdoTeamIteration>>(`${seg(projectId)}/${seg(teamId)}/_apis/work/teamsettings/iterations`))
        .value,

    getCapacities: (projectId: string, teamId: string, iterationId: string) =>
      get<AzdoCapacityResponse>(
        `${seg(projectId)}/${seg(teamId)}/_apis/work/teamsettings/iterations/${seg(iterationId)}/capacities`,
      ),

    getTeamDaysOff: (projectId: string, teamId: string, iterationId: string) =>
      get<AzdoTeamDaysOff>(
        `${seg(projectId)}/${seg(teamId)}/_apis/work/teamsettings/iterations/${seg(iterationId)}/teamdaysoff`,
      ),

    wiqlIds: async (projectId: string, query: string, top = 20000) =>
      (await request<AzdoWiqlResult>("POST", `${seg(projectId)}/_apis/wit/wiql`, {
        query: { timePrecision: true, $top: top },
        body: { query },
      })).workItems.map((w) => w.id),

    getWorkItemsBatch: async (ids: number[], fields: string[] = WORK_ITEM_FIELDS) => {
      if (ids.length === 0) return [];
      if (ids.length > 200) throw new Error("workitemsbatch aceita no máximo 200 ids");
      const res = await request<AzdoList<AzdoWorkItem | null>>("POST", "_apis/wit/workitemsbatch", {
        body: { ids, fields, errorPolicy: "Omit" },
      });
      return res.value.filter((w): w is AzdoWorkItem => w !== null);
    },

    getWorkItem: (id: number) => get<AzdoWorkItem>(`_apis/wit/workitems/${id}`, { $expand: "relations" }),

    getWorkItemTypeStates: async (projectId: string, type: string) =>
      (await get<AzdoList<AzdoWorkItemState>>(`${seg(projectId)}/_apis/wit/workitemtypes/${seg(type)}/states`)).value,

    updateWorkItem: (id: number, ops: AzdoPatchOp[]) =>
      request<AzdoWorkItem>("PATCH", `_apis/wit/workitems/${id}`, {
        body: ops,
        contentType: "application/json-patch+json",
      }),

    listRecycleBinIds: async (projectId: string) =>
      (await get<AzdoList<{ id: number }>>(`${seg(projectId)}/_apis/wit/recyclebin`, {
        "api-version": "7.1-preview.2",
      })).value.map((w) => w.id),
  };
}

export type AzdoClient = ReturnType<typeof createAzdoClient>;
