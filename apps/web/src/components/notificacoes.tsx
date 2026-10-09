import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, CheckCheck, Info, OctagonAlert, Sparkles } from "lucide-react";
import { useAlertasAtuais } from "@/lib/alertas";
import { type Notificacao, useMarcarLidas, useNotificacoes } from "@/lib/queries";
import { cn, tempoRelativo } from "@/lib/utils";
import { STATUS_CARGA } from "@/components/carga";
import { Popover } from "@/components/ui/popover";

const GRAVIDADE = {
  critico: { icone: OctagonAlert, cor: STATUS_CARGA.sobrecarga.cor, rotulo: "Crítico" },
  atencao: { icone: AlertTriangle, cor: STATUS_CARGA.limite.cor, rotulo: "Atenção" },
  info: { icone: Info, cor: "var(--color-brand-500)", rotulo: "Informação" },
} as const;

export function SinoNotificacoes() {
  const notificacoes = useNotificacoes();
  const { alertas } = useAlertasAtuais();
  const marcar = useMarcarLidas();
  const router = useRouter();

  const mensagens = notificacoes.data ?? [];
  const naoLidas = mensagens.filter((n) => !n.lida_em).length;
  const criticos = (alertas ?? []).filter((a) => a.item.gravidade === "critico").length;
  const total = naoLidas + criticos;
  const soAtencao = total === 0 && (alertas?.length ?? 0) > 0;

  const abrir = (link: string | null, fechar: () => void) => {
    fechar();
    if (link) router.history.push(link);
  };

  return (
    <Popover
      rotulo={total > 0 ? `Notificações: ${total} ${total === 1 ? "nova" : "novas"}` : "Notificações"}
      painelClassName="w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden"
      gatilho={(aberto) => (
        <span
          className={cn(
            "relative grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
            aberto && "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
          )}
        >
          <Bell className="size-5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-slate-900">
              {total > 9 ? "9+" : total}
            </span>
          )}
          {soAtencao && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-900" />}
        </span>
      )}
    >
      {(fechar) => (
        <div className="flex max-h-[min(36rem,calc(100vh-6rem))] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notificações</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Avisos sobre a equipe e os projetos</p>
            </div>
            {naoLidas > 0 && (
              <button
                type="button"
                onClick={() => marcar.mutate([])}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <CheckCheck className="size-3.5" /> Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="overflow-y-auto">
            <Secao titulo="Mensagens" ajuda="Avisos enviados pelo assistente (IA)">
              {notificacoes.isLoading ? (
                <Carregando />
              ) : mensagens.length === 0 ? (
                <Vazio icone={Sparkles} texto="Nenhuma mensagem ainda. Quando o assistente encontrar algo importante, ele avisa aqui." />
              ) : (
                mensagens.map((n) => (
                  <Mensagem
                    key={n.id}
                    n={n}
                    onClick={() => {
                      if (!n.lida_em) marcar.mutate([n.id]);
                      abrir(n.link, fechar);
                    }}
                  />
                ))
              )}
            </Secao>

            <Secao titulo="Alertas de agora" ajuda="Calculados automaticamente para as próximas 2 semanas">
              {alertas === null ? (
                <Carregando />
              ) : alertas.length === 0 ? (
                <Vazio icone={CheckCheck} texto="Tudo sob controle: ninguém sobrecarregado e nenhuma tarefa sem responsável." />
              ) : (
                alertas.map(({ item, link }, i) => {
                  const g = GRAVIDADE[item.gravidade];
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => abrir(link, fechar)}
                      className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <g.icone className="mt-0.5 size-4 shrink-0" style={{ color: g.cor }} aria-label={g.rotulo} />
                      <span className="min-w-0">
                        <span className="block text-sm leading-snug text-slate-800 dark:text-slate-100">{item.titulo}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500 dark:text-slate-400">{item.detalhe}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </Secao>
          </div>
        </div>
      )}
    </Popover>
  );
}

function Secao({ titulo, ajuda, children }: { titulo: string; ajuda: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
      <div className="flex items-baseline justify-between gap-2 bg-slate-50/80 px-4 py-2 dark:bg-slate-800/40">
        <h3 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">{titulo}</h3>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">{ajuda}</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">{children}</div>
    </section>
  );
}

function Mensagem({ n, onClick }: { n: Notificacao; onClick: () => void }) {
  const g = GRAVIDADE[(n.gravidade as keyof typeof GRAVIDADE) ?? "info"] ?? GRAVIDADE.info;
  const lida = !!n.lida_em;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
        !lida && "bg-brand-50/50 dark:bg-brand-900/15",
      )}
    >
      <g.icone className="mt-0.5 size-4 shrink-0" style={{ color: g.cor }} aria-label={g.rotulo} />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-snug text-slate-800 dark:text-slate-100", !lida && "font-semibold")}>{n.titulo}</span>
        {n.mensagem && <span className="mt-0.5 line-clamp-3 block text-xs text-slate-500 dark:text-slate-400">{n.mensagem}</span>}
        <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
          {n.origem === "ia" ? "Assistente" : "Sistema"} · {tempoRelativo(n.criada_em)}
        </span>
      </span>
      {!lida && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-label="Não lida" />}
    </button>
  );
}

function Vazio({ icone: Icone, texto }: { icone: typeof Bell; texto: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
      <Icone className="mt-0.5 size-4 shrink-0 text-slate-300 dark:text-slate-600" />
      {texto}
    </div>
  );
}

function Carregando() {
  return (
    <div className="space-y-2 px-4 py-3">
      {[0, 1].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}
