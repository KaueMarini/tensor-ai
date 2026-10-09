-- LGPD (privacy by design), em camadas EM VOLTA do que já existe (triggers, políticas e funções;
-- nenhuma regra de negócio reescrita):
--   1. RBAC: papéis admin / gestor / membro (menor privilégio). Sugestões, auditoria, avaliação
--      de projetos e notificações executivas só para gestor/admin; configurações só gestor/admin.
--   2. Auditoria append-only com encadeamento de hash (adulteração detectável), ator anonimizado
--      (HMAC do id com sal no Vault), IP mascarado, zero PII em texto puro.
--   3. TTL: expurgo diário de sugestões, caches de explicação, notificações e histórico antigo.
--   4. Direito ao esquecimento: esquecer_pessoa (apaga dados pessoais e anonimiza de vez) e
--      esquecer_usuario (apaga a conta do app). Só admin.
--   5. Minimização: e-mail do autor na auditoria de ações (acao) passa a ser mascarado.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- 1. RBAC
-- ============================================================================

create table public.usuario_papel (
  user_id        uuid primary key references auth.users on delete cascade,
  papel          text not null default 'membro' check (papel in ('admin', 'gestor', 'membro')),
  atualizado_em  timestamptz not null default now()
);
-- quem já usa o app (demo e QA) continua com acesso total; contas novas entram como membro
insert into public.usuario_papel (user_id, papel) select id, 'admin' from auth.users on conflict do nothing;

create or replace function public.trg_papel_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuario_papel (user_id, papel) values (new.id, 'membro') on conflict do nothing;
  return new;
end $$;
create trigger trg_radar_papel_novo_usuario after insert on auth.users
  for each row execute function public.trg_papel_novo_usuario();

create or replace function public.papel_atual()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select papel from public.usuario_papel where user_id = auth.uid()), 'membro')
$$;
create or replace function public.eh_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select public.papel_atual() in ('admin', 'gestor')
$$;
create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.papel_atual() = 'admin'
$$;
grant execute on function public.papel_atual(), public.eh_gestor(), public.eh_admin() to authenticated;

alter table public.usuario_papel enable row level security;
create policy "le_o_proprio_ou_admin" on public.usuario_papel for select to authenticated
  using (user_id = auth.uid() or public.eh_admin());
create policy "admin_gerencia" on public.usuario_papel for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- Dados executivos: só gestor/admin leem
alter policy "leitura_autenticados" on public.sugestao using (public.eh_gestor());
alter policy "leitura_autenticados" on public.acao using (public.eh_gestor());
alter policy "leitura_autenticados" on public.projeto_avaliacao using (public.eh_gestor());
alter policy "gestor_escreve" on public.projeto_avaliacao using (public.eh_gestor()) with check (public.eh_gestor());
alter policy "le_proprias_ou_gerais" on public.notificacao
  using ((usuario_id is null or usuario_id = auth.uid()) and public.eh_gestor());

-- Configurações e cadastros: só gestor/admin escrevem (leitura continua para todos)
alter policy "gestor_escreve" on public.regra_capacidade using (public.eh_gestor()) with check (public.eh_gestor());
alter policy "gestor_escreve" on public.regra_capacidade_pessoa using (public.eh_gestor()) with check (public.eh_gestor());
alter policy "gestor_escreve" on public.regra_capacidade_projeto using (public.eh_gestor()) with check (public.eh_gestor());
alter policy "gestor_escreve" on public.alocacao_projeto using (public.eh_gestor()) with check (public.eh_gestor());
alter policy "gestor_escreve_funcao_tag" on public.funcao_tag using (public.eh_gestor()) with check (public.eh_gestor());
alter policy "gestor_escreve_pessoa_funcao_tag" on public.pessoa_funcao_tag using (public.eh_gestor()) with check (public.eh_gestor());
alter policy "gestor_escreve_skill_tag" on public.skill_tag using (public.eh_gestor()) with check (public.eh_gestor());
alter policy "gestor_insere_ausencia" on public.ausencia with check (public.eh_gestor());
alter policy "gestor_exclui_ausencia" on public.ausencia using (public.eh_gestor());
alter policy "gestor_insere_feriado" on public.feriado with check (abrangencia in ('regional', 'recesso') and public.eh_gestor());
alter policy "gestor_exclui_feriado" on public.feriado using (abrangencia in ('regional', 'recesso') and public.eh_gestor());

-- ============================================================================
-- 2. Auditoria append-only (hash encadeado)
-- ============================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'radar_audit_salt') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'radar_audit_salt');
  end if;
end $$;

