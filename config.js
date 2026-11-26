// Configuração do app. É o único lugar que muda quando trocar o nome ou ligar o banco.
// A chave pública (publishable/anon) do Supabase é feita para ficar aqui. NUNCA coloque a chave secreta (service_role).
window.BORA_CONFIG = {
  nome: 'Turma da Pesca',
  supabaseUrl: 'https://dmumfsjmfwjndzgndsjp.supabase.co',
  supabaseAnonKey: 'sb_publishable_F-tCWy7W5x4_11w9i2OF8A_nkmskjzv',
  google: false,  // true depois de configurar o login com Google no Supabase
  codigo: true    // SMTP próprio (Brevo) ligado: e-mail traz código {{ .Token }} e link; false = só link
};
