import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FolderKanban, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useProjetos, useSyncState } from "@/lib/queries";
import { RealtimeProvider, useRealtime } from "@/lib/realtime";
import { cn, formatHora, tempoRelativo } from "@/lib/utils";
import { Logo } from "@/components/logo";

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

function Sidebar() {
  const { data: projetos, isLoading } = useProjetos();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-100 px-4">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Radar</div>
          <div className="text-[11px] text-slate-500">de Capacidade</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Projetos</div>
        {isLoading && <div className="mx-2 h-8 animate-pulse rounded-md bg-slate-100" />}
        {projetos?.map((p) => (
          <Link
            key={p.id}
            to="/projetos/$projetoId"
            params={{ projetoId: p.id }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            activeProps={{ className: "bg-brand-50 font-medium text-brand-900 hover:bg-brand-50" }}
          >
            <FolderKanban className="size-4 shrink-0 opacity-70" />
            <span className="truncate">{p.nome}</span>
          </Link>
        ))}
        {projetos?.length === 0 && <p className="px-2 text-xs text-slate-500">Nenhum projeto sincronizado ainda.</p>}
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
    <div className="mx-2 mb-2 space-y-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs">
      <div className="flex items-center gap-2 font-medium text-slate-700">
        <span className="relative flex size-2">
          {status === "ao-vivo" && (
            <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", cfg.cor)} />
          )}
          <span className={cn("relative inline-flex size-2 rounded-full", cfg.cor)} />
        </span>
        {cfg.texto}
      </div>
      <div className="text-slate-500" title={ultima ? formatHora(ultima) : undefined}>
        Última reconciliação {tempoRelativo(ultima)}
        {falhou && <span className="text-red-600"> · com erro</span>}
      </div>
    </div>
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
    <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
      <div className="min-w-0 flex-1 truncate text-xs text-slate-500">{email}</div>
      <button
        onClick={sair}
        className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        title="Sair"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
