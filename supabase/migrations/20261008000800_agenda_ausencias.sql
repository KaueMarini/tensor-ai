create policy "gestor_insere_ausencia" on public.ausencia
  for insert to authenticated with check (true);
create policy "gestor_exclui_ausencia" on public.ausencia
  for delete to authenticated using (true);

alter publication supabase_realtime add table public.ausencia;
