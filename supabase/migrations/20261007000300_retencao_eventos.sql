select cron.schedule(
  'radar-retencao-eventos',
  '17 3 * * *',
  $job$
  delete from public.evento
   where status in ('processado', 'ignorado')
     and recebido_em < now() - interval '30 days';
  $job$
);
