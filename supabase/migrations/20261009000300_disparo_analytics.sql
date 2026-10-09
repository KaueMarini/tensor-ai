create or replace function public.chamar_analytics(caminho text, corpo jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_url     text;
  v_segredo text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'radar_analytics_url';
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'radar_analytics_secret';
  if v_url is null or v_segredo is null then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || caminho,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-analytics-secret', v_segredo),
    body := corpo,
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'chamar_analytics(%): %', caminho, sqlerrm;
  return null;
end $$;

create or replace function public.trg_evento_analytics()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.chamar_analytics(
    '/analyze/event',
    jsonb_build_object('work_item_id', new.devops_id, 'evento_id', new.id)
  );
  return new;
end $$;

create trigger trg_evento_processado_analytics
  after update of status on public.evento
  for each row
  when (new.status = 'processado' and old.status is distinct from 'processado'
        and new.tipo in ('workitem.created', 'workitem.updated') and new.devops_id is not null)
  execute function public.trg_evento_analytics();

revoke execute on function public.chamar_analytics(text, jsonb), public.trg_evento_analytics()
  from anon, authenticated, public;

select cron.schedule(
  'radar-analytics-sweep',
  '*/15 * * * *',
  $job$ select public.chamar_analytics('/analyze/sweep', '{}'::jsonb); $job$
);
