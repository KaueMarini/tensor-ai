import { describe, expect, it } from "vitest";
import { type PessoaPerfil, similaridade, sugerirEquipe, termosDoProjeto } from "./equipe-sugerida.ts";

const sk = (tag: string, confirmada = true, evidencias = 3) => ({ tag, confirmada, evidencias });
const pessoa = (id: string, skills: ReturnType<typeof sk>[], livreH = 40, status: PessoaPerfil["status"] = "ok", funcoes: string[] = []): PessoaPerfil => ({
  id,
  skills,
  funcoes,
  capacidadeH: 60,
  livreH,
  status,
});

const projetos = [
  { id: "docas", nome: "Docas", descricao: "Agendamento de janelas no porto, front em React e integração fiscal NF-e.", tags: ["agendamento", "front-end", "integracao-fiscal"] },
  { id: "mare", nome: "Maré", descricao: "Assistente no Teams com Copilot Studio e Power BI.", tags: ["copilot-studio", "power-bi"] },
];
const pessoas = [
  pessoa("ana", [sk("front-end"), sk("react")]),
  pessoa("bia", [sk("integracao-fiscal"), sk("back-end")], 30),
  pessoa("caio", [sk("copilot-studio"), sk("power-bi")]),
  pessoa("duda", [sk("front-end"), sk("integracao-fiscal")], 2, "sobrecarga"),
  pessoa("eli", [sk("testes", false, 5)], 50),
];
const squads = [
  { id: "t-docas", nome: "Squad Docas", projetoId: "docas", pessoaIds: ["ana", "bia", "duda"] },
  { id: "t-mare", nome: "Squad Maré", projetoId: "mare", pessoaIds: ["caio", "eli"] },
];
const alvo = {
  id: "novo",
  nome: "Farol",
  descricao: "Portal web em React para transportadoras acompanharem o agendamento e emitirem CT-e. Testes automatizados.",
  tags: ["agendamento", "front-end"],
};

describe("termosDoProjeto", () => {
  it("junta tags, skills citadas na descrição e sinônimos", () => {
    const catalogo = ["front-end", "react", "integracao-fiscal", "testes", "agendamento", "power-bi"];
    const t = termosDoProjeto(alvo, catalogo);
    const porTermo = Object.fromEntries(t.map((x) => [x.termo, x.origem]));
    expect(porTermo).toMatchObject({ agendamento: "tag", "front-end": "tag", react: "descricao", testes: "descricao", "integracao-fiscal": "sinonimo" });
    expect(porTermo["power-bi"]).toBeUndefined();
  });

  it("termo deduzido que é pedaço de outro não entra (Power BI não vira também bi)", () => {
    const t = termosDoProjeto({ descricao: "Painel em Power BI", tags: ["power-bi"] }, ["power-bi", "bi"]);
    expect(t.map((x) => x.termo)).toEqual(["power-bi"]);
  });

  it("projeto sem descrição nem tags não gera termos (e nenhuma sugestão)", () => {
    const r = sugerirEquipe({ alvo: { ...alvo, descricao: null, tags: [] }, projetos, pessoas, squads });
    expect(r.termos).toEqual([]);
    expect(r.squads).toEqual([]);
  });
});

describe("sugerirEquipe", () => {
  const r = sugerirEquipe({ alvo, projetos, pessoas, squads });

  it("o squad do projeto parecido vem primeiro, com o que cobre e o que falta", () => {
    expect(r.squads[0]!.squadId).toBe("t-docas");
    expect(r.squads[0]!.emComum).toEqual(expect.arrayContaining(["agendamento", "front-end"]));
    expect(r.squads[0]!.faltando).toContain("testes");
    expect(r.squads[0]!.similaridade).toBeGreaterThan(similaridade([], []));
  });

  it("pessoa sobrecarregada cai no ranking mesmo com bom encaixe", () => {
    const ids = r.pessoas.map((p) => p.pessoaId);
    expect(ids.indexOf("ana")).toBeLessThan(ids.indexOf("duda"));
    expect(r.pessoas.find((p) => p.pessoaId === "duda")!.status).toBe("sobrecarga");
  });

  it("montagem cobre os termos com quem está disponível, sem a sobrecarregada", () => {
    expect(r.montagem.pessoaIds).toEqual(expect.arrayContaining(["ana", "bia", "eli"]));
    expect(r.montagem.pessoaIds).not.toContain("duda");
    expect(r.montagem.faltando).toEqual(["agendamento"]);
  });

  it("montagem diz o que cada pessoa cobre e deixa de fora quem tem menos de um dia livre", () => {
    const quase = pessoa("fabi", [sk("testes"), sk("front-end"), sk("integracao-fiscal")], 4, "limite");
    const r2 = sugerirEquipe({ alvo, projetos, pessoas: [...pessoas, quase], squads });
    expect(r2.montagem.pessoaIds).not.toContain("fabi");
    const ana = r2.montagem.pessoas.find((p) => p.pessoaId === "ana")!;
    expect(ana.cobre).toEqual(expect.arrayContaining(["front-end", "react"]));
    expect(ana.livreH).toBe(40);
  });

  it("aponta termo que ninguém da empresa tem", () => {
    expect(r.semNinguem).toEqual(["agendamento"]);
  });

  it("ignora quem já está no projeto", () => {
    const r2 = sugerirEquipe({ alvo, projetos, pessoas, squads, jaNoProjeto: ["ana"] });
    expect(r2.pessoas.some((p) => p.pessoaId === "ana")).toBe(false);
    expect(r2.montagem.pessoaIds).not.toContain("ana");
  });
});
