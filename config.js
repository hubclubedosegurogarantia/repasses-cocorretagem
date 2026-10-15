// Preencha com os dados do seu projeto Supabase (Project Settings → API).
// A chave "anon" é pública por natureza: quem protege os dados são as regras de acesso do banco.
window.CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "COLE-AQUI-A-CHAVE-ANON",
  // Nome exibido só enquanto o app carrega. As corretoras emissoras (painéis)
  // ficam no banco e são criadas e editadas em Configurações → Painéis.
  EMISSORA: { nome: "CS CORRETORA DE SEGUROS LTDA", cnpj: "57.610.106/0001-24" },
  // Comissão da emissora sobre o prêmio usada quando a seguradora não tem padrão próprio (%)
  COMISSAO_PADRAO: 20,
  // Chave pública VAPID para notificações push (README, passo 6). Deixe vazio para desativar.
  VAPID_PUBLIC_KEY: ""
};
