-- =====================================================================
-- Repasses de Cocorretagem · Clube do Seguro Garantia
-- 01 · Estrutura do banco, regras de acesso e armazenamento de documentos
-- Rode este arquivo inteiro no Supabase: SQL Editor → New query → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pessoas autorizadas
--    Só quem estiver nesta tabela vê e altera os dados, mesmo que tenha
--    um usuário criado no Supabase. Troque os e-mails abaixo pelos reais.
--    Administradores (admin = true) incluem e excluem pessoas e redefinem
--    senhas na página Configurações. Depois da primeira vez, a lista é
--    mantida pelo próprio app.
-- ---------------------------------------------------------------------
create table if not exists public.autorizados (
  email      text primary key,
  nome       text not null,
  admin      boolean not null default false,
  criado_em  timestamptz not null default now()
);
alter table public.autorizados add column if not exists admin boolean not null default false;

insert into public.autorizados (email, nome, admin) values
  ('marcelo@SEU-DOMINIO.com.br',   'Marcelo Queiroz',  true),
  ('simone@SEU-DOMINIO.com.br',    'Simone Fraga',     true),
  ('dayane@SEU-DOMINIO.com.br',    'Dayane Noa',       false),
  ('guilherme@SEU-DOMINIO.com.br', 'Guilherme Távora', true)
on conflict (email) do nothing;

-- E-mail de quem está logado (vem do token de login)
create or replace function public.email_atual()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- A pessoa logada está na lista de autorizados?
create or replace function public.is_autorizado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.autorizados a where lower(a.email) = public.email_atual());
$$;

-- A pessoa logada é administradora?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.autorizados a where lower(a.email) = public.email_atual() and a.admin);
$$;

-- ---------------------------------------------------------------------
-- 1a. Corretoras emissoras (cada uma tem um painel próprio no app)
--     A CS Corretora já vem cadastrada. Outras são criadas em Configurações.
-- ---------------------------------------------------------------------
create table if not exists public.emissoras (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text unique check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  susep       text,
  ordem       int not null default 10,
  criado_por  text default public.email_atual(),
  criado_em   timestamptz not null default now()
);
alter table public.emissoras add column if not exists susep text;
-- corretoras do mesmo dono que contam como esta emissora: [{"nome","cnpj","susep"}]
alter table public.emissoras add column if not exists grupo jsonb not null default '[]'::jsonb;
insert into public.emissoras (nome, cnpj, susep, ordem)
values ('CS GARANTIA CORRETORA DE SEGUROS LTDA', '57610106000124', '242162852', 0)
on conflict (cnpj) do update set susep = coalesce(public.emissoras.susep, excluded.susep);
-- a Nosso Porto é do mesmo dono da CS: entra como corretora do grupo
update public.emissoras
   set grupo = '[{"nome":"NOSSO PORTO ADMINISTRADORA E CORRETORA DE SEGUROS LTDA","cnpj":"13299856000151","susep":"202038784"}]'::jsonb
 where cnpj = '57610106000124' and grupo = '[]'::jsonb;
-- completa o CNPJ da Nosso Porto se ela já estava no grupo sem ele
update public.emissoras e
   set grupo = (select jsonb_agg(case when g->>'susep' = '202038784' and coalesce(g->>'cnpj','') = ''
                                      then g || '{"nome":"NOSSO PORTO ADMINISTRADORA E CORRETORA DE SEGUROS LTDA","cnpj":"13299856000151"}'::jsonb
                                      else g end)
                  from jsonb_array_elements(e.grupo) g)
 where e.cnpj = '57610106000124' and e.grupo @> '[{"susep":"202038784"}]'::jsonb;

-- Painel padrão (o primeiro cadastrado)
create or replace function public.emissora_padrao()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.emissoras order by ordem, criado_em limit 1;
$$;

-- ---------------------------------------------------------------------
-- 1b. Corretoras (só nome e CNPJ; os demais dados ficam no Hablla/planilha)
-- ---------------------------------------------------------------------
create table if not exists public.corretoras (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  cnpj           text unique check (cnpj is null or cnpj ~ '^[0-9]{14}$'),   -- só números
  criado_por     text default public.email_atual(),
  criado_em      timestamptz not null default now(),
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);
create index if not exists corretoras_nome_idx on public.corretoras (lower(nome));
alter table public.corretoras add column if not exists susep text;
create unique index if not exists corretoras_susep_idx on public.corretoras (susep) where susep is not null;
-- dados do destinatário no demonstrativo de pagamento (preenchidos ao gerar o demonstrativo)
alter table public.corretoras add column if not exists representante text;
alter table public.corretoras add column if not exists pix text;

