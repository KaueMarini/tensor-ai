export type Categoria = "Proposed" | "InProgress" | "Resolved";

export interface ItemTempo {
  id: number;
  titulo: string;
  categoria: Categoria;
  responsavelId: string | null;
  horas: number;
  criado: string | null;
  mudouEstado: string | null;
}

export interface SugestaoBase {
  tipo: "atribuir" | "rebalancear" | "ausencia" | "equipe" | "portfolio" | "similares" | "gargalo" | "wip";
  acao: { work_item_id: number; de_pessoa_id: string | null; para_pessoa_id: string } | null;
  fatos: Record<string, string | number>;
  projetoId: string;
}

export interface FerramentaTempo {
  tipo: "tempo";
  alvo: { id: number; titulo: string; leadDias: number | null; paradoDias: number | null; estado: string } | null;
  medianaParadoDias: number;
  medianaLeadDias: number;
  estourado: boolean;
  mapa: { linhas: string[]; colunas: string[]; celulas: number[][]; destaque: [number, number] | null };
  fatos: Record<string, string | number>;
}

export interface FerramentaPareto {
  tipo: "pareto";
  titulo: string;
  unidade: "h" | "dias";
  itens: { rotulo: string; valor: number; acumuladoPct: number; destaque: boolean }[];
  corte80: number;
  fatos: Record<string, string | number>;
}

export type Quadrante = "quick-win" | "grande-aposta" | "preenchimento" | "evitar";
export interface FerramentaMatriz {
  tipo: "matriz";
  eixoEsforco: string;
  eixoImpacto: string;
  pontos: { rotulo: string; esforco: number; impacto: number; destaque: boolean; quadrante: Quadrante }[];
  quadrante: Quadrante;
  fatos: Record<string, string | number>;
}

export type Ferramenta = FerramentaTempo | FerramentaPareto | FerramentaMatriz;

export const ROTULO_QUADRANTE: Record<Quadrante, string> = {
  "quick-win": "Quick win",
  "grande-aposta": "Grande aposta",
  preenchimento: "Preenchimento",
  evitar: "Evitar",
};
const ESTADO: Record<Categoria, string> = { Proposed: "A fazer", InProgress: "Em andamento", Resolved: "Em revisão" };
const FAIXAS = [
  { rotulo: "0–2 dias", ate: 2 },
  { rotulo: "3–7 dias", ate: 7 },
  { rotulo: "8–14 dias", ate: 14 },
  { rotulo: "15+ dias", ate: Infinity },
];
const DIA = 86_400_000;
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const dias = (de: string | null, hoje: string) => (de ? Math.max(0, Math.floor((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(de)) / DIA)) : null);
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function quadranteDe(esforco: number, impacto: number): Quadrante {
  if (impacto >= 0.5) return esforco < 0.5 ? "quick-win" : "grande-aposta";
  return esforco < 0.5 ? "preenchimento" : "evitar";
}

export function pareto(titulo: string, unidade: "h" | "dias", base: { rotulo: string; valor: number; destaque: boolean }[], max = 10): FerramentaPareto | null {
  const lista = base.filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = lista.reduce((n, x) => n + x.valor, 0);
  if (lista.length < 2 || total <= 0) return null;
  let acc = 0;
  const itens = lista.map((x) => {
    acc += x.valor;
    return { ...x, valor: r1(x.valor), acumuladoPct: r0((acc / total) * 100) };
  });
  const corte80 = itens.findIndex((x) => x.acumuladoPct >= 80) + 1;
  const iDestaque = itens.findIndex((x) => x.destaque);
  const mostrados = itens.slice(0, Math.max(max, iDestaque + 1));
  const destaque = iDestaque >= 0 ? itens[iDestaque]! : null;
  return {
    tipo: "pareto",
    titulo,
    unidade,
    itens: mostrados,
    corte80,
    fatos: {
      total: r1(total),
      itens_total: itens.length,
      itens_80: corte80,
      pct_itens_80: r0((corte80 / itens.length) * 100),
      ...(destaque
        ? { destaque: destaque.rotulo, destaque_valor: destaque.valor, destaque_pct: r0((destaque.valor / total) * 100), destaque_posicao: iDestaque + 1, destaque_no_80: iDestaque < corte80 ? "sim" : "não" }
        : {}),
    },
  };
}

