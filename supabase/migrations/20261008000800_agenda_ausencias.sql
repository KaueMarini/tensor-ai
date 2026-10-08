-- Agenda: o gestor registra e remove ausências pelo front.
-- Mesmo padrão de 20261007000400 (skills/tags): dado local, não toca o DevOps, e hoje
-- todo usuário autenticado é o gestor (não há RBAC separado ainda).

create policy "gestor_insere_ausencia" on public.ausencia
  for insert to authenticated with check (true);
create policy "gestor_exclui_ausencia" on public.ausencia
  for delete to authenticated using (true);

-- Agenda e capacidade atualizam ao vivo quando alguém registra/remove uma ausência
alter publication supabase_realtime add table public.ausencia;
