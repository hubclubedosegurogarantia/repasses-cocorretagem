# Repasses de Cocorretagem · Clube do Seguro Garantia

Controle interno das apólices emitidas com cocorretagem: o que a CS paga às parceiras, o que as parceiras líderes pagam à CS e quando, parcela por parcela.

- Login com e-mail e senha. Só as pessoas da lista de autorizados entram.
- Lançamento da apólice com a conta da cocorretagem: prêmio × comissão % = comissão, dividida entre a CS e a parceira no percentual negociado.
- **Quem é a líder decide o sentido:** se a CS é a líder, ela recebe da seguradora e **paga** a parceira; se a parceira é a líder, ela recebe e **paga** a CS (a receber).
- **Por parcela:** prêmio parcelado gera uma cocorretagem a pagar ou receber em cada parcela, cada uma no mês do seu vencimento.
- **Dois números da apólice:** o da seguradora e o da SUSEP, os dois guardados, buscáveis e exportados.
- Fechamento do mês em duas partes, **a pagar** e **a receber**, agrupado por corretora, com extrato ou cobrança pronta para WhatsApp e baixa do pagamento ou do recebimento.
- Lista de corretoras (nome e CNPJ), que se preenche sozinha a cada apólice lançada.
- Anexos (apólice, boleto, comprovante, endosso…) guardados no Supabase Storage, em pasta privada.
- **Baixa direto do aviso:** o e-mail e o push trazem o botão **Já paguei / Já recebi**. Um toque e as cobranças daquela parcela param.
- Alerta de repasses em atraso, Excel do mês e histórico de quem lançou, alterou e pagou.
- **Lembrete mensal por e-mail e no celular** nos dias escolhidos pela equipe, com o que pagar, o que cobrar e os atrasos.

**Como funciona:** o site fica no **GitHub Pages**, que serve os arquivos estáticos. Login, banco de dados, arquivos e notificações ficam no **Supabase**. Quem bloqueia o acesso de fato são as regras do banco (Row Level Security): mesmo com o link e um usuário criado, quem não estiver na tabela `autorizados` não vê nem altera nada.

```
index.html  styles.css  app.js     → o app
config.js                          → URL e chave do seu Supabase (você preenche)
sw.js  manifest.webmanifest  icons → notificações e instalação no celular
supabase/01_schema.sql             → banco, regras de acesso e pasta de documentos
supabase/02_notificacoes.sql       → agendamento dos lembretes
supabase/functions/lembretes       → função que envia e-mail e push
supabase/functions/baixa · usuarios · ler-documento → baixa pelo aviso, equipe, leitura por IA
.github/workflows/publicar.yml     → publicação automática (GitHub Actions)
scripts/publicar.py                → o que a publicação automática executa
```

---

## Publicação automática (recomendado)

Depois de preparado uma vez, **cada envio para a branch `main` publica tudo sozinho**: o banco no Supabase, as funções, o agendamento dos lembretes, o login, o e-mail pelo Resend, os usuários da equipe e o site no GitHub Pages. Ninguém precisa rodar comando nem colar SQL. As chaves ficam guardadas como *secrets* no GitHub e no Supabase, nunca no código.

O que só vocês podem fazer, uma vez (uns 30 minutos no total):

