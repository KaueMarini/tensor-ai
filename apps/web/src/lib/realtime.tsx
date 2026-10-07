// Assina postgres_changes e mantém o front em dia sem refresh:
//  - invalida as queries afetadas do TanStack Query
//  - destaca por ~2s as linhas alteradas (por devops_id)
//  - mostra um toast discreto (agrupado quando chega uma rajada, ex.: sync completa)

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase, type Tables } from "./supabase";

export type RealtimeStatus = "conectando" | "ao-vivo" | "offline";

interface RealtimeCtx {
  status: RealtimeStatus;
  destacados: ReadonlySet<number>;
}

const Ctx = createContext<RealtimeCtx>({ status: "conectando", destacados: new Set() });

const DESTAQUE_MS = 2200;
const JANELA_TOAST_MS = 600;

type WorkItem = Tables<"work_item">;

function descrever(p: RealtimePostgresChangesPayload<WorkItem>): string {
  const novo = p.new as Partial<WorkItem>;
  const velho = p.old as Partial<WorkItem>;
  const item = Object.keys(novo).length ? novo : velho;
  const rotulo = `${item.tipo ?? "Item"} #${item.devops_id ?? "?"}`;
  if (p.eventType === "INSERT") return `${rotulo} criada no DevOps`;
  if (p.eventType === "DELETE" || (novo.deleted_at && !velho.deleted_at)) return `${rotulo} removida no DevOps`;
  return `${rotulo} atualizada no DevOps`;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("conectando");
  const [destacados, setDestacados] = useState<ReadonlySet<number>>(new Set());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const fila = useRef<string[]>([]);
  const filaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jaConectou = useRef(false);

  const destacar = useCallback((id: number) => {
    setDestacados((prev) => new Set(prev).add(id));
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setDestacados((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, DESTAQUE_MS),
    );
  }, []);

  const avisar = useCallback((msg: string) => {
    fila.current.push(msg);
    if (filaTimer.current) return;
    filaTimer.current = setTimeout(() => {
      const msgs = fila.current;
      fila.current = [];
      filaTimer.current = null;
      if (msgs.length === 1) toast(msgs[0]);
      else toast(`${msgs.length} itens sincronizados do DevOps`);
    }, JANELA_TOAST_MS);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("radar-db")
      .on<WorkItem>("postgres_changes", { event: "*", schema: "public", table: "work_item" }, (p) => {
        void qc.invalidateQueries({ queryKey: ["backlog"] });
        const id = (p.new as Partial<WorkItem>).devops_id ?? (p.old as Partial<WorkItem>).devops_id;
        if (id) destacar(id);
        avisar(descrever(p));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sprint" }, () => {
        void qc.invalidateQueries({ queryKey: ["sprints"] });
        void qc.invalidateQueries({ queryKey: ["backlog"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_state" }, () => {
        void qc.invalidateQueries({ queryKey: ["sync_state"] });
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          // ao reconectar, recarrega tudo: podemos ter perdido eventos enquanto estava offline
          if (jaConectou.current) void qc.invalidateQueries();
          jaConectou.current = true;
          setStatus("ao-vivo");
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("offline");
        }
      });

    const t = timers.current;
    return () => {
      void supabase.removeChannel(channel);
      for (const timer of t.values()) clearTimeout(timer);
      t.clear();
      if (filaTimer.current) clearTimeout(filaTimer.current);
    };
  }, [qc, destacar, avisar]);

  const value = useMemo(() => ({ status, destacados }), [status, destacados]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
