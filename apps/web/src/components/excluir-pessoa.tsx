// Direito ao esquecimento (LGPD): só admin. Apaga os dados pessoais que o app guarda e
// anonimiza a pessoa de vez (rpc esquecer_pessoa, auditada). A pessoa continua no Azure DevOps,
// que é a fonte; lá a remoção é feita pela empresa.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePapel } from "@/lib/papel";

export function ExcluirDadosPessoa({ pessoaId, nome, onFeito }: { pessoaId: string; nome: string; onFeito: () => void }) {
  const { ehAdmin } = usePapel();
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!ehAdmin) return null;

  async function excluir() {
    setEnviando(true);
    const { error } = await supabase.rpc("esquecer_pessoa", { p_pessoa_id: pessoaId });
    setEnviando(false);
    if (error) return toast.error(error.message);
    toast.success("Dados pessoais excluídos. A pessoa aparece como “Pessoa removida”.");
    void qc.invalidateQueries();
    onFeito();
  }

  return (
    <section className="rounded-xl border border-red-200 p-4 dark:border-red-900/60">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
        <ShieldX className="size-4" /> Privacidade (LGPD)
      </h3>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        Exclui de vez skills, tags, ausências, regras, alocações, notificações e sugestões desta pessoa, e troca o nome por “Pessoa
        removida”, inclusive no histórico. Não dá para desfazer. A sincronização não traz o nome de volta.
      </p>
      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="mt-3 cursor-pointer rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          Excluir dados pessoais…
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-slate-600 dark:text-slate-300">
            Para confirmar, digite <strong>EXCLUIR</strong>:
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              aria-label={`Confirmar exclusão dos dados de ${nome}`}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={texto !== "EXCLUIR" || enviando}
              onClick={() => void excluir()}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando && <Loader2 className="size-3.5 animate-spin" />} Excluir definitivamente
            </button>
            <button type="button" onClick={() => setConfirmando(false)} className="cursor-pointer rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
