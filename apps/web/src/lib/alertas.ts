import { useMemo } from "react";
import { type ItemAtencao, itensDeAtencao } from "@shared/capacidade/atencao";
import { precisaDeEquipe } from "./equipe-sugerida";
import { proximasSemanas, useOcupacaoEquipe } from "./ocupacao";
import { useProjetosPagina, useSemDonoResumo } from "./queries";

const PERIODO = proximasSemanas(2);

export interface AlertaAtual {
  item: ItemAtencao;
  link: string;
}

function linkDe(item: ItemAtencao): string {
  if (item.tipo === "sem-equipe") return `/projetos/${item.projetoId}/resumo`;
  if (item.tipo === "ausencia-com-tasks") return item.projetoId ? `/analises?projeto=${item.projetoId}` : "/analises";
  if (item.tipo === "sem-dono") return item.projetoId ? `/analises?projeto=${item.projetoId}` : "/analises";
  return item.projetoId ? `/projetos/${item.projetoId}/kanban?resp=${item.pessoaId}` : "/membros";
}

export function useAlertasAtuais() {
  const eq = useOcupacaoEquipe();
  const semDonoQ = useSemDonoResumo();
  const projetosQ = useProjetosPagina("", 0);

  const alertas = useMemo<AlertaAtual[] | null>(() => {
    if (!eq.celula) return null;
    const celula = eq.celula;
    const itens = itensDeAtencao({
      pessoas: eq.membros.map((m) => ({ id: m.pessoaId, nome: m.nome })),
      celula: (id) => celula(PERIODO, id),
      nomeProjeto: eq.nomeProjeto,
      semDono: (semDonoQ.data ?? []).map((s) => ({
        projetoId: s.projeto_id!,
        nome: s.projeto_nome ?? "Projeto",
        tasks: s.tasks ?? 0,
        horas: Number(s.horas ?? 0),
      })),
      semEquipe: (projetosQ.data?.projetos ?? []).filter(precisaDeEquipe).map((p) => ({ projetoId: p.id!, nome: p.nome ?? "Projeto" })),
      conflitos: eq.conflitos,
      periodo: PERIODO.rotulo,
    });
    return itens.map((item) => ({ item, link: linkDe(item) }));
  }, [eq, semDonoQ.data, projetosQ.data]);

  return { alertas, carregando: alertas === null };
}
