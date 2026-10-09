create table public.fluxo_config (
  projeto_id          uuid not null references public.projeto(id) on delete cascade,
  coluna              text not null,
  tipo                text not null default 'ativa' check (tipo in ('espera', 'ativa')),
  sla_horas_uteis     numeric(6,1) check (sla_horas_uteis > 0),
  limite_wip_coluna   integer check (limite_wip_coluna > 0),
  limite_wip_pessoa   integer check (limite_wip_pessoa > 0),
  atualizado_em       timestamptz not null default now(),
  primary key (projeto_id, coluna)
);

create table public.analise_config (
  id                     boolean primary key default true check (id),
  tags_bloqueio          text[] not null default array['bloqueado', 'blocked', 'impedimento'],
  campo_bloqueio         text default 'Microsoft.VSTS.CMMI.Blocked',
  campo_horas_carga      text not null default 'restante'
                         check (campo_horas_carga in ('restante', 'estimada_menos_concluida', 'estimada')),
  horas_fallback_padrao  numeric(5,1) not null default 4 check (horas_fallback_padrao >= 0),
  horas_fallback_por_tag jsonb not null default '{}'::jsonb,
  percentil_referencia   numeric(4,3) not null default 0.85 check (percentil_referencia > 0 and percentil_referencia < 1),
  janela_historico_dias  integer not null default 90 check (janela_historico_dias > 0),
  atualizado_em          timestamptz not null default now()
);
insert into public.analise_config (id) values (true);

create table public.devops_relacao_cache (
  work_item_id  integer not null,
  tipo          text not null,
  alvo_id       integer not null,
  lido_em       timestamptz not null default now(),
  primary key (work_item_id, tipo, alvo_id)
);
create index on public.devops_relacao_cache (alvo_id);

create or replace function public.seed_fluxo_config(p_projeto uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.fluxo_config (projeto_id, coluna, tipo, sla_horas_uteis, limite_wip_coluna, limite_wip_pessoa)
  values
    (p_projeto, '*',           'ativa',  null, null, 3),
    (p_projeto, 'Code Review', 'espera', 24,   null, null),
    (p_projeto, 'Homologação', 'espera', 48,   null, null)
  on conflict (projeto_id, coluna) do nothing;
$$;

select public.seed_fluxo_config(id) from public.projeto;

create or replace function public.trg_projeto_seed_fluxo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_fluxo_config(new.id);
  return new;
end $$;

create trigger trg_projeto_fluxo_config
  after insert on public.projeto
  for each row execute function public.trg_projeto_seed_fluxo();

create trigger trg_fluxo_config_atualizado before update on public.fluxo_config
  for each row execute function public.set_atualizado_em();
create trigger trg_analise_config_atualizado before update on public.analise_config
  for each row execute function public.set_atualizado_em();

do $$
declare t text;
begin
  foreach t in array array['fluxo_config', 'analise_config', 'devops_relacao_cache'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "leitura_autenticados" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

revoke execute on function public.seed_fluxo_config(uuid), public.trg_projeto_seed_fluxo()
  from anon, authenticated, public;