function tempo(itens: ItemTempo[], alvoId: number | null, hoje: string): FerramentaTempo | null {
  const comData = itens.filter((i) => i.mudouEstado || i.criado);
  if (comData.length < 2) return null;
  const parado = (i: ItemTempo) => dias(i.mudouEstado ?? i.criado, hoje) ?? 0;
  const lead = (i: ItemTempo) => dias(i.criado, hoje) ?? 0;
  const linhas: Categoria[] = ["Proposed", "InProgress", "Resolved"];
  const celulas = linhas.map(() => FAIXAS.map(() => 0));
  const faixa = (d: number) => FAIXAS.findIndex((f) => d <= f.ate);
  for (const i of comData) celulas[linhas.indexOf(i.categoria)]![faixa(parado(i))]!++;
  const medParado = mediana(comData.map(parado));
  const medLead = mediana(comData.map(lead));
  const a = itens.find((i) => i.id === alvoId);
  const alvo = a
    ? { id: a.id, titulo: a.titulo, leadDias: dias(a.criado, hoje), paradoDias: dias(a.mudouEstado ?? a.criado, hoje), estado: ESTADO[a.categoria] }
    : null;
  const estourado = !!alvo?.paradoDias && alvo.paradoDias > Math.max(7, 2 * medParado);
  const usadas = linhas.map((l, i) => ({ l, i })).filter(({ i }) => celulas[i]!.some((n) => n > 0));
  const destaqueLinha = a ? usadas.findIndex((u) => u.l === a.categoria) : -1;
  return {
    tipo: "tempo",
    alvo,
    medianaParadoDias: r1(medParado),
    medianaLeadDias: r1(medLead),
    estourado,
    mapa: {
      linhas: usadas.map((u) => ESTADO[u.l]),
      colunas: FAIXAS.map((f) => f.rotulo),
      celulas: usadas.map((u) => celulas[u.i]!),
      destaque: a && destaqueLinha >= 0 ? [destaqueLinha, faixa(parado(a))] : null,
    },
    fatos: {
      itens_analisados: comData.length,
      mediana_parado_dias: r1(medParado),
      mediana_lead_dias: r1(medLead),
      parados_15_dias: comData.filter((i) => parado(i) > 14).length,
      ...(alvo ? { alvo_lead_dias: alvo.leadDias ?? "sem data", alvo_parado_dias: alvo.paradoDias ?? "sem data", alvo_estado: alvo.estado, alvo_estourado: estourado ? "sim" : "não" } : {}),
    },
  };
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export function explicar(e: {
  hoje: string;
  sugestao: SugestaoBase;
  itensProjeto: ItemTempo[];
  itensDe?: ItemTempo[];
  portfolio?: { id: string; nome: string; fatia: number; horas: number; impacto: number | null }[];
}): Ferramenta[] {
  const { sugestao: s, hoje } = e;
  const f = s.fatos;
  const alvoId = s.acao?.work_item_id ?? null;
  const out: (Ferramenta | null)[] = [];

  if (s.tipo === "atribuir" || s.tipo === "rebalancear" || s.tipo === "ausencia") {
    const t = tempo(e.itensProjeto, alvoId, hoje);
    if (t && (s.tipo === "atribuir" || t.estourado)) out.push(t);

    if (s.tipo === "atribuir") {
      out.push(
        pareto(
          "Horas sem responsável no projeto",
          "h",
          e.itensProjeto.filter((i) => !i.responsavelId).map((i) => ({ rotulo: `#${i.id} ${i.titulo}`, valor: i.horas, destaque: i.id === alvoId })),
        ),
      );
    } else {
      out.push(
        pareto(
          "Carga aberta da pessoa por task",
          "h",
          (e.itensDe ?? []).map((i) => ({ rotulo: `#${i.id} ${i.titulo}`, valor: i.horas, destaque: i.id === alvoId })),
        ),
      );
    }

    const horas = num(f.horas);
    if (horas > 0) {
    const folgaPara = Math.max(1, 100 - num(f.para_antes_pct));
    const esforco = Math.min(1, Math.max(0, (num(f.para_depois_pct) - num(f.para_antes_pct)) / folgaPara));
    const impacto =
      s.tipo === "atribuir"
        ? Math.min(1, 0.4 + (t?.alvo?.paradoDias && t.alvo.paradoDias > t.medianaParadoDias ? 0.3 : 0) + (horas > 0 ? 0.2 : 0))
        : Math.min(1, num(f.de_acima_h) > 0 ? horas / num(f.de_acima_h) : 0.5);
    const quadrante = quadranteDe(esforco, impacto);
    out.push({
      tipo: "matriz",
      eixoEsforco: "Esforço: quanto da folga de quem recebe a task é consumida",
      eixoImpacto: s.tipo === "atribuir" ? "Impacto: risco de a task seguir parada sem dono" : "Impacto: quanto da sobrecarga a ação resolve",
      pontos: [{ rotulo: `#${alvoId}`, esforco: r1(esforco), impacto: r1(impacto), destaque: true, quadrante }],
      quadrante,
      fatos: {
        quadrante: ROTULO_QUADRANTE[quadrante],
        esforco_pct: r0(esforco * 100),
        impacto_pct: r0(impacto * 100),
        horas,
        ...(s.tipo !== "atribuir" ? { sobrecarga_resolvida_pct: r0(Math.min(1, impacto) * 100), acima_h: num(f.de_acima_h) } : {}),
      },
    });
    }
  }

  if ((s.tipo === "portfolio" || s.tipo === "similares") && e.portfolio?.length) {
    const ESFORCO_MAX = 0.3;
    const foco = s.tipo === "portfolio" ? [s.projetoId] : e.portfolio.filter((p) => p.nome === f.projeto_a || p.nome === f.projeto_b).map((p) => p.id);
    const pontos = e.portfolio
      .filter((p) => p.impacto !== null)
      .map((p) => {
        const esforco = r1(Math.min(1, p.fatia / ESFORCO_MAX));
        const impacto = r1(((p.impacto ?? 1) - 1) / 2);
        return { rotulo: p.nome, esforco, impacto, destaque: foco.includes(p.id), quadrante: quadranteDe(esforco, impacto) };
      });
    const principal = pontos.find((p) => p.destaque);
    if (principal)
      out.push({
        tipo: "matriz",
        eixoEsforco: "Esforço: fatia da capacidade da equipe nas próximas 4 semanas",
        eixoImpacto: "Impacto do projeto (gestor, DevOps ou estimado pela IA)",
        pontos,
        quadrante: principal.quadrante,
        fatos: {
          quadrante: ROTULO_QUADRANTE[principal.quadrante],
          projeto: principal.rotulo,
          ...Object.fromEntries(e.portfolio.map((p) => [`fatia_equipe_pct_${p.nome}`, r0(p.fatia * 100)])),
        },
      });
    if (s.tipo === "portfolio")
      out.push(
        pareto(
          "Capacidade da equipe por projeto (próximas 4 semanas)",
          "h",
          e.portfolio.map((p) => ({ rotulo: p.nome, valor: p.horas, destaque: p.id === s.projetoId })),
        ),
      );
  }

  if (s.tipo === "gargalo") {
    out.push(tempo(e.itensProjeto, null, hoje));
    out.push(
      pareto(
        "Dias parados por task (tasks abertas do projeto)",
        "dias",
        e.itensProjeto.map((i) => ({ rotulo: `#${i.id} ${i.titulo}`, valor: dias(i.mudouEstado ?? i.criado, hoje) ?? 0, destaque: `#${i.id} ${i.titulo}` === f.task_mais_parada })),
      ),
    );
  }

  if (s.tipo === "wip") {
    const andamento = (e.itensDe ?? []).filter((i) => i.categoria === "InProgress");
    out.push(tempo(andamento, null, hoje));
    out.push(
      pareto(
        "Horas das tasks em andamento da pessoa",
        "h",
        andamento.map((i) => ({ rotulo: `#${i.id} ${i.titulo}`, valor: i.horas, destaque: `#${i.id} ${i.titulo}` === f.mais_antiga })),
      ),
    );
  }

  return out.filter((x): x is Ferramenta => x !== null);
}
