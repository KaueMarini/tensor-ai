-- Radar de Capacidade: schema inicial (fundação da sync com o Azure DevOps)
-- Chaves naturais do DevOps: projeto/time/sprint = GUID do DevOps, work_item = ID numérico.

-- =====================================================================
-- Utilitários
-- =====================================================================
create or replace function public.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- =====================================================================
-- Tabelas
-- =====================================================================
create table public.projeto (
  id               uuid primary key,              -- GUID do projeto no DevOps
  nome             text not null,
  descricao        text,
  descricao_extra  text,                          -- contexto adicionado pelo gestor
  tags_requeridas  text[] not null default '{}',
  processo         text,                          -- Agile, Scrum, Basic...
  atualizado_em    timestamptz not null default now()
);

create table public.time (
  id             uuid primary key,                -- GUID do time no DevOps
  projeto_id     uuid not null references public.projeto(id) on delete cascade,
  nome           text not null,
  atualizado_em  timestamptz not null default now()
);
create index on public.time (projeto_id);

create table public.pessoa (
  id                 uuid primary key default gen_random_uuid(),
  devops_user_id     uuid unique,                 -- identity id do DevOps
  nome               text not null,
  unique_name        text,                        -- e-mail/UPN
  papel              text,
  horas_semana_base  numeric(5,2) not null default 40,
  atualizado_em      timestamptz not null default now()
);

create table public.time_membro (
  time_id        uuid not null references public.time(id) on delete cascade,
  pessoa_id      uuid not null references public.pessoa(id) on delete cascade,
  ativo          boolean not null default true,
  atualizado_em  timestamptz not null default now(),
  primary key (time_id, pessoa_id)
);

create table public.sprint (
  id              uuid primary key,               -- identifier da iteração no DevOps
  projeto_id      uuid not null references public.projeto(id) on delete cascade,
  nome            text not null,
  iteration_path  text not null,                  -- normalizado: "Projeto\Sprint 1"
  inicio          date,
  fim             date,
  deleted_at      timestamptz,
  atualizado_em   timestamptz not null default now(),
  unique (projeto_id, iteration_path)
);

create table public.capacidade_sprint (
  sprint_id       uuid not null references public.sprint(id) on delete cascade,
  time_id         uuid not null references public.time(id) on delete cascade,
  pessoa_id       uuid not null references public.pessoa(id) on delete cascade,
  capacidade_dia  numeric(6,2) not null default 0, -- soma das atividades
  atividades      jsonb not null default '[]',     -- [{nome, capacidade_dia}]
  atualizado_em   timestamptz not null default now(),
  primary key (sprint_id, time_id, pessoa_id)
);

-- Days off do DevOps: pessoa_id nulo = folga do time inteiro
create table public.dias_off (
  id         bigint generated always as identity primary key,
  sprint_id  uuid not null references public.sprint(id) on delete cascade,
  time_id    uuid not null references public.time(id) on delete cascade,
  pessoa_id  uuid references public.pessoa(id) on delete cascade,
  inicio     date not null,
  fim        date not null,
  check (fim >= inicio)
);
create index on public.dias_off (sprint_id, time_id);

create table public.ausencia (
  id          bigint generated always as identity primary key,
  pessoa_id   uuid not null references public.pessoa(id) on delete cascade,
  inicio      date not null,
  fim         date not null,
  tipo        text not null check (tipo in ('ferias','certificacao','licenca','outro')),
  observacao  text,
  check (fim >= inicio)
);
create index on public.ausencia (pessoa_id, inicio);

create table public.feriado (
  id           bigint generated always as identity primary key,
  data         date not null,
  nome         text not null,
  abrangencia  text not null default 'nacional',
  unique (data, abrangencia)
);

create table public.skill_tag (
  id          bigint generated always as identity primary key,
  pessoa_id   uuid not null references public.pessoa(id) on delete cascade,
  tag         text not null,
  origem      text not null check (origem in ('ia','gestor')),
  confianca   numeric(3,2) check (confianca between 0 and 1),
  confirmada  boolean not null default false,
  unique (pessoa_id, tag)
);

