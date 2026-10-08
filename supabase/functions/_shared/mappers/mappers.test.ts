import { describe, expect, it } from "vitest";
import batch from "../__fixtures__/workitemsbatch.json" with { type: "json" };
import tree from "../__fixtures__/iterations-tree.json" with { type: "json" };
import capacities from "../__fixtures__/capacities.json" with { type: "json" };
import teamDaysOff from "../__fixtures__/team-daysoff.json" with { type: "json" };
import members from "../__fixtures__/team-members.json" with { type: "json" };
import hookUpdated from "../__fixtures__/webhook-updated.json" with { type: "json" };
import hookDeleted from "../__fixtures__/webhook-deleted.json" with { type: "json" };
import type { AzdoClassificationNode, AzdoWorkItem } from "../azdo/types.ts";
import { normalizeIterationPath, toDateOnly } from "./paths.ts";
import { lerDescricaoProjeto } from "./projeto.ts";
import { mapWorkItem, parentId, parseTags } from "./workItem.ts";
import { flattenIterations, mapCapacities, mapMembers, mapTeamDaysOff, sprintsAtivas } from "./team.ts";
import { extractWebhookRef } from "./webhook.ts";

const PROJ = "badd3c28-0000-0000-0000-000000000000";
const items = batch.value as AzdoWorkItem[];

describe("paths", () => {
  it("normaliza caminho de classification node para o formato do IterationPath", () => {
    expect(normalizeIterationPath("\\Demo\\Iteration\\Sprint 1")).toBe("Demo\\Sprint 1");
    expect(normalizeIterationPath("\\Demo\\Iteration\\Release 1\\Sprint 2")).toBe("Demo\\Release 1\\Sprint 2");
    expect(normalizeIterationPath("Demo\\Sprint 1")).toBe("Demo\\Sprint 1");
    expect(normalizeIterationPath("Demo\\Iteration 1")).toBe("Demo\\Iteration 1");
    expect(normalizeIterationPath("\\Demo\\Iteration")).toBe("Demo");
    expect(normalizeIterationPath(null)).toBeNull();
  });

  it("extrai só a data", () => {
    expect(toDateOnly("2026-10-05T00:00:00Z")).toBe("2026-10-05");
    expect(toDateOnly(undefined)).toBeNull();
  });
});

