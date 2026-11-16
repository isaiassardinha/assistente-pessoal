# Assistente Pessoal

Assistente pelo WhatsApp e pelo site: despesas, tarefas, lembretes, memórias,
decisões, documentos e relatórios. Cada pessoa só vê os próprios dados.

## O que já está pronto

- **Etapa 1 — Banco de dados** (Supabase, projeto "Assistente Pessoal", região São Paulo)
  - `supabase/migrations/` — tabelas, travas de segurança (RLS) e cofres de arquivos
  - `supabase/testes/seguranca.sql` — 112 verificações de segurança

- **Etapa 2 — Servidor** (aguardando o endereço sc.hayahtraining.com valer)
  - `site/` — site (Next.js), por enquanto uma página "em construção" e `/api/saude`
  - `infra/` — instalação do servidor, HTTPS (Caddy), serviços e publicação automática
  - `docs/servidor.md` — guia: instalar, publicar, ver se está no ar, configurar chaves
- **Etapa 3 — Site: cadastro, login e aprovação** (pronto para testar)
  - criar conta, confirmar e-mail, entrar, sair, esqueci a senha, nova senha
  - tela "aguardando aprovação", administração com aprovar/recusar e 2FA obrigatório
  - proteção CSP com nonce em todas as páginas
  - `docs/supabase-login.md` — configuração do login no painel do Supabase
  - testes: `cd site && npm test`

## Rodar os testes de segurança

- No computador/servidor com Postgres: `bash scripts/testar-banco.sh`
- No próprio Supabase: cole `supabase/testes/seguranca_no_supabase.sql` no SQL Editor
  e clique em Run. Deve aparecer `FIM-OK` (tudo é desfeito no final).
