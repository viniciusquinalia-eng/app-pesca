# Turma da Pesca: como ligar o app (passo a passo)

O app já funciona em **modo de teste** (salvo só no aparelho) enquanto o banco não está ligado.
Para a turma toda usar, são 3 partes. O Claude faz a parte do código; estas são as que precisam de você.

## 1. Banco de dados (Supabase, grátis)
1. Entre em supabase.com e crie um projeto (região: São Paulo). Guarde a senha do banco num lugar seguro, não mande para ninguém.
2. Menu **SQL Editor** > **New query**: cole todo o arquivo `supabase/schema.sql` e toque em **Run**.
3. (Pulado) No plano grátis o e-mail chega com um link "Sign in" em vez de código. O app já funciona assim.
   Para usar código de 6 números, é preciso ligar um SMTP próprio e pôr `codigo: true` no `config.js`.
4. **Authentication** > **URL Configuration**: em Site URL, ponha `https://viniciusquinalia-eng.github.io/app-pesca/` e, em Redirect URLs, `https://viniciusquinalia-eng.github.io/app-pesca/**` (com os dois asteriscos).
5. **Project Settings** > **API**: mande para o Claude a **Project URL** e a chave **anon public**.
   Nunca mande a chave `service_role` nem a senha do banco.

## 2. Endereço do app (GitHub Pages, grátis)
1. Ligue o GitHub ao Claude: https://claude.ai/connect-github
2. Crie um repositório vazio chamado `app-pesca` e avise o Claude.
3. O Claude envia o código e liga o GitHub Pages. O endereço fica algo como `seu-usuario.github.io/app-pesca`.

## 3. Entrar com Google (opcional, depois)
Exige criar uma credencial no Google Cloud (uns 15 minutos, o Claude guia). Até lá, o login é por código no e-mail.

## Limites e custos
- Grátis no começo. Banco Supabase Pro: US$ 25/mês se crescer muito. Domínio próprio: ~R$ 40/ano.
- O envio de e-mail grátis do Supabase manda **poucos códigos por hora**. Serve para testar com as turmas;
  para abrir ao público, é preciso ligar um serviço de e-mail (ex.: Resend, grátis até 3.000 e-mails/mês).
- Projeto grátis do Supabase "dorme" após 7 dias sem uso. Para acordar: um clique no painel.
- Antes de abrir ao público: revisar `privacidade.html` (rascunho) com um advogado e preencher os campos.

## Arquivos
- `index.html`: o app. `config.js`: nome do app e chaves (único lugar para trocar o nome).
- `supabase/schema.sql`: banco e regras de acesso (cada um só vê as pescarias em que entrou).
- `privacidade.html`: rascunho da política de privacidade. `manifest.json` e `icone.svg`: ícone na tela inicial.