describe("mapWorkItem", () => {
  it("mapeia uma task completa", () => {
    const row = mapWorkItem(items[1]!, PROJ);
    expect(row).toMatchObject({
      devops_id: 7,
      rev: 5,
      projeto_id: PROJ,
      tipo: "Task",
      estado: "Active",
      titulo: "API de janelas disponíveis",
      parent_devops_id: 1,
      responsavel_devops_id: "11111111-1111-1111-1111-111111111111",
      responsavel_nome: "Ana Teste",
      responsavel_unique_name: "ana@exemplo.com",
      iteration_path: "Demo\\Sprint 1",
      horas_estimadas: 16,
      horas_restantes: 10.5,
      horas_concluidas: 5.5,
      tags: ["api", "backend"],
      changed_date: "2026-10-07T09:15:00.123Z",
    });
  });

  it("tolera feature sem responsável nem horas", () => {
    const row = mapWorkItem(items[0]!, PROJ);
    expect(row.tipo).toBe("Feature");
    expect(row.parent_devops_id).toBeNull();
    expect(row.responsavel_devops_id).toBeNull();
    expect([row.horas_estimadas, row.horas_restantes, row.horas_concluidas]).toEqual([null, null, null]);
  });

  it("tolera task sem estimativa e quase sem campos, lendo o pai pela relação", () => {
    const row = mapWorkItem(items[3]!, PROJ);
    expect(row.parent_devops_id).toBe(30);
    expect(row.estado).toBeNull();
    expect(row.tags).toEqual([]);
    expect(row.start_date).toBeNull();
    expect(row.iteration_path).toBe("Demo");
  });

  it("prefere System.Parent à relação", () => {
    expect(
      parentId({
        fields: { "System.Parent": 5 },
        relations: [{ rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://x/_apis/wit/workItems/9" }],
      }),
    ).toBe(5);
  });

  it("separa, apara e deduplica tags", () => {
    expect(parseTags(" front-end; Backend ;front-end;; backend ")).toEqual(["front-end", "Backend"]);
    expect(parseTags(undefined)).toEqual([]);
  });
});

describe("iterações, membros e capacidade", () => {
  it("achata a árvore de iterações, inclusive aninhadas e sem data", () => {
    const sprints = flattenIterations(tree as AzdoClassificationNode, PROJ);
    expect(sprints.map((s) => [s.nome, s.iteration_path, s.inicio, s.fim])).toEqual([
      ["Sprint 1", "Demo\\Sprint 1", "2026-10-05", "2026-10-16"],
      ["Release 1", "Demo\\Release 1", null, null],
      ["Sprint 2", "Demo\\Release 1\\Sprint 2", "2026-10-19", "2026-10-30"],
      ["Iteration 1", "Demo\\Iteration 1", null, null],
    ]);
  });

  it("deduplica membros", () => {
    expect(mapMembers(members.value).map((m) => m.nome)).toEqual(["Ana Teste", "Bruno Teste"]);
  });

  it("soma atividades e converte days off", () => {
    const [ana, bruno] = mapCapacities(capacities);
    expect(ana).toMatchObject({ capacidade_dia: 6, dias_off: [{ inicio: "2026-10-08", fim: "2026-10-09" }] });
    expect(ana!.atividades).toEqual([
      { nome: "Development", capacidade_dia: 4 },
      { nome: "Testing", capacidade_dia: 2 },
    ]);
    expect(bruno).toMatchObject({ capacidade_dia: 0, atividades: [{ nome: null, capacidade_dia: 0 }] });
    expect(mapCapacities(undefined)).toEqual([]);
    expect(mapTeamDaysOff(teamDaysOff)).toEqual([{ inicio: "2026-11-02", fim: "2026-11-02" }]);
  });
});

describe("webhook", () => {
  it("em updated usa workItemId, não resource.id", () => {
    expect(extractWebhookRef(hookUpdated)).toEqual({
      tipo: "workitem.updated",
      devopsId: 7,
      rev: 6,
      projetoId: PROJ,
      chave: "27646e0e-b520-4d2b-9411-bba7524947cd",
    });
  });

  it("em deleted usa resource.id", () => {
    expect(extractWebhookRef(hookDeleted)).toMatchObject({ tipo: "workitem.deleted", devopsId: 19, rev: 4 });
  });

  it("gera chave determinística quando o evento não tem id", () => {
    const ref = extractWebhookRef({ eventType: "workitem.created", resource: { id: 40, rev: 1 } });
    expect(ref.chave).toBe("workitem.created:40:1:");
  });
});

describe("sprintsAtivas", () => {
  it("mantém atual, futuras e sem data; descarta encerradas", () => {
    const ativas = sprintsAtivas(
      [
        { id: "passada", fim: "2026-09-30" },
        { id: "atual", fim: "2026-10-16" },
        { id: "termina-hoje", fim: "2026-10-07" },
        { id: "futura", fim: "2026-11-13" },
        { id: "sem-data", fim: null },
      ],
      "2026-10-07",
    );
    expect([...ativas].sort()).toEqual(["atual", "futura", "sem-data", "termina-hoje"]);
  });
});

describe("lerDescricaoProjeto", () => {
  it("separa a linha Tags da descrição", () => {
    const r = lerDescricaoProjeto("Plataforma de agendamento.\n\nTags: Agendamento, patio; tempo-real , agendamento");
    expect(r.descricao).toBe("Plataforma de agendamento.");
    expect(r.tags).toEqual(["agendamento", "patio", "tempo-real"]);
  });
  it("sem linha de tags e sem descrição", () => {
    expect(lerDescricaoProjeto("Só texto")).toEqual({ descricao: "Só texto", tags: [] });
    expect(lerDescricaoProjeto(undefined)).toEqual({ descricao: null, tags: [] });
  });
});
