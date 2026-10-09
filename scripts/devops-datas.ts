import { createAzdoClient } from "../supabase/functions/_shared/azdo/client.ts";

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k}`);
  return v;
};
const azdo = createAzdoClient({ orgUrl: need("AZDO_ORG_URL"), pat: need("AZDO_PAT") });
const URL = need("SUPABASE_URL");
const KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CAMPOS = ["System.Id", "System.CreatedDate", "Microsoft.VSTS.Common.StateChangeDate", "Microsoft.VSTS.Common.ActivatedDate", "Microsoft.VSTS.Common.ClosedDate"];

const itens = (await (await fetch(`${URL}/rest/v1/work_item?select=devops_id,fields&deleted_at=is.null`, { headers: H })).json()) as {
  devops_id: number;
  fields: Record<string, unknown>;
}[];
console.log(`${itens.length} itens no banco`);
let n = 0;
for (let i = 0; i < itens.length; i += 200) {
  const lote = itens.slice(i, i + 200);
  const doDevops = await azdo.getWorkItemsBatch(lote.map((x) => x.devops_id), CAMPOS);
  for (const w of doDevops) {
    const atual = lote.find((x) => x.devops_id === w.id);
    if (!atual) continue;
    const novos = Object.fromEntries(CAMPOS.slice(1).filter((c) => w.fields[c] !== undefined).map((c) => [c, w.fields[c]]));
    if (Object.entries(novos).every(([k, v]) => atual.fields?.[k] === v)) continue;
    const r = await fetch(`${URL}/rest/v1/work_item?devops_id=eq.${w.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ fields: { ...atual.fields, ...novos } }),
    });
    if (!r.ok) throw new Error(`#${w.id}: ${r.status} ${await r.text()}`);
    n++;
  }
}
console.log(`${n} itens atualizados com as datas`);
