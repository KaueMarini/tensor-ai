// pnpm devops:projeto-novo [--dry] [--excluir]
// Cria no Azure DevOps um projeto fictício NOVO e SEM PESSOAS ("Farol Cargas"), com descrição e
// linha "Tags:", para demonstrar a equipe sugerida (squad parecido / pessoas avulsas).
// Quem cria o projeto entra sozinho no time padrão: o script tira essa pessoa (Graph API), para
// o projeto ficar realmente vazio. Idempotente. --excluir manda o projeto para a lixeira.
//
// Exige PAT com Project and Team (Read, write & manage) e Graph (Read & manage).

import { AzdoHttpError, createAzdoClient } from "../supabase/functions/_shared/azdo/client.ts";

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k} no .env.local`);
  return v;
};
const ORG_URL = need("AZDO_ORG_URL").replace(/\/$/, "");
const PAT = need("AZDO_PAT");
const azdo = createAzdoClient({ orgUrl: ORG_URL, pat: PAT });
const DRY = process.argv.includes("--dry");
const EXCLUIR = process.argv.includes("--excluir");

const NOME = "Farol Cargas";
const DESCRICAO =
  "Portal web para transportadoras acompanharem a fila do gate e o agendamento de janelas no porto, com " +
  "emissão de CT-e e NF-e integrada à SEFAZ. Front em React, APIs com atualização em tempo real e painel " +
  "de indicadores em Power BI para o comercial. Testes automatizados antes de cada entrega.\n\n" +
  "Tags: agendamento, front-end, integracao-fiscal, tempo-real, power-bi, testes";

// vssps: onde ficam Graph (descritores e memberships)
const VSSPS = ORG_URL.replace("://dev.azure.com/", "://vssps.dev.azure.com/");
const auth = `Basic ${Buffer.from(`:${PAT}`).toString("base64")}`;
async function graph<T>(metodo: string, caminho: string): Promise<T> {
  const res = await fetch(`${VSSPS}/_apis/graph/${caminho}${caminho.includes("?") ? "&" : "?"}api-version=7.1-preview.1`, {
    method: metodo,
    headers: { Authorization: auth, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Graph ${metodo} ${caminho}: ${res.status} ${await res.text()}`);
  return (res.status === 204 || metodo === "DELETE" ? undefined : await res.json()) as T;
}

async function aguardar(op: { id: string }) {
  for (let i = 0; i < 90; i++) {
    const s = await azdo.request<{ status: string; resultMessage?: string }>("GET", `_apis/operations/${op.id}`);
    if (s.status === "succeeded") return;
    if (s.status === "failed" || s.status === "cancelled") throw new Error(s.resultMessage ?? `operação ${s.status}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("operação demorou demais");
}

async function main() {
  let projeto = (await azdo.listProjects()).find((p) => p.name === NOME);

  if (EXCLUIR) {
    if (!projeto) return console.log(`= ${NOME} não existe`);
    console.log(`${DRY ? "(dry) " : ""}× excluindo ${NOME} (lixeira do DevOps, 28 dias)`);
    if (!DRY) await aguardar(await azdo.request<{ id: string }>("DELETE", `_apis/projects/${projeto.id}`));
    return;
  }

  if (!projeto) {
    const processos = await azdo.request<{ value: { id: string; name: string }[] }>("GET", "_apis/process/processes");
    const agile = processos.value.find((p) => p.name === "Agile") ?? processos.value[0]!;
    console.log(`${DRY ? "(dry) " : ""}+ criando ${NOME} (processo ${agile.name})`);
    if (DRY) return;
    await aguardar(
      await azdo.request<{ id: string }>("POST", "_apis/projects", {
        body: {
          name: NOME,
          description: DESCRICAO,
          visibility: "private",
          capabilities: { versioncontrol: { sourceControlType: "Git" }, processTemplate: { templateTypeId: agile.id } },
        },
      }),
    );
    projeto = (await azdo.listProjects()).find((p) => p.name === NOME)!;
  } else {
    console.log(`= ${NOME} já existe (${projeto.id})`);
  }

  // Esvazia os times: o criador entra sozinho no time padrão
  for (const time of await azdo.listTeams(projeto.id)) {
    const membros = await azdo.listTeamMembers(projeto.id, time.id);
    if (membros.length === 0) {
      console.log(`  time "${time.name}": já sem membros`);
      continue;
    }
    const container = (await graph<{ value: string }>("GET", `descriptors/${time.id}`)).value;
    for (const m of membros) {
      const idMembro = m.identity.id;
      console.log(`${DRY ? "(dry) " : ""}  - tirando ${m.identity.displayName} do time "${time.name}"`);
      if (DRY) continue;
      const sujeito = (await graph<{ value: string }>("GET", `descriptors/${idMembro}`)).value;
      await graph("DELETE", `memberships/${sujeito}/${container}`);
    }
  }
  console.log(`\nPronto: ${NOME} sem pessoas. A reconciliação (cron de 5 min) ou devops-sync traz para o app.`);
}

main().catch((err) => {
  if (err instanceof AzdoHttpError && (err.status === 401 || err.status === 403))
    console.error("O PAT não tem permissão: precisa de Project and Team (manage) e Graph (manage).");
  else console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
