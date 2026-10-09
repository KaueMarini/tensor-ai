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
    expect(r!.acao).toMatchObject({ work_item_id: 3, de_pessoa_id: "kaue", para_pessoa_id: "ana" });
    expect(r!.fatos).toMatchObject({ de_antes_pct: 190, de_depois_pct: 90, de_acima_h: 36, para_depois_pct: 83 });
    expect(r!.gravidade).toBe("critico");
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

  it("tira artigo feminino antes do pseudônimo (o nome real pode ser masculino)", () => {
    const n = (id: string) => nomes[id]!;
    expect(despseudonimizar("A Pessoa A está a 190%. Passar à Pessoa B reduz a carga da Pessoa A.", apelidos, n)).toBe(
      "Kauê está a 190%. Passar para Ana reduz a carga de Kauê.",
    );
    expect(despseudonimizar("Rebalancear para a Pessoa B, pela Pessoa A.", apelidos, n)).toBe("Rebalancear para Ana, por Kauê.");
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
    expect(validar({ titulo: "Passar #3", texto: "Pessoa A estara de ferias na Sprint 1." }, cand!, apelidos)).toMatch(/acentuação/);
    expect(validar({ titulo: "Passar #3", texto: "Pessoa A estará de férias com “Topicos do bot”." }, cand!, apelidos)).toBeNull();
    expect(validar({ titulo: "Passar #3 para Pessoa B", texto: "Pessoa A está a 190% e vai a 90% na Sprint 1." }, cand!, apelidos)).toBeNull();
  });
});

describe("ausência com tasks", () => {
  const folgada = (_p: { id: string }, id: string) => (id === "bia" ? cel("bia", 60, 20) : celulas[id]);
  const conflito = (tarefas: number[]) => ({
    pessoaId: "caio",
    inicio: "2026-10-12",
    fim: "2026-10-16",
    tipo: "ferias",
    origem: "agenda" as const,
    diasUteis: 5,
    horasEmRisco: 12 * tarefas.length,
    gravidade: "critico" as const,
    tarefas: tarefas.map((id) => ({
      id,
      titulo: `Task ${id}`,
      projetoId: "p1",
      horas: 12,
      sprintId: "s1",
      sprintNome: "Sprint 1",
      diasAusente: 5,
      diasUteisSprint: 10,
      pctSprintAusente: 50,
    })),
  });
  const rotasDe = (c: Candidato) => c.detalhe.rotas as { task_id: number; para_pessoa_id: string | null; projeto_semelhante?: string | null; semelhanca_pct?: number }[];
  const ausencias = (e: Partial<Parameters<typeof gerarCandidatos>[0]>) => gerarCandidatos({ ...base, celula: folgada, ...e } as Parameters<typeof gerarCandidatos>[0]).filter((c) => c.tipo === "ausencia");

  it("uma sugestão só por ausência, com todas as tasks e quem assume cada uma", () => {
    const r = ausencias({ tarefas: [task(4, "caio", 12, ["front-end"]), task(5, "caio", 12, ["back-end"])], conflitos: [conflito([4, 5])] });
    expect(r).toHaveLength(1);
    const [a] = r;
    expect(a!.acao).toEqual({
      tipo: "reatribuir_lote",
      itens: [
        { work_item_id: 4, de_pessoa_id: "caio", para_pessoa_id: "ana" },
        { work_item_id: 5, de_pessoa_id: "caio", para_pessoa_id: "bia" },
      ],
    });
    expect(a!.fatos).toMatchObject({ tipo_ausencia: "férias", periodo: "12/10 a 16/10", n_tasks: 2, horas_total: 24, n_roteaveis: 2, n_destinos: 2 });
    expect(a!.gravidade).toBe("critico");
    const t = template(a!, (p) => ({ de: "Caio", para1: "Ana", para2: "Bia" })[p] ?? "?");
    expect(t.titulo).toBe("Caio estará de férias 12/10 a 16/10: 2 tasks para redistribuir");
    expect(t.texto).toContain("Ana assume 1 task (12h), Bia assume 1 task (12h)");
    expect(t.texto).toContain("rotear tudo de uma vez");
  });

  it("soma as horas já roteadas antes de escolher a próxima pessoa", () => {
    const pouca = (_p: { id: string }, id: string) => (id === "ana" ? cel("ana", 40, 20) : id === "bia" ? cel("bia", 40, 20) : celulas[id]);
    const [a] = ausencias({ celula: pouca, tarefas: [task(4, "caio", 12), task(5, "caio", 12)], conflitos: [conflito([4, 5])] });
    const destinos = rotasDe(a!).map((r) => r.para_pessoa_id);
    expect(new Set(destinos).size).toBe(2);
  });

  it("experiência em projeto parecido pesa na escolha", () => {
    const pessoas = [pessoa("caio", "Caio"), pessoa("ana", "Ana"), { ...pessoa("bia", "Bia"), projetos: ["p1", "p2"] }];
    const [a] = ausencias({
      pessoas,
      tarefas: [task(4, "caio", 12)],
      conflitos: [conflito([4])],
      portfolio: { avaliacoes: [], parecidos: [{ a: "p1", b: "p2", similaridade: 0.8, porDescricao: 0.8, porTags: 0.8, emComum: [], palavras: [] }] },
      projetos: [...base.projetos, { id: "p2", nome: "Farol", descricao: null, tags: [], nMembros: 1, nItens: 3 }],
    });
    expect(rotasDe(a!)[0]).toMatchObject({ para_pessoa_id: "bia", projeto_semelhante: "Farol", semelhanca_pct: 80 });
  });

  it("a análise de um só projeto monta o mesmo lote completo (chave estável)", () => {
    const outra = { ...task(5, "caio", 12), projetoId: "p2" };
    const pessoas = [...base.pessoas.map((p) => ({ ...p, projetos: ["p1", "p2"] }))];
    const conf = conflito([4, 5]);
    conf.tarefas[1]!.projetoId = "p2";
    const e = { pessoas, tarefas: [task(4, "caio", 12), outra], conflitos: [conf] };
    const [geral] = ausencias(e);
    const [soP2] = ausencias({ ...e, escopo: ["p2"] });
    expect(soP2!.chave).toBe(geral!.chave);
    expect(rotasDe(soP2!)).toHaveLength(2);
  });

  it("quem também está ausente no período não recebe a task", () => {
    const celulaComAna = (p: { id: string }, id: string) => (p.id.startsWith("aus-") && id === "ana" ? cel("ana", 0, 0) : folgada(p, id));
    const [a] = ausencias({ celula: celulaComAna, tarefas: [task(4, "caio", 12, ["front-end"])], conflitos: [conflito([4])] });
    expect(rotasDe(a!)[0]!.para_pessoa_id).toBe("bia");
  });
});
