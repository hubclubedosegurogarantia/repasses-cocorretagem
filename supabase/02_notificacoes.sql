-- =====================================================================
-- Repasses de Cocorretagem · 02 · Agendamento dos lembretes (e-mail e push)
-- Rode DEPOIS de publicar a função "lembretes" (veja o README, passo 6).
-- Antes de rodar, troque os dois valores marcados com <<< >>> abaixo.
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Endereço da função e senha compartilhada com ela (a mesma do CRON_SECRET)
create table if not exists public.config_notificacoes (
  id           int primary key default 1 check (id = 1),
  funcao_url   text not null,
  segredo      text not null
);
alter table public.config_notificacoes enable row level security;  -- ninguém lê pelo app

insert into public.config_notificacoes (id, funcao_url, segredo) values (
  1,
  'https://<<<SEU-PROJETO>>>.supabase.co/functions/v1/lembretes',
  '<<<O MESMO VALOR QUE VOCÊ USOU EM CRON_SECRET>>>'
)
on conflict (id) do update set funcao_url = excluded.funcao_url, segredo = excluded.segredo;

create or replace function public.chamar_lembretes(corpo jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.config_notificacoes where id = 1;
  if c is null then return; end if;
  perform net.http_post(
    url     := c.funcao_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', c.segredo),
    body    := corpo
  );
end $$;

-- 1) Verificação de hora em hora. A função compara com os dias e a hora
--    escolhidos na tela "Lembretes" do app e só envia quando bater
--    (e no máximo uma vez por dia para cada tipo de aviso).
select cron.unschedule(jobid) from cron.job where jobname = 'lembretes-cocorretagem';
select cron.schedule(
  'lembretes-cocorretagem',
  '0 * * * *',
  $$ select public.chamar_lembretes('{"tipo":"agenda"}'::jsonb); $$
);

-- 2) O aviso de "nova apólice lançada" foi desligado: o app só notifica pagamentos e recebimentos.
drop trigger if exists cocorretagens_aviso_nova on public.cocorretagens;
drop function if exists public.avisar_nova_cocorretagem();