create table public.auditoria (
  id             bigint generated always as identity primary key,
  ocorrido_em    timestamptz not null default now(),
  ator           text not null,           -- HMAC-SHA256 do user id (nunca id/e-mail em claro)
  papel          text,
  acao           text not null,
  recurso        text,                    -- id técnico (uuid / devops_id), nunca nome
  ip_mascarado   text,
  detalhe        jsonb,
  hash_anterior  text,
  hash           text not null
);
create index on public.auditoria (ocorrido_em desc);

create or replace function public.ator_anonimo(p_uid uuid)
returns text language sql stable security definer set search_path = public, extensions as $$
  select case when p_uid is null then 'sistema'
    else 'u_' || left(encode(extensions.hmac(p_uid::text,
      (select decrypted_secret from vault.decrypted_secrets where name = 'radar_audit_salt'), 'sha256'), 'hex'), 16)
  end
$$;

create or replace function public.mascarar_ip(p_ip text)
returns text language sql immutable as $$
  select case
    when p_ip is null or btrim(p_ip) = '' then null
    when split_part(btrim(split_part(p_ip, ',', 1)), '.', 4) <> ''
      then split_part(btrim(split_part(p_ip, ',', 1)), '.', 1) || '.' || split_part(btrim(split_part(p_ip, ',', 1)), '.', 2) || '.xxx.xxx'
    else split_part(btrim(split_part(p_ip, ',', 1)), ':', 1) || ':' || split_part(btrim(split_part(p_ip, ',', 1)), ':', 2) || ':' ||
         split_part(btrim(split_part(p_ip, ',', 1)), ':', 3) || '::/48'
  end
$$;

/** IP de quem chamou a API (PostgREST expõe os headers da requisição). */
create or replace function public.ip_da_requisicao()
returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for',
    nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip'
  )
$$;

create or replace function public.trg_auditoria_encadear()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_ant text;
begin
  perform pg_advisory_xact_lock(hashtext('radar_auditoria'));
  select hash into v_ant from public.auditoria order by id desc limit 1;
  new.ocorrido_em := coalesce(new.ocorrido_em, now());
  new.hash_anterior := v_ant;
  new.hash := encode(extensions.digest(
    coalesce(v_ant, '') || '|' || new.ocorrido_em::text || '|' || new.ator || '|' || coalesce(new.papel, '') || '|' ||
    new.acao || '|' || coalesce(new.recurso, '') || '|' || coalesce(new.ip_mascarado, '') || '|' || coalesce(new.detalhe::text, ''),
    'sha256'), 'hex');
  return new;
end $$;
create trigger trg_auditoria_encadear before insert on public.auditoria
  for each row execute function public.trg_auditoria_encadear();

-- Append-only: ninguém altera; apagar só o expurgo de retenção (TTL de 1 ano)
create or replace function public.trg_auditoria_imutavel()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('radar.expurgo_auditoria', true) = 'on' then
    return old;
  end if;
  raise exception 'auditoria é append-only (% bloqueado)', tg_op;
end $$;
create trigger trg_auditoria_imutavel before update or delete on public.auditoria
  for each row execute function public.trg_auditoria_imutavel();
create trigger trg_auditoria_sem_truncate before truncate on public.auditoria
  for each statement execute function public.trg_auditoria_imutavel();

