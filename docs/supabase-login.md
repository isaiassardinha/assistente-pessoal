# Configuração do login no Supabase (uma vez só)

Tudo no painel do Supabase, projeto **Assistente Pessoal**, menu **Authentication**.

## 1. Endereços do site
**Authentication → URL Configuration**
- **Site URL:** `https://sc.hayahtraining.com`
- **Redirect URLs → Add URL:** `https://sc.hayahtraining.com/**`

> Isso garante que os links dos e-mails levem para o endereço público, e não para
> o endereço interno do servidor.

## 2. Regras de cadastro e senha
**Authentication → Sign In / Providers → Email**
- **Enable Email provider:** ligado
- **Confirm email:** ligado
- **Minimum password length:** `8` (se o campo existir; o site já exige 8 de qualquer forma)
- **Secure email change:** ligado

**Authentication → Multi-Factor**
- **TOTP (App Authenticator):** ligado (é o 2FA do administrador)

## 3. Envio de e-mails pelo Resend
O envio que vem no Supabase serve só para testes. Depois que o domínio estiver
verificado no Resend:

1. No Resend: **API Keys → Create API Key**, permissão *Sending access*, domínio
   `sc.hayahtraining.com`. Copie a chave (começa com `re_`).
2. No Supabase: **Authentication → Emails → SMTP Settings → Enable Custom SMTP**
   - **Sender email:** `naoresponda@sc.hayahtraining.com`
   - **Sender name:** `Assistente Pessoal`
   - **Host:** `smtp.resend.com`
   - **Port:** `587` (a 465 não funcionou com o Supabase)
   - **Username:** `resend`
   - **Password:** a chave `re_...`
   - Salve.

## 4. Textos dos e-mails
**Authentication → Emails → Templates** (só fica editável depois do SMTP próprio, seção 3)

### Confirm signup
**Subject:** `Confirme seu cadastro no Assistente Pessoal`

```html
<h2>Confirme seu cadastro</h2>
<p>Olá! Para ativar sua conta no Assistente Pessoal, clique no botão abaixo:</p>
<p><a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=email"
      style="display:inline-block;padding:12px 20px;background:#047857;color:#fff;border-radius:8px;text-decoration:none">
  Confirmar meu e-mail</a></p>
<p>Depois disso, seu cadastro passa por aprovação.</p>
<p style="color:#666;font-size:13px">Se você não pediu este cadastro, é só ignorar esta mensagem.</p>
```

### Reset Password
**Subject:** `Crie uma senha nova no Assistente Pessoal`

```html
<h2>Senha nova</h2>
<p>Recebemos um pedido para criar uma senha nova. Clique no botão abaixo:</p>
<p><a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery&next=/nova-senha"
      style="display:inline-block;padding:12px 20px;background:#047857;color:#fff;border-radius:8px;text-decoration:none">
  Criar senha nova</a></p>
<p style="color:#666;font-size:13px">Se não foi você, ignore esta mensagem: sua senha continua a mesma.</p>
```

## 5. Primeiro administrador
1. Crie sua conta normalmente pelo site e confirme o e-mail.
2. Peça para o Claude marcar sua conta como **aprovada e administradora**
   (ele faz isso direto no banco).
3. Entre no site e abra **Administração**: na primeira vez ele pede para cadastrar
   o app autenticador (2FA). A partir daí, todo login de administrador pede o código.
