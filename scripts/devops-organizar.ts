// pnpm devops:organizar [--dry]
// Organiza a org de demo como uma empresa: cada pessoa com um foco, tasks coerentes com
// esse foco e alocação de horas realista por projeto (soma ≤ jornada de 8h/dia).
//   1. Capacity por pessoa × time × sprint no Azure DevOps (ALOCACAO).
//   2. Responsável das tasks ABERTAS conforme o foco (RESPONSAVEIS); fechadas ficam como estão
//      (histórico). Algumas tasks ficam sem dono de propósito, para a tela Análises sugerir.
//   3. No app (Supabase): tag de função e skills principais de cada pessoa, como o gestor
//      faria (origem 'gestor', confirmadas).
// Idempotente: compara antes de escrever. --dry só mostra o que faria.

import { createAzdoClient } from "../supabase/functions/_shared/azdo/client.ts";
import type { AzdoCapacity, AzdoPatchOp, AzdoTeamMember, AzdoWorkItem } from "../supabase/functions/_shared/azdo/types.ts";

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k} no .env.local`);
  return v;
};

const azdo = createAzdoClient({ orgUrl: need("AZDO_ORG_URL"), pat: need("AZDO_PAT") });
const SB = need("SUPABASE_URL").replace(/\/$/, "");
const KEY = need("SUPABASE_SERVICE_ROLE_KEY"); // só local, nunca no front
const DRY = process.argv.includes("--dry");
const enc = encodeURIComponent;
const SPRINTS = ["Sprint 1", "Sprint 2", "Sprint 3"];

type Pessoa =
  | "kaue" | "laryssa" | "nicolas" | "julliano" | "abner" | "sebastiao" | "aaron"
  | "abigail" | "alexsandro" | "arao" | "thabata" | "valeria" | "wallace";

// ---------------------------------------------------------------------------
// A "empresa"
// ---------------------------------------------------------------------------

const PERFIL: Record<Pessoa, { funcao: string; skills: string[] }> = {
  kaue: { funcao: "Tech Lead", skills: ["back-end", "integracao-fiscal", "integracao", "api"] },
  laryssa: { funcao: "Front-end", skills: ["front-end", "react", "design-system", "dataviz"] },
  nicolas: { funcao: "Back-end", skills: ["back-end", "realtime", "performance", "testes"] },
  julliano: { funcao: "Dados & BI", skills: ["dados", "power-bi", "sql", "power-automate"] },
  abner: { funcao: "Mobile", skills: ["mobile", "front-end", "ux"] },
  sebastiao: { funcao: "Back-end", skills: ["back-end", "api", "tempo-real"] },
  aaron: { funcao: "QA", skills: ["testes", "performance"] },
  abigail: { funcao: "Copilot Studio", skills: ["copilot-studio", "ia"] },
  alexsandro: { funcao: "Power Platform", skills: ["power-platform", "integracao", "power-automate"] },
  arao: { funcao: "Dados & BI", skills: ["dados", "power-bi", "analise"] },
  thabata: { funcao: "QA", skills: ["testes", "qa"] },
  valeria: { funcao: "Conteúdo & UX", skills: ["documentacao", "ux", "i18n"] },
  wallace: { funcao: "Infra & Segurança", skills: ["infra", "seguranca"] },
};

/** Horas/dia por projeto. Quem não aparece no projeto fica com 6h/dia (time único). */
const ALOCACAO: Record<string, Partial<Record<Pessoa, number>>> = {
  IportJLNK: { kaue: 4 },
  IportJLKN12: { kaue: 2 },
  "Eu amo a Laryssa": { kaue: 2 },
  Teste: { kaue: 0 },
};
const PADRAO_H_DIA = 6;

/** devops_id → responsável. Ausentes ficam como estão; null = deixar sem dono. */
const RESPONSAVEIS: Record<number, Pessoa | null> = {
  // IportJLKN12 — pátio e agendamento
  16: "laryssa", 28: "laryssa", 29: "laryssa",
  17: "nicolas", 18: "nicolas", 19: "nicolas", 26: "nicolas",
  20: "julliano", 21: "julliano", 22: "julliano", 23: "julliano", 24: "julliano", 25: "julliano",
  27: "kaue",
  // Eu amo a Laryssa — app do motorista (Abner perto do limite na Sprint 1, de propósito)
  61: "abner", 63: "abner", 64: "abner", 66: "abner", 68: "abner", 75: "abner", 81: "abner", 85: "abner", 87: "abner",
  69: "sebastiao", 70: "sebastiao", 74: "sebastiao", 76: "sebastiao", 77: "sebastiao", 80: "sebastiao", 82: "sebastiao", 86: "sebastiao",
  65: "aaron", 72: "aaron", 78: "aaron", 83: "aaron", 88: "aaron",
  71: "kaue",
  // Teste — bot de atendimento (54, 57 e 59 ficam sem dono para a tela Análises)
  35: "abigail", 36: "abigail", 49: "abigail",
  45: "alexsandro", 46: "alexsandro",
  51: "arao", 52: "arao", 53: "arao",
  38: "thabata", 48: "thabata", 58: "thabata",
  41: "valeria", 42: "valeria", 43: "valeria", 56: "valeria",
  37: "wallace", 47: "wallace",
  54: null, 57: null, 59: null,
  // IportJLNK — fiscal (só o Kauê no time: o resto fica sem dono até entrar gente)
  91: "kaue", 92: "kaue", 96: "kaue", 97: "kaue", 101: "kaue", 102: "kaue", 103: "kaue", 104: "kaue",
  109: "kaue", 112: "kaue", 113: "kaue",
};

const TAGS_DE_TESTE = ["kotlin"]; // sobras de testes manuais

// ---------------------------------------------------------------------------

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const chave = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "");
const quemE = (nome: string): Pessoa | undefined =>
  (Object.keys(PERFIL) as Pessoa[]).find((p) => norm(nome).startsWith(p));

async function sb<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  const txt = await res.text();
  return (txt ? JSON.parse(txt) : null) as T;
}

let mudancas = 0;
const fazer = async (descricao: string, acao: () => Promise<unknown>) => {
  mudancas++;
  console.log(`  ${DRY ? "(dry) " : ""}${descricao}`);
  if (!DRY) await acao();
};

async function organizarProjeto(projeto: { id: string; name: string }) {
  console.log(`\n▶ ${projeto.name}`);
  const time = (await azdo.listTeams(projeto.id))[0];
  if (!time) return;
  const membros: AzdoTeamMember[] = await azdo.listTeamMembers(projeto.id, time.id);
  const porPessoa = new Map<Pessoa, AzdoTeamMember["identity"]>();
  for (const m of membros) {
    const p = quemE(m.identity.displayName ?? "");
    if (p) porPessoa.set(p, m.identity);
  }

  // 1. Capacity
  const iteracoes = (await azdo.listTeamIterations(projeto.id, time.id)).filter((i) => SPRINTS.includes(i.name));
  for (const it of iteracoes) {
    const base = `${enc(projeto.id)}/${enc(time.id)}/_apis/work/teamsettings/iterations/${it.id}`;
    const resp = await azdo.getCapacities(projeto.id, time.id, it.id);
    const atuais: AzdoCapacity[] = resp.teamMembers ?? resp.value ?? [];
    for (const m of membros) {
      const p = quemE(m.identity.displayName ?? "");
      const alvo = (p && ALOCACAO[projeto.name]?.[p]) ?? PADRAO_H_DIA;
      const atual = atuais.find((c) => c.teamMember.id === m.identity.id);
      const hoje = (atual?.activities ?? []).reduce((n, a) => n + (a.capacityPerDay ?? 0), 0);
      if (hoje === alvo) continue;
      await fazer(`capacity ${it.name} · ${m.identity.displayName}: ${hoje} → ${alvo}h/dia`, () =>
        azdo.request("PATCH", `${base}/capacities/${m.identity.id}`, {
          body: { activities: [{ name: "Development", capacityPerDay: alvo }], daysOff: atual?.daysOff ?? [] },
        }),
      );
    }
  }

  // 2. Responsáveis das tasks abertas + limpeza de tags de teste
  const ids = await azdo.wiqlIds(projeto.id, "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project");
  const itens: AzdoWorkItem[] = ids.length
    ? await azdo.getWorkItemsBatch(ids, ["System.Id", "System.Title", "System.State", "System.AssignedTo", "System.Tags", "System.WorkItemType"])
    : [];
  const estados = new Map<string, string>();
  for (const i of itens) {
    const tipo = String(i.fields["System.WorkItemType"]);
    if (!estados.has(tipo) && !["Feature", "Epic"].includes(tipo)) {
      for (const e of await azdo.getWorkItemTypeStates(projeto.id, tipo)) estados.set(`${tipo}|${e.name}`, e.category);
    }
  }
  for (const i of itens) {
    const tipo = String(i.fields["System.WorkItemType"]);
    const cat = estados.get(`${tipo}|${i.fields["System.State"]}`);
    const ops: AzdoPatchOp[] = [];
    const notas: string[] = [];

    const tags = String(i.fields["System.Tags"] ?? "").split(";").map((t) => t.trim()).filter(Boolean);
    const limpas = tags.filter((t) => !TAGS_DE_TESTE.includes(t.toLowerCase()));
    if (limpas.length !== tags.length) {
      // "add" em System.Tags acrescenta; para tirar tag é preciso "replace" com a lista final
      ops.push({ op: "replace", path: "/fields/System.Tags", value: limpas.join("; ") });
      notas.push("remove tag de teste");
    }

    if (i.id in RESPONSAVEIS && cat !== "Completed" && cat !== "Removed") {
      const alvoP = RESPONSAVEIS[i.id];
      const atual = (i.fields["System.AssignedTo"] as { uniqueName?: string; displayName?: string } | undefined) ?? undefined;
      const alvo = alvoP ? porPessoa.get(alvoP) : undefined;
      if (alvoP && !alvo) {
        console.warn(`  ! #${i.id}: ${alvoP} não está no time de ${projeto.name}`);
      } else if ((alvo?.uniqueName ?? null) !== (atual?.uniqueName ?? null)) {
        ops.push(
          alvo
            ? { op: "add", path: "/fields/System.AssignedTo", value: alvo.uniqueName }
            : { op: "remove", path: "/fields/System.AssignedTo" },
        );
        notas.push(`${atual?.displayName ?? "sem dono"} → ${alvo?.displayName ?? "sem dono"}`);
      }
    }
    if (ops.length) await fazer(`#${i.id} ${i.fields["System.Title"]}: ${notas.join(", ")}`, () => azdo.updateWorkItem(i.id, ops));
  }
}

