import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Scale } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const ROTULO = { 1: "Baixo", 2: "Médio", 3: "Alto" } as const;

function useImpacto(projetoId: string) {
  return useQuery({
    queryKey: ["projetos", "impacto", projetoId],
    queryFn: async () => {
      const [p, a] = await Promise.all([
        supabase.from("projeto").select("impacto_devops").eq("id", projetoId).maybeSingle(),
        supabase.from("projeto_avaliacao").select("impacto_gestor, impacto_ia, justificativa_ia").eq("projeto_id", projetoId).maybeSingle(),
      ]);
      if (p.error) throw new Error(p.error.message);
      if (a.error) throw new Error(a.error.message);
      const gestor = a.data?.impacto_gestor ?? null;
      const devops = p.data?.impacto_devops ?? null;
      const ia = a.data?.impacto_ia ?? null;
      const valor = (gestor ?? devops ?? ia) as 1 | 2 | 3 | null;
      const origem = gestor ? "gestor" : devops ? "devops" : ia ? "ia" : null;
      return { valor, origem, justificativaIA: a.data?.justificativa_ia ?? null, temGestor: gestor !== null };
    },
  });
}

export function ImpactoProjeto({ projetoId }: { projetoId: string }) {
  const q = useImpacto(projetoId);
  const qc = useQueryClient();
  const salvar = useMutation({
    mutationFn: async (v: number | null) => {
      const { error } = await supabase.from("projeto_avaliacao").upsert({ projeto_id: projetoId, impacto_gestor: v });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      toast.success(v ? `Impacto definido como ${ROTULO[v as 1 | 2 | 3].toLowerCase()}` : "Impacto volta a seguir o DevOps ou a IA");
      void qc.invalidateQueries({ queryKey: ["projetos", "impacto", projetoId] });
    },
    onError: (e) => toast.error(e.message),
  });
  const d = q.data;
  if (!d) return null;
  const titulo =
    d.origem === "ia"
      ? `Sugerido pela IA: ${d.justificativaIA ?? ""} Escolha um valor para confirmar.`
      : d.origem === "devops"
        ? 'Da linha "Impacto:" na descrição do projeto no DevOps.'
        : d.origem === "gestor"
          ? "Definido por você."
          : "Ninguém definiu ainda. O agente estima pela descrição na próxima análise.";

  return (
    <label
      title={titulo}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
        d.origem === "ia" ? "border-dashed border-brand-400 text-brand-800 dark:text-brand-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300",
      )}
    >
      {d.origem === "ia" ? <Bot className="size-3" /> : <Scale className="size-3" />}
      Impacto
      <select
        aria-label="Impacto do projeto"
        value={d.valor ?? ""}
        disabled={salvar.isPending}
        onChange={(e) => salvar.mutate(e.target.value ? Number(e.target.value) : null)}
        className="cursor-pointer bg-transparent font-semibold outline-none"
      >
        {!d.valor && <option value="">não definido</option>}
        {([3, 2, 1] as const).map((v) => (
          <option key={v} value={v}>
            {ROTULO[v]}
            {d.valor === v && d.origem === "ia" ? " (sugerido pela IA)" : ""}
          </option>
        ))}
        {d.temGestor && <option value="">seguir DevOps/IA</option>}
      </select>
    </label>
  );
}
