// Configuração do app. É o único lugar que muda quando trocar o nome ou ligar o banco.
// A chave "anon public" do Supabase é feita para ficar aqui. NUNCA coloque a chave "service_role".
window.BORA_CONFIG = {
  nome: 'App de Pesca',      // nome provisório
  supabaseUrl: 'https://dmumfsjmfwjndzgndsjp.supabase.co',         // ex.: https://xxxxx.supabase.co
  google: false,             // true depois de configurar o login com Google no Supabase
  supabaseAnonKey: 'sb_publishable_F-tCWy7W5x4_11w9i2OF8A_nkmskjzv'// chave "anon public"
};