-- Todos os tipos (Feature, User Story, Task, Bug...) numa tabela só.
create table public.work_item (
  devops_id          integer primary key,
  rev                integer not null,
  projeto_id         uuid not null references public.projeto(id) on delete cascade,
  tipo               text not null,
  estado             text,
  titulo             text not null,
  descritivo         text,
  parent_devops_id   integer,                     -- sem FK: o pai pode chegar depois
  feature_devops_id  integer,                     -- Feature ancestral mais próxima (resolvida)
  sprint_id          uuid references public.sprint(id) on delete set null, -- resolvida pelo path
  responsavel_id     uuid references public.pessoa(id) on delete set null,
  area_path          text,
  iteration_path     text,
  horas_estimadas    numeric(8,2),                -- Microsoft.VSTS.Scheduling.OriginalEstimate
  horas_restantes    numeric(8,2),                -- RemainingWork
  horas_concluidas   numeric(8,2),                -- CompletedWork
  horas_origem       text not null default 'devops' check (horas_origem in ('devops','sistema')),
  start_date         timestamptz,
  finish_date        timestamptz,
  target_date        timestamptz,
  tags               text[] not null default '{}',
  changed_date       timestamptz,
  deleted_at         timestamptz,
  fields             jsonb not null default '{}', -- campos brutos recebidos
  sync_origem        text check (sync_origem in ('webhook','reconcile','full')),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index on public.work_item (projeto_id, changed_date);
create index on public.work_item (parent_devops_id);
create index on public.work_item (feature_devops_id);
create index on public.work_item (sprint_id);
create index on public.work_item (responsavel_id);
create index on public.work_item (projeto_id, iteration_path);

create table public.sugestao (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null,
  payload        jsonb not null,
  justificativa  text,
  impacto        jsonb,
  status         text not null default 'pendente' check (status in ('pendente','aplicada','ignorada')),
  criada_em      timestamptz not null default now(),
  decidida_por   uuid references auth.users(id),
  decidida_em    timestamptz
);

create table public.evento (
  id                  bigint generated always as identity primary key,
  chave_idempotencia  text not null unique,       -- GUID do evento do Service Hook
  tipo                text not null,              -- workitem.created/updated/deleted/restored
  devops_id           integer,
  rev                 integer,
  payload             jsonb not null,
  status              text not null default 'recebido'
                      check (status in ('recebido','processado','erro','ignorado')),
  tentativas          integer not null default 0,
  erro                text,
  recebido_em         timestamptz not null default now(),
  processado_em       timestamptz
);
create index on public.evento (recebido_em desc);
create index on public.evento (status, recebido_em);

create table public.sync_state (
  projeto_id               uuid primary key references public.projeto(id) on delete cascade,
  fase                     text not null default 'pendente',
  cursor                   jsonb not null default '{}',  -- progresso da full (ex: ultimo id)
  run_id                   uuid,
  lease_ate                timestamptz,                  -- trava contra execução concorrente
  ultimo_changed_date      timestamptz,                  -- cursor do reconcile
  ultima_reconciliacao_em  timestamptz,
  ultima_reconciliacao_ok  boolean,
  ultimo_erro              text,
  full_iniciada_em         timestamptz,
  full_concluida_em        timestamptz,
  atualizado_em            timestamptz not null default now()
);

-- atualizado_em automático
do $$
declare t text;
begin
  foreach t in array array['projeto','time','pessoa','time_membro','sprint',
                           'capacidade_sprint','work_item','sync_state'] loop
    execute format('create trigger trg_%1$s_atualizado before update on public.%1$I
                    for each row execute function public.set_atualizado_em()', t);
  end loop;
end $$;

-- =====================================================================
-- Resolução de sprint por iteration_path (tolera ordem de chegada)
-- =====================================================================
create or replace function public.tg_work_item_resolve_sprint()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT'
     or new.iteration_path is distinct from old.iteration_path
     or new.sprint_id is null then
    select s.id into new.sprint_id
      from public.sprint s
     where s.projeto_id = new.projeto_id
       and s.iteration_path = new.iteration_path
       and s.deleted_at is null;
  end if;
  return new;
end $$;

create trigger trg_work_item_resolve_sprint
  before insert or update on public.work_item
  for each row execute function public.tg_work_item_resolve_sprint();

create or replace function public.tg_sprint_vincula_work_items()
returns trigger language plpgsql as $$
begin
  update public.work_item w
     set sprint_id = case when new.deleted_at is null then new.id end
   where w.projeto_id = new.projeto_id
     and w.iteration_path = new.iteration_path
     and w.sprint_id is distinct from (case when new.deleted_at is null then new.id end);
  return null;
end $$;

create trigger trg_sprint_vincula_work_items
  after insert or update of iteration_path, deleted_at on public.sprint
  for each row execute function public.tg_sprint_vincula_work_items();

-- =====================================================================
-- Hierarquia genérica: Feature ancestral mais próxima
-- =====================================================================
create or replace function public.feature_ancestral(p_devops_id integer)
returns integer language sql stable as $$
  with recursive sobe as (
    select w.devops_id, w.tipo, w.parent_devops_id, 1 as nivel
      from public.work_item w
     where w.devops_id = (select parent_devops_id from public.work_item where devops_id = p_devops_id)
    union all
    select w.devops_id, w.tipo, w.parent_devops_id, s.nivel + 1
      from public.work_item w
      join sobe s on w.devops_id = s.parent_devops_id
     where s.tipo <> 'Feature' and s.nivel < 10      -- limite protege contra ciclos
  )
  select devops_id from sobe where tipo = 'Feature' order by nivel limit 1;
$$;

-- Recalcula os itens informados e todos os seus descendentes
create or replace function public.recompute_hierarquia(p_ids integer[])
returns integer language plpgsql as $$
declare n integer;
begin
  with recursive alvo as (
    select unnest(p_ids) as devops_id, 0 as nivel
    union
    select w.devops_id, a.nivel + 1
      from public.work_item w
      join alvo a on w.parent_devops_id = a.devops_id
     where a.nivel < 10
  ), novo as (
    select distinct devops_id, public.feature_ancestral(devops_id) as feature_id from alvo
  )
  update public.work_item w
     set feature_devops_id = novo.feature_id
    from novo
   where w.devops_id = novo.devops_id
     and w.feature_devops_id is distinct from novo.feature_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- =====================================================================
-- RPCs de sync (idempotentes; só service_role executa)
-- =====================================================================

-- Upsert em lote. Só grava se rev > rev salvo (ou mesmo rev e item estava excluído = restore).
-- Cada item: {devops_id, rev, projeto_id, tipo, estado, titulo, descritivo, parent_devops_id,
--   responsavel_devops_id, responsavel_nome, responsavel_unique_name, area_path, iteration_path,
--   horas_estimadas, horas_restantes, horas_concluidas, start_date, finish_date, target_date,
--   tags, changed_date, fields}
create or replace function public.upsert_work_items(p_items jsonb, p_origem text)
returns table (devops_id integer, aplicado boolean)
language plpgsql security definer set search_path = public as $
#variable_conflict use_column
declare v_aplicados integer[];
begin
  drop table if exists _wi;
  create temp table _wi on commit drop as
  select distinct on (x.devops_id) x.*
    from jsonb_to_recordset(p_items) as x(
      devops_id integer, rev integer, projeto_id uuid, tipo text, estado text, titulo text,
      descritivo text, parent_devops_id integer, responsavel_devops_id uuid,
      responsavel_nome text, responsavel_unique_name text, area_path text, iteration_path text,
      horas_estimadas numeric, horas_restantes numeric, horas_concluidas numeric,
      start_date timestamptz, finish_date timestamptz, target_date timestamptz,
      tags text[], changed_date timestamptz, fields jsonb)
   order by x.devops_id, x.rev desc;

  insert into pessoa (devops_user_id, nome, unique_name)
  select distinct on (responsavel_devops_id) responsavel_devops_id,
         coalesce(responsavel_nome, responsavel_unique_name, 'Sem nome'), responsavel_unique_name
    from _wi where responsavel_devops_id is not null
  on conflict (devops_user_id) do update
     set nome = excluded.nome, unique_name = excluded.unique_name
   where pessoa.nome is distinct from excluded.nome
      or pessoa.unique_name is distinct from excluded.unique_name;

  with up as (
    insert into work_item as w (
      devops_id, rev, projeto_id, tipo, estado, titulo, descritivo, parent_devops_id,
      responsavel_id, area_path, iteration_path, horas_estimadas, horas_restantes,
      horas_concluidas, start_date, finish_date, target_date, tags, changed_date,
      fields, sync_origem, deleted_at)
    select i.devops_id, i.rev, i.projeto_id, i.tipo, i.estado, coalesce(i.titulo, ''), i.descritivo,
           i.parent_devops_id, p.id, i.area_path, i.iteration_path, i.horas_estimadas,
           i.horas_restantes, i.horas_concluidas, i.start_date, i.finish_date, i.target_date,
           coalesce(i.tags, '{}'), i.changed_date, coalesce(i.fields, '{}'), p_origem, null
      from _wi i
      left join pessoa p on p.devops_user_id = i.responsavel_devops_id
    on conflict on constraint work_item_pkey do update set
      rev = excluded.rev, projeto_id = excluded.projeto_id, tipo = excluded.tipo,
      estado = excluded.estado, titulo = excluded.titulo, descritivo = excluded.descritivo,
      parent_devops_id = excluded.parent_devops_id, responsavel_id = excluded.responsavel_id,
      area_path = excluded.area_path, iteration_path = excluded.iteration_path,
      horas_estimadas = excluded.horas_estimadas, horas_restantes = excluded.horas_restantes,
      horas_concluidas = excluded.horas_concluidas, start_date = excluded.start_date,
      finish_date = excluded.finish_date, target_date = excluded.target_date,
      tags = excluded.tags, changed_date = excluded.changed_date, fields = excluded.fields,
      sync_origem = excluded.sync_origem, deleted_at = null
    where w.rev < excluded.rev
       or (w.rev = excluded.rev and w.deleted_at is not null)
    returning w.devops_id
  )
  select array_agg(up.devops_id) into v_aplicados from up;

  if v_aplicados is not null then
    perform recompute_hierarquia(v_aplicados);
  end if;

  return query
  select i.devops_id, i.devops_id = any(coalesce(v_aplicados, '{}')) from _wi i;
end $;

-- Soft delete. Ignora se já existe revisão mais nova que a do evento.
create or replace function public.soft_delete_work_item(p_devops_id integer, p_rev integer default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update work_item
     set deleted_at = now(), rev = greatest(rev, coalesce(p_rev, rev))
   where devops_id = p_devops_id
     and deleted_at is null
     and (p_rev is null or rev <= p_rev);
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Marca como excluídos os itens do projeto que não estão na lista (sweep da full sync)
create or replace function public.sweep_work_items(p_projeto_id uuid, p_ids_vivos integer[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update work_item set deleted_at = now()
   where projeto_id = p_projeto_id and deleted_at is null
     and not (devops_id = any(p_ids_vivos));
  get diagnostics n = row_count;
  return n;
end $$;

-- Substitui os membros do time. Membros: [{devops_user_id, nome, unique_name}]
create or replace function public.sync_time_membros(p_time_id uuid, p_membros jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into pessoa (devops_user_id, nome, unique_name)
  select m.devops_user_id, m.nome, m.unique_name
    from jsonb_to_recordset(p_membros) as m(devops_user_id uuid, nome text, unique_name text)
  on conflict (devops_user_id) do update
     set nome = excluded.nome, unique_name = excluded.unique_name
   where pessoa.nome is distinct from excluded.nome
      or pessoa.unique_name is distinct from excluded.unique_name;

  insert into time_membro (time_id, pessoa_id, ativo)
  select p_time_id, p.id, true
    from jsonb_to_recordset(p_membros) as m(devops_user_id uuid)
    join pessoa p on p.devops_user_id = m.devops_user_id
  on conflict (time_id, pessoa_id) do update set ativo = true where not time_membro.ativo;

  update time_membro tm set ativo = false
   where tm.time_id = p_time_id and tm.ativo
     and tm.pessoa_id not in (
       select p.id from jsonb_to_recordset(p_membros) as m(devops_user_id uuid)
       join pessoa p on p.devops_user_id = m.devops_user_id);
end $$;

-- Substitui capacidade e days off de um time numa sprint.
-- p_capacidades: [{devops_user_id, nome, capacidade_dia, atividades, dias_off:[{inicio,fim}]}]
-- p_dias_off_time: [{inicio, fim}]
create or replace function public.replace_capacidade(
  p_sprint_id uuid, p_time_id uuid, p_capacidades jsonb, p_dias_off_time jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into pessoa (devops_user_id, nome)
  select c.devops_user_id, coalesce(c.nome, 'Sem nome')
    from jsonb_to_recordset(p_capacidades) as c(devops_user_id uuid, nome text)
  on conflict (devops_user_id) do nothing;

  delete from capacidade_sprint where sprint_id = p_sprint_id and time_id = p_time_id;
  delete from dias_off where sprint_id = p_sprint_id and time_id = p_time_id;

  insert into capacidade_sprint (sprint_id, time_id, pessoa_id, capacidade_dia, atividades)
  select p_sprint_id, p_time_id, p.id, coalesce(c.capacidade_dia, 0), coalesce(c.atividades, '[]')
    from jsonb_to_recordset(p_capacidades) as c(devops_user_id uuid, capacidade_dia numeric, atividades jsonb)
    join pessoa p on p.devops_user_id = c.devops_user_id;

  insert into dias_off (sprint_id, time_id, pessoa_id, inicio, fim)
  select p_sprint_id, p_time_id, p.id, (d->>'inicio')::date, (d->>'fim')::date
    from jsonb_to_recordset(p_capacidades) as c(devops_user_id uuid, dias_off jsonb)
    join pessoa p on p.devops_user_id = c.devops_user_id
    cross join lateral jsonb_array_elements(coalesce(c.dias_off, '[]')) d;

  insert into dias_off (sprint_id, time_id, pessoa_id, inicio, fim)
  select p_sprint_id, p_time_id, null, (d->>'inicio')::date, (d->>'fim')::date
    from jsonb_array_elements(coalesce(p_dias_off_time, '[]')) d;
end $$;

-- Lease de sync por projeto (evita duas execuções simultâneas)
create or replace function public.acquire_sync_lease(p_projeto_id uuid, p_segundos integer default 170)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  insert into sync_state (projeto_id, lease_ate)
  values (p_projeto_id, now() + make_interval(secs => p_segundos))
  on conflict (projeto_id) do update set lease_ate = excluded.lease_ate
   where sync_state.lease_ate is null or sync_state.lease_ate < now()
  returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function public.release_sync_lease(p_projeto_id uuid)
returns void language sql security definer set search_path = public as $$
  update sync_state set lease_ate = null where projeto_id = p_projeto_id;
$$;

-- =====================================================================
-- Views para o front (security_invoker: respeitam RLS)
-- =====================================================================
create view public.feature with (security_invoker = true) as
select devops_id, projeto_id, sprint_id, titulo, descritivo as descricao, tags, estado,
       responsavel_id, changed_date, atualizado_em
  from public.work_item
 where tipo = 'Feature' and deleted_at is null;

-- Árvore Sprint → Feature → Item (linhas planas; o front agrupa).
-- Features sem filhos aparecem com as colunas de item nulas.
create view public.v_backlog with (security_invoker = true) as
select t.projeto_id,
       coalesce(t.sprint_id, f.sprint_id)      as sprint_id,
       s.nome as sprint_nome, s.inicio as sprint_inicio, s.fim as sprint_fim,
       f.devops_id as feature_id, f.titulo as feature_titulo, f.estado as feature_estado,
       t.devops_id as item_id, t.tipo as item_tipo, t.titulo as item_titulo,
       t.estado as item_estado, t.parent_devops_id as item_parent_id,
       t.responsavel_id, p.nome as responsavel_nome,
       t.horas_estimadas, t.horas_restantes, t.horas_concluidas, t.horas_origem, t.tags,
       (t.horas_estimadas is null and t.horas_restantes is null and t.horas_concluidas is null)
         as sem_estimativa,
       t.atualizado_em
  from public.work_item t
  left join public.work_item f on f.devops_id = t.feature_devops_id and f.deleted_at is null
  left join public.sprint s on s.id = coalesce(t.sprint_id, f.sprint_id)
  left join public.pessoa p on p.id = t.responsavel_id
 where t.deleted_at is null and t.tipo not in ('Feature','Epic')
union all
select f.projeto_id, f.sprint_id, s.nome, s.inicio, s.fim,
       f.devops_id, f.titulo, f.estado,
       null, null, null, null, null, null, null, null, null, null, null, null, null,
       f.atualizado_em
  from public.work_item f
  left join public.sprint s on s.id = f.sprint_id
 where f.tipo = 'Feature' and f.deleted_at is null
   and not exists (select 1 from public.work_item c
                    where c.feature_devops_id = f.devops_id and c.deleted_at is null);

-- =====================================================================
-- Segurança: RLS em tudo; leitura para autenticados; escrita só service_role
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['projeto','time','pessoa','time_membro','sprint','capacidade_sprint',
                           'dias_off','ausencia','feriado','skill_tag','work_item','sugestao',
                           'evento','sync_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "leitura_autenticados" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

revoke execute on function
  public.upsert_work_items(jsonb, text), public.soft_delete_work_item(integer, integer),
  public.sweep_work_items(uuid, integer[]), public.sync_time_membros(uuid, jsonb),
  public.replace_capacidade(uuid, uuid, jsonb, jsonb), public.acquire_sync_lease(uuid, integer),
  public.release_sync_lease(uuid), public.recompute_hierarquia(integer[])
  from public, anon, authenticated;

grant execute on function
  public.upsert_work_items(jsonb, text), public.soft_delete_work_item(integer, integer),
  public.sweep_work_items(uuid, integer[]), public.sync_time_membros(uuid, jsonb),
  public.replace_capacidade(uuid, uuid, jsonb, jsonb), public.acquire_sync_lease(uuid, integer),
  public.release_sync_lease(uuid), public.recompute_hierarquia(integer[])
  to service_role;

-- =====================================================================
-- Realtime
-- =====================================================================
alter publication supabase_realtime add table
  public.work_item, public.sprint, public.time_membro, public.capacidade_sprint,
  public.evento, public.sync_state;