-- ---------------------------------------------------------------------
-- 1c. Seguradoras (lista editável pelo app)
-- ---------------------------------------------------------------------
create table if not exists public.seguradoras (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  criado_por text default public.email_atual(),
  criado_em  timestamptz not null default now()
);
alter table public.seguradoras add column if not exists razao_social text;
alter table public.seguradoras add column if not exists susep text;
alter table public.seguradoras add column if not exists cnpj text;
alter table public.seguradoras add column if not exists cor text;   -- cor da etiqueta (0 a 11); vazio = automática
alter table public.seguradoras add column if not exists comissao_padrao numeric(6,2) check (comissao_padrao is null or (comissao_padrao >= 0 and comissao_padrao <= 100));
do $$ begin
  alter table public.seguradoras add constraint seguradoras_cnpj_formato check (cnpj is null or cnpj ~ '^[0-9]{14}$');
exception when duplicate_object then null; end $$;
create unique index if not exists seguradoras_nome_idx on public.seguradoras (lower(nome));
create unique index if not exists seguradoras_cnpj_idx on public.seguradoras (cnpj) where cnpj is not null;

-- Seguradoras parceiras com razão social e CNPJ (das notas fiscais e da certidão Susep)
insert into public.seguradoras (nome, razao_social, cnpj)
select v.nome, v.razao, v.cnpj from (values
  ('Avla',       'AVLA SEGUROS BRASIL S.A.',      '41182665000140'),
  ('Essor',      'ESSOR SEGUROS S.A.',            '14525684000150'),
  ('Junto',      'JUNTO SEGUROS S.A.',            '84948157000133'),
  ('Newe',       'NEWE SEGUROS S.A.',             '26609195000165'),
  ('Pottencial', 'POTTENCIAL SEGURADORA S.A.',    '11699534000174'),
  ('Sancor',     'SANCOR SEGUROS DO BRASIL S.A.', '17643407000130'),
  ('Akad',       'AKAD SEGUROS S.A.',             '14868712000131'),
  ('Sompo',      'SOMPO SEGUROS S.A.',            '61383493000180'),
  ('Fairfax',    'FAIRFAX BRASIL SEGUROS CORPORATIVOS S.A.', '10793428000192')
) as v(nome, razao, cnpj)
where not exists (select 1 from public.seguradoras s where lower(s.nome) = lower(v.nome));
update public.seguradoras s set razao_social = v.razao, cnpj = v.cnpj
from (values
  ('avla','AVLA SEGUROS BRASIL S.A.','41182665000140'),('essor','ESSOR SEGUROS S.A.','14525684000150'),
  ('junto','JUNTO SEGUROS S.A.','84948157000133'),('newe','NEWE SEGUROS S.A.','26609195000165'),
  ('pottencial','POTTENCIAL SEGURADORA S.A.','11699534000174'),('sancor','SANCOR SEGUROS DO BRASIL S.A.','17643407000130'),
  ('akad','AKAD SEGUROS S.A.','14868712000131'),('sompo','SOMPO SEGUROS S.A.','61383493000180'),
  ('fairfax','FAIRFAX BRASIL SEGUROS CORPORATIVOS S.A.','10793428000192')
) as v(k, razao, cnpj)
where lower(s.nome) = v.k and s.cnpj is null;

-- ---------------------------------------------------------------------
-- 2. Apólices com cocorretagem
-- ---------------------------------------------------------------------
create table if not exists public.cocorretagens (
  id                 uuid primary key default gen_random_uuid(),
  emissora_id        uuid not null references public.emissoras (id) default public.emissora_padrao(),
  apolice            text not null,                 -- nº da apólice na seguradora
  numero_susep       text,                          -- nº da apólice no registro SUSEP
  data_emissao       date,
  seguradora         text,
  modalidade         text,
  tomador            text,
  tomador_cnpj       text check (tomador_cnpj is null or tomador_cnpj ~ '^[0-9]{14}$'),
  -- quem é a corretora líder: 'emissora' (a emissora do painel paga a parceira)
  --                           'parceira' (a parceira é líder e paga a emissora)
  lider              text not null default 'emissora' check (lider in ('emissora','parceira')),
  emitida_por        text,                          -- corretora do grupo que aparece na apólice (vazio = a própria emissora)
  corretor           text not null,                 -- corretora parceira
  corretor_cnpj      text,
  corretor_susep     text,
  corretor_pix       text,
  premio             numeric(14,2),                 -- prêmio líquido total
  comissao_pct       numeric(6,2),                  -- comissão sobre o prêmio
  nivel              text not null default 'custom' check (nivel in ('1','2','3','custom')),
  repasse_pct        numeric(6,2),                  -- parte da comissão que fica com a PARCEIRA (%)
  valor_repasse      numeric(14,2) not null default 0, -- total a pagar (líder = emissora) ou a receber (líder = parceira)
  valor_manual       boolean not null default false,
  parcelas_qtd       int not null default 1 check (parcelas_qtd between 1 and 60),
  competencia        text check (competencia is null or competencia ~ '^[0-9]{4}-[0-9]{2}$'),  -- competência da 1ª parcela
  observacao         text,
  criado_por         text default public.email_atual(),
  criado_em          timestamptz not null default now(),
  atualizado_por     text,
  atualizado_em      timestamptz not null default now()
);
create index if not exists cocorretagens_emissora_idx on public.cocorretagens (emissora_id);
alter table public.cocorretagens add column if not exists emitida_por text;