async function organizarPerfis() {
  console.log("\n▶ Funções e skills no app");
  const pessoas = await sb<{ id: string; nome: string }[]>("pessoa?select=id,nome");
  const funcoes = await sb<{ id: number; nome: string }[]>("funcao_tag?select=id,nome");
  for (const [p, perfil] of Object.entries(PERFIL) as [Pessoa, (typeof PERFIL)[Pessoa]][]) {
    const pessoa = pessoas.find((x) => quemE(x.nome) === p);
    if (!pessoa) {
      console.warn(`  ! ${p} não está no banco`);
      continue;
    }
    let funcao = funcoes.find((f) => chave(f.nome) === chave(perfil.funcao));
    if (!funcao) {
      if (DRY) {
        console.log(`  (dry) cria função ${perfil.funcao}`);
        mudancas++;
      } else {
        [funcao] = await sb<{ id: number; nome: string }[]>("funcao_tag", { method: "POST", body: JSON.stringify({ nome: perfil.funcao }) });
        funcoes.push(funcao!);
        mudancas++;
        console.log(`  + função ${perfil.funcao}`);
      }
    }
    if (funcao) {
      const tem = await sb<unknown[]>(`pessoa_funcao_tag?pessoa_id=eq.${pessoa.id}&funcao_tag_id=eq.${funcao.id}&select=pessoa_id`);
      if (!tem.length) {
        await fazer(`${pessoa.nome}: função ${perfil.funcao}`, () =>
          sb("pessoa_funcao_tag", { method: "POST", body: JSON.stringify({ pessoa_id: pessoa.id, funcao_tag_id: funcao!.id }) }),
        );
      }
    }
    const skills = await sb<{ id: number; tag: string; confirmada: boolean; rejeitada: boolean }[]>(
      `skill_tag?pessoa_id=eq.${pessoa.id}&select=id,tag,confirmada,rejeitada`,
    );
    for (const s of perfil.skills) {
      const existente = skills.find((x) => chave(x.tag) === chave(s));
      if (existente?.confirmada && !existente.rejeitada) continue;
      await fazer(`${pessoa.nome}: skill ${s}${existente ? " (confirma a sugerida)" : ""}`, () =>
        existente
          ? sb(`skill_tag?id=eq.${existente.id}`, { method: "PATCH", body: JSON.stringify({ confirmada: true, rejeitada: false }) })
          : sb("skill_tag", { method: "POST", body: JSON.stringify({ pessoa_id: pessoa.id, tag: s, origem: "gestor", confirmada: true }) }),
      );
    }
  }
}

async function main() {
  for (const p of await azdo.listProjects()) await organizarProjeto(p);
  await organizarPerfis();
  console.log(`\n${mudancas} mudança(s)${DRY ? " (dry, nada aplicado)" : ""}. O app recebe pelo webhook em segundos.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
