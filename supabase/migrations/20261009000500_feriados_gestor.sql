-- Agenda: o gestor cadastra feriados regionais e recessos da empresa pelo front (os nacionais
-- vêm da migration 20261008000900 e não podem ser apagados por aqui). Zeram a capacidade do
-- dia para todos no motor, como os nacionais.

create policy "gestor_insere_feriado" on public.feriado
  for insert to authenticated with check (abrangencia in ('regional', 'recesso'));
create policy "gestor_exclui_feriado" on public.feriado
  for delete to authenticated using (abrangencia in ('regional', 'recesso'));

-- Agenda e capacidade atualizam ao vivo
alter publication supabase_realtime add table public.feriado;