-- Parcelas da cocorretagem: cada uma é paga (ou recebida) na sua competência
create table if not exists public.parcelas (
  id                 uuid primary key default gen_random_uuid(),
  cocorretagem_id    uuid not null references public.cocorretagens (id) on delete cascade,
  numero             int not null check (numero >= 1),
  vencimento         date,                          -- vencimento da parcela do prêmio
  premio_parcela     numeric(14,2),                 -- valor da parcela do prêmio
  valor              numeric(14,2) not null default 0, -- cocorretagem desta parcela
  competencia        text not null check (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
  comissao_recebida  boolean not null default false, -- a seguradora já pagou a comissão desta parcela à líder
  pago               boolean not null default false, -- pago (a pagar) ou recebido (a receber)
  data_pagamento     date,
  pago_por           text,
  criado_em          timestamptz not null default now(),
  atualizado_por     text,
  atualizado_em      timestamptz not null default now(),
  unique (cocorretagem_id, numero)
);
create index if not exists parcelas_competencia_idx on public.parcelas (competencia);

create index if not exists cocorretagens_competencia_idx on public.cocorretagens (competencia);
create index if not exists cocorretagens_corretor_idx    on public.cocorretagens (lower(corretor));

-- Registra quem alterou e quando
create or replace function public.marcar_atualizacao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := public.email_atual();
  return new;
end $$;

drop trigger if exists corretoras_atualizacao on public.corretoras;

drop trigger if exists cocorretagens_atualizacao on public.cocorretagens;
create trigger cocorretagens_atualizacao
  before update on public.cocorretagens
  for each row execute function public.marcar_atualizacao();

drop trigger if exists parcelas_atualizacao on public.parcelas;
create trigger parcelas_atualizacao
  before update on public.parcelas
  for each row execute function public.marcar_atualizacao();

create trigger corretoras_atualizacao
  before update on public.corretoras
  for each row execute function public.marcar_atualizacao();

-- ---------------------------------------------------------------------
-- 3. Documentos anexados (apólice, boleto, comprovante...)
--    O arquivo fica no Storage (bucket "documentos"); aqui fica o índice.
-- ---------------------------------------------------------------------
create table if not exists public.anexos (
  id               uuid primary key default gen_random_uuid(),
  cocorretagem_id  uuid not null references public.cocorretagens (id) on delete cascade,
  path             text not null unique,
  nome             text not null,
  categoria        text not null default 'Outro',
  content_type     text,
  tamanho          bigint,
  enviado_por      text default public.email_atual(),
  enviado_em       timestamptz not null default now()
);

create index if not exists anexos_cocorretagem_idx on public.anexos (cocorretagem_id);

-- ---------------------------------------------------------------------
-- 4. Aparelhos inscritos para receber notificações push
-- ---------------------------------------------------------------------
create table if not exists public.push_inscricoes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null default public.email_atual(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  aparelho   text,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4b. Configuração dos lembretes, uma linha por painel (corretora emissora)
--     dias: dias do mês do lembrete de repasse (31 = último dia do mês)
-- ---------------------------------------------------------------------
create table if not exists public.config_lembretes (
  emissora_id          uuid primary key references public.emissoras (id) on delete cascade,
  dias                 int[] not null default '{26}',
  hora                 int not null default 9 check (hora between 0 and 23),
  antecipar_fds        boolean not null default true,
  atraso_dia_semana    int default null check (atraso_dia_semana between 0 and 6),   -- não usado (lembrete semanal desligado)
  avisar_nova_push     boolean not null default true,
  ultimo_fechamento    date,
  ultimo_atraso        date,
  atualizado_por       text,
  atualizado_em        timestamptz not null default now(),
  constraint dias_validos check (dias <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31])
);

drop trigger if exists config_lembretes_atualizacao on public.config_lembretes;
create trigger config_lembretes_atualizacao
  before update on public.config_lembretes
  for each row execute function public.marcar_atualizacao();

-- Lembretes do mês: dia 26 (só se houver algo pendente) e revisão no último dia do mês (sempre)
alter table public.config_lembretes add column if not exists revisao_fim_mes boolean not null default true;
alter table public.config_lembretes add column if not exists ultima_revisao date;
alter table public.config_lembretes alter column dias set default '{26}';
alter table public.config_lembretes alter column atraso_dia_semana set default null;
update public.config_lembretes set dias = '{26}' where dias = '{25}';
update public.config_lembretes set atraso_dia_semana = null where atraso_dia_semana is not null;
-- aviso de "nova apólice lançada" desligado (o app só notifica pagamentos e recebimentos)
alter table public.config_lembretes alter column avisar_nova_push set default false;
update public.config_lembretes set avisar_nova_push = false where avisar_nova_push;

-- Avisos por vencimento de parcela: 1 dia depois do vencimento do boleto (quando a comissão cai) e 5 dias depois
alter table public.config_lembretes add column if not exists avisos_venc boolean not null default true;
alter table public.config_lembretes add column if not exists avisos_dias int[] not null default '{1,5}';
alter table public.config_lembretes alter column avisos_dias set default '{1,5}';
-- quem ainda está no padrão antigo (dia do vencimento e 5 dias depois) passa para 1 e 5 dias depois
update public.config_lembretes set avisos_dias = '{1,5}' where avisos_dias = '{0,5}';
alter table public.config_lembretes drop constraint if exists avisos_dias_validos;
alter table public.config_lembretes add constraint avisos_dias_validos
  check (avisos_dias <@ array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60]);

