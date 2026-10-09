export const GLOSSARIO = {
  sprint: {
    termo: "Sprint",
    texto: "Um ciclo curto de trabalho (normalmente 2 semanas) com começo e fim definidos. O time planeja o que vai fazer nesse período.",
  },
  feature: {
    termo: "Feature",
    texto: "Um pedaço maior do produto (um requisito), que é dividido em várias tarefas menores.",
  },
  tarefa: {
    termo: "Tarefa (task)",
    texto: "A menor unidade de trabalho, com um responsável e uma estimativa de horas. É o que ocupa o tempo das pessoas.",
  },
  capacidade: {
    termo: "Capacidade",
    texto: "Quantas horas a pessoa tem disponíveis para tarefas no período, já descontando reuniões, feriados, folgas e férias.",
  },
  ocupacao: {
    termo: "Ocupação (uso)",
    texto: "Quanto da capacidade já está tomado por tarefas. 50% = metade do tempo ocupado; acima de 100% = mais trabalho do que tempo.",
  },
  noLimite: {
    termo: "No limite",
    texto: "A pessoa está quase sem tempo livre (por padrão, acima de 80% ocupada). Evite passar mais trabalho para ela.",
  },
  sobrecarregado: {
    termo: "Sobrecarregado",
    texto: "A pessoa tem mais trabalho do que horas disponíveis (por padrão, acima de 100%). Vale redistribuir tarefas.",
  },
  horasLivres: {
    termo: "Horas livres",
    texto: "Tempo que ainda sobra para receber trabalho novo, somando as pessoas.",
  },
  semResponsavel: {
    termo: "Tarefa sem responsável",
    texto: "Uma tarefa aberta que ninguém assumiu ainda. A tela Sugestões indica quem pode pegá-la.",
  },
  squad: {
    termo: "Squad (time)",
    texto: "Um grupo de pessoas que trabalha junto num projeto. Vem dos times cadastrados no Azure DevOps.",
  },
  skill: {
    termo: "Skill e tag de função",
    texto: "Skill é o que a pessoa sabe fazer (ex.: Java, Power BI). Tag de função é o papel dela (ex.: Desenvolvedor, QA).",
  },
  devops: {
    termo: "Azure DevOps",
    texto: "A ferramenta onde os times registram projetos, sprints e tarefas. Este sistema lê os dados de lá e só altera algo quando você confirma.",
  },
  throughput: {
    termo: "Throughput (vazão)",
    texto: "Quantas tarefas o time termina por semana. Estável ou subindo é bom sinal; caindo indica trabalho travando.",
  },
  cycleTime: {
    termo: "Cycle time",
    texto: "Quanto tempo uma tarefa leva desde que alguém começa a trabalhar nela até ficar pronta. P85 = 85% das tarefas ficam prontas nesse prazo ou menos.",
  },
  leadTime: {
    termo: "Lead time",
    texto: "Quanto tempo passa desde que a tarefa foi criada até ficar pronta, incluindo o tempo esperando na fila.",
  },
  wip: {
    termo: "WIP (trabalho em andamento)",
    texto: "Quantas tarefas estão em andamento agora. Muita coisa aberta ao mesmo tempo deixa tudo mais lento; o ideal é terminar antes de começar.",
  },
} as const;

export type TermoGlossario = keyof typeof GLOSSARIO;
