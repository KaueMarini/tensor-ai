import { describe, expect, it } from "vitest";
import { agruparBacklog, type BacklogRow, sprintStatus } from "./backlog";

const S1 = { id: "s1", nome: "Sprint 1", inicio: "2026-10-05", fim: "2026-10-16" };
const S2 = { id: "s2", nome: "Sprint 2", inicio: "2026-10-19", fim: "2026-10-30" };
const SEM_DATA = { id: "s9", nome: "Iteration 1", inicio: null, fim: null };

function row(p: Partial<BacklogRow>): BacklogRow {
  return {
    projeto_id: "p",
    sprint_id: "s1",
    sprint_nome: "Sprint 1",
    sprint_inicio: null,
    sprint_fim: null,
    feature_id: 10,
    feature_titulo: "Feature A",
    feature_estado: "New",
    item_id: null,
    item_tipo: "Task",
    item_titulo: "Task",
    item_estado: "New",
    item_parent_id: 10,
    responsavel_id: null,
    responsavel_nome: null,
    horas_estimadas: null,
    horas_restantes: null,
    horas_concluidas: null,
    horas_origem: null,
    tags: [],
    sem_estimativa: false,
    atualizado_em: null,
    ...p,
  };
}

describe("sprintStatus", () => {
  it("classifica pela data de hoje", () => {
    expect(sprintStatus("2026-10-05", "2026-10-16", "2026-10-07")).toBe("atual");
    expect(sprintStatus("2026-10-19", "2026-10-30", "2026-10-07")).toBe("futura");
    expect(sprintStatus("2026-09-01", "2026-09-12", "2026-10-07")).toBe("passada");
    expect(sprintStatus(null, null, "2026-10-07")).toBe("sem-data");
  });
});

describe("agruparBacklog", () => {
  const rows = [
    row({ item_id: 1, item_titulo: "API", horas_estimadas: 8, horas_restantes: 6, responsavel_nome: "Kauê" }),
    row({ item_id: 2, item_titulo: "Tela", horas_restantes: 4, tags: ["front-end"] }),
    // Feature B → User Story 20 → Task 21 (hierarquia com nível intermediário)
    row({ sprint_id: "s2", feature_id: 11, feature_titulo: "Feature B", item_id: 20, item_tipo: "User Story", item_parent_id: 11, sem_estimativa: true }),
    row({ sprint_id: "s2", feature_id: 11, feature_titulo: "Feature B", item_id: 21, item_parent_id: 20, sem_estimativa: true }),
    // Feature sem filhos
    row({ sprint_id: "s2", feature_id: 12, feature_titulo: "Feature C", item_id: null, item_tipo: null }),
    // item sem sprint e sem feature
    row({ sprint_id: null, feature_id: null, feature_titulo: null, item_id: 99, item_parent_id: null }),
  ];

  it("agrupa Sprint → Feature → itens, ignora iteração vazia sem data e cria 'Sem sprint'", () => {
    const g = agruparBacklog([S1, S2, SEM_DATA], rows, { hoje: "2026-10-07" });
    expect(g.map((s) => s.nome)).toEqual(["Sprint 1", "Sprint 2", "Sem sprint"]);
    expect(g[0]!.status).toBe("atual");
    expect(g[1]!.features.map((f) => f.titulo)).toEqual(["Feature B", "Feature C"]);
    expect(g[2]!.features[0]!.titulo).toBe("Sem feature");
  });

  it("aninha a Task embaixo da User Story e conta 'sem estimativa' só nas folhas", () => {
    const g = agruparBacklog([S1, S2], rows, { hoje: "2026-10-07" });
    const b = g[1]!.features[0]!;
    expect(b.itens.map((n) => [n.row.item_id, n.depth, n.temFilhos])).toEqual([
      [20, 0, true],
      [21, 1, false],
    ]);
    expect(b.totais.semEstimativa).toBe(1);
    expect(g[1]!.features[1]!.itens).toEqual([]);
  });

  it("soma horas por feature e por sprint", () => {
    const g = agruparBacklog([S1], rows, { hoje: "2026-10-07" });
    expect(g[0]!.totais).toMatchObject({ itens: 2, estimadas: 8, restantes: 10 });
  });

  it("filtra por texto, tag, responsável ou #id", () => {
    expect(agruparBacklog([S1, S2], rows, { busca: "front-end" }).flatMap((s) => s.features.flatMap((f) => f.itens.map((i) => i.row.item_id)))).toEqual([2]);
    expect(agruparBacklog([S1, S2], rows, { busca: "kauê" })[0]!.features[0]!.itens).toHaveLength(1);
    expect(agruparBacklog([S1, S2], rows, { busca: "#21" }).map((s) => s.nome)).toEqual(["Sprint 2"]);
  });
});
