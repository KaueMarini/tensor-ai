import { describe, expect, it } from "vitest";
import { AzdoHttpError, backoffMs, chunk, createAzdoClient, parseRetryAfter } from "./client.ts";

function fakeFetch(responses: (Response | Error)[]) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("sem resposta");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } });

describe("cliente Azure DevOps", () => {
  it("respeita Retry-After em 429 e tenta de novo", async () => {
    const waits: number[] = [];
    const { fn, calls } = fakeFetch([
      new Response("", { status: 429, headers: { "Retry-After": "3" } }),
      json({ count: 1, value: [{ id: "p1", name: "Demo" }] }),
    ]);
    const client = createAzdoClient({ orgUrl: "https://dev.azure.com/org/", pat: "x", fetch: fn, sleep: async (ms) => void waits.push(ms) });
    const projects = await client.listProjects();
    expect(projects).toEqual([{ id: "p1", name: "Demo" }]);
    expect(waits).toEqual([3000]);
    expect(calls[0]).toContain("https://dev.azure.com/org/_apis/projects?api-version=7.1");
  });

  it("faz backoff em erro de rede e 503", async () => {
    const waits: number[] = [];
    const { fn } = fakeFetch([new TypeError("rede"), new Response("", { status: 503 }), json({ id: 7, rev: 1, fields: {} })]);
    const client = createAzdoClient({ orgUrl: "https://x", pat: "x", fetch: fn, sleep: async (ms) => void waits.push(ms) });
    await expect(client.getWorkItem(7)).resolves.toMatchObject({ id: 7 });
    expect(waits).toHaveLength(2);
  });

  it("não tenta de novo em 404 e expõe o status", async () => {
    const { fn, calls } = fakeFetch([new Response("não existe", { status: 404 })]);
    const client = createAzdoClient({ orgUrl: "https://x", pat: "x", fetch: fn, sleep: async () => {} });
    const err = await client.getWorkItem(99).catch((e) => e);
    expect(err).toBeInstanceOf(AzdoHttpError);
    expect(err.status).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it("desiste depois de maxRetries", async () => {
    const { fn, calls } = fakeFetch(Array.from({ length: 5 }, () => new Response("", { status: 500 })));
    const client = createAzdoClient({ orgUrl: "https://x", pat: "x", fetch: fn, sleep: async () => {}, maxRetries: 2 });
    await expect(client.listProjects()).rejects.toMatchObject({ status: 500 });
    expect(calls).toHaveLength(3);
  });

  it("trata página de login (HTML) como PAT inválido", async () => {
    const { fn } = fakeFetch([new Response("<html>login</html>", { status: 200, headers: { "Content-Type": "text/html" } })]);
    const client = createAzdoClient({ orgUrl: "https://x", pat: "x", fetch: fn });
    await expect(client.listProjects()).rejects.toMatchObject({ status: 401 });
  });

  it("workitemsbatch envia fields + errorPolicy e descarta nulos", async () => {
    let body: any;
    const fn = (async (_: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return json({ count: 2, value: [{ id: 1, rev: 1, fields: {} }, null] });
    }) as typeof fetch;
    const client = createAzdoClient({ orgUrl: "https://x", pat: "x", fetch: fn });
    expect(await client.getWorkItemsBatch([1, 2])).toHaveLength(1);
    expect(body.errorPolicy).toBe("Omit");
    expect(body.fields).toContain("System.Parent");
    await expect(client.getWorkItemsBatch(Array.from({ length: 201 }, (_, i) => i))).rejects.toThrow();
  });

  it("utilitários", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter(null)).toBeNull();
    const b = backoffMs(3, () => 1);
    expect(b).toBe(4000);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