-- Controle do que já foi avisado (a função "lembretes" grava; evita repetir o mesmo aviso)
create table if not exists public.avisos_parcela (
  parcela_id   uuid not null references public.parcelas (id) on delete cascade,
  dias         int not null,                 -- 0 = dia do vencimento; 5 = cinco dias depois…
  enviado_em   timestamptz not null default now(),
  primary key (parcela_id, dias)
);
alter table public.avisos_parcela enable row level security;
drop policy if exists "autorizados leem avisos" on public.avisos_parcela;
create policy "autorizados leem avisos" on public.avisos_parcela
  for select to authenticated using (public.is_autorizado());

-- Histórico do que foi enviado (gravado pela função "lembretes")
create table if not exists public.notificacoes_log (
  id             bigserial primary key,
  emissora_id    uuid references public.emissoras (id) on delete set null,
  tipo           text not null,          -- fechamento | atraso | vencimento | nova | teste
  titulo         text,
  resumo         text,
  email          text,                   -- resultado do e-mail (ex.: "enviado")
  push           text,                   -- resultado do push (ex.: "3/3 aparelhos")
  destinatarios  text[],
  enviado_em     timestamptz not null default now()
);

-- Quem recebe os e-mails de lembrete de cada painel (pode incluir e-mails de
-- fora da equipe, como o financeiro). Editado na página Notificações.
create table if not exists public.destinatarios (
  emissora_id uuid not null references public.emissoras (id) on delete cascade,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nome        text,
  fechamento  boolean not null default true,   -- lembrete do dia de pagar
  atraso      boolean not null default true,   -- lembrete semanal de atrasos
  criado_por  text default public.email_atual(),
  criado_em   timestamptz not null default now(),
  primary key (emissora_id, email)
);
-- push no celular por pessoa (desligado aqui, os aparelhos dela não recebem os avisos)
alter table public.destinatarios add column if not exists push boolean not null default true;

-- Painel novo já nasce com lembretes padrão e a equipe na lista de e-mail
create or replace function public.preparar_painel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.config_lembretes (emissora_id) values (new.id) on conflict do nothing;
  insert into public.destinatarios (emissora_id, email, nome)
    select new.id, lower(a.email), a.nome from public.autorizados a on conflict do nothing;
  return new;
end $$;
drop trigger if exists emissoras_preparar on public.emissoras;
create trigger emissoras_preparar after insert on public.emissoras
  for each row execute function public.preparar_painel();

