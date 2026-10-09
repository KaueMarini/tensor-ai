-- Agente de IA (Edge Function `agente`): sugestão pendente cuja situação deixou de existir
-- (task já atribuída, sobrecarga resolvida, projeto ganhou equipe) vira 'expirada' em vez de
-- ficar na caixa do gestor. Aprovar/ignorar passam pelo devops-acoes (service_role).

alter table public.sugestao drop constraint if exists sugestao_status_check;
alter table public.sugestao add constraint sugestao_status_check
  check (status in ('pendente', 'aplicada', 'ignorada', 'expirada'));
