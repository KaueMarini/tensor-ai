// Ajustes › Sincronização: saúde da ligação com o Azure DevOps (estado por projeto, sincronizar
// agora), os últimos eventos recebidos dos Service Hooks e a AUDITORIA de tudo que o app escreveu
// no DevOps (mover, atribuir, sugestões aprovadas): quem, quando, antes e depois.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, CheckCircle2, History, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useProjetosPagina, useSyncState } from "@/lib/queries";
import { cn, formatHora, normalizarNome, tempoRelativo } from "@/lib/utils";
import { MarcaProjeto } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitulo } from "@/components/ui/card";

const AZDO_ORG_URL = (import.meta.env.VITE_AZDO_ORG_URL as string | undefined)?.replace(/\/$/, "");

const FASE: Record<string, string> = {
  concluido: "Em dia",
  meta: "Importando estrutura…",
  itens: "Importando itens…",
  sweep: "Conferindo exclusões…",
};
const TIPO_EVENTO: Record<string, string> = {
  "workitem.created": "Item criado",
  "workitem.updated": "Item alterado",
  "workitem.deleted": "Item excluído",
  "workitem.restored": "Item restaurado",
};
const TIPO_ACAO: Record<string, string> = {
  mover_estado: "Moveu no Kanban",
  atribuir: "Atribuiu responsável",
};

function useEventos() {
  return useQuery({
    queryKey: ["sync_state", "eventos"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evento")
        .select("id, tipo, devops_id, status, erro, recebido_em, processado_em")
        .order("recebido_em", { ascending: false })
        .limit(25);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function useAuditoria() {
  return useQuery({
    queryKey: ["backlog", "auditoria"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acao")
        .select("id, tipo, devops_id, status, erro, usuario_email, criado_em, antes, depois")
        .order("criado_em", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function useSincronizar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("devops-sync", { body: { mode: "reconcile" } });
      if (error) throw new Error(error.message);
      return data as { done: boolean; ms: number };
    },
    onSuccess: (r) => {
      toast.success(`Sincronizado com o Azure DevOps em ${(r.ms / 1000).toFixed(1)} s`);
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(`Falhou: ${e.message}`),
  });
}

/** "antes → depois" legível para a auditoria. */
function mudanca(tipo: string, antes: unknown, depois: unknown): string {
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (depois ?? {}) as Record<string, unknown>;
  if (tipo === "mover_estado") return `${a.estado ?? "?"} → ${d.estado ?? "?"}`;
  if (tipo === "atribuir") {
    const motivo = d.motivo as { sugestao_id?: string } | null;
    const de = a.responsavel ? normalizarNome(String(a.responsavel)) : "ninguém";
    const para = d.responsavel ? normalizarNome(String(d.responsavel)) : "?";
    return `${de} → ${para}${motivo?.sugestao_id ? " · sugestão do agente" : ""}`;
  }
  return "";
}

export function SincronizacaoPage() {
  const estado = useSyncState();
  const projetos = useProjetosPagina("", 0);
  const eventos = useEventos();
  const auditoria = useAuditoria();
  const sincronizar = useSincronizar();
  const nome = (id: string) => projetos.data?.projetos.find((p) => p.id === id)?.nome ?? "Projeto";
  const comErro = (estado.data ?? []).filter((s) => s.ultima_reconciliacao_ok === false);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Ajustes</div>
          <h1 className="text-2xl font-semibold tracking-tight dark:text-slate-100">Sincronização</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            O app recebe cada mudança do Azure DevOps na hora e confere tudo a cada 5 minutos. Aqui você vê se está tudo em dia e
            tudo o que o app já escreveu no DevOps.
          </p>
        </div>
        <Button onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
          {sincronizar.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sincronizar agora
        </Button>
      </header>

      {comErro.length > 0 && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          A última conferência falhou em {comErro.map((s) => nome(s.projeto_id)).join(", ")}: {comErro[0]!.ultimo_erro ?? "erro desconhecido"}
        </p>
      )}

      <Card className="mb-5">
        <CardTitulo icone={RefreshCw} titulo="Projetos" descricao="Estado da importação e da última conferência com o DevOps." />
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(estado.data ?? []).map((s) => (
            <li key={s.projeto_id} className="flex items-center gap-3 px-5 py-3">
              <MarcaProjeto nome={nome(s.projeto_id)} className="size-8 rounded-md text-xs" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{nome(s.projeto_id)}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{FASE[s.fase] ?? s.fase}</div>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300" title={s.ultima_reconciliacao_em ? formatHora(s.ultima_reconciliacao_em) : undefined}>
                {s.ultima_reconciliacao_ok === false ? (
                  <XCircle className="size-4 text-red-500" />
                ) : (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
                conferido {tempoRelativo(s.ultima_reconciliacao_em)}
              </span>
            </li>
          ))}
          {estado.isLoading && <li className="m-5 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />}
        </ul>
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardTitulo icone={Activity} titulo="Últimos eventos do DevOps" descricao="O que chegou pelos Service Hooks (webhooks), em tempo real." />
          <ul className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {(eventos.data ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className={cn("size-2 shrink-0 rounded-full", e.status === "processado" ? "bg-emerald-500" : e.status === "erro" ? "bg-red-500" : "bg-amber-400")} />
                <div className="min-w-0 flex-1">
                  <span className="text-slate-800 dark:text-slate-100">{TIPO_EVENTO[e.tipo] ?? e.tipo}</span>
                  {e.devops_id &&
                    (AZDO_ORG_URL ? (
                      <a href={`${AZDO_ORG_URL}/_workitems/edit/${e.devops_id}`} target="_blank" rel="noreferrer" className="ml-1.5 text-brand-700 hover:underline dark:text-brand-300">
                        #{e.devops_id}
                      </a>
                    ) : (
                      <span className="ml-1.5 text-slate-500">#{e.devops_id}</span>
                    ))}
                  {e.erro && <div className="truncate text-xs text-red-600 dark:text-red-400">{e.erro}</div>}
                </div>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400" title={formatHora(e.recebido_em)}>
                  {tempoRelativo(e.recebido_em)}
                </span>
              </li>
            ))}
            {eventos.data?.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">Nenhum evento recebido ainda.</li>}
          </ul>
        </Card>

        <Card className="min-w-0">
          <CardTitulo icone={History} titulo="Auditoria" descricao="Tudo o que o app escreveu no Azure DevOps: quem, quando e o que mudou." />
          <ul className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {(auditoria.data ?? []).map((a) => (
              <li key={a.id} className="px-5 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  {a.status === "aplicada" ? <ShieldCheck className="size-4 shrink-0 text-emerald-500" /> : <XCircle className="size-4 shrink-0 text-red-500" />}
                  <span className="font-medium text-slate-800 dark:text-slate-100">{TIPO_ACAO[a.tipo] ?? a.tipo}</span>
                  {a.devops_id && <span className="text-slate-500">#{a.devops_id}</span>}
                  <span className="ml-auto shrink-0 text-xs text-slate-500 dark:text-slate-400" title={formatHora(a.criado_em)}>
                    {tempoRelativo(a.criado_em)}
                  </span>
                </div>
                <div className="mt-0.5 pl-6 text-xs text-slate-500 dark:text-slate-400">
                  {mudanca(a.tipo, a.antes, a.depois)}
                  {a.usuario_email && <> · por {a.usuario_email}</>}
                  {a.erro && <span className="text-red-600 dark:text-red-400"> · erro: {a.erro}</span>}
                </div>
              </li>
            ))}
            {auditoria.data?.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">O app ainda não escreveu nada no DevOps.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
