-- Retenção da tabela evento: o payload bruto de cada webhook (~2 KB) acumularia para sempre
-- e, no free tier (500 MB), viraria problema em alguns meses. Todo dia às 03:17 UTC apaga
-- eventos já resolvidos com mais de 30 dias. Eventos com erro ou pendentes são mantidos
-- para diagnóstico (a reconciliação reprocessa os pendentes).

select cron.schedule(
  'radar-retencao-eventos',
  '17 3 * * *',
  $job$
  delete from public.evento
   where status in ('processado', 'ignorado')
     and recebido_em < now() - interval '30 days';
  $job$
);
