create table public.work_item_transicao (
  id            bigint generated always as identity primary key,
  work_item_id  integer not null,
  campo         text not null check (campo in ('System.State', 'System.BoardColumn')),
  de            text,
  para          text,
  changed_at    timestamptz not null,
  changed_rev   integer not null,
  origem        text not null check (origem in ('backfill', 'evento')),
  criado_em     timestamptz not null default now(),
  unique (work_item_id, campo, changed_rev)
);
create index on public.work_item_transicao (work_item_id, campo, changed_at);
create index on public.work_item_transicao (changed_at);

alter table public.work_item_transicao enable row level security;
create policy "leitura_autenticados" on public.work_item_transicao
  for select to authenticated using (true);

create or replace function public.transicao_valor(campo jsonb, qual text)
returns text language sql immutable as $$
  select case
    when campo is null or jsonb_typeof(campo) = 'null' then null
    when jsonb_typeof(campo) = 'object' then campo ->> qual
    when qual = 'newValue' then campo #>> '{}'
    else null
  end
$$;

create or replace function public.registrar_transicoes_evento()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r        jsonb := new.payload -> 'resource';
  campos   jsonb;
  rev      integer;
  quando   timestamptz;
  c        text;
  v_de     text;
  v_para   text;
begin
  if new.tipo not in ('workitem.created', 'workitem.updated') or new.devops_id is null then
    return new;
  end if;

  campos := coalesce(r -> 'fields', '{}'::jsonb);
  rev := coalesce(new.rev, (r ->> 'rev')::integer, (r -> 'revision' ->> 'rev')::integer);
  quando := coalesce(
    nullif(public.transicao_valor(campos -> 'System.ChangedDate', 'newValue'), '')::timestamptz,
    nullif(r -> 'revision' -> 'fields' ->> 'System.ChangedDate', '')::timestamptz,
    nullif(r ->> 'revisedDate', '')::timestamptz,
    new.recebido_em
  );
  if quando > now() + interval '1 day' then
    quando := new.recebido_em;
  end if;
  if rev is null then
    return new;
  end if;

  foreach c in array array['System.State', 'System.BoardColumn'] loop
    if campos ? c then
      v_de := public.transicao_valor(campos -> c, 'oldValue');
      v_para := public.transicao_valor(campos -> c, 'newValue');
      if v_para is distinct from v_de then
        insert into public.work_item_transicao (work_item_id, campo, de, para, changed_at, changed_rev, origem)
        values (new.devops_id, c, v_de, v_para, quando, rev, 'evento')
        on conflict (work_item_id, campo, changed_rev) do nothing;
      end if;
    end if;
  end loop;
  return new;
exception when others then
  raise warning 'registrar_transicoes_evento(%): %', new.id, sqlerrm;
  return new;
end $$;

create trigger trg_evento_transicoes
  after insert on public.evento
  for each row execute function public.registrar_transicoes_evento();

revoke execute on function public.registrar_transicoes_evento() from anon, authenticated, public;
