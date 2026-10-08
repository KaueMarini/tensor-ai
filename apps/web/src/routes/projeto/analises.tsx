// Análises de capacidade: mapa de utilização pessoa × sprint, alertas (sobrecarga, sem
// capacidade, sem responsável, sem estimativa) e quem tem folga. Números vêm do motor.

import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { AlertTriangle, BatteryMedium, CalendarRange, Gauge, Grid3x3, Hourglass, Lightbulb, UserRoundX } from "lucide-react";
import type { Celula, StatusCarga } from "@shared/capacidade/motor";
import { useCapacidadeProjeto } from "@/lib/capacidade-projeto";
import { cn, formatData, formatHoras } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { MedidorCarga, ORIGEM_CAPACIDADE, pct, STATUS_CARGA, StatusCargaTag } from "@/components/carga";
import { Card, CardTitulo, Stat } from "@/components/ui/card";

const GRAVIDADE: Record<StatusCarga, number> = { "sem-capacidade": 3, sobrecarga: 2, limite: 1, ok: 0 };

export function AnalisesPage() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const cap = useCapacidadeProjeto(projetoId);
  const [sprintId, setSprintId] = useState<string | null>(null);
  const sprint = cap.sprints.find((s) => s.id === sprintId) ?? cap.sprintAtual;

  const daSprint = useMemo(() => {
    if (!sprint) return [];
    return cap.pessoas
      .map((p) => ({ p, c: cap.celula(sprint.id, p.id)! }))
      .filter((x) => x.c)
      .sort((a, b) => GRAVIDADE[b.c.status] - GRAVIDADE[a.c.status] || (b.c.utilizacao ?? 0) - (a.c.utilizacao ?? 0));
  }, [cap, sprint]);

  const alertas = useMemo(() => {
    const out: { chave: string; status: StatusCarga; texto: string; detalhe: string }[] = [];
    for (const s of cap.sprints.filter((x) => x.status !== "passada")) {
      for (const p of cap.pessoas) {
        const c = cap.celula(s.id, p.id);
        if (!c || c.status === "ok") continue;
        const detalhe = `${formatHoras(c.cargaH)} de ${formatHoras(c.capacidadeH)} · ${c.itens} ${c.itens === 1 ? "task" : "tasks"}`;
        if (c.status === "sem-capacidade")
          out.push({ chave: `${s.id}${p.id}`, status: c.status, texto: `${p.nome} tem tasks na ${s.nome}, mas está sem capacidade (folga ou férias)`, detalhe });
        else if (c.status === "sobrecarga")
          out.push({
            chave: `${s.id}${p.id}`,
            status: c.status,
            texto: `${p.nome} vai a ${pct(c.utilizacao)} na ${s.nome} — ${formatHoras(-c.livreH)} acima da capacidade`,
            detalhe,
          });
        else out.push({ chave: `${s.id}${p.id}`, status: c.status, texto: `${p.nome} está no limite na ${s.nome} (${pct(c.utilizacao)})`, detalhe });
      }
    }
    return out.sort((a, b) => GRAVIDADE[b.status] - GRAVIDADE[a.status]);
  }, [cap]);

  const comFolga = daSprint.filter((x) => x.c.status === "ok" && x.c.livreH > 0).sort((a, b) => b.c.livreH - a.c.livreH);
  const resumo = useMemo(() => {
    const cap0 = daSprint.reduce((s, x) => s + x.c.capacidadeH, 0);
    const carga = daSprint.reduce((s, x) => s + x.c.cargaH, 0);
    return {
      acima: daSprint.filter((x) => x.c.status === "sobrecarga" || x.c.status === "sem-capacidade").length,
      utilizacao: cap0 > 0 ? carga / cap0 : null,
      livre: daSprint.reduce((s, x) => s + Math.max(0, x.c.livreH), 0),
    };
  }, [daSprint]);

  if (cap.carregando) return <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />;
  if (cap.erro) return <p className="text-sm text-red-600">Erro ao carregar: {cap.erro.message}</p>;
  if (cap.sprints.length === 0)
    return (
      <Card className="grid place-items-center px-6 py-16 text-center">
        <CalendarRange className="mb-3 size-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Sem sprints com datas</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A análise de capacidade precisa do período de cada sprint no Azure DevOps.</p>
      </Card>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Capacidade × carga</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Capacidade = horas/dia do DevOps × dias úteis, descontando feriados e days off. Carga = horas restantes das tasks abertas.
          </p>
        </div>
        <select
          value={sprint?.id ?? ""}
          onChange={(e) => setSprintId(e.target.value)}
          className="h-9 cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {cap.sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
              {s.status === "atual" ? " (atual)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icone={UserRoundX} rotulo={`Acima da capacidade · ${sprint?.nome ?? ""}`} valor={resumo.acima} alerta={resumo.acima > 0} />
        <Stat icone={Gauge} rotulo="Utilização do time" valor={pct(resumo.utilizacao)} />
        <Stat icone={BatteryMedium} rotulo="Horas livres no time" valor={formatHoras(resumo.livre)} />
        <Stat
          icone={Hourglass}
          rotulo="Tasks abertas sem dono"
          valor={cap.semResponsavel.length}
          detalhe={`${cap.semEstimativa.length} sem estimativa`}
          alerta={cap.semResponsavel.length > 0}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardTitulo
            icone={Grid3x3}
            titulo="Mapa de utilização"
            descricao="Pessoa × sprint. Passe o mouse para ver horas; clique na sprint para detalhar."
            acao={<LegendaStatus />}
          />
          <Mapa cap={cap} selecionada={sprint?.id} onSprint={setSprintId} />
        </Card>

        <Card>
          <CardTitulo icone={AlertTriangle} titulo="Precisa de atenção" descricao="Sprint atual e futuras." />
          <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {alertas.length === 0 && cap.semResponsavel.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum risco de capacidade à vista.</li>
            )}
            {alertas.map((a) => {
              const s = STATUS_CARGA[a.status];
              return (
                <li key={a.chave} className="flex gap-3 px-5 py-3">
                  <s.icone className="mt-0.5 size-4 shrink-0" style={{ color: s.cor }} />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 dark:text-slate-200">{a.texto}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {s.rotulo} · {a.detalhe}
                    </p>
                  </div>
                </li>
              );
            })}
            {cap.semResponsavel.length > 0 && (
              <li className="flex gap-3 px-5 py-3">
                <UserRoundX className="mt-0.5 size-4 shrink-0" style={{ color: "var(--status-atencao)" }} />
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    {cap.semResponsavel.length} {cap.semResponsavel.length === 1 ? "task aberta sem responsável" : "tasks abertas sem responsável"}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {cap.semResponsavel
                      .slice(0, 3)
                      .map((r) => `#${r.item_id} ${r.item_titulo}`)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            )}
          </ul>
        </Card>
      </div>

      {sprint && (
        <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
          <Card>
            <CardTitulo
              icone={Gauge}
              titulo={`Detalhe · ${sprint.nome}`}
              descricao={`${formatData(sprint.inicio)} a ${formatData(sprint.fim)}`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                    <th className="px-5 py-2.5">Pessoa</th>
                    <th className="px-3 py-2.5 text-right">Dias úteis</th>
                    <th className="px-3 py-2.5 text-right">Capacidade</th>
                    <th className="px-3 py-2.5 text-right">Carga</th>
                    <th className="px-3 py-2.5 text-right">Livre</th>
                    <th className="w-[28%] px-5 py-2.5">Utilização</th>
                  </tr>
                </thead>
                <tbody>
                  {daSprint.map(({ p, c }) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar nome={p.nome} tamanho="xs" className="ring-0" />
                          <span className="truncate text-slate-800 dark:text-slate-200">{p.nome}</span>
                        </div>
                      </td>
                      <td className="px-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{c.diasUteis}</td>
                      <td className="px-3 text-right tabular-nums text-slate-600 dark:text-slate-300" title={`Capacidade: ${ORIGEM_CAPACIDADE[c.origemCapacidade].detalhe}`}>
                        {formatHoras(c.capacidadeH)}
                        {c.origemCapacidade !== "devops" && <span className="text-slate-400">*</span>}
                      </td>
                      <td className="px-3 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">{formatHoras(c.cargaH)}</td>
                      <td className={cn("px-3 text-right tabular-nums", c.livreH < 0 ? "font-medium text-red-700 dark:text-red-400" : "text-slate-600 dark:text-slate-300")}>
                        {formatHoras(c.livreH)}
                      </td>
                      <td className="px-5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <MedidorCarga celula={c} compacto />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums text-slate-700 dark:text-slate-200">{pct(c.utilizacao)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {daSprint.some((x) => x.c.origemCapacidade !== "devops") && (
              <p className="border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                * Capacidade vinda das regras do gestor (painel Capacidade) ou do padrão de mercado, não da Capacity do Azure DevOps.
              </p>
            )}
          </Card>

          <Card>
            <CardTitulo icone={Lightbulb} titulo="Quem pode absorver trabalho" descricao={`Horas livres na ${sprint.nome}, sem passar do limite de atenção (${pct(daSprint[0]?.c.limites.atencao ?? 0.8)}).`} />
            <ul className="space-y-3 px-5 py-4">
              {comFolga.length === 0 && <li className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">Ninguém com folga nesta sprint.</li>}
              {comFolga.slice(0, 6).map(({ p, c }) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Avatar nome={p.nome} tamanho="sm" className="ring-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{p.nome}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{formatHoras(livreAteAtencao(c))}</span> livres
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {p.tags.map((t) => t.nome).concat(p.skills.slice(0, 3)).join(" · ") || "Sem skills/tags cadastradas"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Horas que a pessoa ainda pode receber sem passar do limite de atenção (regras do gestor). */
function livreAteAtencao(c: Celula) {
  return Math.max(0, Math.floor(c.capacidadeH * c.limites.atencao - c.cargaH));
}

function LegendaStatus() {
  return (
    <div className="hidden shrink-0 flex-wrap gap-x-3 gap-y-1 sm:flex">
      {(["ok", "limite", "sobrecarga"] as const).map((s) => (
        <StatusCargaTag key={s} status={s} className="font-normal text-slate-600 dark:text-slate-300" />
      ))}
    </div>
  );
}

function Mapa({
  cap,
  selecionada,
  onSprint,
}: {
  cap: ReturnType<typeof useCapacidadeProjeto>;
  selecionada?: string;
  onSprint: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full border-separate border-spacing-[3px] text-sm">
        <thead>
          <tr>
            <th className="w-44" />
            {cap.sprints.map((s) => (
              <th key={s.id} className="min-w-20 pb-1 align-bottom">
                <button
                  onClick={() => onSprint(s.id)}
                  className={cn(
                    "w-full cursor-pointer rounded-md px-1 py-1 text-[11px] leading-tight font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800",
                    s.id === selecionada ? "bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-100" : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {s.nome}
                  {s.status === "atual" && <span className="block text-[10px] font-normal text-slate-400">atual</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cap.pessoas.map((p) => (
            <tr key={p.id}>
              <td className="pr-2">
                <div className="flex items-center gap-2">
                  <Avatar nome={p.nome} tamanho="xs" className="ring-0" />
                  <span className={cn("truncate text-xs", p.foraDoTime ? "text-slate-400 italic" : "text-slate-700 dark:text-slate-200")} title={p.foraDoTime ? "Tem tasks, mas não está nos times do projeto" : p.nome}>
                    {p.nome}
                  </span>
                </div>
              </td>
              {cap.sprints.map((s) => {
                const c = cap.celula(s.id, p.id);
                if (!c) return <td key={s.id} />;
                const st = STATUS_CARGA[c.status];
                const vazio = c.cargaH === 0 && c.status === "ok";
                return (
                  <td key={s.id} className="p-0">
                    <div
                      className={cn(
                        "group relative grid h-10 place-items-center rounded-md text-xs font-medium tabular-nums",
                        s.id === selecionada && "ring-1 ring-brand-500/60",
                        vazio ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100",
                      )}
                      style={{
                        background: vazio ? "var(--viz-grid)" : `color-mix(in oklab, ${st.cor} ${c.status === "ok" ? 18 : 32}%, transparent)`,
                      }}
                    >
                      <span className="flex items-center gap-1">
                        {c.status !== "ok" && <st.icone className="size-3" style={{ color: st.cor }} />}
                        {c.status === "sem-capacidade" ? "folga" : pct(c.utilizacao)}
                      </span>
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-48 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs font-normal shadow-lg group-hover:block dark:border-slate-700 dark:bg-slate-800">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{p.nome}</div>
                        <div className="mb-1.5 text-slate-500 dark:text-slate-400">{s.nome}</div>
                        <StatusCargaTag status={c.status} />
                        <div className="mt-1 text-slate-600 dark:text-slate-300">
                          {formatHoras(c.cargaH)} de {formatHoras(c.capacidadeH)} · {c.itens} tasks
                        </div>
                        <div className="text-slate-400">{c.diasUteis} dias úteis</div>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
