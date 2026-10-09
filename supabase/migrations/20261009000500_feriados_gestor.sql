create policy "gestor_insere_feriado" on public.feriado
  for insert to authenticated with check (abrangencia in ('regional', 'recesso'));
create policy "gestor_exclui_feriado" on public.feriado
  for delete to authenticated using (abrangencia in ('regional', 'recesso'));

alter publication supabase_realtime add table public.feriado;
