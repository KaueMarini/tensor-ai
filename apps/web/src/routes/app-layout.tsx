import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FolderKanban, House, Lightbulb, LogOut, Menu, Moon, RefreshCw, SlidersHorizontal, Sun, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useProjetosPorIds, useSemDonoResumo, useSyncState } from "@/lib/queries";
import { RealtimeProvider, useRealtime } from "@/lib/realtime";
import { useRecentes } from "@/lib/recentes";
import { useTheme } from "@/lib/theme";
import { cn, formatHora, tempoRelativo } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { SomenteGestor } from "@/lib/papel";
import { MarcaProjeto } from "@/components/avatar";
import { SinoNotificacoes } from "@/components/notificacoes";
import { Glossario } from "@/components/ajuda";

export function AppLayout() {
  const [menuAberto, setMenuAberto] = useState(false);
  const caminho = useRouterState({ select: (s) => s.location.pathname });

  // no celular/tablet a sidebar é uma gaveta: fecha ao navegar e com Esc
  useEffect(() => setMenuAberto(false), [caminho]);
  useEffect(() => {
    if (!menuAberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [menuAberto]);

  return (
    <RealtimeProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar aberto={menuAberto} />
        {menuAberto && (
          <div className="anim-fade fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMenuAberto(false)} aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* barra superior em todas as telas: menu (celular) à esquerda, notificações à direita */}
          <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
              aria-expanded={menuAberto}
              className="-ml-1.5 cursor-pointer rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="size-5" />
            </button>
            <span className="flex items-center gap-2.5 lg:hidden">
              <Logo />
              <span className="text-sm font-semibold tracking-tight dark:text-slate-100">Radar de Capacidade</span>
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Glossario />
              <SinoNotificacoes />
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </RealtimeProvider>
  );
}

const ITEM_NAV =
  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";
const ITEM_ATIVO =
  "bg-brand-50 font-medium text-brand-900 hover:bg-brand-50 dark:bg-brand-900/30 dark:text-brand-200 dark:hover:bg-brand-900/30";
const GRUPO = "px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500";

function Sidebar({ aberto }: { aberto: boolean }) {
  const recentes = useRecentes();
  const { data } = useProjetosPorIds(recentes);
  const semDono = (useSemDonoResumo().data ?? []).reduce((n, p) => n + (p.tasks ?? 0), 0);
  const projetosRecentes = recentes.map((id) => data?.find((p) => p.id === id)).filter((p) => !!p);

  return (
    <aside
      className={cn(
        "flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none",
        aberto ? "translate-x-0 shadow-2xl" : "-translate-x-full",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-100 px-4 dark:border-slate-800">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight dark:text-slate-100">Radar</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">de Capacidade</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        <div className="space-y-0.5">
          <Link to="/inicio" title="Resumo do dia: quem está sobrecarregado e o que fazer" className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <House className="size-4 shrink-0 opacity-70" /> Início
          </Link>
          <Link to="/projetos" title="Todos os projetos do Azure DevOps" activeOptions={{ includeSearch: false }} className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <FolderKanban className="size-4 shrink-0 opacity-70" /> Projetos
          </Link>
          <Link to="/membros" title="Pessoas, quanto cada uma está ocupada e o que sabe fazer" activeOptions={{ includeSearch: false }} className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <Users className="size-4 shrink-0 opacity-70" /> Equipe
          </Link>
          <SomenteGestor oculto>
          <Link to="/analises" title="Quem pode assumir as tarefas que estão sem responsável" activeOptions={{ includeSearch: false }} className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <Lightbulb className="size-4 shrink-0 opacity-70" /> Sugestões
            {semDono > 0 && (
              <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold tabular-nums text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" title="Tarefas abertas sem responsável">
                {semDono}
              </span>
            )}
          </Link>
          </SomenteGestor>
        </div>

        <div>
          <div className={GRUPO}>Calendário</div>
          <Link to="/agenda" activeOptions={{ includeSearch: false }} className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <CalendarDays className="size-4 shrink-0 opacity-70" /> Agenda
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
        <SomenteGestor oculto>
        <div>
          <div className={GRUPO}>Ajustes</div>
          <Link to="/capacidade" className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <SlidersHorizontal className="size-4 shrink-0 opacity-70" /> Regras de capacidade
          </Link>
          <Link to="/sincronizacao" className={ITEM_NAV} activeProps={{ className: ITEM_ATIVO }}>
            <RefreshCw className="size-4 shrink-0 opacity-70" /> Sincronização
          </Link>
        </div>
        </SomenteGestor>
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
