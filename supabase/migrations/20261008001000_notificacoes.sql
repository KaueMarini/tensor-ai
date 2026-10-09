create table public.notificacao (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  mensagem    text,
  gravidade   text not null default 'info' check (gravidade in ('info', 'atencao', 'critico')),
  link        text check (link is null or link like '/%'),
  origem      text not null default 'ia' check (origem in ('ia', 'sistema')),
  projeto_id  uuid references public.projeto(id) on delete cascade,
  pessoa_id   uuid references public.pessoa(id) on delete set null,
  usuario_id  uuid references auth.users(id) on delete cascade,
  lida_em     timestamptz,
  criada_em   timestamptz not null default now()
);
create index on public.notificacao (criada_em desc);
create index on public.notificacao (criada_em desc) where lida_em is null;

alter table public.notificacao enable row level security;

create policy "le_proprias_ou_gerais" on public.notificacao
  for select to authenticated using (usuario_id is null or usuario_id = auth.uid());
create policy "atualiza_proprias_ou_gerais" on public.notificacao
  for update to authenticated
  using (usuario_id is null or usuario_id = auth.uid())
  with check (usuario_id is null or usuario_id = auth.uid());
create policy "apaga_proprias_ou_gerais" on public.notificacao
  for delete to authenticated using (usuario_id is null or usuario_id = auth.uid());
create policy "gestor_insere" on public.notificacao
  for insert to authenticated with check (usuario_id is null or usuario_id = auth.uid());

alter publication supabase_realtime add table public.notificacao;