create or replace function public.registrar_auditoria(
  p_acao text, p_recurso text default null, p_detalhe jsonb default null,
  p_ator uuid default null, p_ip text default null, p_papel text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ator uuid := coalesce(p_ator, auth.uid());
begin
  insert into public.auditoria (ator, papel, acao, recurso, ip_mascarado, detalhe)
  values (
    public.ator_anonimo(v_ator),
    coalesce(p_papel, (select papel from public.usuario_papel where user_id = v_ator), case when v_ator is null then 'sistema' end),
    p_acao, p_recurso,
    public.mascarar_ip(coalesce(p_ip, public.ip_da_requisicao())),
    p_detalhe);
end $$;

/** Recalcula a corrente de hashes: ok=false aponta o primeiro registro adulterado. */
create or replace function public.verificar_auditoria()
returns table (ok boolean, registros bigint, primeiro_invalido bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; v_ant text; v_n bigint := 0; v_primeiro boolean := true;
begin
  for r in select * from public.auditoria order by id loop
    v_n := v_n + 1;
    -- o 1º registro restante pode apontar para um já expurgado (TTL): confia no hash_anterior dele
    if v_primeiro then v_ant := r.hash_anterior; v_primeiro := false; end if;
    if r.hash_anterior is distinct from v_ant or r.hash <> encode(extensions.digest(
        coalesce(v_ant, '') || '|' || r.ocorrido_em::text || '|' || r.ator || '|' || coalesce(r.papel, '') || '|' ||
        r.acao || '|' || coalesce(r.recurso, '') || '|' || coalesce(r.ip_mascarado, '') || '|' || coalesce(r.detalhe::text, ''),
        'sha256'), 'hex') then
      return query select false, v_n, r.id;
      return;
    end if;
    v_ant := r.hash;
  end loop;
  return query select true, v_n, null::bigint;
end $$;

alter table public.auditoria enable row level security;
create policy "gestor_le" on public.auditoria for select to authenticated using (public.eh_gestor());
revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;
revoke execute on function public.registrar_auditoria(text, text, jsonb, uuid, text, text) from anon, authenticated, public;
grant execute on function public.verificar_auditoria() to authenticated;

-- Wrapper de auditoria nas tabelas que o gestor altera pelo app: registra quem (anônimo),
-- o quê (tabela + operação), qual registro (id técnico) e quais colunas mudaram (sem valores).
create or replace function public.trg_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reg jsonb := to_jsonb(coalesce(new, old));
  v_cols text[];
begin
  -- só ações de pessoas (JWT): gravações do sistema (sync, inferência de skills, agente) não poluem
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    select array_agg(k) into v_cols from jsonb_each(to_jsonb(new)) n(k, v)
     where to_jsonb(old) -> k is distinct from v and k not in ('atualizado_em', 'atualizado_por');
    if v_cols is null then return new; end if;
  end if;
  perform public.registrar_auditoria(
    lower(tg_op) || ':' || tg_table_name,
    coalesce(v_reg ->> 'id', v_reg ->> 'projeto_id', v_reg ->> 'pessoa_id', v_reg ->> 'user_id', v_reg ->> 'sprint_id'),
    case when v_cols is not null then jsonb_build_object('colunas', v_cols) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['regra_capacidade', 'regra_capacidade_pessoa', 'regra_capacidade_projeto', 'alocacao_projeto',
                           'ausencia', 'feriado', 'skill_tag', 'funcao_tag', 'pessoa_funcao_tag', 'projeto_avaliacao',
                           'usuario_papel'] loop
    execute format('create trigger trg_auditar after insert or update or delete on public.%I
                    for each row execute function public.trg_auditar()', t);
  end loop;
end $$;
-- decisão do gestor sobre sugestão (aprovar/ignorar) e expiração
create trigger trg_auditar after update of status on public.sugestao
  for each row execute function public.trg_auditar();

-- ============================================================================
-- 5. Minimização: e-mail mascarado na auditoria de ações no DevOps
-- ============================================================================

create or replace function public.mascarar_email(p_email text)
returns text language sql immutable as $$
  select case when p_email is null or position('@' in p_email) = 0 then p_email
    when p_email like '%***%' then p_email
    else left(split_part(p_email, '@', 1), 1) || '***@' || left(split_part(p_email, '@', 2), 1) || '***' ||
         coalesce('.' || nullif(substring(split_part(p_email, '@', 2) from position('.' in split_part(p_email, '@', 2)) + 1), split_part(p_email, '@', 2)), '')
  end
$$;

create or replace function public.trg_acao_minimizar()
returns trigger language plpgsql as $$
begin
  new.usuario_email := public.mascarar_email(new.usuario_email);
  return new;
end $$;
create trigger trg_acao_minimizar before insert or update of usuario_email on public.acao
  for each row execute function public.trg_acao_minimizar();
update public.acao set usuario_email = public.mascarar_email(usuario_email) where usuario_email is not null;

-- ============================================================================
-- 3. TTL — expurgo diário
-- ============================================================================

create or replace function public.expurgo_lgpd()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb := '{}'::jsonb; n bigint;
begin
  update public.sugestao set status = 'expirada', decidida_em = now()
   where status = 'pendente' and criada_em < now() - interval '30 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('sugestoes_expiradas', n);

  delete from public.sugestao where status <> 'pendente' and coalesce(decidida_em, criada_em) < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('sugestoes_apagadas', n);

  -- cache da IA explicável (análise já entregue): some em 7 dias
  update public.sugestao set payload = payload - 'explicacao'
   where payload ? 'explicacao' and coalesce((payload -> 'explicacao' ->> 'gerado_em')::timestamptz, criada_em) < now() - interval '7 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('explicacoes_apagadas', n);

  delete from public.notificacao
   where (lida_em is not null and lida_em < now() - interval '30 days') or criada_em < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('notificacoes_apagadas', n);

  delete from public.work_item_transicao where changed_at < now() - interval '365 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('transicoes_apagadas', n);

  delete from public.acao where criado_em < now() - interval '365 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('acoes_apagadas', n);

  perform set_config('radar.expurgo_auditoria', 'on', true);
  delete from public.auditoria where ocorrido_em < now() - interval '365 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('auditoria_apagada', n);
  perform set_config('radar.expurgo_auditoria', 'off', true);

  perform public.registrar_auditoria('expurgo_lgpd', null, r, null, null, 'sistema');
  return r;
end $$;
revoke execute on function public.expurgo_lgpd() from anon, authenticated, public;

select cron.schedule('radar-expurgo-lgpd', '41 3 * * *', $job$ select public.expurgo_lgpd(); $job$);

-- ============================================================================
-- 4. Direito ao esquecimento
-- ============================================================================

alter table public.pessoa add column esquecida_em timestamptz;

-- A sync atualiza nome/e-mail de quem aparece no DevOps: para quem foi esquecida, nunca mais
create or replace function public.trg_pessoa_esquecida()
returns trigger language plpgsql as $$
begin
  if old.esquecida_em is not null then
    new.nome := old.nome;
    new.unique_name := null;
    new.esquecida_em := old.esquecida_em;
  end if;
  return new;
end $$;
create trigger trg_pessoa_esquecida before update on public.pessoa
  for each row execute function public.trg_pessoa_esquecida();

-- E a inferência de skills não recria perfil de quem foi esquecida
create or replace function public.trg_skill_de_esquecida()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.pessoa where id = new.pessoa_id and esquecida_em is not null) then
    return null;
  end if;
  return new;
end $$;
create trigger trg_skill_de_esquecida before insert on public.skill_tag
  for each row execute function public.trg_skill_de_esquecida();

create or replace function public.esquecer_pessoa(p_pessoa_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome text; v_email text; r jsonb := '{}'::jsonb; n bigint;
begin
  if auth.uid() is not null and not public.eh_admin() then
    raise exception 'Só um admin pode excluir dados pessoais.';
  end if;
  select nome, unique_name into v_nome, v_email from public.pessoa where id = p_pessoa_id and esquecida_em is null;
  if v_nome is null then raise exception 'Pessoa não encontrada ou já excluída.'; end if;

  delete from public.skill_tag where pessoa_id = p_pessoa_id;
  delete from public.pessoa_funcao_tag where pessoa_id = p_pessoa_id;
  delete from public.ausencia where pessoa_id = p_pessoa_id;
  delete from public.regra_capacidade_pessoa where pessoa_id = p_pessoa_id;
  delete from public.alocacao_projeto where pessoa_id = p_pessoa_id;
  delete from public.notificacao where pessoa_id = p_pessoa_id or position(v_nome in coalesce(titulo, '') || coalesce(mensagem, '')) > 0;
  get diagnostics n = row_count; r := r || jsonb_build_object('notificacoes', n);
  delete from public.sugestao
   where position(p_pessoa_id::text in coalesce(acao::text, '') || coalesce(payload::text, '') || coalesce(impacto_antes::text, '')) > 0
      or position(v_nome in coalesce(markdown, '')) > 0;
  get diagnostics n = row_count; r := r || jsonb_build_object('sugestoes', n);
  -- histórico de ações no DevOps: some o nome, fica o fato (auditoria legítima)
  update public.acao set
    antes = replace(antes::text, v_nome, 'Pessoa removida')::jsonb,
    depois = replace(replace(depois::text, v_nome, 'Pessoa removida'), p_pessoa_id::text, '00000000-0000-0000-0000-000000000000')::jsonb
   where position(v_nome in coalesce(antes::text, '') || coalesce(depois::text, '')) > 0;
  get diagnostics n = row_count; r := r || jsonb_build_object('acoes_anonimizadas', n);

  update public.pessoa set nome = 'Pessoa removida', unique_name = null, esquecida_em = now() where id = p_pessoa_id;
  perform public.registrar_auditoria('esquecer_pessoa', p_pessoa_id::text, r);
  return r;
end $$;
revoke execute on function public.esquecer_pessoa(uuid) from anon, public;
grant execute on function public.esquecer_pessoa(uuid) to authenticated;

create or replace function public.esquecer_usuario(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null and not public.eh_admin() then
    raise exception 'Só um admin pode excluir contas.';
  end if;
  update public.acao set usuario_id = null, usuario_email = null where usuario_id = p_user_id;
  update public.notificacao set usuario_id = null where usuario_id = p_user_id;
  delete from auth.users where id = p_user_id;
  perform public.registrar_auditoria('esquecer_usuario', null, jsonb_build_object('ator_removido', public.ator_anonimo(p_user_id)));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.esquecer_usuario(uuid) from anon, public;
grant execute on function public.esquecer_usuario(uuid) to authenticated;

alter publication supabase_realtime add table public.usuario_papel;
