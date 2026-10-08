import { describe, expect, it } from "vitest";
import { lerSkills } from "./skills";

describe("lerSkills", () => {
  it("separa confirmadas, sugeridas e descartadas", () => {
    const r = lerSkills([
      { tag: "Java", origem: "gestor", confirmada: true, rejeitada: false, evidencias: 0 },
      { tag: "back-end", origem: "tasks", confirmada: false, rejeitada: false, evidencias: 6 },
      { tag: "kotlin", origem: "tasks", confirmada: false, rejeitada: true, evidencias: 2 },
    ]);
    expect(r.skills).toEqual(["Java", "back-end"]);
    expect(r.sugeridas).toEqual(["back-end"]);
    expect(r.descartadas).toEqual(["kotlin"]);
    expect(r.info["back-end"]?.evidencias).toBe(6);
  });

  it("formato antigo ({ tag }) conta como skill confirmada do gestor", () => {
    const r = lerSkills([{ tag: "React" }]);
    expect(r.skills).toEqual(["React"]);
    expect(r.sugeridas).toEqual([]);
    expect(r.info.React).toMatchObject({ origem: "gestor", confirmada: true });
  });

  it("tolera nulo", () => {
    expect(lerSkills(null).skills).toEqual([]);
  });
});
