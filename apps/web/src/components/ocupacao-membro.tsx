// Ocupação de uma pessoa na ficha (drawer): próximas semanas, de onde vem a carga e a jornada
// dela — tudo o que o gestor precisa para decidir sem trocar de tela.

import { Link } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { useCargaGlobal } from "@/lib/carga-global";
import { proximasSemanas, semanas } from "@/lib/ocupacao";
import { useSalvarRegraPessoa } from "@/lib/regras";
import { formatHoras } from "@/lib/utils";
import { MedidorCarga, pct, STATUS_CARGA } from "@/components/carga";
import { CampoRegra } from "@/components/campo-regra";

const SEMANAS = semanas(4);
const DUAS = proximasSemanas(2);

export function OcupacaoMembro({
  pessoaId,
  nomeProjeto,
  onNavegar,
}: {
  pessoaId: string;
  nomeProjeto: (id: string) => string;
  onNavegar?: () => void;
}) {
  const { celula, regras, carregando } = useCargaGlobal([pessoaId]);
  const salvar = useSalvarRegraPessoa();

  if (carregando || !celula || !regras) return <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />;

  const c = celula(DUAS, pessoaId);
  const propria = regras.pessoas.get(pessoaId);
  const h = regras.horas(pessoaId);
  const gravar = (campo: "jornadaDia" | "foco", v: number | null) =>
    salvar.mutate({
      pessoaId,
      jornadaDia: campo === "jornadaDia" ? v : (propria?.jornadaDia ?? null),
      foco: campo === "foco" ? v : (propria?.foco ?? null),
    });

  return (
    <section>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Gauge className="size-4 text-brand-700 dark:text-brand-300" /> Ocupação em todos os projetos
      </h3>
      {c && (
        <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Próximas 2 semanas</span>
            <span className="text-2xl font-semibold tabular-nums" style={{ color: c.status === "ok" ? undefined : STATUS_CARGA[c.status].cor }}>
              {pct(c.utilizacao)}
            </span>
          </div>
          <MedidorCarga celula={c} />

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {SEMANAS.map((s, i) => {
              const w = celula(s, pessoaId);
              if (!w) return <div key={s.id} />;
              const st = STATUS_CARGA[w.status];
              const altura = w.capacidadeH > 0 ? Math.min(1, w.cargaH / w.capacidadeH) : w.cargaH > 0 ? 1 : 0;
              return (
                <div key={s.id} className="text-center" title={`${formatHoras(w.cargaH)} de ${formatHoras(w.capacidadeH)} · ${st.rotulo}`}>
                  <div className="relative mx-auto h-12 w-full overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                    <div className="absolute inset-x-0 bottom-0 rounded-md" style={{ height: `${altura * 100}%`, background: st.cor, opacity: 0.85 }} />
                  </div>
                  <div className="mt-1 text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                    {w.capacidadeH === 0 ? "ausente" : pct(w.utilizacao)}
                  </div>
                  <div className="text-[10px] text-slate-400">{i === 0 ? "esta sem." : s.rotulo}</div>
                </div>
              );
            })}
          </div>

          {c.porProjeto.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 dark:border-slate-800">
              {c.porProjeto.map((x) => (
                <li key={x.projetoId} className="flex items-center justify-between gap-2 text-xs">
                  <Link
                    to="/projetos/$projetoId/equipe"
                    params={{ projetoId: x.projetoId }}
                    onClick={onNavegar}
                    className="truncate text-slate-700 hover:text-brand-700 hover:underline dark:text-slate-300 dark:hover:text-brand-300"
                  >
                    {nomeProjeto(x.projetoId)}
                  </Link>
                  <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{formatHoras(x.cargaH)}</span>
                    {c.cargaH > 0 && ` · ${Math.round((x.cargaH / c.cargaH) * 100)}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span>Jornada</span>
        <CampoRegra rotulo="Jornada da pessoa" unidade="h" min={1} max={24} valor={propria?.jornadaDia ?? null} herdado={regras.geral.jornadaDia} onSalvar={(v) => gravar("jornadaDia", v)} className="w-24" />
        <span>× foco</span>
        <CampoRegra rotulo="Foco da pessoa" unidade="%" min={10} max={100} valor={propria?.foco ?? null} herdado={regras.geral.foco} onSalvar={(v) => gravar("foco", v)} className="w-24" />
        <span>
          = <strong className="tabular-nums text-slate-900 dark:text-slate-100">{formatHoras(h.horasDia)}/dia</strong>
          {h.origem === "padrao" && <span className="text-slate-400"> (regra geral)</span>}
        </span>
      </div>
    </section>
  );
}
