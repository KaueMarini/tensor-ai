create or replace function public.set_atualizado_por()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end $$;

create table public.regra_capacidade (
  id                 boolean primary key default true check (id),
  jornada_dia        numeric(4,2) not null default 8    check (jornada_dia > 0 and jornada_dia <= 24),
  foco               numeric(4,3) not null default 0.75 check (foco > 0 and foco <= 1),
  limite_atencao     numeric(4,3) not null default 0.80 check (limite_atencao > 0),
  limite_sobrecarga  numeric(4,3) not null default 1.00 check (limite_sobrecarga > 0 and limite_sobrecarga <= 3),
  atualizado_por     uuid references auth.users on delete set null,
  atualizado_em      timestamptz not null default now(),
  check (limite_atencao < limite_sobrecarga)
);
insert into public.regra_capacidade (id) values (true);

create table public.regra_capacidade_pessoa (
  pessoa_id       uuid primary key references public.pessoa on delete cascade,
  jornada_dia     numeric(4,2) check (jornada_dia > 0 and jornada_dia <= 24),
  foco            numeric(4,3) check (foco > 0 and foco <= 1),
  observacao      text,
  atualizado_por  uuid references auth.users on delete set null,
  atualizado_em   timestamptz not null default now()
);

create table public.regra_capacidade_projeto (
  projeto_id         uuid primary key references public.projeto on delete cascade,
  limite_atencao     numeric(4,3) check (limite_atencao > 0),
  limite_sobrecarga  numeric(4,3) check (limite_sobrecarga > 0 and limite_sobrecarga <= 3),
  atualizado_por     uuid references auth.users on delete set null,
  atualizado_em      timestamptz not null default now(),
  check (limite_atencao is null or limite_sobrecarga is null or limite_atencao < limite_sobrecarga)
);

create table public.alocacao_projeto (
  projeto_id      uuid not null references public.projeto on delete cascade,
  pessoa_id       uuid not null references public.pessoa on delete cascade,
  horas_dia       numeric(4,2) not null check (horas_dia >= 0 and horas_dia <= 24),
  atualizado_por  uuid references auth.users on delete set null,
  atualizado_em   timestamptz not null default now(),
  primary key (projeto_id, pessoa_id)
);
create index on public.alocacao_projeto (pessoa_id);

do $$
declare t text;
begin
  foreach t in array array['regra_capacidade','regra_capacidade_pessoa','regra_capacidade_projeto','alocacao_projeto'] loop
    execute format('create trigger trg_atualizado before insert or update on public.%I
                    for each row execute function public.set_atualizado_por()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "leitura_autenticados" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "gestor_escreve" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

revoke delete on public.regra_capacidade from authenticated, anon;