-- Painéis que já existiam (primeira instalação)
insert into public.config_lembretes (emissora_id) select id from public.emissoras on conflict do nothing;
-- (só na primeira vez: depois a lista é mantida pela página Notificações e não volta a ser preenchida)
insert into public.destinatarios (emissora_id, email, nome)
  select e.id, lower(a.email), a.nome from public.emissoras e cross join public.autorizados a
  where not exists (select 1 from public.destinatarios d where d.emissora_id = e.id)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 5. Regras de acesso (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.emissoras        enable row level security;
drop policy if exists "autorizados veem paineis" on public.emissoras;
create policy "autorizados veem paineis" on public.emissoras
  for select to authenticated using (public.is_autorizado());
drop policy if exists "admins gerenciam paineis" on public.emissoras;
create policy "admins gerenciam paineis" on public.emissoras
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.config_lembretes enable row level security;
alter table public.destinatarios    enable row level security;

drop policy if exists "autorizados gerenciam destinatarios" on public.destinatarios;
create policy "autorizados gerenciam destinatarios" on public.destinatarios
  for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());

drop policy if exists "autorizados leem lembretes" on public.config_lembretes;
create policy "autorizados leem lembretes" on public.config_lembretes
  for select to authenticated using (public.is_autorizado());
drop policy if exists "autorizados ajustam lembretes" on public.config_lembretes;
create policy "autorizados ajustam lembretes" on public.config_lembretes
  for update to authenticated using (public.is_autorizado()) with check (public.is_autorizado());

alter table public.notificacoes_log enable row level security;
drop policy if exists "autorizados leem o historico" on public.notificacoes_log;
create policy "autorizados leem o historico" on public.notificacoes_log
  for select to authenticated using (public.is_autorizado());


alter table public.autorizados     enable row level security;
alter table public.corretoras      enable row level security;
alter table public.seguradoras     enable row level security;
alter table public.cocorretagens   enable row level security;
alter table public.anexos          enable row level security;
alter table public.push_inscricoes enable row level security;

drop policy if exists "autorizados leem a lista" on public.autorizados;
create policy "autorizados leem a lista" on public.autorizados
  for select to authenticated using (public.is_autorizado());
-- A lista é alterada pela função "usuarios" (página Configurações), só por administradores.

drop policy if exists "autorizados gerenciam seguradoras" on public.seguradoras;
create policy "autorizados gerenciam seguradoras" on public.seguradoras
  for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());

drop policy if exists "autorizados gerenciam corretoras" on public.corretoras;
create policy "autorizados gerenciam corretoras" on public.corretoras
  for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());

drop policy if exists "autorizados gerenciam cocorretagens" on public.cocorretagens;
create policy "autorizados gerenciam cocorretagens" on public.cocorretagens
  for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());

alter table public.parcelas enable row level security;
drop policy if exists "autorizados gerenciam parcelas" on public.parcelas;
create policy "autorizados gerenciam parcelas" on public.parcelas
  for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());

drop policy if exists "autorizados gerenciam anexos" on public.anexos;
create policy "autorizados gerenciam anexos" on public.anexos
  for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());

drop policy if exists "cada um gerencia seus aparelhos" on public.push_inscricoes;
create policy "cada um gerencia seus aparelhos" on public.push_inscricoes
  for all to authenticated
  using (public.is_autorizado() and lower(email) = public.email_atual())
  with check (public.is_autorizado() and lower(email) = public.email_atual());

-- ---------------------------------------------------------------------
-- 6. Armazenamento dos documentos (privado, até 20 MB, PDF e imagens)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 20971520,
        array['application/pdf','image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "autorizados leem documentos" on storage.objects;
create policy "autorizados leem documentos" on storage.objects
  for select to authenticated using (bucket_id = 'documentos' and public.is_autorizado());

drop policy if exists "autorizados enviam documentos" on storage.objects;
create policy "autorizados enviam documentos" on storage.objects
  for insert to authenticated with check (bucket_id = 'documentos' and public.is_autorizado());

drop policy if exists "autorizados alteram documentos" on storage.objects;
create policy "autorizados alteram documentos" on storage.objects
  for update to authenticated using (bucket_id = 'documentos' and public.is_autorizado());

drop policy if exists "autorizados apagam documentos" on storage.objects;
create policy "autorizados apagam documentos" on storage.objects
  for delete to authenticated using (bucket_id = 'documentos' and public.is_autorizado());

-- ---------------------------------------------------------------------
-- 7. Atualização ao vivo (quem está com o app aberto vê as mudanças)
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.cocorretagens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.anexos;        exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.parcelas;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.corretoras;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.seguradoras;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.emissoras;     exception when duplicate_object then null; end;
end $$;