**1 · Supabase**
1. Crie o projeto em [supabase.com](https://supabase.com), região **South America (São Paulo)**.
2. Anote o **código do projeto**: é o trecho da URL do painel, `supabase.com/dashboard/project/`**`abcdefghijkl`**.
3. Em [Account → Access Tokens](https://supabase.com/dashboard/account/tokens), crie um token (por exemplo "github-publicar") e copie.

**2 · Resend (e-mail)**
1. Crie a conta em [resend.com](https://resend.com).
2. Em **Domains**, adicione `clubedosegurogarantia.com.br` e peça a quem cuida do domínio para criar os registros DNS que ele mostrar. Espere aparecer **Verified**.
3. Em **API Keys**, crie uma chave e copie.

**3 · IA (leitura de apólices e extratos) pelo OpenRouter**

O app não fica preso a nenhuma IA. Ele usa o [OpenRouter](https://openrouter.ai), que dá acesso a vários modelos (Claude, GPT, Gemini…) com **créditos pré-pagos**: você carrega quando quiser e, quando o saldo acaba, a leitura para até a próxima recarga. Nada é cobrado sozinho.

1. Crie a conta em [openrouter.ai](https://openrouter.ai).
2. Em **Credits**, compre créditos avulsos (US$ 10 bastam para muitos meses: cada PDF custa poucos centavos de dólar). Deixe a **recarga automática desligada**.
3. Em **Keys**, crie uma chave (pode definir um limite de gasto nela) e copie.

Para trocar de IA depois, mude a variável `IA_MODELO` no GitHub (veja abaixo) e rode a publicação de novo. Nenhum código muda.

**4 · GitHub**
1. Crie o repositório `repasses-cocorretagem` (público, se a conta for gratuita: os dados não ficam no código) e envie todos os arquivos desta pasta, inclusive as pastas `.github` e `scripts`.
2. **Settings → Pages → Build and deployment → Source:** escolha **GitHub Actions**.
3. **Settings → Secrets and variables → Actions**:
   - aba **Secrets** (ficam ocultos):

     | Nome | Valor |
     |---|---|
     | `SUPABASE_ACCESS_TOKEN` | o token do Supabase |
     | `RESEND_API_KEY` | a chave do Resend |
     | `OPENROUTER_API_KEY` | a chave do OpenRouter |

   - aba **Variables**:

     | Nome | Valor |
     |---|---|
     | `SUPABASE_PROJECT_REF` | o código do projeto (`abcdefghijkl`) |
     | `EMAIL_FROM` | `Repasses · Clube do Seguro Garantia <repasses@clubedosegurogarantia.com.br>` (depois que o domínio estiver verificado no Resend) |
     | `EQUIPE` | uma pessoa por linha: `e-mail, Nome, admin` (sem "admin" para quem não é administrador) |

     Exemplo de `EQUIPE`:
     ```
     guilherme@clubedosegurogarantia.com.br, Guilherme Távora, admin
     marcelo@clubedosegurogarantia.com.br, Marcelo Queiroz, admin
     simone@clubedosegurogarantia.com.br, Simone Fraga, admin
     dayane@clubedosegurogarantia.com.br, Dayane Noa
     ```
4. Em **Actions → Publicar → Run workflow**, rode a primeira vez. Leva uns 3 minutos.

**Começar em teste, só com o seu e-mail**

Dá para pôr tudo no ar e testar sozinho antes de chamar a equipe:
1. Crie a conta do Resend **com o e-mail da empresa que vai receber os testes**. Antes de o domínio ser verificado, o Resend só entrega para o dono da conta, a partir de `onboarding@resend.dev`, o que basta para testar.
2. Em `EQUIPE`, coloque **só a sua linha** (com `admin`) e deixe `EMAIL_FROM` vazio por enquanto.
3. Rode a publicação. Chega no seu e-mail o convite **Criar minha senha** (olhe o spam, porque o remetente de teste costuma cair lá). Crie a senha, entre e ative as notificações no celular.
4. Lance apólices de teste e use **Notificações → Enviar teste agora**: e-mail e push chegam só para você.
5. Quando estiver tudo certo: verifique o domínio no Resend, preencha `EMAIL_FROM`, rode a publicação de novo, apague as apólices de teste e inclua a equipe em **Configurações → + Novo usuário**. Cada pessoa recebe o mesmo convite e entra na lista de avisos, com o mesmo fluxo que você.

**O que a publicação faz sozinha:**
- cria e atualiza o banco (pode rodar quantas vezes quiser; a equipe da variável só entra na primeira vez, depois a lista é mantida pelo app);
- gera as chaves do push e a senha do agendamento uma vez e guarda no próprio banco;
- grava os secrets das funções e publica `lembretes`, `baixa`, `usuarios` e `ler-documento`;
- liga o agendamento de hora em hora;
- fecha o cadastro aberto, aponta o login para o endereço do site e faz os e-mails de senha saírem pelo Resend, em português;
- cria o login de cada pessoa da `EQUIPE` e manda por e-mail o link para ela **definir a própria senha**;
- monta o `config.js` com a URL e a chave pública do Supabase e publica o site em `https://SEU-USUARIO.github.io/repasses-cocorretagem/`.

**Depois:** cada pessoa abre o link do e-mail, define a senha, entra no app e, em **Notificações**, ativa o push no celular (no iPhone, antes, **Compartilhar → Adicionar à Tela de Início**).

**Opcionais:** a variável `IA_MODELO` escolhe a IA (padrão `anthropic/claude-sonnet-5.5`; vale qualquer modelo de [openrouter.ai/models](https://openrouter.ai/models) que aceite arquivos, como `openai/gpt-6-sol`, `google/gemini-4-argon` ou o mais barato `anthropic/claude-haiku-5.5`). Quem preferir pagar direto na Anthropic usa o secret `ANTHROPIC_API_KEY` no lugar do OpenRouter; `APP_URL` serve para um domínio próprio; o secret `SENHA_INICIAL` só é usado se o Resend ainda não estiver configurado (os logins são criados com essa senha).

Se algo faltar, a etapa **Supabase e Resend** da execução mostra em vermelho o que preencher. Os passos 1 a 7 abaixo são o caminho manual, para quem preferir fazer à mão.

---

## Passo 1 · Criar o projeto no Supabase

1. Entre em [supabase.com](https://supabase.com) e crie um projeto. A região **South America (São Paulo)** é a mais próxima.
2. Guarde a senha do banco que ele pedir num lugar seguro.

## Passo 2 · Criar o banco

1. Abra o arquivo `supabase/01_schema.sql` e, no bloco **1. Pessoas autorizadas**, troque os quatro e-mails pelos reais do Marcelo, da Simone, da Dayane e do Guilherme. Quem tem `true` na coluna `admin` é administrador; de início são Marcelo, Simone e Guilherme.
2. No Supabase, vá em **SQL Editor → New query**, cole o arquivo inteiro e clique em **Run**.

Ele cria as tabelas, as regras de acesso, a pasta privada `documentos` (PDF e imagens até 20 MB) e liga a atualização ao vivo. Pode rodar de novo sem problema, por exemplo depois de corrigir um e-mail.

## Passo 3 · Configurar o login

Em **Authentication**:

1. **Sign In / Providers → Email**: deixe ativado. Em **Allow new users to sign up**, **desative** a opção. Assim ninguém cria conta sozinho.
2. **Users → Add user → Create new user**: crie **só o seu usuário de administrador**, com e-mail e senha, marcando **Auto Confirm User**. Use exatamente o mesmo e-mail do passo 2. As outras pessoas você cria pelo próprio app, em **Configurações**, depois do passo 6.3.
3. **URL Configuration**: em **Site URL** e em **Redirect URLs**, coloque o endereço do site no GitHub Pages (passo 5), por exemplo `https://seu-usuario.github.io/repasses-cocorretagem/`. É para lá que o link de "Esqueci minha senha" leva.

Cada pessoa pode trocar a senha depois em **Configurações → Trocar minha senha**.

## Passo 4 · Ligar o app ao Supabase

Em **Project Settings → API**, copie a **Project URL** e a chave **anon public** e cole no `config.js`:

```js
window.CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  EMISSORA: { nome: "CS CORRETORA DE SEGUROS LTDA", cnpj: "57.610.106/0001-24" },
  VAPID_PUBLIC_KEY: ""   // preenchido no passo 6
};
```

`EMISSORA` é só o nome exibido enquanto o app carrega. As corretoras emissoras de verdade ficam no banco: a CS já vem cadastrada, com a Nosso Porto no grupo. Os dados ficam em **Configurações → Corretora emissora e grupo**.

A chave **anon** pode ficar no site, porque ela foi feita para ser pública. **Nunca** coloque a chave `service_role` no `config.js` nem no GitHub.

## Passo 5 · Publicar no GitHub Pages

1. Crie um repositório no GitHub, por exemplo `repasses-cocorretagem`. Pode ser privado se a conta tiver GitHub Pro ou Team. Em conta gratuita, o Pages exige repositório público, o que não é problema: o código não contém dados, e os dados ficam protegidos no Supabase.
2. Suba todos os arquivos desta pasta para a branch `main`.
3. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
4. Em um ou dois minutos o site aparece em `https://seu-usuario.github.io/repasses-cocorretagem/`. Volte ao passo 3.3 e confira se essa URL está lá.

Pronto: o app já funciona com login, lançamentos e anexos. O passo 6 liga os lembretes por e-mail e no celular.

---

## Passo 6 · Lembretes mensais por e-mail e no celular

É o coração do sistema: a CS não precisa lembrar de nenhuma data. Por **e-mail** e **push** (celular ou computador), a equipe recebe:

- **cobranças por parcela, às 8h e às 19h:** 1 dia depois do vencimento de cada boleto ("Pagar Tinti" / "Cobrar Marca") e, se ainda não houver baixa, 5 dias depois ("Pagou?" / "Recebeu?");
- **penúltimo dia do mês, às 8h e às 19h:** "Faltou alguma pendência?", com o que ainda está em aberto, sempre;
- **último dia do mês, às 19h:** "Baixe o relatório mensal", sempre.

Os horários, os dias das cobranças e os avisos do fim do mês são ajustados no app, na página **Notificações**. Na mesma página você escolhe **quais e-mails recebem** os avisos.

Precisa do Node instalado no computador, só para os comandos abaixo.

### 6.1 · Conta de e-mail (Resend)

1. Crie uma conta grátis em [resend.com](https://resend.com). O plano gratuito envia 3.000 e-mails por mês, muito acima do necessário.
2. Em **Domains → Add Domain**, adicione `clubedosegurogarantia.com.br` e crie no DNS do domínio os registros que ele mostrar (quem cuida do site ou da hospedagem faz isso em minutos). Assim o e-mail sai como `repasses@clubedosegurogarantia.com.br` e não cai no spam.
3. Em **API Keys**, crie uma chave e guarde.

Sem domínio verificado, o Resend só envia para o e-mail dono da conta Resend. Serve para testar, mas para a equipe toda é preciso verificar o domínio.

### 6.2 · Chaves do push (VAPID)

```bash
npx web-push generate-vapid-keys
```

Cole a **Public Key** em `VAPID_PUBLIC_KEY` no `config.js` e suba de novo para o GitHub. Guarde a Private Key para o próximo passo. Se não quiser push, pule este passo: o e-mail funciona sozinho.

### 6.3 · Publicar a função `lembretes`

Dentro desta pasta (onde está a pasta `supabase/`):

```bash
npx supabase login
npx supabase link --project-ref SEU-PROJETO
npx supabase secrets set \
  CRON_SECRET="invente-uma-senha-longa-aqui" \
  RESEND_API_KEY="re_sua_chave" \
  EMAIL_FROM="Repasses · Clube do Seguro Garantia <repasses@clubedosegurogarantia.com.br>" \
  APP_URL="https://seu-usuario.github.io/repasses-cocorretagem/" \
  VAPID_PUBLIC_KEY="cole-a-public-key" \
  VAPID_PRIVATE_KEY="cole-a-private-key" \
  VAPID_SUBJECT="mailto:financeiro@clubedosegurogarantia.com.br"
npx supabase functions deploy lembretes --project-ref SEU-PROJETO --no-verify-jwt
npx supabase functions deploy baixa     --project-ref SEU-PROJETO --no-verify-jwt
npx supabase functions deploy usuarios  --project-ref SEU-PROJETO
```

A função `baixa` é a do botão **Já paguei / Já recebi** dos avisos. Cada botão leva um código assinado (com o `CRON_SECRET`, ou com o secret `BAIXA_SECRET` se você criar um) que só vale para aquela parcela e expira em 60 dias. Por isso ela também usa `--no-verify-jwt`: quem toca no botão não precisa estar logado.

- **No push** (Android, Chrome e Edge no computador): a notificação mostra o botão **Já paguei / Já recebi**. Um toque dá baixa sem abrir o app, e aparece uma confirmação com **Desfazer**. No iPhone a Apple não mostra botões em notificações: tocar na notificação abre a confirmação no app.
- **No e-mail:** cada cobrança tem o botão. Ele abre uma página do app que mostra a parcela e o botão **Sim, já paguei / Sim, já recebi**, sem pedir login. São dois toques de propósito: os filtros de segurança do e-mail "clicam" nos links para checar, e um link de um toque daria baixa sozinho.

A função `usuarios` é a que permite criar e excluir pessoas e redefinir senhas pela página **Configurações**. Ela só aceita pedidos de administradores.

`SEU-PROJETO` é o código que aparece na URL do projeto no Supabase.

O `--no-verify-jwt` é necessário porque o agendamento do banco chama a função sem login. Ela se protege sozinha: chamadas do banco precisam do `CRON_SECRET`, e o botão de teste do app exige login de alguém autorizado.

### 6.4 · Ligar o agendamento

Em **Database → Extensions**, ative **pg_cron** e **pg_net**. Depois abra `supabase/02_notificacoes.sql`, troque `<<<SEU-PROJETO>>>` e `<<<O MESMO VALOR...>>>` (o mesmo `CRON_SECRET` do passo 6.3) e rode o arquivo no SQL Editor.

O banco passa a chamar a função de hora em hora. Ela confere os dias e os horários escolhidos no app e só envia quando batem, uma vez em cada horário no máximo.

### 6.5 · Escolher os dias e testar

1. No app, abra a página **Notificações**.
2. Em **Configurações dos avisos**, confira os horários (padrão 8h e 19h) e os avisos do fim do mês. A tela mostra as próximas datas.
3. Em **Quem recebe o e-mail**, confira a lista e inclua outros endereços, se precisar.
4. Em **Neste aparelho**:
   - ative as notificações;
   - clique em **Enviar teste agora**. Chegam o e-mail e o push com o resumo atual, só para você.
5. Peça para cada pessoa da equipe ativar as notificações no próprio celular.

**Celulares:**
- **Android, Windows e Mac:** funciona direto no Chrome, Edge ou Firefox.
- **iPhone/iPad (iOS 16.4+):** abra o site no Safari, toque em **Compartilhar → Adicionar à Tela de Início**, abra o app pelo ícone criado e ative por lá. É uma exigência da Apple.

**O que é enviado:**

| Quando | E-mail | Push |
|---|---|---|
| **1 dia depois do vencimento do boleto** (quando a comissão cai), às 8h e às 19h | "Pagar X" ou "Cobrar X: a comissão cai hoje" | Um aviso por parcela |
| **5 dias depois do vencimento**, se ainda não houver baixa, às 8h e às 19h | "Pagou X?" ou "Recebeu de X? Se não, cobre" | Um aviso por parcela |
| **Penúltimo dia do mês**, às 8h e às 19h, sempre | "Faltou alguma pendência?", com o que ainda está em aberto por corretora e parcela | Totais a pagar e a receber |
| **Último dia do mês**, às 19h, sempre | "Baixe o relatório mensal", com o link para Relatórios | "Baixe o relatório mensal" |
| **Outros dias de pendências** (opcional, nenhum por padrão), só se houver algo em aberto | O que falta pagar e receber no mês | Totais |

Se a baixa for dada de manhã, o aviso da noite daquela parcela não sai. O lembrete semanal de atrasos foi desligado: as cobranças por vencimento cuidam disso.

**Avisos por vencimento.** A comissão cai na conta da corretora líder um dia depois do vencimento de cada parcela do prêmio, e os vencimentos variam de apólice para apólice. Por isso, além do lembrete do mês, o app cobra por parcela: 1 dia depois do vencimento do boleto e 5 dias depois (dá para mudar ou incluir outros, como 10). Se a data cair no sábado ou no domingo, o aviso vai na segunda. Cada aviso sai uma vez em cada horário; quando a parcela é marcada como paga ou recebida, os avisos dela param. Se a função ficar algum dia sem rodar, os avisos da última semana são recuperados no dia seguinte. Parcelas sem data de vencimento não geram aviso: a IA lê os vencimentos da apólice ou do boleto, e dá para preencher na tabela de parcelas.

---

## Passo 7 · Leitura de documentos por IA (opcional, recomendado)

Com isto ligado, a IA que vocês escolherem lê a apólice (ou o endosso, o boleto, o comprovante) e preenche o lançamento sozinho.

**7.1 · Chave da IA (OpenRouter, créditos pré-pagos)**

1. Crie a conta em [openrouter.ai](https://openrouter.ai), compre créditos avulsos em **Credits** (recarga automática desligada).
2. Em **Keys**, crie uma chave e copie (começa com `sk-or-`).

**7.2 · Publicar a função**

Dentro desta pasta:

```bash
npx supabase secrets set OPENROUTER_API_KEY="sk-or-sua-chave" --project-ref SEU-PROJETO
npx supabase functions deploy ler-documento --project-ref SEU-PROJETO
```

Por padrão, a função usa `anthropic/claude-sonnet-5.5` pelo OpenRouter, que tem bom equilíbrio entre precisão e custo. Para trocar de IA, defina o secret `IA_MODELO` com outro modelo do OpenRouter. (Também funciona direto na Anthropic, com `ANTHROPIC_API_KEY`.) A chave fica só no Supabase e nunca vai para o site.

**Como usar**

- O lançamento tem três passos:
  1. **Documento da apólice:** arraste o PDF, e num lançamento novo a IA lê sozinha. Em qualquer documento também dá para clicar em **Ler com IA**.
  2. **Cocorretagem:** o **prêmio líquido** (lido da apólice pela IA; sempre o líquido, sem IOF e custo de apólice), quem é a líder, a corretora parceira, a comissão sobre o prêmio e a divisão (ex.: CS 50% / parceira 50%). A conta aparece na hora, com o total a pagar ou a receber, e a tabela de parcelas mostra cada uma com o vencimento do boleto. A divisão é a única coisa que nunca está na apólice.
  3. **Dados da apólice:** ficam recolhidos num resumo de uma linha, com o que a IA leu. Abra só para conferir ou corrigir.
- A **comissão da emissora** já vem preenchida: 20% como padrão geral (ajustável em `config.js`) ou o padrão da seguradora, definido na página **Seguradoras**, na coluna "Comissão padrão". Se a apólice tiver comissão diferente, é só digitar por cima.
- O bloco **Observações** (observação e SUSEP da parceira) fica recolhido. Dados bancários não são pedidos: ficam no CRM. A tabela de parcelas tem o vencimento de cada boleto e a marcação de pago/recebido.
- A IA preenche **só os campos vazios**: os dois números da apólice (seguradora e SUSEP), emissão, seguradora, modalidade, tomador, CNPJ do tomador, prêmio líquido, comissão (%), a **corretora parceira** e **quem é a líder** (ela acha a CS entre as corretoras do documento pelo CNPJ ou pela SUSEP, e a outra é a parceira) e as **parcelas do prêmio** com os vencimentos. O valor da cocorretagem é recalculado e distribuído pelas parcelas.
- Os campos preenchidos ficam **destacados em dourado**. Um quadro no topo mostra:
  - o que foi lido;
  - os campos de leitura incerta;
  - valores diferentes do que já estava digitado, com o botão **Usar o do documento**;
  - um aviso se houver mais de uma parceira, se a liderança não estiver clara ou se a apólice já tiver sido lançada.
- **Quando a CS não aparece na apólice** (só a parceira consta, como na Fairfax com a Nosso Porto), a IA considera a parceira como líder: ela recebe a comissão e paga a parte da CS. Um aviso pede para conferir.
- **Boleto ou carnê com várias parcelas** também preenche a tabela de parcelas.
- **Apólice repetida:** ao salvar uma apólice com o mesmo número (da seguradora ou SUSEP) de outro lançamento, o app avisa; clicando em Salvar de novo, lança mesmo assim.
- Num boleto, o valor e o vencimento entram na observação. O tipo do anexo também é ajustado sozinho.
- A divisão da comissão continua sendo informada por vocês, porque não consta na apólice. A comissão % também, quando a apólice não traz.

**Extrato de comissão da seguradora** (mesma função, mesma chave)

- Em **Repasses → A pagar**, clique em **Ler extrato** e envie o extrato que a seguradora mandou: PDF, foto ou planilha (Excel/CSV).
- A IA lê cada linha (apólice, parcela, tomador, prêmio, % e valor da comissão) e o app cruza com as parcelas lançadas, pelo número da apólice da seguradora ou da SUSEP.
  - **Lançada:** mostra a parceira e o repasse daquela apólice. Se a comissão do extrato for diferente da calculada no app, aparece um aviso para conferir a apólice.
  - **Não lançada:** o botão **Lançar** abre a nova apólice já com número, seguradora, tomador, prêmio e comissão. Se as outras apólices do mesmo tomador no extrato têm a mesma parceira e divisão, elas vêm sugeridas. Falta só o vencimento (e conferir a divisão, que é negociada apólice a apólice).
  - **A parceira é a líder:** só informativo (quem recebe é ela).
- No topo, **Demonstrativos para as parceiras** agrupa as linhas lançadas por corretora, com o botão **Demonstrativo**.
- O extrato não fica guardado: é lido e descartado. Extratos muito longos podem precisar ser divididos.

**Custo:** cobrado por documento lido, na casa de centavos por apólice. Acompanhe em console.anthropic.com → Usage.

---

## Uso no dia a dia

O menu lateral tem as páginas abaixo. No celular, ele abre pelo botão ☰.

| Página | Para quê |
|---|---|
| **Dashboard** | A pagar e a receber no mês, os atrasos e o próximo lembrete. Mostra também um gráfico dos últimos 12 meses com as duas séries (passe o mouse para ver o que está em aberto, ou abra "Ver em tabela"), as parceiras com mais cocorretagem e as pendências, que levam direto à lista filtrada. |
| **Repasses** | Dois cartões grandes no topo, **A pagar** (azul) e **A receber** (dourado), com o total em aberto do mês e o selo "atraso" quando há meses anteriores pendentes. Abaixo, a linha de meses com um ponto de cor (verde quitado, amarelo em aberto, vermelho em atraso, azul previsto; passe o mouse para ver os valores) e o fechamento por corretora, com extrato ou cobrança e baixa. Cada apólice mostra o tomador com CNPJ, a seguradora numa etiqueta colorida (razão social) e uma barra com a divisão da comissão: azul é a parte da CS, dourado a da parceira; **Mais detalhes** mostra também emissão, modalidade, divisão, anexos e CNPJ (o app lembra a escolha). Clicar numa apólice abre tudo. A **barra de busca** embaixo dos cartões procura em todas as apólices (número da seguradora ou SUSEP, corretora, tomador, CNPJ); "Ver lista completa" mostra todas as parcelas. |
| **Relatórios** | Cocorretagens do mês, por corretora: comissão, a pagar, a receber, em aberto e quanto fica com a CS. Clique numa linha para ver as parcelas e gerar o **Demonstrativo de pagamento** daquela corretora. **Exportar Excel do mês** gera as abas Resumo, Por corretora e Parcelas (com os dois números da apólice, líder e sentido). |
| **Corretoras** | Corretoras parceiras: razão social, CNPJ, código SUSEP, quantas apólices e o que está em aberto a pagar e a receber. Clique numa corretora para ver a ficha (apólices, saldo e demonstrativo). A lista vem da planilha `supabase/dados/corretoras.csv` (colunas `corretora;cnpj;susep`), aplicada a cada publicação: atualiza quem já existe pelo CNPJ, SUSEP ou nome e inclui as novas, sem apagar nada. Quando a apólice não traz o CNPJ da parceira, o app completa pela razão social ou pelo SUSEP. |
| **Seguradoras** | Seguradoras: nome curto, razão social, CNPJ, comissão padrão e a **cor da etiqueta**. Cada seguradora tem uma cor própria (escolha em Editar; sem escolha, o app atribui uma). |
| **Calendário** | Só o vencimento de cada parcela (o boleto): ↗ a pagar à parceira, ↙ a receber, ✓ quitada, vermelho quando venceu há mais de 5 dias sem baixa. Preenche sozinho a cada apólice lançada, com os vencimentos que a IA lê da apólice ou do boleto (dá para ajustar na tabela de parcelas). Clique num dia para ver as parcelas ao lado e dar baixa. |
| **Notificações** | No topo, os **Avisos de vencimento**: as cobranças em aberto ("Pagar Tinti", "Cobrar Marca", e 5 dias depois "Pagou Tinti?", "Recebeu de Marca?") com os botões **Sim, paguei / Sim, recebi** e **Copiar cobrança**, o que vence hoje e a linha do tempo dos próximos 30 dias. O número vermelho no menu é a quantidade de cobranças em aberto. Abaixo, os dias e o horário do lembrete do mês, quem recebe o e-mail, o push neste aparelho, o envio de teste e o histórico do que já foi enviado. |


- **Mês de cada parcela** é o mês do vencimento do boleto (não há competência separada). A IA lê os vencimentos; se faltar, informe o vencimento da 1ª parcela e as demais vão para os meses seguintes, no mesmo dia. Dá para ajustar uma a uma. As setas no topo trocam o mês.
- **Divisão por parcela:** o total é repartido pelas parcelas na proporção do prêmio de cada uma (ou em partes iguais). Parcelas já pagas nunca são recalculadas.
- **Status:** *A pagar* / *A receber*, *Pago* / *Recebido* e, quando o vencimento passou há mais de 5 dias sem baixa (depois da 2ª cobrança), *Pagamento atrasado* / *Recebimento atrasado*. A comissão cai 1 dia depois do vencimento, então não há o que marcar sobre a seguradora.
- **"sem apólice"** aparece quando nenhum anexo está marcado como Apólice.
- **Registrar pagamento** (ou **Registrar recebimento**) no fechamento dá baixa em todas as parcelas em aberto daquela corretora no mês, naquele sentido. **Copiar cobrança** monta a mensagem para pedir à parceira líder o que ela deve. Logo depois da baixa aparece **Desfazer** no aviso. Depois, o card mostra "Pago em …" com **Alterar ou desfazer**, para trocar a data ou voltar as parcelas para em aberto. Dentro do lançamento, cada parcela paga tem a data editável e a marcação pode ser tirada.
- **Seguradoras:** na página **Seguradoras**, cada seguradora tem nome curto (Junto, Avla…), razão social e CNPJ. As seis parceiras já vêm cadastradas com os dados das notas fiscais. A razão social aparece no extrato e no Excel, e a seguradora escolhida no lançamento mostra a razão social e o CNPJ logo abaixo. Dá para incluir, editar e tirar seguradoras da lista. Renomear também corrige as apólices já lançadas. Uma seguradora digitada num lançamento entra na lista sozinha.
- **CNPJ do tomador:** é opcional e validado. Quando o tomador já apareceu em outra apólice, o CNPJ se preenche sozinho. A busca de Apólices aceita CNPJ.
- **Demonstrativo de pagamento:** no card de cada corretora em **A pagar** (ou em Relatórios, ou a partir do extrato), o botão **Demonstrativo** monta o documento que vai para o corretor, no layout do Clube: dados do corretor, apólice, parcela, cliente, prêmio, comissão, valor da comissão, **repasse (o percentual de cada apólice)** e valor do repasse, total, adiantamento, saldo a repassar, representante legal, PIX, local e data e assinatura.
  - Vêm marcadas as parcelas do mês daquela corretora; desmarque o que não entra.
  - **Adiantamento** é o valor já adiantado e sai do saldo (na planilha aparece negativo, como no modelo).
  - **Baixar PDF** e **Baixar Excel** geram o arquivo `Demonstrativo_de_Pagamento_<Corretora>_<ddmmaaaa>`. Vocês baixam e mandam.
  - O representante e o PIX ficam guardados no cadastro da corretora e voltam preenchidos no próximo demonstrativo. O local também é lembrado (padrão Salvador).
- **Corretoras:** a aba guarda o nome e o CNPJ de cada corretora (e o representante e o PIX usados no demonstrativo). Os demais dados continuam no CRM.
  - No lançamento, digite o nome ou o CNPJ e o outro campo se preenche.
  - Uma corretora com CNPJ que ainda não está na lista entra sozinha ao salvar a apólice.
  - O fechamento agrupa pelo CNPJ. Por isso, duas grafias do mesmo nome não viram dois corretores.

## Configurações (usuários e acessos)

A página **Configurações** mostra quem tem acesso, o perfil de cada pessoa e o último acesso.

Administradores podem:
- **+ Novo usuário:** informam nome e e-mail. Por padrão o app **envia um convite por e-mail** (pelo Resend, com o mesmo remetente dos lembretes): a pessoa clica em **Criar minha senha**, define a senha e entra. O link vale 24 horas. Se preferir, escolha **Definir uma senha inicial** e envie você mesmo. Dá para marcar se a pessoa será administradora e se recebe os avisos (e-mail e celular); marcado, ela já entra na lista de **Quem recebe os avisos**, igual a todo mundo.
- **Senha:** definem uma senha nova para alguém ou enviam de novo o link para a própria pessoa escolher.
- **Editar:** mudam o nome, o e-mail de login e o perfil (Usuário ou Administrador). Ao trocar o e-mail, a pessoa passa a entrar com o e-mail novo e a mesma senha, e o histórico dela acompanha a mudança.
- **Tornar admin / Tirar admin:** qualquer administrador pode dar ou tirar o administrador de qualquer pessoa, inclusive de outro administrador. Para tirar o próprio, o app pede confirmação.
- **Excluir:** apagam a conta, e a pessoa perde o acesso na hora. Os lançamentos que ela fez continuam no sistema.

Ninguém consegue excluir a própria conta, e o sistema sempre mantém pelo menos um administrador. Qualquer pessoa troca a própria senha em **Configurações → Trocar minha senha**.

O convite e o link de senha enviados por um administrador saem pelo Resend. O **Esqueci minha senha** da tela de login sai pelo e-mail do Supabase; com a publicação automática e o `EMAIL_FROM` definido, ele também passa a sair pelo Resend.

## Corretoras do mesmo grupo

Corretoras do mesmo dono, como a CS e a Nosso Porto, contam como uma só. Em **Configurações → Corretora emissora e grupo**, clique em **Editar** e use **+ Corretora do grupo** para incluir razão social, CNPJ e SUSEP. A Nosso Porto (CNPJ 13.299.856/0001-51, SUSEP 202038784) já vem cadastrada.

- No lançamento aparece o campo **Corretora do grupo na apólice**. A IA preenche sozinha quando acha a Nosso Porto (ou outra do grupo) no documento, pelo CNPJ, pela SUSEP ou pelo nome.
- Para o controle, o grupo é um só: se a Nosso Porto é a líder, o grupo **paga** a parceira; se a parceira é a líder, ela paga o grupo. Os textos mostram quem está na apólice ("A NOSSO PORTO paga à parceira").
- Se a apólice só traz a corretora do grupo, a IA marca o grupo como líder e pede a corretora parceira e a divisão, que não constam no documento.
- Uma corretora do grupo não pode ser escolhida como parceira.
- Toda apólice da Nosso Porto leva o selo dourado **Nosso Porto** ao lado do número: no fechamento, na lista, nos relatórios, no calendário e no título do lançamento. O extrato copiado diz "emitida pela NOSSO PORTO…", o e-mail de lembrete mostra "(Nosso Porto)" ao lado da apólice, e o Excel tem a coluna **Do grupo na apólice**.

## Corretora emissora

O sistema trabalha com uma emissora só: a **CS GARANTIA CORRETORA DE SEGUROS LTDA**, com a Nosso Porto no grupo. Não há opção de criar outros painéis. Razão social, CNPJ, SUSEP e as corretoras do grupo são editados em **Configurações → Corretora emissora e grupo** (só administradores).

## Quem recebe o lembrete

Na página **Notificações**, a seção **Quem recebe os avisos** mostra um cartão para cada pessoa com os três avisos (**Cobranças das parcelas**, **Faltou alguma pendência?** e **Relatório mensal**) e dois botões em cada um: **E-mail** e **Celular**. Toque para ligar ou desligar aquele aviso só para aquela pessoa, sem tirar o acesso ao app. O botão de teste ("Enviar teste agora") ignora essas escolhas e manda tudo para quem clicou.

Dá para incluir e-mails de fora da equipe, como o financeiro ou a contabilidade (esses recebem só por e-mail), e tirar quem não precisa. As pessoas criadas em Configurações entram na lista automaticamente, com as duas chaves ligadas. O push no celular precisa ser ativado uma vez por cada pessoa, no próprio aparelho; depois, quem decide se ela recebe é a chave **No celular**.

## Manutenção

- **Incluir ou tirar alguém:** pela página **Configurações**, como explicado acima.
- **Backup:** no plano gratuito, use **Exportar Excel do mês** em Relatórios de tempos em tempos. Os planos pagos do Supabase fazem backup diário automático.
- **Projeto pausado:** projetos gratuitos do Supabase pausam depois de cerca de uma semana sem uso. Com o uso diário isso não acontece. Se acontecer, é só reativar no painel.

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| "Falta configurar o Supabase" | Preencha o `config.js` (passo 4). |
| "E-mail ou senha incorretos" | Confira em Authentication → Users se o usuário existe e está confirmado. |
| "Acesso não autorizado" | O e-mail do login não está na tabela `autorizados`, ou está escrito diferente. |
| Anexo não sobe | O arquivo precisa ser PDF ou imagem de até 20 MB. Confira se o passo 2 rodou sem erro na parte de Storage. |
| Erro "must be owner of table objects" no passo 2 | Crie as 4 políticas da pasta `documentos` pelo painel: **Storage → Policies → New policy**, uma para cada operação (SELECT, INSERT, UPDATE, DELETE), com a condição `bucket_id = 'documentos' and public.is_autorizado()`. |
| Link de redefinir senha abre página errada | Ajuste Site URL e Redirect URLs (passo 3.3). |
| Teste diz "e-mail: desligado" | Falta o secret `RESEND_API_KEY` (passo 6.3). |
| Teste diz "e-mail: falhou (403)" | O domínio ainda não foi verificado no Resend, ou o `EMAIL_FROM` usa um domínio diferente do verificado. |
| E-mail chega no spam | Verifique o domínio no Resend (passo 6.1) e use um remetente desse domínio. |
| Push de teste não chega | Ative as notificações neste aparelho na tela Lembretes e confira os secrets VAPID. No iPhone, só funciona com o app instalado na tela de início. |
| Lembrete do dia não veio | Veja em Edge Functions → lembretes → Logs se houve chamadas de hora em hora. Se não houve, rode de novo o `02_notificacoes.sql` com a URL e o segredo certos. |
