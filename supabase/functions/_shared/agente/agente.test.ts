import { describe, expect, it } from "vitest";
import type { CelulaGlobal } from "../capacidade/global.ts";
import { type Candidato, gerarCandidatos, type PessoaAgente, type TarefaAgente } from "./candidatos.ts";
import { despseudonimizar, pseudonimos, template, validar } from "./texto.ts";

const LIM = { atencao: 0.8, sobrecarga: 1 };
function cel(pessoaId: string, capacidadeH: number, cargaH: number): CelulaGlobal {
  const u = capacidadeH > 0 ? cargaH / capacidadeH : null;
  return {
    sprintId: "x",
    pessoaId,
    diasUteis: 10,
    capacidadeDia: capacidadeH / 10,
    origemCapacidade: "devops",
    limites: LIM,
    capacidadeH,
    cargaH,
    livreH: capacidadeH - cargaH,
    utilizacao: u,
    status: capacidadeH <= 0 ? (cargaH > 0 ? "sem-capacidade" : "ok") : u! > 1 ? "sobrecarga" : u! > 0.8 ? "limite" : "ok",
    itens: 1,
    porProjeto: [],
  };
}

const pessoa = (id: string, nome: string, skills: string[] = []): PessoaAgente => ({
  id,
  nome,
  skills: skills.map((tag) => ({ tag, confirmada: true, evidencias: 3 })),
  funcoes: [],
  projetos: ["p1"],
});
const sprint = { id: "s1", nome: "Sprint 1", inicio: "2026-10-05", fim: "2026-10-16" };
const task = (id: number, responsavelId: string | null, horas: number | null, tags: string[] = []): TarefaAgente => ({
  id,
  titulo: `Task ${id}`,
  projetoId: "p1",
  sprint,
  responsavelId,
  horas,
  tags,
  featureTags: [],
});

const celulas: Record<string, CelulaGlobal> = {
  kaue: cel("kaue", 40, 76),
  ana: cel("ana", 60, 10),
  bia: cel("bia", 60, 50),
  caio: cel("caio", 0, 12),
};
const base = {
  hoje: "2026-10-09",
  periodo: { id: "prox2", inicio: "2026-10-05", fim: "2026-10-16" },
  pessoas: [pessoa("kaue", "Kauê", ["back-end"]), pessoa("ana", "Ana", ["front-end"]), pessoa("bia", "Bia", ["back-end"]), pessoa("caio", "Caio")],
  projetos: [{ id: "p1", nome: "Docas", descricao: null, tags: [], nMembros: 4, nItens: 10 }],
  squads: [],
  celula: (_p: { id: string }, id: string) => celulas[id],
};

describe("gerarCandidatos", () => {
  const cands = gerarCandidatos({
    ...base,
    tarefas: [task(1, null, 8, ["front-end"]), task(2, "kaue", 20, ["back-end"]), task(3, "kaue", 40), task(4, "caio", 12)],
  });
  const por = (tipo: Candidato["tipo"]) => cands.filter((c) => c.tipo === tipo);

  it("task sem dono vai para quem tem a skill e folga", () => {
    const [a] = por("atribuir");
    expect(a!.acao).toEqual({ tipo: "reatribuir", work_item_id: 1, de_pessoa_id: null, para_pessoa_id: "ana" });
    expect(a!.fatos).toMatchObject({ para_antes_pct: 17, para_depois_pct: 30, horas: 8 });
  });

  it("sobrecarregado: passa a menor task que resolve o excesso, para quem não estoura", () => {
    const [r] = por("rebalancear");
    // excesso = 76 − 40 = 36h: a task de 40h é a menor que resolve
    expect(r!.acao).toMatchObject({ work_item_id: 3, de_pessoa_id: "kaue", para_pessoa_id: "ana" });
    expect(r!.fatos).toMatchObject({ de_antes_pct: 190, de_depois_pct: 90, de_acima_h: 36, para_depois_pct: 83 });
    expect(r!.gravidade).toBe("critico");
  });

  it("ausente com task: passa a maior para alguém disponível", () => {
    const [a] = por("ausencia");
    expect(a!.acao).toMatchObject({ work_item_id: 4, de_pessoa_id: "caio" });
    expect(["ana", "bia"]).toContain(a!.acao!.para_pessoa_id);
  });

  it("chaves estáveis para não repetir a mesma sugestão", () => {
    expect(por("atribuir")[0]!.chave).toBe("atribuir:1:-:ana");
  });

  it("não sugere se o destino passaria do limite", () => {
    const so = gerarCandidatos({ ...base, pessoas: [base.pessoas[0]!, base.pessoas[2]!], tarefas: [task(9, null, 40)] });
    expect(so.filter((c) => c.tipo === "atribuir")).toEqual([]);
  });

  it("projeto novo sem equipe vira sugestão de montagem", () => {
    const c = gerarCandidatos({
      ...base,
      projetos: [...base.projetos, { id: "p2", nome: "Farol", descricao: "Portal em React", tags: ["front-end"], nMembros: 0, nItens: 0 }],
      tarefas: [],
    }).find((x) => x.tipo === "equipe");
    expect(c?.projetoId).toBe("p2");
    expect(Object.values(c!.papeis)).toContain("ana");
  });
});

describe("texto e validador", () => {
  const [cand] = gerarCandidatos({ ...base, tarefas: [task(3, "kaue", 40)] }).filter((c) => c.tipo === "rebalancear");
  const apelidos = pseudonimos([cand!]);
  const nomes: Record<string, string> = { kaue: "Kauê", ana: "Ana" };

  it("pseudônimos e volta aos nomes reais", () => {
    expect(apelidos.get("kaue")).toBe("Pessoa A");
    expect(despseudonimizar("Pessoa A passa para Pessoa B", apelidos, (id) => nomes[id]!)).toBe("Kauê passa para Ana");
  });

  it("template usa só os fatos", () => {
    const t = template(cand!, (papel) => nomes[cand!.papeis[papel]!]!);
    expect(t.titulo).toBe("Passar #3 de Kauê para Ana");
    expect(t.texto).toContain("190%");
    expect(validar({ titulo: "ok", texto: t.texto.replace(/Kauê/g, "Pessoa A").replace(/Ana/g, "Pessoa B") }, cand!, apelidos)).toBeNull();
  });

  it("reprova número inventado, pessoa estranha e fala de desempenho", () => {
    expect(validar({ titulo: "Passar #3", texto: "Pessoa A está a 175%." }, cand!, apelidos)).toMatch(/número inventado/);
    expect(validar({ titulo: "Passar #3", texto: "Pessoa C pode ajudar." }, cand!, apelidos)).toMatch(/pessoa fora/);
    expect(validar({ titulo: "Passar #3", texto: "Pessoa B tem mais produtividade." }, cand!, apelidos)).toMatch(/desempenho/);
    expect(validar({ titulo: "Passar #3 para Pessoa B", texto: "Pessoa A está a 190% e vai a 90% na Sprint 1." }, cand!, apelidos)).toBeNull();
  });
});
