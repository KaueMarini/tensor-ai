import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Lightbulb, LogOut, Moon, SlidersHorizontal, Sun, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useProjetosPorIds, useSemDonoResumo, useSyncState } from "@/lib/queries";
import { RealtimeProvider, useRealtime } from "@/lib/realtime";
import { useRecentes } from "@/lib/recentes";
import { useTheme } from "@/lib/theme";
import { cn, formatHora, tempoRelativo } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { MarcaProjeto } from "@/components/avatar";

export function AppLayout() {
  return (
    <RealtimeProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </RealtimeProvider>
  );
}

const ITEM_NAV =
  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";
const ITEM_ATIVO =
  "bg-brand-50 font-medium text-brand-900 hover:bg-brand-50 dark:bg-brand-900/30 dark:text-brand-200 dark:hover:bg-brand-900/30";
const GRUPO = "px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500";

function Sidebar() {
  const recentes = useRecentes();
  const { data } = useProjetosPorIds(recentes);
  const semDono = (useSemDonoResumo().data ?? []).reduce((n, p) => n + (p.tasks ?? 0), 0);
  const projetosRecentes = recentes.map((id) => data?.find((p) => p.id === id)).filter((p) => !!p);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-100 px-4 dark:border-slate-800">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight dark:text-slate-100">Radar</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">de Capacidade</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        <div className="space-y-0.5">
          <Link to="/projetos" activeOptions={{ includeSearch: false }} className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <FolderKanban className="size-4 shrink-0 opacity-70" /> Projetos
          </Link>
          <Link to="/membros" activeOptions={{ includeSearch: false }} className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <Users className="size-4 shrink-0 opacity-70" /> Membros
          </Link>
          <Link to="/analises" className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <Lightbulb className="size-4 shrink-0 opacity-70" /> Análises
            {semDono > 0 && (
              <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold tabular-nums text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" title="Tasks abertas sem responsável">
                {semDono}
              </span>
            )}
          </Link>
          <Link to="/capacidade" className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <SlidersHorizontal className="size-4 shrink-0 opacity-70" /> Capacidade
          </Link>
        </div>

        {projetosRecentes.length > 0 && (
          <div>
            <div className={GRUPO}>Recentes</div>
            <div className="space-y-0.5">
              {projetosRecentes.map((p) => (
                <Link
                  key={p.id}
                  to="/projetos/$projetoId"
                  params={{ projetoId: p.id }}
                  className={ITEM_NAV}
                  activeProps={{ className: ITEM_ATIVO }}
                >
                  <MarcaProjeto nome={p.nome} className="size-5 rounded text-[10px]" />
                  <span className="truncate">{p.nome}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      <StatusSync />
      <Usuario />
    </aside>
  );
}

const STATUS_CFG = {
  "ao-vivo": { cor: "bg-emerald-500", texto: "Ao vivo" },
  conectando: { cor: "bg-amber-400", texto: "Conectando…" },
  offline: { cor: "bg-red-500", texto: "Desconectado" },
} as const;

function StatusSync() {
  const { status } = useRealtime();
  const { data } = useSyncState();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const ultima = data
    ?.map((s) => s.ultima_reconciliacao_em)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  const falhou = data?.some((s) => s.ultima_reconciliacao_ok === false);
  const cfg = STATUS_CFG[status];

  return (
    <div className="mx-2 mb-2 space-y-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/50">
      <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
        <span className="relative flex size-2">
          {status === "ao-vivo" && (
            <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", cfg.cor)} />
          )}
          <span className={cn("relative inline-flex size-2 rounded-full", cfg.cor)} />
        </span>
        {cfg.texto}
      </div>
      <div className="text-slate-500 dark:text-slate-400" title={ultima ? formatHora(ultima) : undefined}>
        Última reconciliação {tempoRelativo(ultima)}
        {falhou && <span className="text-red-600 dark:text-red-400"> · com erro</span>}
      </div>
    </div>
  );
}

function AlternarTema() {
  const { tema, alternar } = useTheme();
  return (
    <button
      onClick={alternar}
      className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      title={tema === "escuro" ? "Mudar para tema claro" : "Mudar para tema escuro"}
    >
      {tema === "escuro" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function Usuario() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    qc.clear();
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex items-center gap-1 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
      <div className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">{email}</div>
      <AlternarTema />
      <button
        onClick={sair}
        className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        title="Sair"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
