-- Reconciliação a cada 5 minutos: pg_cron -> pg_net -> Edge Function devops-sync (mode=reconcile).
-- Pré-requisito (NÃO versionado; rodar uma vez com os valores reais, ver README):
--   select vault.create_secret('https://<ref>.supabase.co', 'radar_project_url');
--   select vault.create_secret('<SYNC_SECRET>', 'radar_sync_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'radar-devops-reconcile',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'radar_project_url')
           || '/functions/v1/devops-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'radar_sync_secret')
    ),
    body := '{"mode":"reconcile"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);
